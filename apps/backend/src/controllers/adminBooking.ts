import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  ApiResponse,
  PaginationMeta,
  AdminBookingItem,
  BookingData,
  BookingStatus,
} from '@dwellio/shared';
import { Booking } from '../models/Booking';
import { User } from '../models/User';
import { ProviderProfile } from '../models/ProviderProfile';
import { AuditLog } from '../models/AuditLog';
import { formatBookingDto, releaseProviderSlots } from '../utils/booking';
import { queueService } from '../services/queueService';
import { sendInAppNotification } from '../utils/notification';
import { sendInternalError } from '../utils/security';

const VALID_STATUSES: BookingStatus[] = [
  'requested',
  'accepted',
  'on_the_way',
  'in_progress',
  'completed',
  'cancelled',
  'rejected',
];

/**
 * List Platform Bookings (Admin Oversight)
 * Supports search (q), status filtering, and date range filters
 * GET /api/admin/bookings
 */
export const listAdminBookings = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const { status, dateFrom, dateTo, q } = req.query;

    const filter: Record<string, unknown> = {};

    if (status && typeof status === 'string') {
      if (!VALID_STATUSES.includes(status as BookingStatus)) {
        res.status(400).json({
          success: false,
          message: `Invalid status filter. Allowed values: ${VALID_STATUSES.join(', ')}`,
        });
        return;
      }
      filter.status = status;
    }

    if (dateFrom || dateTo) {
      const dateFilter: Record<string, Date> = {};
      if (dateFrom && typeof dateFrom === 'string') {
        const d = new Date(dateFrom);
        if (isNaN(d.getTime())) {
          res.status(400).json({ success: false, message: 'Invalid dateFrom filter format.' });
          return;
        }
        dateFilter.$gte = d;
      }
      if (dateTo && typeof dateTo === 'string') {
        const d = new Date(dateTo);
        if (isNaN(d.getTime())) {
          res.status(400).json({ success: false, message: 'Invalid dateTo filter format.' });
          return;
        }
        dateFilter.$lte = d;
      }
      filter.scheduledStartTime = dateFilter;
    }

    if (q && typeof q === 'string' && q.trim().length > 0) {
      const sanitized = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // If valid ObjectId, match exact booking ID
      if (mongoose.Types.ObjectId.isValid(q.trim())) {
        filter._id = new mongoose.Types.ObjectId(q.trim());
      } else {
        // Find matching customer or provider IDs
        const [matchingUsers, matchingProviders] = await Promise.all([
          User.find({
            $or: [
              { name: { $regex: sanitized, $options: 'i' } },
              { email: { $regex: sanitized, $options: 'i' } },
            ],
          }).select('_id'),
          ProviderProfile.find({
            displayName: { $regex: sanitized, $options: 'i' },
          }).select('_id'),
        ]);

        const userIds = matchingUsers.map((u) => u._id);
        const providerIds = matchingProviders.map((p) => p._id);

        filter.$or = [
          { customerId: { $in: userIds } },
          { providerId: { $in: providerIds } },
        ];
      }
    }

    const total = await Booking.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const rawBookings = await Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('customerId', 'name email')
      .populate('providerId', 'displayName phone')
      .populate('serviceId', 'name slug');

    const bookings: AdminBookingItem[] = rawBookings.map((b: any) => ({
      id: b._id.toString(),
      serviceName: b.serviceId?.name || 'Home Service',
      customerName: b.customerId?.name || 'Customer',
      customerEmail: b.customerId?.email,
      providerDisplayName: b.providerId?.displayName || 'Assigned Provider',
      providerPhone: b.providerId?.phone,
      scheduledStartTime: b.scheduledStartTime instanceof Date ? b.scheduledStartTime.toISOString() : new Date(b.scheduledStartTime).toISOString(),
      scheduledEndTime: b.scheduledEndTime instanceof Date ? b.scheduledEndTime.toISOString() : new Date(b.scheduledEndTime).toISOString(),
      status: b.status,
      createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : new Date(b.createdAt).toISOString(),
    }));

    const pagination: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
    };

    const response: ApiResponse<{ bookings: AdminBookingItem[]; pagination: PaginationMeta }> = {
      success: true,
      message: 'Platform bookings retrieved successfully.',
      data: {
        bookings,
        pagination,
      },
    };

    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'AdminBooking.listAdminBookings', error, 'Failed to retrieve bookings.');
  }
};

