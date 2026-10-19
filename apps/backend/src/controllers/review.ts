import { Request, Response } from 'express';
import { Types } from 'mongoose';
import {
  ApiResponse,
  ReviewData,
  PublicReviewData,
  CreateReviewPayload,
  ReviewReplyPayload,
  PaginatedReviewsData,
} from '@dwellio/shared';
import { Review } from '../models/Review';
import { Booking } from '../models/Booking';
import { ProviderProfile } from '../models/ProviderProfile';
import {
  formatReviewDto,
  formatPublicReviewDto,
  recalculateProviderRating,
} from '../utils/review';
import { sendInAppNotification } from '../utils/notification';

/**
 * Customer: Submit a verified review for a completed booking
 * POST /api/bookings/:id/reviews
 */
export const createBookingReview = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
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

    // Customer ownership verification
    if (booking.customerId.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: 'Access denied: you can only review bookings belonging to your account.',
      });
      return;
    }

    // Strict status verification: only 'completed' bookings can be reviewed
    if (booking.status !== 'completed') {
      res.status(400).json({
        success: false,
        message: `Only completed bookings can be reviewed. Current booking status is '${booking.status}'.`,
      });
      return;
    }

    const { rating, comment }: CreateReviewPayload = req.body || {};

    // Validate rating
    if (
      rating === undefined ||
      rating === null ||
      typeof rating !== 'number' ||
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5
    ) {
      res.status(400).json({
        success: false,
        message: 'Rating must be an integer between 1 and 5 stars.',
      });
      return;
    }

    // Validate comment if provided
    let trimmedComment: string | undefined = undefined;
    if (comment !== undefined && comment !== null) {
      if (typeof comment !== 'string') {
        res.status(400).json({ success: false, message: 'Comment must be a text string.' });
        return;
      }
      trimmedComment = comment.trim();
      if (trimmedComment.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Review comment cannot be empty or whitespace only.',
        });
        return;
      }
      if (trimmedComment.length < 10) {
        res.status(400).json({
          success: false,
          message: 'Review comment must be at least 10 characters long.',
        });
        return;
      }
      if (trimmedComment.length > 1000) {
        res.status(400).json({
          success: false,
          message: 'Review comment cannot exceed 1000 characters.',
        });
        return;
      }
    }

    // Application-level duplicate check
    const existing = await Review.findOne({ bookingId: booking._id });
    if (existing) {
      res.status(409).json({
        success: false,
        message: 'A review has already been submitted for this booking.',
      });
      return;
    }

    // Construct Review deriving relationship references strictly from authoritative database booking
    const newReview = new Review({
      bookingId: booking._id,
      customerId: req.user._id,
      providerId: booking.providerId,
      serviceId: booking.serviceId,
      rating,
      comment: trimmedComment,
      isPublished: true,
    });

    try {
      await newReview.save();
    } catch (saveError: any) {
      // Handle race condition hitting MongoDB unique index on bookingId
      if (saveError.code === 11000) {
        res.status(409).json({
          success: false,
          message: 'A review has already been submitted for this booking.',
        });
        return;
      }
      throw saveError;
    }

    // Recalculate provider aggregate ratings atomically
    await recalculateProviderRating(booking.providerId);

    const populated = await Review.findById(newReview._id)
      .populate('customerId', 'name')
      .populate('providerId', 'displayName')
      .populate('serviceId', 'name slug');

    // Trigger in-app notification to provider (best-effort, non-blocking)
    const serviceName = (populated?.serviceId as any)?.name || 'service';
    await sendInAppNotification({
      recipientId: booking.providerUserId,
      type: 'REVIEW_RECEIVED',
      title: 'New Review Received',
      message: `${req.user.name} submitted a ${rating}-star review for ${serviceName}.${trimmedComment ? ` "${trimmedComment.slice(0, 100)}"` : ''}`,
      bookingId: booking._id,
      dedupKey: `review:${newReview._id}:submitted`,
    });

    const response: ApiResponse<ReviewData> = {
      success: true,
      message: 'Review submitted successfully. Thank you for your feedback!',
      data: formatReviewDto(populated),
    };
    res.status(201).json(response);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to submit booking review.',
      error: error.message,
    });
  }
};

/**
 * Customer / Provider: Get the review for a specific booking
 * GET /api/bookings/:id/review
 */
export const getBookingReview = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
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

    // Authorization: customer who booked, assigned provider, or admin
    const isCustomer = booking.customerId.toString() === req.user._id.toString();
    const isAssignedProvider =
      (booking.providerUserId && booking.providerUserId.toString() === req.user._id.toString()) ||
      (req.providerProfile && booking.providerId.toString() === req.providerProfile._id.toString());
    const isAdmin = req.user.role === 'admin';

    if (!isCustomer && !isAssignedProvider && !isAdmin) {
      res.status(403).json({
        success: false,
        message: 'Access denied: you are not authorized to view this booking review.',
      });
      return;
    }

    const review = await Review.findOne({ bookingId: booking._id })
      .populate('customerId', 'name')
      .populate('providerId', 'displayName')
      .populate('serviceId', 'name slug');

    if (!review) {
      res.status(404).json({
        success: false,
        message: 'No review has been submitted for this booking yet.',
      });
      return;
    }

    const response: ApiResponse<ReviewData> = {
      success: true,
      message: 'Booking review retrieved successfully.',
      data: formatReviewDto(review),
    };
    res.status(200).json(response);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve booking review.',
      error: error.message,
    });
  }
};

