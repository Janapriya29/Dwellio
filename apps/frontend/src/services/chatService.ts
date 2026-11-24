import {
  ApiResponse,
  ConversationData,
  MessageData,
  UnreadCountResponseData,
} from '@dwellio/shared';
import { createApiUrl } from '../config/api';

const authHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

export interface BookingMessagesResponse {
  conversation: ConversationData;
  messages: MessageData[];
  pagination?: {
    total: number;
    limit: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}

/**
 * Fetch conversation details and messages for a booking (with optional pagination)
 */
export const getBookingMessages = async (
  bookingId: string,
  token: string,
  options?: { limit?: number; before?: string }
): Promise<BookingMessagesResponse> => {
  const url = createApiUrl(`/bookings/${bookingId}/messages`);
  if (options?.limit) {
    url.searchParams.set('limit', String(options.limit));
  }
  if (options?.before) {
    url.searchParams.set('before', options.before);
  }
  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });

  const json: ApiResponse<BookingMessagesResponse> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch messages: HTTP ${res.status}`);
  }

  return json.data;
};

/**
 * Send a new chat message to a booking conversation
 */
export const sendBookingMessage = async (
  bookingId: string,
  content: string,
  token: string
): Promise<MessageData> => {
  const url = createApiUrl(`/bookings/${bookingId}/messages`);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ content }),
  });

  const json: ApiResponse<{ message: MessageData }> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to send message: HTTP ${res.status}`);
  }

  return json.data.message;
};

/**
 * Mark messages in a booking conversation as read
 */
export const markMessagesRead = async (
  bookingId: string,
  token: string
): Promise<number> => {
  const url = createApiUrl(`/bookings/${bookingId}/messages/read`);
  const res = await fetch(url.toString(), {
    method: 'PATCH',
    headers: authHeaders(token),
  });

  const json: ApiResponse<{ markedCount: number }> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to mark messages as read: HTTP ${res.status}`);
  }

  return json.data.markedCount;
};

/**
 * Fetch total unread chat messages count across all user bookings
 */
export const getUnreadChatCount = async (
  token: string
): Promise<UnreadCountResponseData> => {
  const url = createApiUrl('/conversations/unread-count');
  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });

  const json: ApiResponse<UnreadCountResponseData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch unread count: HTTP ${res.status}`);
  }

  return json.data;
};
