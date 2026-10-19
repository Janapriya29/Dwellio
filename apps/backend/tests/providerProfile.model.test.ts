import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';

describe('ProviderProfile Model Validation & Constraints', () => {
  beforeAll(async () => {
    await connectTestDb('dwellio_test_provider');
    await User.syncIndexes();
    await ProviderProfile.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it('should successfully create a valid provider profile linked to a user', async () => {
    const user = await new User({
      name: 'Electrician Dave',
      email: 'dave@electrician.com',
      passwordHash: 'dummy_hash',
      role: 'provider',
    }).save();

    const profile = new ProviderProfile({
      userId: user._id,
      displayName: 'Dave Electrical Works',
      phone: '+91 9876543210',
      serviceArea: 'Downtown & Metro Area',
      skills: ['Wiring', 'Switchboard Repair', 'Fuse Replacement'],
    });

    const saved = await profile.save();
    expect(saved._id).toBeDefined();
    expect(saved.userId.toString()).toBe(user._id.toString());
    expect(saved.displayName).toBe('Dave Electrical Works');
    expect(saved.phone).toBe('+91 9876543210');
    expect(saved.serviceArea).toBe('Downtown & Metro Area');
    expect(saved.skills).toHaveLength(3);
    expect(saved.verificationStatus).toBe('pending'); // Default status
  });

  it('should reject profile creation without required fields', async () => {
    const emptyProfile = new ProviderProfile({});

    let error: any;
    try {
      await emptyProfile.validate();
    } catch (err) {
      error = err;
    }

    expect(error).toBeDefined();
    expect(error.errors.userId).toBeDefined();
    expect(error.errors.displayName).toBeDefined();
    expect(error.errors.phone).toBeDefined();
    expect(error.errors.serviceArea).toBeDefined();
  });

  it('should reject an invalid verification status', async () => {
    const profile = new ProviderProfile({
      userId: new mongoose.Types.ObjectId(),
      displayName: 'Test Provider',
      phone: '9876543210',
      serviceArea: 'City Center',
      verificationStatus: 'unknown_status' as any,
    });

    await expect(profile.validate()).rejects.toThrow();
  });

  it('should enforce 1-to-1 constraint via MongoDB unique index on userId (E11000)', async () => {
    const user = await new User({
      name: 'Single Provider User',
      email: 'provider.unique@example.com',
      passwordHash: 'dummy_hash',
      role: 'provider',
    }).save();

    const profile1 = new ProviderProfile({
      userId: user._id,
      displayName: 'First Profile',
      phone: '+1 555-1234',
      serviceArea: 'North District',
    });
    await profile1.save();

    const profile2 = new ProviderProfile({
      userId: user._id,
      displayName: 'Second Duplicate Profile',
      phone: '+1 555-5678',
      serviceArea: 'South District',
    });

    // 1. Schema-level validation passes because schema alone cannot know user already has a profile
    await expect(profile2.validate()).resolves.toBeUndefined();

    // 2. Database save must be rejected by MongoDB's unique index on userId
    let saveError: any;
    try {
      await profile2.save();
    } catch (err) {
      saveError = err;
    }

    expect(saveError).toBeDefined();
    expect(saveError.code).toBe(11000);
    expect(saveError.keyPattern?.userId).toBe(1);
  });
});
