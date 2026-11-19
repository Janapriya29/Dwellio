import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { Booking } from '../src/models/Booking';
import { SlotReservation } from '../src/models/SlotReservation';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { generateToken } from '../src/utils/auth';

describe('Phase 5: Service Catalog & Public Discovery Tests', () => {
  const app = createApp();

  let adminUser: any;
  let adminToken: string;
  let customerUser: any;
  let customerToken: string;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_catalog');
    await User.syncIndexes();
    await ProviderProfile.syncIndexes();
    await Category.syncIndexes();
    await Service.syncIndexes();
    await Booking.syncIndexes();
    await SlotReservation.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // Create Admin
    adminUser = await new User({
      name: 'Catalog Admin',
      email: 'admin.catalog@example.com',
      passwordHash: 'dummy_hash',
      role: 'admin',
    }).save();
    adminToken = generateToken({ userId: adminUser._id.toString(), role: 'admin' });

    // Create Customer
    customerUser = await new User({
      name: 'Regular Customer',
      email: 'customer.catalog@example.com',
      passwordHash: 'dummy_hash',
      role: 'customer',
    }).save();
    customerToken = generateToken({ userId: customerUser._id.toString(), role: 'customer' });
  });

  describe('1. Admin Category Management', () => {
    it('should allow admin to create a service category with room mapping', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Plumbing Works',
          slug: 'plumbing-works',
          description: 'Pipes, leaks, and sanitary maintenance',
          icon: 'droplet',
          rooms: ['bath', 'kitchen'],
          isActive: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Plumbing Works');
      expect(res.body.data.slug).toBe('plumbing-works');
      expect(res.body.data.rooms).toEqual(['bath', 'kitchen']);
      expect(res.body.data.isActive).toBe(true);
    });

    it('should reject non-admin users from creating or mutating categories', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/categories')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Hacked Category',
          slug: 'hacked-category',
        });

      expect(res.status).toBe(403);
    });

    it('should reject category creation with duplicate slug', async () => {
      await request(app)
        .post('/api/admin/catalog/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Unique Electrical',
          slug: 'unique-electrical',
          rooms: ['living'],
        });

      const dupRes = await request(app)
        .post('/api/admin/catalog/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Second Electrical',
          slug: 'unique-electrical',
          rooms: ['living'],
        });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.message).toContain('already exists');
    });

    it('should update and deactivate a category', async () => {
      const cat = await new Category({
        name: 'Initial Category',
        slug: 'initial-cat',
        rooms: ['roof'],
        isActive: true,
      }).save();

      // Update details
      const updateRes = await request(app)
        .patch(`/api/admin/catalog/categories/${cat._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          description: 'Updated description for roofing',
          rooms: ['roof', 'garden'],
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.description).toBe('Updated description for roofing');
      expect(updateRes.body.data.rooms).toEqual(['roof', 'garden']);

      // Deactivate
      const deactivateRes = await request(app)
        .patch(`/api/admin/catalog/categories/${cat._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(deactivateRes.status).toBe(200);
      expect(deactivateRes.body.data.isActive).toBe(false);
    });
  });

  describe('2. Admin Service Management', () => {
    let testCategory: any;

    beforeEach(async () => {
      testCategory = await new Category({
        name: 'Appliance Repair',
        slug: 'appliance-repair',
        rooms: ['kitchen'],
        isActive: true,
      }).save();
    });

    it('should create a service under a category', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/services')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: testCategory._id.toString(),
          name: 'Refrigerator Service',
          slug: 'refrigerator-service',
          description: 'Compressor check and gas refill',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Refrigerator Service');
      expect(res.body.data.categoryId).toBe(testCategory._id.toString());
    });

    it('should reject service creation with non-existent categoryId', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .post('/api/admin/catalog/services')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: fakeId,
          name: 'Ghost Service',
          slug: 'ghost-service',
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Referenced category does not exist');
    });
  });

  describe('3. Public Discovery Endpoints', () => {
    let activeCat: any;
    let inactiveCat: any;
    let activeSvc: any;
    let approvedProUser: any;
    let approvedProProfile: any;
    let pendingProProfile: any;

    beforeEach(async () => {
      // 1. Active category mapped to kitchen & bath
      activeCat = await new Category({
        name: 'Active Kitchen Cat',
        slug: 'active-kitchen',
        rooms: ['kitchen', 'bath'],
        isActive: true,
      }).save();

      // 2. Inactive category
      inactiveCat = await new Category({
        name: 'Hidden Old Cat',
        slug: 'hidden-old',
        rooms: ['kitchen'],
        isActive: false, // inactive!
      }).save();

      // Services under activeCat
      activeSvc = await new Service({
        categoryId: activeCat._id,
        name: 'Active Kitchen Service',
        slug: 'active-kitchen-service',
        isActive: true,
      }).save();

      await new Service({
        categoryId: activeCat._id,
        name: 'Inactive Old Service',
        slug: 'inactive-old-service',
        isActive: false, // inactive!
      }).save();

      // Providers: 1 approved, 1 pending, 1 rejected
      approvedProUser = await new User({
        name: 'Approved Pro',
        email: 'approved.pro@example.com',
        passwordHash: 'dummy_hash',
        role: 'provider',
        isActive: true,
      }).save();

      approvedProProfile = await new ProviderProfile({
        userId: approvedProUser._id,
        displayName: 'Approved Pro Works',
        phone: '1234567890',
        serviceArea: 'Downtown',
        skills: ['Active Kitchen Service', 'Plumbing'],
        categories: [activeCat._id],
        verificationStatus: 'approved',
      }).save();

      const pendingUser = await new User({
        name: 'Pending Pro',
        email: 'pending.pro@example.com',
        passwordHash: 'dummy_hash',
        role: 'provider',
        isActive: true,
      }).save();

      pendingProProfile = await new ProviderProfile({
        userId: pendingUser._id,
        displayName: 'Pending Pro Works',
        phone: '1234567890',
        serviceArea: 'Downtown',
        skills: ['Active Kitchen Service'],
        categories: [activeCat._id],
        verificationStatus: 'pending',
      }).save();

      const rejectedUser = await new User({
        name: 'Rejected Pro',
        email: 'rejected.pro@example.com',
        passwordHash: 'dummy_hash',
        role: 'customer',
        isActive: true,
      }).save();

      await new ProviderProfile({
        userId: rejectedUser._id,
        displayName: 'Rejected Pro Works',
        phone: '1234567890',
        serviceArea: 'Downtown',
        skills: ['Active Kitchen Service'],
        categories: [activeCat._id],
        verificationStatus: 'rejected',
      }).save();
    });

    it('GET /api/catalog/categories should return only active categories and filter by room', async () => {
      // General categories query: must omit inactive categories
      const allRes = await request(app).get('/api/catalog/categories');
      expect(allRes.status).toBe(200);
      const names = allRes.body.data.map((c: any) => c.name);
      expect(names).toContain('Active Kitchen Cat');
      expect(names).not.toContain('Hidden Old Cat');

      // Filter by room=kitchen
      const kitchenRes = await request(app).get('/api/catalog/categories?room=kitchen');
      expect(kitchenRes.status).toBe(200);
      expect(kitchenRes.body.data.length).toBeGreaterThanOrEqual(1);
      expect(kitchenRes.body.data[0].slug).toBe('active-kitchen');

      // Filter by room=roof (no category mapped)
      const roofRes = await request(app).get('/api/catalog/categories?room=roof');
      expect(roofRes.status).toBe(200);
      expect(roofRes.body.data).toHaveLength(0);
    });

    it('GET /api/catalog/services should return only active services', async () => {
      const res = await request(app).get(`/api/catalog/services?categoryId=${activeCat._id}`);
      expect(res.status).toBe(200);
      const serviceNames = res.body.data.map((s: any) => s.name);
      expect(serviceNames).toContain('Active Kitchen Service');
      expect(serviceNames).not.toContain('Inactive Old Service');
    });

    it('GET /api/catalog/providers should strictly return only approved providers', async () => {
      const res = await request(app).get('/api/catalog/providers?room=kitchen');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const providerNames = res.body.data.map((p: any) => p.displayName);
      expect(providerNames).toContain('Approved Pro Works');
      expect(providerNames).not.toContain('Pending Pro Works');
      expect(providerNames).not.toContain('Rejected Pro Works');

      // Security check: ensure passwordHash is never returned
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('GET /api/catalog/providers/:id/availability should validate provider ID and date format', async () => {
      // Invalid provider ID
      const resBadId = await request(app).get('/api/catalog/providers/not-a-valid-id/availability?date=2026-11-20');
      expect(resBadId.status).toBe(400);
      expect(resBadId.body.message).toMatch(/invalid provider id/i);

      // Missing date
      const resNoDate = await request(app).get(`/api/catalog/providers/${approvedProProfile._id}/availability`);
      expect(resNoDate.status).toBe(400);
      expect(resNoDate.body.message).toMatch(/query parameter date is required/i);

      // Malformed date
      const resBadDate = await request(app).get(`/api/catalog/providers/${approvedProProfile._id}/availability?date=invalid-date`);
      expect(resBadDate.status).toBe(400);
      expect(resBadDate.body.message).toMatch(/query parameter date is required/i);

      // Non-existent or pending provider
      const fakeId = new mongoose.Types.ObjectId();
      const resNotFound = await request(app).get(`/api/catalog/providers/${fakeId}/availability?date=2026-11-20`);
      expect(resNotFound.status).toBe(404);
      expect(resNotFound.body.message).toMatch(/approved service provider not found/i);

      const resPending = await request(app).get(`/api/catalog/providers/${pendingProProfile._id}/availability?date=2026-11-20`);
      expect(resPending.status).toBe(404);
      expect(resPending.body.message).toMatch(/approved service provider not found/i);
    });

    it('GET /api/catalog/providers/:id/availability should calculate slot availability and detect conflicts accurately', async () => {
      // Future date 7 days from now
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 7);
      const dateStr = targetDate.toISOString().split('T')[0];

      // Query availability when provider has no bookings
      const freeRes = await request(app).get(`/api/catalog/providers/${approvedProProfile._id}/availability?date=${dateStr}&tzOffset=0`);
      expect(freeRes.status).toBe(200);
      expect(freeRes.body.success).toBe(true);
      expect(freeRes.body.data.providerId).toBe(approvedProProfile._id.toString());
      expect(freeRes.body.data.date).toBe(dateStr);
      expect(freeRes.body.data.slots).toHaveLength(4);

      // All 4 slots should initially be available
      freeRes.body.data.slots.forEach((s: any) => {
        expect(s.isAvailable).toBe(true);
      });

      // Now create an accepted booking overlapping the first slot (09:00 - 11:00 UTC)
      const [year, month, day] = dateStr.split('-').map(Number);
      const slot0Start = new Date(Date.UTC(year, month - 1, day, 9, 0, 0, 0));
      const slot0End = new Date(Date.UTC(year, month - 1, day, 11, 0, 0, 0));

      const bookedJob = new Booking({
        customerId: customerUser._id,
        providerId: approvedProProfile._id,
        providerUserId: approvedProUser._id,
        serviceId: activeSvc._id,
        categoryId: activeCat._id,
        scheduledStartTime: slot0Start,
        scheduledEndTime: slot0End,
        address: { street: '10 Marine Drive', city: 'Metro City' },
        status: 'accepted',
        statusHistory: [
          {
            actorId: approvedProUser._id,
            actorRole: 'provider',
            fromStatus: 'requested',
            toStatus: 'accepted',
            timestamp: new Date(),
          },
        ],
      });
      await bookedJob.save();

      // Also create a SlotReservation record for slot 0
      await new SlotReservation({
        providerId: approvedProProfile._id,
        slotTime: slot0Start,
        bookingId: bookedJob._id,
      }).save();

      // Query availability again
      const busyRes = await request(app).get(`/api/catalog/providers/${approvedProProfile._id}/availability?date=${dateStr}&tzOffset=0`);
      expect(busyRes.status).toBe(200);
      expect(busyRes.body.data.slots).toHaveLength(4);

      // Slot 0 (09:00 AM - 11:00 AM) must now be marked isAvailable: false
      const slot0 = busyRes.body.data.slots[0];
      expect(slot0.label).toBe('09:00 AM – 11:00 AM');
      expect(slot0.isAvailable).toBe(false);
      expect(slot0.reason).toBe('Booked');

      // Remaining slots must remain available
      expect(busyRes.body.data.slots[1].isAvailable).toBe(true);
      expect(busyRes.body.data.slots[2].isAvailable).toBe(true);
      expect(busyRes.body.data.slots[3].isAvailable).toBe(true);
    });
  });
});