/**
 * Get Single Booking Oversight Details (Admin)
 * GET /api/admin/bookings/:id
 */
export const getAdminBookingById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    const booking = await Booking.findById(id)
      .populate('customerId', 'name email')
      .populate('providerId', 'displayName phone serviceArea skills')
      .populate('serviceId', 'name slug')
      .populate('categoryId', 'name slug');

    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    const response: ApiResponse<BookingData> = {
      success: true,
      message: 'Booking details retrieved successfully.',
      data: formatBookingDto(booking),
    };

    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'AdminBooking.getAdminBookingById', error, 'Failed to retrieve booking details.');
  }
};

/**
 * Cancel Booking (Admin Intervention)
 * PATCH /api/admin/bookings/:id/cancel
 */
export const adminCancelBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { reason } = req.body;

    if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500) {
      res.status(400).json({
        success: false,
        message: 'A cancellation reason between 5 and 500 characters is required.',
      });
      return;
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    if (booking.status === 'completed') {
      res.status(400).json({
        success: false,
        message: 'Completed bookings cannot be cancelled.',
      });
      return;
    }

    if (booking.status === 'cancelled') {
      res.status(400).json({
        success: false,
        message: 'Booking is already cancelled.',
      });
      return;
    }

    const previousStatus = booking.status;
    booking.status = 'cancelled';
    booking.cancellationReason = reason.trim();
    booking.statusHistory.push({
      actorId: req.user!._id,
      actorRole: 'admin',
      fromStatus: previousStatus,
      toStatus: 'cancelled',
      timestamp: new Date(),
      reason: reason.trim(),
    });

    await booking.save();

    // Concurrency-safe release of any held slot reservations
    await releaseProviderSlots(booking._id).catch(() => {});

    // Cancel appointment reminders (Milestone 5C)
    queueService.cancelBookingReminders(booking._id.toString()).catch(() => {});

    // Lock associated conversation upon cancellation (Phase 5 Remediation)
    const { Conversation } = await import('../models/Conversation');
    await Conversation.findOneAndUpdate(
      { bookingId: booking._id },
      { $set: { status: 'locked', lockedAt: new Date(), lockReason: 'Booking cancelled by administrator' } }
    ).catch(() => {});

    // Release coupon reservation if any
    const { couponService } = await import('../services/couponService');
    await couponService.releaseCouponReservation(booking._id, 'Booking cancelled by administrator').catch(() => {});

    // If booking was paid, automatically process full refund (Phase 4C)
    if (booking.paymentStatus === 'paid') {
      const { processAutomaticBookingRefund } = await import('../utils/payment');
      await processAutomaticBookingRefund(booking._id, reason.trim(), 'admin', req.user!._id).catch((err) => {
        console.error('[AdminBooking.adminCancelBooking] Failed to process auto refund:', err);
      });
    }

    // Record immutable audit log
    if (req.user) {
      await new AuditLog({
        adminId: req.user._id,
        action: 'BOOKING_ADMIN_CANCELLED',
        targetId: booking._id,
        targetType: 'Booking',
        details: {
          bookingId: booking._id,
          customerId: booking.customerId,
          providerId: booking.providerId,
          previousStatus,
          reason: reason.trim(),
        },
      }).save().catch(() => {});
    }

    // Dispatch notifications to both customer and provider
    const safeReason = reason.trim().slice(0, 150);
    await Promise.allSettled([
      sendInAppNotification({
        recipientId: booking.customerId,
        type: 'BOOKING_ADMIN_CANCELLED',
        title: 'Booking Cancelled by Administration',
        message: `Your booking (${booking._id}) was cancelled by administration: "${safeReason}".`,
        bookingId: booking._id,
        dedupKey: `booking:${booking._id}:admin_cancelled:customer`,
      }),
      sendInAppNotification({
        recipientId: booking.providerUserId,
        type: 'BOOKING_ADMIN_CANCELLED',
        title: 'Booking Cancelled by Administration',
        message: `Booking (${booking._id}) has been cancelled by administration: "${safeReason}". The slot has been released.`,
        bookingId: booking._id,
        dedupKey: `booking:${booking._id}:admin_cancelled:provider`,
      }),
    ]);

    const populated = await Booking.findById(booking._id)
      .populate('customerId', 'name email')
      .populate('providerId', 'displayName phone')
      .populate('serviceId', 'name slug')
      .populate('categoryId', 'name slug');

    res.status(200).json({
      success: true,
      message: 'Booking cancelled by administration successfully.',
      data: formatBookingDto(populated || booking),
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminBooking.adminCancelBooking', error, 'Failed to cancel booking.');
  }
};

/**
 * Update Booking Payment Status (Admin Intervention)
 * PATCH /api/admin/bookings/:id/payment-status
 */
export const adminUpdatePaymentStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { paymentStatus, reason } = req.body;

    if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    const ALLOWED_PAYMENT_STATUSES = ['unpaid', 'paid', 'refunded', 'pending_verification'];
    if (!paymentStatus || !ALLOWED_PAYMENT_STATUSES.includes(paymentStatus)) {
      res.status(400).json({
        success: false,
        message: `Invalid payment status. Allowed values: ${ALLOWED_PAYMENT_STATUSES.join(', ')}`,
      });
      return;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500) {
      res.status(400).json({
        success: false,
        message: 'A reason between 5 and 500 characters is required for modifying payment status.',
      });
      return;
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    const previousPaymentStatus = booking.paymentStatus || 'unpaid';
    booking.paymentStatus = paymentStatus;
    booking.paymentStatusReason = reason.trim();
    booking.paymentStatusUpdatedAt = new Date();
    booking.paymentStatusUpdatedBy = req.user!._id;

    await booking.save();

    if (req.user) {
      await new AuditLog({
        adminId: req.user._id,
        action: 'BOOKING_PAYMENT_STATUS_CHANGED',
        targetId: booking._id,
        targetType: 'Booking',
        details: {
          bookingId: booking._id,
          previousPaymentStatus,
          newPaymentStatus: paymentStatus,
          reason: reason.trim(),
        },
      }).save().catch(() => {});
    }

    const populated = await Booking.findById(booking._id)
      .populate('customerId', 'name email')
      .populate('providerId', 'displayName phone')
      .populate('serviceId', 'name slug')
      .populate('categoryId', 'name slug');

    res.status(200).json({
      success: true,
      message: `Payment status updated to "${paymentStatus}" successfully.`,
      data: formatBookingDto(populated || booking),
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminBooking.adminUpdatePaymentStatus', error, 'Failed to update payment status.');
  }
};

/**
 * Admin: Issue Full or Partial Refund for a Paid Booking
 * POST /api/admin/bookings/:id/refund
 */
export const adminInitiateRefund = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { amount, reason } = req.body || {};

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID.' });
      return;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      res.status(400).json({
        success: false,
        message: 'A structured reason of at least 5 characters is required for issuing refunds.',
      });
      return;
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    if (booking.paymentStatus !== 'paid' && booking.paymentStatus !== 'pending_verification') {
      res.status(400).json({
        success: false,
        message: `Cannot issue refund for booking with payment status "${booking.paymentStatus}". Only paid bookings are refundable.`,
      });
      return;
    }

    const { Payment } = await import('../models/Payment');
    const { Refund } = await import('../models/Refund');
    const { razorpayService } = await import('../services/razorpayService');

    const payment = await Payment.findOne({ bookingId: booking._id, status: 'captured' });
    if (!payment || !payment.razorpayPaymentId) {
      res.status(400).json({
        success: false,
        message: 'No captured gateway payment record found for this booking.',
      });
      return;
    }

    const maxRefundablePaise = Math.max(0, payment.amount - (payment.refundedAmount || 0));
    if (maxRefundablePaise <= 0) {
      res.status(400).json({
        success: false,
        message: 'This payment has already been fully refunded.',
      });
      return;
    }

    let refundPaise = maxRefundablePaise;
    if (typeof amount === 'number' && amount > 0) {
      const requestedPaise = Math.round(amount * 100);
      if (requestedPaise > maxRefundablePaise) {
        res.status(400).json({
          success: false,
          message: `Requested refund amount (₹${amount}) exceeds maximum refundable balance of ₹${Math.round(
            maxRefundablePaise / 100
          )}.`,
        });
        return;
      }
      refundPaise = requestedPaise;
    }

    // Call Razorpay Refund API
    const refundResult = await razorpayService.createRefund(payment.razorpayPaymentId, {
      amountPaise: refundPaise,
      notes: {
        bookingId: booking._id.toString(),
        reason: reason.trim(),
        adminId: req.user!._id.toString(),
      },
      receipt: `rfnd_adm_${booking._id.toString().slice(-8)}_${Date.now().toString().slice(-4)}`,
    });

    const refundDoc = new Refund({
      paymentId: payment._id,
      bookingId: booking._id,
      razorpayRefundId: refundResult.id,
      razorpayPaymentId: payment.razorpayPaymentId,
      amount: refundPaise,
      currency: 'INR',
      reason: reason.trim(),
      status: 'processed',
      initiatedByRole: 'admin',
      initiatedByUserId: req.user!._id,
      idempotencyKey: `admin_refund:${booking._id.toString()}:${refundPaise}:${Date.now()}`,
    });
    await refundDoc.save();

    // Update payment refunded amount
    payment.refundedAmount = (payment.refundedAmount || 0) + refundPaise;
    if (payment.refundedAmount >= payment.amount) {
      payment.status = 'refunded';
    } else {
      payment.status = 'partially_refunded';
    }
    await payment.save();

    // Update booking refund status
    const isFullRefund = payment.refundedAmount >= payment.amount;
    booking.paymentStatus = isFullRefund ? 'refunded' : 'paid';
    booking.refundAmount = Math.round(payment.refundedAmount / 100);
    booking.refundStatus = isFullRefund ? 'processed' : 'partially_refunded';
    await booking.save();

    // Audit log
    await new AuditLog({
      adminId: req.user!._id,
      action: 'REFUND_COMPLETED',
      targetId: booking._id,
      targetType: 'Booking',
      details: {
        bookingId: booking._id,
        refundAmountRupees: Math.round(refundPaise / 100),
        razorpayRefundId: refundResult.id,
        reason: reason.trim(),
      },
    }).save().catch(() => {});

    // Notify customer
    await sendInAppNotification({
      recipientId: booking.customerId,
      type: 'REFUND_COMPLETED',
      title: 'Refund Processed by Administration',
      message: `A refund of ₹${Math.round(refundPaise / 100)} has been processed for your booking (${booking._id
        .toString()
        .slice(-8)
        .toUpperCase()}). Reason: ${reason.trim()}`,
      bookingId: booking._id,
      dedupKey: `booking:${booking._id}:admin_refund:${refundPaise}`,
    }).catch(() => {});

    const populated = await Booking.findById(booking._id)
      .populate('customerId', 'name email')
      .populate('providerId', 'displayName phone')
      .populate('serviceId', 'name slug')
      .populate('categoryId', 'name slug');

    res.status(200).json({
      success: true,
      message: `Refund of ₹${Math.round(refundPaise / 100)} processed successfully.`,
      data: {
        booking: formatBookingDto(populated || booking),
        refund: {
          id: refundDoc._id.toString(),
          razorpayRefundId: refundResult.id,
          amountRupees: Math.round(refundPaise / 100),
          status: refundDoc.status,
        },
      },
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminBooking.adminInitiateRefund', error, 'Failed to process refund.');
  }
};
