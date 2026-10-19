/**
 * Shared Type Definitions for Dwellio
 * Tagline: Your Home, in Good Hands.
 */

// Basic API Response envelope
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

// Health check status payload
export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  timestamp: string;
  environment: string;
  service: string;
  version: string;
  database?: 'connected' | 'disconnected' | 'connecting' | 'disconnecting';
}

// User roles in the Dwellio platform
export type UserRole = 'customer' | 'provider' | 'admin';

// Provider verification status
export type ProviderVerificationStatus = 'pending' | 'approved' | 'rejected';

// Sanitized safe user representation (never exposes passwordHash)
export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Authentication payload returned on login/registration
export interface AuthResponseData {
  user: SafeUser;
  token: string;
}

// Decoded JWT token payload
export interface AuthTokenPayload {
  userId: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// Sanitized provider profile data representation
export interface ProviderProfileData {
  id: string;
  userId: string;
  displayName: string;
  phone: string;
  serviceArea: string;
  skills: string[];
  verificationStatus: ProviderVerificationStatus;
  rejectionReason?: string;
  ratingAverage?: number;
  reviewCount?: number;
  createdAt: string;
  updatedAt: string;
}

// Audit log actions
export type AuditLogAction =
  | 'PROVIDER_APPLICATION_APPROVED'
  | 'PROVIDER_APPLICATION_REJECTED'
  | 'CATEGORY_CREATED'
  | 'CATEGORY_UPDATED'
  | 'CATEGORY_STATUS_CHANGED'
  | 'SERVICE_CREATED'
  | 'SERVICE_UPDATED'
  | 'SERVICE_STATUS_CHANGED'
  | 'REVIEW_MODERATED';

// Pagination metadata envelope
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Supported house rooms from interactive cutaway
export type HouseRoom = 'roof' | 'bath' | 'living' | 'kitchen' | 'garden';

// Service Category
export interface CategoryData {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  rooms: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Service Offering under a Category
export interface ServiceData {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Public Service Provider DTO for Discovery
export interface PublicProviderData {
  id: string;
  userId: string;
  displayName: string;
  phone: string;
  serviceArea: string;
  skills: string[];
  verificationStatus: ProviderVerificationStatus;
  ratingAverage?: number;
  reviewCount?: number;
  user?: {
    name: string;
    email: string;
  };
  createdAt: string;
}

// ----------------------------------------------------
// Phase 6: Booking System & Service Scheduling Types
// ----------------------------------------------------

export type BookingStatus =
  | 'requested'
  | 'accepted'
  | 'on_the_way'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export type BookingActorRole = 'customer' | 'provider' | 'admin';

export interface BookingStatusHistoryEntry {
  actorId: string;
  actorRole: BookingActorRole;
  fromStatus: BookingStatus;
  toStatus: BookingStatus;
  timestamp: string;
  reason?: string;
}

export interface ServiceAddress {
  street: string;
  city: string;
  postalCode?: string;
  landmark?: string;
}

export interface BookingData {
  id: string;
  customerId: string;
  customer?: {
    id: string;
    name: string;
    email: string;
  };
  providerId: string;
  providerUserId: string;
  provider?: {
    id: string;
    displayName: string;
    phone: string;
    serviceArea: string;
    skills: string[];
  };
  serviceId: string;
  service?: {
    id: string;
    name: string;
    slug: string;
  };
  categoryId: string;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  scheduledStartTime: string;
  scheduledEndTime: string;
  address: ServiceAddress;
  customerNotes?: string;
  status: BookingStatus;
  cancellationReason?: string;
  rejectionReason?: string;
  statusHistory: BookingStatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateBookingPayload {
  serviceId: string;
  providerId: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  address: ServiceAddress;
  customerNotes?: string;
}

export interface CancelBookingPayload {
  reason?: string;
}

export interface RejectBookingPayload {
  reason?: string;
}

export interface UpdateBookingStatusPayload {
  status: 'on_the_way' | 'in_progress' | 'completed' | 'cancelled';
  reason?: string;
}

// ----------------------------------------------------
// Phase 7: Verified Reviews & Provider Reputation Types
// ----------------------------------------------------

export interface ProviderReplyData {
  replyText: string;
  repliedAt: string;
}

export interface ReviewData {
  id: string;
  bookingId: string;
  customerId: string;
  customer?: {
    id: string;
    name: string;
  };
  providerId: string;
  provider?: {
    id: string;
    displayName: string;
  };
  serviceId: string;
  service?: {
    id: string;
    name: string;
    slug: string;
  };
  rating: number; // Integer between 1 and 5
  comment?: string;
  providerReply?: ProviderReplyData;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

// Safe Public Review DTO for public catalog / discovery views (never exposes private customer info)
export interface PublicReviewData {
  id: string;
  bookingId: string;
  customerName: string; // Sanitized display name (e.g. "Pooja S." or "Pooja Sharma")
  serviceName?: string;
  rating: number;
  comment?: string;
  providerReply?: ProviderReplyData;
  createdAt: string;
}

export interface CreateReviewPayload {
  rating: number;
  comment?: string;
}

export interface ReviewReplyPayload {
  replyText: string;
}

export interface ProviderRatingSummary {
  ratingAverage: number;
  reviewCount: number;
  distribution?: Record<number, number>; // Counts per star: { 1: 0, 2: 0, 3: 1, 4: 3, 5: 8 }
}

export interface PaginatedReviewsData {
  reviews: PublicReviewData[];
  pagination: PaginationMeta;
  summary: ProviderRatingSummary;
}

// ----------------------------------------------------
// Phase 8: Admin Dashboard & Platform Management Types
// ----------------------------------------------------

export interface AuditLogData {
  id: string;
  adminId: string;
  adminName?: string;
  adminEmail?: string;
  action: AuditLogAction;
  targetId: string;
  targetType: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export interface AdminOverviewStats {
  totalCustomers: number;
  totalProviders: number;
  pendingApplications: number;
  activeServices: number;
  totalBookings: number;
  bookingsByStatus: Record<BookingStatus, number>;
  totalReviews: number;
}

export interface AdminOverviewData {
  stats: AdminOverviewStats;
  recentActivity: AuditLogData[];
}

export interface AdminBookingItem {
  id: string;
  serviceName: string;
  customerName: string;
  customerEmail?: string;
  providerDisplayName: string;
  providerPhone?: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  status: BookingStatus;
  createdAt: string;
}

export interface ModerateReviewPayload {
  isPublished: boolean;
  moderationReason?: string;
}

export interface AdminReviewItem {
  id: string;
  bookingId: string;
  customerName: string;
  providerDisplayName: string;
  serviceName: string;
  rating: number;
  comment?: string;
  providerReply?: ProviderReplyData;
  isPublished: boolean;
  moderationReason?: string;
  moderatedAt?: string;
  createdAt: string;
}

// ----------------------------------------------------
// Phase 9: Notifications & Communication Types
// ----------------------------------------------------

export type NotificationType =
  | 'BOOKING_REQUESTED'
  | 'BOOKING_ACCEPTED'
  | 'BOOKING_REJECTED'
  | 'BOOKING_ON_THE_WAY'
  | 'BOOKING_IN_PROGRESS'
  | 'BOOKING_COMPLETED'
  | 'BOOKING_CANCELLED'
  | 'REVIEW_RECEIVED'
  | 'REVIEW_REPLIED'
  | 'APPLICATION_APPROVED'
  | 'APPLICATION_REJECTED';

export interface NotificationData {
  id: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  bookingId?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
}

export interface NotificationUnreadCountData {
  unreadCount: number;
}

export interface MarkAllReadResponseData {
  markedCount: number;
}


