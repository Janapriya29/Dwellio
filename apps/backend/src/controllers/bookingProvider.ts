import { Request, Response } from 'express';
import { Types } from 'mongoose';
import {
  ApiResponse,
  BookingData,
  RejectBookingPayload,
  UpdateBookingStatusPayload,
  BookingStatus,
} from '@dwellio/shared';
import { Booking } from '../models/Booking';
import {
  formatBookingDto,
  findConflictingProviderBooking,
  acquireProviderSlots,
  releaseProviderSlots,
} from '../utils/booking';
import { sendInAppNotification } from '../utils/notification';
import { sendInternalError } from '../utils/security';

/**
 * Valid allowed status transitions for service providers
 */
const ALLOWED_PROVIDER_TRANSITIONS: Record<string, BookingStatus[]> = {
  accepted: ['on_the_way', 'cancelled'],
  on_the_way: ['in_progress'],
  in_progress: ['completed'],
};

/**
 * Provider: List all bookings assigned to the authenticated approved provider
 * GET /api/provider/bookings
 */
export const getProviderBookings = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.providerProfile) {
      res.status(403).json({ success: false, message: 'Provider profile required.' });
      return;
    }

    const { status } = req.query;
    const filter: any = { providerId: req.providerProfile._id };

    if (status && typeof status === 'string') {
      filter.status = status;
    }

    const bookings = await Booking.find(filter)
      .sort({ scheduledStartTime: 1, createdAt: -1 })
      .populate('customerId', 'name email phone')
      .populate('providerId', 'displayName phone serviceArea skills')
      .populate('serviceId', 'name slug')
      .populate('categoryId', 'name slug');

    const dtoList = bookings.map(formatBookingDto);

    const response: ApiResponse<BookingData[]> = {
      success: true,
      message: `Retrieved ${dtoList.length} provider bookings.`,
      data: dtoList,
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'BookingProvider.getProviderBookings', error, 'Failed to retrieve provider bookings.');
  }
};

/**
 * Provider: Get details for a single assigned booking
 * GET /api/provider/bookings/:id
 */
export const getProviderBookingById = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.providerProfile) {
      res.status(403).json({ success: false, message: 'Provider profile required.' });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    const booking = await Booking.findById(id)
      .populate('customerId', 'name email phone')
      .populate('providerId', 'displayName phone serviceArea skills')
      .populate('serviceId', 'name slug')
      .populate('categoryId', 'name slug');

    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    // Provider ownership check
    if (booking.providerId._id.toString() !== req.providerProfile._id.toString()) {
      res.status(403).json({
        success: false,
        message: 'Access denied: this booking is assigned to a different service provider.',
      });
      return;
    }

    const response: ApiResponse<BookingData> = {
      success: true,
      message: 'Booking details retrieved successfully.',
      data: formatBookingDto(booking),
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'BookingProvider.getProviderBookingById', error, 'Failed to retrieve booking details.');
  }
};

/**
 * Provider: Accept a requested booking with atomic overlap check
 * PATCH /api/provider/bookings/:id/accept
 */
