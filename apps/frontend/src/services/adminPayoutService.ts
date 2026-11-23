import {
  ApiResponse,
  PayoutBatchData,
  PaginationMeta,
  AdminInitiateRefundPayload,
  BookingData,
} from '@dwellio/shared';
import { API_BASE_URL, createApiUrl } from '../config/api';

const authHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

/**
 * Admin: List weekly provider payout batches.
 */
export const listPayoutBatches = async (
  token: string,
  page: number = 1,
  limit: number = 15,
  status?: string
): Promise<{ batches: PayoutBatchData[]; pagination: PaginationMeta }> => {
  const url = createApiUrl('/admin/payouts/batches');
  url.searchParams.append('page', page.toString());
  url.searchParams.append('limit', limit.toString());
  if (status && status !== 'all') {
    url.searchParams.append('status', status);
  }

  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });

  const json: ApiResponse<{ batches: PayoutBatchData[]; pagination: PaginationMeta }> =
    await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to fetch payout batches (HTTP ${res.status})`);
  }

  return json.data!;
};

/**
 * Admin: Generate a new weekly payout batch from all unallocated available earnings.
 */
export const generatePayoutBatch = async (
  token: string
): Promise<{ batch: PayoutBatchData; totalAllocatedRupees: number; providerCount: number }> => {
  const res = await fetch(`${API_BASE_URL}/admin/payouts/batches/generate`, {
    method: 'POST',
    headers: authHeaders(token),
  });

  const json: ApiResponse<{
    batch: PayoutBatchData;
    totalAllocatedRupees: number;
    providerCount: number;
  }> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to generate payout batch (HTTP ${res.status})`);
  }

  return json.data!;
};

/**
 * Admin: Approve a draft payout batch.
 */
export const approvePayoutBatch = async (
  batchId: string,
  token: string
): Promise<PayoutBatchData> => {
  const res = await fetch(`${API_BASE_URL}/admin/payouts/batches/${batchId}/approve`, {
    method: 'PATCH',
    headers: authHeaders(token),
  });

  const json: ApiResponse<PayoutBatchData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to approve payout batch (HTTP ${res.status})`);
  }

  return json.data!;
};

/**
 * Admin: Mark an approved payout batch as settled once bank disbursement is completed.
 */
export const settlePayoutBatch = async (
  batchId: string,
  token: string,
  referenceNote?: string
): Promise<PayoutBatchData> => {
  const res = await fetch(`${API_BASE_URL}/admin/payouts/batches/${batchId}/settle`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ referenceNote }),
  });

  const json: ApiResponse<PayoutBatchData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to settle payout batch (HTTP ${res.status})`);
  }

  return json.data!;
};

/**
 * Admin: Issue a manual full or partial refund for a booking.
 */
export const issueAdminRefund = async (
  bookingId: string,
  payload: AdminInitiateRefundPayload,
  token: string
): Promise<{ booking: BookingData; refund: any }> => {
  const res = await fetch(`${API_BASE_URL}/admin/bookings/${bookingId}/refund`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<{ booking: BookingData; refund: any }> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to process refund (HTTP ${res.status})`);
  }

  return json.data!;
};
