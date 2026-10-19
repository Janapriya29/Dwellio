import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { Booking } from '../src/models/Booking';
import { Review } from '../src/models/Review';
import { Notification } from '../src/models/Notification';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { generateToken } from '../src/utils/auth';
import { sendInAppNotification } from '../src/utils/notification';

describe('Phase 9: In-App Notifications & Communication Integration Tests', () => {
  const app = createApp();

  let customerUser: any;
  let customerToken: string;
  let customerUser2: any;
  let customerToken2: string;
  let providerUser: any;
  let providerToken: string;
  let providerProfile: any;
  let adminUser: any;
  let adminToken: string;
  let testCategory: any;
  let testService: any;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_notifications');
    await User.syncIndexes();
    await ProviderProfile.syncIndexes();
    await Category.syncIndexes();
    await Service.syncIndexes();
    await Booking.syncIndexes();
    await Review.syncIndexes();
    await Notification.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // 1. Create Customer 1
    customerUser = await new User({
      name: 'Pooja Customer',
      email: 'pooja.cust@example.com',
      passwordHash: 'hashed_password_123',
      role: 'customer',
      isActive: true,
    }).save();
    customerToken = generateToken({ userId: customerUser._id.toString(), role: 'customer' });

    // 2. Create Customer 2 (for recipient isolation testing)
    customerUser2 = await new User({
      name: 'Rohan Customer',
      email: 'rohan.cust@example.com',
      passwordHash: 'hashed_password_123',
      role: 'customer',
      isActive: true,
    }).save();
    customerToken2 = generateToken({ userId: customerUser2._id.toString(), role: 'customer' });

    // 3. Create Provider User & Approved Profile
    providerUser = await new User({
      name: 'Karthik Provider',
      email: 'karthik.pro@example.com',
      passwordHash: 'hashed_password_123',
      role: 'provider',
      isActive: true,
    }).save();
    providerToken = generateToken({ userId: providerUser._id.toString(), role: 'provider' });

    // 4. Create Admin User
    adminUser = await new User({
      name: 'Dwellio Admin',
      email: 'admin@dwellio.local',
      passwordHash: 'hashed_password_123',
      role: 'admin',
      isActive: true,
    }).save();
    adminToken = generateToken({ userId: adminUser._id.toString(), role: 'admin' });

    // 5. Create Category & Service
    testCategory = await new Category({
      name: 'Electrical Repairs',
      slug: 'electrical-repairs',
      rooms: ['living', 'kitchen'],
      isActive: true,
    }).save();

    testService = await new Service({
      categoryId: testCategory._id,
      name: 'Switchboard Fixing',
      slug: 'switchboard-fixing',
      isActive: true,
    }).save();

    providerProfile = await new ProviderProfile({
      userId: providerUser._id,
      displayName: 'Karthik Electrical Works',
      phone: '9840122334',
      serviceArea: 'Central Metro',
      skills: ['Electrical Repairs', 'Switchboard Fixing'],
      categories: [testCategory._id],
      verificationStatus: 'approved',
      ratingAverage: 0,
      reviewCount: 0,
    }).save();
  });

  // ====================================================
  // 1. Authentication & Endpoint Protection
  // ====================================================
  describe('1. Authentication & Endpoint Protection', () => {
    it('should reject unauthenticated GET /api/notifications with 401', async () => {
      const res = await request(app).get('/api/notifications');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject unauthenticated GET /api/notifications/unread-count with 401', async () => {
      const res = await request(app).get('/api/notifications/unread-count');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject unauthenticated PATCH /api/notifications/:id/read with 401', async () => {
      const fakeId = new Types.ObjectId().toString();
      const res = await request(app).patch(`/api/notifications/${fakeId}/read`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject unauthenticated PATCH /api/notifications/read-all with 401', async () => {
      const res = await request(app).patch('/api/notifications/read-all');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ====================================================
  // 2. Recipient Isolation & Ownership Security
  // ====================================================
  describe('2. Recipient Isolation & Ownership Security', () => {
    it('should isolate notification listings strictly to authenticated user', async () => {
      // Create notification for Customer 1
      await new Notification({
        recipientId: customerUser._id,
        type: 'BOOKING_ACCEPTED',
        title: 'Booking Confirmed',
        message: 'Your booking has been accepted.',
        isRead: false,
      }).save();

      // Create notification for Customer 2
      await new Notification({
        recipientId: customerUser2._id,
        type: 'BOOKING_REJECTED',
        title: 'Booking Declined',
        message: 'Your booking has been declined.',
        isRead: false,
      }).save();

      // Customer 1 queries notifications
      const res1 = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res1.status).toBe(200);
      expect(res1.body.data).toHaveLength(1);
      expect(res1.body.data[0].title).toBe('Booking Confirmed');
      expect(res1.body.data[0].recipientId).toBe(customerUser._id.toString());

      // Customer 2 queries notifications
      const res2 = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${customerToken2}`);

      expect(res2.status).toBe(200);
      expect(res2.body.data).toHaveLength(1);
      expect(res2.body.data[0].title).toBe('Booking Declined');
      expect(res2.body.data[0].recipientId).toBe(customerUser2._id.toString());
    });

    it('should strictly isolate unread notification counts per recipient', async () => {
      // 2 unread for Customer 1
      await new Notification({
        recipientId: customerUser._id,
        type: 'BOOKING_ACCEPTED',
        title: 'Note 1',
        message: 'Message 1',
        isRead: false,
      }).save();
      await new Notification({
        recipientId: customerUser._id,
        type: 'BOOKING_ON_THE_WAY',
        title: 'Note 2',
        message: 'Message 2',
        isRead: false,
      }).save();

      // 1 unread for Customer 2
      await new Notification({
        recipientId: customerUser2._id,
        type: 'BOOKING_COMPLETED',
        title: 'Note 3',
        message: 'Message 3',
        isRead: false,
      }).save();

      const res1 = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res1.status).toBe(200);
      expect(res1.body.data.unreadCount).toBe(2);

      const res2 = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${customerToken2}`);
      expect(res2.status).toBe(200);
      expect(res2.body.data.unreadCount).toBe(1);
    });

    it('should return 404 and prohibit marking another user notification as read', async () => {
      // Notification belonging to Customer 1
      const noteCustomer1 = await new Notification({
        recipientId: customerUser._id,
        type: 'BOOKING_ACCEPTED',
        title: 'Customer 1 Note',
        message: 'Private message',
        isRead: false,
      }).save();

      // Customer 2 attempts to mark Customer 1's notification as read
      const res = await request(app)
        .patch(`/api/notifications/${noteCustomer1._id}/read`)
        .set('Authorization', `Bearer ${customerToken2}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Notification not found.');

      // Verify Customer 1's notification is still unread
      const unchanged = await Notification.findById(noteCustomer1._id);
      expect(unchanged?.isRead).toBe(false);
    });

    it('should only mark current user notifications on read-all', async () => {
      // 1 unread for Customer 1
      const note1 = await new Notification({
        recipientId: customerUser._id,
        type: 'BOOKING_ACCEPTED',
        title: 'Customer 1 Note',
        message: 'Message 1',
        isRead: false,
      }).save();

      // 1 unread for Customer 2
      const note2 = await new Notification({
        recipientId: customerUser2._id,
        type: 'BOOKING_ACCEPTED',
        title: 'Customer 2 Note',
        message: 'Message 2',
        isRead: false,
      }).save();

      // Customer 1 marks all as read
      const res = await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.markedCount).toBe(1);

      // Verify Customer 1 note is read, but Customer 2 note remains unread
      const checkNote1 = await Notification.findById(note1._id);
      const checkNote2 = await Notification.findById(note2._id);
      expect(checkNote1?.isRead).toBe(true);
      expect(checkNote2?.isRead).toBe(false);
    });
  });

  // ====================================================
  // 3. Pagination & Query Filtering
  // ====================================================
  describe('3. Pagination & Query Filtering', () => {
    it('should paginate results and respect unreadOnly filter', async () => {
      // Create 3 notifications for Customer 1 (2 unread, 1 read)
      await new Notification({
        recipientId: customerUser._id,
        type: 'BOOKING_ACCEPTED',
        title: 'Unread 1',
        message: 'Msg',
        isRead: false,
        createdAt: new Date('2026-10-19T10:00:00.000Z'),
      }).save();
      await new Notification({
        recipientId: customerUser._id,
        type: 'BOOKING_ON_THE_WAY',
        title: 'Read 1',
        message: 'Msg',
        isRead: true,
        readAt: new Date('2026-10-19T10:05:00.000Z'),
        createdAt: new Date('2026-10-19T10:02:00.000Z'),
      }).save();
      await new Notification({
        recipientId: customerUser._id,
        type: 'BOOKING_COMPLETED',
        title: 'Unread 2',
        message: 'Msg',
        isRead: false,
        createdAt: new Date('2026-10-19T10:10:00.000Z'),
      }).save();

      // Query page 1 with limit 2
      const resPage1 = await request(app)
        .get('/api/notifications?page=1&limit=2')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(resPage1.status).toBe(200);
      expect(resPage1.body.data).toHaveLength(2);
      expect(resPage1.body.pagination.total).toBe(3);
      expect(resPage1.body.pagination.totalPages).toBe(2);
      // Newest first
      expect(resPage1.body.data[0].title).toBe('Unread 2');

      // Query with unreadOnly=true
      const resUnread = await request(app)
        .get('/api/notifications?unreadOnly=true')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(resUnread.status).toBe(200);
      expect(resUnread.body.data).toHaveLength(2);
      expect(resUnread.body.data.every((n: any) => n.isRead === false)).toBe(true);
    });

    it('should cap limit at 50 if higher limit requested', async () => {
      const res = await request(app)
        .get('/api/notifications?limit=100')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(50);
    });
  });

  // ====================================================
  // 4. Mark-as-Read Idempotency & ReadAt Preservation
  // ====================================================
  describe('4. Mark-as-Read Idempotency & ReadAt Preservation', () => {
    it('should mark unread notification as read and set readAt', async () => {
      const note = await new Notification({
        recipientId: customerUser._id,
        type: 'BOOKING_ACCEPTED',
        title: 'Unread Notification',
        message: 'Details',
        isRead: false,
      }).save();

      const res = await request(app)
        .patch(`/api/notifications/${note._id}/read`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isRead).toBe(true);
      expect(res.body.data.readAt).toBeDefined();

      const updated = await Notification.findById(note._id);
      expect(updated?.isRead).toBe(true);
      expect(updated?.readAt).toBeDefined();
    });

    it('should be idempotent and preserve original readAt when marked as read again', async () => {
      const originalReadAt = new Date('2026-10-19T08:00:00.000Z');
      const note = await new Notification({
        recipientId: customerUser._id,
        type: 'BOOKING_ACCEPTED',
        title: 'Already Read Notification',
        message: 'Details',
        isRead: true,
        readAt: originalReadAt,
      }).save();

      const res = await request(app)
        .patch(`/api/notifications/${note._id}/read`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isRead).toBe(true);
      // Original readAt timestamp must be strictly preserved
      expect(new Date(res.body.data.readAt).toISOString()).toBe(originalReadAt.toISOString());

      const check = await Notification.findById(note._id);
      expect(check?.readAt?.toISOString()).toBe(originalReadAt.toISOString());
    });

    it('should return 400 for malformed notification ID', async () => {
      const res = await request(app)
        .patch('/api/notifications/invalid-id-123/read')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid notification ID format');
    });
  });

  // ====================================================
  // 5. Booking Lifecycle Triggers
  // ====================================================
  describe('5. Booking Lifecycle Triggers', () => {
    it('should notify provider on customer booking creation (BOOKING_REQUESTED)', async () => {
      const scheduledStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const scheduledEnd = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId: testService._id.toString(),
          providerId: providerProfile._id.toString(),
          scheduledStartTime: scheduledStart,
          scheduledEndTime: scheduledEnd,
          address: { street: '12 Palm Grove', city: 'Metro' },
          customerNotes: 'Please ring the doorbell',
        });

      expect(res.status).toBe(201);
      const bookingId = res.body.data.id;

      // Verify provider received BOOKING_REQUESTED notification
      const notification = await Notification.findOne({
        recipientId: providerUser._id,
        type: 'BOOKING_REQUESTED',
        bookingId,
      });

      expect(notification).not.toBeNull();
      expect(notification?.title).toBe('New Booking Request');
      expect(notification?.message).toContain('Pooja Customer');
      expect(notification?.message).toContain('Switchboard Fixing');
      expect(notification?.isRead).toBe(false);
    });

    it('should notify customer on provider acceptance (BOOKING_ACCEPTED)', async () => {
      // 1. Create booking
      const booking = await new Booking({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        scheduledEndTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
        address: { street: '12 Palm Grove', city: 'Metro' },
        status: 'requested',
      }).save();

      // 2. Provider accepts booking
      const res = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/accept`)
        .set('Authorization', `Bearer ${providerToken}`);

      expect(res.status).toBe(200);

      // Verify customer received BOOKING_ACCEPTED notification
      const notification = await Notification.findOne({
        recipientId: customerUser._id,
        type: 'BOOKING_ACCEPTED',
        bookingId: booking._id,
      });

      expect(notification).not.toBeNull();
      expect(notification?.title).toBe('Booking Confirmed');
      expect(notification?.message).toContain('Karthik Electrical Works');
    });

    it('should notify customer on provider decline (BOOKING_REJECTED)', async () => {
      const booking = await new Booking({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        scheduledEndTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
        address: { street: '12 Palm Grove', city: 'Metro' },
        status: 'requested',
      }).save();

      const res = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/reject`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ reason: 'Outside operating hours' });

      expect(res.status).toBe(200);

      const notification = await Notification.findOne({
        recipientId: customerUser._id,
        type: 'BOOKING_REJECTED',
        bookingId: booking._id,
      });

      expect(notification).not.toBeNull();
      expect(notification?.title).toBe('Booking Declined');
      expect(notification?.message).toContain('Outside operating hours');
    });

    it('should notify customer on provider status updates: on_the_way, in_progress, completed', async () => {
      // Accepted booking
      const booking = await new Booking({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        scheduledEndTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
        address: { street: '12 Palm Grove', city: 'Metro' },
        status: 'accepted',
      }).save();

      // 1. Move to on_the_way
      const res1 = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'on_the_way' });
      expect(res1.status).toBe(200);

      const noteOnTheWay = await Notification.findOne({
        recipientId: customerUser._id,
        type: 'BOOKING_ON_THE_WAY',
        bookingId: booking._id,
      });
      expect(noteOnTheWay).not.toBeNull();
      expect(noteOnTheWay?.title).toBe('Provider On The Way');

      // 2. Move to in_progress
      const res2 = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'in_progress' });
      expect(res2.status).toBe(200);

      const noteInProgress = await Notification.findOne({
        recipientId: customerUser._id,
        type: 'BOOKING_IN_PROGRESS',
        bookingId: booking._id,
      });
      expect(noteInProgress).not.toBeNull();
      expect(noteInProgress?.title).toBe('Service In Progress');

      // 3. Move to completed
      const res3 = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'completed' });
      expect(res3.status).toBe(200);

      const noteCompleted = await Notification.findOne({
        recipientId: customerUser._id,
        type: 'BOOKING_COMPLETED',
        bookingId: booking._id,
      });
      expect(noteCompleted).not.toBeNull();
      expect(noteCompleted?.title).toBe('Service Completed');
    });

    it('should notify provider when customer cancels booking', async () => {
      const booking = await new Booking({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        scheduledEndTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
        address: { street: '12 Palm Grove', city: 'Metro' },
        status: 'requested',
      }).save();

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reason: 'Plans changed' });

      expect(res.status).toBe(200);

      const notification = await Notification.findOne({
        recipientId: providerUser._id,
        type: 'BOOKING_CANCELLED',
        bookingId: booking._id,
      });

      expect(notification).not.toBeNull();
      expect(notification?.title).toBe('Booking Cancelled by Customer');
      expect(notification?.message).toContain('Plans changed');
    });

    it('should notify customer when provider cancels an accepted booking', async () => {
      const booking = await new Booking({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        scheduledEndTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
        address: { street: '12 Palm Grove', city: 'Metro' },
        status: 'accepted',
      }).save();

      const res = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'cancelled', reason: 'Equipment breakdown' });

      expect(res.status).toBe(200);

      const notification = await Notification.findOne({
        recipientId: customerUser._id,
        type: 'BOOKING_CANCELLED',
        bookingId: booking._id,
      });

      expect(notification).not.toBeNull();
      expect(notification?.title).toBe('Booking Cancelled by Provider');
      expect(notification?.message).toContain('Equipment breakdown');
    });
  });

  // ====================================================
  // 6. Review & Provider Application Triggers
  // ====================================================
  describe('6. Review & Provider Application Triggers', () => {
    it('should notify provider on new verified review submission (REVIEW_RECEIVED)', async () => {
      const booking = await new Booking({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() - 48 * 60 * 60 * 1000),
        scheduledEndTime: new Date(Date.now() - 46 * 60 * 60 * 1000),
        address: { street: '12 Palm Grove', city: 'Metro' },
        status: 'completed',
      }).save();

      const res = await request(app)
        .post(`/api/bookings/${booking._id}/reviews`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ rating: 5, comment: 'Excellent electrical service!' });

      expect(res.status).toBe(201);

      const notification = await Notification.findOne({
        recipientId: providerUser._id,
        type: 'REVIEW_RECEIVED',
        bookingId: booking._id,
      });

      expect(notification).not.toBeNull();
      expect(notification?.title).toBe('New Review Received');
      expect(notification?.message).toContain('5-star review');
    });

    it('should notify customer on provider review reply (REVIEW_REPLIED)', async () => {
      const booking = await new Booking({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() - 48 * 60 * 60 * 1000),
        scheduledEndTime: new Date(Date.now() - 46 * 60 * 60 * 1000),
        address: { street: '12 Palm Grove', city: 'Metro' },
        status: 'completed',
      }).save();

      const review = await new Review({
        bookingId: booking._id,
        customerId: customerUser._id,
        providerId: providerProfile._id,
        serviceId: testService._id,
        rating: 5,
        comment: 'Great work!',
        isPublished: true,
      }).save();

      const res = await request(app)
        .patch(`/api/reviews/${review._id}/reply`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ replyText: 'Thank you for choosing our service!' });

      expect(res.status).toBe(200);

      const notification = await Notification.findOne({
        recipientId: customerUser._id,
        type: 'REVIEW_REPLIED',
        bookingId: booking._id,
      });

      expect(notification).not.toBeNull();
      expect(notification?.title).toBe('Provider Replied to Your Review');
      expect(notification?.message).toContain('Thank you for choosing our service!');
    });

    it('should notify applicant when admin approves application (APPLICATION_APPROVED)', async () => {
      // Pending application
      const applicantUser = await new User({
        name: 'Suresh Electric',
        email: 'suresh@example.com',
        passwordHash: 'hash',
        role: 'customer',
        isActive: true,
      }).save();

      const pendingProfile = await new ProviderProfile({
        userId: applicantUser._id,
        displayName: 'Suresh Electrical Works',
        phone: '9840111222',
        serviceArea: 'East Metro',
        skills: ['Electrical'],
        verificationStatus: 'pending',
      }).save();

      const res = await request(app)
        .patch(`/api/admin/providers/applications/${pendingProfile._id}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      const notification = await Notification.findOne({
        recipientId: applicantUser._id,
        type: 'APPLICATION_APPROVED',
      });

      expect(notification).not.toBeNull();
      expect(notification?.title).toBe('Provider Application Approved');
      expect(notification?.message).toContain('Congratulations');
    });

    it('should notify applicant with reason when admin rejects application (APPLICATION_REJECTED)', async () => {
      const applicantUser = await new User({
        name: 'Dinesh Applicant',
        email: 'dinesh@example.com',
        passwordHash: 'hash',
        role: 'customer',
        isActive: true,
      }).save();

      const pendingProfile = await new ProviderProfile({
        userId: applicantUser._id,
        displayName: 'Dinesh Services',
        phone: '9840333444',
        serviceArea: 'West Metro',
        skills: ['Plumbing'],
        verificationStatus: 'pending',
      }).save();

      const res = await request(app)
        .patch(`/api/admin/providers/applications/${pendingProfile._id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Documentation incomplete and unreadable.' });

      expect(res.status).toBe(200);

      const notification = await Notification.findOne({
        recipientId: applicantUser._id,
        type: 'APPLICATION_REJECTED',
      });

      expect(notification).not.toBeNull();
      expect(notification?.title).toBe('Provider Application Update');
      expect(notification?.message).toContain('Documentation incomplete');
    });
  });

  // ====================================================
  // 7. Non-Blocking Delivery & Deduplication
  // ====================================================
  describe('7. Non-Blocking Delivery & Deduplication', () => {
    it('should handle duplicate dedupKey as idempotent delivery without throwing', async () => {
      const dedupKey = `test:dedup:${new Types.ObjectId()}`;

      // First delivery succeeds
      const first = await sendInAppNotification({
        recipientId: customerUser._id,
        type: 'BOOKING_ACCEPTED',
        title: 'First Delivery',
        message: 'Message 1',
        dedupKey,
      });
      expect(first).not.toBeNull();

      // Duplicate delivery with same dedupKey is caught and returns null without throwing
      const duplicate = await sendInAppNotification({
        recipientId: customerUser._id,
        type: 'BOOKING_ACCEPTED',
        title: 'Duplicate Delivery',
        message: 'Message 2',
        dedupKey,
      });
      expect(duplicate).toBeNull();

      // Only 1 document exists in database
      const count = await Notification.countDocuments({ dedupKey });
      expect(count).toBe(1);
    });

    it('should not allow notification insertion errors to roll back business operations', async () => {
      // Mock Notification.prototype.save to reject once
      const saveSpy = vi.spyOn(Notification.prototype, 'save').mockRejectedValueOnce(new Error('Simulated DB Glitch'));

      const booking = await new Booking({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        scheduledEndTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
        address: { street: '12 Palm Grove', city: 'Metro' },
        status: 'requested',
      }).save();

      // Provider accepts booking - must still succeed despite notification delivery error!
      const res = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/accept`)
        .set('Authorization', `Bearer ${providerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify booking state in DB actually changed to 'accepted'
      const checkBooking = await Booking.findById(booking._id);
      expect(checkBooking?.status).toBe('accepted');

      saveSpy.mockRestore();
    });

    it('should NOT create notifications for invalid or unauthorized booking requests', async () => {
      // Customer 2 attempts to cancel Customer 1's booking (unauthorized)
      const booking = await new Booking({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        scheduledEndTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
        address: { street: '12 Palm Grove', city: 'Metro' },
        status: 'requested',
      }).save();

      const initialCount = await Notification.countDocuments();

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${customerToken2}`);

      expect(res.status).toBe(403);

      const afterCount = await Notification.countDocuments();
      expect(afterCount).toBe(initialCount);
    });
  });
});
