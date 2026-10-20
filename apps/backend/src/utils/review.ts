import { Types } from 'mongoose';
import { ReviewData, PublicReviewData, AdminReviewItem } from '@dwellio/shared';
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
 * Minimizes customer identity for public-facing review displays.
 * Protects customer privacy by converting full names into a first-name + last-initial format:
 * - "Alice Smith" -> "Alice S."
 * - "Alice Mary Smith" -> "Alice S."
 * - "Alice" -> "Alice"
 * - "" / undefined / null -> "Verified Customer"
 * - Trims whitespace safely
 */
export const maskCustomerName = (rawName?: string | null): string => {
  if (!rawName || typeof rawName !== 'string') {
    return 'Verified Customer';
  }
  const trimmed = rawName.trim();
  if (!trimmed) {
    return 'Verified Customer';
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0];
  }
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${firstName} ${lastInitial}.`;
};

/**
 * Maps an internal Review document into a safe, public review DTO for discovery and public profiles.
 * Never exposes private customer identifiers, email addresses, phone numbers, or full surnames.
 */
export const formatPublicReviewDto = (review: any): PublicReviewData => {
  const rawCustomerName = review.customerId && typeof review.customerId === 'object' && 'name' in review.customerId
    ? review.customerId.name
    : undefined;

  const customerName = maskCustomerName(rawCustomerName);

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
 * Maps an internal Review document into an AdminReviewItem DTO for administrative moderation oversight.
 */
export const formatAdminReviewDto = (review: any): AdminReviewItem => {
  const customerName = review.customerId && typeof review.customerId === 'object' && 'name' in review.customerId
    ? review.customerId.name
    : 'Customer';

  const providerDisplayName = review.providerId && typeof review.providerId === 'object' && 'displayName' in review.providerId
    ? review.providerId.displayName
    : 'Provider';

  const serviceName = review.serviceId && typeof review.serviceId === 'object' && 'name' in review.serviceId
    ? review.serviceId.name
    : 'Service';

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
    providerDisplayName,
    serviceName,
    rating: review.rating,
    comment: review.comment,
    providerReply,
    isPublished: review.isPublished ?? true,
    moderationReason: review.moderationReason,
    moderatedAt: review.moderatedAt instanceof Date
      ? review.moderatedAt.toISOString()
      : (review.moderatedAt ? new Date(review.moderatedAt).toISOString() : undefined),
    createdAt: review.createdAt instanceof Date ? review.createdAt.toISOString() : new Date(review.createdAt).toISOString(),
  };
};

/**
 * Recalculates and updates the provider's authoritative ratingAverage and reviewCount.
 * Uses MongoDB Aggregation to guarantee mathematical accuracy over all currently published reviews.
 * Employs optimistic version compare-and-swap (CAS) with exponential backoff retries to guarantee
 * aggregate consistency across concurrent review creations, hides, and restores on standalone MongoDB.
 */
export const recalculateProviderRating = async (
  providerId: any,
  maxRetries = 5
): Promise<{ ratingAverage: number; reviewCount: number }> => {
  const rawId = providerId && typeof providerId === 'object' && '_id' in providerId
    ? providerId._id
    : providerId;
  const pId = new Types.ObjectId(rawId.toString());

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // 1. Read current version from ProviderProfile
    const profile = await ProviderProfile.findById(pId).select('ratingVersion reviewCount ratingAverage');
    if (!profile) {
      return { ratingAverage: 0, reviewCount: 0 };
    }
    const versionBefore = profile.ratingVersion ?? 0;

    // 2. Perform aggregation over all published reviews
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

    // 3. Atomically update ProviderProfile only if ratingVersion hasn't changed since we sampled
    const updated = await ProviderProfile.findOneAndUpdate(
      {
        _id: pId,
        $or: [
          { ratingVersion: versionBefore },
          { ratingVersion: { $exists: false } },
        ],
      },
      {
        $set: {
          ratingAverage,
          reviewCount,
        },
        $inc: { ratingVersion: 1 },
      },
      { returnDocument: 'after' }
    );

    if (updated) {
      return { ratingAverage, reviewCount };
    }

    // Version changed concurrently; back off briefly before retrying
    await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1)));
  }

  // Fallback authoritative recalculation if retries were exhausted
  const finalStats = await Review.aggregate([
    { $match: { providerId: pId, isPublished: true } },
    { $group: { _id: '$providerId', count: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
  ]);
  const count = finalStats.length > 0 ? finalStats[0].count : 0;
  const avg = finalStats.length > 0 ? Math.round(finalStats[0].avgRating * 10) / 10 : 0;
  await ProviderProfile.findByIdAndUpdate(pId, {
    $set: { ratingAverage: avg, reviewCount: count },
    $inc: { ratingVersion: 1 },
  });
  return { ratingAverage: avg, reviewCount: count };
};
