import { Types } from 'mongoose';
import { IBooking, Booking } from '../models/Booking';
import { Payment } from '../models/Payment';
import { Refund, IRefund } from '../models/Refund';
import { AuditLog } from '../models/AuditLog';
import { razorpayService } from '../services/razorpayService';
import { queueService } from '../services/queueService';
import { sendInAppNotification } from './notification';

/**
 * Automates issuing a full refund against a captured booking payment.
 * Idempotent: rejects duplicate refund attempts if already processed.
 */
export const processAutomaticBookingRefund = async (
  bookingId: Types.ObjectId | string,
  reason: string,
  initiatedByRole: 'customer' | 'provider' | 'admin' | 'system',
  initiatedByUserId?: Types.ObjectId | string
): Promise<IRefund | null> => {
  const bId = new Types.ObjectId(bookingId.toString());
  const booking = await Booking.findById(bId);

  if (!booking) {
    return null;
  }

  // Prevent duplicate refund - return existing record idempotently
  const existingRefund = await Refund.findOne({
    bookingId: bId,
    status: { $in: ['processed', 'pending'] },
  });
  if (existingRefund) {
    return existingRefund;
  }

  if (booking.paymentStatus !== 'paid') {
    return null;
  }

  const payment = await Payment.findOne({ bookingId: bId, status: 'captured' });
  if (!payment || !payment.razorpayPaymentId) {
    return null;
  }

  const idempotencyKey = `auto_refund:${booking._id.toString()}:${payment.amount}`;

  const amountPaise = payment.amount;
  const receipt = `rfnd_${booking._id.toString().slice(-14)}`;

  // Reconcile with gateway before calling createRefund to support crash recovery
  const gwPayment = await razorpayService.fetchPayment(payment.razorpayPaymentId).catch(() => null);
  let refundResult: any;

  if (gwPayment && (gwPayment.amount_refunded || 0) >= amountPaise) {
    refundResult = {
      id: `rfnd_recovered_${booking._id.toString().slice(-8)}`,
      payment_id: payment.razorpayPaymentId,
      amount: amountPaise,
      currency: 'INR',
      status: gwPayment.refund_status === 'full' ? 'processed' : 'pending',
    };
  } else {
    refundResult = await razorpayService.createRefund(payment.razorpayPaymentId, {
      amountPaise,
      notes: {
        bookingId: booking._id.toString(),
        reason,
        initiatedByRole,
      },
      receipt,
    });
  }

  const actualStatus: 'pending' | 'processed' = refundResult.status === 'processed' ? 'processed' : 'pending';

  const refundDoc = new Refund({
    paymentId: payment._id,
    bookingId: booking._id,
    razorpayRefundId: refundResult.id,
    razorpayPaymentId: payment.razorpayPaymentId,
    amount: amountPaise,
    currency: 'INR',
    reason,
    status: actualStatus,
    initiatedByRole,
    initiatedByUserId: initiatedByUserId ? new Types.ObjectId(initiatedByUserId.toString()) : undefined,
    idempotencyKey,
  });
  await refundDoc.save();

  // Update booking
  booking.paymentStatus = 'refunded';
  booking.refundAmount = Math.round(amountPaise / 100);
  booking.refundStatus = actualStatus;
  await booking.save();

  // Update payment
  payment.refundedAmount = amountPaise;
  payment.status = 'refunded';
  await payment.save();

  // Audit log
  await new AuditLog({
    adminId: initiatedByUserId ? new Types.ObjectId(initiatedByUserId.toString()) : booking.customerId,
    action: 'REFUND_COMPLETED',
    targetId: booking._id,
    targetType: 'Booking',
    details: {
      bookingId: booking._id,
      amountPaise,
      razorpayRefundId: refundResult.id,
      reason,
      initiatedByRole,
    },
  }).save().catch(() => {});

  // Send notification to customer
  await sendInAppNotification({
    recipientId: booking.customerId,
    type: 'REFUND_COMPLETED',
    title: 'Refund Processed',
    message: `A full refund of ₹${Math.round(amountPaise / 100)} has been processed to your original payment method.`,
    bookingId: booking._id,
    dedupKey: `booking:${booking._id}:refund_completed`,
  }).catch(() => {});

  return refundDoc;
};

export interface ReconcilePaymentCaptureParams {
  bookingId?: Types.ObjectId | string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature?: string;
  source: 'checkout_verify' | 'webhook';
  actorUserId?: Types.ObjectId | string;
}

export interface ReconcilePaymentCaptureResult {
  success: boolean;
  paymentStatus: 'paid' | 'refunded' | 'failed';
  refundedDueToCancellation?: boolean;
  booking: any;
  payment: any;
  refund?: any;
  message?: string;
}

