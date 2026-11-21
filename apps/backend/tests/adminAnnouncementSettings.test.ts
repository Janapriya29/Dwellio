import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { Announcement } from '../src/models/Announcement';
import { PlatformSetting } from '../src/models/PlatformSetting';
import { Notification } from '../src/models/Notification';
import { AuditLog } from '../src/models/AuditLog';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { generateToken } from '../src/utils/auth';
import { deliverAnnouncementBatched } from '../src/controllers/adminAnnouncement';
import * as notifUtils from '../src/utils/notification';

describe('Phase 3 Milestone 3E: Announcements & Platform Settings Tests', () => {
  const app = createApp();

  let adminUser: any;
  let adminToken: string;
  let customerUser: any;
  let customerToken: string;
  let providerUser: any;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_admin_announcements_settings');
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    adminUser = await User.create({
      name: 'System Admin',
      email: 'admin@dwellio.com',
      passwordHash: 'hashed_pw',
      role: 'admin',
    });
    adminToken = generateToken({ userId: adminUser._id.toString(), role: 'admin' });

    customerUser = await User.create({
      name: 'Preeti Customer',
      email: 'preeti@example.com',
      passwordHash: 'hashed_pw',
      role: 'customer',
      isActive: true,
    });
    customerToken = generateToken({ userId: customerUser._id.toString(), role: 'customer' });

    providerUser = await User.create({
      name: 'Arun Tradesman',
      email: 'arun@example.com',
      passwordHash: 'hashed_pw',
      role: 'provider',
      isActive: true,
    });
  });

  it('broadcasts announcements to targeted audience and persists notifications', async () => {
    const res = await request(app)
      .post('/api/admin/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Platform Maintenance Notice',
        message: 'System upgrade will be performed tonight from 2 AM to 3 AM IST.',
        audience: 'all',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Platform Maintenance Notice');
    expect(res.body.data.recipientCount).toBeGreaterThanOrEqual(2);

    // Verify AuditLog
    const log = await AuditLog.findOne({ action: 'ANNOUNCEMENT_BROADCAST' });
    expect(log).toBeDefined();

    // Verify Announcement model in DB
    const savedAnnouncement = await Announcement.findById(res.body.data.id);
    expect(savedAnnouncement).toBeDefined();

    // Verify history listing
    const listRes = await request(app)
      .get('/api/admin/announcements')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.announcements.length).toBe(1);
  });

  it('rejects invalid announcement payloads (missing or short text)', async () => {
    const res = await request(app)
      .post('/api/admin/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Hi',
        message: 'No',
        audience: 'all',
      });

    expect(res.status).toBe(400);
  });

  it('retrieves and updates platform settings with audit log', async () => {
    // 1. Get settings defaults
    const getRes = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.platformCommissionPercent).toBe(15);
    expect(getRes.body.data.supportEmail).toBe('support@dwellio.com');

    // 2. Update settings
    const updateRes = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        platformCommissionPercent: 12,
        supportEmail: 'care@dwellio.com',
        supportPhone: '+91 98400 99999',
        emergencyMaintenanceNotice: {
          enabled: true,
          message: 'Dwellio is scheduled for brief maintenance tonight.',
        },
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.platformCommissionPercent).toBe(12);
    expect(updateRes.body.data.supportEmail).toBe('care@dwellio.com');
    expect(updateRes.body.data.emergencyMaintenanceNotice.enabled).toBe(true);

    // Verify AuditLog
    const log = await AuditLog.findOne({ action: 'PLATFORM_SETTINGS_UPDATED' });
    expect(log).toBeDefined();
    expect(log?.details?.previousCommission).toBe(15);
    expect(log?.details?.newCommission).toBe(12);
  });

  it('rejects settings updates with invalid commission percentage (> 50%) or malformed email', async () => {
    const invalidComm = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        platformCommissionPercent: 75,
      });
    expect(invalidComm.status).toBe(400);

    const invalidEmail = await request(app)
      .put('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supportEmail: 'not-an-email',
      });
    expect(invalidEmail.status).toBe(400);
  });

  it('handles bounded batch delivery, tracks progress, and marks deliveryStatus as delivered', async () => {
    const totalActiveUsers = await User.countDocuments({ isActive: true });
    const announcement = await Announcement.create({
      title: 'Monsoon Safety Advisory',
      message: 'Please take precaution with electrical appliances during heavy rains.',
      audience: 'all',
      createdByAdminId: adminUser._id,
      recipientCount: totalActiveUsers,
      deliveredCount: 0,
      failedCount: 0,
      deliveryStatus: 'pending',
    });

    // Run batched delivery
    await deliverAnnouncementBatched(announcement._id, 1);

    const refreshed = await Announcement.findById(announcement._id);
    expect(refreshed?.deliveryStatus).toBe('delivered');
    expect(refreshed?.deliveredCount).toBe(totalActiveUsers);
    expect(refreshed?.failedCount).toBe(0);
    expect(refreshed?.deliveredUserIds.length).toBe(totalActiveUsers);

    // Verify notifications created in MongoDB
    const notifs = await Notification.find({ type: 'SYSTEM_ANNOUNCEMENT' });
    expect(notifs.length).toBeGreaterThanOrEqual(totalActiveUsers);
  });

  it('handles partial delivery failure, marks status as partially_failed, and supports reliable retry without duplicate notifications', async () => {
    const totalActiveUsers = await User.countDocuments({ isActive: true });
    // Create an announcement
    const announcement = await Announcement.create({
      title: 'Water Supply Maintenance',
      message: 'Maintenance work in progress across North Zone.',
      audience: 'all',
      createdByAdminId: adminUser._id,
      recipientCount: totalActiveUsers,
      deliveredCount: 0,
      failedCount: 0,
      deliveryStatus: 'pending',
    });

    // Simulate failure for providerUser delivery
    const originalSend = notifUtils.sendInAppNotification;
    const sendSpy = vi.spyOn(notifUtils, 'sendInAppNotification').mockImplementation(async (payload) => {
      if (payload.recipientId.toString() === providerUser._id.toString()) {
        throw new Error('Simulated transient push transport error');
      }
      return originalSend(payload);
    });

    // Run delivery batch
    await deliverAnnouncementBatched(announcement._id, 1);

    const partiallyDelivered = await Announcement.findById(announcement._id);
    expect(partiallyDelivered?.deliveryStatus).toBe('partially_failed');
    expect(partiallyDelivered?.deliveredCount).toBe(totalActiveUsers - 1);
    expect(partiallyDelivered?.failedCount).toBe(1);
    expect(partiallyDelivered?.deliveredUserIds).toContainEqual(customerUser._id);
    expect(partiallyDelivered?.deliveredUserIds).not.toContainEqual(providerUser._id);

    // Restore spy so retry succeeds
    sendSpy.mockRestore();

    // Trigger retry endpoint
    const retryRes = await request(app)
      .post(`/api/admin/announcements/${announcement._id}/retry`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(retryRes.status).toBe(200);
    expect(retryRes.body.success).toBe(true);

    // Wait for the background retry delivery to finish
    await new Promise((resolve) => setTimeout(resolve, 50));
    let fullyDelivered = await Announcement.findById(announcement._id);
    if (fullyDelivered?.deliveryStatus === 'processing') {
      await deliverAnnouncementBatched(announcement._id, 1);
      fullyDelivered = await Announcement.findById(announcement._id);
    }

    expect(fullyDelivered?.deliveryStatus).toBe('delivered');
    expect(fullyDelivered?.deliveredCount).toBe(totalActiveUsers);
    expect(fullyDelivered?.failedCount).toBe(0);
    expect(fullyDelivered?.deliveredUserIds.length).toBe(totalActiveUsers);

    // Verify deduplication: customerUser MUST have received exactly ONE notification despite the retry
    const customerNotifs = await Notification.find({
      recipientId: customerUser._id,
      type: 'SYSTEM_ANNOUNCEMENT',
      dedupKey: `announcement:${announcement._id}:${customerUser._id}`,
    });
    expect(customerNotifs.length).toBe(1);
  });

  it('delivers large recipient batches across multiple chunks idempotently', async () => {
    // Seed 15 extra customers
    const extraUsers = [];
    for (let i = 0; i < 15; i++) {
      extraUsers.push({
        name: `Batch User ${i}`,
        email: `batchuser${i}_${Date.now()}@example.com`,
        passwordHash: 'hashed_pw',
        role: 'customer',
        isActive: true,
      });
    }
    await User.insertMany(extraUsers);

    const totalActiveCustomers = await User.countDocuments({ role: 'customer', isActive: true });

    const announcement = await Announcement.create({
      title: 'Mass Announcement Test',
      message: 'Testing batched delivery chunking with small batch sizes.',
      audience: 'customers',
      createdByAdminId: adminUser._id,
      recipientCount: totalActiveCustomers,
      deliveredCount: 0,
      failedCount: 0,
      deliveryStatus: 'pending',
    });

    // Run with batchSize = 5 (forces multiple batches with yields)
    await deliverAnnouncementBatched(announcement._id, 5);

    const delivered = await Announcement.findById(announcement._id);
    expect(delivered?.deliveryStatus).toBe('delivered');
    expect(delivered?.deliveredCount).toBe(totalActiveCustomers);
    expect(delivered?.deliveredUserIds.length).toBe(totalActiveCustomers);
  });

  it('rejects retry on already fully delivered announcements with HTTP 400', async () => {
    const announcement = await Announcement.create({
      title: 'Fully Delivered Announcement',
      message: 'No further delivery required.',
      audience: 'all',
      createdByAdminId: adminUser._id,
      recipientCount: 2,
      deliveredCount: 2,
      failedCount: 0,
      deliveryStatus: 'delivered',
    });

    const res = await request(app)
      .post(`/api/admin/announcements/${announcement._id}/retry`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('already been fully delivered');
  });
});
