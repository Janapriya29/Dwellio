import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Booking } from '../models/Booking';
import { Review } from '../models/Review';
import { ApiResponse, ProviderDashboardStats, ProviderReviewsData, ReviewData } from '@dwellio/shared';
import { formatBookingDto } from '../utils/booking';
import { sendInternalError } from '../utils/security';

/**
 * Provider: Get Aggregated Dashboard KPIs, Earnings, and Today's Agenda (Milestone 2D)
 * GET /api/provider/dashboard/stats
 */
export const getMyDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.providerProfile) {
      res.status(403).json({ success: false, message: 'Approved provider credentials required.' });
      return;
    }

    const providerProfileId = req.providerProfile._id;

    // 1. Fetch all bookings for this provider
    const bookings = await Booking.find({ providerId: providerProfileId })
      .populate('customerId', 'name email phone')
      .populate('providerId', 'displayName phone serviceArea skills')
      .populate('serviceId', 'name slug')
      .populate('categoryId', 'name slug')
      .sort({ scheduledStartTime: 1 });

    const totalBookings = bookings.length;
    let totalCompletedJobs = 0;
    let pendingRequests = 0;
    let activeJobs = 0;
    let totalRejected = 0;
    let totalCancelled = 0;
    let totalRecordedEarnings = 0;
    let currentMonthEarnings = 0;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Start and end of today in local date
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const todaysBookings: typeof bookings = [];

    for (const b of bookings) {
      const price = b.priceSnapshot || 499;

      if (b.status === 'requested') {
        pendingRequests++;
      } else if (['accepted', 'on_the_way', 'in_progress'].includes(b.status)) {
        activeJobs++;
      } else if (b.status === 'completed') {
        totalCompletedJobs++;
        totalRecordedEarnings += price;

        const bookingDate = new Date(b.scheduledStartTime || b.updatedAt);
        if (bookingDate.getFullYear() === currentYear && bookingDate.getMonth() === currentMonth) {
          currentMonthEarnings += price;
        }
      } else if (b.status === 'rejected') {
        totalRejected++;
      } else if (b.status === 'cancelled') {
        totalCancelled++;
      }

      // Check if scheduled for today
      const start = new Date(b.scheduledStartTime);
      if (start >= todayStart && start <= todayEnd) {
        todaysBookings.push(b);
      }
    }

    // Acceptance rate: (completed + active) / (completed + active + rejected) * 100
    const totalDecisions = totalCompletedJobs + activeJobs + totalRejected;
    const acceptanceRate =
      totalDecisions > 0 ? Math.round(((totalCompletedJobs + activeJobs) / totalDecisions) * 100) : 100;

    // Completion rate: completed / (completed + cancelled) * 100
    const totalHandled = totalCompletedJobs + totalCancelled;
    const completionRate =
      totalHandled > 0 ? Math.round((totalCompletedJobs / totalHandled) * 100) : 100;

    // 2. Fetch Review Stats
    const reviews = await Review.find({ providerId: providerProfileId, isPublished: true });
    const reviewCount = reviews.length;
    let ratingAverage = 0;
    if (reviewCount > 0) {
      const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
      ratingAverage = Math.round((sum / reviewCount) * 10) / 10;
    }

    const responseData: ProviderDashboardStats = {
      totalCompletedJobs,
      totalBookings,
      pendingRequests,
      activeJobs,
      acceptanceRate,
      completionRate,
      ratingAverage,
      reviewCount,
      totalRecordedEarnings,
      currentMonthEarnings,
      todaysJobs: todaysBookings.map(formatBookingDto),
    };

    const response: ApiResponse<ProviderDashboardStats> = {
      success: true,
      message: 'Provider dashboard metrics retrieved successfully.',
      data: responseData,
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'ProviderDashboard.getMyDashboardStats', error, 'Failed to fetch dashboard stats.');
  }
};

/**
 * Provider: Get Paginated Reviews with Filtering and Rating Breakdown (Milestone 2D)
 * GET /api/provider/reviews
 */
export const getMyReviews = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.providerProfile) {
      res.status(403).json({ success: false, message: 'Approved provider credentials required.' });
      return;
    }

    const providerProfileId = req.providerProfile._id;

    // Query parameters
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const ratingQuery = req.query.rating ? parseInt(req.query.rating as string, 10) : undefined;
    const hasReplyQuery = req.query.hasReply as string | undefined;

    // Base filter
    const filter: any = {
      providerId: providerProfileId,
      isPublished: true,
    };

    if (ratingQuery && ratingQuery >= 1 && ratingQuery <= 5) {
      filter.rating = ratingQuery;
    }

    if (hasReplyQuery === 'true') {
      filter['providerReply.replyText'] = { $exists: true, $ne: '' };
    } else if (hasReplyQuery === 'false') {
      filter.$or = [
        { providerReply: { $exists: false } },
        { 'providerReply.replyText': { $exists: false } },
        { 'providerReply.replyText': '' },
      ];
    }

    const skip = (page - 1) * limit;

    const [reviews, totalFiltered, allPublishedReviews] = await Promise.all([
      Review.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('customerId', 'name')
        .populate('serviceId', 'name slug'),
      Review.countDocuments(filter),
      Review.find({ providerId: providerProfileId, isPublished: true }).select('rating'),
    ]);

    // Calculate rating distribution and average across all published reviews
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let ratingSum = 0;
    for (const r of allPublishedReviews) {
      if (distribution[r.rating] !== undefined) {
        distribution[r.rating]++;
      }
      ratingSum += r.rating;
    }

    const totalReviewsCount = allPublishedReviews.length;
    const ratingAverage =
      totalReviewsCount > 0 ? Math.round((ratingSum / totalReviewsCount) * 10) / 10 : 0;

    const formattedReviews: ReviewData[] = reviews.map((r) => ({
      id: r._id.toString(),
      bookingId: r.bookingId?.toString() || '',
      customerId: r.customerId ? (r.customerId as any)._id?.toString() || r.customerId.toString() : '',
      customer: r.customerId
        ? {
            id: (r.customerId as any)._id?.toString() || '',
            name: (r.customerId as any).name || 'Verified Customer',
          }
        : undefined,
      providerId: r.providerId.toString(),
      serviceId: r.serviceId ? (r.serviceId as any)._id?.toString() || r.serviceId.toString() : '',
      service: r.serviceId
        ? {
            id: (r.serviceId as any)._id?.toString() || '',
            name: (r.serviceId as any).name || '',
            slug: (r.serviceId as any).slug || '',
          }
        : undefined,
      rating: r.rating,
      comment: r.comment,
      providerReply: r.providerReply
        ? {
            replyText: r.providerReply.replyText,
            repliedAt: r.providerReply.repliedAt.toISOString(),
          }
        : undefined,
      isPublished: r.isPublished,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    const totalPages = Math.ceil(totalFiltered / limit) || 1;

    const responseData: ProviderReviewsData = {
      reviews: formattedReviews,
      pagination: {
        page,
        limit,
        total: totalFiltered,
        totalPages,
      },
      summary: {
        ratingAverage,
        reviewCount: totalReviewsCount,
        distribution,
      },
    };

    const response: ApiResponse<ProviderReviewsData> = {
      success: true,
      message: 'Provider reviews retrieved successfully.',
      data: responseData,
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'ProviderDashboard.getMyReviews', error, 'Failed to fetch provider reviews.');
  }
};
