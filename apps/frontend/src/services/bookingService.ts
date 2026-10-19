import {
  ApiResponse,
  BookingData,
  CreateBookingPayload,
  CancelBookingPayload,
  RejectBookingPayload,
  UpdateBookingStatusPayload,
} from '@dwellio/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const authHeaders = (token?: string) => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

/**
 * Customer: Submit a new booking request
 */
export const createBooking = async (
  payload: CreateBookingPayload,
  token: string
): Promise<BookingData> => {
  const res = await fetch(`${API_BASE_URL}/bookings`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<BookingData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to create booking: HTTP ${res.status}`);
  }

  return json.data!;
};

/**
 * Customer: Retrieve all bookings for authenticated customer
 */
export const fetchCustomerBookings = async (
  token: string,
  status?: string
): Promise<BookingData[]> => {
  const url = new URL(`${API_BASE_URL}/bookings`);
  if (status) {
    url.searchParams.append('status', status);
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: authHeaders(token),
  });

  const json: ApiResponse<BookingData[]> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to fetch customer bookings: HTTP ${res.status}`);
  }

  return json.data || [];
};

/**
 * Customer: Get booking details
 */
export const fetchCustomerBookingById = async (
  id: string,
  token: string
): Promise<BookingData> => {
  const res = await fetch(`${API_BASE_URL}/bookings/${id}`, {
    method: 'GET',
    headers: authHeaders(token),
  });

  const json: ApiResponse<BookingData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to fetch booking details: HTTP ${res.status}`);
  }

  return json.data!;
};

/**
 * Customer: Cancel an active booking
 */
export const cancelCustomerBooking = async (
  id: string,
  reason: string | undefined,
  token: string
): Promise<BookingData> => {
  const payload: CancelBookingPayload = { reason };
  const res = await fetch(`${API_BASE_URL}/bookings/${id}/cancel`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<BookingData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to cancel booking: HTTP ${res.status}`);
  }

  return json.data!;
};

/**
 * Provider: Retrieve bookings assigned to authenticated provider
 */
export const fetchProviderBookings = async (
  token: string,
  status?: string
): Promise<BookingData[]> => {
  const url = new URL(`${API_BASE_URL}/provider/bookings`);
  if (status) {
    url.searchParams.append('status', status);
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: authHeaders(token),
  });

  const json: ApiResponse<BookingData[]> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to fetch provider bookings: HTTP ${res.status}`);
  }

  return json.data || [];
};

/**
 * Provider: Accept a requested booking
 */
export const acceptProviderBooking = async (
  id: string,
  token: string
): Promise<BookingData> => {
  const res = await fetch(`${API_BASE_URL}/provider/bookings/${id}/accept`, {
    method: 'PATCH',
    headers: authHeaders(token),
  });

  const json: ApiResponse<BookingData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to accept booking: HTTP ${res.status}`);
  }

  return json.data!;
};

/**
 * Provider: Decline a requested booking
 */
export const rejectProviderBooking = async (
  id: string,
  reason: string | undefined,
  token: string
): Promise<BookingData> => {
  const payload: RejectBookingPayload = { reason };
  const res = await fetch(`${API_BASE_URL}/provider/bookings/${id}/reject`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<BookingData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to decline booking: HTTP ${res.status}`);
  }

  return json.data!;
};

/**
 * Provider: Update status for an accepted booking (on_the_way -> in_progress -> completed)
 */
export const updateProviderBookingStatus = async (
  id: string,
  status: 'on_the_way' | 'in_progress' | 'completed' | 'cancelled',
  reason: string | undefined,
  token: string
): Promise<BookingData> => {
  const payload: UpdateBookingStatusPayload = { status, reason };
  const res = await fetch(`${API_BASE_URL}/provider/bookings/${id}/status`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<BookingData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to update status: HTTP ${res.status}`);
  }

  return json.data!;
};
