import {
  ApiResponse,
  CreatePaymentOrderPayload,
  CreatePaymentOrderResponseData,
  VerifyPaymentPayload,
  PaymentData,
} from '@dwellio/shared';
import { API_BASE_URL } from '../config/api';

const authHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

/**
 * Creates a server-side Razorpay order for an accepted booking.
 * Calculates price and applies coupon discount securely on the backend.
 */
export const createPaymentOrder = async (
  payload: CreatePaymentOrderPayload,
  token: string
): Promise<CreatePaymentOrderResponseData> => {
  const res = await fetch(`${API_BASE_URL}/payments/create-order`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<CreatePaymentOrderResponseData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Failed to create payment order (HTTP ${res.status})`);
  }

  return json.data!;
};

/**
 * Verifies cryptographic HMAC SHA256 payment signature and confirms booking payment.
 */
export const verifyPayment = async (
  payload: VerifyPaymentPayload,
  token: string
): Promise<PaymentData> => {
  const res = await fetch(`${API_BASE_URL}/payments/verify`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<PaymentData> = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || `Payment verification failed (HTTP ${res.status})`);
  }

  return json.data!;
};