export const acceptBooking = async (req: Request, res: Response): Promise<void> => {
  let slotsAcquired = false;
  let transitionCommitted = false;
  let bookingId: string | undefined;

  try {
    if (!req.user || !req.providerProfile) {
      res.status(403).json({ success: false, message: 'Approved provider credentials required.' });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    bookingId = booking._id.toString();

    // Provider ownership verification
    if (booking.providerId.toString() !== req.providerProfile._id.toString()) {
      res.status(403).json({
        success: false,
        message: 'Access denied: you cannot accept a booking assigned to another provider.',
      });
      return;
    }

    if (booking.status !== 'requested') {
      res.status(400).json({
        success: false,
        message: `Cannot accept booking with status '${booking.status}'. Only 'requested' bookings can be accepted.`,
      });
      return;
    }

    // 1. Conflict check before acceptance
    const conflict = await findConflictingProviderBooking(
      req.providerProfile._id,
      booking.scheduledStartTime,
      booking.scheduledEndTime,
      booking._id
    );

    if (conflict) {
      res.status(409).json({
        success: false,
        message: 'Cannot accept booking: you already have an accepted or active job during this scheduled time slot.',
      });
      return;
    }

    // 2. Concurrency-safe slot reservation acquisition via unique compound index
    const reservation = await acquireProviderSlots(
      req.providerProfile._id,
      booking.scheduledStartTime,
      booking.scheduledEndTime,
      booking._id
    );

    if (!reservation.success) {
      res.status(409).json({
        success: false,
        message: 'Cannot accept booking: you already have an accepted or active job during this scheduled time slot.',
      });
      return;
    }

    // Mark slot reservations as acquired for this attempt
    slotsAcquired = true;

    // 3. Atomic state transition from 'requested' -> 'accepted'
    // Separate the atomic update from population so the database commit boundary is exact
    const updated = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        providerId: req.providerProfile._id,
        status: 'requested', // Guarantees status hasn't changed concurrently
      },
      {
        $set: { status: 'accepted' },
        $push: {
          statusHistory: {
            actorId: req.user._id,
            actorRole: 'provider',
            fromStatus: 'requested',
            toStatus: 'accepted',
            timestamp: new Date(),
            reason: 'Booking accepted by service provider',
          },
        },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      // Concurrently modified or cancelled: release acquired slot reservations
      try {
        await releaseProviderSlots(booking._id);
      } catch (cleanupError: any) {
        console.error(
          `[BookingProvider.acceptBooking] Failed to release slot reservations for concurrently modified booking ${booking._id}:`,
          cleanupError?.message || cleanupError
        );
      }
      slotsAcquired = false;
      res.status(409).json({
        success: false,
        message: 'Booking was concurrently modified or already responded to.',
      });
      return;
    }

    // Booking state transition successfully committed to database
    transitionCommitted = true;

    // Populate relations for safe client DTO response
    await updated.populate([
      { path: 'customerId', select: 'name email phone' },
      { path: 'providerId', select: 'displayName phone serviceArea skills' },
      { path: 'serviceId', select: 'name slug' },
      { path: 'categoryId', select: 'name slug' },
    ]);

    // Trigger in-app notification to customer (best-effort, non-blocking)
    const providerName = (updated.providerId as any)?.displayName || req.providerProfile.displayName || 'Your service professional';
    const serviceName = (updated.serviceId as any)?.name || 'service';
    await sendInAppNotification({
      recipientId: booking.customerId,
      type: 'BOOKING_ACCEPTED',
      title: 'Booking Confirmed',
      message: `${providerName} confirmed your booking for ${serviceName}.`,
      bookingId: booking._id,
      dedupKey: `booking:${booking._id}:accepted`,
    });

    const response: ApiResponse<BookingData> = {
      success: true,
      message: 'Booking successfully accepted.',
      data: formatBookingDto(updated),
    };
    res.status(200).json(response);
  } catch (error: any) {
    if (slotsAcquired && !transitionCommitted && bookingId) {
      try {
        await releaseProviderSlots(bookingId);
      } catch (cleanupError: any) {
        console.error(
          `[BookingProvider.acceptBooking] Failed to clean up slot reservations after error for booking ${bookingId}:`,
          cleanupError?.message || cleanupError
        );
      }
    }
    sendInternalError(res, 'BookingProvider.acceptBooking', error, 'Failed to accept booking.');
  }
};

/**
 * Provider: Reject a requested booking
 * PATCH /api/provider/bookings/:id/reject
 */
