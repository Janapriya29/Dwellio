import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { Booking } from '../src/models/Booking';
import { Review } from '../src/models/Review';
import { AuditLog } from '../src/models/AuditLog';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { generateToken } from '../src/utils/auth';
import { recalculateProviderRating } from '../src/utils/review';

describe('Phase 8: Admin Dashboard & Platform Management Integration Tests', () => {
  const app = createApp();

  let adminUser: any;
  let adminToken: string;
  let customerUser: any;
  let customerToken: string;
  let providerUser: any;
  let providerToken: string;
  let providerProfile: any;
  let testCategory: any;
  let testService: any;
  let testBooking: any;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_admin_dashboard');
    await User.syncIndexes();
    await ProviderProfile.syncIndexes();
    await Category.syncIndexes();
    await Service.syncIndexes();
    await Booking.syncIndexes();
    await Review.syncIndexes();
    await AuditLog.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // 1. Admin
    adminUser = await new User({
      name: 'System Admin',
      email: 'admin@dwellio.local',
      passwordHash: 'dummy_hash',
      role: 'admin',
    }).save();
    adminToken = generateToken({ userId: adminUser._id.toString(), role: 'admin' });

    // 2. Customer
    customerUser = await new User({
      name: 'Customer Pooja',
      email: 'pooja@example.com',
      passwordHash: 'dummy_hash',
      role: 'customer',
    }).save();
    customerToken = generateToken({ userId: customerUser._id.toString(), role: 'customer' });

    // 3. Provider User & Profile
    providerUser = await new User({
      name: 'Karthik Technician',
      email: 'karthik@example.com',
      passwordHash: 'dummy_hash',
      role: 'provider',
    }).save();
    providerToken = generateToken({ userId: providerUser._id.toString(), role: 'provider' });

    providerProfile = await new ProviderProfile({
      userId: providerUser._id,
      displayName: 'Karthik Roofing Solutions',
      phone: '+91 9840122334',
      serviceArea: 'Chennai Central',
      skills: ['Roofing', 'Waterproofing'],
      verificationStatus: 'approved',
      ratingAverage: 0,
      reviewCount: 0,
    }).save();

    // 4. Category & Service
    testCategory = await new Category({
      name: 'Roofing Repairs',
      slug: 'roofing-repairs',
      description: 'Roofing and terrace works',
      icon: 'shield',
      rooms: ['roof'],
      isActive: true,
    }).save();

    testService = await new Service({
      categoryId: testCategory._id,
      name: 'Terrace Waterproofing',
      slug: 'terrace-waterproofing',
      isActive: true,
    }).save();

    // 5. Booking
    testBooking = await new Booking({
      customerId: customerUser._id,
      providerId: providerProfile._id,
      providerUserId: providerUser._id,
      serviceId: testService._id,
      categoryId: testCategory._id,
      scheduledStartTime: new Date(Date.now() + 86400000),
      scheduledEndTime: new Date(Date.now() + 93600000),
      address: { street: '12 Marina Beach Road', city: 'Chennai' },
      status: 'completed',
      statusHistory: [
        {
          actorId: customerUser._id,
          actorRole: 'customer',
          fromStatus: 'requested',
          toStatus: 'requested',
          timestamp: new Date(),
        },
        {
          actorId: providerUser._id,
          actorRole: 'provider',
          fromStatus: 'requested',
          toStatus: 'accepted',
          timestamp: new Date(),
        },
        {
          actorId: providerUser._id,
          actorRole: 'provider',
          fromStatus: 'accepted',
          toStatus: 'completed',
          timestamp: new Date(),
        },
      ],
    }).save();
  });

  describe('1. Role-Based Access Control (RBAC)', () => {
    it('should reject unauthenticated requests with 401', async () => {
      const endpoints = [
        '/api/admin/overview',
        '/api/admin/bookings',
        '/api/admin/reviews',
        '/api/admin/audit-logs',
      ];

      for (const endpoint of endpoints) {
        const res = await request(app).get(endpoint);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      }
    });

    it('should reject customer tokens with 403 Forbidden', async () => {
      const endpoints = [
        '/api/admin/overview',
        '/api/admin/bookings',
        '/api/admin/reviews',
        '/api/admin/audit-logs',
      ];

      for (const endpoint of endpoints) {
        const res = await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${customerToken}`);
        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
      }
    });

    it('should reject provider tokens with 403 Forbidden', async () => {
      const endpoints = [
        '/api/admin/overview',
        '/api/admin/bookings',
        '/api/admin/reviews',
        '/api/admin/audit-logs',
      ];

      for (const endpoint of endpoints) {
        const res = await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${providerToken}`);
        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
      }
    });

    it('should permit admin tokens with 200 OK', async () => {
      const res = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('2. Platform Overview (GET /api/admin/overview)', () => {
    it('should return accurate metrics across all collections', async () => {
      // Create pending provider profile
      const applicantUser = await new User({
        name: 'Applicant Suresh',
        email: 'suresh@example.com',
        passwordHash: 'dummy',
        role: 'customer',
      }).save();

      await new ProviderProfile({
        userId: applicantUser._id,
        displayName: 'Suresh Plumbing',
        phone: '+91 9988776655',
        serviceArea: 'North Chennai',
        skills: ['Plumbing'],
        verificationStatus: 'pending',
      }).save();

      // Create a published review
      await new Review({
        bookingId: testBooking._id,
        customerId: customerUser._id,
        providerId: providerProfile._id,
        serviceId: testService._id,
        rating: 5,
        comment: 'Superb quality roof repair!',
        isPublished: true,
      }).save();

      // Create an audit log
      await new AuditLog({
        adminId: adminUser._id,
        action: 'PROVIDER_APPLICATION_APPROVED',
        targetId: providerProfile._id,
        targetType: 'ProviderProfile',
        details: { note: 'Initial setup' },
      }).save();

      const res = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      expect(data.stats.totalCustomers).toBe(2); // customerUser + applicantUser
      expect(data.stats.totalProviders).toBe(1); // providerProfile (approved)
      expect(data.stats.pendingApplications).toBe(1);
      expect(data.stats.activeServices).toBe(1);
      expect(data.stats.totalBookings).toBe(1);
      expect(data.stats.bookingsByStatus.completed).toBe(1);
      expect(data.stats.bookingsByStatus.requested).toBe(0);
      expect(data.stats.totalReviews).toBe(1);

      expect(data.recentActivity).toHaveLength(1);
      expect(data.recentActivity[0].action).toBe('PROVIDER_APPLICATION_APPROVED');
      expect(data.recentActivity[0].adminName).toBe('System Admin');
    });
  });

  describe('3. Booking Oversight (GET /api/admin/bookings)', () => {
    it('should list bookings with pagination and populated fields', async () => {
      const res = await request(app)
        .get('/api/admin/bookings?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bookings).toHaveLength(1);

      const item = res.body.data.bookings[0];
      expect(item.id).toBe(testBooking._id.toString());
      expect(item.serviceName).toBe('Terrace Waterproofing');
      expect(item.customerName).toBe('Customer Pooja');
      expect(item.customerEmail).toBe('pooja@example.com');
      expect(item.providerDisplayName).toBe('Karthik Roofing Solutions');
      expect(item.status).toBe('completed');
    });

    it('should filter bookings by status', async () => {
      const resMatch = await request(app)
        .get('/api/admin/bookings?status=completed')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resMatch.body.data.bookings).toHaveLength(1);

      const resNoMatch = await request(app)
        .get('/api/admin/bookings?status=requested')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resNoMatch.body.data.bookings).toHaveLength(0);
    });

    it('should reject invalid status filter with 400', async () => {
      const res = await request(app)
        .get('/api/admin/bookings?status=invalid_status')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid status filter/i);
    });

    it('should retrieve single booking details with full history', async () => {
      const res = await request(app)
        .get(`/api/admin/bookings/${testBooking._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(testBooking._id.toString());
      expect(res.body.data.statusHistory).toHaveLength(3);
      expect(res.body.data.address.street).toBe('12 Marina Beach Road');
    });

    it('should return 404 for non-existent booking ID', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const res = await request(app)
        .get(`/api/admin/bookings/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('4. Review Moderation & Concurrency-Safe Aggregate Engine', () => {
    let review1: any;
    let review2: any;

    beforeEach(async () => {
      // Create a second booking
      const booking2 = await new Booking({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(),
        scheduledEndTime: new Date(),
        address: { street: '45 Road', city: 'Chennai' },
        status: 'completed',
        statusHistory: [],
      }).save();

      review1 = await new Review({
        bookingId: testBooking._id,
        customerId: customerUser._id,
        providerId: providerProfile._id,
        serviceId: testService._id,
        rating: 5,
        comment: 'Outstanding waterproofing service!',
        isPublished: true,
      }).save();

      review2 = await new Review({
        bookingId: booking2._id,
        customerId: customerUser._id,
        providerId: providerProfile._id,
        serviceId: testService._id,
        rating: 3,
        comment: 'Spam comment with abusive words!',
        isPublished: true,
      }).save();

      await recalculateProviderRating(providerProfile._id);

      const profile = await ProviderProfile.findById(providerProfile._id);
      expect(profile!.reviewCount).toBe(2);
      expect(profile!.ratingAverage).toBe(4); // (5+3)/2 = 4.0
    });

    it('should list reviews with publication filters', async () => {
      const res = await request(app)
        .get('/api/admin/reviews?isPublished=true')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.reviews).toHaveLength(2);
    });

    it('should require a reason when hiding a review', async () => {
      const res = await request(app)
        .patch(`/api/admin/reviews/${review2._id}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isPublished: false }); // Missing reason

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/moderation reason between 5 and 500 characters is required/i);
    });

    it('should hide review, recalculate provider aggregate, and create audit log', async () => {
      const res = await request(app)
        .patch(`/api/admin/reviews/${review2._id}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isPublished: false,
          moderationReason: 'Contains offensive language and violates community guidelines',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.review.isPublished).toBe(false);
      expect(res.body.data.review.moderationReason).toBe(
        'Contains offensive language and violates community guidelines'
      );

      // Verify ProviderProfile recalculated
      const updatedProfile = await ProviderProfile.findById(providerProfile._id);
      expect(updatedProfile!.reviewCount).toBe(1);
      expect(updatedProfile!.ratingAverage).toBe(5); // Only review1 remains published

      // Verify AuditLog
      const auditEntry = await AuditLog.findOne({
        action: 'REVIEW_MODERATED',
        targetId: review2._id,
      });
      expect(auditEntry).not.toBeNull();
      expect(auditEntry!.details!.newStatus).toBe('hidden');
      expect(auditEntry!.details!.reason).toBe(
        'Contains offensive language and violates community guidelines'
      );
    });

    it('should accurately handle hiding the only published review (count -> 0, avg -> 0)', async () => {
      // Hide review2 first
      await request(app)
        .patch(`/api/admin/reviews/${review2._id}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isPublished: false, moderationReason: 'Inappropriate content' });

      // Now hide review1 (the only remaining published review)
      const res = await request(app)
        .patch(`/api/admin/reviews/${review1._id}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isPublished: false, moderationReason: 'Hidden per request' });

      expect(res.status).toBe(200);

      const profile = await ProviderProfile.findById(providerProfile._id);
      expect(profile!.reviewCount).toBe(0);
      expect(profile!.ratingAverage).toBe(0);
    });

    it('should restore a hidden review and recalculate provider aggregate', async () => {
      // First hide review2
      await request(app)
        .patch(`/api/admin/reviews/${review2._id}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isPublished: false, moderationReason: 'Temporary review' });

      // Now restore review2
      const res = await request(app)
        .patch(`/api/admin/reviews/${review2._id}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isPublished: true });

      expect(res.status).toBe(200);
      expect(res.body.data.review.isPublished).toBe(true);

      const profile = await ProviderProfile.findById(providerProfile._id);
      expect(profile!.reviewCount).toBe(2);
      expect(profile!.ratingAverage).toBe(4);
    });

    it('should handle repeated moderation with same state idempotently (no recalculation)', async () => {
      const res = await request(app)
        .patch(`/api/admin/reviews/${review1._id}/moderate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isPublished: true }); // Already published

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/already published/i);

      // Verify no duplicate audit log created
      const auditCount = await AuditLog.countDocuments({ targetId: review1._id });
      expect(auditCount).toBe(0);
    });

    it('should preserve aggregate consistency across simultaneous concurrent review operations', async () => {
      // Concurrently run 5 operations on the same provider
      const operations = [
        recalculateProviderRating(providerProfile._id),
        recalculateProviderRating(providerProfile._id),
        recalculateProviderRating(providerProfile._id),
        recalculateProviderRating(providerProfile._id),
        recalculateProviderRating(providerProfile._id),
      ];

      const results = await Promise.all(operations);
      for (const res of results) {
        expect(res.reviewCount).toBe(2);
        expect(res.ratingAverage).toBe(4);
      }

      const finalProfile = await ProviderProfile.findById(providerProfile._id);
      expect(finalProfile!.reviewCount).toBe(2);
      expect(finalProfile!.ratingAverage).toBe(4);
    });
  });

  describe('5. Catalog Mutation Audit Logging', () => {
    it('should record audit log when category is created', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Gardening & Lawn',
          slug: 'gardening-lawn',
          rooms: ['garden'],
        });

      expect(res.status).toBe(201);
      const categoryId = res.body.data.id;

      const log = await AuditLog.findOne({
        action: 'CATEGORY_CREATED',
        targetId: categoryId,
      });
      expect(log).not.toBeNull();
      expect(log!.details!.name).toBe('Gardening & Lawn');
    });

    it('should record audit log when category status is changed', async () => {
      const res = await request(app)
        .patch(`/api/admin/catalog/categories/${testCategory._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(200);

      const log = await AuditLog.findOne({
        action: 'CATEGORY_STATUS_CHANGED',
        targetId: testCategory._id,
      });
      expect(log).not.toBeNull();
      expect(log!.details!.isActive).toBe(false);
    });

    it('should record audit log when service is created', async () => {
      const res = await request(app)
        .post('/api/admin/catalog/services')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          categoryId: testCategory._id.toString(),
          name: 'Chimney Flashing Fix',
          slug: 'chimney-flashing-fix',
        });

      expect(res.status).toBe(201);
      const serviceId = res.body.data.id;

      const log = await AuditLog.findOne({
        action: 'SERVICE_CREATED',
        targetId: serviceId,
      });
      expect(log).not.toBeNull();
      expect(log!.details!.name).toBe('Chimney Flashing Fix');
    });
  });

  describe('6. Platform Audit Log Viewer (GET /api/admin/audit-logs)', () => {
    beforeEach(async () => {
      await new AuditLog({
        adminId: adminUser._id,
        action: 'PROVIDER_APPLICATION_APPROVED',
        targetId: providerProfile._id,
        targetType: 'ProviderProfile',
        details: { applicantName: 'Karthik' },
      }).save();

      await new AuditLog({
        adminId: adminUser._id,
        action: 'REVIEW_MODERATED',
        targetId: testBooking._id,
        targetType: 'Review',
        details: { reason: 'Policy check' },
      }).save();
    });

    it('should list audit logs sorted newest first with populated admin details', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.auditLogs).toHaveLength(2);

      const first = res.body.data.auditLogs[0];
      expect(first.action).toBe('REVIEW_MODERATED');
      expect(first.adminName).toBe('System Admin');
      expect(first.adminEmail).toBe('admin@dwellio.local');
    });

    it('should filter audit logs by action', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs?action=PROVIDER_APPLICATION_APPROVED')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.auditLogs).toHaveLength(1);
      expect(res.body.data.auditLogs[0].action).toBe('PROVIDER_APPLICATION_APPROVED');
    });

    it('should reject invalid action filter with 400', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs?action=HACK_SYSTEM')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid action filter/i);
    });
  });
});
