import { Types } from 'mongoose';
import { ReviewData, PublicReviewData } from '@dwellio/shared';
import { Review } from '../models/Review';
import { ProviderProfile } from '../models/ProviderProfile';

/**
 * Maps an internal Review Mongoose document into a safe, client-facing ReviewData DTO.
 */
export const formatReviewDto = (review: any): ReviewData => {
  const customer = review.customerId && typeof review.customerId === 'object' && 'name' in review.customerId
    ? {
        id: review.customerId._id.toString(),
        name: review.customerId.name,
      }
    : undefined;

  const provider = review.providerId && typeof review.providerId === 'object' && 'displayName' in review.providerId
    ? {
        id: review.providerId._id.toString(),
        displayName: review.providerId.displayName,
      }
    : undefined;

  const service = review.serviceId && typeof review.serviceId === 'object' && 'name' in review.serviceId
    ? {
        id: review.serviceId._id.toString(),
        name: review.serviceId.name,
        slug: review.serviceId.slug,
      }
    : undefined;

  const providerReply = review.providerReply && review.providerReply.replyText
    ? {
        replyText: review.providerReply.replyText,
        repliedAt: review.providerReply.repliedAt instanceof Date
          ? review.providerReply.repliedAt.toISOString()
          : new Date(review.providerReply.repliedAt).toISOString(),
      }
    : undefined;

  return {
    id: review._id.toString(),
    bookingId: (review.bookingId?._id || review.bookingId).toString(),
    customerId: (review.customerId?._id || review.customerId).toString(),
    customer,
    providerId: (review.providerId?._id || review.providerId).toString(),
    provider,
    serviceId: (review.serviceId?._id || review.serviceId).toString(),
    service,
    rating: review.rating,
    comment: review.comment,
    providerReply,
    isPublished: review.isPublished ?? true,
    createdAt: review.createdAt instanceof Date ? review.createdAt.toISOString() : new Date(review.createdAt).toISOString(),
    updatedAt: review.updatedAt instanceof Date ? review.updatedAt.toISOString() : new Date(review.updatedAt).toISOString(),
  };
};

/**
 * Maps an internal Review document into a safe, public review DTO for discovery and public profiles.
 * Never exposes private customer identifiers or email addresses.
 */
export const formatPublicReviewDto = (review: any): PublicReviewData => {
  const customerName = review.customerId && typeof review.customerId === 'object' && 'name' in review.customerId
    ? review.customerId.name
    : 'Verified Customer';

  const serviceName = review.serviceId && typeof review.serviceId === 'object' && 'name' in review.serviceId
    ? review.serviceId.name
    : undefined;

  const providerReply = review.providerReply && review.providerReply.replyText
    ? {
        replyText: review.providerReply.replyText,
        repliedAt: review.providerReply.repliedAt instanceof Date
          ? review.providerReply.repliedAt.toISOString()
          : new Date(review.providerReply.repliedAt).toISOString(),
      }
    : undefined;

  return {
    id: review._id.toString(),
    bookingId: (review.bookingId?._id || review.bookingId).toString(),
    customerName,
    serviceName,
    rating: review.rating,
    comment: review.comment,
    providerReply,
    createdAt: review.createdAt instanceof Date ? review.createdAt.toISOString() : new Date(review.createdAt).toISOString(),
  };
};

/**
 * Recalculates and updates the provider's authoritative ratingAverage and reviewCount.
 * Uses MongoDB Aggregation to guarantee mathematical accuracy over all published reviews.
 * Employs optimistic conditional updates ($lte guard) to prevent concurrent lost updates or stale overwrites.
 */
export const recalculateProviderRating = async (
  providerId: Types.ObjectId | string,
  maxRetries = 3
): Promise<{ ratingAverage: number; reviewCount: number }> => {
  const pId = new Types.ObjectId(providerId.toString());

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const stats = await Review.aggregate([
      {
        $match: {
          providerId: pId,
          isPublished: true,
        },
      },
      {
        $group: {
          _id: '$providerId',
          count: { $sum: 1 },
          avgRating: { $avg: '$rating' },
        },
      },
    ]);

    const reviewCount = stats.length > 0 ? stats[0].count : 0;
    const ratingAverage = stats.length > 0 ? Math.round(stats[0].avgRating * 10) / 10 : 0;

    // Concurrency guard: update only if reviewCount in ProviderProfile is <= this calculated count
    const updated = await ProviderProfile.findOneAndUpdate(
      {
        _id: pId,
        $or: [
          { reviewCount: { $lte: reviewCount } },
          { reviewCount: { $exists: false } },
        ],
      },
      {
        $set: {
          ratingAverage,
          reviewCount,
        },
      },
      { returnDocument: 'after' }
    );

    if (updated || reviewCount === 0) {
      return { ratingAverage, reviewCount };
    }

    const current = await ProviderProfile.findById(pId);
    if (current && current.reviewCount >= reviewCount) {
      return { ratingAverage: current.ratingAverage, reviewCount: current.reviewCount };
    }
  }

  // Fallback authoritative update
  const finalStats = await Review.aggregate([
    { $match: { providerId: pId, isPublished: true } },
    { $group: { _id: '$providerId', count: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
  ]);
  const count = finalStats.length > 0 ? finalStats[0].count : 0;
  const avg = finalStats.length > 0 ? Math.round(finalStats[0].avgRating * 10) / 10 : 0;
  await ProviderProfile.findByIdAndUpdate(pId, { $set: { ratingAverage: avg, reviewCount: count } });
  return { ratingAverage: avg, reviewCount: count };
};
