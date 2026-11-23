import {
  ApiResponse,
  ProviderEarningsSummaryData,
  ProviderLedgerEntryData,
  PaginationMeta,
  UpdateProviderPayoutAccountPayload,
} from '@dwellio/shared';
import { API_BASE_URL, createApiUrl } from '../config/api';

const authHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

/**
 * Retrieves KPI earnings summary, balances, and payout details for provider.
 */
export const fetchProviderEarningsSummary = async (
  token: string
): Promise<ProviderEarningsSummaryData> => {
  const res = await fetch(`${API_BASE_URL}/provider/earnings/summary`, {
    headers: authHeaders(token),
  });

  const json: ApiResponse<ProviderEarningsSummaryData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to fetch earnings summary (HTTP ${res.status})`);
  }

  return json.data!;
};

/**
 * Retrieves paginated audit ledger of all credits, commission debits, and settlements.
 */
export const fetchProviderLedger = async (
  token: string,
  page: number = 1,
  limit: number = 20
): Promise<{ entries: ProviderLedgerEntryData[]; pagination: PaginationMeta }> => {
  const url = createApiUrl('/provider/earnings/ledger');
  url.searchParams.append('page', page.toString());
  url.searchParams.append('limit', limit.toString());

  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });

  const json: ApiResponse<{ entries: ProviderLedgerEntryData[]; pagination: PaginationMeta }> =
    await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to fetch earnings ledger (HTTP ${res.status})`);
  }

  return json.data!;
};

/**
 * Updates provider payout bank account or UPI ID with masked storage.
 */
export const updateProviderPayoutAccount = async (
  payload: UpdateProviderPayoutAccountPayload,
  token: string
): Promise<{ message: string; payoutAccount: any }> => {
  const res = await fetch(`${API_BASE_URL}/provider/payout-account`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<{ payoutAccount: any }> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to update payout account (HTTP ${res.status})`);
  }

  return { message: json.message, payoutAccount: json.data?.payoutAccount };
};
