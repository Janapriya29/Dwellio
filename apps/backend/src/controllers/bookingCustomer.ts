import { Request, Response } from 'express';
import mongoose, { Types } from 'mongoose';
import { ApiResponse, BookingData, CreateBookingPayload, CancelBookingPayload } from '@dwellio/shared';
import { Booking } from '../models/Booking';
import { Service } from '../models/Service';
import { ProviderProfile } from '../models/ProviderProfile';
import { User } from '../models/User';
import { formatBookingDto, findConflictingProviderBooking, releaseProviderSlots } from '../utils/booking';

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
    res.status(500).json({
      success: false,
      message: 'Failed to create booking request.',
      error: error.message,
    });
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
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve bookings.',
      error: error.message,
    });
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
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve booking details.',
      error: error.message,
    });
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

    const response: ApiResponse<BookingData> = {
      success: true,
      message: 'Booking has been cancelled.',
      data: formatBookingDto(updated),
    };
    res.status(200).json(response);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to cancel booking.',
      error: error.message,
    });
  }
};
