import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Booking } from '../src/models/Booking';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { Review } from '../src/models/Review';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { generateToken } from '../src/utils/auth';

describe('Phase 2 Milestone 2D: Provider Dashboard & Reviews Hub API Tests', () => {
  const app = createApp();

  let providerUser1: any;
  let providerToken1: string;
  let providerProfile1: any;

  let providerUser2: any;
  let providerToken2: string;
  let providerProfile2: any;

  let customerUser: any;
  let customerToken: string;
  let category: any;
  let service: any;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_provider_dashboard');
    await User.syncIndexes();
    await ProviderProfile.syncIndexes();
    await Booking.syncIndexes();
    await Category.syncIndexes();
    await Service.syncIndexes();
    await Review.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // 1. Setup Provider 1
    providerUser1 = await new User({
      name: 'Karthik Raja',
      email: 'karthik@example.com',
      passwordHash: 'hashed_pw',
      role: 'provider',
      isActive: true,
    }).save();

    providerProfile1 = await new ProviderProfile({
      userId: providerUser1._id,
      displayName: 'Karthik Roofing Specialists',
      phone: '+91 98765 11111',
      serviceArea: 'Indiranagar, Bangalore',
      skills: ['Roof repair', 'Waterproofing'],
      verificationStatus: 'approved',
      isAcceptingJobs: true,
    }).save();

    providerToken1 = generateToken({
      userId: providerUser1._id.toString(),
      role: 'provider',
      email: providerUser1.email,
    });

    // 2. Setup Provider 2 (Competitor/Isolation test)
    providerUser2 = await new User({
      name: 'Naveen Kumar',
      email: 'naveen@example.com',
      passwordHash: 'hashed_pw',
      role: 'provider',
      isActive: true,
    }).save();

    providerProfile2 = await new ProviderProfile({
      userId: providerUser2._id,
      displayName: 'Naveen Electricals',
      phone: '+91 98765 22222',
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

    // 3. Setup Customer
    customerUser = await new User({
      name: 'Aishwarya Rai',
      email: 'aishwarya@example.com',
      phone: '+91 99999 88888',
      passwordHash: 'hashed_pw',
      role: 'customer',
      isActive: true,
    }).save();

    customerToken = generateToken({
      userId: customerUser._id.toString(),
      role: 'customer',
      email: customerUser.email,
    });

    // 4. Setup Category & Service
    category = await new Category({
      name: 'Roofing',
      slug: 'roofing',
      description: 'Roofing and leak repair',
    }).save();

    service = await new Service({
      name: 'Roof Leak Repair',
      slug: 'roof-leak-repair',
      categoryId: category._id,
      description: 'Inspect and fix roof tile leaks',
      basePrice: 1299,
      isActive: true,
    }).save();

    // 5. Seed Bookings for Provider 1
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Booking 1: Completed today (earned 1299)
    const booking1 = await new Booking({
      customerId: customerUser._id,
      providerId: providerProfile1._id,
      providerUserId: providerUser1._id,
      serviceId: service._id,
      categoryId: category._id,
      scheduledDate: todayStr,
      scheduledTimeSlot: '09:00 AM – 11:00 AM',
      scheduledStartTime: new Date(`${todayStr}T09:00:00.000Z`),
      scheduledEndTime: new Date(`${todayStr}T11:00:00.000Z`),
      status: 'completed',
      priceSnapshot: 1299,
      address: { street: '100 Feet Rd', city: 'Bangalore' },
      statusHistory: [
        {
          actorId: providerUser1._id,
          actorRole: 'provider',
          fromStatus: 'in_progress',
          toStatus: 'completed',
          timestamp: new Date(),
          reason: 'Job done',
        },
      ],
    }).save();

    // Booking 2: Active (in_progress) today
    await new Booking({
      customerId: customerUser._id,
      providerId: providerProfile1._id,
      providerUserId: providerUser1._id,
      serviceId: service._id,
      categoryId: category._id,
      scheduledDate: todayStr,
      scheduledTimeSlot: '02:00 PM – 04:00 PM',
      scheduledStartTime: new Date(`${todayStr}T14:00:00.000Z`),
      scheduledEndTime: new Date(`${todayStr}T16:00:00.000Z`),
      status: 'in_progress',
      priceSnapshot: 1299,
      address: { street: 'Indiranagar 12th Main', city: 'Bangalore' },
    }).save();

    // Booking 3: Pending request for tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    await new Booking({
      customerId: customerUser._id,
      providerId: providerProfile1._id,
      providerUserId: providerUser1._id,
      serviceId: service._id,
      categoryId: category._id,
      scheduledDate: tomorrowStr,
      scheduledTimeSlot: '11:30 AM – 01:30 PM',
      scheduledStartTime: new Date(`${tomorrowStr}T11:30:00.000Z`),
      scheduledEndTime: new Date(`${tomorrowStr}T13:30:00.000Z`),
      status: 'requested',
      priceSnapshot: 1299,
      address: { street: 'HAL 2nd Stage', city: 'Bangalore' },
    }).save();

    // Booking 4: Cancelled booking
    await new Booking({
      customerId: customerUser._id,
      providerId: providerProfile1._id,
      providerUserId: providerUser1._id,
      serviceId: service._id,
      categoryId: category._id,
      scheduledDate: tomorrowStr,
      scheduledTimeSlot: '04:30 PM – 06:30 PM',
      scheduledStartTime: new Date(`${tomorrowStr}T16:30:00.000Z`),
      scheduledEndTime: new Date(`${tomorrowStr}T18:30:00.000Z`),
      status: 'cancelled',
      cancellationReason: 'Bad weather',
      priceSnapshot: 1299,
      address: { street: 'Domlur', city: 'Bangalore' },
    }).save();

    // 6. Seed Reviews for Provider 1
    // Review 1: 5 stars with reply
    await new Review({
      bookingId: booking1._id,
      customerId: customerUser._id,
      providerId: providerProfile1._id,
      serviceId: service._id,
      rating: 5,
      comment: 'Super fast roof leak repair! Very satisfied.',
      providerReply: {
        replyText: 'Thank you for choosing Karthik Roofing!',
        repliedAt: new Date(),
      },
      isPublished: true,
    }).save();

    // Review 2: 4 stars without reply (using dummy unique bookingId)
    const dummyBookingId = new Types.ObjectId();
    await new Review({
      bookingId: dummyBookingId,
      customerId: customerUser._id,
      providerId: providerProfile1._id,
      serviceId: service._id,
      rating: 4,
      comment: 'Good work, arrived slightly late due to traffic.',
      isPublished: true,
    }).save();

    // Review for Provider 2 (to verify isolation)
    const competitorBookingId = new Types.ObjectId();
    await new Review({
      bookingId: competitorBookingId,
      customerId: customerUser._id,
      providerId: providerProfile2._id,
      serviceId: service._id,
      rating: 1,
      comment: 'Competitor review that should not leak.',
      isPublished: true,
    }).save();
  });

  describe('GET /api/provider/dashboard/stats', () => {
    it('returns 200 with accurate KPI metrics, earnings, and today agenda for provider 1', async () => {
      const res = await request(app)
        .get('/api/provider/dashboard/stats')
        .set('Authorization', `Bearer ${providerToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const stats = res.body.data;
      expect(stats.totalCompletedJobs).toBe(1);
      expect(stats.totalBookings).toBe(4);
      expect(stats.pendingRequests).toBe(1);
      expect(stats.activeJobs).toBe(1);

      // Total earnings: 1299 (Booking 1 completed)
      expect(stats.totalRecordedEarnings).toBe(1299);
      expect(stats.currentMonthEarnings).toBe(1299);

      // Reviews: 2 reviews (5 and 4 stars) => avg 4.5
      expect(stats.reviewCount).toBe(2);
      expect(stats.ratingAverage).toBe(4.5);

      // Today's jobs agenda: 2 jobs scheduled today (Booking 1 completed, Booking 2 in_progress)
      expect(stats.todaysJobs.length).toBe(2);
      expect(stats.todaysJobs[0].service.name).toBe('Roof Leak Repair');
    });

    it('rejects access with 401 for unauthenticated requests', async () => {
      const res = await request(app).get('/api/provider/dashboard/stats');
      expect(res.status).toBe(401);
    });

    it('rejects access with 403 for customer accounts', async () => {
      const res = await request(app)
        .get('/api/provider/dashboard/stats')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/provider/reviews', () => {
    it('returns paginated reviews for this provider with rating breakdown', async () => {
      const res = await request(app)
        .get('/api/provider/reviews')
        .set('Authorization', `Bearer ${providerToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reviews.length).toBe(2);
      expect(res.body.data.pagination.total).toBe(2);

      // Summary distribution
      expect(res.body.data.summary.reviewCount).toBe(2);
      expect(res.body.data.summary.ratingAverage).toBe(4.5);
      expect(res.body.data.summary.distribution[5]).toBe(1);
      expect(res.body.data.summary.distribution[4]).toBe(1);
      expect(res.body.data.summary.distribution[1]).toBe(0); // Competitor 1-star not counted
    });

    it('filters reviews by star rating', async () => {
      const res = await request(app)
        .get('/api/provider/reviews?rating=5')
        .set('Authorization', `Bearer ${providerToken1}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reviews.length).toBe(1);
      expect(res.body.data.reviews[0].rating).toBe(5);
    });

    it('filters reviews by reply status (replied vs unreplied)', async () => {
      // 1. With reply
      const resReplied = await request(app)
        .get('/api/provider/reviews?hasReply=true')
        .set('Authorization', `Bearer ${providerToken1}`);

      expect(resReplied.status).toBe(200);
      expect(resReplied.body.data.reviews.length).toBe(1);
      expect(resReplied.body.data.reviews[0].providerReply).toBeDefined();

      // 2. Unreplied
      const resUnreplied = await request(app)
        .get('/api/provider/reviews?hasReply=false')
        .set('Authorization', `Bearer ${providerToken1}`);

      expect(resUnreplied.status).toBe(200);
      expect(resUnreplied.body.data.reviews.length).toBe(1);
      expect(resUnreplied.body.data.reviews[0].providerReply).toBeUndefined();
    });

    it('enforces provider data isolation: provider 2 cannot see provider 1 reviews', async () => {
      const res = await request(app)
        .get('/api/provider/reviews')
        .set('Authorization', `Bearer ${providerToken2}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reviews.length).toBe(1);
      expect(res.body.data.reviews[0].comment).toContain('Competitor review');
    });
  });
});
