import { Booking } from '../models/Booking';
import { AuditLog } from '../models/AuditLog';
import { releaseProviderSlots } from '../utils/booking';
import { sendInAppNotification } from '../utils/notification';
import { couponService } from './couponService';

export class FinancialBackgroundWorker {
  private intervalTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  /**
   * Scans for accepted bookings that have exceeded their 2-hour payment window.
   * Cancels expired bookings, releases slots, releases coupons, and notifies parties.
   */
  async expireUnpaidAcceptedBookings(): Promise<number> {
    if (this.isProcessing) return 0;
    this.isProcessing = true;

    let expiredCount = 0;
    try {
      const now = new Date();
      // Find all bookings accepted, unpaid, where paymentDueAt is in the past
      const expiredBookings = await Booking.find({
        status: 'accepted',
        paymentStatus: { $in: ['unpaid', 'pending_verification'] },
        paymentDueAt: { $exists: true, $ne: null, $lt: now },
      }).populate('customerId', 'name email').populate('providerId', 'displayName');

      for (const booking of expiredBookings) {
        const updated = await Booking.findOneAndUpdate(
          {
            _id: booking._id,
            status: 'accepted',
            paymentStatus: { $in: ['unpaid', 'pending_verification'] },
          },
          {
            $set: {
              status: 'cancelled',
              cancellationReason: 'Payment window expired (unpaid within 2 hours of provider acceptance)',
            },
            $push: {
              statusHistory: {
                actorId: booking.customerId._id || booking.customerId,
                actorRole: 'customer',
                fromStatus: 'accepted',
                toStatus: 'cancelled',
                timestamp: now,
                reason: 'Auto-cancelled: 2-hour payment deadline expired.',
              },
            },
          },
          { returnDocument: 'after' }
        );

        if (updated) {
          expiredCount++;

          // 1. Release held slot reservations
          await releaseProviderSlots(booking._id).catch(() => {});

          // 2. Release reserved coupon
          await couponService.releaseCouponReservation(booking._id, 'Payment window expired').catch(() => {});

          // Lock associated conversation (Phase 5 Remediation)
          const { Conversation } = await import('../models/Conversation');
          await Conversation.findOneAndUpdate(
            { bookingId: booking._id },
            { $set: { status: 'locked', lockedAt: now, lockReason: 'Auto-cancelled: Payment deadline expired' } }
          ).catch(() => {});

          // 3. Record AuditLog
          await new AuditLog({
            adminId: booking.customerId._id || booking.customerId,
            action: 'BOOKING_PAYMENT_EXPIRED',
            targetId: booking._id,
            targetType: 'Booking',
            details: {
              bookingId: booking._id,
              paymentDueAt: booking.paymentDueAt,
              expiredAt: now,
              reason: 'Payment deadline expired after provider acceptance.',
            },
          }).save().catch(() => {});

          // 4. Notify Customer
          await sendInAppNotification({
            recipientId: booking.customerId._id || booking.customerId,
            type: 'PAYMENT_EXPIRED',
            title: 'Booking Cancelled: Payment Window Expired',
            message: `Your booking for ${(booking.serviceId as any)?.name || 'service'} was automatically cancelled because payment was not completed within 2 hours of acceptance.`,
            bookingId: booking._id,
            dedupKey: `booking:${booking._id}:payment_expired:customer`,
          }).catch(() => {});

          // 5. Notify Provider
          await sendInAppNotification({
            recipientId: booking.providerUserId,
            type: 'PAYMENT_EXPIRED',
            title: 'Booking Cancelled: Customer Did Not Pay',
            message: `Booking (${booking._id.toString().slice(-8).toUpperCase()}) was cancelled because the customer did not complete payment within 2 hours. The time slot has been released back into your calendar.`,
            bookingId: booking._id,
            dedupKey: `booking:${booking._id}:payment_expired:provider`,
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('[FinancialBackgroundWorker] Error expiring unpaid bookings:', err);
    } finally {
      this.isProcessing = false;
    }

    return expiredCount;
  }

  /**
   * Scans for stuck or interrupted webhook events that were abandoned.
   * Recovers and processes them safely and idempotently.
   */
  async recoverStaleWebhookEvents(staleThresholdMs: number = 30000): Promise<number> {
    const staleThreshold = new Date(Date.now() - staleThresholdMs);
    const { PaymentWebhookEvent } = await import('../models/PaymentWebhookEvent');
    const { reconcilePaymentCapture } = await import('../utils/payment');
    const { Payment } = await import('../models/Payment');
    const { couponService } = await import('./couponService');

    const staleEvents = await PaymentWebhookEvent.find({
      $or: [
        { processingStatus: 'processing', updatedAt: { $lt: staleThreshold } },
        { processingStatus: 'failed', retryCount: { $lt: 5 } },
      ],
    }).limit(25);

    let recoveredCount = 0;
    for (const evt of staleEvents) {
      const claimed = await PaymentWebhookEvent.findOneAndUpdate(
        { _id: evt._id, processingStatus: evt.processingStatus },
        { $set: { processingStatus: 'processing', updatedAt: new Date() }, $inc: { retryCount: 1 } },
        { returnDocument: 'after' }
      );
      if (!claimed) continue;

      try {
        if (claimed.eventType === 'payment.captured' || claimed.eventType === 'order.paid') {
          const paymentEntity = claimed.payload?.payload?.payment?.entity || {};
          const orderId = paymentEntity.order_id || claimed.payload?.payload?.order?.entity?.id;
          const paymentId = paymentEntity.id;
          if (orderId && paymentId) {
            await reconcilePaymentCapture({
              razorpayOrderId: orderId,
              razorpayPaymentId: paymentId,
              source: 'webhook',
            });
          }
        } else if (claimed.eventType === 'payment.failed') {
          const paymentEntity = claimed.payload?.payload?.payment?.entity || {};
          const orderId = paymentEntity.order_id;
          if (orderId) {
            const payment = await Payment.findOne({ razorpayOrderId: orderId });
            if (payment && payment.status === 'created') {
              payment.status = 'failed';
              payment.errorCode = paymentEntity.error_code || 'GATEWAY_DECLINE';
              payment.errorDescription = paymentEntity.error_description || 'Payment was declined by gateway.';
              await payment.save();
              await couponService.releaseCouponReservation(payment.bookingId, 'Payment failed at gateway').catch(() => {});
            }
          }
        }

        claimed.processingStatus = 'processed';
        claimed.processedAt = new Date();
        claimed.error = undefined;
        await claimed.save();
        recoveredCount++;
      } catch (err: any) {
        claimed.processingStatus = 'failed';
        claimed.error = err?.message || 'Recovery processing failed';
        await claimed.save().catch(() => {});
      }
    }

    return recoveredCount;
  }

  /**
   * Starts periodic execution of background financial maintenance jobs.
   */
  start(intervalMs: number = 60000): void {
    if (this.intervalTimer) return;
    this.intervalTimer = setInterval(() => {
      this.expireUnpaidAcceptedBookings().catch(() => {});
      this.recoverStaleWebhookEvents().catch(() => {});
    }, intervalMs);
    // Unref to avoid blocking clean process shutdown
    if (this.intervalTimer.unref) {
      this.intervalTimer.unref();
    }
  }

  /**
   * Stops background timer.
   */
  stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
}

export const financialBackgroundWorker = new FinancialBackgroundWorker();
