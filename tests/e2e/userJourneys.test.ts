import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../apps/backend/src/app';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../apps/backend/tests/setup';
import { User } from '../../apps/backend/src/models/User';
import { Category } from '../../apps/backend/src/models/Category';
import { Service } from '../../apps/backend/src/models/Service';
import { ProviderProfile } from '../../apps/backend/src/models/ProviderProfile';
import { Booking } from '../../apps/backend/src/models/Booking';
import { SlotReservation } from '../../apps/backend/src/models/SlotReservation';
import { Review } from '../../apps/backend/src/models/Review';
import { hashPassword } from '../../apps/backend/src/utils/auth';

/**
 * Full End-to-End User Journey Tests
 *
 * Verifies complete platform journeys across:
 * - Public Landing Page assets & Discovery APIs
 * - Customer Registration, Login & Service Booking
 * - Provider Onboarding, Admin Review/Approval/Rejection
 * - Booking Lifecycle Execution & Verified Reviews
 * - Role-Based Access Guards (Customer, Provider, Admin)
 */
describe('Dwellio Full User Journey Integration Tests', () => {
  const app = createApp();

  let adminUser: any;
  let adminToken: string;
  let seededCategory: any;
  let seededService: any;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_user_journeys');
    await clearTestDb();

    await User.syncIndexes();
    await Category.syncIndexes();
    await Service.syncIndexes();
    await ProviderProfile.syncIndexes();
    await Booking.syncIndexes();
    await SlotReservation.syncIndexes();
    await Review.syncIndexes();

    // 1. Seed Configured Development Administrator
    const adminPasswordHash = await hashPassword('DwellioAdmin2026!');
    adminUser = await new User({
      name: 'Dwellio Administrator',
      email: 'admin@dwellio.local',
      passwordHash: adminPasswordHash,
      role: 'admin',
      isActive: true,
    }).save();

    // 2. Seed Initial Category and Service matching room bath
    seededCategory = await new Category({
      name: 'Plumbing',
      slug: 'plumbing',
      description: 'Pipes, faucets, and tiling repairs',
      rooms: ['bath', 'kitchen'],
      isActive: true,
    }).save();

    seededService = await new Service({
      categoryId: seededCategory._id,
      name: 'Plumbing',
      slug: 'plumbing-general',
      description: 'General pipe, faucet, and drainage solutions',
      isActive: true,
    }).save();

    // Obtain admin token
    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@dwellio.local', password: 'DwellioAdmin2026!' });
    expect(adminLoginRes.status).toBe(200);
    adminToken = adminLoginRes.body.data.token;
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // JOURNEY 1: CUSTOMER REGISTRATION, LOGIN, DISCOVERY & BOOKING
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Journey 1: Customer Registration, Service Discovery & Booking', () => {
    let customerToken: string;
    let customerId: string;
    let approvedProviderProfile: any;
    let approvedProviderId: string;
    let createdBookingId: string;

    it('A. Registers a new customer account via public registration', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Arun Verma',
        email: 'arun.verma@example.com',
        password: 'SecurePassword2026!',
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('customer');
      expect(res.body.data.token).toBeDefined();

      customerId = res.body.data.user.id;
    });

    it('B. Logs in with the newly registered customer credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'arun.verma@example.com',
        password: 'SecurePassword2026!',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('arun.verma@example.com');
      customerToken = res.body.data.token;
    });

    it('C. Discovers active categories and verified providers for the bathroom room', async () => {
      // Seed a verified provider with matching skills
      const proUser = await new User({
        name: 'Ganesh Plumber',
        email: 'ganesh.plumber@example.com',
        passwordHash: await hashPassword('ProPassword2026!'),
        role: 'provider',
        isActive: true,
      }).save();

      approvedProviderProfile = await new ProviderProfile({
        userId: proUser._id,
        displayName: 'Ganesh Master Plumbing',
        phone: '+91 98401 99887',
        serviceArea: 'Central & Metro Zone',
        skills: ['Plumbing', 'Leak repair'],
        verificationStatus: 'approved',
        reviewedAt: new Date(),
      }).save();

      approvedProviderId = approvedProviderProfile._id.toString();

      // Query public catalog categories for room 'bath'
      const catRes = await request(app).get('/api/catalog/categories?room=bath');
      expect(catRes.status).toBe(200);
      expect(catRes.body.success).toBe(true);
      expect(catRes.body.data.some((c: any) => c.slug === 'plumbing')).toBe(true);

      // Query public approved providers for room 'bath'
      const proRes = await request(app).get('/api/catalog/providers?room=bath');
      expect(proRes.status).toBe(200);
      expect(proRes.body.success).toBe(true);
      expect(proRes.body.data.some((p: any) => p.displayName === 'Ganesh Master Plumbing')).toBe(true);
    });

    it('D. Schedules and books an appointment with the verified provider', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 2);
      tomorrow.setHours(10, 0, 0, 0);

      const endTime = new Date(tomorrow);
      endTime.setHours(12, 0, 0, 0);

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          serviceId: seededService._id.toString(),
          providerId: approvedProviderId,
          scheduledStartTime: tomorrow.toISOString(),
          scheduledEndTime: endTime.toISOString(),
          address: {
            street: '18 Lotus Lane, Apt 4C',
            city: 'Chennai',
            postalCode: '600028',
          },
          customerNotes: 'Main line pipe valve dripping under bathroom sink.',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('requested');
      expect(res.body.data.customerId).toBe(customerId);

      createdBookingId = res.body.data.id;
    });

    it('E. Customer views booking history with status tracking', async () => {
      const res = await request(app)
        .get('/api/bookings')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((b: any) => b.id === createdBookingId)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // JOURNEY 2: PROVIDER ONBOARDING, ADMIN APPROVAL & LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Journey 2: Provider Onboarding, Admin Approval & Booking Lifecycle', () => {
    let applicantToken: string;
    let applicantUserId: string;
    let providerProfileId: string;
    let providerToken: string;
    let bookingId: string;
    let reviewId: string;

    it('A. New tradesperson registers account and submits provider application', async () => {
      const regRes = await request(app).post('/api/auth/register').send({
        name: 'Manoj Electrician',
        email: 'manoj.electrical@example.com',
        password: 'ManojPassword2026!',
      });
      expect(regRes.status).toBe(201);
      applicantToken = regRes.body.data.token;
      applicantUserId = regRes.body.data.user.id;

      // Submit provider application
      const applyRes = await request(app)
        .post('/api/providers/apply')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({
          displayName: 'Manoj Power Solutions',
          phone: '+91 98402 77665',
          serviceArea: 'South Metro & Coastal',
          skills: ['Electrician', 'AC service'],
        });

      expect(applyRes.status).toBe(201);
      expect(applyRes.body.success).toBe(true);
      expect(applyRes.body.data.application.verificationStatus).toBe('pending');
      providerProfileId = applyRes.body.data.application.id;
    });

    it('B. Tradesperson checks status: is pending administrator review', async () => {
      const statusRes = await request(app)
        .get('/api/providers/application-status')
        .set('Authorization', `Bearer ${applicantToken}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.application.verificationStatus).toBe('pending');
      expect(statusRes.body.data.application.displayName).toBe('Manoj Power Solutions');
    });

    it('C. Platform administrator reviews and approves the application', async () => {
      // Admin lists pending applications
      const listRes = await request(app)
        .get('/api/admin/providers/applications?status=pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.applications.some((a: any) => a.id === providerProfileId)).toBe(true);

      // Admin approves application
      const approveRes = await request(app)
        .patch(`/api/admin/providers/applications/${providerProfileId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.success).toBe(true);
      expect(approveRes.body.data.application.verificationStatus).toBe('approved');

      // Check user role was updated in DB
      const updatedUser = await User.findById(applicantUserId);
      expect(updatedUser?.role).toBe('provider');
    });

    it('D. Provider logs in and has approved provider role', async () => {
      const loginRes = await request(app).post('/api/auth/login').send({
        email: 'manoj.electrical@example.com',
        password: 'ManojPassword2026!',
      });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.role).toBe('provider');
      providerToken = loginRes.body.data.token;
    });

    it('E. Homeowner books appointment with this approved provider', async () => {
      // Create electrical service
      const elecCat = await new Category({
        name: 'Electrical',
        slug: 'electrical-e2e',
        rooms: ['living'],
        isActive: true,
      }).save();

      const elecService = await new Service({
        categoryId: elecCat._id,
        name: 'Electrician',
        slug: 'electrician-e2e',
        isActive: true,
      }).save();

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 3);
      tomorrow.setHours(14, 0, 0, 0);

      const endTime = new Date(tomorrow);
      endTime.setHours(16, 0, 0, 0);

      // Register a customer to book
      const custRes = await request(app).post('/api/auth/register').send({
        name: 'Meena Customer',
        email: 'meena@example.com',
        password: 'MeenaPassword2026!',
      });

      const bookRes = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${custRes.body.data.token}`)
        .send({
          serviceId: elecService._id.toString(),
          providerId: providerProfileId,
          scheduledStartTime: tomorrow.toISOString(),
          scheduledEndTime: endTime.toISOString(),
          address: { street: '24 Rose Garden', city: 'Metro' },
        });

      expect(bookRes.status).toBe(201);
      bookingId = bookRes.body.data.id;
    });

    it('F. Provider accepts booking, advances to in_progress, and marks completed', async () => {
      // 1. Accept booking
      const acceptRes = await request(app)
        .patch(`/api/provider/bookings/${bookingId}/accept`)
        .set('Authorization', `Bearer ${providerToken}`);

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.data.status).toBe('accepted');

      // 2. Mark on the way
      const onTheWayRes = await request(app)
        .patch(`/api/provider/bookings/${bookingId}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'on_the_way' });

      expect(onTheWayRes.status).toBe(200);
      expect(onTheWayRes.body.data.status).toBe('on_the_way');

      // 3. Mark in_progress
      const progressRes = await request(app)
        .patch(`/api/provider/bookings/${bookingId}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'in_progress' });

      expect(progressRes.status).toBe(200);
      expect(progressRes.body.data.status).toBe('in_progress');

      // 4. Complete service
      const completeRes = await request(app)
        .patch(`/api/provider/bookings/${bookingId}/status`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ status: 'completed' });

      expect(completeRes.status).toBe(200);
      expect(completeRes.body.data.status).toBe('completed');
    });

    it('G. Customer submits verified review and provider replies officially', async () => {
      // Login customer
      const custLogin = await request(app).post('/api/auth/login').send({
        email: 'meena@example.com',
        password: 'MeenaPassword2026!',
      });
      const custToken = custLogin.body.data.token;

      // Submit review
      const revRes = await request(app)
        .post(`/api/bookings/${bookingId}/reviews`)
        .set('Authorization', `Bearer ${custToken}`)
        .send({
          rating: 5,
          comment: 'Excellent, prompt work fixing our tripping breaker!',
        });

      expect(revRes.status).toBe(201);
      expect(revRes.body.success).toBe(true);
      reviewId = revRes.body.data.id;

      // Provider replies to review
      const replyRes = await request(app)
        .patch(`/api/reviews/${reviewId}/reply`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          replyText: 'Thank you Meena! Glad we could restore safe power to your home.',
        });

      expect(replyRes.status).toBe(200);
      expect(replyRes.body.success).toBe(true);
      expect(replyRes.body.data.providerReply).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // JOURNEY 3: PROVIDER APPLICATION REJECTION WITH REASON
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Journey 3: Provider Application Rejection with Administrative Reason', () => {
    let applicantToken: string;
    let appId: string;

    it('A. Submits application and admin rejects with explicit reason', async () => {
      const regRes = await request(app).post('/api/auth/register').send({
        name: 'Incomplete Applicant',
        email: 'incomplete@example.com',
        password: 'Password2026!',
      });
      applicantToken = regRes.body.data.token;

      const applyRes = await request(app)
        .post('/api/providers/apply')
        .set('Authorization', `Bearer ${applicantToken}`)
        .send({
          displayName: 'Incomplete Services',
          phone: '+91 98409 00112',
          serviceArea: 'Out of State',
          skills: ['Gardening'],
        });
      appId = applyRes.body.data.application.id;

      // Admin rejects
      const rejectRes = await request(app)
        .patch(`/api/admin/providers/applications/${appId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Operating area is outside Dwellio currently serviced municipal zones.',
        });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.application.verificationStatus).toBe('rejected');
      expect(rejectRes.body.data.application.rejectionReason).toContain('outside Dwellio');
    });

    it('B. Applicant retrieves status and receives the rejection reason', async () => {
      const statusRes = await request(app)
        .get('/api/providers/application-status')
        .set('Authorization', `Bearer ${applicantToken}`);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.application.verificationStatus).toBe('rejected');
      expect(statusRes.body.data.application.rejectionReason).toContain('outside Dwellio');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // JOURNEY 4: ACCESS CONTROL & PERMISSION GUARDS
  // ─────────────────────────────────────────────────────────────────────────────
  describe('Journey 4: Role-Based Authorization & Unauthorized Protection', () => {
    it('rejects unauthenticated access to protected customer bookings', async () => {
      const res = await request(app).get('/api/bookings');
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated access to protected provider endpoints', async () => {
      const res = await request(app).get('/api/provider/bookings');
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated access to protected admin endpoints', async () => {
      const res = await request(app).get('/api/admin/overview');
      expect(res.status).toBe(401);
    });

    it('strictly forbids a customer from accessing admin oversight endpoints', async () => {
      const custLogin = await request(app).post('/api/auth/login').send({
        email: 'arun.verma@example.com',
        password: 'SecurePassword2026!',
      });
      const custToken = custLogin.body.data.token;

      const adminRes = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${custToken}`);

      expect(adminRes.status).toBe(403);
      expect(adminRes.body.message).toContain('Access denied');
    });
  });
});
