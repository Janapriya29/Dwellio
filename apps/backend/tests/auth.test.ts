import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Router } from 'express';
import jsonwebtoken from 'jsonwebtoken';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { config } from '../src/config/env';
import { generateToken } from '../src/utils/auth';
import { requireAuth, requireRole } from '../src/middleware/auth';

describe('Phase 3: Authentication and Role-Based Authorization Tests', () => {
  const testRouter = Router();

  // Add specific role-protected test routes before app initialization
  testRouter.get('/test/customer-only', requireAuth, requireRole('customer'), (_req, res) => {
    res.status(200).json({ success: true, message: 'Welcome customer' });
  });

  testRouter.get('/test/provider-only', requireAuth, requireRole('provider'), (_req, res) => {
    res.status(200).json({ success: true, message: 'Welcome provider' });
  });

  testRouter.get('/test/admin-only', requireAuth, requireRole('admin'), (_req, res) => {
    res.status(200).json({ success: true, message: 'Welcome admin' });
  });

  const app = createApp(testRouter);

  beforeAll(async () => {
    await connectTestDb('dwellio_test_auth');
    await User.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe('1. Customer Registration (POST /api/auth/register)', () => {
    it('should register a customer successfully and return a safe user and JWT', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Alice Homeowner',
          email: 'alice@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user).toBeDefined();

      const user = res.body.data.user;
      expect(user.id).toBeDefined();
      expect(user.name).toBe('Alice Homeowner');
      expect(user.email).toBe('alice@example.com');
      expect(user.role).toBe('customer');
      expect(user.isActive).toBe(true);

      // CRITICAL: passwordHash must never be exposed
      expect(user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');

      // Verify database persistence: password must be hashed, never plaintext
      const dbUser = await User.findOne({ email: 'alice@example.com' });
      expect(dbUser).not.toBeNull();
      expect(dbUser!.passwordHash).not.toBe('Password123!');
      expect(dbUser!.passwordHash.startsWith('$2')).toBe(true); // bcrypt hash prefix
    });

    it('should strictly reject public attempts to self-assign provider or admin roles', async () => {
      // Attacker attempts to register as admin
      const adminAttempt = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Sneaky Admin Attempt',
          email: 'sneaky.admin@example.com',
          password: 'Password123!',
          role: 'admin',
        });

      expect(adminAttempt.status).toBe(201);
      expect(adminAttempt.body.data.user.role).toBe('customer');

      // Attacker attempts to register as provider
      const providerAttempt = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Sneaky Provider Attempt',
          email: 'sneaky.provider@example.com',
          password: 'Password123!',
          role: 'provider',
        });

      expect(providerAttempt.status).toBe(201);
      expect(providerAttempt.body.data.user.role).toBe('customer');

      // Verify in DB
      const dbUser = await User.findOne({ email: 'sneaky.admin@example.com' });
      expect(dbUser!.role).toBe('customer');
    });

    it('should reject registration with duplicate email address', async () => {
      await request(app).post('/api/auth/register').send({
        name: 'First User',
        email: 'duplicate@example.com',
        password: 'Password123!',
      });

      const duplicateRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Second User',
          email: '  DUPLICATE@example.com  ', // Normalized check
          password: 'Password123!',
        });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.success).toBe(false);
      expect(duplicateRes.body.message).toContain('already exists');
    });

    it('should reject registration with invalid input', async () => {
      // Short name
      const shortName = await request(app).post('/api/auth/register').send({
        name: 'A',
        email: 'valid@example.com',
        password: 'Password123!',
      });
      expect(shortName.status).toBe(400);

      // Invalid email
      const badEmail = await request(app).post('/api/auth/register').send({
        name: 'Valid Name',
        email: 'not-an-email',
        password: 'Password123!',
      });
      expect(badEmail.status).toBe(400);

      // Short password (< 8 chars)
      const shortPw = await request(app).post('/api/auth/register').send({
        name: 'Valid Name',
        email: 'valid@example.com',
        password: 'short',
      });
      expect(shortPw.status).toBe(400);
      expect(shortPw.body.message).toContain('8 characters');
    });
  });

  describe('2. User Login (POST /api/auth/login)', () => {
    beforeEach(async () => {
      await request(app).post('/api/auth/register').send({
        name: 'Login Tester',
        email: 'tester@example.com',
        password: 'Password123!',
      });
    });

    it('should login successfully with valid credentials and return a token', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'tester@example.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('tester@example.com');
      expect(res.body.data.user.role).toBe('customer');

      // Security check: never expose passwordHash
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('should reject incorrect password with a generic message', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'tester@example.com',
        password: 'WrongPassword!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password.');
    });

    it('should reject non-existent email with the same generic message', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password.');
    });

    it('should reject deactivated accounts', async () => {
      await User.updateOne({ email: 'tester@example.com' }, { isActive: false });

      const res = await request(app).post('/api/auth/login').send({
        email: 'tester@example.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('deactivated');
    });
  });

  describe('3. Current User Endpoint (GET /api/auth/me)', () => {
    let customerToken: string;

    beforeEach(async () => {
      const regRes = await request(app).post('/api/auth/register').send({
        name: 'Me User',
        email: 'me@example.com',
        password: 'Password123!',
      });
      customerToken = regRes.body.data.token;
    });

    it('should return safe profile for an authenticated request', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.name).toBe('Me User');
      expect(res.body.data.user.email).toBe('me@example.com');
      expect(res.body.data.user.role).toBe('customer');

      // Security check
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('should reject request when Authorization header is missing', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Authentication required');
    });

    it('should reject request with malformed Authorization header', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'InvalidHeaderFormat token');

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Bearer token');
    });

    it('should reject an invalidly signed or forged token', async () => {
      const forgedToken = jsonwebtoken.sign(
        { userId: '123456789012345678901234', role: 'customer' },
        'wrong_secret_key_used_to_tamper_token'
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Invalid or malformed');
    });

    it('should reject an expired token', async () => {
      const expiredToken = jsonwebtoken.sign(
        { userId: '123456789012345678901234', role: 'customer' },
        config.jwtSecret,
        { expiresIn: -10 } // Expired 10 seconds ago
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('expired');
    });
  });

  describe('4. Role-Based Authorization Middleware (requireRole)', () => {
    let customerToken: string;
    let providerToken: string;
    let adminToken: string;

    beforeEach(async () => {
      // 1. Create customer
      const cust = await new User({
        name: 'Cust User',
        email: 'cust@example.com',
        passwordHash: 'dummy_hash',
        role: 'customer',
      }).save();
      customerToken = generateToken({ userId: cust._id.toString(), role: 'customer' });

      // 2. Create provider
      const prov = await new User({
        name: 'Prov User',
        email: 'prov@example.com',
        passwordHash: 'dummy_hash',
        role: 'provider',
      }).save();
      providerToken = generateToken({ userId: prov._id.toString(), role: 'provider' });

      // 3. Create admin
      const adm = await new User({
        name: 'Admin User',
        email: 'admin@example.com',
        passwordHash: 'dummy_hash',
        role: 'admin',
      }).save();
      adminToken = generateToken({ userId: adm._id.toString(), role: 'admin' });
    });

    it('should allow customer to access customer-only route, but block from provider/admin routes', async () => {
      // Access customer route -> OK
      const custRes = await request(app)
        .get('/api/test/customer-only')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(custRes.status).toBe(200);

      // Access provider route -> 403 Forbidden
      const provRes = await request(app)
        .get('/api/test/provider-only')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(provRes.status).toBe(403);
      expect(provRes.body.message).toContain('Access denied');

      // Access admin route -> 403 Forbidden
      const adminRes = await request(app)
        .get('/api/test/admin-only')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(adminRes.status).toBe(403);
      expect(adminRes.body.message).toContain('Access denied');
    });

    it('should allow provider to access provider route and block customer route', async () => {
      const provRes = await request(app)
        .get('/api/test/provider-only')
        .set('Authorization', `Bearer ${providerToken}`);
      expect(provRes.status).toBe(200);

      const custRes = await request(app)
        .get('/api/test/customer-only')
        .set('Authorization', `Bearer ${providerToken}`);
      expect(custRes.status).toBe(403);
    });

    it('should allow admin to access admin-only route and block unpermitted roles', async () => {
      const adminRes = await request(app)
        .get('/api/test/admin-only')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(200);

      const provRes = await request(app)
        .get('/api/test/provider-only')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(provRes.status).toBe(403);
    });
  });

  describe('5. Customer Profile Update Endpoint (PATCH /api/auth/profile)', () => {
    let customerUser: any;
    let customerToken: string;

    beforeEach(async () => {
      customerUser = await new User({
        name: 'Initial Name',
        email: 'profile.test@example.com',
        passwordHash: 'dummy_hash',
        role: 'customer',
      }).save();
      customerToken = generateToken({ userId: customerUser._id.toString(), role: 'customer' });
    });

    it('should allow authenticated customer to update display name and phone number', async () => {
      const res = await request(app)
        .patch('/api/auth/profile')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Updated Pooja Sharma',
          phone: '+91 9840122334',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.name).toBe('Updated Pooja Sharma');
      expect(res.body.data.user.phone).toBe('+91 9840122334');
      expect(res.body.data.user.email).toBe('profile.test@example.com');
      expect(res.body.data.user.role).toBe('customer');

      // Verify persistence in DB and GET /api/auth/me
      const meRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data.user.name).toBe('Updated Pooja Sharma');
      expect(meRes.body.data.user.phone).toBe('+91 9840122334');
      expect(JSON.stringify(meRes.body)).not.toContain('passwordHash');
    });

    it('should reject unauthenticated profile update with 401', async () => {
      const res = await request(app)
        .patch('/api/auth/profile')
        .send({ name: 'Hacker Name' });

      expect(res.status).toBe(401);
    });

    it('should reject invalid display names with 400', async () => {
      // Too short
      const res1 = await request(app)
        .patch('/api/auth/profile')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ name: 'A' });
      expect(res1.status).toBe(400);
      expect(res1.body.message).toMatch(/between 2 and 100/i);

      // Empty string
      const res2 = await request(app)
        .patch('/api/auth/profile')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ name: '   ' });
      expect(res2.status).toBe(400);
    });

    it('should reject invalid phone format with 400', async () => {
      const res = await request(app)
        .patch('/api/auth/profile')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ phone: 'invalid-phone-abc' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/valid phone number/i);
    });

    it('should strictly ignore attempts to self-escalate role or change email via profile update', async () => {
      const res = await request(app)
        .patch('/api/auth/profile')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Privilege Seeker',
          role: 'admin',
          email: 'hacked@admin.com',
          isActive: false,
          passwordHash: 'hacked_hash',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.user.role).toBe('customer'); // Role remains customer!
      expect(res.body.data.user.email).toBe('profile.test@example.com'); // Email unchanged!

      const dbUser = await User.findById(customerUser._id);
      expect(dbUser?.role).toBe('customer');
      expect(dbUser?.email).toBe('profile.test@example.com');
      expect(dbUser?.passwordHash).toBe('dummy_hash');
    });
  });
});
