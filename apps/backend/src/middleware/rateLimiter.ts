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
