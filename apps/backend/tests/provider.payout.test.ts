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
import { ProviderLedger } from '../src/models/ProviderLedger';
import { PayoutBatch } from '../src/models/PayoutBatch';
import { payoutService } from '../src/services/payoutService';

describe('Phase 4B: Provider Earnings & Payout Management Tests', () => {
  const app = createApp();

  let adminUser: any;
  let customerUser: any;
  let providerUser: any;
  let providerProfile: any;
  let testCategory: any;
  let testService: any;
  let adminToken: string;
  let providerToken: string;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_payouts_4b');
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
      name: 'Rohan Customer',
      email: 'rohan@example.com',
      passwordHash: hash,
      role: 'customer',
    });

    providerUser = await User.create({
      name: 'Vikram Electrician',
      email: 'vikram@example.com',
      passwordHash: hash,
      role: 'provider',
      phone: '+919876543201',
    });

    providerProfile = await ProviderProfile.create({
      userId: providerUser._id,
      displayName: 'Vikram Electricals',
      phone: '+919876543201',
      serviceArea: 'Andheri West',
      verificationStatus: 'approved',
      skills: ['Electrical Wiring'],
    });

    testCategory = await Category.create({
      name: 'Electrical',
      slug: 'electrical',
      rooms: ['living'],
      isActive: true,
    });

    testService = await Service.create({
      categoryId: testCategory._id,
      name: 'Full Home Inspection',
      slug: 'full-home-inspection',
      basePrice: 1000,
      durationMinutes: 60,
      isActive: true,
    });

    const admRes = await request(app).post('/api/auth/login').send({
      email: 'admin@dwellio.com',
      password: 'password123',
    });
    adminToken = admRes.body.data.token;

    const provRes = await request(app).post('/api/auth/login').send({
      email: 'vikram@example.com',
      password: 'password123',
    });
    providerToken = provRes.body.data.token;
  });

  describe('1. Earnings Calculation & Immutable Commission Deductions', () => {
    it('credits provider earnings ledger on job completion if booking is paid', async () => {
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() - 7200000),
        scheduledEndTime: new Date(Date.now() - 3600000),
        address: { street: '456 Link Road', city: 'Mumbai' },
        status: 'completed',
        paymentStatus: 'paid', // Verified paid
        priceSnapshot: 1000,
        commissionRateSnapshot: 15,
        commissionAmountSnapshot: 150,
      });

      const ledgerEntry = await payoutService.recordJobCompletionEarnings(booking._id);
      expect(ledgerEntry).not.toBeNull();
      // Gross ₹1000 (100000p) - 15% commission (15000p) = Net ₹850 (85000 paise)
      expect(ledgerEntry?.creditAmount).toBe(85000);
      expect(ledgerEntry?.netAmount).toBe(85000);
      expect(ledgerEntry?.resultingBalance).toBe(85000);
      expect(ledgerEntry?.status).toBe('available');

      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking?.providerPayoutStatus).toBe('eligible');
    });

    it('does NOT credit provider earnings if booking status is completed but payment is unpaid', async () => {
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() - 7200000),
        scheduledEndTime: new Date(Date.now() - 3600000),
        address: { street: '456 Link Road', city: 'Mumbai' },
        status: 'completed',
        paymentStatus: 'unpaid', // Unpaid!
        priceSnapshot: 1000,
        commissionRateSnapshot: 15,
        commissionAmountSnapshot: 150,
      });

      const ledgerEntry = await payoutService.recordJobCompletionEarnings(booking._id);
      expect(ledgerEntry).toBeNull();

      const count = await ProviderLedger.countDocuments({ providerId: providerProfile._id });
      expect(count).toBe(0);
    });

    it('is idempotent: prevents duplicate credits for the same completed booking', async () => {
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() - 7200000),
        scheduledEndTime: new Date(Date.now() - 3600000),
        address: { street: '456 Link Road', city: 'Mumbai' },
        status: 'completed',
        paymentStatus: 'paid',
        priceSnapshot: 1000,
        commissionRateSnapshot: 15,
        commissionAmountSnapshot: 150,
      });

      // Call twice
      await payoutService.recordJobCompletionEarnings(booking._id);
      await payoutService.recordJobCompletionEarnings(booking._id);

      const count = await ProviderLedger.countDocuments({ bookingId: booking._id });
      expect(count).toBe(1);
    });
  });

  describe('2. Provider Payout Profile & Account Management', () => {
    it('saves valid bank account details with masking and updates KYC status to submitted', async () => {
      const res = await request(app)
        .post('/api/provider/payout-account')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          payoutMethod: 'bank_transfer',
          beneficiaryName: 'Vikram Sharma',
          accountNumber: '12345678901234',
          ifsc: 'HDFC0001234',
          bankName: 'HDFC Bank',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.payoutMethod).toBe('bank_transfer');
      expect(res.body.data.payoutAccount.beneficiaryName).toBe('Vikram Sharma');
      expect(res.body.data.payoutAccount.accountNumberMasked).toBe('••••••••1234');
      expect(res.body.data.payoutAccount.ifsc).toBe('HDFC0001234');
      expect(res.body.data.kycStatus).toBe('submitted');

      // Verify DB stored correctly
      const profile = await ProviderProfile.findById(providerProfile._id);
      expect(profile?.payoutAccount?.accountNumberMasked).toBe('••••••••1234');
    });

    it('rejects bank account update with invalid IFSC format', async () => {
      const res = await request(app)
        .post('/api/provider/payout-account')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          payoutMethod: 'bank_transfer',
          beneficiaryName: 'Vikram Sharma',
          accountNumber: '12345678901234',
          ifsc: 'INVALID_IFSC_123',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('11-character Indian Financial System Code (IFSC) is required');
    });

    it('fetches provider earnings summary with gross, commission, and net breakdown', async () => {
      // Create a completed booking and credit ledger
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() - 7200000),
        scheduledEndTime: new Date(Date.now() - 3600000),
        address: { street: '456 Link Road', city: 'Mumbai' },
        status: 'completed',
        paymentStatus: 'paid',
        priceSnapshot: 1000,
        commissionRateSnapshot: 15,
        commissionAmountSnapshot: 150,
      });

      await payoutService.recordJobCompletionEarnings(booking._id);

      const res = await request(app)
        .get('/api/provider/earnings/summary')
        .set('Authorization', `Bearer ${providerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalGrossEarningsRupees).toBe(1000);
      expect(res.body.data.totalCommissionDeductedRupees).toBe(150);
      expect(res.body.data.totalNetEarningsRupees).toBe(850);
      expect(res.body.data.pendingPayoutBalanceRupees).toBe(850);
      expect(res.body.data.completedJobsCount).toBe(1);
    });
  });

  describe('3. Admin Weekly Payout Batches (Milestone 4B)', () => {
    it('generates, approves, and settles a weekly payout batch for eligible providers', async () => {
      // 1. Setup completed booking & available ledger entry
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() - 86400000),
        scheduledEndTime: new Date(Date.now() - 82800000),
        address: { street: '456 Link Road', city: 'Mumbai' },
        status: 'completed',
        paymentStatus: 'paid',
        priceSnapshot: 1000,
        commissionRateSnapshot: 15,
        commissionAmountSnapshot: 150,
      });

      await payoutService.recordJobCompletionEarnings(booking._id);

      // 2. Admin generates payout batch
      const genRes = await request(app)
        .post('/api/admin/payouts/batches/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          periodStart: new Date(Date.now() - 7 * 86400000).toISOString(),
          periodEnd: new Date(Date.now() + 86400000).toISOString(),
        });

      expect(genRes.status).toBe(201);
      expect(genRes.body.success).toBe(true);
      expect(genRes.body.data.totalAmountRupees).toBe(850);
      expect(genRes.body.data.totalProvidersCount).toBe(1);
      expect(genRes.body.data.status).toBe('draft');

      const batchId = genRes.body.data.id;

      // 3. Admin approves batch
      const approveRes = await request(app)
        .patch(`/api/admin/payouts/batches/${batchId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.status).toBe('approved');

      // 4. Admin records settlement with bank UTR
      const settleRes = await request(app)
        .patch(`/api/admin/payouts/batches/${batchId}/settle`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ settlementReference: 'UTR_HDFC_9876543210' });

      expect(settleRes.status).toBe(200);
      expect(settleRes.body.data.status).toBe('settled');

      // Verify ledger entries and booking statuses were updated to 'settled'
      const updatedBooking = await Booking.findById(booking._id);
      expect(updatedBooking?.providerPayoutStatus).toBe('settled');

      const updatedLedger = await ProviderLedger.findOne({ bookingId: booking._id });
      expect(updatedLedger?.status).toBe('settled');
    });
  });
});
