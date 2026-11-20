import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Booking } from '../src/models/Booking';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { SlotReservation } from '../src/models/SlotReservation';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { generateToken } from '../src/utils/auth';

describe('Phase 2 Milestone 2C: Provider Job Details & Cancellation API Tests', () => {
  const app = createApp();

  let providerUser1: any;
  let providerToken1: string;
  let providerProfile1: any;

  let providerUser2: any;
  let providerToken2: string;
  let providerProfile2: any;

  let customerUser: any;
  let category: any;
  let service: any;
  let booking: any;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_provider_job_details');
    await User.syncIndexes();
    await ProviderProfile.syncIndexes();
    await Booking.syncIndexes();
    await Category.syncIndexes();
    await Service.syncIndexes();
    await SlotReservation.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // 1. Setup Provider 1
    providerUser1 = await new User({
      name: 'Ramesh Plumber',
      email: 'ramesh@example.com',
      passwordHash: 'hashed_pw',
      role: 'provider',
      isActive: true,
    }).save();

    providerProfile1 = await new ProviderProfile({
      userId: providerUser1._id,
      displayName: 'Ramesh Plumbing Services',
      phone: '+91 98765 43210',
      serviceArea: 'Indiranagar, Bangalore',
      skills: ['Plumbing', 'Leak repair'],
      verificationStatus: 'approved',
      isAcceptingJobs: true,
    }).save();

    providerToken1 = generateToken({
      userId: providerUser1._id.toString(),
      role: 'provider',
      email: providerUser1.email,
    });

    // 2. Setup Provider 2 (Intruder)
    providerUser2 = await new User({
      name: 'Suresh Electrician',
      email: 'suresh@example.com',
      passwordHash: 'hashed_pw',
      role: 'provider',
      isActive: true,
    }).save();

    providerProfile2 = await new ProviderProfile({
      userId: providerUser2._id,
      displayName: 'Suresh Electricals',
      phone: '+91 98765 00000',
      serviceArea: 'Koramangala, Bangalore',
      skills: ['Electrician'],
      verificationStatus: 'approved',
      isAcceptingJobs: true,
    }).save();

    providerToken2 = generateToken({
      userId: providerUser2._id.toString(),
      role: 'provider',
      email: providerUser2.email,
    });

    // 3. Setup Customer with phone
    customerUser = await new User({
      name: 'Priya Sharma',
      email: 'priya@example.com',
      phone: '+91 91234 56789',
      passwordHash: 'hashed_pw',
      role: 'customer',
      isActive: true,
    }).save();

    // 4. Setup Category and Service
    category = await new Category({
      name: 'Plumbing',
      slug: 'plumbing',
      description: 'Plumbing solutions',
    }).save();

    service = await new Service({
      name: 'Tap Leak Repair',
      slug: 'tap-leak-repair',
      categoryId: category._id,
      description: 'Fix leaking taps and valves',
      price: 499,
      durationMinutes: 60,
      isActive: true,
    }).save();

    // 5. Create a Booking assigned to Provider 1
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    booking = await new Booking({
      customerId: customerUser._id,
      providerId: providerProfile1._id,
      providerUserId: providerUser1._id,
      serviceId: service._id,
      categoryId: category._id,
      scheduledDate: dateStr,
      scheduledTimeSlot: '10:00 AM - 12:00 PM',
      scheduledStartTime: new Date(`${dateStr}T10:00:00.000Z`),
      scheduledEndTime: new Date(`${dateStr}T12:00:00.000Z`),
      status: 'accepted',
      customerNotes: 'Please ring bell twice upon arrival',
      address: {
        street: '12th Main, 100 Feet Road',
        city: 'Bangalore',
        postalCode: '560038',
      },
      statusHistory: [
        {
          actorId: customerUser._id,
          actorRole: 'customer',
          fromStatus: 'requested',
          toStatus: 'requested',
          timestamp: new Date(Date.now() - 3600000),
          reason: 'Booking requested by customer',
        },
        {
          actorId: providerUser1._id,
          actorRole: 'provider',
          fromStatus: 'requested',
          toStatus: 'accepted',
          timestamp: new Date(),
          reason: 'Accepted by provider',
        },
      ],
    }).save();

    // Create corresponding slot reservation
    await new SlotReservation({
      providerId: providerProfile1._id,
      bookingId: booking._id,
      slotTime: new Date(`${dateStr}T10:00:00.000Z`),
    }).save();
  });

  describe('GET /api/provider/bookings/:id', () => {
    it('returns 200 with customer phone, contact details, and price for assigned provider', async () => {
      const res = await request(app)
        .get(`/api/provider/bookings/${booking._id}`)
        .set('Authorization', `Bearer ${providerToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(booking._id.toString());
      expect(res.body.data.status).toBe('accepted');
      expect(res.body.data.customer).toBeDefined();
      expect(res.body.data.customer.name).toBe('Priya Sharma');
      expect(res.body.data.customer.email).toBe('priya@example.com');
      // Customer phone is populated and visible to assigned provider
      expect(res.body.data.customer.phone).toBe('+91 91234 56789');
      expect(res.body.data.customerNotes).toBe('Please ring bell twice upon arrival');
      expect(res.body.data.address.street).toBe('12th Main, 100 Feet Road');
    });

    it('rejects access with 403 when a different provider attempts to view the booking', async () => {
      const res = await request(app)
        .get(`/api/provider/bookings/${booking._id}`)
        .set('Authorization', `Bearer ${providerToken2}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Forbidden|Access denied/i);
    });

    it('returns 404 for non-existent booking ID', async () => {
      const res = await request(app)
        .get('/api/provider/bookings/507f1f77bcf86cd799439011')
        .set('Authorization', `Bearer ${providerToken1}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('returns 400 for invalid mongo ObjectId', async () => {
      const res = await request(app)
        .get('/api/provider/bookings/invalid-booking-id')
        .set('Authorization', `Bearer ${providerToken1}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/provider/bookings/:id/cancel', () => {
    it('successfully cancels booking, records reason, updates status history, and releases slot', async () => {
      const res = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${providerToken1}`)
        .send({ reason: 'Emergency plumbing equipment failure; cannot service today.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('cancelled');
      expect(res.body.data.cancellationReason).toBe(
        'Emergency plumbing equipment failure; cannot service today.'
      );

      // Verify in DB
      const updated = await Booking.findById(booking._id);
      expect(updated!.status).toBe('cancelled');
      expect(updated!.cancellationReason).toBe(
        'Emergency plumbing equipment failure; cannot service today.'
      );
      expect(updated!.statusHistory.length).toBe(3);
      expect(updated!.statusHistory[2].toStatus).toBe('cancelled');
      expect(updated!.statusHistory[2].reason).toContain('equipment failure');

      // Verify slot reservation was released
      const reservation = await SlotReservation.findOne({ bookingId: booking._id });
      expect(reservation).toBeNull();
    });

    it('fails with 400 if cancellation reason is missing or whitespace', async () => {
      const res = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${providerToken1}`)
        .send({ reason: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Cancellation reason must be provided/i);
    });

    it('fails with 403 if another provider attempts to cancel this booking', async () => {
      const res = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${providerToken2}`)
        .send({ reason: 'Unauthorized cancellation attempt' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('fails with 400 if attempting to cancel an already completed booking', async () => {
      booking.status = 'completed';
      await booking.save();

      const res = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${providerToken1}`)
        .send({ reason: 'Cannot cancel after completion' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Cannot cancel a booking with status/i);
    });
  });
});
