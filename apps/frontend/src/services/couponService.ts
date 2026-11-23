import {
  ApiResponse,
  ValidateCouponPayload,
  ValidateCouponResponseData,
  CouponData,
  PaginationMeta,
  CreateCouponPayload,
  UpdateCouponPayload,
} from '@dwellio/shared';
import { API_BASE_URL, createApiUrl } from '../config/api';

const authHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

/**
 * Validates a coupon code during booking checkout preview.
 */
export const validateCoupon = async (
  payload: ValidateCouponPayload,
  token: string
): Promise<ValidateCouponResponseData> => {
  const res = await fetch(`${API_BASE_URL}/coupons/validate`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<ValidateCouponResponseData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Coupon validation failed (HTTP ${res.status})`);
  }

  return json.data!;
};

/**
 * Admin: List promotional coupons with pagination and search.
 */
export const listAdminCoupons = async (
  token: string,
  page: number = 1,
  limit: number = 15,
  q?: string
): Promise<{ coupons: CouponData[]; pagination: PaginationMeta }> => {
  const url = createApiUrl('/admin/coupons');
  url.searchParams.append('page', page.toString());
  url.searchParams.append('limit', limit.toString());
  if (q && q.trim()) {
    url.searchParams.append('q', q.trim());
  }

  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });

  const json: ApiResponse<{ coupons: CouponData[]; pagination: PaginationMeta }> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to fetch coupons (HTTP ${res.status})`);
  }

  return json.data!;
};

/**
 * Admin: Create a new promotional coupon.
 */
export const createAdminCoupon = async (
  payload: CreateCouponPayload,
  token: string
): Promise<CouponData> => {
  const res = await fetch(`${API_BASE_URL}/admin/coupons`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<CouponData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to create coupon (HTTP ${res.status})`);
  }

  return json.data!;
};

/**
 * Admin: Update an existing coupon.
 */
export const updateAdminCoupon = async (
  id: string,
  payload: UpdateCouponPayload,
  token: string
): Promise<CouponData> => {
  const res = await fetch(`${API_BASE_URL}/admin/coupons/${id}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<CouponData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to update coupon (HTTP ${res.status})`);
  }

  return json.data!;
};

/**
 * Admin: Toggle active state of a coupon.
 */
export const toggleAdminCouponStatus = async (
  id: string,
  token: string
): Promise<{ id: string; code: string; isActive: boolean }> => {
  const res = await fetch(`${API_BASE_URL}/admin/coupons/${id}/status`, {
    method: 'PATCH',
    headers: authHeaders(token),
  });

  const json: ApiResponse<{ id: string; code: string; isActive: boolean }> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to toggle coupon status (HTTP ${res.status})`);
  }

  return json.data!;
};
