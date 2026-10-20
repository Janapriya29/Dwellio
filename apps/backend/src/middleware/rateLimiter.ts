import { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

/**
 * ARCHITECTURAL NOTE: In-Memory Rate Limiting
 *
 * All rate limiters below use express-rate-limit's default in-memory MemoryStore.
 * In-memory state is local to each Node.js process instance and is NOT shared across
 * multiple load-balanced cluster nodes or multi-instance containers.
 * For horizontally scaled multi-container production topologies, a distributed store
 * (e.g., rate-limit-redis with Redis cluster) should be configured.
 */

/**
 * Helper to generate consistent rate limit keys.
 * Prioritizes authenticated user ID for user-level fair-share quota,
 * falling back safely to client IP for unauthenticated traffic.
 */
export const getRateLimitKey = (prefix: string, req: Request): string => {
  if (req.user?._id) {
    return `${prefix}_user_${req.user._id.toString()}`;
  }
  return `${prefix}_ip_${req.ip || '127.0.0.1'}`;
};

/**
 * Helper to determine whether rate limiting should be skipped during tests.
 * Allows deterministic testing when `x-test-rate-limit` header or `TEST_RATE_LIMITS=true` is present.
 */
const shouldSkipInTest = (req: Request): boolean => {
  if (process.env.TEST_RATE_LIMITS === 'true' || req.headers['x-test-rate-limit'] === 'true') {
    return false;
  }
  return process.env.NODE_ENV === 'test';
};

/**
 * General API Rate Limiter
 * Applied across all `/api` endpoints as baseline DoS protection.
 * Default: 500 requests per 15-minute window per IP / user.
 * Preserves health check endpoints (/api/health*) so monitoring is not throttled.
 */
export const generalApiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.API_RATE_LIMIT_MAX ? parseInt(process.env.API_RATE_LIMIT_MAX, 10) : 500,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  skip: (req: Request) => {
    // Never throttle health check endpoints used by load balancers and orchestrators
    if (req.path.startsWith('/health')) {
      return true;
    }
    return shouldSkipInTest(req);
  },
  keyGenerator: (req: Request) => getRateLimitKey('gen_api', req),
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests to the API. Please try again after 15 minutes.',
    });
  },
});

/**
 * Rate limiter for sensitive authentication endpoints (register, login)
 * Protects against brute-force and credential-stuffing attacks.
 * Default: 30 attempts per 15 minutes window per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.AUTH_RATE_LIMIT_MAX ? parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) : 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  skip: (req: Request) => shouldSkipInTest(req),
  keyGenerator: (req: Request) => getRateLimitKey('auth', req),
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts. Please try again after 15 minutes.',
    });
  },
});

/**
 * Rate limiter for customer booking creation (POST /api/bookings).
 * Keyed by authenticated user ID with client IP fallback.
 * Allows 15 booking requests per 15-minute window per account.
 */
export const bookingCreationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.BOOKING_RATE_LIMIT_MAX ? parseInt(process.env.BOOKING_RATE_LIMIT_MAX, 10) : 15,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req: Request): string => getRateLimitKey('booking', req),
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many booking requests created from this account. Please try again after 15 minutes.',
    });
  },
});

/**
 * Rate limiter for public service catalog and provider discovery queries.
 * Protects search and aggregation queries against scraping and CPU exhaustion.
 * Default: 200 requests per 15-minute window per IP / user.
 */
export const catalogDiscoveryRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.CATALOG_RATE_LIMIT_MAX ? parseInt(process.env.CATALOG_RATE_LIMIT_MAX, 10) : 200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  skip: (req: Request) => shouldSkipInTest(req),
  keyGenerator: (req: Request) => getRateLimitKey('catalog', req),
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many discovery requests. Please slow down and try again later.',
    });
  },
});

/**
 * Rate limiter for in-app notification queries and count polling.
 * Frontend polls unread count every 45s (~20 calls per 15 min per active tab).
 * Generous default (150 requests per 15 min) avoids false positives while capping flood attempts.
 */
export const notificationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NOTIFICATION_RATE_LIMIT_MAX ? parseInt(process.env.NOTIFICATION_RATE_LIMIT_MAX, 10) : 150,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  skip: (req: Request) => shouldSkipInTest(req),
  keyGenerator: (req: Request) => getRateLimitKey('notif', req),
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many notification requests. Please try again later.',
    });
  },
});
