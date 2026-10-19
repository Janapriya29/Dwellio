import { Request } from 'express';
import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for sensitive authentication endpoints (register, login)
 * Protects against brute-force and credential-stuffing attacks.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 30, // 30 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again after 15 minutes.',
  },
  // Automatically bypass rate limits during automated test runs
  skip: () => process.env.NODE_ENV === 'test',
});

/**
 * Rate limiter for customer booking creation (POST /api/bookings).
 * Keyed by authenticated user ID with client IP fallback.
 * Allows 15 booking requests per 15-minute window per account.
 */
export const bookingCreationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: process.env.BOOKING_RATE_LIMIT_MAX ? parseInt(process.env.BOOKING_RATE_LIMIT_MAX, 10) : 15,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req: Request): string => {
    if (req.user?._id) {
      return `booking_user_${req.user._id.toString()}`;
    }
    return `booking_ip_${req.ip || '127.0.0.1'}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: 'Too many booking requests created from this account. Please try again after 15 minutes.',
    });
  },
});
