import { Worker, Job } from 'bullmq';
import { QUEUE_NAMES } from '../services/queueService';
import { redisService } from '../services/redisService';
import { sendInAppNotification } from '../utils/notification';
import { releaseProviderSlots } from '../utils/booking';
import { financialBackgroundWorker } from '../services/financialBackgroundWorker';
import { Booking } from '../models/Booking';
import { Announcement } from '../models/Announcement';
import { Conversation } from '../models/Conversation';
import { AuditLog } from '../models/AuditLog';

export class WorkerSupervisor {
  private notificationsWorker: Worker | null = null;
  private lifecycleWorker: Worker | null = null;
  private maintenanceWorker: Worker | null = null;
  private isRunning = false;

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const connection = redisService.getBullMQConnection();

    // 1. Notifications Worker
    this.notificationsWorker = new Worker(
      QUEUE_NAMES.NOTIFICATIONS,
      async (job: Job) => {
        if (job.name === 'announcement_batch') {
          await this.processAnnouncementBatch(job.data);
        }
      },
      {
        connection: connection as any,
        concurrency: 5,
      }
    );

    this.notificationsWorker.on('failed', (job, err) => {
      console.error(`[Worker Error][notificationsQueue] Job ${job?.id} failed:`, err.message);
    });

    // 2. Booking Lifecycle Worker
    this.lifecycleWorker = new Worker(
      QUEUE_NAMES.BOOKING_LIFECYCLE,
      async (job: Job) => {
        switch (job.name) {
          case 'appointment_reminder_24h':
            await this.processAppointmentReminder(job.data.bookingId, '24h');
            break;
          case 'appointment_reminder_2h':
            await this.processAppointmentReminder(job.data.bookingId, '2h');
            break;
          case 'conversation_auto_lock':
            await this.processConversationAutoLock(job.data.conversationId, job.data.bookingId);
            break;
          case 'unresponded_booking_expiry':
            await this.processUnrespondedBookingExpiry();
            break;
          case 'overdue_booking_detection':
            await this.processOverdueBookingDetection();
            break;
          default:
            console.warn(`[Worker] Unknown lifecycle job name: ${job.name}`);
        }
      },
      {
        connection: connection as any,
        concurrency: 5,
      }
    );

    this.lifecycleWorker.on('failed', (job, err) => {
      console.error(`[Worker Error][bookingLifecycleQueue] Job ${job?.id} failed:`, err.message);
    });

    // 3. Maintenance Worker (Financial Invariants & Webhooks)
    this.maintenanceWorker = new Worker(
      QUEUE_NAMES.MAINTENANCE,
      async (job: Job) => {
        if (job.name === 'unpaid_booking_expiry') {
          // Reuses tested Phase 4 implementation with exact financial/slot invariants
          await financialBackgroundWorker.expireUnpaidAcceptedBookings();
        } else if (job.name === 'stale_webhook_recovery') {
          // Reuses tested Phase 4 implementation with atomic lease recovery
          await financialBackgroundWorker.recoverStaleWebhookEvents();
        }
      },
      {
        connection: connection as any,
        concurrency: 2,
      }
    );

    this.maintenanceWorker.on('failed', (job, err) => {
      console.error(`[Worker Error][maintenanceQueue] Job ${job?.id} failed:`, err.message);
    });

