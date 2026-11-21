import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { Booking } from '../src/models/Booking';
import { SlotReservation } from '../src/models/SlotReservation';
import { Dispute } from '../src/models/Dispute';
import { AuditLog } from '../src/models/AuditLog';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { generateToken } from '../src/utils/auth';

describe('Phase 3 Milestone 3D: Booking Intervention & Dispute Management Tests', () => {
  const app = createApp();

  let adminUser: any;
  let adminToken: string;
  let customerUser: any;
  let customerToken: string;
  let providerUser: any;
  let providerToken: string;
  let otherCustomerUser: any;
  let otherCustomerToken: string;
  let providerProfile: any;
  let testCategory: any;
  let testService: any;
  let testBooking: any;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_admin_intervention_dispute');
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

    customerUser = await User.create({
      name: 'Deepak Homeowner',
      email: 'deepak@example.com',
      passwordHash: 'hashed_pw',
      role: 'customer',
    });
    customerToken = generateToken({ userId: customerUser._id.toString(), role: 'customer' });

    otherCustomerUser = await User.create({
      name: 'Sneha Homeowner',
      email: 'sneha@example.com',
      passwordHash: 'hashed_pw',
      role: 'customer',
    });
    otherCustomerToken = generateToken({ userId: otherCustomerUser._id.toString(), role: 'customer' });

    providerUser = await User.create({
      name: 'Vijay Carpenter',
      email: 'vijay@example.com',
      passwordHash: 'hashed_pw',
      role: 'provider',
    });
    providerToken = generateToken({ userId: providerUser._id.toString(), role: 'provider' });

    providerProfile = await ProviderProfile.create({
      userId: providerUser._id,
      displayName: 'Vijay Woodcrafts',
      phone: '+91 98401 33445',
      serviceArea: 'Central Chennai',
      skills: ['Carpentry'],
      verificationStatus: 'approved',
    });

    testCategory = await Category.create({
      name: 'Carpentry',
      slug: 'carpentry',
      rooms: ['living'],
      isActive: true,
    });

    testService = await Service.create({
      categoryId: testCategory._id,
      name: 'Furniture Repair',
      slug: 'furniture-repair',
      basePrice: 800,
      isActive: true,
    });

    testBooking = await Booking.create({
      customerId: customerUser._id,
      providerId: providerProfile._id,
      providerUserId: providerUser._id,
      serviceId: testService._id,
      categoryId: testCategory._id,
      scheduledStartTime: new Date(Date.now() + 86400000),
      scheduledEndTime: new Date(Date.now() + 90000000),
      address: { street: '22 Lake View', city: 'Chennai' },
      status: 'accepted',
      priceSnapshot: 800,
      paymentStatus: 'unpaid',
      statusHistory: [
        {
          actorId: customerUser._id,
          actorRole: 'customer',
          fromStatus: 'requested',
          toStatus: 'requested',
          timestamp: new Date(),
        },
        {
          actorId: providerUser._id,
          actorRole: 'provider',
          fromStatus: 'requested',
          toStatus: 'accepted',
          timestamp: new Date(),
        },
      ],
    });

    // Create slot reservation for accepted booking
    await SlotReservation.create({
      providerId: providerProfile._id,
      bookingId: testBooking._id,
      slotTime: testBooking.scheduledStartTime,
    });
  });

  it('allows admin to cancel a booking, releases slot reservation, and appends statusHistory', async () => {
    const res = await request(app)
      .patch(`/api/admin/bookings/${testBooking._id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Provider reported emergency hospital admission and requested intervention.',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('cancelled');

    // Verify DB booking
    const updated = await Booking.findById(testBooking._id);
    expect(updated?.status).toBe('cancelled');
    expect(updated?.cancellationReason).toContain('emergency hospital');

    const historyLast = updated?.statusHistory[updated.statusHistory.length - 1];
    expect(historyLast?.actorRole).toBe('admin');
    expect(historyLast?.toStatus).toBe('cancelled');

    // Slot reservation must be released
    const remainingSlots = await SlotReservation.find({ bookingId: testBooking._id });
    expect(remainingSlots.length).toBe(0);

    // Audit log must exist
    const log = await AuditLog.findOne({
      action: 'BOOKING_ADMIN_CANCELLED',
      targetId: testBooking._id,
    });
    expect(log).toBeDefined();
  });

  it('rejects admin cancellation on already completed bookings', async () => {
    await Booking.findByIdAndUpdate(testBooking._id, { status: 'completed' });

    const res = await request(app)
      .patch(`/api/admin/bookings/${testBooking._id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Attempted cancellation after completion.',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Completed bookings cannot be cancelled');
  });

  it('allows admin to update payment status with reason and audit trail', async () => {
    const res = await request(app)
      .patch(`/api/admin/bookings/${testBooking._id}/payment-status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        paymentStatus: 'paid',
        reason: 'Confirmed customer direct bank NEFT transfer receipt #9981.',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.paymentStatus).toBe('paid');

    const updated = await Booking.findById(testBooking._id);
    expect(updated?.paymentStatus).toBe('paid');
    expect(updated?.paymentStatusReason).toContain('NEFT transfer receipt #9981');

    const log = await AuditLog.findOne({
      action: 'BOOKING_PAYMENT_STATUS_CHANGED',
      targetId: testBooking._id,
    });
    expect(log).toBeDefined();
    expect(log?.details?.newPaymentStatus).toBe('paid');
  });

  it('allows customer on booking to raise a dispute and prevents duplicate open disputes', async () => {
    const res = await request(app)
      .post(`/api/bookings/${testBooking._id}/disputes`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        category: 'pricing_dispute',
        description: 'Provider demanded ₹500 extra cash above agreed booking amount.',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('open');
    expect(res.body.data.category).toBe('pricing_dispute');

    // Attempting a second open dispute on the same booking must fail with 409
    const dupRes = await request(app)
      .post(`/api/bookings/${testBooking._id}/disputes`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        category: 'communication',
        description: 'Duplicate dispute attempt.',
      });

    expect(dupRes.status).toBe(409);
    expect(dupRes.body.message).toContain('active dispute is already in progress');
  });

  it('prevents uninvolved third-party customer from raising or viewing disputes on a booking', async () => {
    const res = await request(app)
      .post(`/api/bookings/${testBooking._id}/disputes`)
      .set('Authorization', `Bearer ${otherCustomerToken}`)
      .send({
        category: 'service_quality',
        description: 'Attempt to interfere in someone else booking.',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('not authorized to raise a dispute');
  });

  it('allows admin to list disputes, inspect details, and resolve with reason', async () => {
    // Customer raises dispute
    const dispute = await Dispute.create({
      bookingId: testBooking._id,
      raisedByUserId: customerUser._id,
      raisedByRole: 'customer',
      raisedAgainstUserId: providerUser._id,
      raisedAgainstRole: 'provider',
      category: 'no_show',
      description: 'Provider did not arrive during the scheduled window.',
      status: 'open',
    });

    // Admin lists disputes
    const listRes = await request(app)
      .get('/api/admin/disputes')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.disputes.length).toBe(1);

    // Admin resolves dispute
    const resolveRes = await request(app)
      .patch(`/api/admin/disputes/${dispute._id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'resolved',
        adminNotes: 'Spoke with both parties; agreed to reschedule with priority.',
        resolutionReason: 'Mutual settlement reached and slot rescheduled.',
      });

    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.data.status).toBe('resolved');

    const updatedDispute = await Dispute.findById(dispute._id);
    expect(updatedDispute?.status).toBe('resolved');
    expect(updatedDispute?.resolvedByAdminId?.toString()).toBe(adminUser._id.toString());
  });

  it('never leaks internal adminNotes to customer or provider endpoints while preserving admin visibility', async () => {
    const dispute = await Dispute.create({
      bookingId: testBooking._id,
      raisedByUserId: customerUser._id,
      raisedByRole: 'customer',
      raisedAgainstUserId: providerUser._id,
      raisedAgainstRole: 'provider',
      category: 'service_quality',
      description: 'The job was incomplete and left debris in the kitchen.',
      status: 'under_review',
      adminNotes: 'CONFIDENTIAL_ADMIN_NOTE: Investigated provider records, issued internal strike warning.',
      resolutionReason: 'Investigation in progress.',
    });

    // 1. Customer queries disputes on the booking
    const custRes = await request(app)
      .get(`/api/bookings/${testBooking._id}/disputes`)
      .set('Authorization', `Bearer ${customerToken}`);

    expect(custRes.status).toBe(200);
    expect(custRes.body.data.length).toBe(1);
    expect(custRes.body.data[0].id).toBe(dispute._id.toString());
    expect(custRes.body.data[0].description).toBe(dispute.description);
    expect(custRes.body.data[0].adminNotes).toBeUndefined();

    // 2. Provider queries disputes on the booking
    const proRes = await request(app)
      .get(`/api/bookings/${testBooking._id}/disputes`)
      .set('Authorization', `Bearer ${providerToken}`);

    expect(proRes.status).toBe(200);
    expect(proRes.body.data.length).toBe(1);
    expect(proRes.body.data[0].id).toBe(dispute._id.toString());
    expect(proRes.body.data[0].description).toBe(dispute.description);
    expect(proRes.body.data[0].adminNotes).toBeUndefined();

    // 3. Admin queries disputes on the booking endpoint
    const adminBookingRes = await request(app)
      .get(`/api/bookings/${testBooking._id}/disputes`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminBookingRes.status).toBe(200);
    expect(adminBookingRes.body.data[0].adminNotes).toContain('CONFIDENTIAL_ADMIN_NOTE');

    // 4. Admin queries dispute via admin dispute details endpoint
    const adminDetailRes = await request(app)
      .get(`/api/admin/disputes/${dispute._id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminDetailRes.status).toBe(200);
    expect(adminDetailRes.body.data.adminNotes).toContain('CONFIDENTIAL_ADMIN_NOTE');

    // 5. Customer creates dispute — response must omit adminNotes
    const newDisputeBooking = await Booking.create({
      customerId: customerUser._id,
      providerId: providerProfile._id,
      providerUserId: providerUser._id,
      serviceId: testService._id,
      categoryId: testCategory._id,
      scheduledStartTime: new Date(Date.now() + 86400000),
      scheduledEndTime: new Date(Date.now() + 90000000),
      address: { street: '10 Mount Road', city: 'Chennai' },
      status: 'completed',
      priceSnapshot: 800,
    });

    const createRes = await request(app)
      .post(`/api/bookings/${newDisputeBooking._id}/disputes`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        category: 'pricing_dispute',
        description: 'Billed incorrectly for additional replacement parts.',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.adminNotes).toBeUndefined();
  });
});
