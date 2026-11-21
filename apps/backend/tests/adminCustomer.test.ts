import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { Booking } from '../src/models/Booking';
import { AuditLog } from '../src/models/AuditLog';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { generateToken } from '../src/utils/auth';

describe('Phase 3 Milestone 3B: Customer Management & Account Governance Tests', () => {
  const app = createApp();

  let adminUser: any;
  let adminToken: string;
  let customer1: any;
  let customer2: any;
  let customerToken: string;
  let providerProfile: any;
  let testCategory: any;
  let testService: any;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_admin_customer');
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    adminUser = await User.create({
      name: 'Executive Admin',
      email: 'admin@dwellio.com',
      passwordHash: 'hashed_pw',
      role: 'admin',
    });
    adminToken = generateToken({ userId: adminUser._id.toString(), role: 'admin' });

    customer1 = await User.create({
      name: 'Ananya Sharma',
      email: 'ananya@example.com',
      phone: '+91 98401 55667',
      passwordHash: 'hashed_pw',
      role: 'customer',
      isActive: true,
    });
    customerToken = generateToken({ userId: customer1._id.toString(), role: 'customer' });

    customer2 = await User.create({
      name: 'Vikram Seth',
      email: 'vikram@example.com',
      phone: '+91 98401 77889',
      passwordHash: 'hashed_pw',
      role: 'customer',
      isActive: false, // Suspended
    });

    const providerUser = await User.create({
      name: 'Ravi Plumber',
      email: 'ravi@example.com',
      passwordHash: 'hashed_pw',
      role: 'provider',
    });

    providerProfile = await ProviderProfile.create({
      userId: providerUser._id,
      displayName: 'Ravi Plumbing Solutions',
      phone: '+91 98401 11223',
      serviceArea: 'South Chennai',
      skills: ['Pipe Leak Repair'],
      verificationStatus: 'approved',
    });

    testCategory = await Category.create({
      name: 'Plumbing Works',
      slug: 'plumbing-works',
      rooms: ['bath'],
      isActive: true,
    });

    testService = await Service.create({
      categoryId: testCategory._id,
      name: 'Pipe Leakage Repair',
      slug: 'pipe-leakage-repair',
      basePrice: 500,
      isActive: true,
    });
  });

  it('rejects access to /api/admin/customers for unauthenticated or non-admin requests', async () => {
    const unauthRes = await request(app).get('/api/admin/customers');
    expect(unauthRes.status).toBe(401);

    const customerRes = await request(app)
      .get('/api/admin/customers')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(customerRes.status).toBe(403);
  });

  it('lists paginated customers with accurate spend and booking metrics', async () => {
    // Add completed booking for customer1
    await Booking.create({
      customerId: customer1._id,
      providerId: providerProfile._id,
      providerUserId: providerProfile.userId,
      serviceId: testService._id,
      categoryId: testCategory._id,
      scheduledStartTime: new Date(),
      scheduledEndTime: new Date(Date.now() + 3600000),
      address: { street: '10 Adyar', city: 'Chennai' },
      status: 'completed',
      priceSnapshot: 750,
      paymentStatus: 'paid',
    });

    const res = await request(app)
      .get('/api/admin/customers')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.customers.length).toBe(2);

    const ananya = res.body.data.customers.find((c: any) => c.email === 'ananya@example.com');
    expect(ananya).toBeDefined();
    expect(ananya.totalBookings).toBe(1);
    expect(ananya.totalRecordedSpend).toBe(750);
  });

  it('filters customers by keyword query (name, email, phone) and active/suspended status', async () => {
    const searchRes = await request(app)
      .get('/api/admin/customers?q=vikram')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.customers.length).toBe(1);
    expect(searchRes.body.data.customers[0].email).toBe('vikram@example.com');

    const suspendedRes = await request(app)
      .get('/api/admin/customers?status=suspended')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(suspendedRes.status).toBe(200);
    expect(suspendedRes.body.data.customers.length).toBe(1);
    expect(suspendedRes.body.data.customers[0].isActive).toBe(false);
  });

  it('retrieves detailed customer profile with booking history breakdown', async () => {
    const res = await request(app)
      .get(`/api/admin/customers/${customer1._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(customer1._id.toString());
    expect(res.body.data.bookingStatusCounts).toBeDefined();
  });

  it('successfully suspends a customer account, writes audit log, and rejects subsequent logins', async () => {
    const suspendRes = await request(app)
      .patch(`/api/admin/customers/${customer1._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        isActive: false,
        reason: 'Repeated non-payment violations on completed jobs.',
      });

    expect(suspendRes.status).toBe(200);
    expect(suspendRes.body.data.isActive).toBe(false);

    // Verify User model updated in DB
    const updatedUser = await User.findById(customer1._id);
    expect(updatedUser?.isActive).toBe(false);

    // Verify audit log created
    const log = await AuditLog.findOne({
      action: 'CUSTOMER_STATUS_CHANGED',
      targetId: customer1._id,
    });
    expect(log).toBeDefined();
    expect(log?.details?.reason).toContain('Repeated non-payment');

    // Customer token should now be rejected by requireAuth
    const accessRes = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(accessRes.status).toBe(401);
    expect(accessRes.body.message).toContain('deactivated');
  });

  it('reactivates a suspended customer account with reason and audit log', async () => {
    const reactivateRes = await request(app)
      .patch(`/api/admin/customers/${customer2._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        isActive: true,
        reason: 'Customer identity and payment method successfully verified.',
      });

    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.data.isActive).toBe(true);

    const updatedUser = await User.findById(customer2._id);
    expect(updatedUser?.isActive).toBe(true);
  });

  it('prevents modifying administrator accounts through customer status endpoint', async () => {
    const res = await request(app)
      .patch(`/api/admin/customers/${adminUser._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        isActive: false,
        reason: 'Attempted self modification test.',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Administrator accounts cannot be modified');
  });
});
