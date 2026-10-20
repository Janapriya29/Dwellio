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
import { formatBookingDto } from '../utils/booking';
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
 * GET /api/admin/bookings
 */
export const listAdminBookings = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const { status, dateFrom, dateTo } = req.query;

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
