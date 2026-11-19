import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { ApiResponse, BookingData, CreateBookingPayload, CancelBookingPayload, RescheduleBookingPayload } from '@dwellio/shared';
import { Booking } from '../models/Booking';
import { Service } from '../models/Service';
import { ProviderProfile } from '../models/ProviderProfile';
import { User } from '../models/User';
import { SlotReservation } from '../models/SlotReservation';
import {
  formatBookingDto,
  findConflictingProviderBooking,
  releaseProviderSlots,
  migrateProviderSlots,
  cleanupObsoleteSlots,
  rollbackNewSlots,
} from '../utils/booking';
import { sendInAppNotification } from '../utils/notification';
import { sendInternalError } from '../utils/security';

const MIN_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

/**
 * Customer: Create a new service booking request
 * POST /api/bookings
 */
export const createBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const {
      serviceId,
      providerId,
      scheduledStartTime,
      scheduledEndTime,
      address,
      customerNotes,
    }: CreateBookingPayload = req.body;

    // 1. Basic validation
    if (!serviceId || !providerId || !scheduledStartTime || !scheduledEndTime || !address) {
      res.status(400).json({
        success: false,
        message: 'Missing required booking fields: serviceId, providerId, scheduledStartTime, scheduledEndTime, and address are required.',
      });
      return;
    }

    if (!Types.ObjectId.isValid(serviceId) || !Types.ObjectId.isValid(providerId)) {
      res.status(400).json({
        success: false,
        message: 'Invalid serviceId or providerId format.',
      });
      return;
    }

    if (!address.street?.trim() || !address.city?.trim()) {
      res.status(400).json({
        success: false,
        message: 'Address street and city are required.',
      });
      return;
    }

    // 2. Validate Service exists and is active
    const service = await Service.findById(serviceId);
    if (!service || !service.isActive) {
      res.status(404).json({
        success: false,
        message: 'Requested service is inactive, discontinued, or does not exist.',
      });
      return;
    }

    // 3. Validate Provider exists, is approved, and account is active
    const provider = await ProviderProfile.findById(providerId);
    if (!provider || provider.verificationStatus !== 'approved') {
      res.status(400).json({
        success: false,
        message: 'Selected service professional is not approved or unavailable.',
      });
      return;
    }

    const providerUser = await User.findById(provider.userId);
    if (!providerUser || !providerUser.isActive) {
      res.status(400).json({
        success: false,
        message: 'Selected service professional account is deactivated.',
      });
      return;
    }

    // Customer cannot book themselves
    if (provider.userId.toString() === req.user._id.toString()) {
      res.status(400).json({
        success: false,
        message: 'You cannot book your own service provider profile.',
      });
      return;
    }

    // 4. Confirm provider offers the service
    const hasCategory = provider.categories?.some(
      (catId) => catId.toString() === service.categoryId.toString()
    );
    const hasSkill = provider.skills?.some(
      (skill) =>
        skill.toLowerCase().includes(service.name.toLowerCase()) ||
        service.name.toLowerCase().includes(skill.toLowerCase())
    );

    if (!hasCategory && !hasSkill) {
      res.status(400).json({
        success: false,
        message: `Provider ${provider.displayName} does not offer the requested service (${service.name}).`,
      });
      return;
    }

    // 5. Validate Scheduling Window
    const startTime = new Date(scheduledStartTime);
    const endTime = new Date(scheduledEndTime);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      res.status(400).json({
        success: false,
        message: 'Invalid scheduledStartTime or scheduledEndTime format. Expected ISO 8601 strings.',
      });
      return;
    }

    // Future check (1-minute tolerance for network transmission)
    const now = Date.now() - 60000;
    if (startTime.getTime() <= now) {
      res.status(400).json({
        success: false,
        message: 'Scheduled start time cannot be in the past.',
      });
      return;
    }

    if (endTime.getTime() <= startTime.getTime()) {
      res.status(400).json({
        success: false,
        message: 'Scheduled end time must be after scheduled start time.',
      });
      return;
    }

    const duration = endTime.getTime() - startTime.getTime();
    if (duration < MIN_DURATION_MS) {
      res.status(400).json({
        success: false,
        message: 'Scheduled appointment duration must be at least 30 minutes.',
      });
      return;
    }

    if (duration > MAX_DURATION_MS) {
      res.status(400).json({
        success: false,
        message: 'Scheduled appointment duration cannot exceed 8 hours.',
      });
      return;
    }

    // 6. Overlap conflict checking
    const conflict = await findConflictingProviderBooking(provider._id, startTime, endTime);
    if (conflict) {
      res.status(409).json({
        success: false,
        message: 'The selected service professional already has an active booking during this time slot. Please choose another time or specialist.',
      });
      return;
    }

    // 7. Create Booking
    const newBooking = new Booking({
      customerId: req.user._id,
      providerId: provider._id,
      providerUserId: provider.userId,
      serviceId: service._id,
      categoryId: service.categoryId,
      scheduledStartTime: startTime,
      scheduledEndTime: endTime,
      address: {
        street: address.street.trim(),
        city: address.city.trim(),
        postalCode: address.postalCode?.trim(),
        landmark: address.landmark?.trim(),
      },
      customerNotes: customerNotes?.trim(),
      status: 'requested',
      statusHistory: [
        {
          actorId: req.user._id,
          actorRole: 'customer',
          fromStatus: 'requested',
          toStatus: 'requested',
          timestamp: new Date(),
          reason: 'Initial booking request submitted',
        },
      ],
    });

    await newBooking.save();

    // Trigger in-app notification to assigned provider (best-effort, non-blocking)
    await sendInAppNotification({
      recipientId: provider.userId,
      type: 'BOOKING_REQUESTED',
      title: 'New Booking Request',
      message: `New appointment requested by ${req.user.name} for ${service.name}.`,
      bookingId: newBooking._id,
      dedupKey: `booking:${newBooking._id}:requested`,
    });

    const populated = await Booking.findById(newBooking._id)
      .populate('customerId', 'name email')
      .populate('providerId', 'displayName phone serviceArea skills')
      .populate('serviceId', 'name slug')
      .populate('categoryId', 'name slug');

    const response: ApiResponse<BookingData> = {
      success: true,
      message: 'Booking request created successfully. Awaiting provider acceptance.',
      data: formatBookingDto(populated),
    };
    res.status(201).json(response);
  } catch (error: any) {
    sendInternalError(res, 'BookingCustomer.createBooking', error, 'Failed to create booking request.');
  }
};

