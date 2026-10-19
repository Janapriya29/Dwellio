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
import { Review } from '../src/models/Review';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { generateToken } from '../src/utils/auth';

describe('Phase 7: Verified Reviews & Provider Reputation Tests', () => {
  const app = createApp();

  let customerUser: any;
  let customerToken: string;
  let secondCustomerUser: any;
  let secondCustomerToken: string;
  let thirdCustomerUser: any;
  let thirdCustomerToken: string;

  let providerUser: any;
  let providerToken: string;
  let approvedProfile: any;

  let secondProviderUser: any;
  let secondProviderToken: string;
  let secondApprovedProfile: any;

  let testCategory: any;
  let testService: any;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_review');
    await User.syncIndexes();
    await ProviderProfile.syncIndexes();
    await Category.syncIndexes();
    await Service.syncIndexes();
    await Booking.syncIndexes();
    await SlotReservation.syncIndexes();
    await Review.syncIndexes();
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

    // 3. Customer 3
    thirdCustomerUser = await new User({
      name: 'Charlie Customer',
      email: 'charlie@example.com',
      passwordHash: 'dummy_hash',
      role: 'customer',
      isActive: true,
    }).save();
    thirdCustomerToken = generateToken({ userId: thirdCustomerUser._id.toString(), role: 'customer' });

    // 4. Category & Service
    testCategory = await new Category({
      name: 'Electrical Works',
      slug: 'electrical-works',
      rooms: ['living'],
      isActive: true,
    }).save();

    testService = await new Service({
      categoryId: testCategory._id,
      name: 'Ceiling Fan Installation',
      slug: 'ceiling-fan-installation',
      isActive: true,
    }).save();

    // 5. Approved Provider 1
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
      skills: ['Ceiling Fan Installation', 'Electrician'],
      categories: [testCategory._id],
      verificationStatus: 'approved',
      ratingAverage: 0,
      reviewCount: 0,
    }).save();

    // 6. Approved Provider 2
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
      displayName: 'Selvi Services',
      phone: '9876543211',
      serviceArea: 'West Zone',
      skills: ['Plumbing'],
      verificationStatus: 'approved',
      ratingAverage: 0,
      reviewCount: 0,
    }).save();
  });

  const createCompletedBooking = async (customerId: any, providerProfileId: any, providerUserId: any) => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return new Booking({
      customerId,
      providerId: providerProfileId,
      providerUserId,
      serviceId: testService._id,
      categoryId: testCategory._id,
      scheduledStartTime: new Date(yesterday.setHours(10, 0, 0, 0)),
      scheduledEndTime: new Date(yesterday.setHours(11, 30, 0, 0)),
      address: { street: '123 Palm Grove Lane', city: 'Metro City' },
      status: 'completed',
      statusHistory: [
        {
          actorId: customerId,
          actorRole: 'customer',
          fromStatus: 'requested',
          toStatus: 'requested',
          timestamp: new Date(yesterday.getTime() - 3600000),
        },
        {
          actorId: providerUserId,
          actorRole: 'provider',
          fromStatus: 'requested',
          toStatus: 'completed',
          timestamp: yesterday,
        },
      ],
    }).save();
  };

  describe('1. Review Submission (POST /api/bookings/:id/reviews)', () => {
    it('should successfully submit a verified review for a completed booking', async () => {
      const booking = await createCompletedBooking(customerUser._id, approvedProfile._id, providerUser._id);

      const res = await request(app)
        .post(`/api/bookings/${booking._id}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          rating: 5,
          comment: 'Outstanding and prompt installation! Very professional technician.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.rating).toBe(5);
      expect(res.body.data.comment).toBe('Outstanding and prompt installation! Very professional technician.');
      expect(res.body.data.customerId).toBe(customerUser._id.toString());
      expect(res.body.data.providerId).toBe(approvedProfile._id.toString());
      expect(res.body.data.serviceId).toBe(testService._id.toString());

      // Verify provider profile aggregate updated
      const updatedProfile = await ProviderProfile.findById(approvedProfile._id);
      expect(updatedProfile?.ratingAverage).toBe(5.0);
      expect(updatedProfile?.reviewCount).toBe(1);
    });

    it('should successfully submit review without comment (rating only)', async () => {
      const booking = await createCompletedBooking(customerUser._id, approvedProfile._id, providerUser._id);

      const res = await request(app)
        .post(`/api/bookings/${booking._id}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 4 });

      expect(res.status).toBe(201);
      expect(res.body.data.rating).toBe(4);
      expect(res.body.data.comment).toBeUndefined();
    });

    it('should strictly reject review submission for non-completed booking states', async () => {
      const day = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const nonCompletedStatuses = ['requested', 'accepted', 'on_the_way', 'in_progress', 'cancelled', 'rejected'] as const;

      for (const st of nonCompletedStatuses) {
        const booking = await new Booking({
          customerId: customerUser._id,
          providerId: approvedProfile._id,
          providerUserId: providerUser._id,
          serviceId: testService._id,
          categoryId: testCategory._id,
          scheduledStartTime: new Date(day.setHours(10, 0, 0, 0)),
          scheduledEndTime: new Date(day.setHours(11, 30, 0, 0)),
          address: { street: '123 Palm Grove Lane', city: 'Metro City' },
          status: st,
        }).save();

        const res = await request(app)
          .post(`/api/bookings/${booking._id}/reviews`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ rating: 5, comment: 'Great job done ahead of time.' });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('Only completed bookings can be reviewed');
      }
    });

    it('should reject review submission if user is not the booking customer', async () => {
      const booking = await createCompletedBooking(customerUser._id, approvedProfile._id, providerUser._id);

      // Bob attempts to review Alice's booking
      const res = await request(app)
        .post(`/api/bookings/${booking._id}/reviews`)
        .set('Authorization', `Bearer ${secondCustomerToken}`)
        .send({ rating: 5, comment: 'Great service overall.' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should return 404 for non-existent booking ID and 400 for malformed ID', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res404 = await request(app)
        .post(`/api/bookings/${fakeId}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 5 });

      expect(res404.status).toBe(404);

      const res400 = await request(app)
        .post('/api/bookings/invalid-id-format/reviews')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 5 });

      expect(res400.status).toBe(400);
    });

    it('should reject invalid star ratings (floats, negative, zero, greater than 5, or string)', async () => {
      const booking = await createCompletedBooking(customerUser._id, approvedProfile._id, providerUser._id);

      const invalidRatings = [0, -1, 6, 4.5, '5', null, undefined];

      for (const r of invalidRatings) {
        const res = await request(app)
          .post(`/api/bookings/${booking._id}/reviews`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ rating: r, comment: 'Good quality service provided.' });

        expect(res.status).toBe(400);
        expect(res.body.message).toContain('integer between 1 and 5');
      }
    });

    it('should validate review comment rules (whitespace only, min length 10, max length 1000)', async () => {
      const booking = await createCompletedBooking(customerUser._id, approvedProfile._id, providerUser._id);

      // Whitespace only
      const resEmpty = await request(app)
        .post(`/api/bookings/${booking._id}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 5, comment: '     ' });
      expect(resEmpty.status).toBe(400);
      expect(resEmpty.body.message).toContain('whitespace only');

      // Too short (< 10 chars)
      const resShort = await request(app)
        .post(`/api/bookings/${booking._id}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 5, comment: 'Good job' });
      expect(resShort.status).toBe(400);
      expect(resShort.body.message).toContain('at least 10 characters');

      // Too long (> 1000 chars)
      const resLong = await request(app)
        .post(`/api/bookings/${booking._id}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 5, comment: 'a'.repeat(1001) });
      expect(resLong.status).toBe(400);
      expect(resLong.body.message).toContain('cannot exceed 1000 characters');
    });

    it('should prevent duplicate reviews for the same booking (409 Conflict)', async () => {
      const booking = await createCompletedBooking(customerUser._id, approvedProfile._id, providerUser._id);

      // First review succeeds
      const res1 = await request(app)
        .post(`/api/bookings/${booking._id}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 5, comment: 'First review submitted successfully.' });
      expect(res1.status).toBe(201);

      // Second review fails
      const res2 = await request(app)
        .post(`/api/bookings/${booking._id}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 4, comment: 'Attempting duplicate review submission.' });
      expect(res2.status).toBe(409);
      expect(res2.body.message).toContain('already been submitted');
    });

    it('should handle simultaneous concurrent review attempts on the same booking and accept exactly one', async () => {
      const booking = await createCompletedBooking(customerUser._id, approvedProfile._id, providerUser._id);

      const [resA, resB] = await Promise.all([
        request(app)
          .post(`/api/bookings/${booking._id}/reviews`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ rating: 5, comment: 'Simultaneous review submission A.' }),
        request(app)
          .post(`/api/bookings/${booking._id}/reviews`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ rating: 4, comment: 'Simultaneous review submission B.' }),
      ]);

      const statuses = [resA.status, resB.status].sort();
      expect(statuses).toEqual([201, 409]);

      const reviewsInDb = await Review.find({ bookingId: booking._id });
      expect(reviewsInDb).toHaveLength(1);
    });
  });

  describe('2. Rating Aggregates & Concurrency Consistency', () => {
    it('should accurately calculate ratingAverage and reviewCount over multiple reviews', async () => {
      const b1 = await createCompletedBooking(customerUser._id, approvedProfile._id, providerUser._id);
      const b2 = await createCompletedBooking(secondCustomerUser._id, approvedProfile._id, providerUser._id);
      const b3 = await createCompletedBooking(thirdCustomerUser._id, approvedProfile._id, providerUser._id);

      // Review 1: 5 stars
      await request(app)
        .post(`/api/bookings/${b1._id}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 5, comment: 'First review with 5 star rating.' });

      let profile = await ProviderProfile.findById(approvedProfile._id);
      expect(profile?.ratingAverage).toBe(5.0);
      expect(profile?.reviewCount).toBe(1);

      // Review 2: 4 stars -> (5 + 4) / 2 = 4.5
      await request(app)
        .post(`/api/bookings/${b2._id}/reviews`)
        .set('Authorization', `Bearer ${secondCustomerToken}`)
        .send({ rating: 4, comment: 'Second review with 4 star rating.' });

      profile = await ProviderProfile.findById(approvedProfile._id);
      expect(profile?.ratingAverage).toBe(4.5);
      expect(profile?.reviewCount).toBe(2);

      // Review 3: 4 stars -> (5 + 4 + 4) / 3 = 4.3333 -> rounds to 4.3
      await request(app)
        .post(`/api/bookings/${b3._id}/reviews`)
        .set('Authorization', `Bearer ${thirdCustomerToken}`)
        .send({ rating: 4, comment: 'Third review with 4 star rating.' });

      profile = await ProviderProfile.findById(approvedProfile._id);
      expect(profile?.ratingAverage).toBe(4.3);
      expect(profile?.reviewCount).toBe(3);
    });

    it('should maintain aggregate consistency under concurrent review creation across multiple bookings', async () => {
      // Create 5 different completed bookings for the same provider
      const customers: any[] = [];
      const tokens: string[] = [];
      const bookings: any[] = [];

      for (let i = 0; i < 5; i++) {
        const u = await new User({
          name: `Concurrent User ${i}`,
          email: `concurrent${i}@example.com`,
          passwordHash: 'dummy_hash',
          role: 'customer',
          isActive: true,
        }).save();
        customers.push(u);
        tokens.push(generateToken({ userId: u._id.toString(), role: 'customer' }));

        const b = await createCompletedBooking(u._id, approvedProfile._id, providerUser._id);
        bookings.push(b);
      }

      // Ratings: 5, 4, 3, 5, 4 -> sum = 21 / 5 = 4.2
      const ratings = [5, 4, 3, 5, 4];

      const reviewPromises = bookings.map((b, idx) =>
        request(app)
          .post(`/api/bookings/${b._id}/reviews`)
          .set('Authorization', `Bearer ${tokens[idx]}`)
          .send({ rating: ratings[idx], comment: `Concurrent review number ${idx} with valid text.` })
      );

      const responses = await Promise.all(reviewPromises);
      expect(responses.every((r) => r.status === 201)).toBe(true);

      const finalProfile = await ProviderProfile.findById(approvedProfile._id);
      expect(finalProfile?.reviewCount).toBe(5);
      expect(finalProfile?.ratingAverage).toBe(4.2);
    });
  });

  describe('3. Booking Review Details (GET /api/bookings/:id/review)', () => {
    it('should allow customer or assigned provider to view booking review', async () => {
      const booking = await createCompletedBooking(customerUser._id, approvedProfile._id, providerUser._id);

      await request(app)
        .post(`/api/bookings/${booking._id}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 5, comment: 'Excellent electrical repair service.' });

      // Customer accesses
      const custRes = await request(app)
        .get(`/api/bookings/${booking._id}/review`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(custRes.status).toBe(200);
      expect(custRes.body.data.rating).toBe(5);

      // Assigned provider accesses
      const provRes = await request(app)
        .get(`/api/bookings/${booking._id}/review`)
        .set('Authorization', `Bearer ${providerToken}`);
      expect(provRes.status).toBe(200);
      expect(provRes.body.data.rating).toBe(5);

      // Second provider accesses -> 403
      const secondProvRes = await request(app)
        .get(`/api/bookings/${booking._id}/review`)
        .set('Authorization', `Bearer ${secondProviderToken}`);
      expect(secondProvRes.status).toBe(403);

      // Second customer accesses -> 403
      const secondCustRes = await request(app)
        .get(`/api/bookings/${booking._id}/review`)
        .set('Authorization', `Bearer ${secondCustomerToken}`);
      expect(secondCustRes.status).toBe(403);
    });

    it('should return 404 when no review has been submitted for the booking', async () => {
      const booking = await createCompletedBooking(customerUser._id, approvedProfile._id, providerUser._id);

      const res = await request(app)
        .get(`/api/bookings/${booking._id}/review`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('No review has been submitted');
    });
  });

  describe('4. Public Provider Reviews (GET /api/providers/:id/reviews)', () => {
    it('should return paginated published reviews with sanitized customer details and rating summary', async () => {
      const b1 = await createCompletedBooking(customerUser._id, approvedProfile._id, providerUser._id);
      const b2 = await createCompletedBooking(secondCustomerUser._id, approvedProfile._id, providerUser._id);

      await request(app)
        .post(`/api/bookings/${b1._id}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 5, comment: 'Alice review text for the technician.' });

      await request(app)
        .post(`/api/bookings/${b2._id}/reviews`)
        .set('Authorization', `Bearer ${secondCustomerToken}`)
        .send({ rating: 4, comment: 'Bob review text for the technician.' });

      const res = await request(app).get(`/api/providers/${approvedProfile._id}/reviews?page=1&limit=10`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reviews).toHaveLength(2);
      expect(res.body.data.pagination.total).toBe(2);
      expect(res.body.data.summary.ratingAverage).toBe(4.5);
      expect(res.body.data.summary.reviewCount).toBe(2);
      expect(res.body.data.summary.distribution[5]).toBe(1);
      expect(res.body.data.summary.distribution[4]).toBe(1);

      // Security Check: customerName is present, email and userId are sanitized and never exposed
      expect(res.body.data.reviews[0].customerName).toBeDefined();
      expect(res.body.data.reviews[0].customerEmail).toBeUndefined();
      expect(res.body.data.reviews[0].customerId).toBeUndefined();
    });

    it('should exclude unpublished reviews from public list', async () => {
      const b1 = await createCompletedBooking(customerUser._id, approvedProfile._id, providerUser._id);
      const review = await new Review({
        bookingId: b1._id,
        customerId: customerUser._id,
        providerId: approvedProfile._id,
        serviceId: testService._id,
        rating: 1,
        comment: 'Unpublished review under moderation.',
        isPublished: false, // Moderated / Unpublished!
      }).save();

      const res = await request(app).get(`/api/providers/${approvedProfile._id}/reviews`);
      expect(res.status).toBe(200);
      expect(res.body.data.reviews).toHaveLength(0);
      expect(res.body.data.pagination.total).toBe(0);
    });
  });

  describe('5. Provider Review Reply (PATCH /api/reviews/:id/reply)', () => {
    let review: any;

    beforeEach(async () => {
      const booking = await createCompletedBooking(customerUser._id, approvedProfile._id, providerUser._id);
      review = await new Review({
        bookingId: booking._id,
        customerId: customerUser._id,
        providerId: approvedProfile._id,
        serviceId: testService._id,
        rating: 5,
        comment: 'Excellent service provided by Karthik Raja.',
        isPublished: true,
      }).save();
    });

    it('should allow the assigned provider to reply to a review', async () => {
      const res = await request(app)
        .patch(`/api/reviews/${review._id}/reply`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ replyText: 'Thank you for choosing Dwellio! Happy to help anytime.' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.providerReply).toBeDefined();
      expect(res.body.data.providerReply.replyText).toBe('Thank you for choosing Dwellio! Happy to help anytime.');
      expect(res.body.data.providerReply.repliedAt).toBeDefined();

      // Customer review values must remain unchanged
      expect(res.body.data.rating).toBe(5);
      expect(res.body.data.comment).toBe('Excellent service provided by Karthik Raja.');
    });

    it('should reject provider reply if provider does not own the review', async () => {
      const res = await request(app)
        .patch(`/api/reviews/${review._id}/reply`)
        .set('Authorization', `Bearer ${secondProviderToken}`) // Provider 2 replying to Provider 1's review!
        .send({ replyText: 'Imposter provider reply.' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('should reject customer or unapproved user attempting to reply', async () => {
      const res = await request(app)
        .patch(`/api/reviews/${review._id}/reply`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ replyText: 'Customer reply attempt.' });

      expect(res.status).toBe(403);
    });

    it('should reject second reply attempt to the same review (single reply invariant)', async () => {
      // First reply succeeds
      await request(app)
        .patch(`/api/reviews/${review._id}/reply`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ replyText: 'First reply from provider.' });

      // Second reply fails
      const res2 = await request(app)
        .patch(`/api/reviews/${review._id}/reply`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ replyText: 'Second reply attempt should be rejected.' });

      expect(res2.status).toBe(409);
      expect(res2.body.message).toContain('already been submitted');
    });

    it('should enforce single-reply invariant under simultaneous concurrent requests', async () => {
      const [res1, res2] = await Promise.all([
        request(app)
          .patch(`/api/reviews/${review._id}/reply`)
          .set('Authorization', `Bearer ${providerToken}`)
          .send({ replyText: 'Concurrent reply attempt 1.' }),
        request(app)
          .patch(`/api/reviews/${review._id}/reply`)
          .set('Authorization', `Bearer ${providerToken}`)
          .send({ replyText: 'Concurrent reply attempt 2.' }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const updatedReview = await Review.findById(review._id);
      expect(updatedReview?.providerReply).toBeDefined();
    });
  });
});
