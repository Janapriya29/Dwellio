import {
  ApiResponse,
  PaginationMeta,
  AdminOverviewData,
  ProviderProfileData,
  CategoryData,
  ServiceData,
  AdminBookingItem,
  BookingData,
  AdminReviewItem,
  ModerateReviewPayload,
  AuditLogData,
  AuditLogAction,
  BookingStatus,
} from '@dwellio/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const authHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

export interface AdminProviderApplicationItem extends ProviderProfileData {
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

// ----------------------------------------------------
// 1. Platform Overview
// ----------------------------------------------------
export const fetchAdminOverview = async (token: string): Promise<AdminOverviewData> => {
  const res = await fetch(`${API_BASE_URL}/admin/overview`, {
    headers: authHeaders(token),
  });

  const json: ApiResponse<AdminOverviewData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch admin overview: HTTP ${res.status}`);
  }

  return json.data;
};

// ----------------------------------------------------
// 2. Provider Application Management
// ----------------------------------------------------
export const fetchAdminApplications = async (
  token: string,
  params?: { page?: number; limit?: number; status?: 'pending' | 'approved' | 'rejected' }
): Promise<PaginatedResponse<AdminProviderApplicationItem>> => {
  const url = new URL(`${API_BASE_URL}/admin/providers/applications`);
  if (params?.page) url.searchParams.append('page', params.page.toString());
  if (params?.limit) url.searchParams.append('limit', params.limit.toString());
  if (params?.status) url.searchParams.append('status', params.status);

  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });

  const json: ApiResponse<AdminProviderApplicationItem[]> & { pagination?: PaginationMeta } = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch applications: HTTP ${res.status}`);
  }

  return {
    items: json.data,
    pagination: json.pagination || {
      page: params?.page || 1,
      limit: params?.limit || 10,
      total: json.data.length,
      totalPages: 1,
    },
  };
};

export const approveAdminApplication = async (
  token: string,
  applicationId: string
): Promise<ProviderProfileData> => {
  const res = await fetch(`${API_BASE_URL}/admin/providers/applications/${applicationId}/approve`, {
    method: 'PATCH',
    headers: authHeaders(token),
  });

  const json: ApiResponse<{ application: ProviderProfileData }> = await res.json();
  if (!res.ok || !json.success || !json.data?.application) {
    throw new Error(json.message || `Failed to approve application: HTTP ${res.status}`);
  }

  return json.data.application;
};

export const rejectAdminApplication = async (
  token: string,
  applicationId: string,
  reason: string
): Promise<ProviderProfileData> => {
  const res = await fetch(`${API_BASE_URL}/admin/providers/applications/${applicationId}/reject`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ reason }),
  });

  const json: ApiResponse<{ application: ProviderProfileData }> = await res.json();
  if (!res.ok || !json.success || !json.data?.application) {
    throw new Error(json.message || `Failed to reject application: HTTP ${res.status}`);
  }

  return json.data.application;
};

// ----------------------------------------------------
// 3. Service Catalog Management
// ----------------------------------------------------
export const fetchAdminCategories = async (token: string): Promise<CategoryData[]> => {
  const res = await fetch(`${API_BASE_URL}/admin/catalog/categories`, {
    headers: authHeaders(token),
  });

  const json: ApiResponse<CategoryData[]> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch admin categories: HTTP ${res.status}`);
  }

  return json.data;
};

export interface CreateCategoryInput {
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  rooms?: string[];
  isActive?: boolean;
}

export const createAdminCategory = async (
  token: string,
  payload: CreateCategoryInput
): Promise<CategoryData> => {
  const res = await fetch(`${API_BASE_URL}/admin/catalog/categories`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<CategoryData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to create category: HTTP ${res.status}`);
  }

  return json.data;
};

export interface UpdateCategoryInput {
  name?: string;
  description?: string;
  icon?: string;
  rooms?: string[];
}

export const updateAdminCategory = async (
  token: string,
  categoryId: string,
  payload: UpdateCategoryInput
): Promise<CategoryData> => {
  const res = await fetch(`${API_BASE_URL}/admin/catalog/categories/${categoryId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<CategoryData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to update category: HTTP ${res.status}`);
  }

  return json.data;
};

export const setAdminCategoryStatus = async (
  token: string,
  categoryId: string,
  isActive: boolean
): Promise<CategoryData> => {
  const res = await fetch(`${API_BASE_URL}/admin/catalog/categories/${categoryId}/status`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ isActive }),
  });

  const json: ApiResponse<CategoryData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to change category status: HTTP ${res.status}`);
  }

  return json.data;
};

export const fetchAdminServices = async (
  token: string,
  categoryId?: string
): Promise<ServiceData[]> => {
  const url = new URL(`${API_BASE_URL}/admin/catalog/services`);
  if (categoryId) url.searchParams.append('categoryId', categoryId);

  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });

  const json: ApiResponse<ServiceData[]> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch admin services: HTTP ${res.status}`);
  }

  return json.data;
};

