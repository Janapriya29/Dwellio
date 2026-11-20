import {
  ApiResponse,
  ProviderProfileData,
  ProviderDashboardStats,
  ProviderReviewsData,
  UpdateProviderProfilePayload,
  ProviderWorkingDay,
  ProviderBlockedDate,
} from '@dwellio/shared';
import { API_BASE_URL } from '../config/api';

export interface ApplyProviderPayload {
  displayName: string;
  phone: string;
  serviceArea: string;
  skills: string[];
}

export interface ApplicationStatusData {
  hasApplication: boolean;
  application: ProviderProfileData | null;
}

/**
 * Submit or resubmit a provider application
 */
export const submitProviderApplication = async (
  payload: ApplyProviderPayload,
  token: string
): Promise<ProviderProfileData> => {
  const response = await fetch(`${API_BASE_URL}/providers/apply`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<{ application: ProviderProfileData }> = await response.json();
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.message || 'Failed to submit provider application.');
  }

  return json.data.application;
};

/**
 * Fetch provider application status for current authenticated account
 */
export const fetchProviderApplicationStatus = async (
  token: string
): Promise<ApplicationStatusData> => {
  const response = await fetch(`${API_BASE_URL}/providers/application-status`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 404) {
    return {
      hasApplication: false,
      application: null,
    };
  }

  const json: ApiResponse<{ application: ProviderProfileData }> = await response.json();
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.message || 'Failed to retrieve provider application status.');
  }

  return {
    hasApplication: true,
    application: json.data.application,
  };
};

/**
 * Fetch current authenticated approved provider profile (Phase 2 Milestone 2A)
 */
export const fetchCurrentProviderProfile = async (token: string): Promise<ProviderProfileData> => {
  const response = await fetch(`${API_BASE_URL}/provider/profile`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const json: ApiResponse<ProviderProfileData> = await response.json();
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.message || 'Failed to retrieve provider profile.');
  }

  return json.data;
};

/**
 * Update current authenticated approved provider profile (Phase 2 Milestone 2A)
 */
export const updateCurrentProviderProfile = async (
  payload: UpdateProviderProfilePayload,
  token: string
): Promise<ProviderProfileData> => {
  const response = await fetch(`${API_BASE_URL}/provider/profile`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<ProviderProfileData> = await response.json();
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.message || 'Failed to update provider profile.');
  }

  return json.data;
};

/**
 * Fetch weekly working schedule and blocked dates (Phase 2 Milestone 2B)
 */
export const fetchProviderSchedule = async (
  token: string
): Promise<{
  isAcceptingJobs: boolean;
  workingSchedule: ProviderWorkingDay[];
  blockedDates: ProviderBlockedDate[];
}> => {
  const response = await fetch(`${API_BASE_URL}/provider/schedule`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const json: ApiResponse<{
    isAcceptingJobs: boolean;
    workingSchedule: ProviderWorkingDay[];
    blockedDates: ProviderBlockedDate[];
  }> = await response.json();

  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.message || 'Failed to retrieve provider schedule.');
  }

  return json.data;
};

/**
 * Update provider weekly working schedule and blocked dates (Phase 2 Milestone 2B)
 */
export const updateProviderSchedule = async (
  payload: {
    workingSchedule: ProviderWorkingDay[];
    blockedDates?: ProviderBlockedDate[];
  },
  token: string
): Promise<{
  isAcceptingJobs: boolean;
  workingSchedule: ProviderWorkingDay[];
  blockedDates: ProviderBlockedDate[];
}> => {
  const response = await fetch(`${API_BASE_URL}/provider/schedule`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const json = await response.json();
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.message || 'Failed to update schedule.');
  }

  return json.data;
};

/**
 * Instant toggle for Accepting Jobs status (ON/OFF) (Phase 2 Milestone 2B)
 */
export const updateProviderAvailabilityStatus = async (
  isAcceptingJobs: boolean,
  token: string
): Promise<{ isAcceptingJobs: boolean }> => {
  const response = await fetch(`${API_BASE_URL}/provider/availability-status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isAcceptingJobs }),
  });

  const json = await response.json();
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.message || 'Failed to update availability status.');
  }

  return json.data;
};

/**
 * Fetch provider dashboard KPIs, earnings summary, and today's agenda (Phase 2 Milestone 2D)
 */
export const fetchProviderDashboardStats = async (token: string): Promise<ProviderDashboardStats> => {
  const response = await fetch(`${API_BASE_URL}/provider/dashboard/stats`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const json: ApiResponse<ProviderDashboardStats> = await response.json();
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.message || 'Failed to retrieve provider dashboard stats.');
  }

  return json.data;
};

/**
 * Fetch paginated reviews with rating filters and summary breakdown (Phase 2 Milestone 2D)
 */
export const fetchProviderReviews = async (
  token: string,
  options?: { page?: number; limit?: number; rating?: number; hasReply?: boolean }
): Promise<ProviderReviewsData> => {
  const params = new URLSearchParams();
  if (options?.page) params.append('page', options.page.toString());
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.rating) params.append('rating', options.rating.toString());
  if (options?.hasReply !== undefined) params.append('hasReply', options.hasReply.toString());

  const url = `${API_BASE_URL}/provider/reviews${params.toString() ? `?${params.toString()}` : ''}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const json: ApiResponse<ProviderReviewsData> = await response.json();
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.message || 'Failed to retrieve provider reviews.');
  }

  return json.data;
};
