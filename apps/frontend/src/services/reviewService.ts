import {
  ApiResponse,
  ReviewData,
  CreateReviewPayload,
  ReviewReplyPayload,
  PaginatedReviewsData,
} from '@dwellio/shared';
import { API_BASE_URL, createApiUrl } from '../config/api';

const authHeaders = (token?: string) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

/**
 * Customer: Submit a verified review for a completed booking
 */
export const createBookingReview = async (
  bookingId: string,
  payload: CreateReviewPayload,
  token: string
): Promise<ReviewData> => {
  const res = await fetch(`${API_BASE_URL}/bookings/${bookingId}/reviews`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<ReviewData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to submit review: HTTP ${res.status}`);
  }

  return json.data!;
};

/**
 * Customer or Provider: Fetch review for a specific booking
 */
export const fetchBookingReview = async (
  bookingId: string,
  token: string
): Promise<ReviewData | null> => {
  const res = await fetch(`${API_BASE_URL}/bookings/${bookingId}/review`, {
    method: 'GET',
    headers: authHeaders(token),
  });

  if (res.status === 404) {
    return null; // No review submitted yet
  }

  const json: ApiResponse<ReviewData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to fetch booking review: HTTP ${res.status}`);
  }

  return json.data || null;
};

/**
 * Public: Fetch paginated reviews and rating summary for a service provider
 */
export const fetchProviderReviews = async (
  providerId: string,
  page = 1,
  limit = 10
): Promise<PaginatedReviewsData> => {
  const url = createApiUrl(`/providers/${providerId}/reviews`);
  url.searchParams.append('page', String(page));
  url.searchParams.append('limit', String(limit));

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  const json: ApiResponse<PaginatedReviewsData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to fetch provider reviews: HTTP ${res.status}`);
  }

  return json.data!;
};

/**
 * Provider: Submit a single professional reply to a customer review
 */
export const replyToReview = async (
  reviewId: string,
  payload: ReviewReplyPayload,
  token: string
): Promise<ReviewData> => {
  const res = await fetch(`${API_BASE_URL}/reviews/${reviewId}/reply`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<ReviewData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to submit provider reply: HTTP ${res.status}`);
  }

  return json.data!;
};
