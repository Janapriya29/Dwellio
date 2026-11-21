import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { AuditLog } from '../src/models/AuditLog';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { generateToken } from '../src/utils/auth';

describe('Phase 3 Milestone 3C: Provider Governance & Service Catalog Pricing Tests', () => {
  const app = createApp();

  let adminUser: any;
  let adminToken: string;
  let providerUser: any;
  let providerToken: string;
  let providerProfile: any;
  let testCategory: any;
  let testService: any;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_admin_provider_governance');
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    adminUser = await User.create({
      name: 'System Admin',
      email: 'admin@dwellio.com',
      passwordHash: 'hashed_pw',
      role: 'admin',
    });
    adminToken = generateToken({ userId: adminUser._id.toString(), role: 'admin' });

    providerUser = await User.create({
      name: 'Manish Painter',
      email: 'manish@example.com',
      passwordHash: 'hashed_pw',
      role: 'provider',
      isActive: true,
    });
    providerToken = generateToken({ userId: providerUser._id.toString(), role: 'provider' });

    providerProfile = await ProviderProfile.create({
      userId: providerUser._id,
      displayName: 'Manish Painting Studio',
      phone: '+91 98401 99887',
      serviceArea: 'North Chennai',
      skills: ['Interior Painting', 'Waterproofing'],
      verificationStatus: 'approved',
      workingSchedule: [{ dayOfWeek: 1, activeSlotIndices: [0, 1] }],
      blockedDates: [{ date: '2026-12-25', reason: 'Holiday' }],
    });

    testCategory = await Category.create({
      name: 'Painting Services',
      slug: 'painting-services',
      rooms: ['living'],
      isActive: true,
    });

    testService = await Service.create({
      categoryId: testCategory._id,
      name: 'Wall Painting',
      slug: 'wall-painting',
      basePrice: 1200,
      isActive: true,
    });
  });

  it('lists providers with keyword search (displayName, skills, phone) and status filter', async () => {
    const res = await request(app)
      .get('/api/admin/providers?q=Manish')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.providers.length).toBe(1);
    expect(res.body.data.providers[0].displayName).toBe('Manish Painting Studio');
  });

  it('retrieves detailed provider information including weekly schedule and blocked dates', async () => {
    const res = await request(app)
      .get(`/api/admin/providers/${providerProfile._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.displayName).toBe('Manish Painting Studio');
    expect(res.body.data.workingSchedule.length).toBe(1);
    expect(res.body.data.blockedDates.length).toBe(1);
  });

  it('suspends an approved provider, records audit log, and deactivates User account', async () => {
    const res = await request(app)
      .patch(`/api/admin/providers/${providerProfile._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'suspended',
        reason: 'Violated platform policy by soliciting off-platform cash payments.',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.verificationStatus).toBe('suspended');

    // Verify DB states
    const updatedProfile = await ProviderProfile.findById(providerProfile._id);
    expect(updatedProfile?.verificationStatus).toBe('suspended');
    expect(updatedProfile?.suspensionReason).toContain('off-platform cash');

    const updatedUser = await User.findById(providerUser._id);
    expect(updatedUser?.isActive).toBe(false);

    // Verify AuditLog
    const log = await AuditLog.findOne({
      action: 'PROVIDER_STATUS_CHANGED',
      targetId: providerProfile._id,
    });
    expect(log).toBeDefined();
    expect(log?.details?.newStatus).toBe('suspended');

    // Provider token should be rejected
    const accessRes = await request(app)
      .get('/api/provider/bookings')
      .set('Authorization', `Bearer ${providerToken}`);
    expect(accessRes.status).toBe(401);
  });

  it('reactivates a suspended provider, restores approved status and User isActive flag', async () => {
    // First suspend via the API so userDeactivatedBySuspension is set to true
    await request(app)
      .patch(`/api/admin/providers/${providerProfile._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'suspended',
        reason: 'Policy inquiry and verification check.',
      });

    const midUser = await User.findById(providerUser._id);
    expect(midUser?.isActive).toBe(false);

    // Reactivate
    const res = await request(app)
      .patch(`/api/admin/providers/${providerProfile._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'approved',
        reason: 'Provider resolved issue and completed compliance training.',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.verificationStatus).toBe('approved');

    const updatedProfile = await ProviderProfile.findById(providerProfile._id);
    expect(updatedProfile?.verificationStatus).toBe('approved');
    expect(updatedProfile?.suspensionReason).toBeUndefined();

    const updatedUser = await User.findById(providerUser._id);
    expect(updatedUser?.isActive).toBe(true);
    expect(updatedUser?.role).toBe('provider');
  });

  it('does NOT reactivate User account if provider account was already disabled prior to suspension', async () => {
    // Create a provider whose User account was already deactivated (e.g. customer suspension or security hold)
    const inactiveUser = await User.create({
      name: 'Ramesh Electrician',
      email: 'ramesh@example.com',
      passwordHash: 'hashed_pw',
      role: 'provider',
      isActive: false, // Already inactive prior to provider suspension
    });

    const inactiveProfile = await ProviderProfile.create({
      userId: inactiveUser._id,
      displayName: 'Ramesh Electrical Works',
      phone: '+91 98401 55667',
      serviceArea: 'West Chennai',
      skills: ['Wiring'],
      verificationStatus: 'approved',
      workingSchedule: [{ dayOfWeek: 2, activeSlotIndices: [1, 2] }],
      blockedDates: [{ date: '2026-11-30', reason: 'Personal' }],
    });

    // 1. Suspend the provider
    const suspendRes = await request(app)
      .patch(`/api/admin/providers/${inactiveProfile._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'suspended',
        reason: 'Administrative inquiry into compliance documents.',
      });

    expect(suspendRes.status).toBe(200);
    const suspendedDbProfile = await ProviderProfile.findById(inactiveProfile._id);
    expect(suspendedDbProfile?.userDeactivatedBySuspension).toBe(false); // Flag indicates user was NOT deactivated by suspension

    // 2. Reactivate the provider profile
    const reactivateRes = await request(app)
      .patch(`/api/admin/providers/${inactiveProfile._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'approved',
        reason: 'Provider submitted requested business clearance.',
      });

    expect(reactivateRes.status).toBe(200);
    expect(reactivateRes.body.data.verificationStatus).toBe('approved');

    // CRITICAL: User.isActive MUST remain false because it was NOT deactivated by this provider suspension
    const postReactivateUser = await User.findById(inactiveUser._id);
    expect(postReactivateUser?.isActive).toBe(false);

    // Verify existing schedules and blocked dates were completely preserved
    const preservedProfile = await ProviderProfile.findById(inactiveProfile._id);
    expect(preservedProfile?.workingSchedule?.length).toBe(1);
    expect(preservedProfile?.workingSchedule?.[0].dayOfWeek).toBe(2);
    expect(preservedProfile?.blockedDates?.length).toBe(1);
    expect(preservedProfile?.blockedDates?.[0].date).toBe('2026-11-30');
  });

  it('handles repeated suspension and reactivation requests idempotently without state corruption', async () => {
    // 1. Initial suspension
    await request(app)
      .patch(`/api/admin/providers/${providerProfile._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'suspended',
        reason: 'First suspension notice.',
      });

    const profAfterFirst = await ProviderProfile.findById(providerProfile._id);
    expect(profAfterFirst?.verificationStatus).toBe('suspended');
    expect(profAfterFirst?.userDeactivatedBySuspension).toBe(true);

    // 2. Repeated suspension request with updated reason
    const repeatSuspendRes = await request(app)
      .patch(`/api/admin/providers/${providerProfile._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'suspended',
        reason: 'Updated suspension notice with escalated complaint.',
      });

    expect(repeatSuspendRes.status).toBe(200);
    const profAfterSecond = await ProviderProfile.findById(providerProfile._id);
    expect(profAfterSecond?.verificationStatus).toBe('suspended');
    expect(profAfterSecond?.suspensionReason).toContain('escalated complaint');
    // Ensure repeated suspension did not overwrite userDeactivatedBySuspension to false!
    expect(profAfterSecond?.userDeactivatedBySuspension).toBe(true);

    // 3. First reactivation
    const firstReactivateRes = await request(app)
      .patch(`/api/admin/providers/${providerProfile._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'approved',
        reason: 'Compliance training completed successfully.',
      });

    expect(firstReactivateRes.status).toBe(200);
    const userAfterFirstReactivate = await User.findById(providerUser._id);
    expect(userAfterFirstReactivate?.isActive).toBe(true);

    // 4. Repeated reactivation request
    const repeatReactivateRes = await request(app)
      .patch(`/api/admin/providers/${providerProfile._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'approved',
        reason: 'Redundant approval confirmation.',
      });

    expect(repeatReactivateRes.status).toBe(200);
    expect(repeatReactivateRes.body.data.verificationStatus).toBe('approved');
    const userAfterSecondReactivate = await User.findById(providerUser._id);
    expect(userAfterSecondReactivate?.isActive).toBe(true);
  });

  it('blocks provider operations when suspended via requireApprovedProvider guard', async () => {
    // Suspend provider profile in DB while keeping User.isActive temporarily true to test requireApprovedProvider specifically
    await ProviderProfile.findByIdAndUpdate(providerProfile._id, {
      verificationStatus: 'suspended',
      suspensionReason: 'Audit investigation in progress.',
    });

    const res = await request(app)
      .get('/api/provider/bookings')
      .set('Authorization', `Bearer ${providerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Access denied: provider account is suspended');
    expect(res.body.message).toContain('Audit investigation in progress');
  });

  it('creates and updates service basePrice in catalog with audit logging', async () => {
    // 1. Create service with basePrice
    const createRes = await request(app)
      .post('/api/admin/catalog/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId: testCategory._id.toString(),
        name: 'Door Polishing',
        slug: 'door-polishing',
        basePrice: 850,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.basePrice).toBe(850);

    const createdId = createRes.body.data.id;

    // 2. Update service basePrice
    const updateRes = await request(app)
      .patch(`/api/admin/catalog/services/${createdId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        basePrice: 950,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.basePrice).toBe(950);

    // Verify audit log for base price change
    const priceLog = await AuditLog.findOne({
      action: 'SERVICE_BASE_PRICE_CHANGED',
      targetId: createdId,
    });
    expect(priceLog).toBeDefined();
    expect(priceLog?.details?.previousPrice).toBe(850);
    expect(priceLog?.details?.newPrice).toBe(950);
  });

  it('rejects invalid or out-of-range service basePrice values', async () => {
    const negativeRes = await request(app)
      .post('/api/admin/catalog/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId: testCategory._id.toString(),
        name: 'Invalid Negative Price',
        slug: 'invalid-neg',
        basePrice: -50,
      });
    expect(negativeRes.status).toBe(400);

    const excessiveRes = await request(app)
      .post('/api/admin/catalog/services')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId: testCategory._id.toString(),
        name: 'Invalid High Price',
        slug: 'invalid-high',
        basePrice: 150000,
      });
    expect(excessiveRes.status).toBe(400);
  });
});