/**
 * Public: Get paginated published reviews for a service professional
 * GET /api/providers/:id/reviews
 */
export const getProviderReviews = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid provider ID format.' });
      return;
    }

    const provider = await ProviderProfile.findById(id);
    if (!provider) {
      res.status(404).json({ success: false, message: 'Service provider not found.' });
      return;
    }

    // Pagination validation
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const skip = (page - 1) * limit;

    const query = {
      providerId: provider._id,
      isPublished: true,
    };

    const [reviews, total, ratingStats] = await Promise.all([
      Review.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('customerId', 'name')
        .populate('serviceId', 'name'),
      Review.countDocuments(query),
      Review.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$rating',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Construct distribution dictionary
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const stat of ratingStats) {
      if (stat._id >= 1 && stat._id <= 5) {
        distribution[stat._id] = stat.count;
      }
    }

    const totalPages = Math.ceil(total / limit) || 1;

    const response: ApiResponse<PaginatedReviewsData> = {
      success: true,
      message: `Retrieved ${reviews.length} reviews for ${provider.displayName}.`,
      data: {
        reviews: reviews.map(formatPublicReviewDto),
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
        summary: {
          ratingAverage: provider.ratingAverage ?? 0,
          reviewCount: provider.reviewCount ?? total,
          distribution,
        },
      },
    };
    res.status(200).json(response);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve provider reviews.',
      error: error.message,
    });
  }
};

/**
 * Approved Provider: Submit a single professional reply to a review
 * PATCH /api/reviews/:id/reply
 */
export const replyToReview = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.providerProfile) {
      res.status(403).json({ success: false, message: 'Approved provider credentials required.' });
      return;
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid review ID format.' });
      return;
    }

    const review = await Review.findById(id);
    if (!review) {
      res.status(404).json({ success: false, message: 'Review not found.' });
      return;
    }

    // Provider ownership check: must own the review's provider profile
    if (review.providerId.toString() !== req.providerProfile._id.toString()) {
      res.status(403).json({
        success: false,
        message: 'Access denied: you can only reply to reviews on your own service appointments.',
      });
      return;
    }

    // Check if reply already exists
    if (review.providerReply && review.providerReply.replyText) {
      res.status(409).json({
        success: false,
        message: 'A provider reply has already been submitted for this review. Only one reply is allowed.',
      });
      return;
    }

    const { replyText }: ReviewReplyPayload = req.body || {};
    if (typeof replyText !== 'string') {
      res.status(400).json({ success: false, message: 'Reply text is required.' });
      return;
    }

    const trimmedReply = replyText.trim();
    if (trimmedReply.length < 2) {
      res.status(400).json({
        success: false,
        message: 'Reply text must be at least 2 characters long.',
      });
      return;
    }

    if (trimmedReply.length > 1000) {
      res.status(400).json({
        success: false,
        message: 'Reply text cannot exceed 1000 characters.',
      });
      return;
    }

    // Atomic conditional update enforcing single-reply invariant under concurrency
    const updated = await Review.findOneAndUpdate(
      {
        _id: review._id,
        providerId: req.providerProfile._id,
        'providerReply.replyText': { $exists: false }, // Must not have a reply yet
      },
      {
        $set: {
          providerReply: {
            replyText: trimmedReply,
            repliedAt: new Date(),
          },
        },
      },
      { returnDocument: 'after' }
    )
      .populate('customerId', 'name')
      .populate('providerId', 'displayName')
      .populate('serviceId', 'name slug');

    if (!updated) {
      res.status(409).json({
        success: false,
        message: 'A provider reply has already been submitted for this review. Only one reply is allowed.',
      });
      return;
    }

    // Trigger in-app notification to customer (best-effort, non-blocking)
    const providerName = (updated.providerId as any)?.displayName || req.providerProfile.displayName || 'The service professional';
    await sendInAppNotification({
      recipientId: review.customerId,
      type: 'REVIEW_REPLIED',
      title: 'Provider Replied to Your Review',
      message: `${providerName} replied to your review: "${trimmedReply.slice(0, 150)}".`,
      bookingId: review.bookingId,
      dedupKey: `review:${review._id}:replied`,
    });

    const response: ApiResponse<ReviewData> = {
      success: true,
      message: 'Provider reply posted successfully.',
      data: formatReviewDto(updated),
    };
    res.status(200).json(response);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to post provider reply.',
      error: error.message,
    });
  }
};
