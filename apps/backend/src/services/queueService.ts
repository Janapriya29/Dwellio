import { Queue, QueueOptions } from 'bullmq';
import { redisService } from './redisService';
import { config } from '../config/env';

export const QUEUE_NAMES = {
  NOTIFICATIONS: 'dwellio-notifications',
  BOOKING_LIFECYCLE: 'dwellio-booking-lifecycle',
  MAINTENANCE: 'dwellio-maintenance',
} as const;

export interface QueueMetricData {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

/**
 * In-memory queue stub used strictly during test execution (NODE_ENV === 'test').
 * Eliminates Redis Lua cmsgpack engine dependencies in unit/mock tests while
 * faithfully supporting add, getJob, remove, delay tracking, and operational metrics.
 */
class InMemoryTestQueue {
  public name: string;
  private jobs: Map<string, any> = new Map();
  private nextId = 1;

  constructor(name: string) {
    this.name = name;
  }

  public async add(name: string, data: any, opts: any = {}): Promise<any> {
    const id = opts?.jobId || `job_${this.nextId++}`;
    const job = {
      id,
      name,
      data,
      opts,
      remove: async () => {
        this.jobs.delete(id);
      },
    };
    this.jobs.set(id, job);
    return job;
  }

  public async getJob(jobId: string): Promise<any | null> {
    return this.jobs.get(jobId) || null;
  }

  public async upsertJobScheduler(): Promise<void> {}

  public async getWaitingCount(): Promise<number> {
    let count = 0;
    for (const j of this.jobs.values()) {
      if (!j.opts?.delay) count++;
    }
    return count;
  }

  public async getActiveCount(): Promise<number> {
    return 0;
  }

  public async getCompletedCount(): Promise<number> {
    return 0;
  }

  public async getFailedCount(): Promise<number> {
    return 0;
  }

  public async getDelayedCount(): Promise<number> {
    let count = 0;
    for (const j of this.jobs.values()) {
      if (j.opts?.delay) count++;
    }
    return count;
  }

  public async isPaused(): Promise<boolean> {
    return false;
  }

  public async close(): Promise<void> {
    this.jobs.clear();
  }
}

class QueueService {
  private notificationsQueue: Queue | null = null;
  private bookingLifecycleQueue: Queue | null = null;
  private maintenanceQueue: Queue | null = null;