/**
 * Shared, reusable, concurrency-safe payment capture reconciliation flow.
 * Used by both checkout signature verification (POST /api/payments/verify)
 * and gateway webhook processing (payment.captured / order.paid).
 *
 * Guarantees:
 * 1. Never marks a cancelled or expired booking as paid/accepted.
 * 2. If payment is captured for an expired/cancelled booking, automatically issues a full refund.
 * 3. Idempotent against concurrent webhook and customer callback deliveries.
 */
export const reconcilePaymentCapture = async (
  params: ReconcilePaymentCaptureParams
): Promise<ReconcilePaymentCaptureResult> => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, source, actorUserId } = params;

  const payment = await Payment.findOne({ razorpayOrderId });
  if (!payment) {
    throw new Error(`Payment order record not found for orderId "${razorpayOrderId}".`);
  }

  const booking = await Booking.findById(payment.bookingId)
    .populate('serviceId', 'name')
    .populate('customerId', 'name email phone')
    .populate('providerId', 'displayName phone');

  if (!booking) {
    throw new Error(`Associated booking not found for payment "${payment._id}".`);
  }

  // Idempotent guard: already processed and paid
  if (booking.paymentStatus === 'paid' && booking.razorpayPaymentId === razorpayPaymentId) {
    return {
      success: true,
      paymentStatus: 'paid',
      booking,
      payment,
      message: 'Payment has already been verified and processed.',
    };
  }

  // Idempotent guard: already refunded
  if (booking.paymentStatus === 'refunded' && payment.status === 'refunded') {
    const existingRefund = await Refund.findOne({ bookingId: booking._id, status: 'processed' });
    return {
      success: true,
      paymentStatus: 'refunded',
      refundedDueToCancellation: true,
      booking,
      payment,
      refund: existingRefund,
      message: 'Payment was refunded due to booking cancellation or expiration.',
    };
  }

  const { couponService } = await import('../services/couponService');

  // Case 1: Booking is already cancelled or rejected (e.g. 2-hour payment window expired)
  if (booking.status === 'cancelled' || booking.status === 'rejected') {
    // Payment was captured at gateway, but booking was expired/cancelled
    payment.status = 'captured';
    payment.razorpayPaymentId = razorpayPaymentId;
    if (razorpaySignature) {
      payment.razorpaySignature = razorpaySignature;
      payment.signatureVerified = true;
    }
    payment.capturedAt = new Date();
    await payment.save();

    // Check for existing refund to guarantee idempotency
    const idempotencyKey = `auto_refund_late:${booking._id.toString()}:${payment.amount}`;
    let refundDoc = await Refund.findOne({
      $or: [
        { bookingId: booking._id, status: { $in: ['processed', 'pending'] } },
        { idempotencyKey },
      ],
    });

    if (!refundDoc) {
      // Reconcile with gateway before calling createRefund to support crash recovery
      const gwPayment = await razorpayService.fetchPayment(razorpayPaymentId).catch(() => null);
      let refundResult: any;

      if (gwPayment && (gwPayment.amount_refunded || 0) >= payment.amount) {
        refundResult = {
          id: `rfnd_recovered_${booking._id.toString().slice(-8)}`,
          payment_id: razorpayPaymentId,
          amount: payment.amount,
          currency: 'INR',
          status: gwPayment.refund_status === 'full' ? 'processed' : 'pending',
        };
      } else {
        const receipt = `rfnd_late_${booking._id.toString().slice(-14)}`;
        refundResult = await razorpayService.createRefund(razorpayPaymentId, {
          amountPaise: payment.amount,
          notes: {
            bookingId: booking._id.toString(),
            razorpayOrderId,
            reason: 'Auto-refund: payment received after booking cancellation/expiration',
          },
          receipt,
        });
      }

      const actualStatus: 'pending' | 'processed' = refundResult.status === 'processed' ? 'processed' : 'pending';

      refundDoc = new Refund({
        paymentId: payment._id,
        bookingId: booking._id,
        razorpayRefundId: refundResult.id,
        razorpayPaymentId,
        amount: payment.amount,
        currency: 'INR',
        reason: 'Payment received after booking window expired/cancelled. Automatic 100% refund initiated.',
        status: actualStatus,
        initiatedByRole: 'system',
        idempotencyKey,
      });
      await refundDoc.save();
    }

    const finalRefundStatus = refundDoc.status === 'processed' ? 'processed' : 'pending';

    // Update payment & booking refund status consistently
    payment.refundedAmount = payment.amount;
    payment.status = 'refunded';
    await payment.save();

    booking.paymentStatus = 'refunded';
    booking.refundAmount = Math.round(payment.amount / 100);
    booking.refundStatus = finalRefundStatus;
    booking.razorpayPaymentId = razorpayPaymentId;
    await booking.save();

    // Release coupon reservation
    await couponService.releaseCouponReservation(booking._id, 'Booking expired before payment completed').catch(() => {});

    // Audit log
    await new AuditLog({
      adminId: actorUserId ? new Types.ObjectId(actorUserId.toString()) : booking.customerId,
      action: 'PAYMENT_CAPTURED_FOR_CANCELLED_BOOKING',
      targetId: booking._id,
      targetType: 'Booking',
      details: {
        bookingId: booking._id,
        razorpayOrderId,
        razorpayPaymentId,
        amountPaise: payment.amount,
        action: 'auto_refund_initiated',
        refundId: refundDoc._id,
      },
    }).save().catch(() => {});

    // Notify customer
    await sendInAppNotification({
      recipientId: booking.customerId._id || booking.customerId,
      type: 'REFUND_COMPLETED',
      title: 'Payment Refunded: Booking Expired',
      message: `Your payment of ₹${Math.round(payment.amount / 100)} was received after the booking appointment expired. A full refund has been automatically credited back to your payment method.`,
      bookingId: booking._id,
      dedupKey: `booking:${booking._id}:refund_late_payment`,
    }).catch(() => {});

    return {
      success: true,
      paymentStatus: 'refunded',
      refundedDueToCancellation: true,
      booking,
      payment,
      refund: refundDoc,
      message: 'Payment received for an expired booking. Full refund automatically processed.',
    };
  }

  // Case 2: Booking is currently 'accepted' - attempt atomic transition to paid
  const updatedBooking = await Booking.findOneAndUpdate(
    {
      _id: booking._id,
      status: 'accepted',
      paymentStatus: { $ne: 'paid' },
    },
    {
      $set: {
        paymentStatus: 'paid',
        paymentCompletedAt: new Date(),
        razorpayPaymentId,
        razorpaySignature: razorpaySignature || booking.razorpaySignature,
      },
    },
    { returnDocument: 'after' }
  );

  if (!updatedBooking) {
    // Check if background worker or another thread concurrently modified it
    const freshBooking = await Booking.findById(booking._id);
    if (freshBooking?.status === 'cancelled' || freshBooking?.status === 'rejected') {
      // Background worker expired the booking right as payment arrived! Re-route to auto-refund
      return reconcilePaymentCapture({
        ...params,
        bookingId: booking._id,
      });
    }

    if (freshBooking?.paymentStatus === 'paid') {
      return {
        success: true,
        paymentStatus: 'paid',
        booking: freshBooking,
        payment,
        message: 'Payment has already been verified and processed.',
      };
    }
  }

  // State committed: Update payment record
  payment.status = 'captured';
  payment.razorpayPaymentId = razorpayPaymentId;
  if (razorpaySignature) {
    payment.razorpaySignature = razorpaySignature;
    payment.signatureVerified = true;
  }
  payment.capturedAt = new Date();
  await payment.save();

  // Atomically redeem reserved coupon
  await couponService.redeemCoupon(booking._id).catch(() => {});

  // Schedule delayed background reminders (Milestone 5C)
  if (updatedBooking?.scheduledStartTime) {
    queueService
      .scheduleBookingReminders(booking._id.toString(), updatedBooking.scheduledStartTime)
      .catch((err) => console.warn('[Payment] Warning scheduling reminders:', err.message));
  }

  // Audit logs
  await Promise.allSettled([
    new AuditLog({
      adminId: actorUserId ? new Types.ObjectId(actorUserId.toString()) : booking.customerId,
      action: 'PAYMENT_VERIFIED',
      targetId: booking._id,
      targetType: 'Booking',
      details: {
        bookingId: booking._id,
        razorpayOrderId,
        razorpayPaymentId,
        source,
      },
    }).save(),
    new AuditLog({
      adminId: actorUserId ? new Types.ObjectId(actorUserId.toString()) : booking.customerId,
      action: 'PAYMENT_CAPTURED',
      targetId: booking._id,
      targetType: 'Booking',
      details: {
        bookingId: booking._id,
        amountPaise: payment.amount,
        currency: 'INR',
        source,
      },
    }).save(),
  ]);

  // Notifications
  const serviceName = (booking.serviceId as any)?.name || 'Home Service';
  const customerName = (booking.customerId as any)?.name || 'Customer';
  await Promise.allSettled([
    sendInAppNotification({
      recipientId: booking.customerId._id || booking.customerId,
      type: 'PAYMENT_SUCCESS',
      title: 'Payment Successful',
      message: `Your payment for ${serviceName} was verified successfully. Your booking is confirmed!`,
      bookingId: booking._id,
      dedupKey: `booking:${booking._id}:payment_success:customer`,
    }),
    sendInAppNotification({
      recipientId: booking.providerUserId,
      type: 'PAYMENT_SUCCESS',
      title: 'Customer Payment Confirmed',
      message: `Customer ${customerName} has completed payment for appointment (${booking._id.toString().slice(-8).toUpperCase()}). You may proceed with the scheduled job.`,
      bookingId: booking._id,
      dedupKey: `booking:${booking._id}:payment_success:provider`,
    }),
  ]);

  return {
    success: true,
    paymentStatus: 'paid',
    booking: updatedBooking || booking,
    payment,
    message: 'Payment verified and captured successfully. Your booking is confirmed!',
  };
};
