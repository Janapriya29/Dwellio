import {
  ApiResponse,
  PaginationMeta,
  AdminOverviewData,
  AdminAnalyticsData,
  ProviderProfileData,
  AdminProviderApplicationItem,
  ProviderVerificationStatus,
  CategoryData,
  ServiceData,
  AdminBookingItem,
  BookingData,
  AdminCustomerItem,
  AdminCustomerDetail,
  UpdateCustomerStatusPayload,
  AdminProviderDetail,
  UpdateProviderStatusPayload,
  AdminCancelBookingPayload,
  AdminUpdatePaymentStatusPayload,
  DisputeData,
  ResolveDisputePayload,
  AnnouncementData,
  CreateAnnouncementPayload,
  PlatformSettingsData,
  UpdatePlatformSettingsPayload,
  AdminReviewItem,
  ModerateReviewPayload,
  AuditLogData,
  AuditLogAction,
  BookingStatus,
} from '@dwellio/shared';
import { API_BASE_URL, createApiUrl } from '../config/api';

const authHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

export type { AdminProviderApplicationItem };

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}

// ----------------------------------------------------
// 1. Platform Overview & Analytics (Milestone 3A)
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

export const fetchAdminAnalytics = async (token: string): Promise<AdminAnalyticsData> => {
  const res = await fetch(`${API_BASE_URL}/admin/analytics`, {
    headers: authHeaders(token),
  });

  const json: ApiResponse<AdminAnalyticsData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch admin analytics: HTTP ${res.status}`);
  }

  return json.data;
};

// ----------------------------------------------------
// 2. Provider Application Management
// ----------------------------------------------------
export const fetchAdminApplications = async (
  token: string,
  params?: { page?: number; limit?: number; status?: ProviderVerificationStatus }
): Promise<PaginatedResponse<AdminProviderApplicationItem>> => {
  const url = createApiUrl('/admin/providers/applications');
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
// 3. Service Catalog Management (Milestone 3C)
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
  const url = createApiUrl('/admin/catalog/services');
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
  basePrice?: number;
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
  basePrice?: number;
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
// 4. Booking Oversight & Intervention (Milestone 3D)
// ----------------------------------------------------
export const fetchAdminBookings = async (
  token: string,
  params?: {
    page?: number;
    limit?: number;
    q?: string;
    status?: BookingStatus;
    startDate?: string;
    endDate?: string;
  }
): Promise<PaginatedResponse<AdminBookingItem>> => {
  const url = createApiUrl('/admin/bookings');
  if (params?.page) url.searchParams.append('page', params.page.toString());
  if (params?.limit) url.searchParams.append('limit', params.limit.toString());
  if (params?.q) url.searchParams.append('q', params.q);
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

export const adminCancelBooking = async (
  token: string,
  bookingId: string,
  payload: AdminCancelBookingPayload
): Promise<BookingData> => {
  const res = await fetch(`${API_BASE_URL}/admin/bookings/${bookingId}/cancel`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<BookingData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to cancel booking: HTTP ${res.status}`);
  }

  return json.data;
};

export const adminUpdatePaymentStatus = async (
  token: string,
  bookingId: string,
  payload: AdminUpdatePaymentStatusPayload
): Promise<BookingData> => {
  const res = await fetch(`${API_BASE_URL}/admin/bookings/${bookingId}/payment-status`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<BookingData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to update payment status: HTTP ${res.status}`);
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
  const url = createApiUrl('/admin/reviews');
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
  const url = createApiUrl('/admin/audit-logs');
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

// ----------------------------------------------------
// 7. Customer Management (Milestone 3B)
// ----------------------------------------------------
export const fetchAdminCustomers = async (
  token: string,
  params?: {
    page?: number;
    limit?: number;
    q?: string;
    status?: 'active' | 'suspended';
  }
): Promise<PaginatedResponse<AdminCustomerItem>> => {
  const url = createApiUrl('/admin/customers');
  if (params?.page) url.searchParams.append('page', params.page.toString());
  if (params?.limit) url.searchParams.append('limit', params.limit.toString());
  if (params?.q) url.searchParams.append('q', params.q);
  if (params?.status) url.searchParams.append('status', params.status);

  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });

  const json: ApiResponse<AdminCustomerItem[]> & { pagination?: PaginationMeta } = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch customers: HTTP ${res.status}`);
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

export const fetchAdminCustomerById = async (
  token: string,
  customerId: string
): Promise<AdminCustomerDetail> => {
  const res = await fetch(`${API_BASE_URL}/admin/customers/${customerId}`, {
    headers: authHeaders(token),
  });

  const json: ApiResponse<AdminCustomerDetail> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch customer details: HTTP ${res.status}`);
  }

  return json.data;
};

export const updateAdminCustomerStatus = async (
  token: string,
  customerId: string,
  payload: UpdateCustomerStatusPayload
): Promise<AdminCustomerDetail> => {
  const res = await fetch(`${API_BASE_URL}/admin/customers/${customerId}/status`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<AdminCustomerDetail> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to update customer status: HTTP ${res.status}`);
  }

  return json.data;
};

