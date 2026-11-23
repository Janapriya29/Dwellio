import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { createApp } from '../src/app';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { config } from '../src/config/env';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { Booking } from '../src/models/Booking';
import { Coupon } from '../src/models/Coupon';
import { CouponRedemption } from '../src/models/CouponRedemption';
import { Payment } from '../src/models/Payment';
import { couponService } from '../src/services/couponService';

describe('Phase 4D: Coupons and Promotions Engine Tests', () => {
  const app = createApp();

  let adminUser: any;
  let customerUser: any;
  let providerUser: any;
  let providerProfile: any;
  let testCategory: any;
  let testService: any;
  let adminToken: string;
  let customerToken: string;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_coupons_4d');
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
      name: 'Aditi Customer',
      email: 'aditi@example.com',
      passwordHash: hash,
      role: 'customer',
    });

    providerUser = await User.create({
      name: 'Farhan Painter',
      email: 'farhan@example.com',
      passwordHash: hash,
      role: 'provider',
      phone: '+919876543203',
    });

    providerProfile = await ProviderProfile.create({
      userId: providerUser._id,
      displayName: 'Farhan Wall Finishes',
      phone: '+919876543203',
      serviceArea: 'Khar',
      verificationStatus: 'approved',
      skills: ['Interior Painting'],
    });

    testCategory = await Category.create({
      name: 'Painting',
      slug: 'painting',
      rooms: ['bedroom', 'living'],
      isActive: true,
    });

    testService = await Service.create({
      categoryId: testCategory._id,
      name: 'Accent Wall Paint',
      slug: 'accent-wall-paint',
      basePrice: 1500,
      durationMinutes: 120,
      isActive: true,
    });

    const admRes = await request(app).post('/api/auth/login').send({
      email: 'admin@dwellio.com',
      password: 'password123',
    });
    adminToken = admRes.body.data.token;

    const custRes = await request(app).post('/api/auth/login').send({
      email: 'aditi@example.com',
      password: 'password123',
    });
    customerToken = custRes.body.data.token;
  });

  const createAcceptedBooking = async (price = 1500) => {
    const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 120 * 60 * 1000);
    return Booking.create({
      customerId: customerUser._id,
      providerId: providerProfile._id,
      providerUserId: providerUser._id,
      serviceId: testService._id,
      categoryId: testCategory._id,
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
      address: { street: '789 Khar Danda', city: 'Mumbai' },
      status: 'accepted', // Accepted, awaiting payment
      paymentStatus: 'unpaid',
      paymentDueAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours
      priceSnapshot: price,
      totalPrice: price,
      commissionRateSnapshot: 15,
      commissionAmountSnapshot: Math.round(price * 0.15),
    });
  };

  describe('1. Coupon Validation Rules & Calculations (POST /api/coupons/validate)', () => {
    it('accurately calculates percentage discount with max discount ceiling', async () => {
      // 20% off with max ₹200 discount cap
      await Coupon.create({
        code: 'SAVE20CAP',
        normalizedCode: 'SAVE20CAP',
        discountType: 'percent',
        discountValue: 20,
        maxDiscountAmount: 200,
        minOrderValue: 500,
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      });

      // On ₹1500, 20% is ₹300, capped at ₹200 -> final ₹1300
      const res = await request(app)
        .post('/api/coupons/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          code: 'save20cap', // case-insensitive test
          bookingAmountRupees: 1500,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.discountAmountRupees).toBe(200);
      expect(res.body.data.finalPayableRupees).toBe(1300);
    });

    it('accurately calculates flat amount discount', async () => {
      await Coupon.create({
        code: 'FLAT250',
        normalizedCode: 'FLAT250',
        discountType: 'fixed',
        discountValue: 250,
        minOrderValue: 1000,
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      });

      const res = await request(app)
        .post('/api/coupons/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          code: 'FLAT250',
          bookingAmountRupees: 1500,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.discountAmountRupees).toBe(250);
      expect(res.body.data.finalPayableRupees).toBe(1250);
    });

    it('rejects coupon if order value is below minOrderValue', async () => {
      await Coupon.create({
        code: 'BIGSPEND',
        normalizedCode: 'BIGSPEND',
        discountType: 'fixed',
        discountValue: 500,
        minOrderValue: 3000,
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      });

      const res = await request(app)
        .post('/api/coupons/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          code: 'BIGSPEND',
          bookingAmountRupees: 1500, // below 3000
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/minimum/i);
    });

    it('rejects expired coupon', async () => {
      await Coupon.create({
        code: 'EXPIRED10',
        normalizedCode: 'EXPIRED10',
        discountType: 'percent',
        discountValue: 10,
        validFrom: new Date(Date.now() - 7200000),
        validUntil: new Date(Date.now() - 3600000), // expired 1h ago
        isActive: true,
      });

      const res = await request(app)
        .post('/api/coupons/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          code: 'EXPIRED10',
          bookingAmountRupees: 1500,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/expired/i);
    });

    it('rejects coupon when usageLimit is exhausted', async () => {
      await Coupon.create({
        code: 'LIMITED5',
        normalizedCode: 'LIMITED5',
        discountType: 'percent',
        discountValue: 15,
        usageLimit: 3,
        usedCount: 3, // fully exhausted
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      });

      const res = await request(app)
        .post('/api/coupons/validate')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          code: 'LIMITED5',
          bookingAmountRupees: 1500,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/limit/i);
    });
  });

  describe('2. Coupon Reservation in Order Creation (POST /api/payments/create-order)', () => {
    it('reserves coupon and applies discounted price to Razorpay order', async () => {
      const coupon = await Coupon.create({
        code: 'WELCOME200',
        normalizedCode: 'WELCOME200',
        discountType: 'fixed',
        discountValue: 200,
        usageLimit: 5,
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      });

      const booking = await createAcceptedBooking(1500);

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: booking._id,
          couponCode: 'WELCOME200',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Base ₹1500 - ₹200 discount = ₹1300 -> 130000 paise
      expect(res.body.data.amount).toBe(130000);
      expect(res.body.data.discountAmount).toBe(20000);

      // Verify coupon redemption record status is 'reserved'
      const redemption = await CouponRedemption.findOne({
        couponId: coupon._id,
        bookingId: booking._id,
      });
      expect(redemption).toBeTruthy();
      expect(redemption?.status).toBe('reserved');

      // Verify booking updated with coupon details
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking?.appliedCouponCode).toBe('WELCOME200');
      expect(updatedBooking?.discountAmount).toBe(200);
      expect(updatedBooking?.finalPayableAmount).toBe(1300);
    });

    it('releases reserved coupon when booking is cancelled prior to payment', async () => {
      const coupon = await Coupon.create({
        code: 'RELEASE10',
        normalizedCode: 'RELEASE10',
        discountType: 'percent',
        discountValue: 10,
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      });

      const booking = await createAcceptedBooking(1500);

      // Create order with coupon
      await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: booking._id,
          couponCode: 'RELEASE10',
        });

      const duringOrder = await CouponRedemption.findOne({
        couponId: coupon._id,
        bookingId: booking._id,
      });
      expect(duringOrder?.status).toBe('reserved');

      // Customer cancels booking
      const cancelRes = await request(app)
        .patch(`/api/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ cancellationReason: 'Plans cancelled before payment' });

      expect(cancelRes.status).toBe(200);

      // Reserved redemption record should be released
      const afterCancel = await CouponRedemption.findOne({
        couponId: coupon._id,
        bookingId: booking._id,
      });
      expect(afterCancel?.status).toBe('released');
    });
  });

  describe('3. Coupon Redemption Confirmation on Payment Verification', () => {
    it('converts coupon reservation into confirmed redemption record upon successful payment', async () => {
      const coupon = await Coupon.create({
        code: 'CONFIRM300',
        normalizedCode: 'CONFIRM300',
        discountType: 'fixed',
        discountValue: 300,
        usedCount: 0,
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      });

      const booking = await createAcceptedBooking(1500);

      // Create order
      const orderRes = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: booking._id,
          couponCode: 'CONFIRM300',
        });

      const orderId = orderRes.body.data.orderId;
      const fakePaymentId = 'pay_test_redemption_ok';
      const signature = crypto
        .createHmac('sha256', config.razorpayKeySecret)
        .update(`${orderId}|${fakePaymentId}`)
        .digest('hex');

      // Verify payment
      const verifyRes = await request(app)
        .post('/api/payments/verify')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: booking._id,
          razorpayOrderId: orderId,
          razorpayPaymentId: fakePaymentId,
          razorpaySignature: signature,
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.success).toBe(true);

      // Coupon counters: usedCount incremented
      const updatedCoupon = await Coupon.findById(coupon._id);
      expect(updatedCoupon?.usedCount).toBe(1);

      // CouponRedemption doc updated to redeemed
      const redemption = await CouponRedemption.findOne({
        couponId: coupon._id,
        bookingId: booking._id,
      });
      expect(redemption).toBeTruthy();
      expect(redemption?.status).toBe('redeemed');
      expect(redemption?.customerId.toString()).toBe(customerUser._id.toString());
    });
  });

  describe('4. Admin Coupon Management (CRUD & Toggle)', () => {
    it('creates new coupon via POST /api/admin/coupons', async () => {
      const validFrom = new Date();
      const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const res = await request(app)
        .post('/api/admin/coupons')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: 'FESTIVE50',
          discountType: 'percent',
          discountValue: 50,
          maxDiscountAmountRupees: 500,
          minOrderValueRupees: 1000,
          usageLimit: 100,
          validFrom: validFrom.toISOString(),
          validUntil: validUntil.toISOString(),
          isActive: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('FESTIVE50');

      const saved = await Coupon.findOne({ normalizedCode: 'FESTIVE50' });
      expect(saved).toBeTruthy();
      expect(saved?.discountValue).toBe(50);
    });

    it('lists coupons with pagination and search via GET /api/admin/coupons', async () => {
      await Coupon.create({
        code: 'SEARCHME1',
        normalizedCode: 'SEARCHME1',
        discountType: 'fixed',
        discountValue: 100,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 86400000),
      });

      await Coupon.create({
        code: 'OTHERCODE',
        normalizedCode: 'OTHERCODE',
        discountType: 'fixed',
        discountValue: 50,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 86400000),
      });

      const res = await request(app)
        .get('/api/admin/coupons?q=SEARCHME')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.coupons.length).toBe(1);
      expect(res.body.data.coupons[0].code).toBe('SEARCHME1');
    });

    it('toggles coupon active status via PATCH /api/admin/coupons/:id/status', async () => {
      const coupon = await Coupon.create({
        code: 'TOGGLEME',
        normalizedCode: 'TOGGLEME',
        discountType: 'fixed',
        discountValue: 100,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      });

      const res = await request(app)
        .patch(`/api/admin/coupons/${coupon._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(false);

      const updated = await Coupon.findById(coupon._id);
      expect(updated?.isActive).toBe(false);
    });
  });

  describe('5. Atomic Coupon Global Usage Limit and Concurrency (Finding 3)', () => {
    it('strictly limits reservations to usageLimit under concurrent load', async () => {
      const coupon = await Coupon.create({
        code: 'RACE5',
        normalizedCode: 'RACE5',
        discountType: 'fixed',
        discountValue: 100,
        usageLimit: 5,
        usedCount: 0,
        perCustomerLimit: 10,
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      });

      // Prepare 10 distinct booking records
      const bookings = await Promise.all(
        Array.from({ length: 10 }).map((_, i) =>
          Booking.create({
            customerId: customerUser._id,
            providerId: providerProfile._id,
            providerUserId: providerUser._id,
            serviceId: testService._id,
            categoryId: testCategory._id,
            scheduledStartTime: new Date(Date.now() + (i + 1) * 3600000),
            scheduledEndTime: new Date(Date.now() + (i + 2) * 3600000),
            address: { street: `${i} Test Way`, city: 'Mumbai' },
            status: 'accepted',
            paymentStatus: 'unpaid',
          })
        )
      );

      // Launch 10 simultaneous reservation attempts
      const attempts = bookings.map((b) =>
        couponService.reserveCoupon(coupon._id, b._id, customerUser._id, 'RACE5', 10000)
      );

      const results = await Promise.allSettled(attempts);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactly 5 reservations must succeed, and 5 must fail with global limit reached
      expect(fulfilled.length).toBe(5);
      expect(rejected.length).toBe(5);

      rejected.forEach((r: any) => {
        expect(r.reason?.message).toContain('maximum global usage limit');
      });

      // Verify DB count
      const updatedCoupon = await Coupon.findById(coupon._id);
      expect(updatedCoupon?.usedCount).toBe(5);

      const reservedRedemptions = await CouponRedemption.countDocuments({
        couponId: coupon._id,
        status: 'reserved',
      });
      expect(reservedRedemptions).toBe(5);
    });

    it('is idempotent: re-reserving for the same booking does not increment usedCount', async () => {
      const coupon = await Coupon.create({
        code: 'IDEMPOTENT1',
        normalizedCode: 'IDEMPOTENT1',
        discountType: 'fixed',
        discountValue: 150,
        usageLimit: 3,
        usedCount: 0,
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      });

      const booking = await createAcceptedBooking(1500);

      // First reservation
      await couponService.reserveCoupon(coupon._id, booking._id, customerUser._id, 'IDEMPOTENT1', 15000);
      let freshCoupon = await Coupon.findById(coupon._id);
      expect(freshCoupon?.usedCount).toBe(1);

      // Second identical reservation (retry)
      await couponService.reserveCoupon(coupon._id, booking._id, customerUser._id, 'IDEMPOTENT1', 15000);
      freshCoupon = await Coupon.findById(coupon._id);
      expect(freshCoupon?.usedCount).toBe(1); // Still 1!
    });

    it('releases reserved coupon slot back to the global pool on cancellation', async () => {
      const coupon = await Coupon.create({
        code: 'RELEASEPOOL1',
        normalizedCode: 'RELEASEPOOL1',
        discountType: 'fixed',
        discountValue: 100,
        usageLimit: 2,
        usedCount: 0,
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      });

      const booking = await createAcceptedBooking(1500);

      // Reserve coupon
      await couponService.reserveCoupon(coupon._id, booking._id, customerUser._id, 'RELEASEPOOL1', 10000);
      let freshCoupon = await Coupon.findById(coupon._id);
      expect(freshCoupon?.usedCount).toBe(1);

      // Release reservation
      await couponService.releaseCouponReservation(booking._id, 'booking cancelled');

      freshCoupon = await Coupon.findById(coupon._id);
      expect(freshCoupon?.usedCount).toBe(0);

      const redemption = await CouponRedemption.findOne({
        couponId: coupon._id,
        bookingId: booking._id,
      });
      expect(redemption?.status).toBe('released');
      expect(redemption?.releaseReason).toBe('booking cancelled');
    });

    it('rejects order creation with HTTP 400 when coupon has reached its usage limit', async () => {
      const coupon = await Coupon.create({
        code: 'EXHAUSTED1',
        normalizedCode: 'EXHAUSTED1',
        discountType: 'fixed',
        discountValue: 100,
        usageLimit: 1,
        usedCount: 1, // Already exhausted
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      });

      const booking = await createAcceptedBooking(1500);

      const res = await request(app)
        .post('/api/payments/create-order')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          bookingId: booking._id,
          couponCode: 'EXHAUSTED1',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('usage limit');
    });

    it('allows reservation for an active unlimited coupon without usageLimit (Area 4)', async () => {
      const coupon = await Coupon.create({
        code: 'UNLIMITED100',
        normalizedCode: 'UNLIMITED100',
        discountType: 'fixed',
        discountValue: 100,
        // usageLimit absent
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      });

      const booking = await createAcceptedBooking(1500);

      await couponService.reserveCoupon(coupon._id, booking._id, customerUser._id, 'UNLIMITED100', 10000);

      const updated = await Coupon.findById(coupon._id);
      expect(updated?.usedCount).toBe(1);

      const redemption = await CouponRedemption.findOne({ couponId: coupon._id, bookingId: booking._id });
      expect(redemption?.status).toBe('reserved');
    });

    it('strictly rejects reservation for an inactive unlimited coupon at database level (Area 4)', async () => {
      const coupon = await Coupon.create({
        code: 'INACTIVEUNLIMITED',
        normalizedCode: 'INACTIVEUNLIMITED',
        discountType: 'fixed',
        discountValue: 100,
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: false, // Inactive
      });

      const booking = await createAcceptedBooking(1500);

      await expect(
        couponService.reserveCoupon(coupon._id, booking._id, customerUser._id, 'INACTIVEUNLIMITED', 10000)
      ).rejects.toThrow('is no longer active');

      const updated = await Coupon.findById(coupon._id);
      expect(updated?.usedCount).toBe(0);
    });

    it('strictly rejects reservation for an expired unlimited coupon at database level (Area 4)', async () => {
      const coupon = await Coupon.create({
        code: 'EXPIREDUNLIMITED',
        normalizedCode: 'EXPIREDUNLIMITED',
        discountType: 'fixed',
        discountValue: 100,
        validFrom: new Date(Date.now() - 7200000),
        validUntil: new Date(Date.now() - 3600000), // Expired 1 hour ago
        isActive: true,
      });

      const booking = await createAcceptedBooking(1500);

      await expect(
        couponService.reserveCoupon(coupon._id, booking._id, customerUser._id, 'EXPIREDUNLIMITED', 10000)
      ).rejects.toThrow('has expired');

      const updated = await Coupon.findById(coupon._id);
      expect(updated?.usedCount).toBe(0);
    });

    it('blocks reservation when coupon is deactivated concurrently right before reservation (Area 4)', async () => {
      const coupon = await Coupon.create({
        code: 'RACETOGGLE',
        normalizedCode: 'RACETOGGLE',
        discountType: 'fixed',
        discountValue: 100,
        validFrom: new Date(Date.now() - 3600000),
        validUntil: new Date(Date.now() + 86400000),
        isActive: true,
      });

      // Pass initial validation
      const validation = await couponService.validateCoupon('RACETOGGLE', customerUser._id, 1500);
      expect(validation.valid).toBe(true);

      // Deactivate concurrently before reservation executes
      await Coupon.findByIdAndUpdate(coupon._id, { $set: { isActive: false } });

      const booking = await createAcceptedBooking(1500);

      await expect(
        couponService.reserveCoupon(coupon._id, booking._id, customerUser._id, 'RACETOGGLE', 10000)
      ).rejects.toThrow('is no longer active');
    });
  });
});
