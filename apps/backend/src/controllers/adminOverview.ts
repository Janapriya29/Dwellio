import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  ApiResponse,
  AdminOverviewData,
  AdminOverviewStats,
  BookingStatus,
  AuditLogData,
  AdminFinancialMetrics,
  AdminAnalyticsData,
  TopServicePerformance,
  CategoryPerformanceItem,
  BookingTrendItem,
} from '@dwellio/shared';
import { User } from '../models/User';
import { ProviderProfile } from '../models/ProviderProfile';
import { Service } from '../models/Service';
import { Category } from '../models/Category';
import { Booking } from '../models/Booking';
import { Review } from '../models/Review';
import { AuditLog } from '../models/AuditLog';
import { getOrCreatePlatformSettings } from '../models/PlatformSetting';
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
 * Calculates platform financial metrics based on immutable booking price snapshots
 */
export const calculateFinancialMetrics = async (): Promise<AdminFinancialMetrics> => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const startOfCurrentMonth = new Date(currentYear, currentMonth, 1);
  const startOfPreviousMonth = new Date(currentYear, currentMonth - 1, 1);
  const endOfPreviousMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

  const [financialAgg] = await Booking.aggregate([
    {
      $facet: {
        completedStats: [
          { $match: { status: 'completed' } },
          {
            $group: {
              _id: null,
              totalGmv: { $sum: { $ifNull: ['$priceSnapshot', 499] } },
              totalCommission: {
                $sum: {
                  $cond: [
                    { $gt: ['$commissionAmountSnapshot', 0] },
                    '$commissionAmountSnapshot',
                    {
                      $cond: [
                        { $eq: ['$commissionRateSnapshot', 0] },
                        0,
                        { $multiply: [{ $ifNull: ['$priceSnapshot', 499] }, 0.15] },
                      ],
                    },
                  ],
                },
              },
            },
          },
        ],
        currentMonthStats: [
          {
            $match: {
              status: 'completed',
              scheduledStartTime: { $gte: startOfCurrentMonth },
            },
          },
          {
            $group: {
              _id: null,
              currentMonthGmv: { $sum: { $ifNull: ['$priceSnapshot', 499] } },
            },
          },
        ],
        previousMonthStats: [
          {
            $match: {
              status: 'completed',
              scheduledStartTime: { $gte: startOfPreviousMonth, $lte: endOfPreviousMonth },
            },
          },
          {
            $group: {
              _id: null,
              previousMonthGmv: { $sum: { $ifNull: ['$priceSnapshot', 499] } },
            },
          },
        ],
        paidStats: [
          { $match: { paymentStatus: 'paid' } },
          {
            $group: {
              _id: null,
              totalPaid: { $sum: { $ifNull: ['$priceSnapshot', 499] } },
            },
          },
        ],
        refundedStats: [
          { $match: { paymentStatus: 'refunded' } },
          {
            $group: {
              _id: null,
              totalRefunded: { $sum: { $ifNull: ['$priceSnapshot', 499] } },
            },
          },
        ],
      },
    },
  ]);

  const grossMerchandiseValue = Math.round(financialAgg?.completedStats?.[0]?.totalGmv || 0);
  const estimatedPlatformCommission = Math.round(
    financialAgg?.completedStats?.[0]?.totalCommission || grossMerchandiseValue * 0.15
  );
  const estimatedProviderPayout = Math.max(0, grossMerchandiseValue - estimatedPlatformCommission);
  const recordedPaidVolume = Math.round(financialAgg?.paidStats?.[0]?.totalPaid || 0);
  const recordedRefundedAmount = Math.round(financialAgg?.refundedStats?.[0]?.totalRefunded || 0);
  const currentMonthGmv = Math.round(financialAgg?.currentMonthStats?.[0]?.currentMonthGmv || 0);
  const previousMonthGmv = Math.round(financialAgg?.previousMonthStats?.[0]?.previousMonthGmv || 0);

  let monthOverMonthGrowthPercent = 0;
  if (previousMonthGmv > 0) {
    monthOverMonthGrowthPercent = Math.round(
      ((currentMonthGmv - previousMonthGmv) / previousMonthGmv) * 100
    );
  } else if (currentMonthGmv > 0) {
    monthOverMonthGrowthPercent = 100;
  }

  const settings = await getOrCreatePlatformSettings().catch(() => null);
  const platformCommissionPercent = settings ? settings.platformCommissionPercent : 15;

  return {
    grossMerchandiseValue,
    recordedPaidVolume,
    estimatedPlatformCommission,
    estimatedProviderPayout,
    recordedRefundedAmount,
    currentMonthGmv,
    previousMonthGmv,
    monthOverMonthGrowthPercent,
    platformCommissionPercent,
  };
};

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
      suspendedUsers,
      statusStats,
      recentRawLogs,
      financialSummary,
    ] = await Promise.all([
      User.countDocuments({ role: 'customer' }),
      ProviderProfile.countDocuments({ verificationStatus: 'approved' }),
      ProviderProfile.countDocuments({ verificationStatus: 'pending' }),
      Service.countDocuments({ isActive: true }),
      Booking.countDocuments({}),
      Review.countDocuments({ isPublished: true }),
      User.countDocuments({ isActive: false }),
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
      calculateFinancialMetrics(),
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

    const stats: AdminOverviewStats = {
      totalCustomers,
      totalProviders,
      pendingApplications,
      activeServices,
      totalBookings,
      bookingsByStatus,
      totalReviews,
      suspendedUsers,
      financialSummary,
    };

    const overviewData: AdminOverviewData = {
      stats,
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

/**
 * Detailed Platform Analytics, Trends & Category Breakdown
 * GET /api/admin/analytics
 */
export const getAdminAnalytics = async (_req: Request, res: Response): Promise<void> => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [financials, topServicesRaw, topCategoriesRaw, bookingTrendsRaw] = await Promise.all([
      calculateFinancialMetrics(),
      // Top 5 services by volume & revenue
      Booking.aggregate([
        {
          $group: {
            _id: '$serviceId',
            bookingCount: { $sum: 1 },
            completedRevenue: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, { $ifNull: ['$priceSnapshot', 499] }, 0],
              },
            },
          },
        },
        { $sort: { bookingCount: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'services',
            localField: '_id',
            foreignField: '_id',
            as: 'service',
          },
        },
        { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'categories',
            localField: 'service.categoryId',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      ]),
      // Category performance breakdown
      Booking.aggregate([
        {
          $group: {
            _id: '$categoryId',
            bookingCount: { $sum: 1 },
            completedRevenue: {
              $sum: {
                $cond: [{ $eq: ['$status', 'completed'] }, { $ifNull: ['$priceSnapshot', 499] }, 0],
              },
            },
          },
        },
        { $sort: { bookingCount: -1 } },
        {
          $lookup: {
            from: 'categories',
            localField: '_id',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      ]),
      // 30-day booking trends
      Booking.aggregate([
        {
          $match: {
            scheduledStartTime: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$scheduledStartTime' },
            },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
            },
            cancelled: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
            },
            requested: {
              $sum: { $cond: [{ $eq: ['$status', 'requested'] }, 1, 0] },
            },
            total: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const topServices: TopServicePerformance[] = topServicesRaw.map((item: any) => ({
      serviceId: item._id ? item._id.toString() : '',
      serviceName: item.service?.name || 'Home Service',
      categoryName: item.category?.name || 'General',
      bookingCount: item.bookingCount || 0,
      completedRevenue: Math.round(item.completedRevenue || 0),
    }));

    const topCategories: CategoryPerformanceItem[] = topCategoriesRaw.map((item: any) => ({
      categoryId: item._id ? item._id.toString() : '',
      categoryName: item.category?.name || 'General Service',
      bookingCount: item.bookingCount || 0,
      completedRevenue: Math.round(item.completedRevenue || 0),
    }));

    const bookingTrends: BookingTrendItem[] = bookingTrendsRaw.map((item: any) => ({
      date: item._id,
      completed: item.completed || 0,
      cancelled: item.cancelled || 0,
      requested: item.requested || 0,
      total: item.total || 0,
    }));

    const analyticsData: AdminAnalyticsData = {
      financials,
      topServices,
      topCategories,
      bookingTrends,
    };

    const response: ApiResponse<AdminAnalyticsData> = {
      success: true,
      message: 'Platform analytics retrieved successfully.',
      data: analyticsData,
    };

    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'AdminOverview.getAdminAnalytics', error, 'Failed to retrieve platform analytics.');
  }
};
