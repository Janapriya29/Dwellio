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

describe('Phase 6: Booking Lifecycle & Service Scheduling Tests', () => {
  const app = createApp();

  let customerUser: any;
  let customerToken: string;
  let secondCustomerUser: any;
  let secondCustomerToken: string;

  let providerUser: any;
  let providerToken: string;
  let approvedProfile: any;

  let secondProviderUser: any;
  let secondProviderToken: string;
  let secondApprovedProfile: any;

  let pendingProviderUser: any;
  let pendingProfile: any;

  let testCategory: any;
  let activeService: any;
  let inactiveService: any;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_booking');
    await User.syncIndexes();
    await ProviderProfile.syncIndexes();
    await Category.syncIndexes();
    await Service.syncIndexes();
    await Booking.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // 1. Customer 1
    customerUser = await new User({
      name: 'Alice Customer',
      email: 'alice@example.com',
      passwordHash: 'dummy_hash',
      role: 'customer',
      isActive: true,
    }).save();
    customerToken = generateToken({ userId: customerUser._id.toString(), role: 'customer' });

    // 2. Customer 2
    secondCustomerUser = await new User({
      name: 'Bob Customer',
      email: 'bob@example.com',
      passwordHash: 'dummy_hash',
      role: 'customer',
      isActive: true,
    }).save();
    secondCustomerToken = generateToken({ userId: secondCustomerUser._id.toString(), role: 'customer' });

    // 3. Category & Services
    testCategory = await new Category({
      name: 'Electrical Works',
      slug: 'electrical-works',
      rooms: ['living'],
      isActive: true,
    }).save();

    activeService = await new Service({
      categoryId: testCategory._id,
      name: 'Switchboard Repair',
      slug: 'switchboard-repair',
      isActive: true,
    }).save();

    inactiveService = await new Service({
      categoryId: testCategory._id,
      name: 'Old Fuse Replacement',
      slug: 'old-fuse-replacement',
      isActive: false, // inactive!
    }).save();

    // 4. Approved Provider 1
    providerUser = await new User({
      name: 'Karthik Raja',
      email: 'karthik@example.com',
      passwordHash: 'dummy_hash',
      role: 'provider',
      isActive: true,
    }).save();
    providerToken = generateToken({ userId: providerUser._id.toString(), role: 'provider' });

    approvedProfile = await new ProviderProfile({
      userId: providerUser._id,
      displayName: 'Karthik Electricals',
      phone: '9876543210',
      serviceArea: 'Central Metro',
      skills: ['Switchboard Repair', 'Electrician'],
      categories: [testCategory._id],
      verificationStatus: 'approved',
    }).save();

    // 5. Approved Provider 2
    secondProviderUser = await new User({
      name: 'Selvi Murugan',
      email: 'selvi@example.com',
      passwordHash: 'dummy_hash',
      role: 'provider',
      isActive: true,
    }).save();
    secondProviderToken = generateToken({ userId: secondProviderUser._id.toString(), role: 'provider' });

    secondApprovedProfile = await new ProviderProfile({
      userId: secondProviderUser._id,
      displayName: 'Selvi Plumbing',
      phone: '9876543211',
      serviceArea: 'West Zone',
      skills: ['Plumbing'],
      verificationStatus: 'approved',
    }).save();

    // 6. Pending Provider
    pendingProviderUser = await new User({
      name: 'Pending Paul',
      email: 'paul@example.com',
      passwordHash: 'dummy_hash',
      role: 'customer',
      isActive: true,
    }).save();

    pendingProfile = await new ProviderProfile({
      userId: pendingProviderUser._id,
      displayName: 'Paul Repairs',
      phone: '9876543212',
      serviceArea: 'East Zone',
      skills: ['Switchboard Repair'],
      verificationStatus: 'pending',
    }).save();
  });

  describe('1. Booking Creation (POST /api/bookings)', () => {
    it('should successfully create a booking request with valid payload', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const start = new Date(tomorrow.setHours(10, 0, 0, 0)).toISOString();
      const end = new Date(tomorrow.setHours(11, 30, 0, 0)).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId: activeService._id.toString(),
          providerId: approvedProfile._id.toString(),
          scheduledStartTime: start,
          scheduledEndTime: end,
          address: {
            street: '123 Palm Grove Lane',
            city: 'Metro City',
            postalCode: '600001',
          },
          customerNotes: 'Please ring doorbell on arrival.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('requested');
      expect(res.body.data.customerId).toBe(customerUser._id.toString());
      expect(res.body.data.providerId).toBe(approvedProfile._id.toString());
      expect(res.body.data.service.name).toBe('Switchboard Repair');
      expect(res.body.data.address.street).toBe('123 Palm Grove Lane');
      expect(res.body.data.statusHistory).toHaveLength(1);
      expect(res.body.data.statusHistory[0].fromStatus).toBe('requested');
    });

    it('should reject booking requests with dates in the past', async () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const start = new Date(yesterday.setHours(10, 0, 0, 0)).toISOString();
      const end = new Date(yesterday.setHours(11, 0, 0, 0)).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId: activeService._id.toString(),
          providerId: approvedProfile._id.toString(),
          scheduledStartTime: start,
          scheduledEndTime: end,
          address: { street: '123 Palm Grove Lane', city: 'Metro City' },
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('past');
    });

    it('should reject booking requests with invalid scheduling duration (< 30 min or end <= start)', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const start = new Date(tomorrow.setHours(14, 0, 0, 0)).toISOString();
      const end = new Date(tomorrow.setHours(14, 15, 0, 0)).toISOString(); // 15 mins only!

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId: activeService._id.toString(),
          providerId: approvedProfile._id.toString(),
          scheduledStartTime: start,
          scheduledEndTime: end,
          address: { street: '123 Palm Grove Lane', city: 'Metro City' },
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('at least 30 minutes');
    });

    it('should reject booking for inactive or non-existent service', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const start = new Date(tomorrow.setHours(10, 0, 0, 0)).toISOString();
      const end = new Date(tomorrow.setHours(11, 0, 0, 0)).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId: inactiveService._id.toString(),
          providerId: approvedProfile._id.toString(),
          scheduledStartTime: start,
          scheduledEndTime: end,
          address: { street: '123 Palm Grove Lane', city: 'Metro City' },
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('inactive');
    });

    it('should reject booking for unapproved or pending provider profile', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const start = new Date(tomorrow.setHours(10, 0, 0, 0)).toISOString();
      const end = new Date(tomorrow.setHours(11, 0, 0, 0)).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId: activeService._id.toString(),
          providerId: pendingProfile._id.toString(),
          scheduledStartTime: start,
          scheduledEndTime: end,
          address: { street: '123 Palm Grove Lane', city: 'Metro City' },
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('not approved');
    });

    it('should reject booking if provider does not offer the requested service', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const start = new Date(tomorrow.setHours(10, 0, 0, 0)).toISOString();
      const end = new Date(tomorrow.setHours(11, 0, 0, 0)).toISOString();

      // Selvi offers only Plumbing, but service is Switchboard Repair
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId: activeService._id.toString(),
          providerId: secondApprovedProfile._id.toString(),
          scheduledStartTime: start,
          scheduledEndTime: end,
          address: { street: '123 Palm Grove Lane', city: 'Metro City' },
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('does not offer');
    });

    it('should reject customer attempting to book their own provider profile', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const start = new Date(tomorrow.setHours(10, 0, 0, 0)).toISOString();
      const end = new Date(tomorrow.setHours(11, 0, 0, 0)).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${providerToken}`) // Provider's own user token!
        .send({
          serviceId: activeService._id.toString(),
          providerId: approvedProfile._id.toString(),
          scheduledStartTime: start,
          scheduledEndTime: end,
          address: { street: '123 Palm Grove Lane', city: 'Metro City' },
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('own service provider profile');
    });
  });

  describe('2. Schedule Conflict Prevention & Overlap Logic', () => {
    it('should reject new booking request if provider already has an accepted booking overlapping the window', async () => {
      const day = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const start1 = new Date(day.setHours(10, 0, 0, 0));
      const end1 = new Date(day.setHours(12, 0, 0, 0));

      // Existing accepted booking: 10:00 to 12:00
      await new Booking({
        customerId: secondCustomerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: start1,
        scheduledEndTime: end1,
        address: { street: '456 Elm Street', city: 'Metro City' },
        status: 'accepted',
      }).save();

      // Candidate request: 11:00 to 13:00 (overlaps by 1 hour)
      const candidateStart = new Date(day.setHours(11, 0, 0, 0)).toISOString();
      const candidateEnd = new Date(day.setHours(13, 0, 0, 0)).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId: activeService._id.toString(),
          providerId: approvedProfile._id.toString(),
          scheduledStartTime: candidateStart,
          scheduledEndTime: candidateEnd,
          address: { street: '789 Oak Ave', city: 'Metro City' },
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already has an active booking');
    });

    it('should allow booking for non-overlapping adjacent slots', async () => {
      const day = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const start1 = new Date(day.setHours(10, 0, 0, 0));
      const end1 = new Date(day.setHours(12, 0, 0, 0));

      await new Booking({
        customerId: secondCustomerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: start1,
        scheduledEndTime: end1,
        address: { street: '456 Elm Street', city: 'Metro City' },
        status: 'accepted',
      }).save();

      // Candidate request starts exactly when previous ends: 12:00 to 13:30 (no overlap)
      const candidateStart = new Date(day.setHours(12, 0, 0, 0)).toISOString();
      const candidateEnd = new Date(day.setHours(13, 30, 0, 0)).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId: activeService._id.toString(),
          providerId: approvedProfile._id.toString(),
          scheduledStartTime: candidateStart,
          scheduledEndTime: candidateEnd,
          address: { street: '789 Oak Ave', city: 'Metro City' },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should reject provider acceptance if overlapping slot was already confirmed', async () => {
      const day = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const start = new Date(day.setHours(14, 0, 0, 0));
      const end = new Date(day.setHours(16, 0, 0, 0));

      // Booking 1 (already accepted)
      await new Booking({
        customerId: secondCustomerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: start,
        scheduledEndTime: end,
        address: { street: '456 Elm Street', city: 'Metro City' },
        status: 'accepted',
      }).save();

      // Booking 2 (currently requested, overlapping 15:00 - 17:00)
      const reqStart = new Date(day.setHours(15, 0, 0, 0));
      const reqEnd = new Date(day.setHours(17, 0, 0, 0));
      const booking2 = await new Booking({
        customerId: customerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: reqStart,
        scheduledEndTime: reqEnd,
        address: { street: '123 Palm Grove Lane', city: 'Metro City' },
        status: 'requested',
      }).save();

      // Provider attempts to accept booking 2
      const res = await request(app)
        .patch(`/api/provider/bookings/${booking2._id}/accept`)
        .set('Authorization', `Bearer ${providerToken}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already have an accepted or active job');

      // Verify status remains requested
      const refreshed = await Booking.findById(booking2._id);
      expect(refreshed?.status).toBe('requested');
    });
  });

  describe('3. Customer Ownership & Cancellation Policy', () => {
    let customerBooking: any;

    beforeEach(async () => {
      const day = new Date(Date.now() + 24 * 60 * 60 * 1000);
      customerBooking = await new Booking({
        customerId: customerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(day.setHours(10, 0, 0, 0)),
        scheduledEndTime: new Date(day.setHours(11, 30, 0, 0)),
        address: { street: '123 Palm Grove Lane', city: 'Metro City' },
        status: 'requested',
      }).save();
    });

    it('should prevent a customer from accessing another customer booking details', async () => {
      const res = await request(app)
        .get(`/api/bookings/${customerBooking._id}`)
        .set('Authorization', `Bearer ${secondCustomerToken}`); // Bob accessing Alice's booking

      expect(res.status).toBe(403);
    });

    it('should prevent a customer from cancelling another customer booking', async () => {
      const res = await request(app)
        .patch(`/api/bookings/${customerBooking._id}/cancel`)
        .set('Authorization', `Bearer ${secondCustomerToken}`)
        .send({ reason: 'Hacker attempt' });

      expect(res.status).toBe(403);
    });

    it('should allow customer to cancel a requested booking', async () => {
      const res = await request(app)
        .patch(`/api/bookings/${customerBooking._id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reason: 'Plans changed' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');
      expect(res.body.data.cancellationReason).toBe('Plans changed');

      const refreshed = await Booking.findById(customerBooking._id);
      expect(refreshed?.status).toBe('cancelled');
      expect(refreshed?.statusHistory).toHaveLength(1);
      expect(refreshed?.statusHistory[0].toStatus).toBe('cancelled');
    });

    it('should allow customer to cancel an accepted booking and release slot reservation', async () => {
      customerBooking.status = 'accepted';
      await customerBooking.save();

      const res = await request(app)
        .patch(`/api/bookings/${customerBooking._id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reason: 'Emergency rescheduling' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('cancelled');

      // Now another customer should be able to book this slot without conflict
      const rebookRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${secondCustomerToken}`)
        .send({
          serviceId: activeService._id.toString(),
          providerId: approvedProfile._id.toString(),
          scheduledStartTime: customerBooking.scheduledStartTime.toISOString(),
          scheduledEndTime: customerBooking.scheduledEndTime.toISOString(),
          address: { street: '456 Elm Street', city: 'Metro City' },
        });

      expect(rebookRes.status).toBe(201);
    });

    it('should reject customer cancellation if provider is on the way or work is in progress', async () => {
      customerBooking.status = 'on_the_way';
      await customerBooking.save();

      const res1 = await request(app)
        .patch(`/api/bookings/${customerBooking._id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res1.status).toBe(400);
      expect(res1.body.message).toContain('on the way');

      customerBooking.status = 'in_progress';
      await customerBooking.save();

      const res2 = await request(app)
        .patch(`/api/bookings/${customerBooking._id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res2.status).toBe(400);
      expect(res2.body.message).toContain('in progress');
    });
  });

  describe('4. Provider Workflow & State Transitions', () => {
    let booking: any;

    beforeEach(async () => {
      const day = new Date(Date.now() + 24 * 60 * 60 * 1000);
      booking = await new Booking({
        customerId: customerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(day.setHours(9, 0, 0, 0)),
        scheduledEndTime: new Date(day.setHours(11, 0, 0, 0)),
        address: { street: '123 Palm Grove Lane', city: 'Metro City' },
        status: 'requested',
      }).save();
    });

    it('should list incoming requested bookings for the assigned provider only', async () => {
      const res = await request(app)
        .get('/api/provider/bookings?status=requested')
        .set('Authorization', `Bearer ${providerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].id).toBe(booking._id.toString());

      // Second provider should see 0 bookings
      const secondRes = await request(app)
        .get('/api/provider/bookings')
        .set('Authorization', `Bearer ${secondProviderToken}`);

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data).toHaveLength(0);
    });

    it('should prevent a provider from accepting bookings assigned to another provider', async () => {
      const res = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/accept`)
        .set('Authorization', `Bearer ${secondProviderToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow provider to reject a requested booking', async () => {
      const res = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/reject`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ reason: 'Outside daily operating hours' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('rejected');
      expect(res.body.data.rejectionReason).toBe('Outside daily operating hours');
    });

    it('should execute full valid lifecycle: requested -> accepted -> on_the_way -> in_progress -> completed', async () => {
      // 1. Accept
      const acceptRes = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/accept`)
        .set('Authorization', `Bearer ${providerToken}`);
      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.data.status).toBe('accepted');

      // 2. On the way
      const otwRes = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'on_the_way' });
      expect(otwRes.status).toBe(200);
      expect(otwRes.body.data.status).toBe('on_the_way');

      // 3. In progress
      const ipRes = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'in_progress' });
      expect(ipRes.status).toBe(200);
      expect(ipRes.body.data.status).toBe('in_progress');

      // 4. Completed
      const compRes = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'completed' });
      expect(compRes.status).toBe(200);
      expect(compRes.body.data.status).toBe('completed');

      // 5. Verify entire status history timeline
      const refreshed = await Booking.findById(booking._id);
      expect(refreshed?.status).toBe('completed');
      expect(refreshed?.statusHistory).toHaveLength(4);
      const historyTransitions = refreshed?.statusHistory.map((h) => `${h.fromStatus}->${h.toStatus}`);
      expect(historyTransitions).toEqual([
        'requested->accepted',
        'accepted->on_the_way',
        'on_the_way->in_progress',
        'in_progress->completed',
      ]);
    });

    it('should strictly reject invalid lifecycle state transitions', async () => {
      // Cannot jump from requested directly to in_progress
      const res = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'in_progress' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid status transition');
    });

    it('should reject modifications to bookings once terminal status is reached', async () => {
      booking.status = 'completed';
      await booking.save();

      const res = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'on_the_way' });

      expect(res.status).toBe(400);
    });
  });
});
