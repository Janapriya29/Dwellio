import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { redisService } from '../src/services/redisService';
import { queueService, QUEUE_NAMES } from '../src/services/queueService';

describe('Milestone 5A & 5C: Redis and BullMQ Queue Infrastructure Tests', () => {
  beforeAll(async () => {
    // Queues and Redis connections initialize automatically
  });

  afterAll(async () => {
    await queueService.closeQueues();
    await redisService.closeRedisConnections();
  });

  describe('1. Centralized Redis Service', () => {
    it('returns healthy status with valid connection mode (mock in test environment)', async () => {
      const health = await redisService.checkRedisHealth();
      expect(health.status).toBe('healthy');
      expect(['real', 'mock']).toContain(health.mode);
    });

    it('provides isolated producer and subscriber clients', () => {
      const producer = redisService.getClient();
      const subscriber = redisService.getSubscriberClient();

      expect(producer).toBeDefined();
      expect(subscriber).toBeDefined();
    });

    it('provides BullMQ-compatible connection options', () => {
      const conn = redisService.getBullMQConnection();
      expect(conn).toBeDefined();
    });
  });

  describe('2. Managed BullMQ Queues Initialization', () => {
    it('initializes all three managed queues with correct names', () => {
      const notifQueue = queueService.getNotificationsQueue();
      const lifecycleQueue = queueService.getBookingLifecycleQueue();
      const maintQueue = queueService.getMaintenanceQueue();

      expect(notifQueue.name).toBe(QUEUE_NAMES.NOTIFICATIONS);
      expect(lifecycleQueue.name).toBe(QUEUE_NAMES.BOOKING_LIFECYCLE);
      expect(maintQueue.name).toBe(QUEUE_NAMES.MAINTENANCE);
    });

    it('retrieves comprehensive operational queue metrics across all queues', async () => {
      const metrics = await queueService.getAllQueueMetrics();
      expect(metrics).toHaveLength(3);

      const queueNames = metrics.map((m) => m.name);
      expect(queueNames).toContain(QUEUE_NAMES.NOTIFICATIONS);
      expect(queueNames).toContain(QUEUE_NAMES.BOOKING_LIFECYCLE);
      expect(queueNames).toContain(QUEUE_NAMES.MAINTENANCE);

      for (const m of metrics) {
        expect(m.waiting).toBeGreaterThanOrEqual(0);
        expect(m.active).toBeGreaterThanOrEqual(0);
        expect(m.completed).toBeGreaterThanOrEqual(0);
        expect(m.failed).toBeGreaterThanOrEqual(0);
        expect(typeof m.paused).toBe('boolean');
      }
    });
  });

  describe('3. Delayed Reminder Scheduling & Idempotent Cancellation (Milestone 5C)', () => {
    const testBookingId = '66f000000000000000000123';

    it('schedules 24h and 2h appointment reminders for a future booking', async () => {
      // Future date 48 hours from now
      const futureStartTime = new Date(Date.now() + 48 * 60 * 60 * 1000);

      await queueService.scheduleBookingReminders(testBookingId, futureStartTime);

      const queue = queueService.getBookingLifecycleQueue();
      const job24h = await queue.getJob(`reminder_24h_${testBookingId}`);
      const job2h = await queue.getJob(`reminder_2h_${testBookingId}`);

      expect(job24h).toBeDefined();
      expect(job2h).toBeDefined();
      expect(job24h?.data.bookingId).toBe(testBookingId);
      expect(job2h?.data.bookingId).toBe(testBookingId);
    });

    it('cancels scheduled reminders when requested', async () => {
      const queue = queueService.getBookingLifecycleQueue();

      // Verify jobs exist before cancellation
      const before24h = await queue.getJob(`reminder_24h_${testBookingId}`);
      expect(before24h).toBeDefined();

      // Cancel reminders
      await queueService.cancelBookingReminders(testBookingId);

      // Verify jobs have been removed
      const after24h = await queue.getJob(`reminder_24h_${testBookingId}`);
      const after2h = await queue.getJob(`reminder_2h_${testBookingId}`);
      expect(after24h).toBeNull();
      expect(after2h).toBeNull();
    });

    it('handles cancellation idempotently for non-existent reminder jobs without error', async () => {
      await expect(
        queueService.cancelBookingReminders('66f999999999999999999999')
      ).resolves.not.toThrow();
    });
  });

  describe('4. Conversation Auto-Lock Job Scheduling', () => {
    it('schedules delayed auto-lock job for completed booking conversation', async () => {
      const convId = '66f000000000000000000456';
      const bookingId = '66f000000000000000000789';
      const completedAt = new Date();

      await queueService.scheduleConversationAutoLock(convId, bookingId, completedAt);

      const queue = queueService.getBookingLifecycleQueue();
      const job = await queue.getJob(`autolock_${convId}`);

      expect(job).toBeDefined();
      expect(job?.data.conversationId).toBe(convId);
      expect(job?.data.bookingId).toBe(bookingId);

      // Cleanup test job
      await job?.remove().catch(() => {});
    });
  });
});
