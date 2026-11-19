import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { Booking } from '../src/models/Booking';
import { SlotReservation } from '../src/models/SlotReservation';
import { Notification } from '../src/models/Notification';
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
    await SlotReservation.syncIndexes();
    await Notification.syncIndexes();
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

    it('should enforce rate limit on POST /api/bookings and return 429 when threshold is exceeded', async () => {
      const rateLimitUser = await new User({
        name: 'Rapid Booker',
        email: 'rapid@example.com',
        passwordHash: 'dummy_hash',
        role: 'customer',
        isActive: true,
      }).save();
      const rateLimitToken = generateToken({ userId: rateLimitUser._id.toString(), role: 'customer' });

      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const start = new Date(tomorrow.setHours(10, 0, 0, 0)).toISOString();
      const end = new Date(tomorrow.setHours(11, 0, 0, 0)).toISOString();

      // Submit 15 requests (the limit)
      for (let i = 0; i < 15; i++) {
        await request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${rateLimitToken}`)
          .send({
            serviceId: activeService._id.toString(),
            providerId: approvedProfile._id.toString(),
            scheduledStartTime: start,
            scheduledEndTime: end,
            address: { street: `${i} Test Way`, city: 'Metro City' },
          });
      }

      // 16th request must exceed the threshold and receive 429
      const exceededRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${rateLimitToken}`)
        .send({
          serviceId: activeService._id.toString(),
          providerId: approvedProfile._id.toString(),
          scheduledStartTime: start,
          scheduledEndTime: end,
          address: { street: '16 Test Way', city: 'Metro City' },
        });

      expect(exceededRes.status).toBe(429);
      expect(exceededRes.body.success).toBe(false);
      expect(exceededRes.body.message).toContain('Too many booking requests');
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

    it('should handle simultaneous overlapping acceptance attempts with true concurrency and accept exactly one', async () => {
      const day = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const start1 = new Date(day.setHours(10, 0, 0, 0));
      const end1 = new Date(day.setHours(12, 0, 0, 0));

      const start2 = new Date(day.setHours(11, 0, 0, 0));
      const end2 = new Date(day.setHours(13, 0, 0, 0));

      const b1 = await new Booking({
        customerId: customerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: start1,
        scheduledEndTime: end1,
        address: { street: '10 Alpha Way', city: 'Metro City' },
        status: 'requested',
      }).save();

      const b2 = await new Booking({
        customerId: secondCustomerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: start2,
        scheduledEndTime: end2,
        address: { street: '20 Beta Road', city: 'Metro City' },
        status: 'requested',
      }).save();

      // Fire simultaneous overlapping acceptances
      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/provider/bookings/${b1._id}/accept`)
          .set('Authorization', `Bearer ${providerToken}`),
        request(app)
          .patch(`/api/provider/bookings/${b2._id}/accept`)
          .set('Authorization', `Bearer ${providerToken}`),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const acceptedBookings = await Booking.find({
        _id: { $in: [b1._id, b2._id] },
        status: 'accepted',
      });
      const requestedBookings = await Booking.find({
        _id: { $in: [b1._id, b2._id] },
        status: 'requested',
      });

      expect(acceptedBookings).toHaveLength(1);
      expect(requestedBookings).toHaveLength(1);

      // Verify slot reservations exist only for the accepted booking
      const reservations = await SlotReservation.find({
        bookingId: { $in: [b1._id, b2._id] },
      });
      expect(reservations.length).toBeGreaterThan(0);
      expect(reservations.every((r) => r.bookingId.toString() === acceptedBookings[0]._id.toString())).toBe(true);
    });

    it('should successfully accept non-overlapping adjacent appointments for the same provider without conflict', async () => {
      const day = new Date(Date.now() + 72 * 60 * 60 * 1000);
      // Appointment 1: 09:00 - 11:00
      const start1 = new Date(day.setHours(9, 0, 0, 0));
      const end1 = new Date(day.setHours(11, 0, 0, 0));
      // Appointment 2: 11:00 - 13:00 (starts exactly when 1 ends)
      const start2 = new Date(day.setHours(11, 0, 0, 0));
      const end2 = new Date(day.setHours(13, 0, 0, 0));

      const adj1 = await new Booking({
        customerId: customerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: start1,
        scheduledEndTime: end1,
        address: { street: '110 Park Street', city: 'Metro City' },
        status: 'requested',
      }).save();

      const adj2 = await new Booking({
        customerId: secondCustomerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: start2,
        scheduledEndTime: end2,
        address: { street: '112 Park Street', city: 'Metro City' },
        status: 'requested',
      }).save();

      const accept1 = await request(app)
        .patch(`/api/provider/bookings/${adj1._id}/accept`)
        .set('Authorization', `Bearer ${providerToken}`);
      expect(accept1.status).toBe(200);
      expect(accept1.body.data.status).toBe('accepted');

      const accept2 = await request(app)
        .patch(`/api/provider/bookings/${adj2._id}/accept`)
        .set('Authorization', `Bearer ${providerToken}`);
      expect(accept2.status).toBe(200);
      expect(accept2.body.data.status).toBe('accepted');

      const bothAccepted = await Booking.find({
        _id: { $in: [adj1._id, adj2._id] },
        status: 'accepted',
      });
      expect(bothAccepted).toHaveLength(2);
    });

    it('should release slot reservations when provider cancels an accepted booking', async () => {
      const day = new Date(Date.now() + 96 * 60 * 60 * 1000);
      const start = new Date(day.setHours(14, 0, 0, 0));
      const end = new Date(day.setHours(16, 0, 0, 0));

      const b = await new Booking({
        customerId: customerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: start,
        scheduledEndTime: end,
        address: { street: '55 Hill Road', city: 'Metro City' },
        status: 'requested',
      }).save();

      // Accept first
      const acceptRes = await request(app)
        .patch(`/api/provider/bookings/${b._id}/accept`)
        .set('Authorization', `Bearer ${providerToken}`);
      expect(acceptRes.status).toBe(200);

      // Verify reservations created
      const reservationsBefore = await SlotReservation.find({ bookingId: b._id });
      expect(reservationsBefore.length).toBeGreaterThan(0);

      // Provider cancels from accepted
      const cancelRes = await request(app)
        .patch(`/api/provider/bookings/${b._id}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'cancelled', reason: 'Emergency equipment repair' });

      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('cancelled');
      expect(cancelRes.body.data.cancellationReason).toBe('Emergency equipment repair');

      // Verify reservations released
      const reservationsAfter = await SlotReservation.find({ bookingId: b._id });
      expect(reservationsAfter).toHaveLength(0);

      // Now another booking in the same slot can be accepted
      const newBooking = await new Booking({
        customerId: secondCustomerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: start,
        scheduledEndTime: end,
        address: { street: '56 Hill Road', city: 'Metro City' },
        status: 'requested',
      }).save();

      const newAcceptRes = await request(app)
        .patch(`/api/provider/bookings/${newBooking._id}/accept`)
        .set('Authorization', `Bearer ${providerToken}`);
      expect(newAcceptRes.status).toBe(200);
      expect(newAcceptRes.body.data.status).toBe('accepted');
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

  describe('5. Concurrency-Safe Slot Reservation Cleanup (Phase 10B / SEC-06)', () => {
    it('should release acquired slot reservations if booking transition fails before committing (e.g. DB update error)', async () => {
      const day = new Date(Date.now() + 120 * 60 * 60 * 1000);
      const start = new Date(day.setHours(10, 0, 0, 0));
      const end = new Date(day.setHours(12, 0, 0, 0));

      const testBooking = await new Booking({
        customerId: customerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: start,
        scheduledEndTime: end,
        address: { street: '123 Test St', city: 'Metro City' },
        status: 'requested',
      }).save();

      // Mock Booking.findOneAndUpdate to simulate an unhandled DB exception during state transition
      const findOneAndUpdateSpy = vi.spyOn(Booking, 'findOneAndUpdate').mockRejectedValueOnce(new Error('Simulated DB Transition Failure'));

      const res = await request(app)
        .patch(`/api/provider/bookings/${testBooking._id}/accept`)
        .set('Authorization', `Bearer ${providerToken}`);

      findOneAndUpdateSpy.mockRestore();

      expect(res.status).toBe(500);

      // Verify that slot reservations were cleaned up and no orphaned records remain
      const orphanedSlots = await SlotReservation.find({ bookingId: testBooking._id });
      expect(orphanedSlots).toHaveLength(0);

      // Verify booking remains in requested state
      const refreshed = await Booking.findById(testBooking._id);
      expect(refreshed?.status).toBe('requested');
    });

    it('should keep slot reservations intact if booking transition committed successfully even if a subsequent operation fails', async () => {
      const day = new Date(Date.now() + 144 * 60 * 60 * 1000);
      const start = new Date(day.setHours(13, 0, 0, 0));
      const end = new Date(day.setHours(15, 0, 0, 0));

      const testBooking = await new Booking({
        customerId: customerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: start,
        scheduledEndTime: end,
        address: { street: '456 Reliable Way', city: 'Metro City' },
        status: 'requested',
      }).save();

      // Mock Booking.prototype.populate to simulate an unexpected error after the transition committed
      const populateSpy = vi.spyOn(Booking.prototype, 'populate').mockRejectedValueOnce(new Error('Simulated Post-Commit Populate Glitch'));

      const res = await request(app)
        .patch(`/api/provider/bookings/${testBooking._id}/accept`)
        .set('Authorization', `Bearer ${providerToken}`);

      populateSpy.mockRestore();

      expect(res.status).toBe(500);

      // Since the state transition committed, the booking is accepted
      const refreshed = await Booking.findById(testBooking._id);
      expect(refreshed?.status).toBe('accepted');

      // And the slot reservations MUST remain intact in MongoDB
      const activeSlots = await SlotReservation.find({ bookingId: testBooking._id });
      expect(activeSlots.length).toBeGreaterThan(0);
    });

    it('should release acquired slot reservations if another request modifies booking state before commit (concurrent change)', async () => {
      const day = new Date(Date.now() + 168 * 60 * 60 * 1000);
      const start = new Date(day.setHours(9, 0, 0, 0));
      const end = new Date(day.setHours(11, 0, 0, 0));

      const testBooking = await new Booking({
        customerId: customerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: start,
        scheduledEndTime: end,
        address: { street: '789 Concurrency Ave', city: 'Metro City' },
        status: 'requested',
      }).save();

      // Intercept right when findOneAndUpdate is called to simulate a concurrent customer cancellation
      const originalFindOneAndUpdate = Booking.findOneAndUpdate.bind(Booking);
      const findOneAndUpdateSpy = vi.spyOn(Booking, 'findOneAndUpdate').mockImplementation(async function (...args: any[]) {
        // Concurrently mutate the status in MongoDB so findOneAndUpdate finds no matching 'requested' booking
        await Booking.updateOne({ _id: testBooking._id }, { $set: { status: 'cancelled' } });
        return (originalFindOneAndUpdate as any)(...args);
      });

      const res = await request(app)
        .patch(`/api/provider/bookings/${testBooking._id}/accept`)
        .set('Authorization', `Bearer ${providerToken}`);

      findOneAndUpdateSpy.mockRestore();

      // Must return 409 Conflict
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('concurrently modified');

      // Verify that slot reservations were released
      const slotsAfter = await SlotReservation.find({ bookingId: testBooking._id });
      expect(slotsAfter).toHaveLength(0);

      // Verify booking remains cancelled
      const refreshed = await Booking.findById(testBooking._id);
      expect(refreshed?.status).toBe('cancelled');
    });

    it('should not allow cleanup failures to obscure the original 409 conflict when booking was concurrently modified', async () => {
      const day = new Date(Date.now() + 192 * 60 * 60 * 1000);
      const start = new Date(day.setHours(14, 0, 0, 0));
      const end = new Date(day.setHours(16, 0, 0, 0));

      const testBooking = await new Booking({
        customerId: customerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: start,
        scheduledEndTime: end,
        address: { street: '101 Safe Error Lane', city: 'Metro City' },
        status: 'requested',
      }).save();

      // 1. Concurrent modification causes findOneAndUpdate to return null
      const findOneAndUpdateSpy = vi.spyOn(Booking, 'findOneAndUpdate').mockResolvedValueOnce(null as any);

      // 2. Cleanup also fails (e.g. MongoDB delete glitch)
      const deleteManySpy = vi.spyOn(SlotReservation, 'deleteMany').mockRejectedValueOnce(new Error('Simulated Cleanup Deletion Glitch'));

      const res = await request(app)
        .patch(`/api/provider/bookings/${testBooking._id}/accept`)
        .set('Authorization', `Bearer ${providerToken}`);

      findOneAndUpdateSpy.mockRestore();
      deleteManySpy.mockRestore();

      // Response must STILL be 409 conflict, NOT obscured by 500 or crashing
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('concurrently modified');
    });

    it('should not allow cleanup failures to obscure the original pre-commit error during acceptance failure', async () => {
      const day = new Date(Date.now() + 216 * 60 * 60 * 1000);
      const start = new Date(day.setHours(11, 0, 0, 0));
      const end = new Date(day.setHours(13, 0, 0, 0));

      const testBooking = await new Booking({
        customerId: customerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: start,
        scheduledEndTime: end,
        address: { street: '202 Precommit Error Way', city: 'Metro City' },
        status: 'requested',
      }).save();

      // 1. Transition update throws original error
      const findOneAndUpdateSpy = vi.spyOn(Booking, 'findOneAndUpdate').mockRejectedValueOnce(new Error('Original Database Write Failure'));

      // 2. Cleanup also throws an error
      const deleteManySpy = vi.spyOn(SlotReservation, 'deleteMany').mockRejectedValueOnce(new Error('Secondary Cleanup Deletion Glitch'));

      const res = await request(app)
        .patch(`/api/provider/bookings/${testBooking._id}/accept`)
        .set('Authorization', `Bearer ${providerToken}`);

      findOneAndUpdateSpy.mockRestore();
      deleteManySpy.mockRestore();

      // Response must be 500 without crashing
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });

  describe('6. Customer Booking Rescheduling Engine (Phase 1, Milestone 3A)', () => {
    let requestedBooking: any;
    let acceptedBooking: any;
    let baseTime: Date;

    beforeEach(async () => {
      // 3 days in the future
      baseTime = new Date(Date.now() + 72 * 60 * 60 * 1000);
      const start1 = new Date(baseTime);
      start1.setHours(9, 0, 0, 0);
      const end1 = new Date(baseTime);
      end1.setHours(11, 0, 0, 0);

      requestedBooking = await new Booking({
        customerId: customerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: start1,
        scheduledEndTime: end1,
        address: { street: '123 Palm Grove Lane', city: 'Metro City' },
        status: 'requested',
      }).save();

      const start2 = new Date(baseTime);
      start2.setHours(14, 0, 0, 0);
      const end2 = new Date(baseTime);
      end2.setHours(16, 0, 0, 0);

      acceptedBooking = await new Booking({
        customerId: customerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: start2,
        scheduledEndTime: end2,
        address: { street: '123 Palm Grove Lane', city: 'Metro City' },
        status: 'accepted',
      }).save();

      // Seed slot reservations for acceptedBooking
      const slots = [
        new Date(start2.getTime()),
        new Date(start2.getTime() + 15 * 60000),
        new Date(start2.getTime() + 30 * 60000),
        new Date(start2.getTime() + 45 * 60000),
        new Date(start2.getTime() + 60 * 60000),
        new Date(start2.getTime() + 75 * 60000),
        new Date(start2.getTime() + 90 * 60000),
        new Date(start2.getTime() + 105 * 60000),
      ];
      await SlotReservation.insertMany(
        slots.map((s) => ({
          providerId: approvedProfile._id,
          slotTime: s,
          bookingId: acceptedBooking._id,
        }))
      );
    });

    it('should successfully reschedule a requested booking without touching slot reservations', async () => {
      const newStart = new Date(baseTime);
      newStart.setDate(newStart.getDate() + 1);
      newStart.setHours(10, 0, 0, 0);
      const newEnd = new Date(newStart);
      newEnd.setHours(12, 0, 0, 0);

      const res = await request(app)
        .patch(`/api/bookings/${requestedBooking._id}/reschedule`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          newStartTime: newStart.toISOString(),
          newEndTime: newEnd.toISOString(),
          reason: 'Family emergency, need next day',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('requested');
      expect(new Date(res.body.data.scheduledStartTime).toISOString()).toBe(newStart.toISOString());
      expect(new Date(res.body.data.scheduledEndTime).toISOString()).toBe(newEnd.toISOString());

      // Audit log entry
      expect(res.body.data.statusHistory).toHaveLength(1);
      expect(res.body.data.statusHistory[0].fromStatus).toBe('requested');
      expect(res.body.data.statusHistory[0].toStatus).toBe('requested');
      expect(res.body.data.statusHistory[0].reason).toContain('Family emergency');

      // Provider in-app notification
      const notif = await Notification.findOne({
        recipientId: providerUser._id,
        type: 'BOOKING_RESCHEDULED',
      });
      expect(notif).toBeTruthy();
      expect(notif?.message).toContain('Family emergency');
    });

    it('should successfully reschedule an accepted booking and migrate slot reservations atomically', async () => {
      const newStart = new Date(baseTime);
      newStart.setDate(newStart.getDate() + 2);
      newStart.setHours(11, 30, 0, 0);
      const newEnd = new Date(newStart);
      newEnd.setHours(13, 30, 0, 0);

      const res = await request(app)
        .patch(`/api/bookings/${acceptedBooking._id}/reschedule`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          newStartTime: newStart.toISOString(),
          newEndTime: newEnd.toISOString(),
          reason: 'Need morning window',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('accepted');
      expect(new Date(res.body.data.scheduledStartTime).toISOString()).toBe(newStart.toISOString());

      // Verify old slot reservations were removed
      const oldSlotsCount = await SlotReservation.countDocuments({
        bookingId: acceptedBooking._id,
        slotTime: { $lt: newStart },
      });
      expect(oldSlotsCount).toBe(0);

      // Verify new slot reservations were acquired
      const newSlotsCount = await SlotReservation.countDocuments({
        bookingId: acceptedBooking._id,
        slotTime: { $gte: newStart, $lt: newEnd },
      });
      expect(newSlotsCount).toBe(8); // 2 hours = 8 15-min buckets
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await request(app)
        .patch(`/api/bookings/${requestedBooking._id}/reschedule`)
        .send({ newStartTime: new Date().toISOString(), newEndTime: new Date().toISOString() });

      expect(res.status).toBe(401);
    });

    it('should prevent a customer from rescheduling another customer booking (403)', async () => {
      const newStart = new Date(baseTime);
      newStart.setHours(15, 0, 0, 0);
      const newEnd = new Date(baseTime);
      newEnd.setHours(17, 0, 0, 0);

      const res = await request(app)
        .patch(`/api/bookings/${requestedBooking._id}/reschedule`)
        .set('Authorization', `Bearer ${secondCustomerToken}`)
        .send({
          newStartTime: newStart.toISOString(),
          newEndTime: newEnd.toISOString(),
        });

      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/access denied/i);
    });

    it('should return 404 for non-existent booking', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const newStart = new Date(baseTime);
      newStart.setHours(15, 0, 0, 0);
      const newEnd = new Date(baseTime);
      newEnd.setHours(17, 0, 0, 0);

      const res = await request(app)
        .patch(`/api/bookings/${fakeId}/reschedule`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          newStartTime: newStart.toISOString(),
          newEndTime: newEnd.toISOString(),
        });

      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid booking ID format', async () => {
      const res = await request(app)
        .patch('/api/bookings/invalid-id/reschedule')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          newStartTime: new Date().toISOString(),
          newEndTime: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid booking id/i);
    });

    it('should return 400 for missing or invalid timestamps', async () => {
      // Missing end time
      const res1 = await request(app)
        .patch(`/api/bookings/${requestedBooking._id}/reschedule`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ newStartTime: new Date().toISOString() });
      expect(res1.status).toBe(400);

      // Malformed date
      const res2 = await request(app)
        .patch(`/api/bookings/${requestedBooking._id}/reschedule`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ newStartTime: 'not-a-date', newEndTime: 'also-not-a-date' });
      expect(res2.status).toBe(400);
    });

    it('should return 400 when appointment start time is in the past', async () => {
      const pastStart = new Date(Date.now() - 3600000);
      const pastEnd = new Date(Date.now() + 3600000);

      const res = await request(app)
        .patch(`/api/bookings/${requestedBooking._id}/reschedule`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          newStartTime: pastStart.toISOString(),
          newEndTime: pastEnd.toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/future/i);
    });

    it('should return 400 when duration is invalid (end before start or duration out of bounds)', async () => {
      const futureStart = new Date(baseTime);
      futureStart.setHours(10, 0, 0, 0);

      // End before start
      const invalidEnd = new Date(futureStart.getTime() - 1000);
      const res1 = await request(app)
        .patch(`/api/bookings/${requestedBooking._id}/reschedule`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          newStartTime: futureStart.toISOString(),
          newEndTime: invalidEnd.toISOString(),
        });
      expect(res1.status).toBe(400);

      // Less than 30 mins
      const shortEnd = new Date(futureStart.getTime() + 15 * 60000);
      const res2 = await request(app)
        .patch(`/api/bookings/${requestedBooking._id}/reschedule`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          newStartTime: futureStart.toISOString(),
          newEndTime: shortEnd.toISOString(),
        });
      expect(res2.status).toBe(400);

      // Greater than 8 hours
      const longEnd = new Date(futureStart.getTime() + 9 * 3600000);
      const res3 = await request(app)
        .patch(`/api/bookings/${requestedBooking._id}/reschedule`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          newStartTime: futureStart.toISOString(),
          newEndTime: longEnd.toISOString(),
        });
      expect(res3.status).toBe(400);
    });

    it('should reject rescheduling for on_the_way and in_progress bookings with 400', async () => {
      requestedBooking.status = 'on_the_way';
      await requestedBooking.save();

      const newStart = new Date(baseTime);
      newStart.setDate(newStart.getDate() + 1);
      const newEnd = new Date(newStart.getTime() + 2 * 3600000);

      const res1 = await request(app)
        .patch(`/api/bookings/${requestedBooking._id}/reschedule`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ newStartTime: newStart.toISOString(), newEndTime: newEnd.toISOString() });
      expect(res1.status).toBe(400);
      expect(res1.body.message).toMatch(/on the way/i);

      requestedBooking.status = 'in_progress';
      await requestedBooking.save();

      const res2 = await request(app)
        .patch(`/api/bookings/${requestedBooking._id}/reschedule`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ newStartTime: newStart.toISOString(), newEndTime: newEnd.toISOString() });
      expect(res2.status).toBe(400);
      expect(res2.body.message).toMatch(/in progress/i);
    });

    it('should reject rescheduling for terminal states (completed, cancelled, rejected) with 400', async () => {
      const newStart = new Date(baseTime);
      newStart.setDate(newStart.getDate() + 1);
      const newEnd = new Date(newStart.getTime() + 2 * 3600000);

      for (const st of ['completed', 'cancelled', 'rejected']) {
        requestedBooking.status = st;
        await requestedBooking.save();

        const res = await request(app)
          .patch(`/api/bookings/${requestedBooking._id}/reschedule`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ newStartTime: newStart.toISOString(), newEndTime: newEnd.toISOString() });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/terminal state/i);
      }
    });

    it('should return 409 conflict when provider has an overlapping active booking', async () => {
      // Create another customer booking overlapping the desired reschedule window
      const overlapStart = new Date(baseTime);
      overlapStart.setDate(overlapStart.getDate() + 4);
      overlapStart.setHours(9, 0, 0, 0);
      const overlapEnd = new Date(overlapStart);
      overlapEnd.setHours(11, 0, 0, 0);

      await new Booking({
        customerId: secondCustomerUser._id,
        providerId: approvedProfile._id,
        providerUserId: providerUser._id,
        serviceId: activeService._id,
        categoryId: testCategory._id,
        scheduledStartTime: overlapStart,
        scheduledEndTime: overlapEnd,
        address: { street: '99 Conflict Way', city: 'Metro City' },
        status: 'accepted',
      }).save();

      const res = await request(app)
        .patch(`/api/bookings/${requestedBooking._id}/reschedule`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          newStartTime: overlapStart.toISOString(),
          newEndTime: overlapEnd.toISOString(),
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/overlapping appointment/i);
    });

    it('should not conflict with the booking own prior schedule when shifting appointment slightly', async () => {
      // Shift acceptedBooking by 30 mins: 14:00-16:00 -> 14:30-16:30
      const shiftedStart = new Date(acceptedBooking.scheduledStartTime.getTime() + 30 * 60000);
      const shiftedEnd = new Date(acceptedBooking.scheduledEndTime.getTime() + 30 * 60000);

      const res = await request(app)
        .patch(`/api/bookings/${acceptedBooking._id}/reschedule`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          newStartTime: shiftedStart.toISOString(),
          newEndTime: shiftedEnd.toISOString(),
          reason: '30 minute shift',
        });

      expect(res.status).toBe(200);
      expect(new Date(res.body.data.scheduledStartTime).toISOString()).toBe(shiftedStart.toISOString());
    });

    it('should preserve original slot reservations if acquiring new slots encounters an error or conflict', async () => {
      const targetStart = new Date(baseTime);
      targetStart.setDate(targetStart.getDate() + 5);
      targetStart.setHours(10, 0, 0, 0);
      const targetEnd = new Date(targetStart.getTime() + 2 * 3600000);

      // Seed a foreign slot reservation directly into SlotReservation at that target time
      await new SlotReservation({
        providerId: approvedProfile._id,
        slotTime: targetStart,
        bookingId: new mongoose.Types.ObjectId(),
      }).save();

      const res = await request(app)
        .patch(`/api/bookings/${acceptedBooking._id}/reschedule`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          newStartTime: targetStart.toISOString(),
          newEndTime: targetEnd.toISOString(),
        });

      expect(res.status).toBe(409);

      // Verify acceptedBooking original slots are STILL intact!
      const originalSlotsCount = await SlotReservation.countDocuments({
        bookingId: acceptedBooking._id,
      });
      expect(originalSlotsCount).toBe(8);

      const refreshed = await Booking.findById(acceptedBooking._id);
      expect(refreshed?.scheduledStartTime.toISOString()).toBe(acceptedBooking.scheduledStartTime.toISOString());
    });
  });
});
