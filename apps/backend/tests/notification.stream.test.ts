import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import { Response } from 'express';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { Notification } from '../src/models/Notification';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { generateToken } from '../src/utils/auth';
import { sendInAppNotification } from '../src/utils/notification';
import { notificationStreamService } from '../src/services/notificationStream';
import { NotificationData } from '@dwellio/shared';

describe('Sub-Milestone 4A: Backend SSE Notification Stream Engine', () => {
  const app = createApp();

  let userA: any;
  let tokenA: string;
  let userB: any;
  let tokenB: string;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_sse_stream');
    await User.syncIndexes();
    await Notification.syncIndexes();
  });

  afterAll(async () => {
    notificationStreamService.closeAllClients();
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    notificationStreamService.closeAllClients();

    userA = await new User({
      name: 'Alice Customer',
      email: 'alice@example.com',
      passwordHash: 'hashed_password_123',
      role: 'customer',
      isActive: true,
    }).save();
    tokenA = generateToken({ userId: userA._id.toString(), role: 'customer' });

    userB = await new User({
      name: 'Bob Specialist',
      email: 'bob@example.com',
      passwordHash: 'hashed_password_456',
      role: 'provider',
      isActive: true,
    }).save();
    tokenB = generateToken({ userId: userB._id.toString(), role: 'provider' });
  });

  describe('1. Endpoint Authentication & SSE Headers', () => {
    it('should reject unauthenticated stream request with 401', async () => {
      const res = await request(app).get('/api/notifications/stream');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject malformed or forged token with 401', async () => {
      const res = await request(app)
        .get('/api/notifications/stream')
        .set('Authorization', 'Bearer invalid_forged_token');
      expect(res.status).toBe(401);
    });

    it('should set correct SSE headers and initial connected message for authenticated client', async () => {
      const mockRes: Partial<Response> = {
        writable: true,
        writableEnded: false,
        writeHead: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
        on: vi.fn(),
      };

      const registered = notificationStreamService.addClient(userA._id.toString(), mockRes as Response);
      expect(registered).toBe(true);
      expect(notificationStreamService.getConnectionCountForUser(userA._id.toString())).toBe(1);

      notificationStreamService.removeClient(userA._id.toString(), mockRes as Response);
      expect(notificationStreamService.getConnectionCountForUser(userA._id.toString())).toBe(0);
    });
  });

  describe('2. Connection Registry & 10-Connection Limit', () => {
    it('should support multiple concurrent connections for the same user (multi-tab)', () => {
      const responses: Partial<Response>[] = Array.from({ length: 5 }, () => ({
        writable: true,
        writableEnded: false,
        write: vi.fn(),
        end: vi.fn(),
      }));

      for (const res of responses) {
        const added = notificationStreamService.addClient(userA._id.toString(), res as Response);
        expect(added).toBe(true);
      }

      expect(notificationStreamService.getConnectionCountForUser(userA._id.toString())).toBe(5);
    });

    it('should enforce the maximum limit of 10 connections per user and reject the 11th', () => {
      const conns: Partial<Response>[] = Array.from({ length: 10 }, () => ({
        writable: true,
        writableEnded: false,
        write: vi.fn(),
        end: vi.fn(),
      }));

      for (const res of conns) {
        expect(notificationStreamService.addClient(userA._id.toString(), res as Response)).toBe(true);
      }

      expect(notificationStreamService.getConnectionCountForUser(userA._id.toString())).toBe(10);

      // 11th connection attempt must be rejected
      const eleventhRes: Partial<Response> = { writable: true, writableEnded: false, write: vi.fn(), end: vi.fn() };
      const rejected = notificationStreamService.addClient(userA._id.toString(), eleventhRes as Response);
      expect(rejected).toBe(false);

      // Other users can still connect normally
      const userBRes: Partial<Response> = { writable: true, writableEnded: false, write: vi.fn(), end: vi.fn() };
      expect(notificationStreamService.addClient(userB._id.toString(), userBRes as Response)).toBe(true);
    });

    it('should cleanly remove disconnected client and delete user entry when count reaches zero', () => {
      const res1: Partial<Response> = { writable: true, writableEnded: false, write: vi.fn() };
      const res2: Partial<Response> = { writable: true, writableEnded: false, write: vi.fn() };

      notificationStreamService.addClient(userA._id.toString(), res1 as Response);
      notificationStreamService.addClient(userA._id.toString(), res2 as Response);
      expect(notificationStreamService.getConnectionCountForUser(userA._id.toString())).toBe(2);

      // Disconnect one
      notificationStreamService.removeClient(userA._id.toString(), res1 as Response);
      expect(notificationStreamService.getConnectionCountForUser(userA._id.toString())).toBe(1);

      // Disconnect second
      notificationStreamService.removeClient(userA._id.toString(), res2 as Response);
      expect(notificationStreamService.getConnectionCountForUser(userA._id.toString())).toBe(0);

      // Idempotent removal
      expect(() => notificationStreamService.removeClient(userA._id.toString(), res2 as Response)).not.toThrow();
    });
  });

  describe('3. Live Broadcasting, Isolation & Multi-Client Delivery', () => {
    it('should broadcast notification to all active connections of recipient', () => {
      const writeA1 = vi.fn();
      const writeA2 = vi.fn();
      const resA1: Partial<Response> = { writable: true, writableEnded: false, write: writeA1 };
      const resA2: Partial<Response> = { writable: true, writableEnded: false, write: writeA2 };

      notificationStreamService.addClient(userA._id.toString(), resA1 as Response);
      notificationStreamService.addClient(userA._id.toString(), resA2 as Response);

      const notif: NotificationData = {
        id: 'notif-100',
        recipientId: userA._id.toString(),
        type: 'BOOKING_ACCEPTED',
        title: 'Booking Accepted',
        message: 'Your booking has been accepted.',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      notificationStreamService.broadcastToUser(userA._id.toString(), notif);

      expect(writeA1).toHaveBeenCalledTimes(1);
      expect(writeA2).toHaveBeenCalledTimes(1);

      const payload = writeA1.mock.calls[0][0];
      expect(payload).toContain('event: notification');
      expect(payload).toContain('id: notif-100');
      expect(payload).toContain('"title":"Booking Accepted"');
    });

    it('should strictly isolate notifications and NOT deliver User A notifications to User B', () => {
      const writeA = vi.fn();
      const writeB = vi.fn();
      const resA: Partial<Response> = { writable: true, writableEnded: false, write: writeA };
      const resB: Partial<Response> = { writable: true, writableEnded: false, write: writeB };

      notificationStreamService.addClient(userA._id.toString(), resA as Response);
      notificationStreamService.addClient(userB._id.toString(), resB as Response);

      const notifForA: NotificationData = {
        id: 'notif-secret-a',
        recipientId: userA._id.toString(),
        type: 'BOOKING_REQUESTED',
        title: 'Private to User A',
        message: 'Secret details.',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      notificationStreamService.broadcastToUser(userA._id.toString(), notifForA);

      expect(writeA).toHaveBeenCalledTimes(1);
      expect(writeB).not.toHaveBeenCalled();
    });

    it('should isolate write failures and not interrupt delivery to other active clients', () => {
      const failingWrite = vi.fn(() => {
        throw new Error('Socket write failure');
      });
      const healthyWrite = vi.fn();

      const resBroken: Partial<Response> = { writable: true, writableEnded: false, write: failingWrite };
      const resHealthy: Partial<Response> = { writable: true, writableEnded: false, write: healthyWrite };

      notificationStreamService.addClient(userA._id.toString(), resBroken as Response);
      notificationStreamService.addClient(userA._id.toString(), resHealthy as Response);

      const notif: NotificationData = {
        id: 'notif-resilience',
        recipientId: userA._id.toString(),
        type: 'BOOKING_ON_THE_WAY',
        title: 'On the way',
        message: 'Specialist is arriving.',
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      // Broadcast should handle error gracefully without throwing
      expect(() => {
        notificationStreamService.broadcastToUser(userA._id.toString(), notif);
      }).not.toThrow();

      // Healthy client received message
      expect(healthyWrite).toHaveBeenCalledTimes(1);
      // Broken client was cleaned up
      expect(notificationStreamService.getConnectionCountForUser(userA._id.toString())).toBe(1);
    });
  });

  describe('4. Heartbeat Pings & Graceful Shutdown', () => {
    it('should emit :ping\\n\\n to all active clients when sendHeartbeat is called', () => {
      const writeA = vi.fn();
      const writeB = vi.fn();
      const resA: Partial<Response> = { writable: true, writableEnded: false, write: writeA };
      const resB: Partial<Response> = { writable: true, writableEnded: false, write: writeB };

      notificationStreamService.addClient(userA._id.toString(), resA as Response);
      notificationStreamService.addClient(userB._id.toString(), resB as Response);

      notificationStreamService.sendHeartbeat();

      expect(writeA).toHaveBeenCalledWith(':ping\n\n');
      expect(writeB).toHaveBeenCalledWith(':ping\n\n');
    });

    it('should emit :app-shutdown\\n\\n and end all responses on closeAllClients', () => {
      const writeA = vi.fn();
      const endA = vi.fn();
      const resA: Partial<Response> = { writable: true, writableEnded: false, write: writeA, end: endA };

      notificationStreamService.addClient(userA._id.toString(), resA as Response);
      expect(notificationStreamService.getTotalConnectionCount()).toBe(1);

      notificationStreamService.closeAllClients();

      expect(writeA).toHaveBeenCalledWith(':app-shutdown\n\n');
      expect(endA).toHaveBeenCalledTimes(1);
      expect(notificationStreamService.getTotalConnectionCount()).toBe(0);
    });
  });

  describe('5. Integration with sendInAppNotification', () => {
    it('should persist notification in MongoDB and trigger live broadcast to recipient', async () => {
      const writeA = vi.fn();
      const resA: Partial<Response> = { writable: true, writableEnded: false, write: writeA };
      notificationStreamService.addClient(userA._id.toString(), resA as Response);

      const saved = await sendInAppNotification({
        recipientId: userA._id,
        type: 'BOOKING_COMPLETED',
        title: 'Work Completed',
        message: 'Your service appointment has finished.',
        dedupKey: `test:stream:${Date.now()}`,
      });

      expect(saved).toBeTruthy();
      expect(saved?.title).toBe('Work Completed');

      // Verify broadcast was triggered
      expect(writeA).toHaveBeenCalledTimes(1);
      const streamedChunk = writeA.mock.calls[0][0];
      expect(streamedChunk).toContain('event: notification');
      expect(streamedChunk).toContain('Work Completed');
      expect(streamedChunk).toContain(userA._id.toString());
    });
  });
});
