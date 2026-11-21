import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { Booking } from '../src/models/Booking';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { generateToken } from '../src/utils/auth';

describe('Phase 3 Milestone 3A: Platform Analytics & Financial Dashboard Tests', () => {
  const app = createApp();

  let adminUser: any;
  let adminToken: string;
  let customerUser: any;
  let customerToken: string;
  let providerUser: any;
  let providerProfile: any;
  let testCategory: any;
  let testService: any;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_admin_analytics');
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    adminUser = await User.create({
      name: 'Super Admin',
      email: 'superadmin@dwellio.com',
      passwordHash: 'hashed_pw',
      role: 'admin',
    });
    adminToken = generateToken({ userId: adminUser._id.toString(), role: 'admin' });

    customerUser = await User.create({
      name: 'Pooja Homeowner',
      email: 'pooja@example.com',
      passwordHash: 'hashed_pw',
      role: 'customer',
    });
    customerToken = generateToken({ userId: customerUser._id.toString(), role: 'customer' });

    providerUser = await User.create({
      name: 'Suresh Electrician',
      email: 'suresh@example.com',
      passwordHash: 'hashed_pw',
      role: 'provider',
    });

    providerProfile = await ProviderProfile.create({
      userId: providerUser._id,
      displayName: 'Suresh Power Services',
      phone: '+91 98401 22334',
      serviceArea: 'Central Chennai',
      skills: ['Wiring', 'Switchboard Repair'],
      verificationStatus: 'approved',
    });

    testCategory = await Category.create({
      name: 'Electrical Repairs',
      slug: 'electrical-repairs',
      rooms: ['living', 'kitchen'],
      isActive: true,
    });

    testService = await Service.create({
      categoryId: testCategory._id,
      name: 'Switchboard Fixing',
      slug: 'switchboard-fixing',
      basePrice: 600,
      isActive: true,
    });
  });

  it('rejects access to overview and analytics for non-admin tokens', async () => {
    const resOverview = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(resOverview.status).toBe(403);

    const resAnalytics = await request(app)
      .get('/api/admin/analytics')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(resAnalytics.status).toBe(403);
  });

  it('returns zero financial metrics when no completed bookings exist', async () => {
    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.stats.totalCustomers).toBe(1);
    expect(res.body.data.stats.totalProviders).toBe(1);
    expect(res.body.data.stats.financialSummary).toBeDefined();
    expect(res.body.data.stats.financialSummary.grossMerchandiseValue).toBe(0);
    expect(res.body.data.stats.financialSummary.estimatedPlatformCommission).toBe(0);
    expect(res.body.data.stats.financialSummary.estimatedProviderPayout).toBe(0);
  });

  it('calculates accurate GMV, 15% platform commission, and net payouts for completed bookings', async () => {
    // Booking 1: Completed with priceSnapshot 1000 and commission snapshot 150 (15%)
    await Booking.create({
      customerId: customerUser._id,
      providerId: providerProfile._id,
      providerUserId: providerUser._id,
      serviceId: testService._id,
      categoryId: testCategory._id,
      scheduledStartTime: new Date(),
      scheduledEndTime: new Date(Date.now() + 3600000),
      address: { street: '12 Anna Salai', city: 'Chennai' },
      status: 'completed',
      priceSnapshot: 1000,
      commissionRateSnapshot: 15,
      commissionAmountSnapshot: 150,
      paymentStatus: 'paid',
    });

    // Booking 2: Completed with priceSnapshot 2000 (legacy without commission snapshot, fallback 15%)
    await Booking.create({
      customerId: customerUser._id,
      providerId: providerProfile._id,
      providerUserId: providerUser._id,
      serviceId: testService._id,
      categoryId: testCategory._id,
      scheduledStartTime: new Date(),
      scheduledEndTime: new Date(Date.now() + 3600000),
      address: { street: '14 Anna Salai', city: 'Chennai' },
      status: 'completed',
      priceSnapshot: 2000,
      paymentStatus: 'paid',
    });

    // Booking 3: Cancelled with priceSnapshot 1500 (must be excluded from GMV)
    await Booking.create({
      customerId: customerUser._id,
      providerId: providerProfile._id,
      providerUserId: providerUser._id,
      serviceId: testService._id,
      categoryId: testCategory._id,
      scheduledStartTime: new Date(),
      scheduledEndTime: new Date(Date.now() + 3600000),
      address: { street: '16 Anna Salai', city: 'Chennai' },
      status: 'cancelled',
      priceSnapshot: 1500,
      paymentStatus: 'unpaid',
    });

    const res = await request(app)
      .get('/api/admin/overview')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const financials = res.body.data.stats.financialSummary;
    expect(financials.grossMerchandiseValue).toBe(3000); // 1000 + 2000
    expect(financials.estimatedPlatformCommission).toBe(450); // 150 + 300
    expect(financials.estimatedProviderPayout).toBe(2550); // 3000 - 450
    expect(financials.recordedPaidVolume).toBe(3000);
  });

  it('aggregates top services, categories, and 30-day booking trends in /api/admin/analytics', async () => {
    await Booking.create({
      customerId: customerUser._id,
      providerId: providerProfile._id,
      providerUserId: providerUser._id,
      serviceId: testService._id,
      categoryId: testCategory._id,
      scheduledStartTime: new Date(),
      scheduledEndTime: new Date(Date.now() + 3600000),
      address: { street: '12 Anna Salai', city: 'Chennai' },
      status: 'completed',
      priceSnapshot: 600,
      paymentStatus: 'paid',
    });

    const res = await request(app)
      .get('/api/admin/analytics')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.topServices.length).toBeGreaterThan(0);
    expect(res.body.data.topServices[0].serviceName).toBe('Switchboard Fixing');
    expect(res.body.data.topCategories.length).toBeGreaterThan(0);
    expect(res.body.data.bookingTrends.length).toBeGreaterThan(0);
  });
});
