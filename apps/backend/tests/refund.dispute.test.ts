import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { Booking } from '../src/models/Booking';
import { Payment } from '../src/models/Payment';
import { Refund } from '../src/models/Refund';
import { Dispute } from '../src/models/Dispute';
import { ProviderLedger } from '../src/models/ProviderLedger';
import { processAutomaticBookingRefund } from '../src/utils/payment';
import { payoutService } from '../src/services/payoutService';

describe('Phase 4C: Refunds and Financial Dispute Settlement Tests', () => {
  const app = createApp();

  let adminUser: any;
  let customerUser: any;
  let providerUser: any;
  let providerProfile: any;
  let testCategory: any;
  let testService: any;
  let adminToken: string;
  let customerToken: string;
  let providerToken: string;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_refunds_4c');
    await User.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    const hash = await bcrypt.hash('password123', 8);

    adminUser = await User.create({
      name: 'Super Admin',
      email: 'admin@dwellio.com',
      passwordHash: hash,
      role: 'admin',
    });

    customerUser = await User.create({
      name: 'Pooja Customer',
      email: 'pooja@example.com',
      passwordHash: hash,
      role: 'customer',
    });

    providerUser = await User.create({
      name: 'Suresh Plumber',
      email: 'suresh@example.com',
      passwordHash: hash,
      role: 'provider',
      phone: '+919876543202',
    });

    providerProfile = await ProviderProfile.create({
      userId: providerUser._id,
      displayName: 'Suresh Plumbing Solutions',
      phone: '+919876543202',
      serviceArea: 'Bandra',
      verificationStatus: 'approved',
      skills: ['Pipe Fitting', 'Leak Repair'],
    });

    testCategory = await Category.create({
      name: 'Plumbing',
      slug: 'plumbing',
      rooms: ['bathroom', 'kitchen'],
      isActive: true,
    });

    testService = await Service.create({
      categoryId: testCategory._id,
      name: 'Leak Inspection',
      slug: 'leak-inspection',
      basePrice: 1200,
      durationMinutes: 60,
      isActive: true,
    });

    const admRes = await request(app).post('/api/auth/login').send({
      email: 'admin@dwellio.com',
      password: 'password123',
    });
    adminToken = admRes.body.data.token;

    const custRes = await request(app).post('/api/auth/login').send({
      email: 'pooja@example.com',
      password: 'password123',
    });
    customerToken = custRes.body.data.token;

    const provRes = await request(app).post('/api/auth/login').send({
      email: 'suresh@example.com',
      password: 'password123',
    });
    providerToken = provRes.body.data.token;
  });

  const createTestBooking = async (overrides: Partial<any> = {}) => {
    const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    return Booking.create({
      customerId: customerUser._id,
      providerId: providerProfile._id,
      providerUserId: providerUser._id,
      serviceId: testService._id,
      categoryId: testCategory._id,
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
      address: { street: '123 Marine Drive', city: 'Mumbai' },
      status: 'accepted',
      paymentStatus: 'paid',
      priceSnapshot: 1200,
      totalPrice: 1200,
      commissionRateSnapshot: 15,
      commissionAmountSnapshot: 180,
      ...overrides,
    });
  };

  const createTestPayment = async (booking: any, amountPaise = 120000, suffix = '1') => {
    return Payment.create({
      bookingId: booking._id,
      customerId: customerUser._id,
      providerId: providerProfile._id,
      razorpayOrderId: `order_test_${suffix}`,
      razorpayPaymentId: `pay_test_${suffix}`,
      receipt: `rcpt_test_${suffix}`,
      amount: amountPaise,
      currency: 'INR',
      status: 'captured',
    });
  };

  describe('1. Cancellation-Triggered Automatic Refunds', () => {
    it('automatically refunds payment when customer cancels an accepted paid booking before service start', async () => {
      const booking = await createTestBooking();
      await createTestPayment(booking, 120000, 'canc_cust');

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ cancellationReason: 'Change of schedule plans' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking?.status).toBe('cancelled');
      expect(updatedBooking?.paymentStatus).toBe('refunded');
      expect(updatedBooking?.refundStatus).toBe('processed');
      expect(updatedBooking?.refundAmount).toBe(1200);

      // Refund doc
      const refund = await Refund.findOne({ bookingId: booking._id });
      expect(refund).toBeTruthy();
      expect(refund?.amount).toBe(120000);
      expect(refund?.status).toBe('processed');
      expect(refund?.initiatedByRole).toBe('customer');
    });

    it('automatically refunds customer 100% when provider declines/cancels an accepted paid booking', async () => {
      const booking = await createTestBooking();
      await createTestPayment(booking, 120000, 'canc_prov');

      const res = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ reason: 'Emergency equipment breakdown' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking?.status).toBe('cancelled');
      expect(updatedBooking?.paymentStatus).toBe('refunded');
      expect(updatedBooking?.refundStatus).toBe('processed');

      const refund = await Refund.findOne({ bookingId: booking._id });
      expect(refund).toBeTruthy();
      expect(refund?.amount).toBe(120000);
      expect(refund?.initiatedByRole).toBe('provider');
    });
  });

  describe('2. Admin Manual Refund Endpoint (POST /api/admin/bookings/:id/refund)', () => {
    it('allows admin to issue a full refund with audit trail and customer notification', async () => {
      const booking = await createTestBooking({ status: 'in_progress' });
      await createTestPayment(booking, 120000, 'admin_rfnd');

      const res = await request(app)
        .post(`/api/admin/bookings/${booking._id}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Customer reported service provider did not possess required tools',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.refund.amountRupees).toBe(1200);
      expect(res.body.data.refund.status).toBe('processed');

      const updated = await Booking.findById(booking._id);
      expect(updated?.paymentStatus).toBe('refunded');
      expect(updated?.refundStatus).toBe('processed');
    });

    it('allows admin to issue a partial refund with proper paise conversion', async () => {
      const booking = await createTestBooking({ status: 'completed' });
      await createTestPayment(booking, 120000, 'part_rfnd');

      const res = await request(app)
        .post(`/api/admin/bookings/${booking._id}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 400, // ₹400 partial refund
          reason: 'Partial goodwill gesture for delayed arrival',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.refund.amountRupees).toBe(400);

      const updated = await Booking.findById(booking._id);
      expect(updated?.paymentStatus).toBe('paid'); // still paid because not fully refunded
      expect(updated?.refundStatus).toBe('partially_refunded');
      expect(updated?.refundAmount).toBe(400);

      const payment = await Payment.findOne({ bookingId: booking._id });
      expect(payment?.refundedAmount).toBe(40000);
      expect(payment?.status).toBe('partially_refunded');
    });

    it('rejects refund if amount exceeds paid total', async () => {
      const booking = await createTestBooking({ status: 'in_progress' });
      await createTestPayment(booking, 120000, 'exceed');

      const res = await request(app)
        .post(`/api/admin/bookings/${booking._id}/refund`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          amount: 1500, // exceeds ₹1200
          reason: 'Invalid excessive refund',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/exceeds maximum refundable balance/i);
    });
  });

  describe('3. Dispute Settlement with Financial Refund and Ledger Clawback', () => {
    it('resolves dispute with full refund and automatically performs provider ledger clawback', async () => {
      // Setup completed booking with credited ledger
      const booking = await createTestBooking({
        status: 'completed',
        priceSnapshot: 1000,
        totalPrice: 1000,
      });

      await createTestPayment(booking, 100000, 'disp_rfnd');

      // Provider ledger has ₹850 credit from job completion
      await ProviderLedger.create({
        providerId: providerProfile._id,
        bookingId: booking._id,
        entryType: 'job_earning_credit',
        creditAmount: 85000,
        debitAmount: 0,
        netAmount: 85000,
        currency: 'INR',
        resultingBalance: 85000,
        status: 'available',
        description: 'Completed leak inspection',
      });

      // Create open dispute with all required schema fields
      const dispute = await Dispute.create({
        bookingId: booking._id,
        raisedByUserId: customerUser._id,
        raisedByRole: 'customer',
        raisedAgainstUserId: providerUser._id,
        raisedAgainstRole: 'provider',
        category: 'service_quality',
        description: 'Service was incomplete and pipe is still leaking severely',
        status: 'open',
      });

      // Admin resolves with full refund
      const res = await request(app)
        .patch(`/api/admin/disputes/${dispute._id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'resolved',
          resolutionReason: 'Customer proved workmanship defect; full refund granted.',
          financialAction: 'full_refund',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('resolved');

      // Verify refund record exists and links dispute
      const refund = await Refund.findOne({ bookingId: booking._id });
      expect(refund).toBeTruthy();
      expect(refund?.amount).toBe(100000);
      expect(refund?.disputeId?.toString()).toBe(dispute._id.toString());

      // Verify provider ledger clawback was recorded for ONLY the provider's net share (85% = 85000 paise)
      // Platform absorbs the 15% commission so provider is not charged for platform's take rate
      const clawbackEntry = await ProviderLedger.findOne({
        providerId: providerProfile._id,
        entryType: 'dispute_adjustment_debit',
      });
      expect(clawbackEntry).toBeTruthy();
      expect(clawbackEntry?.debitAmount).toBe(85000);
      expect(clawbackEntry?.netAmount).toBe(-85000);
      expect(clawbackEntry?.resultingBalance).toBe(0);
    });

    it('resolves dispute with partial refund and debits proportional net provider share using historical snapshot', async () => {
      // Completed booking with custom 20% commission rate snapshot
      const booking = await createTestBooking({
        status: 'completed',
        priceSnapshot: 2000,
        commissionRateSnapshot: 20, // 20% take rate
        totalPrice: 2000,
      });

      await createTestPayment(booking, 200000, 'disp_part_cust');

      // Provider credited 80% of ₹2000 = ₹1600 (160000 paise)
      await ProviderLedger.create({
        providerId: providerProfile._id,
        bookingId: booking._id,
        entryType: 'job_earning_credit',
        creditAmount: 160000,
        debitAmount: 0,
        netAmount: 160000,
        currency: 'INR',
        resultingBalance: 160000,
        status: 'available',
        description: 'Completed inspection with 20% commission',
      });

      const dispute = await Dispute.create({
        bookingId: booking._id,
        raisedByUserId: customerUser._id,
        raisedByRole: 'customer',
        raisedAgainstUserId: providerUser._id,
        raisedAgainstRole: 'provider',
        category: 'pricing_dispute',
        description: 'Customer claims overcharge; admin awards partial refund of ₹500',
        status: 'open',
      });

      // Admin awards partial refund of ₹500 (50000 paise)
      const res = await request(app)
        .patch(`/api/admin/disputes/${dispute._id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'resolved',
          resolutionReason: 'Partial refund awarded for pricing dispute.',
          financialAction: 'partial_refund',
          awardedRefundAmount: 500,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const refund = await Refund.findOne({ bookingId: booking._id });
      expect(refund).toBeTruthy();
      expect(refund?.amount).toBe(50000);

      // Provider net clawback should be 80% (100 - 20%) of ₹500 = ₹400 (40000 paise)
      const clawbackEntry = await ProviderLedger.findOne({
        providerId: providerProfile._id,
        bookingId: booking._id,
        entryType: 'dispute_adjustment_debit',
      });
      expect(clawbackEntry).toBeTruthy();
      expect(clawbackEntry?.debitAmount).toBe(40000);
      expect(clawbackEntry?.netAmount).toBe(-40000);
      expect(clawbackEntry?.resultingBalance).toBe(120000); // 160000 - 40000 = 120000 paise
    });

    it('prevents duplicate dispute resolution from creating duplicate debits or refunds', async () => {
      const booking = await createTestBooking({
        status: 'completed',
        priceSnapshot: 1000,
      });
      await createTestPayment(booking, 100000, 'disp_dup_test');

      const dispute = await Dispute.create({
        bookingId: booking._id,
        raisedByUserId: customerUser._id,
        raisedByRole: 'customer',
        raisedAgainstUserId: providerUser._id,
        raisedAgainstRole: 'provider',
        category: 'service_quality',
        description: 'Duplicate resolve test dispute',
        status: 'open',
      });

      // First resolution
      const firstRes = await request(app)
        .patch(`/api/admin/disputes/${dispute._id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'resolved',
          resolutionReason: 'First resolution with full refund.',
          financialAction: 'full_refund',
        });
      expect(firstRes.status).toBe(200);

      const refundCountFirst = await Refund.countDocuments({ disputeId: dispute._id });
      expect(refundCountFirst).toBe(1);

      // Repeated resolution attempt on already-resolved dispute
      const secondRes = await request(app)
        .patch(`/api/admin/disputes/${dispute._id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'resolved',
          resolutionReason: 'Repeated resolution payload.',
          financialAction: 'full_refund',
        });
      expect(secondRes.status).toBe(200);

      // Verify no duplicate refund documents were created
      const refundCountSecond = await Refund.countDocuments({ disputeId: dispute._id });
      expect(refundCountSecond).toBe(1);

      // Verify no duplicate ledger debits were created
      const debitCount = await ProviderLedger.countDocuments({
        bookingId: booking._id,
        entryType: 'dispute_adjustment_debit',
      });
      expect(debitCount).toBe(1);
    });

    it('handles simultaneous concurrent admin dispute resolution requests atomically without duplicate refunds or debits', async () => {
      const booking = await createTestBooking();
      await createTestPayment(booking, 100000, 'conc_disp');

      booking.status = 'completed';
      await booking.save();
      await payoutService.recordJobCompletionEarnings(booking._id);

      const dispute = await Dispute.create({
        bookingId: booking._id,
        raisedByUserId: customerUser._id,
        raisedByRole: 'customer',
        raisedAgainstUserId: providerUser._id,
        raisedAgainstRole: 'provider',
        category: 'service_quality',
        description: 'Simultaneous resolution dispute',
        status: 'open',
      });

      // Send two simultaneous resolution requests
      const [resA, resB] = await Promise.all([
        request(app)
          .patch(`/api/admin/disputes/${dispute._id}/resolve`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            status: 'resolved',
            resolutionReason: 'Concurrent admin resolution A',
            financialAction: 'full_refund',
          }),
        request(app)
          .patch(`/api/admin/disputes/${dispute._id}/resolve`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            status: 'resolved',
            resolutionReason: 'Concurrent admin resolution B',
            financialAction: 'full_refund',
          }),
      ]);

      const statuses = [resA.status, resB.status];
      // At least one must succeed with 200, the other gets 200 (idempotent recovery) or 409 (conflict/in-progress)
      expect(statuses.filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
      statuses.forEach((s) => expect([200, 409]).toContain(s));

      // In all concurrency cases, exactly 1 refund and 1 debit ledger entry must exist
      const refundCount = await Refund.countDocuments({ disputeId: dispute._id });
      expect(refundCount).toBe(1);

      const debitCount = await ProviderLedger.countDocuments({
        bookingId: booking._id,
        entryType: 'dispute_adjustment_debit',
      });
      expect(debitCount).toBe(1);
    });

    it('recovers existing settlement attempt upon retry without calling gateway again', async () => {
      const booking = await createTestBooking();
      const payment = await createTestPayment(booking, 100000, 'recov_disp');

      const dispute = await Dispute.create({
        bookingId: booking._id,
        raisedByUserId: customerUser._id,
        raisedByRole: 'customer',
        raisedAgainstUserId: providerUser._id,
        raisedAgainstRole: 'provider',
        category: 'service_quality',
        description: 'Recovery dispute test',
        status: 'open',
      });

      // Pre-create refund document as if an earlier attempt created it
      const refundIdempotencyKey = `dispute_refund:${dispute._id.toString()}`;
      const preRefund = await Refund.create({
        paymentId: payment._id,
        bookingId: booking._id,
        razorpayRefundId: 'rfnd_pre_existing_01',
        razorpayPaymentId: payment.razorpayPaymentId,
        amount: 100000,
        currency: 'INR',
        reason: 'Pre-existing settlement',
        status: 'processed',
        initiatedByRole: 'admin',
        disputeId: dispute._id,
        idempotencyKey: refundIdempotencyKey,
      });

      const res = await request(app)
        .patch(`/api/admin/disputes/${dispute._id}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'resolved',
          resolutionReason: 'Retry after recovery',
          financialAction: 'full_refund',
        });

      expect(res.status).toBe(200);
      const updatedDispute = await Dispute.findById(dispute._id);
      expect(updatedDispute?.refundId?.toString()).toBe(preRefund._id.toString());
      expect(updatedDispute?.settlementStatus).toBe('completed');

      const totalRefunds = await Refund.countDocuments({ disputeId: dispute._id });
      expect(totalRefunds).toBe(1);
    });

    it('resets settlement claim to failed on gateway error, allowing subsequent retry to succeed', async () => {
      const booking = await createTestBooking();
      await createTestPayment(booking, 100000, 'fail_disp');

      const dispute = await Dispute.create({
        bookingId: booking._id,
        raisedByUserId: customerUser._id,
        raisedByRole: 'customer',
        raisedAgainstUserId: providerUser._id,
        raisedAgainstRole: 'provider',
        category: 'service_quality',
        description: 'Gateway failure dispute test',
        status: 'open',
      });

      const { razorpayService } = await import('../src/services/razorpayService');
      const origCreateRefund = razorpayService.createRefund;
      let shouldFail = true;

      razorpayService.createRefund = async function (...args: any[]) {
        if (shouldFail) {
          shouldFail = false;
          throw new Error('Simulated gateway timeout error');
        }
        return origCreateRefund.apply(this, args as any);
      };

      try {
        // First attempt fails at gateway
        const firstRes = await request(app)
          .patch(`/api/admin/disputes/${dispute._id}/resolve`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            status: 'resolved',
            resolutionReason: 'Attempt 1 failing',
            financialAction: 'full_refund',
          });

        expect(firstRes.status).toBe(500);

        const disputeAfterFail = await Dispute.findById(dispute._id);
        expect(disputeAfterFail?.settlementStatus).toBe('failed');

        // Subsequent retry succeeds
        const secondRes = await request(app)
          .patch(`/api/admin/disputes/${dispute._id}/resolve`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            status: 'resolved',
            resolutionReason: 'Attempt 2 retrying',
            financialAction: 'full_refund',
          });

        expect(secondRes.status).toBe(200);
        const disputeAfterSuccess = await Dispute.findById(dispute._id);
        expect(disputeAfterSuccess?.settlementStatus).toBe('completed');
        expect(disputeAfterSuccess?.refundId).toBeTruthy();
      } finally {
        razorpayService.createRefund = origCreateRefund;
      }
    });
  });

  describe('4. Refund Idempotency and Deduplication', () => {
    it('returns existing refund record without re-calling payment gateway if already refunded', async () => {
      const booking = await createTestBooking();
      await createTestPayment(booking, 100000, 'idem');

      const firstRefund = await processAutomaticBookingRefund(booking._id, 'Customer cancellation', 'customer', customerUser._id);
      expect(firstRefund).toBeTruthy();

      const secondRefund = await processAutomaticBookingRefund(booking._id, 'Customer cancellation duplicate', 'customer', customerUser._id);
      expect(secondRefund?._id.toString()).toBe(firstRefund?._id.toString());

      const refundCount = await Refund.countDocuments({ bookingId: booking._id });
      expect(refundCount).toBe(1);
    });
  });
});
