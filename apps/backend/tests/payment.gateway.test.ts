import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { Booking } from '../src/models/Booking';
import { Payment } from '../src/models/Payment';
import { PaymentWebhookEvent } from '../src/models/PaymentWebhookEvent';
import { razorpayService } from '../src/services/razorpayService';
import { financialBackgroundWorker } from '../src/services/financialBackgroundWorker';
import { config } from '../src/config/env';

describe('Phase 4A: Razorpay Payment Gateway Integration Tests', () => {
  const app = createApp();

  let customerUser: any;
  let otherCustomerUser: any;
  let providerUser: any;
  let providerProfile: any;
  let testCategory: any;
  let testService: any;
  let customerToken: string;
  let otherCustomerToken: string;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_payments_4a');
    await User.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    const hash = await bcrypt.hash('password123', 8);

    // 1. Create Customer
    customerUser = await User.create({
      name: 'Rohan Sharma',
      email: 'rohan.sharma@example.com',
      passwordHash: hash,
      role: 'customer',
      phone: '+919876543210',
    });

    otherCustomerUser = await User.create({
      name: 'Sneha Patel',
      email: 'sneha.patel@example.com',
      passwordHash: hash,
      role: 'customer',
      phone: '+919876543211',
    });

    // 2. Create Provider
    providerUser = await User.create({
      name: 'Anil Kumar',
      email: 'anil.kumar@example.com',
      passwordHash: hash,
      role: 'provider',
      phone: '+919876543212',
    });

    providerProfile = await ProviderProfile.create({
      userId: providerUser._id,
      displayName: 'Anil Electrical Solutions',
      phone: '+919876543212',
      serviceArea: 'Central Mumbai',
      verificationStatus: 'approved',
      skills: ['Electrical Repair', 'Wiring'],
      ratingAverage: 4.8,
      reviewCount: 12,
    });

    // 3. Create Category & Service
    testCategory = await Category.create({
      name: 'Electrical',
      slug: 'electrical',
      rooms: ['living', 'kitchen'],
      isActive: true,
    });

    testService = await Service.create({
      categoryId: testCategory._id,
      name: 'Switchboard Repair & Diagnostics',
      slug: 'switchboard-repair',
      basePrice: 599,
      durationMinutes: 60,
      isActive: true,
    });

    // Generate JWT tokens
    const custRes = await request(app).post('/api/auth/login').send({
      email: 'rohan.sharma@example.com',
      password: 'password123',
    });
    customerToken = custRes.body.data.token;

    const otherCustRes = await request(app).post('/api/auth/login').send({
      email: 'sneha.patel@example.com',
      password: 'password123',
    });
    otherCustomerToken = otherCustRes.body.data.token;
  });

  describe('1. Server-Side Order Creation (POST /api/payments/create-order)', () => {
    it('creates a Razorpay order for an accepted booking with backend-calculated amount in paise', async () => {
      const now = new Date();
      const startTime = new Date(now.getTime() + 86400000);
      const endTime = new Date(now.getTime() + 90000000);

      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: startTime,
        scheduledEndTime: endTime,
        address: { street: '123 Marine Drive', city: 'Mumbai' },
        status: 'accepted',
        paymentStatus: 'unpaid',
        priceSnapshot: 599,
        paymentDueAt: new Date(Date.now() + 7200000), // 2 hours in future
      });

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: booking._id.toString(),
          // Attempt client amount tampering
          amount: 1,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orderId).toBeDefined();
      expect(res.body.data.currency).toBe('INR');
      // Server must calculate payable: 599 rupees = 59900 paise, ignoring client tampering
      expect(res.body.data.amount).toBe(59900);
      expect(res.body.data.finalPayableAmount).toBe(59900);

      // Verify Payment record was persisted
      const payment = await Payment.findOne({ razorpayOrderId: res.body.data.orderId });
      expect(payment).not.toBeNull();
      expect(payment?.amount).toBe(59900);
      expect(payment?.status).toBe('created');
    });

    it('rejects order creation if the user does not own the booking (403 Forbidden)', async () => {
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 86400000),
        scheduledEndTime: new Date(Date.now() + 90000000),
        address: { street: '123 Marine Drive', city: 'Mumbai' },
        status: 'accepted',
        paymentStatus: 'unpaid',
      });

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${otherCustomerToken}`) // Different user
        .send({ bookingId: booking._id.toString() });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('rejects order creation if booking status is requested and not yet accepted by provider', async () => {
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 86400000),
        scheduledEndTime: new Date(Date.now() + 90000000),
        address: { street: '123 Marine Drive', city: 'Mumbai' },
        status: 'requested', // Not accepted yet!
        paymentStatus: 'unpaid',
      });

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ bookingId: booking._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Payment is only available after provider acceptance');
    });

    it('rejects order creation if the 2-hour payment deadline has expired', async () => {
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 86400000),
        scheduledEndTime: new Date(Date.now() + 90000000),
        address: { street: '123 Marine Drive', city: 'Mumbai' },
        status: 'accepted',
        paymentStatus: 'unpaid',
        paymentDueAt: new Date(Date.now() - 60000), // Expired 1 minute ago
      });

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ bookingId: booking._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Payment window has expired');
    });
  });

  describe('2. Payment Signature Verification (POST /api/payments/verify)', () => {
    it('verifies a valid HMAC-SHA256 signature, transitions payment to captured and booking to paid', async () => {
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 86400000),
        scheduledEndTime: new Date(Date.now() + 90000000),
        address: { street: '123 Marine Drive', city: 'Mumbai' },
        status: 'accepted',
        paymentStatus: 'unpaid',
        priceSnapshot: 599,
      });

      const orderId = 'order_test_987654';
      const paymentId = 'pay_test_123456';

      await Payment.create({
        bookingId: booking._id,
        customerId: customerUser._id,
        providerId: providerProfile._id,
        razorpayOrderId: orderId,
        amount: 59900,
        currency: 'INR',
        status: 'created',
        receipt: 'rcpt_test_01',
      });

      // Compute valid HMAC-SHA256 signature
      const validSignature = crypto
        .createHmac('sha256', config.razorpayKeySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const res = await request(app)
        .post('/api/payments/verify')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: booking._id.toString(),
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: validSignature,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify DB updates
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking?.paymentStatus).toBe('paid');
      expect(updatedBooking?.razorpayPaymentId).toBe(paymentId);
      expect(updatedBooking?.paymentCompletedAt).toBeDefined();

      const updatedPayment = await Payment.findOne({ razorpayOrderId: orderId });
      expect(updatedPayment?.status).toBe('captured');
      expect(updatedPayment?.signatureVerified).toBe(true);
    });

    it('rejects an invalid or forged signature with HTTP 400', async () => {
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 86400000),
        scheduledEndTime: new Date(Date.now() + 90000000),
        address: { street: '123 Marine Drive', city: 'Mumbai' },
        status: 'accepted',
        paymentStatus: 'unpaid',
      });

      const orderId = 'order_test_forge_01';
      const paymentId = 'pay_test_forge_01';

      await Payment.create({
        bookingId: booking._id,
        customerId: customerUser._id,
        providerId: providerProfile._id,
        razorpayOrderId: orderId,
        amount: 59900,
        currency: 'INR',
        status: 'created',
        receipt: 'rcpt_forge_01',
      });

      const res = await request(app)
        .post('/api/payments/verify')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: booking._id.toString(),
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: 'deadbeef_invalid_forged_signature_1234567890abcdef',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cryptographic signature mismatch');

      const failedPayment = await Payment.findOne({ razorpayOrderId: orderId });
      expect(failedPayment?.status).toBe('failed');
      expect(failedPayment?.signatureVerified).toBe(false);
    });

    it('handles idempotent repeated verification requests cleanly', async () => {
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 86400000),
        scheduledEndTime: new Date(Date.now() + 90000000),
        address: { street: '123 Marine Drive', city: 'Mumbai' },
        status: 'accepted',
        paymentStatus: 'paid', // Already paid
        razorpayPaymentId: 'pay_test_repeat_01',
      });

      const res = await request(app)
        .post('/api/payments/verify')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: booking._id.toString(),
          razorpayOrderId: 'order_test_repeat_01',
          razorpayPaymentId: 'pay_test_repeat_01',
          razorpaySignature: 'any_signature',
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('already been verified');
    });

    it('automatically initiates full refund when payment is captured for an already-cancelled booking (Finding 2)', async () => {
      // Booking was cancelled by expiration worker
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 86400000),
        scheduledEndTime: new Date(Date.now() + 90000000),
        address: { street: '123 Marine Drive', city: 'Mumbai' },
        status: 'cancelled', // already cancelled
        paymentStatus: 'unpaid',
        cancellationReason: 'Payment window expired (unpaid within 2 hours of provider acceptance)',
      });

      const orderId = 'order_test_late_exp_01';
      const paymentId = 'pay_test_late_exp_01';

      await Payment.create({
        bookingId: booking._id,
        customerId: customerUser._id,
        providerId: providerProfile._id,
        razorpayOrderId: orderId,
        amount: 59900,
        currency: 'INR',
        status: 'created',
        receipt: 'rcpt_late_01',
      });

      const validSignature = crypto
        .createHmac('sha256', config.razorpayKeySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const res = await request(app)
        .post('/api/payments/verify')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: booking._id.toString(),
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: validSignature,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.paymentStatus).toBe('refunded');
      expect(res.body.data.refundedDueToCancellation).toBe(true);

      // Verify booking did NOT become accepted or paid; status remains cancelled and paymentStatus is refunded
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking?.status).toBe('cancelled');
      expect(updatedBooking?.paymentStatus).toBe('refunded');
      expect(updatedBooking?.refundStatus).toBe('processed');
      expect(updatedBooking?.refundAmount).toBe(599);

      // Verify payment was marked refunded
      const updatedPayment = await Payment.findOne({ razorpayOrderId: orderId });
      expect(updatedPayment?.status).toBe('refunded');
      expect(updatedPayment?.refundedAmount).toBe(59900);

      // Verify a Refund document was recorded
      const { Refund } = await import('../src/models/Refund');
      const refundDoc = await Refund.findOne({ bookingId: booking._id });
      expect(refundDoc).toBeTruthy();
      expect(refundDoc?.amount).toBe(59900);
      expect(refundDoc?.status).toBe('processed');

      // Verify repeated verification does not duplicate refund
      const repeatRes = await request(app)
        .post('/api/payments/verify')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: booking._id.toString(),
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: validSignature,
        });
      expect(repeatRes.status).toBe(200);
      const refundCount = await Refund.countDocuments({ bookingId: booking._id });
      expect(refundCount).toBe(1);
    });
  });

  describe('3. Webhook Ingestion & Deduplication (POST /api/payments/webhook)', () => {
    it('verifies webhook HMAC signature and processes payment.captured asynchronously', async () => {
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 86400000),
        scheduledEndTime: new Date(Date.now() + 90000000),
        address: { street: '123 Marine Drive', city: 'Mumbai' },
        status: 'accepted',
        paymentStatus: 'unpaid',
      });

      const orderId = 'order_webhook_01';
      const paymentId = 'pay_webhook_01';

      await Payment.create({
        bookingId: booking._id,
        customerId: customerUser._id,
        providerId: providerProfile._id,
        razorpayOrderId: orderId,
        amount: 59900,
        currency: 'INR',
        status: 'created',
        receipt: 'rcpt_webhook_01',
      });

      const webhookPayload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: 59900,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', config.razorpayWebhookSecret)
        .update(rawBody)
        .digest('hex');

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', signature)
        .set('x-razorpay-event-id', 'evt_captured_test_01')
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify booking was reconciled to paid
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking?.paymentStatus).toBe('paid');

      // Verify event recorded in DB
      const recordedEvent = await PaymentWebhookEvent.findOne({ eventId: 'evt_captured_test_01' });
      expect(recordedEvent).not.toBeNull();
      expect(recordedEvent?.processingStatus).toBe('processed');
    });

    it('rejects webhooks with missing or invalid signature', async () => {
      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', 'invalid_signature')
        .send({ event: 'payment.captured' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid webhook signature');
    });

    it('is idempotent when duplicate webhook events are received', async () => {
      const eventId = 'evt_duplicate_01';
      await PaymentWebhookEvent.create({
        eventId,
        eventType: 'payment.captured',
        payload: { test: true },
        signature: 'valid_sig',
        processingStatus: 'processed',
      });

      const payload = { event: 'payment.captured' };
      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', config.razorpayWebhookSecret)
        .update(rawBody)
        .digest('hex');

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', signature)
        .set('x-razorpay-event-id', eventId) // Existing event
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('already processed');
    });

    it('handles webhook payment.captured for an expired/cancelled booking by initiating automatic refund (Finding 2)', async () => {
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 86400000),
        scheduledEndTime: new Date(Date.now() + 90000000),
        address: { street: '123 Marine Drive', city: 'Mumbai' },
        status: 'cancelled', // Cancelled due to expiration before webhook arrived
        paymentStatus: 'unpaid',
      });

      const orderId = 'order_webhook_late_exp_01';
      const paymentId = 'pay_webhook_late_exp_01';

      await Payment.create({
        bookingId: booking._id,
        customerId: customerUser._id,
        providerId: providerProfile._id,
        razorpayOrderId: orderId,
        amount: 59900,
        currency: 'INR',
        status: 'created',
        receipt: 'rcpt_webhook_late',
      });

      const webhookPayload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: orderId,
              amount: 59900,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      };

      const rawBody = JSON.stringify(webhookPayload);
      const signature = crypto
        .createHmac('sha256', config.razorpayWebhookSecret)
        .update(rawBody)
        .digest('hex');

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', signature)
        .set('x-razorpay-event-id', 'evt_late_exp_webhook_01')
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify booking status was NOT overridden to accepted or paid
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking?.status).toBe('cancelled');
      expect(updatedBooking?.paymentStatus).toBe('refunded');
      expect(updatedBooking?.refundStatus).toBe('processed');
      expect(updatedBooking?.refundAmount).toBe(599);

      // Verify Payment record was updated to refunded
      const updatedPayment = await Payment.findOne({ razorpayOrderId: orderId });
      expect(updatedPayment?.status).toBe('refunded');
      expect(updatedPayment?.refundedAmount).toBe(59900);

      // Verify Refund document was created
      const { Refund } = await import('../src/models/Refund');
      const refundDoc = await Refund.findOne({ bookingId: booking._id });
      expect(refundDoc).toBeTruthy();
      expect(refundDoc?.amount).toBe(59900);
      expect(refundDoc?.status).toBe('processed');
    });

    it('recovers gracefully from duplicate key collision E11000 during concurrent webhook receipt (Finding 4)', async () => {
      const eventId = 'evt_race_condition_e11000';
      const orderId = 'order_webhook_race_01';
      const paymentId = 'pay_webhook_race_01';

      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 86400000),
        scheduledEndTime: new Date(Date.now() + 90000000),
        address: { street: '123 Marine Drive', city: 'Mumbai' },
        status: 'accepted',
        paymentStatus: 'unpaid',
      });

      await Payment.create({
        bookingId: booking._id,
        customerId: customerUser._id,
        providerId: providerProfile._id,
        razorpayOrderId: orderId,
        amount: 59900,
        currency: 'INR',
        status: 'created',
        receipt: 'rcpt_webhook_race',
      });

      // Simulate race condition:
      // While one worker is saving, another worker concurrently inserted the document, throwing E11000
      const origSave = PaymentWebhookEvent.prototype.save;
      let intercepted = false;
      PaymentWebhookEvent.prototype.save = async function (this: any) {
        if (this.eventId === eventId && !intercepted) {
          intercepted = true;
          // Pre-insert the duplicate record as if another worker completed it
          await origSave.call(
            new PaymentWebhookEvent({
              eventId,
              eventType: 'payment.captured',
              payload: { race: true },
              signature: 'sig_race',
              processingStatus: 'processed',
            })
          );
          const mongoErr: any = new Error(
            'E11000 duplicate key error collection: dwellio.paymentwebhookevents index: eventId_1 dup key'
          );
          mongoErr.code = 11000;
          mongoErr.name = 'MongoServerError';
          throw mongoErr;
        }
        return origSave.apply(this, arguments as any);
      };

      try {
        const payload = {
          event: 'payment.captured',
          payload: {
            payment: {
              entity: {
                id: paymentId,
                order_id: orderId,
                amount: 59900,
                currency: 'INR',
                status: 'captured',
              },
            },
          },
        };
        const rawBody = JSON.stringify(payload);
        const signature = crypto
          .createHmac('sha256', config.razorpayWebhookSecret)
          .update(rawBody)
          .digest('hex');

        const res = await request(app)
          .post('/api/payments/webhook')
          .set('x-razorpay-signature', signature)
          .set('x-razorpay-event-id', eventId)
          .set('Content-Type', 'application/json')
          .send(rawBody);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('already processed');
      } finally {
        PaymentWebhookEvent.prototype.save = origSave;
      }
    });

    it('accurately records pending status when gateway refund status is pending (Area 2)', async () => {
      (razorpayService as any)._mockRefundStatus = 'pending';

      try {
        const booking = await Booking.create({
          customerId: customerUser._id,
          providerId: providerProfile._id,
          providerUserId: providerUser._id,
          serviceId: testService._id,
          categoryId: testCategory._id,
          scheduledStartTime: new Date(Date.now() + 86400000),
          scheduledEndTime: new Date(Date.now() + 90000000),
          address: { street: '456 Hill Road', city: 'Mumbai' },
          status: 'cancelled',
          paymentStatus: 'unpaid',
        });

        const orderId = 'order_test_pending_rfnd';
        const paymentId = 'pay_test_pending_rfnd';

        await Payment.create({
          bookingId: booking._id,
          customerId: customerUser._id,
          providerId: providerProfile._id,
          razorpayOrderId: orderId,
          amount: 59900,
          currency: 'INR',
          status: 'created',
          receipt: 'rcpt_pending_rfnd',
        });

        const { reconcilePaymentCapture } = await import('../src/utils/payment');
        const result = await reconcilePaymentCapture({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          source: 'checkout_verify',
        });

        expect(result.success).toBe(true);
        expect(result.paymentStatus).toBe('refunded');

        const { Refund } = await import('../src/models/Refund');
        const refundDoc = await Refund.findOne({ bookingId: booking._id });
        expect(refundDoc).toBeTruthy();
        expect(refundDoc?.status).toBe('pending');

        const updatedBooking = await Booking.findById(booking._id);
        expect(updatedBooking?.refundStatus).toBe('pending');
      } finally {
        delete (razorpayService as any)._mockRefundStatus;
      }
    });

    it('recovers existing gateway refund when previous refund attempt crashed before local persistence (Area 2)', async () => {
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 86400000),
        scheduledEndTime: new Date(Date.now() + 90000000),
        address: { street: '789 Bandra West', city: 'Mumbai' },
        status: 'cancelled',
        paymentStatus: 'unpaid',
      });

      const orderId = 'order_test_crash_recovery';
      const paymentId = 'pay_test_crash_recovery';

      await Payment.create({
        bookingId: booking._id,
        customerId: customerUser._id,
        providerId: providerProfile._id,
        razorpayOrderId: orderId,
        amount: 59900,
        currency: 'INR',
        status: 'created',
        receipt: 'rcpt_crash_rec',
      });

      // Simulate gateway already having processed the refund (e.g. prior attempt crashed before saving Refund in DB)
      (razorpayService as any)._mockPayment = {
        amount_refunded: 59900,
        refund_status: 'full',
      };

      // Spy on createRefund to ensure it is NOT called again
      let createRefundCalled = false;
      const origCreateRefund = razorpayService.createRefund;
      razorpayService.createRefund = async function (...args: any[]) {
        createRefundCalled = true;
        return origCreateRefund.apply(this, args as any);
      };

      try {
        const { reconcilePaymentCapture } = await import('../src/utils/payment');
        const result = await reconcilePaymentCapture({
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId,
          source: 'checkout_verify',
        });

        expect(result.success).toBe(true);
        expect(createRefundCalled).toBe(false); // Gateway was NOT called again!

        const { Refund } = await import('../src/models/Refund');
        const refundDoc = await Refund.findOne({ bookingId: booking._id });
        expect(refundDoc).toBeTruthy();
        expect(refundDoc?.amount).toBe(59900);
        expect(refundDoc?.status).toBe('processed');
      } finally {
        delete (razorpayService as any)._mockPayment;
        razorpayService.createRefund = origCreateRefund;
      }
    });

    it('rejects duplicate webhook delivery with HTTP 409 while a fresh lease is in-flight (Area 3)', async () => {
      const eventId = 'evt_inflight_fresh_lease_01';
      await PaymentWebhookEvent.create({
        eventId,
        eventType: 'payment.captured',
        payload: { test: true },
        signature: 'valid_sig',
        processingStatus: 'processing', // in-flight lease
        updatedAt: new Date(), // fresh lease (<30s)
      });

      const payload = { event: 'payment.captured' };
      const rawBody = JSON.stringify(payload);
      const signature = crypto
        .createHmac('sha256', config.razorpayWebhookSecret)
        .update(rawBody)
        .digest('hex');

      const res = await request(app)
        .post('/api/payments/webhook')
        .set('x-razorpay-signature', signature)
        .set('x-razorpay-event-id', eventId)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('currently being processed');
    });

    it('recovers and processes stale webhook events via background worker (Area 3)', async () => {
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 86400000),
        scheduledEndTime: new Date(Date.now() + 90000000),
        address: { street: '123 Marine Drive', city: 'Mumbai' },
        status: 'accepted',
        paymentStatus: 'unpaid',
      });

      const orderId = 'order_stale_worker_01';
      const paymentId = 'pay_stale_worker_01';

      await Payment.create({
        bookingId: booking._id,
        customerId: customerUser._id,
        providerId: providerProfile._id,
        razorpayOrderId: orderId,
        amount: 59900,
        currency: 'INR',
        status: 'created',
        receipt: 'rcpt_stale_01',
      });

      // Abandoned webhook event that was left in 'processing' status
      const eventId = 'evt_stale_abandoned_01';
      await PaymentWebhookEvent.create({
        eventId,
        eventType: 'payment.captured',
        payload: {
          payload: {
            payment: {
              entity: {
                id: paymentId,
                order_id: orderId,
                amount: 59900,
                currency: 'INR',
                status: 'captured',
              },
            },
          },
        },
        signature: 'valid_sig',
        processingStatus: 'processing',
      });
      // Explicitly set stale updatedAt bypassing automatic Mongoose timestamps hook
      await PaymentWebhookEvent.updateOne(
        { eventId },
        { $set: { updatedAt: new Date(Date.now() - 45000) } },
        { timestamps: false }
      );

      // Run background worker recovery with 30s threshold
      const recoveredCount = await financialBackgroundWorker.recoverStaleWebhookEvents(30000);
      expect(recoveredCount).toBe(1);

      // Verify the event was marked processed
      const updatedEvent = await PaymentWebhookEvent.findOne({ eventId });
      expect(updatedEvent?.processingStatus).toBe('processed');

      // Verify booking was reconciled to paid
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking?.paymentStatus).toBe('paid');
    });
  });
});