  private createQueue(name: string): Queue {
    if (config.nodeEnv === 'test') {
      return new InMemoryTestQueue(name) as unknown as Queue;
    }

    const connection = redisService.getBullMQConnection();
    return new Queue(name, {
      connection: connection as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 3600 * 24, // Keep completed jobs for 24h
          count: 1000,
        },
        removeOnFail: {
          age: 3600 * 24 * 7, // Keep failed jobs for 7 days
          count: 2000,
        },
      },
    });
  }

  public getNotificationsQueue(): Queue {
    if (!this.notificationsQueue) {
      this.notificationsQueue = this.createQueue(QUEUE_NAMES.NOTIFICATIONS);
    }
    return this.notificationsQueue;
  }

  public getBookingLifecycleQueue(): Queue {
    if (!this.bookingLifecycleQueue) {
      this.bookingLifecycleQueue = this.createQueue(QUEUE_NAMES.BOOKING_LIFECYCLE);
    }
    return this.bookingLifecycleQueue;
  }

  public getMaintenanceQueue(): Queue {
    if (!this.maintenanceQueue) {
      this.maintenanceQueue = this.createQueue(QUEUE_NAMES.MAINTENANCE);
    }
    return this.maintenanceQueue;
  }

  /**
   * Enqueues an announcement delivery batch job into notificationsQueue.
   */
  public async enqueueAnnouncementBatch(data: {
    announcementId: string;
    recipientUserIds: string[];
    title: string;
    message: string;
    batchIndex: number;
  }): Promise<void> {
    const queue = this.getNotificationsQueue();
    await queue.add(
      'announcement_batch',
      data,
      {
        jobId: `announcement_${data.announcementId}_batch_${data.batchIndex}`,
      }
    );
  }

  /**
   * Schedules delayed appointment reminders for a confirmed booking.
   * Deterministic job IDs allow idempotent replacement and clean cancellation.
   */
  public async scheduleBookingReminders(bookingId: string, scheduledStartTime: Date): Promise<void> {
    const queue = this.getBookingLifecycleQueue();
    const now = Date.now();
    const startMs = scheduledStartTime.getTime();

    // 1. 24-hour reminder
    const ms24hBefore = startMs - 24 * 60 * 60 * 1000;
    const delay24h = ms24hBefore - now;
    if (delay24h > 0) {
      await queue.add(
        'appointment_reminder_24h',
        { bookingId, scheduledStartTime: scheduledStartTime.toISOString() },
        {
          delay: delay24h,
          jobId: `reminder_24h_${bookingId}`,
        }
      );
    }

    // 2. 2-hour reminder
    const ms2hBefore = startMs - 2 * 60 * 60 * 1000;
    const delay2h = ms2hBefore - now;
    if (delay2h > 0) {
      await queue.add(
        'appointment_reminder_2h',
        { bookingId, scheduledStartTime: scheduledStartTime.toISOString() },
        {
          delay: delay2h,
          jobId: `reminder_2h_${bookingId}`,
        }
      );
    }
  }

  /**
   * Cancels scheduled reminders when a booking is cancelled, rejected, or rescheduled.
   */
  public async cancelBookingReminders(bookingId: string): Promise<void> {
    const queue = this.getBookingLifecycleQueue();
    const job24h = await queue.getJob(`reminder_24h_${bookingId}`);
    if (job24h) {
      await job24h.remove().catch(() => {});
    }
    const job2h = await queue.getJob(`reminder_2h_${bookingId}`);
    if (job2h) {
      await job2h.remove().catch(() => {});
    }
  }

  /**
   * Schedules conversation auto-lock 48 hours after job completion.
   */
  public async scheduleConversationAutoLock(conversationId: string, bookingId: string, completedAt: Date): Promise<void> {
    const queue = this.getBookingLifecycleQueue();
    const now = Date.now();
    const lockAt = completedAt.getTime() + 48 * 60 * 60 * 1000;
    const delay = Math.max(0, lockAt - now);

    await queue.add(
      'conversation_auto_lock',
      { conversationId, bookingId, lockAt: new Date(lockAt).toISOString() },
      {
        delay,
        jobId: `autolock_${conversationId}`,
      }
    );
  }

  /**
   * Registers repeatable/cron schedules for lifecycle and maintenance sweeps.
   * Only called from a designated scheduler or worker startup to prevent duplicate schedules.
   */
  public async registerRepeatableJobs(): Promise<void> {
    if (config.nodeEnv === 'test') {
      return;
    }

    try {
      const maintenanceQueue = this.getMaintenanceQueue();
      const lifecycleQueue = this.getBookingLifecycleQueue();

      // 1. Unpaid accepted booking expiry: every 60 seconds
      await maintenanceQueue.upsertJobScheduler(
        'repeatable_unpaid_booking_expiry',
        { every: 60000 },
        { name: 'unpaid_booking_expiry', data: {} }
      );

      // 2. Stale webhook lease recovery: every 60 seconds
      await maintenanceQueue.upsertJobScheduler(
        'repeatable_stale_webhook_recovery',
        { every: 60000 },
        { name: 'stale_webhook_recovery', data: {} }
      );

      // 3. Unresponded booking request expiry (24h threshold): every 5 minutes
      await lifecycleQueue.upsertJobScheduler(
        'repeatable_unresponded_booking_expiry',
        { every: 300000 },
        { name: 'unresponded_booking_expiry', data: {} }
      );

      // 4. Overdue active booking detection: every 15 minutes
      await lifecycleQueue.upsertJobScheduler(
        'repeatable_overdue_booking_detection',
        { every: 900000 },
        { name: 'overdue_booking_detection', data: {} }
      );
    } catch (err: any) {
      console.warn('[QueueService] Warning registering repeatable schedules:', err?.message || err);
    }
  }

  /**
   * Returns operational metrics for all managed queues (for Admin monitoring).
   */
  public async getAllQueueMetrics(): Promise<QueueMetricData[]> {
    const queues = [
      { name: QUEUE_NAMES.NOTIFICATIONS, q: this.getNotificationsQueue() },
      { name: QUEUE_NAMES.BOOKING_LIFECYCLE, q: this.getBookingLifecycleQueue() },
      { name: QUEUE_NAMES.MAINTENANCE, q: this.getMaintenanceQueue() },
    ];

    const results: QueueMetricData[] = [];

    for (const item of queues) {
      try {
        const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
          item.q.getWaitingCount().catch(() => 0),
          item.q.getActiveCount().catch(() => 0),
          item.q.getCompletedCount().catch(() => 0),
          item.q.getFailedCount().catch(() => 0),
          item.q.getDelayedCount().catch(() => 0),
          item.q.isPaused().catch(() => false),
        ]);

        results.push({
          name: item.name,
          waiting,
          active,
          completed,
          failed,
          delayed,
          paused: isPaused,
        });
      } catch {
        results.push({
          name: item.name,
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0,
          paused: false,
        });
      }
    }

    return results;
  }

  /**
   * Graceful queue draining and shutdown
   */
  public async closeQueues(): Promise<void> {
    const closePromises: Promise<void>[] = [];
    if (this.notificationsQueue) closePromises.push(this.notificationsQueue.close());
    if (this.bookingLifecycleQueue) closePromises.push(this.bookingLifecycleQueue.close());
    if (this.maintenanceQueue) closePromises.push(this.maintenanceQueue.close());

    await Promise.allSettled(closePromises);
    this.notificationsQueue = null;
    this.bookingLifecycleQueue = null;
    this.maintenanceQueue = null;
  }
}

export const queueService = new QueueService();
