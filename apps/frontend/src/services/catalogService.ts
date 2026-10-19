import { ApiResponse, CategoryData, ServiceData, PublicProviderData, HouseRoom } from '@dwellio/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

/**
 * Fetch active service categories, optionally filtered by house cutaway room.
 */
export const fetchCategories = async (room?: HouseRoom): Promise<CategoryData[]> => {
  const url = new URL(`${API_BASE_URL}/catalog/categories`);
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
  const url = new URL(`${API_BASE_URL}/catalog/services`);
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

/**
 * Fetch approved service providers for a specific room or skill.
 */
export const fetchApprovedProviders = async (room?: HouseRoom): Promise<PublicProviderData[]> => {
  const url = new URL(`${API_BASE_URL}/catalog/providers`);
  if (room) {
    url.searchParams.append('room', room);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Failed to load verified service professionals: HTTP ${res.status}`);
  }

  const json: ApiResponse<PublicProviderData[]> = await res.json();
  return json.data || [];
};