export interface CreateServiceInput {
  categoryId: string;
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  isActive?: boolean;
}

export const createAdminService = async (
  token: string,
  payload: CreateServiceInput
): Promise<ServiceData> => {
  const res = await fetch(`${API_BASE_URL}/admin/catalog/services`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<ServiceData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to create service: HTTP ${res.status}`);
  }

  return json.data;
};

export interface UpdateServiceInput {
  name?: string;
  description?: string;
  icon?: string;
  categoryId?: string;
}

export const updateAdminService = async (
  token: string,
  serviceId: string,
  payload: UpdateServiceInput
): Promise<ServiceData> => {
  const res = await fetch(`${API_BASE_URL}/admin/catalog/services/${serviceId}`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<ServiceData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to update service: HTTP ${res.status}`);
  }

  return json.data;
};

export const setAdminServiceStatus = async (
  token: string,
  serviceId: string,
  isActive: boolean
): Promise<ServiceData> => {
  const res = await fetch(`${API_BASE_URL}/admin/catalog/services/${serviceId}/status`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify({ isActive }),
  });

  const json: ApiResponse<ServiceData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to change service status: HTTP ${res.status}`);
  }

  return json.data;
};

// ----------------------------------------------------
// 4. Booking Oversight (Read-Only)
// ----------------------------------------------------
export const fetchAdminBookings = async (
  token: string,
  params?: {
    page?: number;
    limit?: number;
    status?: BookingStatus;
    startDate?: string;
    endDate?: string;
  }
): Promise<PaginatedResponse<AdminBookingItem>> => {
  const url = new URL(`${API_BASE_URL}/admin/bookings`);
  if (params?.page) url.searchParams.append('page', params.page.toString());
  if (params?.limit) url.searchParams.append('limit', params.limit.toString());
  if (params?.status) url.searchParams.append('status', params.status);
  if (params?.startDate) url.searchParams.append('startDate', params.startDate);
  if (params?.endDate) url.searchParams.append('endDate', params.endDate);

  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });

  const json: ApiResponse<AdminBookingItem[]> & { pagination?: PaginationMeta } = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch admin bookings: HTTP ${res.status}`);
  }

  return {
    items: json.data,
    pagination: json.pagination || {
      page: params?.page || 1,
      limit: params?.limit || 10,
      total: json.data.length,
      totalPages: 1,
    },
  };
};

export const fetchAdminBookingById = async (
  token: string,
  bookingId: string
): Promise<BookingData> => {
  const res = await fetch(`${API_BASE_URL}/admin/bookings/${bookingId}`, {
    headers: authHeaders(token),
  });

  const json: ApiResponse<BookingData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch booking details: HTTP ${res.status}`);
  }

  return json.data;
};

// ----------------------------------------------------
// 5. Review Moderation
// ----------------------------------------------------
export const fetchAdminReviews = async (
  token: string,
  params?: {
    page?: number;
    limit?: number;
    isPublished?: boolean;
  }
): Promise<PaginatedResponse<AdminReviewItem>> => {
  const url = new URL(`${API_BASE_URL}/admin/reviews`);
  if (params?.page) url.searchParams.append('page', params.page.toString());
  if (params?.limit) url.searchParams.append('limit', params.limit.toString());
  if (params?.isPublished !== undefined) {
    url.searchParams.append('isPublished', String(params.isPublished));
  }

  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });

  const json: ApiResponse<AdminReviewItem[]> & { pagination?: PaginationMeta } = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch admin reviews: HTTP ${res.status}`);
  }

  return {
    items: json.data,
    pagination: json.pagination || {
      page: params?.page || 1,
      limit: params?.limit || 10,
      total: json.data.length,
      totalPages: 1,
    },
  };
};

export const moderateAdminReview = async (
  token: string,
  reviewId: string,
  payload: ModerateReviewPayload
): Promise<AdminReviewItem> => {
  const res = await fetch(`${API_BASE_URL}/admin/reviews/${reviewId}/moderate`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<AdminReviewItem> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to moderate review: HTTP ${res.status}`);
  }

  return json.data;
};

// ----------------------------------------------------
// 6. Audit Trail Logging
// ----------------------------------------------------
export const fetchAdminAuditLogs = async (
  token: string,
  params?: {
    page?: number;
    limit?: number;
    action?: AuditLogAction;
  }
): Promise<PaginatedResponse<AuditLogData>> => {
  const url = new URL(`${API_BASE_URL}/admin/audit-logs`);
  if (params?.page) url.searchParams.append('page', params.page.toString());
  if (params?.limit) url.searchParams.append('limit', params.limit.toString());
  if (params?.action) url.searchParams.append('action', params.action);

  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });

  const json: ApiResponse<AuditLogData[]> & { pagination?: PaginationMeta } = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch audit logs: HTTP ${res.status}`);
  }

  return {
    items: json.data,
    pagination: json.pagination || {
      page: params?.page || 1,
      limit: params?.limit || 10,
      total: json.data.length,
      totalPages: 1,
    },
  };
};