// ----------------------------------------------------
// 8. Provider Governance (Milestone 3C)
// ----------------------------------------------------
export const fetchAdminProviders = async (
  token: string,
  params?: {
    page?: number;
    limit?: number;
    q?: string;
    status?: ProviderVerificationStatus;
  }
): Promise<PaginatedResponse<AdminProviderDetail>> => {
  const url = createApiUrl('/admin/providers');
  if (params?.page) url.searchParams.append('page', params.page.toString());
  if (params?.limit) url.searchParams.append('limit', params.limit.toString());
  if (params?.q) url.searchParams.append('q', params.q);
  if (params?.status) url.searchParams.append('status', params.status);

  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });

  const json: ApiResponse<AdminProviderDetail[]> & { pagination?: PaginationMeta } = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch providers: HTTP ${res.status}`);
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

export const fetchAdminProviderDetail = async (
  token: string,
  providerId: string
): Promise<AdminProviderDetail> => {
  const res = await fetch(`${API_BASE_URL}/admin/providers/${providerId}`, {
    headers: authHeaders(token),
  });

  const json: ApiResponse<AdminProviderDetail> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch provider detail: HTTP ${res.status}`);
  }

  return json.data;
};

export const updateAdminProviderStatus = async (
  token: string,
  providerId: string,
  payload: UpdateProviderStatusPayload
): Promise<AdminProviderDetail> => {
  const res = await fetch(`${API_BASE_URL}/admin/providers/${providerId}/status`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<AdminProviderDetail> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to update provider status: HTTP ${res.status}`);
  }

  return json.data;
};

// ----------------------------------------------------
// 9. Booking Disputes Management (Milestone 3D)
// ----------------------------------------------------
export const fetchAdminDisputes = async (
  token: string,
  params?: {
    page?: number;
    limit?: number;
    status?: string;
    bookingId?: string;
  }
): Promise<PaginatedResponse<DisputeData>> => {
  const url = createApiUrl('/admin/disputes');
  if (params?.page) url.searchParams.append('page', params.page.toString());
  if (params?.limit) url.searchParams.append('limit', params.limit.toString());
  if (params?.status) url.searchParams.append('status', params.status);
  if (params?.bookingId) url.searchParams.append('bookingId', params.bookingId);

  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });

  const json: ApiResponse<DisputeData[]> & { pagination?: PaginationMeta } = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch disputes: HTTP ${res.status}`);
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

export const fetchAdminDisputeById = async (
  token: string,
  disputeId: string
): Promise<DisputeData> => {
  const res = await fetch(`${API_BASE_URL}/admin/disputes/${disputeId}`, {
    headers: authHeaders(token),
  });

  const json: ApiResponse<DisputeData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch dispute: HTTP ${res.status}`);
  }

  return json.data;
};

export const resolveAdminDispute = async (
  token: string,
  disputeId: string,
  payload: ResolveDisputePayload
): Promise<DisputeData> => {
  const res = await fetch(`${API_BASE_URL}/admin/disputes/${disputeId}/resolve`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<DisputeData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to resolve dispute: HTTP ${res.status}`);
  }

  return json.data;
};

// ----------------------------------------------------
// 10. Broadcast Announcements (Milestone 3E)
// ----------------------------------------------------
export const fetchAdminAnnouncements = async (
  token: string,
  params?: {
    page?: number;
    limit?: number;
  }
): Promise<PaginatedResponse<AnnouncementData>> => {
  const url = createApiUrl('/admin/announcements');
  if (params?.page) url.searchParams.append('page', params.page.toString());
  if (params?.limit) url.searchParams.append('limit', params.limit.toString());

  const res = await fetch(url.toString(), {
    headers: authHeaders(token),
  });

  const json: ApiResponse<AnnouncementData[]> & { pagination?: PaginationMeta } = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch announcements: HTTP ${res.status}`);
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

export const createAdminAnnouncement = async (
  token: string,
  payload: CreateAnnouncementPayload
): Promise<AnnouncementData> => {
  const res = await fetch(`${API_BASE_URL}/admin/announcements`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<AnnouncementData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to broadcast announcement: HTTP ${res.status}`);
  }

  return json.data;
};

// ----------------------------------------------------
// 11. Platform Settings (Milestone 3E)
// ----------------------------------------------------
export const fetchAdminSettings = async (token: string): Promise<PlatformSettingsData> => {
  const res = await fetch(`${API_BASE_URL}/admin/settings`, {
    headers: authHeaders(token),
  });

  const json: ApiResponse<PlatformSettingsData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to fetch platform settings: HTTP ${res.status}`);
  }

  return json.data;
};

export const updateAdminSettings = async (
  token: string,
  payload: UpdatePlatformSettingsPayload
): Promise<PlatformSettingsData> => {
  const res = await fetch(`${API_BASE_URL}/admin/settings`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });

  const json: ApiResponse<PlatformSettingsData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to update platform settings: HTTP ${res.status}`);
  }

  return json.data;
};

export const retryAdminAnnouncement = async (
  token: string,
  announcementId: string
): Promise<AnnouncementData> => {
  const res = await fetch(`${API_BASE_URL}/admin/announcements/${announcementId}/retry`, {
    method: 'POST',
    headers: authHeaders(token),
  });

  const json: ApiResponse<AnnouncementData> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.message || `Failed to retry announcement: HTTP ${res.status}`);
  }

  return json.data;
};