    console.log('[WorkerSupervisor] All background workers started successfully.');
  }

  /**
   * Processes a chunked announcement batch job.
   */
  private async processAnnouncementBatch(data: {
    announcementId: string;
    recipientUserIds: string[];
    title: string;
    message: string;
  }): Promise<void> {
    const { announcementId, recipientUserIds, title, message } = data;
    const successfulIds: string[] = [];
    let failedCount = 0;

    for (const userId of recipientUserIds) {
      try {
        const notif = await sendInAppNotification({
          recipientId: userId,
          type: 'SYSTEM_ANNOUNCEMENT',
          title: `Announcement: ${title}`,
          message,
          dedupKey: `announcement:${announcementId}:${userId}`,
        });
        if (notif) successfulIds.push(userId);
      } catch (err) {
        failedCount++;
      }
    }

    if (successfulIds.length > 0 || failedCount > 0) {
      const updated = await Announcement.findByIdAndUpdate(
        announcementId,
        {
          $addToSet: { deliveredUserIds: { $each: successfulIds } },
          $inc: { deliveredCount: successfulIds.length, failedCount },
        },
        { returnDocument: 'after' }
      ).catch(() => null);

      if (updated && (updated.deliveredCount + updated.failedCount >= updated.recipientCount)) {
        updated.deliveryStatus = updated.failedCount > 0 ? 'partially_failed' : 'delivered';
        await updated.save().catch(() => {});
      }
    }
  }

  /**
   * Processes 24-hour or 2-hour appointment reminders.
   */
  private async processAppointmentReminder(bookingId: string, reminderType: '24h' | '2h'): Promise<void> {
    const booking = await Booking.findById(bookingId)
      .populate('serviceId', 'name')
      .populate('providerId', 'displayName phone')
      .populate('customerId', 'name email phone');

    if (!booking) return;

    // Safety guard: only send reminders for active, paid bookings
    if (booking.status !== 'accepted' || booking.paymentStatus !== 'paid') {
      return;
    }

    const serviceName = (booking.serviceId as any)?.name || 'Home Service';
    const providerName = (booking.providerId as any)?.displayName || 'your service professional';
    const customerName = (booking.customerId as any)?.name || 'the customer';

    if (reminderType === '24h') {
      // 1. Notify Customer
      await sendInAppNotification({
        recipientId: booking.customerId._id || booking.customerId,
        type: 'BOOKING_REMINDER',
        title: 'Upcoming Service Reminder (Tomorrow)',
        message: `Your ${serviceName} appointment with ${providerName} is scheduled for tomorrow at ${new Date(
          booking.scheduledStartTime
        ).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`,
        bookingId: booking._id,
        dedupKey: `booking:${booking._id}:reminder:24h:customer`,
      });

      // 2. Notify Provider
      await sendInAppNotification({
        recipientId: booking.providerUserId,
        type: 'BOOKING_REMINDER',
        title: 'Upcoming Job Reminder (Tomorrow)',
        message: `You have an appointment with ${customerName} for ${serviceName} scheduled tomorrow at ${new Date(
          booking.scheduledStartTime
        ).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.`,
        bookingId: booking._id,
        dedupKey: `booking:${booking._id}:reminder:24h:provider`,
      });
    } else if (reminderType === '2h') {
      // 2-hour reminder with address details to provider
      const address = booking.address
        ? `${booking.address.street}, ${booking.address.city} (${booking.address.postalCode})`
        : 'Service Address';

      await sendInAppNotification({
        recipientId: booking.providerUserId,
        type: 'BOOKING_REMINDER',
        title: 'Job Starting Soon (in 2 hours)',
        message: `Your appointment with ${customerName} begins in 2 hours. Location: ${address}. Please prepare to head out.`,
        bookingId: booking._id,
        dedupKey: `booking:${booking._id}:reminder:2h:provider`,
      });
    }
  }

  /**
   * Automatically locks conversation 48 hours after job completion.
   */
  private async processConversationAutoLock(conversationId: string, bookingId: string): Promise<void> {
    const booking = await Booking.findById(bookingId);
    if (!booking || booking.status !== 'completed') return;

    await Conversation.findByIdAndUpdate(conversationId, {
      $set: { status: 'locked' },
    });

    console.log(`[Worker] Conversation ${conversationId} for completed booking ${bookingId} auto-locked.`);
  }

  /**
   * Scans and auto-rejects booking requests that were unresponded by provider after 24h or past start time.
   */
  private async processUnrespondedBookingExpiry(): Promise<void> {
    const now = new Date();
    const threshold24hAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Find requested bookings created >24h ago OR where scheduledStartTime is in the past
    const unrespondedBookings = await Booking.find({
      status: 'requested',
      $or: [
        { createdAt: { $lte: threshold24hAgo } },
        { scheduledStartTime: { $lte: now } },
      ],
    }).populate('serviceId', 'name');

    for (const b of unrespondedBookings) {
      // Atomic state transition
      const updated = await Booking.findOneAndUpdate(
        { _id: b._id, status: 'requested' },
        {
          $set: {
            status: 'rejected',
            rejectionReason: 'Request expired: Service provider did not respond within 24 hours or before scheduled appointment.',
          },
          $push: {
            statusHistory: {
              actorId: b.customerId,
              actorRole: 'system',
              fromStatus: 'requested',
              toStatus: 'rejected',
              timestamp: now,
              reason: 'Auto-expired unresponded booking request.',
            },
          },
        },
        { returnDocument: 'after' }
      );

      if (updated) {
        // Release slot reservations
        await releaseProviderSlots(b._id).catch(() => {});

        // Lock conversation if any
        await Conversation.findOneAndUpdate(
          { bookingId: b._id },
          { $set: { status: 'locked', lockedAt: now, lockReason: 'Request auto-expired: Provider unresponded' } }
        ).catch(() => {});

        // Record AuditLog
        await new AuditLog({
          adminId: b.customerId,
          action: 'BOOKING_EXPIRED_UNRESPONDED',
          targetId: b._id,
          targetType: 'Booking',
          details: {
            bookingId: b._id,
            createdAt: b.createdAt,
            scheduledStartTime: b.scheduledStartTime,
            expiredAt: now,
          },
        }).save().catch(() => {});

        // Notify customer
        const serviceName = (b.serviceId as any)?.name || 'service';
        await sendInAppNotification({
          recipientId: b.customerId,
          type: 'BOOKING_REJECTED',
          title: 'Booking Request Expired',
          message: `Your booking request for ${serviceName} expired because the service professional did not respond in time. Please book with another verified provider.`,
          bookingId: b._id,
          dedupKey: `booking:${b._id}:request_expired`,
        }).catch(() => {});
      }
    }
  }

  /**
   * Detects bookings that remain in 'on_the_way' or 'in_progress' more than 6h past scheduledEndTime.
   */
  private async processOverdueBookingDetection(): Promise<void> {
    const now = new Date();
    const threshold6hAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

    const overdueBookings = await Booking.find({
      status: { $in: ['on_the_way', 'in_progress'] },
      scheduledEndTime: { $lte: threshold6hAgo },
    }).populate('serviceId', 'name').populate('customerId', 'name');

    for (const b of overdueBookings) {
      // Send reminder to provider to complete job
      const serviceName = (b.serviceId as any)?.name || 'service';
      await sendInAppNotification({
        recipientId: b.providerUserId,
        type: 'BOOKING_REMINDER',
        title: 'Job Overdue: Please Update Status',
        message: `Your appointment for ${serviceName} ended over 6 hours ago. If work is finished, please mark the job as "Completed" in your portal so your earnings can be settled.`,
        bookingId: b._id,
        dedupKey: `booking:${b._id}:overdue_provider:${now.toISOString().slice(0, 10)}`,
      }).catch(() => {});
    }
  }

  /**
   * Graceful shutdown: closes all BullMQ workers safely.
   */
  public async close(): Promise<void> {
    this.isRunning = false;
    const promises: Promise<void>[] = [];
    if (this.notificationsWorker) {
      promises.push(this.notificationsWorker.close());
      this.notificationsWorker = null;
    }
    if (this.lifecycleWorker) {
      promises.push(this.lifecycleWorker.close());
      this.lifecycleWorker = null;
    }
    if (this.maintenanceWorker) {
      promises.push(this.maintenanceWorker.close());
      this.maintenanceWorker = null;
    }
    await Promise.allSettled(promises);
    console.log('[WorkerSupervisor] All background workers drained and closed.');
  }

  // Public delegates for testing and explicit execution sweeps
  public async processAnnouncementBatchJob(data: any): Promise<void> {
    return this.processAnnouncementBatch(data);
  }

  public async expireUnrespondedBookings(): Promise<void> {
    return this.processUnrespondedBookingExpiry();
  }

  public async detectOverdueBookings(): Promise<void> {
    return this.processOverdueBookingDetection();
  }

  public async autoLockConversation(conversationId: string, bookingId: string): Promise<void> {
    return this.processConversationAutoLock(conversationId, bookingId);
  }
}

export const workerSupervisor = new WorkerSupervisor();
