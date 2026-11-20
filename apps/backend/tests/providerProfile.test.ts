import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { generateToken } from '../src/utils/auth';

describe('Phase 2 Milestone 2A: Provider Profile Management Tests', () => {
  const app = createApp();

  let approvedProviderUser: any;
  let approvedProviderToken: string;
  let approvedProviderProfile: any;

  let otherProviderUser: any;
  let otherProviderToken: string;
  let otherProviderProfile: any;

  let customerUser: any;
  let customerToken: string;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_provider_profile');
    await User.syncIndexes();
    await ProviderProfile.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // 1. Setup Approved Provider A
    approvedProviderUser = await new User({
      name: 'Ramesh Roofer',
      email: 'ramesh.roofer@example.com',
      passwordHash: 'hashed_pw',
      role: 'provider',
      isActive: true,
    }).save();

    approvedProviderProfile = await new ProviderProfile({
      userId: approvedProviderUser._id,
      displayName: 'Ramesh Roofing Solutions',
      phone: '+91 98765 11111',
      serviceArea: 'East Bengaluru',
      skills: ['Roof repair', 'Waterproofing'],
      verificationStatus: 'approved',
      ratingAverage: 4.8,
      reviewCount: 15,
    }).save();

    approvedProviderToken = generateToken({
      userId: approvedProviderUser._id.toString(),
      role: 'provider',
    });

    // 2. Setup Approved Provider B
    otherProviderUser = await new User({
      name: 'Pawan Plumber',
      email: 'pawan.plumber@example.com',
      passwordHash: 'hashed_pw',
      role: 'provider',
      isActive: true,
    }).save();

    otherProviderProfile = await new ProviderProfile({
      userId: otherProviderUser._id,
      displayName: 'Pawan Plumbing Pro',
      phone: '+91 98765 22222',
      serviceArea: 'South Bengaluru',
      skills: ['Plumbing', 'Drain cleaning'],
      verificationStatus: 'approved',
      ratingAverage: 4.5,
      reviewCount: 8,
    }).save();

    otherProviderToken = generateToken({
      userId: otherProviderUser._id.toString(),
      role: 'provider',
    });

    // 3. Setup Customer User
    customerUser = await new User({
      name: 'Anita Homeowner',
      email: 'anita@example.com',
      passwordHash: 'hashed_pw',
      role: 'customer',
      isActive: true,
    }).save();

    customerToken = generateToken({
      userId: customerUser._id.toString(),
      role: 'customer',
    });
  });

  describe('GET /api/provider/profile', () => {
    it('successfully retrieves current provider profile for authenticated approved provider', async () => {
      const res = await request(app)
        .get('/api/provider/profile')
        .set('Authorization', `Bearer ${approvedProviderToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(approvedProviderProfile._id.toString());
      expect(res.body.data.displayName).toBe('Ramesh Roofing Solutions');
      expect(res.body.data.phone).toBe('+91 98765 11111');
      expect(res.body.data.serviceArea).toBe('East Bengaluru');
      expect(res.body.data.skills).toEqual(['Roof repair', 'Waterproofing']);
      expect(res.body.data.ratingAverage).toBe(4.8);
      expect(res.body.data.reviewCount).toBe(15);
      expect(res.body.data.isAcceptingJobs).toBe(true);
    });

    it('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/provider/profile');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects customer request with 403', async () => {
      const res = await request(app)
        .get('/api/provider/profile')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/provider/profile', () => {
    it('successfully updates valid profile information', async () => {
      const res = await request(app)
        .patch('/api/provider/profile')
        .set('Authorization', `Bearer ${approvedProviderToken}`)
        .send({
          displayName: 'Ramesh Advanced Roofing',
          phone: '+91 98765 99999',
          bio: '15+ years of specialized residential waterproofing and structural roofing maintenance.',
          experienceYears: 15,
          serviceArea: 'Central & East Bengaluru',
          businessAddress: '42 Industrial Layout, Whitefield',
          city: 'Bengaluru',
          skills: ['Roof repair', 'Waterproofing', 'Gutter cleaning', 'Tiling'],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.displayName).toBe('Ramesh Advanced Roofing');
      expect(res.body.data.phone).toBe('+91 98765 99999');
      expect(res.body.data.bio).toContain('15+ years');
      expect(res.body.data.experienceYears).toBe(15);
      expect(res.body.data.serviceArea).toBe('Central & East Bengaluru');
      expect(res.body.data.businessAddress).toBe('42 Industrial Layout, Whitefield');
      expect(res.body.data.city).toBe('Bengaluru');
      expect(res.body.data.skills).toHaveLength(4);

      // Verify persisted in MongoDB
      const updated = await ProviderProfile.findById(approvedProviderProfile._id);
      expect(updated?.displayName).toBe('Ramesh Advanced Roofing');
      expect(updated?.experienceYears).toBe(15);
      expect(updated?.bio).toContain('15+ years');
    });

    it('strictly isolates data: Provider A cannot modify Provider B profile', async () => {
      await request(app)
        .patch('/api/provider/profile')
        .set('Authorization', `Bearer ${approvedProviderToken}`)
        .send({ displayName: 'Provider A Modified Name' });

      // Provider B profile must remain completely unchanged
      const bProfile = await ProviderProfile.findById(otherProviderProfile._id);
      expect(bProfile?.displayName).toBe('Pawan Plumbing Pro');
    });

    it('rejects invalid phone number with 400', async () => {
      const res = await request(app)
        .patch('/api/provider/profile')
        .set('Authorization', `Bearer ${approvedProviderToken}`)
        .send({ phone: '123' }); // Too short

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/valid contact phone number/i);
    });

    it('rejects invalid experience values (<0, >60, or non-integer) with 400', async () => {
      const negativeRes = await request(app)
        .patch('/api/provider/profile')
        .set('Authorization', `Bearer ${approvedProviderToken}`)
        .send({ experienceYears: -5 });
      expect(negativeRes.status).toBe(400);

      const excessiveRes = await request(app)
        .patch('/api/provider/profile')
        .set('Authorization', `Bearer ${approvedProviderToken}`)
        .send({ experienceYears: 75 });
      expect(excessiveRes.status).toBe(400);

      const decimalRes = await request(app)
        .patch('/api/provider/profile')
        .set('Authorization', `Bearer ${approvedProviderToken}`)
        .send({ experienceYears: 4.5 });
      expect(decimalRes.status).toBe(400);
    });

    it('rejects biography exceeding 1,000 characters with 400', async () => {
      const longBio = 'A'.repeat(1005);
      const res = await request(app)
        .patch('/api/provider/profile')
        .set('Authorization', `Bearer ${approvedProviderToken}`)
        .send({ bio: longBio });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/cannot exceed 1,000 characters/i);
    });

    it('strictly rejects attempts to alter verificationStatus or administrative fields with 400', async () => {
      const res = await request(app)
        .patch('/api/provider/profile')
        .set('Authorization', `Bearer ${approvedProviderToken}`)
        .send({
          verificationStatus: 'pending',
          ratingAverage: 5.0,
          reviewCount: 999,
          role: 'admin',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/cannot be modified through the provider profile endpoint/i);

      // Verify DB was not tampered with
      const unchanged = await ProviderProfile.findById(approvedProviderProfile._id);
      expect(unchanged?.verificationStatus).toBe('approved');
      expect(unchanged?.ratingAverage).toBe(4.8);
      expect(unchanged?.reviewCount).toBe(15);
    });
  });
});
