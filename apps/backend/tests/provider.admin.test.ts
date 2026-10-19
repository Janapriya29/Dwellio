import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Router } from 'express';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { AuditLog } from '../src/models/AuditLog';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { generateToken } from '../src/utils/auth';
import { requireAuth, requireApprovedProvider } from '../src/middleware/auth';

describe('Phase 4: Provider Verification & Admin Onboarding Tests', () => {
  const testRouter = Router();

  // Test route protected by requireApprovedProvider
  testRouter.get(
    '/test/approved-provider-dashboard',
    requireAuth,
    requireApprovedProvider,
    (_req, res) => {
      res.status(200).json({ success: true, message: 'Welcome verified provider!' });
    }
  );

  const app = createApp(testRouter);

  let customerUser: any;
  let customerToken: string;
  let adminUser: any;
  let adminToken: string;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_provider_admin');
    await User.syncIndexes();
    await ProviderProfile.syncIndexes();
    await AuditLog.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // Setup base Customer user
    customerUser = await new User({
      name: 'Charlie Customer',
      email: 'charlie@example.com',
      passwordHash: 'dummy_hash',
      role: 'customer',
    }).save();
    customerToken = generateToken({ userId: customerUser._id.toString(), role: 'customer' });

    // Setup base Admin user
    adminUser = await new User({
      name: 'Super Admin',
      email: 'admin@dwellio.local',
      passwordHash: 'dummy_hash',
      role: 'admin',
    }).save();
    adminToken = generateToken({ userId: adminUser._id.toString(), role: 'admin' });
  });

  describe('1. Customer Provider Application (POST /api/providers/apply)', () => {
    it('should submit an application with forced pending status and sanitized data', async () => {
      const res = await request(app)
        .post('/api/providers/apply')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          displayName: 'Charlie Repairs',
          phone: '+1 555-987-6543',
          serviceArea: 'Downtown Metro and Suburbs',
          skills: ['Plumbing', 'Pipe Repair'],
          // Attempted malicious inputs:
          verificationStatus: 'approved',
          rejectionReason: 'Trying to sneak in',
          role: 'admin',
          userId: new mongoose.Types.ObjectId().toString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.application).toBeDefined();

      const appData = res.body.data.application;
      expect(appData.displayName).toBe('Charlie Repairs');
      expect(appData.phone).toBe('+1 555-987-6543');
      expect(appData.serviceArea).toBe('Downtown Metro and Suburbs');
      expect(appData.skills).toEqual(['Plumbing', 'Pipe Repair']);
      // Critical: Client input must NOT override verificationStatus or userId
      expect(appData.verificationStatus).toBe('pending');
      expect(appData.userId).toBe(customerUser._id.toString());
      expect(appData.rejectionReason).toBeUndefined();

      // Verify in MongoDB
      const dbProfile = await ProviderProfile.findOne({ userId: customerUser._id });
      expect(dbProfile).not.toBeNull();
      expect(dbProfile!.verificationStatus).toBe('pending');
    });

    it('should reject unauthenticated application requests', async () => {
      const res = await request(app).post('/api/providers/apply').send({
        displayName: 'Ghost Provider',
        phone: '1234567890',
        serviceArea: 'Nowhere',
      });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Authentication required');
    });

    it('should reject application with invalid inputs', async () => {
      // Invalid phone
      const badPhone = await request(app)
        .post('/api/providers/apply')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          displayName: 'Bad Phone Repairs',
          phone: 'abc',
          serviceArea: 'Valid Area',
        });
      expect(badPhone.status).toBe(400);
      expect(badPhone.body.message).toContain('phone number');

      // Short display name
      const shortName = await request(app)
        .post('/api/providers/apply')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          displayName: 'A',
          phone: '1234567890',
          serviceArea: 'Valid Area',
        });
      expect(shortName.status).toBe(400);

      // Short service area
      const shortArea = await request(app)
        .post('/api/providers/apply')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          displayName: 'Valid Name',
          phone: '1234567890',
          serviceArea: 'X',
        });
      expect(shortArea.status).toBe(400);
    });

    it('should prevent duplicate applications while one is already pending', async () => {
      // First application -> 201 Created
      await request(app)
        .post('/api/providers/apply')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          displayName: 'First Attempt',
          phone: '1234567890',
          serviceArea: 'Zone 1',
        });

      // Second application -> 409 Conflict
      const dupRes = await request(app)
        .post('/api/providers/apply')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          displayName: 'Second Duplicate Attempt',
          phone: '1234567890',
          serviceArea: 'Zone 2',
        });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.message).toContain('already have a pending provider application');
    });

    it('should allow correcting and resubmitting an application if previously rejected', async () => {
      // 1. Submit initial application
      const firstRes = await request(app)
        .post('/api/providers/apply')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          displayName: 'Initial Subpar Name',
          phone: '1234567890',
          serviceArea: 'Zone 1',
        });
      const appId = firstRes.body.data.application.id;

      // 2. Admin rejects it
      await request(app)
        .patch(`/api/admin/providers/applications/${appId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Incomplete service area details provided.' });

      // Verify it is rejected
      const statusRes = await request(app)
        .get('/api/providers/application-status')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(statusRes.body.data.application.verificationStatus).toBe('rejected');
      expect(statusRes.body.data.application.rejectionReason).toContain('Incomplete service area');

      // 3. User resubmits with corrected info -> 200 OK
      const resubmitRes = await request(app)
        .post('/api/providers/apply')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          displayName: 'Corrected Quality Repairs',
          phone: '1234567890',
          serviceArea: 'Expanded Zone 1 and Surrounding North District',
          skills: ['Plumbing', 'HVAC'],
        });

      expect(resubmitRes.status).toBe(200);
      expect(resubmitRes.body.success).toBe(true);
      expect(resubmitRes.body.data.application.displayName).toBe('Corrected Quality Repairs');
      expect(resubmitRes.body.data.application.verificationStatus).toBe('pending');
      expect(resubmitRes.body.data.application.rejectionReason).toBeUndefined();
    });
  });

  describe('2. Admin Application Management Endpoints', () => {
    let pendingProfileId: string;

    beforeEach(async () => {
      const appRes = await request(app)
        .post('/api/providers/apply')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          displayName: 'Pending Candidate',
          phone: '9876543210',
          serviceArea: 'Central City',
          skills: ['Electrical Wiring'],
        });
      pendingProfileId = appRes.body.data.application.id;
    });

    it('should deny non-admin users from accessing admin provider endpoints', async () => {
      // Customer tries to list applications -> 403 Forbidden
      const listRes = await request(app)
        .get('/api/admin/providers/applications')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(listRes.status).toBe(403);

      // Customer tries to approve -> 403 Forbidden
      const approveRes = await request(app)
        .patch(`/api/admin/providers/applications/${pendingProfileId}/approve`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(approveRes.status).toBe(403);
    });

    it('should allow admin to list applications with pagination', async () => {
      const res = await request(app)
        .get('/api/admin/providers/applications?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.applications).toHaveLength(1);
      expect(res.body.data.pagination.total).toBe(1);
      expect(res.body.data.applications[0].displayName).toBe('Pending Candidate');
      expect(res.body.data.applications[0].user).toBeDefined();
      expect(res.body.data.applications[0].user.email).toBe('charlie@example.com');

      // Security check: ensure passwordHash is never exposed in admin listings
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('should retrieve single application details for admin', async () => {
      const res = await request(app)
        .get(`/api/admin/providers/applications/${pendingProfileId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.application.displayName).toBe('Pending Candidate');
      expect(res.body.data.application.user.name).toBe('Charlie Customer');
    });

    it('should reject invalid MongoDB ObjectId format', async () => {
      const res = await request(app)
        .get('/api/admin/providers/applications/invalid-id-format')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid application ID');
    });

    it('should approve an application, elevate user role to provider, and create audit log', async () => {
      const res = await request(app)
        .patch(`/api/admin/providers/applications/${pendingProfileId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.application.verificationStatus).toBe('approved');

      // Verify User role elevated to 'provider'
      const updatedUser = await User.findById(customerUser._id);
      expect(updatedUser!.role).toBe('provider');

      // Verify AuditLog record created
      const auditLog = await AuditLog.findOne({ targetId: pendingProfileId });
      expect(auditLog).not.toBeNull();
      expect(auditLog!.action).toBe('PROVIDER_APPLICATION_APPROVED');
      expect(auditLog!.adminId.toString()).toBe(adminUser._id.toString());
      expect((auditLog!.details as any).newStatus).toBe('approved');
    });

    it('should require a rejection reason between 5 and 500 characters when rejecting', async () => {
      // Missing reason
      const noReason = await request(app)
        .patch(`/api/admin/providers/applications/${pendingProfileId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(noReason.status).toBe(400);
      expect(noReason.body.message).toContain('reason');

      // Too short reason (< 5 chars)
      const shortReason = await request(app)
        .patch(`/api/admin/providers/applications/${pendingProfileId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Bad' });
      expect(shortReason.status).toBe(400);
      expect(shortReason.body.message).toContain('5 and 500 characters');

      // Valid rejection
      const validReject = await request(app)
        .patch(`/api/admin/providers/applications/${pendingProfileId}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Skills do not meet current verification standard.' });

      expect(validReject.status).toBe(200);
      expect(validReject.body.data.application.verificationStatus).toBe('rejected');
      expect(validReject.body.data.application.rejectionReason).toBe(
        'Skills do not meet current verification standard.'
      );

      // Verify user role remains customer
      const userAfterReject = await User.findById(customerUser._id);
      expect(userAfterReject!.role).toBe('customer');

      // Verify AuditLog recorded
      const auditLog = await AuditLog.findOne({
        targetId: pendingProfileId,
        action: 'PROVIDER_APPLICATION_REJECTED',
      });
      expect(auditLog).not.toBeNull();
      expect((auditLog!.details as any).reason).toContain('Skills do not meet');
    });
  });

  describe('3. Server-Side Provider Access Guard (requireApprovedProvider)', () => {
    let providerUser: any;
    let providerToken: string;
    let profileId: string;

    beforeEach(async () => {
      // User with 'provider' role in User document
      providerUser = await new User({
        name: 'Provider Candidate',
        email: 'provider.candidate@example.com',
        passwordHash: 'dummy_hash',
        role: 'provider', // User has role provider, but verificationStatus is NOT approved yet
      }).save();
      providerToken = generateToken({
        userId: providerUser._id.toString(),
        role: 'provider',
      });

      const profile = await new ProviderProfile({
        userId: providerUser._id,
        displayName: 'Candidate Works',
        phone: '1234567890',
        serviceArea: 'West Coast',
        verificationStatus: 'pending', // Pending
      }).save();
      profileId = profile._id.toString();
    });

    it('should deny provider access if verificationStatus is pending, even if JWT role is provider', async () => {
      const res = await request(app)
        .get('/api/test/approved-provider-dashboard')
        .set('Authorization', `Bearer ${providerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('pending administrator approval');
    });

    it('should deny provider access if application was rejected', async () => {
      await ProviderProfile.findByIdAndUpdate(profileId, {
        verificationStatus: 'rejected',
        rejectionReason: 'Invalid credentials submitted',
      });

      const res = await request(app)
        .get('/api/test/approved-provider-dashboard')
        .set('Authorization', `Bearer ${providerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('rejected');
      expect(res.body.message).toContain('Invalid credentials submitted');
    });

    it('should allow provider access once verificationStatus is approved in database', async () => {
      await ProviderProfile.findByIdAndUpdate(profileId, {
        verificationStatus: 'approved',
      });

      const res = await request(app)
        .get('/api/test/approved-provider-dashboard')
        .set('Authorization', `Bearer ${providerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Welcome verified provider!');
    });
  });
});
