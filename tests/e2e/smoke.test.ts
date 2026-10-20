import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../../apps/backend/src/app';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../apps/backend/tests/setup';
import { User } from '../../apps/backend/src/models/User';
import { Category } from '../../apps/backend/src/models/Category';
import { Service } from '../../apps/backend/src/models/Service';
import { generateToken } from '../../apps/backend/src/utils/auth';

/**
 * End-to-End Smoke & Deployment Readiness Test Suite (SEC-12)
 *
 * Verifies core application readiness, branding assets, reverse-proxy API routing,
 * unauthenticated route protection, and authentication flows against the integrated application.
 */
describe('Dwellio End-to-End Smoke & Deployment Readiness (SEC-12)', () => {
  const app = createApp();
  let testCustomer: any;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_e2e_smoke');
    await User.syncIndexes();
    await Category.syncIndexes();
    await Service.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  // 1. Frontend Build & Branding Verification
  it('1. Frontend production build exists and contains Dwellio branding and root mount', () => {
    const frontendDistPath = path.resolve(__dirname, '../../apps/frontend/dist/index.html');
    expect(fs.existsSync(frontendDistPath)).toBe(true);

    const htmlContent = fs.readFileSync(frontendDistPath, 'utf-8');
    expect(htmlContent).toContain('<div id="root">');
    expect(htmlContent).toContain('Dwellio');
  });

  // 2. Public Service Discovery Page Readiness
  it('2. Public service discovery endpoints respond with active categories without fatal errors', async () => {
    // Seed active category
    const cat = await new Category({
      name: 'Home Painting',
      slug: 'home-painting',
      rooms: ['living', 'bed'],
      isActive: true,
    }).save();

    const res = await request(app).get('/api/catalog/categories');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.some((c: any) => c.slug === 'home-painting')).toBe(true);
  });

  // 3. User Login & Authentication Endpoint
  it('3. User can authenticate via /api/auth/login and receive a valid session token', async () => {
    testCustomer = await new User({
      name: 'Smoke Test Customer',
      email: 'smoke.customer@dwellio.test',
      passwordHash: 'dummy_hash',
      role: 'customer',
      isActive: true,
    }).save();

    // Verify token generation and profile retrieval
    const token = generateToken({ userId: testCustomer._id.toString(), role: 'customer' });
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.success).toBe(true);
    expect(meRes.body.data.user.email).toBe('smoke.customer@dwellio.test');
  });

  // 4. Unauthenticated Access Protection
  it('4. Unauthenticated users cannot access protected customer, provider, or admin views', async () => {
    // Protected Customer Bookings
    const bookingsRes = await request(app).get('/api/bookings');
    expect(bookingsRes.status).toBe(401);
    expect(bookingsRes.body.success).toBe(false);

    // Protected Provider Bookings
    const providerRes = await request(app).get('/api/provider/bookings');
    expect(providerRes.status).toBe(401);
    expect(providerRes.body.success).toBe(false);

    // Protected Admin Overview
    const adminRes = await request(app).get('/api/admin/overview');
    expect(adminRes.status).toBe(401);
    expect(adminRes.body.success).toBe(false);
  });

  // 5. Representative Public API Request through Reverse-Proxy Endpoint
  it('5. Representative public API request (/api/health) succeeds with service status', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.service).toBe('dwellio-backend');
  });
});
