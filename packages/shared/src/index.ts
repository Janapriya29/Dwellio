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
export type ProviderVerificationStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

// Sanitized safe user representation (never exposes passwordHash)
export interface SafeUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProfilePayload {
  name?: string;
  phone?: string;
}

export interface CustomerSavedAddress {
  id: string;
  label: string;
  street: string;
  city: string;
  postalCode?: string;
  isDefault?: boolean;
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

// Provider weekly working day configuration (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
export interface ProviderWorkingDay {
  dayOfWeek: number;
  activeSlotIndices: number[];
}

// Provider blocked dates for holiday / time-off
export interface ProviderBlockedDate {
  date: string; // YYYY-MM-DD
  reason?: string;
}

// Sanitized provider profile data representation
export interface ProviderProfileData {
  id: string;
  userId: string;
  displayName: string;
  phone: string;
  bio?: string;
  experienceYears?: number;
  serviceArea: string;
  businessAddress?: string;
  city?: string;
  skills: string[];
  avatarUrl?: string;
  verificationStatus: ProviderVerificationStatus;
  rejectionReason?: string;
  ratingAverage?: number;
  reviewCount?: number;
  isAcceptingJobs?: boolean;
  workingSchedule?: ProviderWorkingDay[];
  blockedDates?: ProviderBlockedDate[];
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProviderProfilePayload {
  displayName?: string;
  phone?: string;
  bio?: string;
  experienceYears?: number;
  serviceArea?: string;
  businessAddress?: string;
  city?: string;
  skills?: string[];
  avatarUrl?: string;
}

export interface ProviderScheduleData {
  isAcceptingJobs: boolean;
  workingSchedule: ProviderWorkingDay[];
  blockedDates: ProviderBlockedDate[];
}

export interface UpdateProviderSchedulePayload {
  workingSchedule: ProviderWorkingDay[];
  blockedDates?: ProviderBlockedDate[];
}

export interface UpdateAvailabilityStatusPayload {
  isAcceptingJobs: boolean;
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
  | 'REVIEW_MODERATED'
  | 'CUSTOMER_STATUS_CHANGED'
  | 'PROVIDER_STATUS_CHANGED'
  | 'SERVICE_BASE_PRICE_CHANGED'
  | 'BOOKING_ADMIN_CANCELLED'
  | 'BOOKING_PAYMENT_STATUS_CHANGED'
  | 'DISPUTE_CREATED'
  | 'DISPUTE_STATUS_CHANGED'
  | 'DISPUTE_RESOLVED'
  | 'ANNOUNCEMENT_BROADCAST'
  | 'PLATFORM_SETTINGS_UPDATED'
  | 'PAYMENT_ORDER_CREATED'
  | 'PAYMENT_VERIFIED'
  | 'PAYMENT_CAPTURED'
  | 'PAYMENT_FAILED'
  | 'BOOKING_PAYMENT_EXPIRED'
  | 'REFUND_INITIATED'
  | 'REFUND_COMPLETED'
  | 'REFUND_FAILED'
  | 'PROVIDER_LEDGER_CREDITED'
  | 'PROVIDER_LEDGER_ADJUSTED'
  | 'PAYOUT_BATCH_CREATED'
  | 'PAYOUT_APPROVED'
  | 'PAYOUT_SETTLEMENT_RECORDED'
  | 'COUPON_CREATED'
  | 'COUPON_UPDATED'
  | 'COUPON_DEACTIVATED'
  | 'COUPON_REDEEMED'
  | 'DISPUTE_FINANCIAL_ACTION';

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
  basePrice?: number;
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
    phone?: string;
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
  priceSnapshot?: number;
  totalPrice?: number;
  paymentStatus?: 'unpaid' | 'paid' | 'refunded' | 'pending_verification' | 'partially_refunded' | 'failed';
  commissionRateSnapshot?: number;
  commissionAmountSnapshot?: number;
  paymentDueAt?: string;
  paymentCompletedAt?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  appliedCouponCode?: string;
  discountAmount?: number;
  finalPayableAmount?: number;
  refundAmount?: number;
  refundStatus?: 'none' | 'pending' | 'processed' | 'failed' | 'partially_refunded';
  hasDispute?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------------------------------
// Standard Time Slots & Availability Engine Types
// ----------------------------------------------------

export interface StandardTimeSlotDefinition {
  slotIndex: number;
  label: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
}

export const STANDARD_TIME_SLOTS: StandardTimeSlotDefinition[] = [
  { slotIndex: 0, label: '09:00 AM – 11:00 AM', startHour: 9, startMin: 0, endHour: 11, endMin: 0 },
  { slotIndex: 1, label: '11:30 AM – 01:30 PM', startHour: 11, startMin: 30, endHour: 13, endMin: 30 },
  { slotIndex: 2, label: '02:00 PM – 04:00 PM', startHour: 14, startMin: 0, endHour: 16, endMin: 0 },
  { slotIndex: 3, label: '04:30 PM – 06:30 PM', startHour: 16, startMin: 30, endHour: 18, endMin: 30 },
];

export interface ProviderSlotAvailability {
  slotIndex: number;
  label: string;
  startTime: string; // ISO 8601 string
  endTime: string;   // ISO 8601 string
  isAvailable: boolean;
  reason?: string;
}

export interface ProviderAvailabilityData {
  providerId: string;
  date: string; // YYYY-MM-DD
  slots: ProviderSlotAvailability[];
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

export interface RescheduleBookingPayload {
  newStartTime: string;
  newEndTime: string;
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

export interface ProviderReviewsData {
  reviews: ReviewData[];
  pagination: PaginationMeta;
  summary: ProviderRatingSummary;
}

export interface ProviderDashboardStats {
  totalCompletedJobs: number;
  totalBookings: number;
  pendingRequests: number;
  activeJobs: number;
  acceptanceRate: number; // Percentage (0-100)
  completionRate: number; // Percentage (0-100)
  ratingAverage: number;
  reviewCount: number;
  totalRecordedEarnings: number; // In INR ₹
  currentMonthEarnings: number;  // In INR ₹
  todaysJobs: BookingData[];
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
  suspendedUsers?: number;
  financialSummary?: AdminFinancialMetrics;
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
// Phase 3: Admin Experience Types (Milestones 3A - 3E)
// ----------------------------------------------------

// 3A: Financials & Analytics
export interface AdminFinancialMetrics {
  grossMerchandiseValue: number; // GMV in INR ₹ (completed bookings snapshot)
  recordedPaidVolume: number;    // Amount explicitly marked as paid in INR ₹
  estimatedPlatformCommission: number; // Estimated platform take in INR ₹
  estimatedProviderPayout: number;     // Estimated net provider earnings in INR ₹
  recordedRefundedAmount: number;      // Amount explicitly marked as refunded in INR ₹
  currentMonthGmv: number;             // This calendar month completed GMV
  previousMonthGmv: number;            // Previous calendar month completed GMV
  monthOverMonthGrowthPercent: number; // MoM % growth in completed GMV
  platformCommissionPercent?: number; // Active configured platform commission %
}

export interface TopServicePerformance {
  serviceId: string;
  serviceName: string;
  categoryName: string;
  bookingCount: number;
  completedRevenue: number;
}

export interface CategoryPerformanceItem {
  categoryId: string;
  categoryName: string;
  bookingCount: number;
  completedRevenue: number;
}

export interface BookingTrendItem {
  date: string; // YYYY-MM-DD
  completed: number;
  cancelled: number;
  requested: number;
  total: number;
}

export interface AdminAnalyticsData {
  financials: AdminFinancialMetrics;
  topServices: TopServicePerformance[];
  topCategories: CategoryPerformanceItem[];
  categoryPerformance?: CategoryPerformanceItem[];
  bookingTrends: BookingTrendItem[];
}

// 3B: Customer Management
export interface AdminCustomerItem {
  id: string;
  name: string;
  email: string;
  phone?: string;
  isActive: boolean;
  totalBookings: number;
  totalRecordedSpend: number; // In INR ₹
  totalSpent?: number;
  createdAt: string;
}

export interface AdminCustomerDetail {
  id: string;
  name: string;
  email: string;
  phone?: string;
  isActive: boolean;
  totalBookings: number;
  totalRecordedSpend: number; // In INR ₹
  totalSpent?: number;
  statusReason?: string;
  suspensionReason?: string;
  suspendedAt?: string;
  bookingStatusCounts: Record<BookingStatus, number>;
  bookingsByStatus?: Record<BookingStatus, number>;
  recentBookings: BookingData[];
  createdAt: string;
}

export interface UpdateCustomerStatusPayload {
  isActive: boolean;
  reason?: string;
}

// 3C: Provider Governance & Detail
export interface AdminProviderDetail {
  id: string;
  userId: string;
  displayName: string;
  phone: string;
  serviceArea: string;
  skills: string[];
  bio?: string;
  yearsOfExperience?: number;
  profilePictureUrl?: string;
  verificationStatus: ProviderVerificationStatus;
  rejectionReason?: string;
  suspensionReason?: string;
  suspendedAt?: string;
  reviewedAt?: string;
  workingSchedule: ProviderWorkingDay[];
  blockedDates: ProviderBlockedDate[];
  isAcceptingJobs: boolean;
  ratingAverage: number;
  reviewCount: number;
  completedJobCount: number;
  completedJobsCount?: number;
  cancelledJobCount: number;
  totalRecordedEarnings: number; // In INR ₹
  lifetimeEarnings?: number;
  user?: {
    id: string;
    name: string;
    email: string;
    isActive: boolean;
  };
  createdAt: string;
}

export interface UpdateProviderStatusPayload {
  status: 'approved' | 'suspended';
  reason?: string;
}

// 3D: Booking Intervention & Disputes
export interface AdminCancelBookingPayload {
  reason: string;
}

export interface AdminUpdatePaymentStatusPayload {
  paymentStatus: 'unpaid' | 'paid' | 'refunded' | 'pending_verification';
  reason?: string;
}

export type DisputeStatus = 'open' | 'under_review' | 'resolved' | 'rejected' | 'dismissed';

export type DisputeCategory =
  | 'service_quality'
  | 'no_show'
  | 'pricing_dispute'
  | 'damage_or_safety'
  | 'communication'
  | 'other';

export interface DisputeData {
  id: string;
  bookingId: string;
  booking?: BookingData;
  raisedByUserId: string;
  raisedByRole: 'customer' | 'provider';
  initiatorRole?: 'customer' | 'provider';
  raisedAgainstUserId: string;
  raisedAgainstRole: 'customer' | 'provider';
  customerName?: string;
  providerName?: string;
  serviceName?: string;
  category: DisputeCategory;
  reason?: DisputeCategory;
  description: string;
  status: DisputeStatus;
  adminNotes?: string;
  resolutionReason?: string;
  resolvedByAdminId?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDisputePayload {
  bookingId: string;
  category: DisputeCategory;
  description: string;
}

export interface ResolveDisputePayload {
  status: 'under_review' | 'resolved' | 'rejected' | 'dismissed';
  adminNotes?: string;
  resolutionReason?: string;
  financialAction?: 'none' | 'full_refund' | 'partial_refund' | 'payout_hold';
  awardedRefundAmount?: number;
}

// 3E: Announcements & Platform Settings
export type AnnouncementAudience = 'all' | 'customers' | 'providers';
export type AnnouncementDeliveryStatus = 'pending' | 'processing' | 'delivered' | 'partially_failed';

export interface AnnouncementData {
  id: string;
  title: string;
  message: string;
  audience: AnnouncementAudience;
  createdByAdminId: string;
  createdByName?: string;
  recipientCount: number;
  deliveredCount?: number;
  failedCount?: number;
  deliveryStatus?: AnnouncementDeliveryStatus;
  expiresAt?: string;
  createdAt: string;
}

export interface CreateAnnouncementPayload {
  title: string;
  message: string;
  audience: AnnouncementAudience;
  expiresAt?: string;
}

export interface PlatformSettingsData {
  platformCommissionPercent: number; // E.g. 15
  supportEmail: string;
  supportPhone: string;
  emergencyMaintenanceNotice: {
    enabled: boolean;
    message: string;
  };
  updatedAt?: string;
  updatedByAdminEmail?: string;
}

export interface UpdatePlatformSettingsPayload {
  platformCommissionPercent?: number;
  supportEmail?: string;
  supportPhone?: string;
  emergencyMaintenanceNotice?: {
    enabled: boolean;
    message: string;
  };
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
  | 'BOOKING_RESCHEDULED'
  | 'REVIEW_RECEIVED'
  | 'REVIEW_REPLIED'
  | 'APPLICATION_APPROVED'
  | 'APPLICATION_REJECTED'
  | 'SYSTEM_ANNOUNCEMENT'
  | 'DISPUTE_RAISED'
  | 'DISPUTE_RESOLVED'
  | 'BOOKING_ADMIN_CANCELLED'
  | 'ACCOUNT_SUSPENDED'
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_SUCCESS'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_EXPIRED'
  | 'REFUND_INITIATED'
  | 'REFUND_COMPLETED'
  | 'REFUND_FAILED'
  | 'PAYOUT_BATCH_GENERATED'
  | 'PAYOUT_SETTLED';

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

// ----------------------------------------------------
// Phase 4: Financial Engine Types & DTOs
// ----------------------------------------------------

export type PaymentStatus =
  | 'created'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'partially_refunded'
  | 'refunded';

export interface PaymentData {
  id: string;
  bookingId: string;
  customerId: string;
  providerId: string;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  amount: number; // in paise
  amountInRupees: number;
  currency: string;
  status: PaymentStatus;
  method?: string;
  signatureVerified: boolean;
  errorCode?: string;
  errorDescription?: string;
  refundedAmount: number; // in paise
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentOrderPayload {
  bookingId: string;
  couponCode?: string;
}

export interface CreatePaymentOrderResponseData {
  orderId: string;
  amount: number; // in paise
  currency: string;
  keyId: string;
  bookingId: string;
  discountAmount: number; // in paise
  finalPayableAmount: number; // in paise
  businessName: string;
  description: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
}

export interface VerifyPaymentPayload {
  bookingId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export type RefundStatus = 'pending' | 'processed' | 'failed';

export interface RefundData {
  id: string;
  paymentId: string;
  bookingId: string;
  razorpayRefundId?: string;
  amount: number; // in paise
  amountInRupees: number;
  currency: string;
  reason: string;
  status: RefundStatus;
  initiatedByRole: 'customer' | 'provider' | 'admin' | 'system';
  initiatedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminInitiateRefundPayload {
  amount?: number; // optional in rupees; if omitted, full refundable amount
  reason: string;
}

export type LedgerEntryType =
  | 'job_earning_credit'
  | 'platform_commission_deduction'
  | 'refund_reversal_debit'
  | 'dispute_adjustment_debit'
  | 'payout_batch_allocation'
  | 'manual_adjustment';

export interface ProviderLedgerEntryData {
  id: string;
  providerId?: string;
  bookingId?: string;
  paymentId?: string;
  entryType: LedgerEntryType;
  creditAmount?: number; // in paise
  debitAmount?: number; // in paise
  netAmount?: number; // in paise (credit - debit)
  currency?: string;
  resultingBalance?: number; // in paise
  creditAmountRupees?: number;
  debitAmountRupees?: number;
  netAmountRupees?: number;
  resultingBalanceRupees?: number;
  status?: string;
  description: string;
  createdAt: string;
}

export interface ProviderEarningsSummaryData {
  totalGrossEarningsRupees: number;
  totalCommissionDeductedRupees: number;
  totalNetEarningsRupees: number;
  pendingPayoutBalanceRupees?: number;
  settledPayoutAmountRupees?: number;
  completedJobsCount?: number;
  payoutMethod?: 'bank_transfer' | 'upi' | 'none';
  payoutAccountMasked?: {
    accountNumberMasked?: string;
    ifsc?: string;
    beneficiaryName?: string;
    bankName?: string;
    upiIdMasked?: string;
  };
  kycStatus?: 'pending' | 'submitted' | 'verified' | 'rejected';
  availableBalanceRupees?: number;
  settledAmountRupees?: number;
  payoutAccount?: {
    isConfigured: boolean;
    accountType?: 'bank_account' | 'upi';
    accountHolderName?: string;
    bankName?: string;
    maskedAccountNumber?: string;
    ifscCode?: string;
    maskedUpiId?: string;
  };
}

export type PayoutBatchStatus = 'draft' | 'pending_approval' | 'approved' | 'settled' | 'cancelled';

export interface PayoutBatchItem {
  providerId: string;
  providerDisplayName: string;
  providerPhone?: string;
  eligibleAmountRupees: number;
  eligibleAmountPaise: number;
  bookingIds: string[];
  settlementStatus: 'pending' | 'settled' | 'failed';
  settlementReference?: string;
  settledAt?: string;
}

export interface PayoutBatchData {
  id: string;
  batchNumber: string;
  periodStart: string;
  periodEnd: string;
  totalAmountRupees?: number;
  totalAmountPaise?: number;
  totalProvidersCount?: number;
  totalProviders?: number;
  totalGrossRupees?: number;
  totalCommissionRupees?: number;
  totalNetPayoutRupees?: number;
  totalBookings?: number;
  status: PayoutBatchStatus;
  items?: PayoutBatchItem[];
  generatedByAdminId?: string;
  approvedByAdminId?: string;
  settledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateProviderPayoutAccountPayload {
  payoutMethod?: 'bank_transfer' | 'upi';
  accountType?: 'bank_account' | 'upi';
  beneficiaryName?: string;
  accountHolderName?: string;
  accountNumber?: string;
  ifsc?: string;
  ifscCode?: string;
  bankName?: string;
  upiId?: string;
}

export type CouponDiscountType = 'percent' | 'fixed';

export interface CouponData {
  id: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number; // % (e.g. 10) or rupees (e.g. 100)
  minOrderValueRupees: number;
  maxDiscountAmountRupees?: number;
  usageLimit?: number;
  usedCount: number;
  validFrom: string;
  validUntil: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ValidateCouponPayload {
  code: string;
  serviceId?: string;
  bookingAmountRupees: number;
}

export interface ValidateCouponResponseData {
  valid: boolean;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  discountAmountRupees: number;
  finalPayableRupees: number;
  message?: string;
}

export interface CreateCouponPayload {
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderValueRupees: number;
  maxDiscountAmountRupees?: number;
  usageLimit?: number;
  validFrom: string;
  validUntil: string;
  isActive?: boolean;
}

export interface UpdateCouponPayload {
  discountType?: CouponDiscountType;
  discountValue?: number;
  minOrderValueRupees?: number;
  maxDiscountAmountRupees?: number;
  usageLimit?: number;
  validFrom?: string;
  validUntil?: string;
  isActive?: boolean;
}


