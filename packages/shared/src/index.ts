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
  createdAt: string;
  updatedAt: string;
}

// Audit log actions
export type AuditLogAction =
  | 'PROVIDER_APPLICATION_APPROVED'
  | 'PROVIDER_APPLICATION_REJECTED';

// Pagination metadata envelope
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}


