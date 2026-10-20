import {
  ApiResponse,
  NotificationData,
  NotificationUnreadCountData,
  MarkAllReadResponseData,
  PaginationMeta,
} from '@dwellio/shared';
import { API_BASE_URL, createApiUrl } from '../config/api';

const authHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

export interface PaginatedNotifications {
  notifications: NotificationData[];
  pagination: PaginationMeta;
}

/**
 * Fetch paginated notifications for the authenticated user
 */
export const fetchNotifications = async (
  token: string,
  params?: { page?: number; limit?: number; unreadOnly?: boolean }
): Promise<PaginatedNotifications> => {
  const url = createApiUrl('/notifications');
  if (params?.page) url.searchParams.append('page', params.page.toString());
  if (params?.limit) url.searchParams.append('limit', params.limit.toString());
  if (params?.unreadOnly !== undefined) {
    url.searchParams.append('unreadOnly', String(params.unreadOnly));
  }

  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });

  const json: ApiResponse<NotificationData[]> & { pagination?: PaginationMeta } = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch notifications: HTTP ${res.status}`);
  }

  return {
    notifications: json.data,
    pagination: json.pagination || {
      page: params?.page || 1,
      limit: params?.limit || 15,
      total: json.data.length,
      totalPages: 1,
    },
  };
};

/**
 * Fetch count of unread notifications for the authenticated user
 */
export const fetchUnreadNotificationCount = async (token: string): Promise<number> => {
  const res = await fetch(`${API_BASE_URL}/notifications/unread-count`, {
    headers: authHeaders(token),
  });

  const json: ApiResponse<NotificationUnreadCountData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch unread count: HTTP ${res.status}`);
  }

  return json.data.unreadCount;
};

/**
 * Mark a single notification as read
 */
export const markNotificationAsRead = async (
  token: string,
  notificationId: string
): Promise<NotificationData> => {
  const res = await fetch(`${API_BASE_URL}/notifications/${notificationId}/read`, {
    method: 'PATCH',
    headers: authHeaders(token),
  });

  const json: ApiResponse<NotificationData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to mark notification as read: HTTP ${res.status}`);
  }

  return json.data;
};

/**
 * Mark all unread notifications as read for the authenticated user
 */
export const markAllNotificationsAsRead = async (token: string): Promise<number> => {
  const res = await fetch(`${API_BASE_URL}/notifications/read-all`, {
    method: 'PATCH',
    headers: authHeaders(token),
  });

  const json: ApiResponse<MarkAllReadResponseData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to mark all notifications as read: HTTP ${res.status}`);
  }

  return json.data.markedCount;
};