/**
 * Customer: List all bookings belonging to authenticated customer
 * GET /api/bookings
 */
export const getCustomerBookings = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const { status } = req.query;
    const filter: any = { customerId: req.user._id };

    if (status && typeof status === 'string') {
      filter.status = status;
    }

    const bookings = await Booking.find(filter)
      .sort({ createdAt: -1 })
      .populate('customerId', 'name email')
      .populate('providerId', 'displayName phone serviceArea skills')
      .populate('serviceId', 'name slug')
      .populate('categoryId', 'name slug');

    const dtoList = bookings.map(formatBookingDto);

    const response: ApiResponse<BookingData[]> = {
      success: true,
      message: `Retrieved ${dtoList.length} customer bookings.`,
      data: dtoList,
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'BookingCustomer.getCustomerBookings', error, 'Failed to retrieve bookings.');
  }
};

/**
 * Customer: Get details for a single customer booking
 * GET /api/bookings/:id
 */
export const getCustomerBookingById = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || !Types.ObjectId.isValid(id)) {
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

    // Customer ownership rule: strictly verify customerId matches req.user._id
    if (booking.customerId._id.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: 'Access denied: you do not have permission to view this booking.',
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
    sendInternalError(res, 'BookingCustomer.getCustomerBookingById', error, 'Failed to retrieve booking details.');
  }
};

/**
 * Customer: Cancel an active booking request
 * PATCH /api/bookings/:id/cancel
 */
