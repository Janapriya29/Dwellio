import { Request, Response } from 'express';
import { ApiResponse, AdminOverviewData, BookingStatus, AuditLogData } from '@dwellio/shared';
import { User } from '../models/User';
import { ProviderProfile } from '../models/ProviderProfile';
import { Service } from '../models/Service';
import { Booking } from '../models/Booking';
import { Review } from '../models/Review';
import { AuditLog } from '../models/AuditLog';
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
 * Admin Overview & Platform Health Metrics
 * GET /api/admin/overview
 */
export const getAdminOverview = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [
      totalCustomers,
      totalProviders,
      pendingApplications,
      activeServices,
      totalBookings,
      totalReviews,
      statusStats,
      recentRawLogs,
    ] = await Promise.all([
      User.countDocuments({ role: 'customer' }),
      ProviderProfile.countDocuments({ verificationStatus: 'approved' }),
      ProviderProfile.countDocuments({ verificationStatus: 'pending' }),
      Service.countDocuments({ isActive: true }),
      Booking.countDocuments({}),
      Review.countDocuments({ isPublished: true }),
      Booking.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]),
      AuditLog.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('adminId', 'name email'),
    ]);

    // Initialize map of all booking statuses to 0
    const bookingsByStatus = ALL_BOOKING_STATUSES.reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {} as Record<BookingStatus, number>);

    // Overlay aggregated counts
    for (const item of statusStats) {
      if (item._id && typeof item._id === 'string' && item._id in bookingsByStatus) {
        bookingsByStatus[item._id as BookingStatus] = item.count;
      }
    }

    // Map recent audit logs safely without sensitive data
    const recentActivity: AuditLogData[] = recentRawLogs.map((log: any) => {
      const adminDoc = log.adminId;
      return {
        id: log._id.toString(),
        adminId: (adminDoc?._id || adminDoc || '').toString(),
        adminName: adminDoc?.name || 'Administrator',
        adminEmail: adminDoc?.email,
        action: log.action,
        targetId: log.targetId ? log.targetId.toString() : '',
        targetType: log.targetType || 'General',
        details: log.details || {},
        createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : new Date(log.createdAt).toISOString(),
      };
    });

    const overviewData: AdminOverviewData = {
      stats: {
        totalCustomers,
        totalProviders,
        pendingApplications,
        activeServices,
        totalBookings,
        bookingsByStatus,
        totalReviews,
      },
      recentActivity,
    };

    const response: ApiResponse<AdminOverviewData> = {
      success: true,
      message: 'Platform overview metrics retrieved successfully.',
      data: overviewData,
    };

    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'AdminOverview.getAdminOverview', error, 'Failed to retrieve platform overview.');
  }
};
