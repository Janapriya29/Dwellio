import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { Booking } from '../src/models/Booking';
import { Conversation } from '../src/models/Conversation';
import { Announcement } from '../src/models/Announcement';
import { AuditLog } from '../src/models/AuditLog';
import { workerSupervisor } from '../src/workers/workerSupervisor';
import { financialBackgroundWorker } from '../src/services/financialBackgroundWorker';
import { queueService } from '../src/services/queueService';
import { generateToken } from '../src/utils/auth';

describe('Milestone 5D: Booking Lifecycle Automation & Admin Queue Monitoring Tests', () => {
  const app = createApp();

  let adminUser: any;
  let customerUser: any;
  let providerUser: any;
  let providerProfile: any;
  let testCategory: any;
  let testService: any;

  let adminToken: string;
  let customerToken: string;
  let providerToken: string;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_booking_lifecycle');
    await User.syncIndexes();
    await Booking.syncIndexes();
    await Conversation.syncIndexes();
    await AuditLog.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    const hash = await bcrypt.hash('password123', 8);

    // 1. Admin
    adminUser = await User.create({
      name: 'System Admin',
      email: 'admin.lifecycle@dwellio.com',
      passwordHash: hash,
      role: 'admin',
      isActive: true,
    });
    adminToken = generateToken({ userId: adminUser._id.toString(), role: 'admin' });

    // 2. Customer
    customerUser = await User.create({
      name: 'Rohan Customer',
      email: 'rohan.lifecycle@example.com',
      passwordHash: hash,
      role: 'customer',
      isActive: true,
    });
    customerToken = generateToken({ userId: customerUser._id.toString(), role: 'customer' });

    // 3. Provider
    providerUser = await User.create({
      name: 'Suresh Provider',
      email: 'suresh.lifecycle@example.com',
      passwordHash: hash,
      role: 'provider',
      isActive: true,
    });
    providerToken = generateToken({ userId: providerUser._id.toString(), role: 'provider' });

    providerProfile = await ProviderProfile.create({
      userId: providerUser._id,
      displayName: 'Suresh Plumbing Solutions',
      phone: '9876543211',
      serviceArea: 'Koramangala, Bangalore',
      skills: ['Pipe Fitting', 'Tap Repair'],
      verificationStatus: 'approved',
    });

    // 4. Category & Service
    testCategory = await Category.create({
      name: 'Plumbing Services',
      slug: 'plumbing-services',
      rooms: ['Bathroom', 'Kitchen'],
      isActive: true,
    });

    testService = await Service.create({
      categoryId: testCategory._id,
      name: 'Tap Leakage Repair',
      slug: 'tap-leakage-repair',
      basePrice: 299,
      isActive: true,
    });
  });

  describe('1. Unresponded Booking Request Expiry Automation', () => {
    it('automatically auto-rejects requested bookings older than 24 hours', async () => {
      // Create a stale booking created 25 hours ago
      const staleDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const staleBooking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 48 * 60 * 60 * 1000),
        scheduledEndTime: new Date(Date.now() + 50 * 60 * 60 * 1000),
        address: { street: '1st Block Koramangala', city: 'Bangalore' },
        status: 'requested',
        priceSnapshot: 299,
        paymentStatus: 'unpaid',
        createdAt: staleDate,
        updatedAt: staleDate,
      });

      // Execute worker unresponded sweep
      await workerSupervisor.expireUnrespondedBookings();

      const refreshed = await Booking.findById(staleBooking._id);
      expect(refreshed?.status).toBe('rejected');
      expect(refreshed?.rejectionReason).toContain('did not respond within 24 hours');

      // Verify statusHistory audit entry was recorded
      const historyEntry = refreshed?.statusHistory.find((h) => h.toStatus === 'rejected');
      expect(historyEntry).toBeDefined();
      expect(historyEntry?.actorRole).toBe('system');
    });

    it('does not expire fresh requested bookings within the 24-hour response window', async () => {
      // Fresh booking created just 2 hours ago
      const freshDate = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const freshBooking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        scheduledEndTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
        address: { street: '4th Block Koramangala', city: 'Bangalore' },
        status: 'requested',
        priceSnapshot: 299,
        paymentStatus: 'unpaid',
        createdAt: freshDate,
        updatedAt: freshDate,
      });

      await workerSupervisor.expireUnrespondedBookings();

      const refreshed = await Booking.findById(freshBooking._id);
      expect(refreshed?.status).toBe('requested');
    });
  });

  describe('2. Overdue Booking Detection Automation', () => {
    it('detects bookings in progress past scheduled completion window and creates audit log', async () => {
      // Overdue booking: scheduledEndTime was 12 hours ago
      const overdueBooking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() - 14 * 60 * 60 * 1000),
        scheduledEndTime: new Date(Date.now() - 12 * 60 * 60 * 1000),
        address: { street: '5th Block Koramangala', city: 'Bangalore' },
        status: 'in_progress',
        priceSnapshot: 299,
        paymentStatus: 'paid',
      });

      await workerSupervisor.detectOverdueBookings();

      const audit = await AuditLog.findOne({
        action: 'BOOKING_OVERDUE_ALERT',
        targetId: overdueBooking._id,
      });
      expect(audit).toBeDefined();
    });
  });

  describe('3. Conversation Auto-Locking Automation', () => {
    it('auto-locks active conversation for completed booking', async () => {
      const completedBooking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        scheduledStartTime: new Date(Date.now() - 50 * 60 * 60 * 1000),
        scheduledEndTime: new Date(Date.now() - 48 * 60 * 60 * 1000),
        address: { street: '6th Block Koramangala', city: 'Bangalore' },
        status: 'completed',
        priceSnapshot: 299,
        paymentStatus: 'paid',
      });

      const conv = await Conversation.create({
        bookingId: completedBooking._id,
        customerId: customerUser._id,
        providerId: providerUser._id,
        status: 'active',
      });

      await workerSupervisor.autoLockConversation(conv._id.toString(), completedBooking._id.toString());

      const refreshedConv = await Conversation.findById(conv._id);
      expect(refreshedConv?.status).toBe('locked');
    });
  });

  describe('4. Admin System Queues Health API (GET /api/admin/system/queues)', () => {
    it('allows platform administrators to view queue operational metrics', async () => {
      const res = await request(app)
        .get('/api/admin/system/queues')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.redisStatus).toBeDefined();
      expect(res.body.data.activeWorkers).toBe(1);
      expect(res.body.data.queues).toBeDefined();
      expect(res.body.data.queues['dwellio-notifications']).toBeDefined();
      expect(res.body.data.queues['dwellio-booking-lifecycle']).toBeDefined();
      expect(res.body.data.queues['dwellio-maintenance']).toBeDefined();
    });

    it('rejects non-admin customers with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/admin/system/queues')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
    });

    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/admin/system/queues');
      expect(res.status).toBe(401);
    });
  });

  describe('5. Financial Background Worker Process Isolation (Phase 5 Remediation)', () => {
    it('guarantees that API app creation does NOT start the legacy financial worker timer', () => {
      const newApp = createApp();
      expect(newApp).toBeDefined();
      // intervalTimer on financialBackgroundWorker must remain null in API process
      expect((financialBackgroundWorker as any).intervalTimer).toBeNull();
    });
  });

  describe('6. Conversation Locking on Cancellation & Rejection (Phase 5 Remediation)', () => {
    it('locks conversation when customer cancels a booking', async () => {
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        address: { street: '123 MG Road', city: 'Bangalore' },
        scheduledStartTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        scheduledEndTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
        status: 'requested',
        priceSnapshot: 299,
        paymentStatus: 'unpaid',
      });

      const conv = await Conversation.create({
        bookingId: booking._id,
        customerId: customerUser._id,
        providerId: providerUser._id,
        status: 'active',
      });

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reason: 'Plans changed' });

      expect(res.status).toBe(200);

      const refreshedConv = await Conversation.findById(conv._id);
      expect(refreshedConv?.status).toBe('locked');
      expect(refreshedConv?.lockReason).toContain('cancelled by customer');
    });

    it('locks conversation when provider declines a booking request', async () => {
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        address: { street: '123 MG Road', city: 'Bangalore' },
        scheduledStartTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        scheduledEndTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
        status: 'requested',
        priceSnapshot: 299,
        paymentStatus: 'unpaid',
      });

      const conv = await Conversation.create({
        bookingId: booking._id,
        customerId: customerUser._id,
        providerId: providerUser._id,
        status: 'active',
      });

      const res = await request(app)
        .patch(`/api/provider/bookings/${booking._id}/reject`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ reason: 'Fully booked' });

      expect(res.status).toBe(200);

      const refreshedConv = await Conversation.findById(conv._id);
      expect(refreshedConv?.status).toBe('locked');
      expect(refreshedConv?.lockReason).toContain('declined by service professional');
    });

    it('locks conversation when admin cancels a booking', async () => {
      const booking = await Booking.create({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: testService._id,
        categoryId: testCategory._id,
        address: { street: '123 MG Road', city: 'Bangalore' },
        scheduledStartTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        scheduledEndTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
        status: 'accepted',
        priceSnapshot: 299,
        paymentStatus: 'unpaid',
      });

      const conv = await Conversation.create({
        bookingId: booking._id,
        customerId: customerUser._id,
        providerId: providerUser._id,
        status: 'active',
      });

      const res = await request(app)
        .patch(`/api/admin/bookings/${booking._id}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Safety violation reported on premises' });

      expect(res.status).toBe(200);

      const refreshedConv = await Conversation.findById(conv._id);
      expect(refreshedConv?.status).toBe('locked');
      expect(refreshedConv?.lockReason).toContain('cancelled by administrator');
    });
  });

  describe('7. Announcement BullMQ Dispatch & Batch Processing (Phase 5 Remediation)', () => {
    it('enqueues announcement batches through BullMQ and processes them via worker', async () => {
      const queue = queueService.getNotificationsQueue();

      const res = await request(app)
        .post('/api/admin/announcements')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'System Modernization Scheduled',
          message: 'Maintenance window announced for platform optimization.',
          audience: 'all',
        });

      expect(res.status).toBe(201);
      const announcementId = res.body.data.id;

      // Verify that batch job was enqueued in BullMQ queue
      const job = await queue.getJob(`announcement_${announcementId}_batch_0`);
      expect(job).toBeDefined();
      expect(job?.data.announcementId).toBe(announcementId);
      expect(job?.data.title).toBe('System Modernization Scheduled');

      // Now execute batch job through workerSupervisor
      await workerSupervisor.processAnnouncementBatchJob(job!.data);

      const updated = await Announcement.findById(announcementId);
      expect(updated?.deliveryStatus).toBe('delivered');
      expect(updated?.deliveredCount).toBeGreaterThanOrEqual(2);
      expect(updated?.deliveredUserIds.length).toBeGreaterThanOrEqual(2);
    });
  });
});
