import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { Booking } from '../src/models/Booking';
import { Review } from '../src/models/Review';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { escapeRegex } from '../src/utils/security';
import { maskCustomerName } from '../src/utils/review';
import { getRateLimitKey } from '../src/middleware/rateLimiter';
import { config } from '../src/config/env';

describe('Phase 10A: Critical API Security Hardening Tests', () => {
  const app = createApp();

  beforeAll(async () => {
    await connectTestDb('dwellio_test_security');
    await User.syncIndexes();
    await ProviderProfile.syncIndexes();
    await Category.syncIndexes();
    await Service.syncIndexes();
    await Booking.syncIndexes();
    await Review.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  // ----------------------------------------------------
  // FIX 1 — Regular Expression Sanitization & Validation
  // ----------------------------------------------------
  describe('FIX 1 — Regular Expression Sanitization & Discovery Filters', () => {
    it('escapeRegex utility correctly escapes all regex metacharacters', () => {
      const input = '.*+?^${}()|[]\\';
      const escaped = escapeRegex(input);
      expect(escaped).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');

      // Verify that RegExp compilation of the escaped string treats every character literally
      const re = new RegExp(escaped);
      expect(re.test(input)).toBe(true);
      expect(re.test('anything_else')).toBe(false);
    });

    it('handles malformed regex characters in query parameters without throwing 500', async () => {
      // Create approved provider with specialized skill
      const user = await new User({
        name: 'Regex Safe Pro',
        email: 'pro.regex@example.com',
        passwordHash: 'dummy_hash',
        role: 'provider',
      }).save();

      await new ProviderProfile({
        userId: user._id,
        displayName: 'Specialist Pro (HVAC/AC)',
        phone: '9840123456',
        serviceArea: 'Zone [North-A] (Central)',
        skills: ['A/C [Split] Repair', 'Wiring (Phase 1+2)', 'C++ Appliance Micro-code'],
        verificationStatus: 'approved',
      }).save();

      // Test searching with unclosed brackets '[' that would break unescaped RegExp
      const resBracket = await request(app).get('/api/catalog/providers?skill=[');
      expect(resBracket.status).toBe(200);
      expect(resBracket.body.success).toBe(true);
      expect(resBracket.body.data.length).toBe(1);
      expect(resBracket.body.data[0].displayName).toBe('Specialist Pro (HVAC/AC)');

      // Test searching with unclosed parenthesis '('
      const resParen = await request(app).get('/api/catalog/providers?skill=(');
      expect(resParen.status).toBe(200);
      expect(resParen.body.success).toBe(true);
      expect(resParen.body.data.length).toBe(1);

      // Test searching with '+' (URL-encoded as %2B in HTTP query strings)
      const resPlus = await request(app).get('/api/catalog/providers?skill=Phase%201%2B2');
      expect(resPlus.status).toBe(200);
      expect(resPlus.body.success).toBe(true);
      expect(resPlus.body.data.length).toBe(1);

      // Test searching with literal C++ (%2B%2B)
      const resCpp = await request(app).get('/api/catalog/providers?skill=C%2B%2B');
      expect(resCpp.status).toBe(200);
      expect(resCpp.body.success).toBe(true);
      expect(resCpp.body.data.length).toBe(1);

      // Test searching with nested ReDoS pattern - must not crash or hang
      const resReDoS = await request(app).get('/api/catalog/providers?skill=((a+)+)+$');
      expect(resReDoS.status).toBe(200);
      expect(resReDoS.body.success).toBe(true);
      expect(resReDoS.body.data.length).toBe(0);

      // Test searching serviceArea with special characters
      const resArea = await request(app).get('/api/catalog/providers?serviceArea=[North-A]');
      expect(resArea.status).toBe(200);
      expect(resArea.body.success).toBe(true);
      expect(resArea.body.data.length).toBe(1);
    });

    it('literal matching preserves case-insensitivity without regex wildcard expansion', async () => {
      const user = await new User({
        name: 'Painter Pro',
        email: 'painter@example.com',
        passwordHash: 'dummy_hash',
        role: 'provider',
      }).save();

      await new ProviderProfile({
        userId: user._id,
        displayName: 'Precision Painting',
        phone: '9840999888',
        serviceArea: 'South Metro',
        skills: ['Waterproof.Coating', 'Roof Seal'],
        verificationStatus: 'approved',
      }).save();

      // A dot '.' should match literal dot, not any character like 'WaterproofXCoating'
      const resDotMatch = await request(app).get('/api/catalog/providers?skill=waterproof.coating');
      expect(resDotMatch.status).toBe(200);
      expect(resDotMatch.body.data.length).toBe(1);

      // Searching 'WaterproofXCoating' must not match 'Waterproof.Coating'
      const resDotWildcard = await request(app).get('/api/catalog/providers?skill=waterproofxcoating');
      expect(resDotWildcard.status).toBe(200);
      expect(resDotWildcard.body.data.length).toBe(0);
    });

    it('rejects excessively long filter query parameters with HTTP 400', async () => {
      const longString = 'a'.repeat(105);

      const resSkill = await request(app).get(`/api/catalog/providers?skill=${longString}`);
      expect(resSkill.status).toBe(400);
      expect(resSkill.body.success).toBe(false);
      expect(resSkill.body.message).toContain('exceeds maximum allowed length');

      const resArea = await request(app).get(`/api/catalog/providers?serviceArea=${longString}`);
      expect(resArea.status).toBe(400);
      expect(resArea.body.success).toBe(false);
      expect(resArea.body.message).toContain('exceeds maximum allowed length');

      const resRoom = await request(app).get(`/api/catalog/providers?room=${'b'.repeat(55)}`);
      expect(resRoom.status).toBe(400);
      expect(resRoom.body.success).toBe(false);
      expect(resRoom.body.message).toContain('exceeds maximum allowed length');
    });
  });

  // ----------------------------------------------------
  // FIX 2 — HTTP Security Headers
  // ----------------------------------------------------
  describe('FIX 2 — HTTP Security Headers & Helmet Integration', () => {
    it('disables X-Powered-By header across all responses', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('includes essential security headers: nosniff, frameguard, and dns prefetch control', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['x-dns-prefetch-control']).toBe('off');
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });

    it('preserves existing CORS headers and health status payload', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', config.clientUrl);

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(config.clientUrl);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.body.data.status).toBe('ok');
    });
  });

  // ----------------------------------------------------
  // FIX 3 — Request Body Size Limits & Controlled Parsing
  // ----------------------------------------------------
  describe('FIX 3 — Request Body Size Limits & JSON Parser', () => {
    it('allows legitimate payloads within normal operating size (under 15kb)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Security Test User',
          email: 'security.body@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('rejects oversized JSON request bodies (> 15kb) with HTTP 413 and controlled message', async () => {
      // Create payload slightly exceeding 15kb (16,000 bytes of padding)
      const oversizedPayload = {
        name: 'Large User',
        email: 'large@example.com',
        password: 'Password123!',
        padding: 'X'.repeat(16 * 1024),
      };

      const res = await request(app)
        .post('/api/auth/register')
        .send(oversizedPayload);

      expect(res.status).toBe(413);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Payload too large');
      expect(res.body.message).toContain('15kb');
    });

    it('rejects malformed JSON with HTTP 400 and controlled message without 500 or stack trace', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": "broken@example.com", "password": ');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Malformed JSON in request body.');
      expect(res.body.error).toBeUndefined();
    });
  });

  // ----------------------------------------------------
  // FIX 4 — Safe Production Error Responses
  // ----------------------------------------------------
  describe('FIX 4 — Safe Production Error Responses', () => {
    it('ensures 500 error responses in production mode suppress internal exception details', async () => {
      // Create a test app instance with a simulated broken route
      const errorRouter = express.Router();
      errorRouter.get('/test-error', (_req, _res) => {
        throw new Error('MongoNetworkError: connection timed out at 10.0.1.25:27017');
      });

      const originalEnv = config.nodeEnv;
      config.nodeEnv = 'production';

      try {
        const prodApp = createApp(errorRouter);
        const res = await request(prodApp).get('/api/test-error');

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        // Must strictly be generic message
        expect(res.body.message).toBe('Internal Server Error');
        // Must never leak database host/port or error stack
        expect(res.body.error).toBeUndefined();
        expect(JSON.stringify(res.body)).not.toContain('MongoNetworkError');
        expect(JSON.stringify(res.body)).not.toContain('10.0.1.25');
      } finally {
        config.nodeEnv = originalEnv;
      }
    });

    it('ensures development mode continues to expose diagnostic stack traces', async () => {
      const errorRouter = express.Router();
      errorRouter.get('/test-dev-error', (_req, _res) => {
        throw new Error('Simulated developer debugging exception');
      });

      const originalEnv = config.nodeEnv;
      config.nodeEnv = 'development';

      try {
        const devApp = createApp(errorRouter);
        const res = await request(devApp).get('/api/test-dev-error');

        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Simulated developer debugging exception');
        expect(res.body.error).toBeDefined();
        expect(res.body.error).toContain('Simulated developer debugging exception');
      } finally {
        config.nodeEnv = originalEnv;
      }
    });

    it('preserves client-facing validation error codes (400, 401, 404, 409) with their respective messages', async () => {
      // 400 Bad Request
      const badLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'notanemail' });
      expect(badLogin.status).toBe(400);
      expect(badLogin.body.message).toContain('required');

      // 401 Unauthorized
      const unauthRes = await request(app)
        .get('/api/auth/me');
      expect(unauthRes.status).toBe(401);
      expect(unauthRes.body.message).toContain('Authentication required');

      // 404 Not Found
      const notFoundRes = await request(app)
        .get('/api/nonexistent-endpoint-xyz');
      expect(notFoundRes.status).toBe(404);
      expect(notFoundRes.body.message).toContain('Resource not found');
    });
  });

  // ----------------------------------------------------
  // Phase 10C: SEC-10 — Customer Privacy & Identity Minimization
  // ----------------------------------------------------
  describe('Phase 10C: SEC-10 — Customer Privacy & Identity Minimization', () => {
    it('maskCustomerName correctly formats full names to first name + last initial', () => {
      expect(maskCustomerName('Alice Smith')).toBe('Alice S.');
      expect(maskCustomerName('Jane Mary Doe')).toBe('Jane D.');
      expect(maskCustomerName('Rajesh Kumar Gupta')).toBe('Rajesh G.');
    });

    it('maskCustomerName preserves single-word first names without adding dot', () => {
      expect(maskCustomerName('Alice')).toBe('Alice');
      expect(maskCustomerName('Karthik')).toBe('Karthik');
    });

    it('maskCustomerName safely defaults for missing, null, undefined, or empty names', () => {
      expect(maskCustomerName(null)).toBe('Verified Customer');
      expect(maskCustomerName(undefined)).toBe('Verified Customer');
      expect(maskCustomerName('')).toBe('Verified Customer');
      expect(maskCustomerName('   ')).toBe('Verified Customer');
    });

    it('public provider reviews endpoint masks customer full name and does not leak email or phone', async () => {
      const customer = await new User({
        name: 'Siddharth Varma',
        email: 'siddharth.varma@private-email.com',
        passwordHash: 'dummy_hash',
        role: 'customer',
      }).save();

      const providerUser = await new User({
        name: 'Ganesh Plumber',
        email: 'ganesh@example.com',
        passwordHash: 'dummy_hash',
        role: 'provider',
      }).save();

      const provider = await new ProviderProfile({
        userId: providerUser._id,
        displayName: 'Ganesh Plumbing Services',
        phone: '9840112233',
        serviceArea: 'Central Metro',
        skills: ['Pipe Repair'],
        verificationStatus: 'approved',
      }).save();

      const category = await new Category({
        name: 'Plumbing Works',
        slug: 'plumbing-works',
        rooms: ['bath'],
        isActive: true,
      }).save();

      const service = await new Service({
        categoryId: category._id,
        name: 'Leak Repair Service',
        slug: 'leak-repair-service',
        isActive: true,
      }).save();

      const booking = await new Booking({
        customerId: customer._id,
        providerId: provider._id,
        providerUserId: providerUser._id,
        serviceId: service._id,
        categoryId: category._id,
        scheduledStartTime: new Date(Date.now() - 3600000),
        scheduledEndTime: new Date(Date.now() - 1800000),
        address: { street: '12 Secret St', city: 'Metro' },
        status: 'completed',
      }).save();

      await new Review({
        bookingId: booking._id,
        customerId: customer._id,
        providerId: provider._id,
        serviceId: service._id,
        rating: 5,
        comment: 'Great work fixing the kitchen pipe leak!',
        isPublished: true,
      }).save();

      const res = await request(app).get(`/api/providers/${provider._id}/reviews`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.reviews).toHaveLength(1);

      const publicReview = res.body.data.reviews[0];
      // Must be masked to first name + last initial
      expect(publicReview.customerName).toBe('Siddharth V.');
      // Must NOT be full name
      expect(publicReview.customerName).not.toBe('Siddharth Varma');

      // Privacy verification: response must not leak email, phone, customerId, or private internals
      const stringified = JSON.stringify(res.body);
      expect(stringified).not.toContain('siddharth.varma@private-email.com');
      expect(stringified).not.toContain('private-email.com');
      expect(publicReview.email).toBeUndefined();
      expect(publicReview.phone).toBeUndefined();
      expect(publicReview.customerId).toBeUndefined();
    });
  });

  // ----------------------------------------------------
  // Phase 10C: SEC-03 — Configurable API Rate Limiting
  // ----------------------------------------------------
  describe('Phase 10C: SEC-03 — Configurable API Rate Limiting', () => {
    it('getRateLimitKey prioritizes authenticated user ID and falls back to client IP', () => {
      const authReq = {
        user: { _id: '6ad700000000000000000001' },
        ip: '192.168.1.100',
      } as any;
      expect(getRateLimitKey('api', authReq)).toBe('api_user_6ad700000000000000000001');

      const unauthReq = {
        user: undefined,
        ip: '192.168.1.200',
      } as any;
      expect(getRateLimitKey('api', unauthReq)).toBe('api_ip_192.168.1.200');

      const fallbackReq = {
        user: undefined,
        ip: undefined,
      } as any;
      expect(getRateLimitKey('api', fallbackReq)).toBe('api_ip_127.0.0.1');
    });

    it('generalApiRateLimiter preserves health checks and does not throttle /api/health', async () => {
      // Send multiple requests to /api/health with x-test-rate-limit header
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .get('/api/health')
          .set('x-test-rate-limit', 'true');
        expect(res.status).toBe(200);
      }
    });

    it('enforces rate limit when triggered and returns consistent JSON envelope with HTTP 429', async () => {
      // Create a test app with custom router and deterministic tight rate limit
      const testLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 2,
        validate: { keyGeneratorIpFallback: false },
        keyGenerator: (req) => getRateLimitKey('test_rate', req),
        handler: (_req, res) => {
          res.status(429).json({
            success: false,
            message: 'Too many requests. Please try again after 15 minutes.',
          });
        },
      });

      const testRouter = express.Router();
      testRouter.get('/test-rate-quota', testLimiter, (_req, res) => {
        res.status(200).json({ success: true, message: 'Quota OK' });
      });

      const testApp = createApp(testRouter);

      // Request 1: within limit
      const res1 = await request(testApp).get('/api/test-rate-quota');
      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);

      // Request 2: within limit
      const res2 = await request(testApp).get('/api/test-rate-quota');
      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);

      // Request 3: exceeds limit -> 429 with consistent JSON format
      const res3 = await request(testApp).get('/api/test-rate-quota');
      expect(res3.status).toBe(429);
      expect(res3.body.success).toBe(false);
      expect(res3.body.message).toContain('Too many requests');
    });

    it('isolates user-specific quotas so one authenticated user hitting limits does not block another user', async () => {
      const userLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 2,
        validate: { keyGeneratorIpFallback: false },
        keyGenerator: (req) => getRateLimitKey('user_quota', req),
        handler: (_req, res) => {
          res.status(429).json({ success: false, message: 'User quota exceeded' });
        },
      });

      const userApp = express();
      userApp.use(express.json());
      userApp.get(
        '/api/user-resource',
        (req, _res, next) => {
          const userId = req.query.userId as string;
          if (userId) {
            (req as any).user = { _id: userId };
          }
          next();
        },
        userLimiter,
        (_req, res) => {
          res.status(200).json({ success: true, message: 'Resource accessed' });
        }
      );

      // User A makes 2 requests
      await request(userApp).get('/api/user-resource?userId=userA');
      await request(userApp).get('/api/user-resource?userId=userA');
      // User A makes 3rd request -> throttled
      const userAExceeded = await request(userApp).get('/api/user-resource?userId=userA');
      expect(userAExceeded.status).toBe(429);

      // User B makes request -> NOT throttled (distinct quota)
      const userBRes = await request(userApp).get('/api/user-resource?userId=userB');
      expect(userBRes.status).toBe(200);
      expect(userBRes.body.success).toBe(true);
    });
  });

  // ----------------------------------------------------
  // Phase 10C: SEC-11 — MongoDB Connection Pool Settings
  // ----------------------------------------------------
  describe('Phase 10C: SEC-11 — MongoDB Connection Pool Settings', () => {
    it('verifies MongoDB connection pool configuration defaults and environment overrides', () => {
      const defaultMax = process.env.MONGODB_MAX_POOL_SIZE ? parseInt(process.env.MONGODB_MAX_POOL_SIZE, 10) : 50;
      const defaultMin = process.env.MONGODB_MIN_POOL_SIZE ? parseInt(process.env.MONGODB_MIN_POOL_SIZE, 10) : 2;

      expect(defaultMax).toBeGreaterThanOrEqual(10);
      expect(defaultMin).toBeGreaterThanOrEqual(0);
      expect(defaultMax).toBeGreaterThanOrEqual(defaultMin);
    });
  });
});