export const cancelCustomerBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { reason }: CancelBookingPayload = req.body || {};

    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    // Ownership check
    if (booking.customerId.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: 'Access denied: you cannot cancel a booking belonging to another user.',
      });
      return;
    }

    // Policy check: only 'requested' and 'accepted' can be cancelled by customer
    if (booking.status === 'on_the_way') {
      res.status(400).json({
        success: false,
        message: 'Cannot cancel booking once the service professional is on the way. Please contact support.',
      });
      return;
    }

    if (booking.status === 'in_progress') {
      res.status(400).json({
        success: false,
        message: 'Cannot cancel a booking while work is currently in progress.',
      });
      return;
    }

    if (['completed', 'cancelled', 'rejected'].includes(booking.status)) {
      res.status(400).json({
        success: false,
        message: `Booking is already in a terminal state (${booking.status}).`,
      });
      return;
    }

    // Concurrency-safe atomic cancellation
    const cancellationText = reason?.trim() || 'Cancelled by customer';
    const updated = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        customerId: req.user._id,
        status: { $in: ['requested', 'accepted'] },
      },
      {
        $set: {
          status: 'cancelled',
          cancellationReason: cancellationText,
        },
        $push: {
          statusHistory: {
            actorId: req.user._id,
            actorRole: 'customer',
            fromStatus: booking.status,
            toStatus: 'cancelled',
            timestamp: new Date(),
            reason: cancellationText,
          },
        },
      },
      { returnDocument: 'after' }
    )
      .populate('customerId', 'name email')
      .populate('providerId', 'displayName phone serviceArea skills')
      .populate('serviceId', 'name slug')
      .populate('categoryId', 'name slug');

    if (!updated) {
      res.status(409).json({
        success: false,
        message: 'Booking status was modified concurrently. Please refresh and try again.',
      });
      return;
    }

    // Release slot reservations when customer cancels booking
    await releaseProviderSlots(booking._id);

    // Trigger in-app notification to assigned provider (best-effort, non-blocking)
    const serviceName = (updated.serviceId as any)?.name || 'service';
    const safeReason = cancellationText.slice(0, 150);
    await sendInAppNotification({
      recipientId: booking.providerUserId,
      type: 'BOOKING_CANCELLED',
      title: 'Booking Cancelled by Customer',
      message: `Customer ${req.user.name} cancelled the appointment for ${serviceName}. Reason: ${safeReason}`,
      bookingId: booking._id,
      dedupKey: `booking:${booking._id}:cancelled_by_customer`,
    });

    const response: ApiResponse<BookingData> = {
      success: true,
      message: 'Booking has been cancelled.',
      data: formatBookingDto(updated),
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'BookingCustomer.cancelCustomerBooking', error, 'Failed to cancel booking.');
  }
};

/**
 * Customer: Reschedule an existing booking
 * PATCH /api/bookings/:id/reschedule
 */