export const rejectBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.providerProfile) {
      res.status(403).json({ success: false, message: 'Approved provider credentials required.' });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { reason }: RejectBookingPayload = req.body || {};

    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    if (booking.providerId.toString() !== req.providerProfile._id.toString()) {
      res.status(403).json({
        success: false,
        message: 'Access denied: this booking is assigned to a different provider.',
      });
      return;
    }

    if (booking.status !== 'requested') {
      res.status(400).json({
        success: false,
        message: `Cannot decline booking with status '${booking.status}'. Only 'requested' bookings can be declined.`,
      });
      return;
    }

    const rejectionText = reason?.trim() || 'Declined by service professional';

    const updated = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        providerId: req.providerProfile._id,
        status: 'requested',
      },
      {
        $set: {
          status: 'rejected',
          rejectionReason: rejectionText,
        },
        $push: {
          statusHistory: {
            actorId: req.user._id,
            actorRole: 'provider',
            fromStatus: 'requested',
            toStatus: 'rejected',
            timestamp: new Date(),
            reason: rejectionText,
          },
        },
      },
      { returnDocument: 'after' }
    )
      .populate('customerId', 'name email phone')
      .populate('providerId', 'displayName phone serviceArea skills')
      .populate('serviceId', 'name slug')
      .populate('categoryId', 'name slug');

    if (!updated) {
      res.status(409).json({
        success: false,
        message: 'Booking was concurrently modified or already responded to.',
      });
      return;
    }

    // Release any associated slot reservations if present
    await releaseProviderSlots(booking._id);

    // Trigger in-app notification to customer (best-effort, non-blocking)
    const providerName = (updated.providerId as any)?.displayName || req.providerProfile.displayName || 'The service professional';
    const safeReason = rejectionText.slice(0, 150);
    await sendInAppNotification({
      recipientId: booking.customerId,
      type: 'BOOKING_REJECTED',
      title: 'Booking Declined',
      message: `${providerName} was unable to accept your booking: "${safeReason}".`,
      bookingId: booking._id,
      dedupKey: `booking:${booking._id}:rejected`,
    });

    const response: ApiResponse<BookingData> = {
      success: true,
      message: 'Booking has been declined.',
      data: formatBookingDto(updated),
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'BookingProvider.rejectBooking', error, 'Failed to decline booking.');
  }
};

/**
 * Provider: Update status for an active booking (on_the_way -> in_progress -> completed, or cancelled)
 * PATCH /api/provider/bookings/:id/status
 */
export const updateBookingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.providerProfile) {
      res.status(403).json({ success: false, message: 'Approved provider credentials required.' });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status: targetStatus, reason }: UpdateBookingStatusPayload = req.body || {};

    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    if (!targetStatus) {
      res.status(400).json({ success: false, message: 'Target status is required.' });
      return;
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    if (booking.providerId.toString() !== req.providerProfile._id.toString()) {
      res.status(403).json({
        success: false,
        message: 'Access denied: this booking is assigned to a different provider.',
      });
      return;
    }

    // Verify allowed transitions
    const allowedTargets = ALLOWED_PROVIDER_TRANSITIONS[booking.status] || [];
    if (!allowedTargets.includes(targetStatus)) {
      res.status(400).json({
        success: false,
        message: `Invalid status transition: cannot move from '${booking.status}' to '${targetStatus}'. Allowed next states: [${allowedTargets.join(', ')}].`,
      });
      return;
    }

    const statusReasonText = reason?.trim() || `Status updated to ${targetStatus}`;

    const updateFields: any = {
      status: targetStatus,
    };

    if (targetStatus === 'cancelled') {
      updateFields.cancellationReason = statusReasonText;
    }

    const updated = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        providerId: req.providerProfile._id,
        status: booking.status, // Optimistic concurrency check
      },
      {
        $set: updateFields,
        $push: {
          statusHistory: {
            actorId: req.user._id,
            actorRole: 'provider',
            fromStatus: booking.status,
            toStatus: targetStatus,
            timestamp: new Date(),
            reason: statusReasonText,
          },
        },
      },
      { returnDocument: 'after' }
    )
      .populate('customerId', 'name email phone')
      .populate('providerId', 'displayName phone serviceArea skills')
      .populate('serviceId', 'name slug')
      .populate('categoryId', 'name slug');

    if (!updated) {
      res.status(409).json({
        success: false,
        message: 'Booking status was concurrently updated by another process. Please refresh.',
      });
      return;
    }

    // Release slot reservations on terminal completion or cancellation
    if (targetStatus === 'cancelled' || targetStatus === 'completed') {
      await releaseProviderSlots(booking._id);
    }

    // Trigger in-app notification to customer based on target status (best-effort, non-blocking)
    const providerName = (updated.providerId as any)?.displayName || req.providerProfile.displayName || 'Your service professional';
    const serviceName = (updated.serviceId as any)?.name || 'service';

    if (targetStatus === 'on_the_way') {
      await sendInAppNotification({
        recipientId: booking.customerId,
        type: 'BOOKING_ON_THE_WAY',
        title: 'Provider On The Way',
        message: `${providerName} is on the way to your service location.`,
        bookingId: booking._id,
        dedupKey: `booking:${booking._id}:on_the_way`,
      });
    } else if (targetStatus === 'in_progress') {
      await sendInAppNotification({
        recipientId: booking.customerId,
        type: 'BOOKING_IN_PROGRESS',
        title: 'Service In Progress',
        message: `Work has started on your ${serviceName} appointment.`,
        bookingId: booking._id,
        dedupKey: `booking:${booking._id}:in_progress`,
      });
    } else if (targetStatus === 'completed') {
      await sendInAppNotification({
        recipientId: booking.customerId,
        type: 'BOOKING_COMPLETED',
        title: 'Service Completed',
        message: `Your ${serviceName} service has been completed. Leave a verified review to rate your pro!`,
        bookingId: booking._id,
        dedupKey: `booking:${booking._id}:completed`,
      });
    } else if (targetStatus === 'cancelled') {
      const safeReason = statusReasonText.slice(0, 150);
      await sendInAppNotification({
        recipientId: booking.customerId,
        type: 'BOOKING_CANCELLED',
        title: 'Booking Cancelled by Provider',
        message: `${providerName} cancelled the appointment: "${safeReason}".`,
        bookingId: booking._id,
        dedupKey: `booking:${booking._id}:cancelled_by_provider`,
      });
    }

    const response: ApiResponse<BookingData> = {
      success: true,
      message: `Booking status successfully updated to '${targetStatus}'.`,
      data: formatBookingDto(updated),
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'BookingProvider.updateBookingStatus', error, 'Failed to update booking status.');
  }
};

