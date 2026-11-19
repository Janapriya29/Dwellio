import { ApiResponse, AuthResponseData, SafeUser, UpdateProfilePayload } from '@dwellio/shared';
import { API_BASE_URL } from '../config/api';

export interface RegisterCustomerPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

/**
 * Register a new customer account
 */
export const registerCustomer = async (
  payload: RegisterCustomerPayload
): Promise<AuthResponseData> => {
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<AuthResponseData> = await response.json();
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.message || 'Registration failed. Please try again.');
  }

  return json.data;
};

/**
 * Login user (Customer, Provider, or Administrator)
 */
export const loginUser = async (
  payload: LoginPayload
): Promise<AuthResponseData> => {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<AuthResponseData> = await response.json();
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.message || 'Login failed. Please check your credentials.');
  }

  return json.data;
};

/**
 * Fetch current authenticated user profile
 */
export const fetchCurrentUser = async (token: string): Promise<SafeUser> => {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const json: ApiResponse<{ user: SafeUser }> = await response.json();
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.message || 'Failed to fetch user session.');
  }

  return json.data.user;
};

/**
 * Update authenticated user profile
 */
export const updateUserProfile = async (
  payload: UpdateProfilePayload,
  token: string
): Promise<SafeUser> => {
  const response = await fetch(`${API_BASE_URL}/auth/profile`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<{ user: SafeUser }> = await response.json();
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.message || 'Failed to update user profile.');
  }

  return json.data.user;
};