export const rescheduleCustomerBooking = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    const { newStartTime, newEndTime, reason }: RescheduleBookingPayload = req.body;

    if (!newStartTime || !newEndTime) {
      res.status(400).json({
        success: false,
        message: 'Both newStartTime and newEndTime are required.',
      });
      return;
    }

    const start = new Date(newStartTime);
    const end = new Date(newEndTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({
        success: false,
        message: 'Invalid date/time format for newStartTime or newEndTime.',
      });
      return;
    }

    if (start.getTime() <= Date.now()) {
      res.status(400).json({
        success: false,
        message: 'New appointment start time must be in the future.',
      });
      return;
    }

    if (end.getTime() <= start.getTime()) {
      res.status(400).json({
        success: false,
        message: 'New appointment end time must be after start time.',
      });
      return;
    }

    const durationMs = end.getTime() - start.getTime();
    if (durationMs < MIN_DURATION_MS || durationMs > MAX_DURATION_MS) {
      res.status(400).json({
        success: false,
        message: 'Appointment duration must be between 30 minutes and 8 hours.',
      });
      return;
    }

    // Load booking
    const booking = await Booking.findById(id);
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    // Ownership check
    if (booking.customerId.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: 'Access denied: you cannot reschedule a booking belonging to another user.',
      });
      return;
    }

    // Status check
    if (booking.status === 'on_the_way') {
      res.status(400).json({
        success: false,
        message: 'Cannot reschedule booking once the service professional is on the way. Please contact support.',
      });
      return;
    }

    if (booking.status === 'in_progress') {
      res.status(400).json({
        success: false,
        message: 'Cannot reschedule a booking while work is currently in progress.',
      });
      return;
    }

    if (['completed', 'cancelled', 'rejected'].includes(booking.status)) {
      res.status(400).json({
        success: false,
        message: `Booking is already in a terminal state (${booking.status}).`,
      });
      return;
    }

    if (booking.status !== 'requested' && booking.status !== 'accepted') {
      res.status(400).json({
        success: false,
        message: `Booking with status ${booking.status} cannot be rescheduled.`,
      });
      return;
    }

    // Check provider conflict using findConflictingProviderBooking with excludeBookingId
    const conflict = await findConflictingProviderBooking(
      booking.providerId,
      start,
      end,
      booking._id
    );
    if (conflict) {
      res.status(409).json({
        success: false,
        message: 'The service professional has an overlapping appointment during this time window. Please choose another slot.',
      });
      return;
    }

    // Also check if any other booking holds slot reservations in that window
    const reservedByOther = await SlotReservation.findOne({
      providerId: booking.providerId,
      bookingId: { $ne: booking._id },
      slotTime: { $gte: start, $lt: end },
    });
    if (reservedByOther) {
      res.status(409).json({
        success: false,
        message: 'The requested appointment slot is already reserved by another customer. Please choose another slot.',
      });
      return;
    }

    const oldStart = booking.scheduledStartTime;
    const oldEnd = booking.scheduledEndTime;
    const isAccepted = booking.status === 'accepted';

    // Concurrency-safe slot migration for accepted bookings
    if (isAccepted) {
      const migrationResult = await migrateProviderSlots(
        booking.providerId,
        oldStart,
        oldEnd,
        start,
        end,
        booking._id
      );

      if (!migrationResult.success) {
        res.status(409).json({
          success: false,
          message: 'The requested appointment slot is no longer available. Please select another slot.',
        });
        return;
      }
    }

    const rescheduleReason = reason?.trim() ? `Rescheduled by customer: ${reason.trim()}` : 'Rescheduled by customer';

    // Atomic conditional update
    const updated = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        customerId: req.user._id,
        status: booking.status,
        scheduledStartTime: oldStart, // optimistic locking check
      },
      {
        $set: {
          scheduledStartTime: start,
          scheduledEndTime: end,
        },
        $push: {
          statusHistory: {
            actorId: req.user._id,
            actorRole: 'customer',
            fromStatus: booking.status,
            toStatus: booking.status,
            timestamp: new Date(),
            reason: rescheduleReason,
          },
        },
      },
      { returnDocument: 'after' }
    )
      .populate('customerId', 'name email')
      .populate('providerId', 'displayName phone serviceArea skills')
      .populate('serviceId', 'name slug')
      .populate('categoryId', 'name slug');

    if (!updated) {
      // Rollback newly acquired slot buckets if booking update failed
      if (isAccepted) {
        await rollbackNewSlots(booking._id, oldStart, oldEnd, start, end);
      }
      res.status(409).json({
        success: false,
        message: 'Booking was concurrently modified or updated by another action. Please refresh and try again.',
      });
      return;
    }

    // Cleanup obsolete slots now that the booking schedule is safely committed
    if (isAccepted) {
      await cleanupObsoleteSlots(booking._id, oldStart, oldEnd, start, end);
    }

    // Notify provider (best effort)
    const serviceName = (updated.serviceId as any)?.name || 'service';
    const safeReason = reason?.trim() ? reason.trim().slice(0, 150) : 'Schedule adjustment';
    await sendInAppNotification({
      recipientId: booking.providerUserId,
      type: 'BOOKING_RESCHEDULED',
      title: 'Booking Rescheduled by Customer',
      message: `Customer ${req.user.name} rescheduled the appointment for ${serviceName} to ${start.toLocaleString()}. Reason: ${safeReason}`,
      bookingId: booking._id,
      dedupKey: `booking:${booking._id}:rescheduled_${start.getTime()}`,
    });

    const response: ApiResponse<BookingData> = {
      success: true,
      message: 'Booking rescheduled successfully.',
      data: formatBookingDto(updated),
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'BookingCustomer.rescheduleCustomerBooking', error, 'Failed to reschedule booking.');
  }
};
