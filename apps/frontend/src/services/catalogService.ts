import { ApiResponse, CategoryData, ServiceData, PublicProviderData, HouseRoom, ProviderAvailabilityData } from '@dwellio/shared';
import { createApiUrl } from '../config/api';

/**
 * Fetch active service categories, optionally filtered by house cutaway room.
 */
export const fetchCategories = async (room?: HouseRoom): Promise<CategoryData[]> => {
  const url = createApiUrl('/catalog/categories');
  if (room) {
    url.searchParams.append('room', room);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Failed to load categories: HTTP ${res.status}`);
  }

  const json: ApiResponse<CategoryData[]> = await res.json();
  return json.data || [];
};

/**
 * Fetch active services, optionally filtered by category.
 */
export const fetchServices = async (categoryId?: string, categorySlug?: string): Promise<ServiceData[]> => {
  const url = createApiUrl('/catalog/services');
  if (categoryId) {
    url.searchParams.append('categoryId', categoryId);
  } else if (categorySlug) {
    url.searchParams.append('categorySlug', categorySlug);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Failed to load services: HTTP ${res.status}`);
  }

  const json: ApiResponse<ServiceData[]> = await res.json();
  return json.data || [];
};

export interface ProviderFilterParams {
  room?: HouseRoom;
  serviceArea?: string;
  skill?: string;
}

/**
 * Fetch approved service providers for a specific room, service area, or skill.
 */
export const fetchApprovedProviders = async (
  filters?: HouseRoom | ProviderFilterParams
): Promise<PublicProviderData[]> => {
  const url = createApiUrl('/catalog/providers');
  if (typeof filters === 'string') {
    url.searchParams.append('room', filters);
  } else if (filters) {
    if (filters.room) {
      url.searchParams.append('room', filters.room);
    }
    if (filters.serviceArea && filters.serviceArea.trim()) {
      url.searchParams.append('serviceArea', filters.serviceArea.trim());
    }
    if (filters.skill && filters.skill.trim()) {
      url.searchParams.append('skill', filters.skill.trim());
    }
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Failed to load verified service professionals: HTTP ${res.status}`);
  }

  const json: ApiResponse<PublicProviderData[]> = await res.json();
  return json.data || [];
};

/**
 * Fetch provider slot availability for a specified date and wall-clock timezone offset.
 */
export const fetchProviderAvailability = async (
  providerId: string,
  dateStr: string,
  tzOffset?: number
): Promise<ProviderAvailabilityData> => {
  const url = createApiUrl(`/catalog/providers/${encodeURIComponent(providerId)}/availability`);
  url.searchParams.append('date', dateStr);
  const offset = tzOffset !== undefined ? tzOffset : new Date().getTimezoneOffset();
  url.searchParams.append('tzOffset', offset.toString());

  const res = await fetch(url.toString());
  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.message || `Failed to load provider availability: HTTP ${res.status}`);
  }

  const json: ApiResponse<ProviderAvailabilityData> = await res.json();
  if (!json.data) {
    throw new Error('Malformed availability response from server.');
  }

  return json.data;
};
