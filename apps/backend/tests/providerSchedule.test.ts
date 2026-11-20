import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Booking } from '../src/models/Booking';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { generateToken } from '../src/utils/auth';

describe('Phase 2 Milestone 2B: Provider Schedule & Dynamic Availability Tests', () => {
  const app = createApp();

  let providerUser: any;
  let providerToken: string;
  let providerProfile: any;

  let customerUser: any;
  let category: any;
  let service: any;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_provider_schedule');
    await User.syncIndexes();
    await ProviderProfile.syncIndexes();
    await Booking.syncIndexes();
    await Category.syncIndexes();
    await Service.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // 1. Setup Provider
    providerUser = await new User({
      name: 'Manoj Electrician',
      email: 'manoj@example.com',
      passwordHash: 'hashed_pw',
      role: 'provider',
      isActive: true,
    }).save();

    providerProfile = await new ProviderProfile({
      userId: providerUser._id,
      displayName: 'Manoj Electricals',
      phone: '+91 98765 33333',
      serviceArea: 'Central Bengaluru',
      skills: ['Electrician', 'Rewiring'],
      verificationStatus: 'approved',
      isAcceptingJobs: true,
      workingSchedule: [
        { dayOfWeek: 1, activeSlotIndices: [0, 1, 2, 3] }, // Mon
        { dayOfWeek: 2, activeSlotIndices: [0, 1] },       // Tue (morning only)
        { dayOfWeek: 3, activeSlotIndices: [0, 1, 2, 3] }, // Wed
        { dayOfWeek: 4, activeSlotIndices: [0, 1, 2, 3] }, // Thu
        { dayOfWeek: 5, activeSlotIndices: [0, 1, 2, 3] }, // Fri
        { dayOfWeek: 6, activeSlotIndices: [2, 3] },       // Sat (afternoon only)
        { dayOfWeek: 0, activeSlotIndices: [] },             // Sun (day off)
      ],
      blockedDates: [
        { date: '2026-12-25', reason: 'Christmas Holiday' },
      ],
    }).save();

    providerToken = generateToken({
      userId: providerUser._id.toString(),
      role: 'provider',
    });

    // 2. Setup Category, Service & Customer for booking conflict verification
    category = await new Category({
      name: 'Electrical & Power',
      slug: 'electrical-power',
      rooms: ['living', 'kitchen'],
      isActive: true,
    }).save();

    service = await new Service({
      categoryId: category._id,
      name: 'Switchboard Repair',
      slug: 'switchboard-repair',
      isActive: true,
    }).save();

    customerUser = await new User({
      name: 'Deepak Customer',
      email: 'deepak@example.com',
      passwordHash: 'hashed_pw',
      role: 'customer',
      isActive: true,
    }).save();
  });

  describe('GET /api/provider/schedule', () => {
    it('returns working schedule, blocked dates, and isAcceptingJobs for approved provider', async () => {
      const res = await request(app)
        .get('/api/provider/schedule')
        .set('Authorization', `Bearer ${providerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isAcceptingJobs).toBe(true);
      expect(res.body.data.workingSchedule).toHaveLength(7);
      expect(res.body.data.blockedDates).toHaveLength(1);
      expect(res.body.data.blockedDates[0].date).toBe('2026-12-25');
      expect(res.body.data.blockedDates[0].reason).toBe('Christmas Holiday');
    });
  });

  describe('PUT /api/provider/schedule', () => {
    it('successfully updates working schedule and blocked dates', async () => {
      const res = await request(app)
        .put('/api/provider/schedule')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          workingSchedule: [
            { dayOfWeek: 1, activeSlotIndices: [1, 2] },
            { dayOfWeek: 2, activeSlotIndices: [0, 1, 2, 3] },
            { dayOfWeek: 3, activeSlotIndices: [] },
            { dayOfWeek: 4, activeSlotIndices: [0] },
            { dayOfWeek: 5, activeSlotIndices: [0, 1, 2, 3] },
            { dayOfWeek: 6, activeSlotIndices: [] },
            { dayOfWeek: 0, activeSlotIndices: [] },
          ],
          blockedDates: [
            { date: '2026-11-30', reason: 'Annual Maintenance' },
            { date: '2026-12-25', reason: 'Christmas' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.workingSchedule).toHaveLength(7);
      expect(res.body.data.blockedDates).toHaveLength(2);

      // Verify in DB
      const updated = await ProviderProfile.findById(providerProfile._id);
      expect(updated?.blockedDates).toHaveLength(2);
      const mon = updated?.workingSchedule?.find((w) => w.dayOfWeek === 1);
      expect(mon?.activeSlotIndices).toEqual([1, 2]);
    });

    it('rejects invalid dayOfWeek (<0 or >6) with 400', async () => {
      const res = await request(app)
        .put('/api/provider/schedule')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          workingSchedule: [{ dayOfWeek: 7, activeSlotIndices: [0, 1] }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/dayOfWeek must be an integer between 0/i);
    });

    it('rejects invalid slotIndex with 400', async () => {
      const res = await request(app)
        .put('/api/provider/schedule')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({
          workingSchedule: [{ dayOfWeek: 1, activeSlotIndices: [0, 9] }],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Invalid slotIndex/i);
    });
  });

  describe('PATCH /api/provider/availability-status', () => {
    it('successfully toggles isAcceptingJobs status', async () => {
      const res = await request(app)
        .patch('/api/provider/availability-status')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ isAcceptingJobs: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isAcceptingJobs).toBe(false);

      const dbCheck = await ProviderProfile.findById(providerProfile._id);
      expect(dbCheck?.isAcceptingJobs).toBe(false);

      // Toggle back to true
      const toggleBack = await request(app)
        .patch('/api/provider/availability-status')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ isAcceptingJobs: true });

      expect(toggleBack.status).toBe(200);
      expect(toggleBack.body.data.isAcceptingJobs).toBe(true);
    });

    it('rejects non-boolean isAcceptingJobs with 400', async () => {
      const res = await request(app)
        .patch('/api/provider/availability-status')
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ isAcceptingJobs: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Availability Engine Integration (getProviderAvailability)', () => {
    it('marks all slots as "Not accepting bookings" when provider paused job intake', async () => {
      providerProfile.isAcceptingJobs = false;
      await providerProfile.save();

      // Query future date (e.g. 2028-05-15, which is a Monday)
      const res = await request(app)
        .get(`/api/catalog/providers/${providerProfile._id}/availability?date=2028-05-15&tzOffset=0`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slots).toHaveLength(4);
      for (const slot of res.body.data.slots) {
        expect(slot.isAvailable).toBe(false);
        expect(slot.reason).toBe('Not accepting bookings');
      }
    });

    it('marks all slots as blocked reason on blocked calendar dates', async () => {
      const res = await request(app)
        .get(`/api/catalog/providers/${providerProfile._id}/availability?date=2026-12-25&tzOffset=0`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.slots).toHaveLength(4);
      for (const slot of res.body.data.slots) {
        expect(slot.isAvailable).toBe(false);
        expect(slot.reason).toBe('Christmas Holiday');
      }
    });

    it('marks slots as "Off duty" on days/slots that provider has marked off', async () => {
      // 2028-05-21 is a Sunday (day 0, which is marked off)
      const res = await request(app)
        .get(`/api/catalog/providers/${providerProfile._id}/availability?date=2028-05-21&tzOffset=0`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      for (const slot of res.body.data.slots) {
        expect(slot.isAvailable).toBe(false);
        expect(slot.reason).toBe('Off duty');
      }
    });

    it('marks selective slot as "Off duty" if slot index is not active on that day', async () => {
      // 2028-05-16 is a Tuesday (activeSlotIndices: [0, 1] morning only, slots 2 and 3 off)
      const res = await request(app)
        .get(`/api/catalog/providers/${providerProfile._id}/availability?date=2028-05-16&tzOffset=0`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const slots = res.body.data.slots;
      expect(slots[0].isAvailable).toBe(true); // 09:00 - 11:00 AM active
      expect(slots[1].isAvailable).toBe(true); // 11:30 - 01:30 PM active
      expect(slots[2].isAvailable).toBe(false); // 02:00 - 04:00 PM off
      expect(slots[2].reason).toBe('Off duty');
      expect(slots[3].isAvailable).toBe(false); // 04:30 - 06:30 PM off
      expect(slots[3].reason).toBe('Off duty');
    });

    it('preserves existing booking conflict protection on working slots', async () => {
      // 2028-05-15 is a Monday (all slots active). Add an accepted booking on slot 0 (09:00 - 11:00 UTC).
      const slot0Start = new Date('2028-05-15T09:00:00.000Z');
      const slot0End = new Date('2028-05-15T11:00:00.000Z');

      await new Booking({
        customerId: customerUser._id,
        providerId: providerProfile._id,
        providerUserId: providerUser._id,
        serviceId: service._id,
        categoryId: category._id,
        scheduledStartTime: slot0Start,
        scheduledEndTime: slot0End,
        address: { street: '123 Test St', city: 'Bengaluru' },
        status: 'accepted',
      }).save();

      const res = await request(app)
        .get(`/api/catalog/providers/${providerProfile._id}/availability?date=2028-05-15&tzOffset=0`);

      expect(res.status).toBe(200);
      const slots = res.body.data.slots;
      expect(slots[0].isAvailable).toBe(false);
      expect(slots[0].reason).toBe('Booked'); // Conflicting booking recognized
      expect(slots[1].isAvailable).toBe(true);  // Other slots remain available
      expect(slots[2].isAvailable).toBe(true);
      expect(slots[3].isAvailable).toBe(true);
    });
  });
});