/**
 * Provider: Cancel an assigned booking with structured explanation (Milestone 2C)
 * PATCH /api/provider/bookings/:id/cancel
 */
export const cancelBookingByProvider = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.providerProfile) {
      res.status(403).json({ success: false, message: 'Approved provider credentials required.' });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { reason }: { reason?: string } = req.body || {};

    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500) {
      res.status(400).json({
        success: false,
        message: 'Cancellation reason must be provided (between 5 and 500 characters).',
      });
      return;
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    if (booking.providerId.toString() !== req.providerProfile._id.toString()) {
      res.status(403).json({
        success: false,
        message: 'Access denied: this booking is assigned to a different provider.',
      });
      return;
    }

    if (['completed', 'cancelled', 'rejected'].includes(booking.status)) {
      res.status(400).json({
        success: false,
        message: `Cannot cancel a booking with status '${booking.status}'.`,
      });
      return;
    }

    const cleanReason = reason.trim();

    const updated = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        providerId: req.providerProfile._id,
        status: booking.status, // Optimistic concurrency check
      },
      {
        $set: {
          status: 'cancelled',
          cancellationReason: cleanReason,
        },
        $push: {
          statusHistory: {
            actorId: req.user._id,
            actorRole: 'provider',
            fromStatus: booking.status,
            toStatus: 'cancelled',
            timestamp: new Date(),
            reason: cleanReason,
          },
        },
      },
      { returnDocument: 'after' }
    )
      .populate('customerId', 'name email phone')
      .populate('providerId', 'displayName phone serviceArea skills')
      .populate('serviceId', 'name slug')
      .populate('categoryId', 'name slug');

    if (!updated) {
      res.status(409).json({
        success: false,
        message: 'Booking was concurrently modified by another request. Please refresh.',
      });
      return;
    }

    // Release any associated slot reservations
    await releaseProviderSlots(booking._id);

    // Notify customer
    const providerName = (updated.providerId as any)?.displayName || req.providerProfile.displayName || 'The service professional';
    const safeReason = cleanReason.slice(0, 150);
    await sendInAppNotification({
      recipientId: booking.customerId,
      type: 'BOOKING_CANCELLED',
      title: 'Booking Cancelled by Provider',
      message: `${providerName} cancelled the appointment: "${safeReason}".`,
      bookingId: booking._id,
      dedupKey: `booking:${booking._id}:cancelled_by_provider`,
    });

    const response: ApiResponse<BookingData> = {
      success: true,
      message: 'Booking successfully cancelled.',
      data: formatBookingDto(updated),
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'BookingProvider.cancelBookingByProvider', error, 'Failed to cancel booking.');
  }
};
