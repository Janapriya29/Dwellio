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
