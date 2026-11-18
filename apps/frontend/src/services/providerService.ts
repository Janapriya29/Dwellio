import { ApiResponse, ProviderProfileData } from '@dwellio/shared';
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
