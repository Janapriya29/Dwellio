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
}

// User roles in the Dwellio platform
export type UserRole = 'customer' | 'provider' | 'admin';
