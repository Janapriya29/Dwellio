import { ApiResponse, QueueSystemHealthData } from '@dwellio/shared';
import { createApiUrl } from '../config/api';

const authHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

/**
 * Fetch BullMQ and Redis system health status (Admin only)
 */
export const getAdminQueueMetrics = async (
  token: string
): Promise<QueueSystemHealthData> => {
  const url = createApiUrl('/admin/system/queues');
  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });

  const json: ApiResponse<QueueSystemHealthData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch queue metrics: HTTP ${res.status}`);
  }

  return json.data;
};
