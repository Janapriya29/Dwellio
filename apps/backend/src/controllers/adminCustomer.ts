import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  ApiResponse,
  PaginationMeta,
  AdminCustomerItem,
  AdminCustomerDetail,
  BookingStatus,
  BookingData,
} from '@dwellio/shared';
import { User, IUser } from '../models/User';
import { Booking } from '../models/Booking';
import { AuditLog } from '../models/AuditLog';
import { sendInAppNotification } from '../utils/notification';
import { formatBookingDto } from '../utils/booking';
import { sendInternalError } from '../utils/security';

const ALL_BOOKING_STATUSES: BookingStatus[] = [
  'requested',
  'accepted',
  'on_the_way',
  'in_progress',
  'completed',
  'cancelled',
  'rejected',
];

/**
 * List Customers for Administrative Governance
 * GET /api/admin/customers
 */
export const listAdminCustomers = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const { q, status } = req.query;

    const filter: Record<string, unknown> = {
      role: 'customer',
    };

    if (status === 'active') {
      filter.isActive = true;
    } else if (status === 'suspended') {
      filter.isActive = false;
    }

    if (q && typeof q === 'string' && q.trim().length > 0) {
      const sanitized = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: sanitized, $options: 'i' } },
        { email: { $regex: sanitized, $options: 'i' } },
        { phone: { $regex: sanitized, $options: 'i' } },
      ];
    }

    const total = await User.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    // Fast atomic aggregation pipeline to aggregate customer bookings and spend without N+1 queries
    const customersRaw = await User.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: 'bookings',
          let: { custId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$customerId', '$$custId'] } } },
            {
              $group: {
                _id: null,
                totalBookings: { $sum: 1 },
                totalSpend: {
                  $sum: {
                    $cond: [
                      { $eq: ['$status', 'completed'] },
                      { $ifNull: ['$priceSnapshot', 499] },
                      0,
                    ],
                  },
                },
              },
            },
          ],
          as: 'bookingMetrics',
        },
      },
    ]);

    const customers: AdminCustomerItem[] = customersRaw.map((u: any) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      phone: u.phone,
      isActive: u.isActive ?? true,
      totalBookings: u.bookingMetrics?.[0]?.totalBookings || 0,
      totalRecordedSpend: Math.round(u.bookingMetrics?.[0]?.totalSpend || 0),
      createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : new Date(u.createdAt).toISOString(),
    }));

    const pagination: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
    };

    const response: ApiResponse<{ customers: AdminCustomerItem[]; pagination: PaginationMeta }> = {
      success: true,
      message: 'Customers retrieved successfully.',
      data: {
        customers,
        pagination,
      },
    };

    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'AdminCustomer.listAdminCustomers', error, 'Failed to retrieve customers.');
  }
};

/**
 * Get Detailed Customer Profile & Booking History (Admin)
 * GET /api/admin/customers/:id
 */
export const getAdminCustomerById = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;

    if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid customer ID format.' });
      return;
    }

    const customer = await User.findOne({ _id: id, role: 'customer' });
    if (!customer) {
      res.status(404).json({ success: false, message: 'Customer account not found.' });
      return;
    }

    const [statusAgg, recentBookingsRaw] = await Promise.all([
      Booking.aggregate([
        { $match: { customerId: customer._id } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            spend: {
              $sum: {
                $cond: [
                  { $eq: ['$status', 'completed'] },
                  { $ifNull: ['$priceSnapshot', 499] },
                  0,
                ],
              },
            },
          },
        },
      ]),
      Booking.find({ customerId: customer._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('providerId', 'displayName phone serviceArea skills')
        .populate('serviceId', 'name slug')
        .populate('categoryId', 'name slug'),
    ]);

    const bookingStatusCounts = ALL_BOOKING_STATUSES.reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {} as Record<BookingStatus, number>);

    let totalBookings = 0;
    let totalRecordedSpend = 0;

    for (const item of statusAgg) {
      if (item._id && typeof item._id === 'string' && item._id in bookingStatusCounts) {
        bookingStatusCounts[item._id as BookingStatus] = item.count;
      }
      totalBookings += item.count || 0;
      totalRecordedSpend += item.spend || 0;
    }

    const recentBookings: BookingData[] = recentBookingsRaw.map(formatBookingDto);

    const customerDetail: AdminCustomerDetail = {
      id: customer._id.toString(),
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      isActive: customer.isActive ?? true,
      totalBookings,
      totalRecordedSpend: Math.round(totalRecordedSpend),
      bookingStatusCounts,
      recentBookings,
      createdAt: customer.createdAt instanceof Date ? customer.createdAt.toISOString() : new Date(customer.createdAt).toISOString(),
    };

    const response: ApiResponse<AdminCustomerDetail> = {
      success: true,
      message: 'Customer details retrieved successfully.',
      data: customerDetail,
    };

    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'AdminCustomer.getAdminCustomerById', error, 'Failed to retrieve customer details.');
  }
};

/**
 * Suspend or Reactivate Customer Account (Admin)
 * PATCH /api/admin/customers/:id/status
 */
export const updateCustomerStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { isActive, reason } = req.body;

    if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid customer ID format.' });
      return;
    }

    if (isActive === undefined || typeof isActive !== 'boolean') {
      res.status(400).json({ success: false, message: 'isActive boolean flag is required.' });
      return;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 500) {
      res.status(400).json({
        success: false,
        message: 'A status change reason between 5 and 500 characters is required.',
      });
      return;
    }

    const targetUser = await User.findById(id);
    if (!targetUser) {
      res.status(404).json({ success: false, message: 'User account not found.' });
      return;
    }

    // Security Guard: Prevent modifying administrator accounts through customer management
    if (targetUser.role === 'admin') {
      res.status(403).json({
        success: false,
        message: 'Administrator accounts cannot be modified through customer governance.',
      });
      return;
    }

    // Security Guard: Prevent self-suspension
    if (req.user && targetUser._id.toString() === req.user._id.toString()) {
      res.status(400).json({
        success: false,
        message: 'Self-suspension of the currently authenticated administrator is forbidden.',
      });
      return;
    }

    const previousStatus = targetUser.isActive;
    targetUser.isActive = isActive;
    await targetUser.save();

    // Create immutable audit log
    if (req.user) {
      await new AuditLog({
        adminId: req.user._id,
        action: 'CUSTOMER_STATUS_CHANGED',
        targetId: targetUser._id,
        targetType: 'User',
        details: {
          previousStatus,
          newStatus: isActive,
          reason: reason.trim(),
          userRole: targetUser.role,
        },
      }).save().catch(() => {});
    }

    // Trigger notification if account is suspended
    if (!isActive) {
      await sendInAppNotification({
        recipientId: targetUser._id,
        type: 'ACCOUNT_SUSPENDED',
        title: 'Account Status Notice',
        message: `Your Dwellio account has been suspended: "${reason.trim().slice(0, 150)}". Please contact support.`,
        dedupKey: `user:${targetUser._id}:suspended:${Date.now()}`,
      }).catch(() => {});
    }

    res.status(200).json({
      success: true,
      message: `Customer account ${isActive ? 'reactivated' : 'suspended'} successfully.`,
      data: {
        id: targetUser._id.toString(),
        name: targetUser.name,
        email: targetUser.email,
        isActive: targetUser.isActive,
      },
    });
  } catch (error: any) {
    sendInternalError(res, 'AdminCustomer.updateCustomerStatus', error, 'Failed to update customer status.');
  }
};
