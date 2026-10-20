import { Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  ApiResponse,
  PaginationMeta,
  AdminReviewItem,
  ModerateReviewPayload,
} from '@dwellio/shared';
import { Review } from '../models/Review';
import { AuditLog } from '../models/AuditLog';
import { recalculateProviderRating, formatAdminReviewDto } from '../utils/review';
import { sendInternalError } from '../utils/security';

/**
 * List Reviews for Administrative Moderation
 * GET /api/admin/reviews
 */
export const listAdminReviews = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const { isPublished, rating, providerId } = req.query;

    const filter: Record<string, unknown> = {};

    if (isPublished !== undefined) {
      if (isPublished === 'true') {
        filter.isPublished = true;
      } else if (isPublished === 'false') {
        filter.isPublished = false;
      } else if (isPublished !== 'all') {
        res.status(400).json({
          success: false,
          message: 'Invalid isPublished filter. Must be "true", "false", or "all".',
        });
        return;
      }
    }

    if (rating !== undefined) {
      const parsedRating = parseInt(rating as string, 10);
      if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        res.status(400).json({
          success: false,
          message: 'Rating filter must be an integer between 1 and 5.',
        });
        return;
      }
      filter.rating = parsedRating;
    }

    if (providerId !== undefined) {
      if (typeof providerId !== 'string' || !mongoose.Types.ObjectId.isValid(providerId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid providerId filter format.',
        });
        return;
      }
      filter.providerId = new mongoose.Types.ObjectId(providerId);
    }

    const total = await Review.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const rawReviews = await Review.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('customerId', 'name email')
      .populate('providerId', 'displayName')
      .populate('serviceId', 'name');

    const reviews: AdminReviewItem[] = rawReviews.map(formatAdminReviewDto);

    const pagination: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
    };

    const response: ApiResponse<{ reviews: AdminReviewItem[]; pagination: PaginationMeta }> = {
      success: true,
      message: 'Reviews retrieved successfully.',
      data: {
        reviews,
        pagination,
      },
    };

    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'AdminReview.listAdminReviews', error, 'Failed to retrieve reviews.');
  }
};

/**
 * Moderate Review (Hide / Restore Publication State)
 * PATCH /api/admin/reviews/:id/moderate
 */
export const moderateReview = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { isPublished, moderationReason } = req.body as ModerateReviewPayload;

    if (!id || typeof id !== 'string' || !mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid review ID format.' });
      return;
    }

    if (isPublished === undefined || typeof isPublished !== 'boolean') {
      res.status(400).json({ success: false, message: 'isPublished boolean is required.' });
      return;
    }

    const trimmedReason = typeof moderationReason === 'string' ? moderationReason.trim() : '';

    // If hiding a review, a non-empty explanation is required
    if (!isPublished) {
      if (trimmedReason.length < 5 || trimmedReason.length > 500) {
        res.status(400).json({
          success: false,
          message: 'A moderation reason between 5 and 500 characters is required when hiding a review.',
        });
        return;
      }
    } else if (trimmedReason.length > 500) {
      res.status(400).json({
        success: false,
        message: 'Moderation reason cannot exceed 500 characters.',
      });
      return;
    }

    const review = await Review.findById(id)
      .populate('customerId', 'name email')
      .populate('providerId', 'displayName')
      .populate('serviceId', 'name');

    if (!review) {
      res.status(404).json({ success: false, message: 'Review not found.' });
      return;
    }

    // Idempotent: If no state change occurred, return without recalculating or logging
    if (review.isPublished === isPublished) {
      res.status(200).json({
        success: true,
        message: `Review publication status already ${isPublished ? 'published' : 'hidden'}. No changes made.`,
        data: formatAdminReviewDto(review),
      });
      return;
    }

    const previousStatus = review.isPublished;

    // 1. Update Review document
    review.isPublished = isPublished;
    review.moderatedBy = req.user!._id;
    review.moderatedAt = new Date();
    review.moderationReason = trimmedReason.length > 0 ? trimmedReason : undefined;
    await review.save();

    // 2. Authoritatively recalculate provider's rating aggregate
    const targetProviderId = review.providerId?._id || review.providerId;
    const newAggregates = await recalculateProviderRating(targetProviderId);

    // 3. Record immutable AuditLog entry
    await new AuditLog({
      adminId: req.user!._id,
      action: 'REVIEW_MODERATED',
      targetId: review._id,
      targetType: 'Review',
      details: {
        providerId: targetProviderId,
        previousStatus: previousStatus ? 'published' : 'hidden',
        newStatus: isPublished ? 'published' : 'hidden',
        reason: trimmedReason.length > 0 ? trimmedReason : undefined,
        newRatingAverage: newAggregates.ratingAverage,
        newReviewCount: newAggregates.reviewCount,
      },
    }).save();

    const response: ApiResponse<{ review: AdminReviewItem; providerAggregate: typeof newAggregates }> = {
      success: true,
      message: `Review successfully ${isPublished ? 'restored' : 'hidden'} and provider rating updated.`,
      data: {
        review: formatAdminReviewDto(review),
        providerAggregate: newAggregates,
      },
    };

    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'AdminReview.moderateReview', error, 'Failed to moderate review.');
  }
};
