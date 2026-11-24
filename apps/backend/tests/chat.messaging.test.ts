import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app';
import { connectTestDb, clearTestDb, disconnectTestDb } from './setup';
import { User } from '../src/models/User';
import { ProviderProfile } from '../src/models/ProviderProfile';
import { Category } from '../src/models/Category';
import { Service } from '../src/models/Service';
import { Booking } from '../src/models/Booking';
import { Conversation } from '../src/models/Conversation';
import { Message } from '../src/models/Message';
import { generateToken } from '../src/utils/auth';
import { resetChatRateLimit } from '../src/services/chatRateLimiter';
import { socketService } from '../src/services/socketService';

describe('Milestone 5B: Real-Time Customer–Provider Messaging Tests', () => {
  const app = createApp();

  let customerUser: any;
  let providerUser: any;
  let unrelatedUser: any;
  let adminUser: any;
  let providerProfile: any;
  let testCategory: any;
  let testService: any;
  let testBooking: any;

  let customerToken: string;
  let providerToken: string;
  let unrelatedToken: string;
  let adminToken: string;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_chat_messaging');
    await User.syncIndexes();
    await Conversation.syncIndexes();
    await Message.syncIndexes();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    const hash = await bcrypt.hash('password123', 8);

    // 1. Create Customer
    customerUser = await User.create({
      name: 'Pooja Customer',
      email: 'pooja.chat@example.com',
      passwordHash: hash,
      role: 'customer',
      isActive: true,
    });
    customerToken = generateToken({ userId: customerUser._id.toString(), role: 'customer' });

    // 2. Create Provider User & Profile
    providerUser = await User.create({
      name: 'Karthik Provider',
      email: 'karthik.chat@example.com',
      passwordHash: hash,
      role: 'provider',
      isActive: true,
    });
    providerToken = generateToken({ userId: providerUser._id.toString(), role: 'provider' });

    providerProfile = await ProviderProfile.create({
      userId: providerUser._id,
      displayName: 'Karthik Electrical Services',
      phone: '9876543210',
      serviceArea: 'Indiranagar, Bangalore',
      skills: ['Electrical Wiring', 'Fan Installation'],
      verificationStatus: 'approved',
    });

    // 3. Create Unrelated Customer (for RBAC test)
    unrelatedUser = await User.create({
      name: 'Sneha Unrelated',
      email: 'sneha.unrelated@example.com',
      passwordHash: hash,
      role: 'customer',
      isActive: true,
    });
    unrelatedToken = generateToken({ userId: unrelatedUser._id.toString(), role: 'customer' });

    // 4. Create Admin User
    adminUser = await User.create({
      name: 'Dwellio Admin',
      email: 'admin.chat@dwellio.com',
      passwordHash: hash,
      role: 'admin',
      isActive: true,
    });
    adminToken = generateToken({ userId: adminUser._id.toString(), role: 'admin' });

    // 5. Create Category & Service
    testCategory = await Category.create({
      name: 'Electrical Services',
      slug: 'electrical-services',
      rooms: ['Living Room', 'Kitchen'],
      isActive: true,
    });

    testService = await Service.create({
      categoryId: testCategory._id,
      name: 'Switchboard Repair',
      slug: 'switchboard-repair',
      basePrice: 350,
      isActive: true,
    });

    // 6. Create Confirmed Booking
    testBooking = await Booking.create({
      customerId: customerUser._id,
      providerId: providerProfile._id,
      providerUserId: providerUser._id,
      serviceId: testService._id,
      categoryId: testCategory._id,
      scheduledStartTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
      scheduledEndTime: new Date(Date.now() + 26 * 60 * 60 * 1000),
      address: {
        street: '12th Main, HAL 2nd Stage',
        city: 'Bangalore',
        postalCode: '560008',
      },
      status: 'accepted',
      priceSnapshot: 350,
      paymentStatus: 'paid',
    });
  });

  describe('1. Message Posting & Delivery', () => {
    it('allows customer to send a message to provider, incrementing provider unread count', async () => {
      const res = await request(app)
        .post(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ content: 'Hello Karthik, what tools should I keep ready?' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message.content).toBe('Hello Karthik, what tools should I keep ready?');
      expect(res.body.data.message.sender.role).toBe('customer');

      // Verify Conversation record updated
      const conv = await Conversation.findOne({ bookingId: testBooking._id });
      expect(conv).toBeDefined();
      expect(conv?.unreadCountProvider).toBe(1);
      expect(conv?.unreadCountCustomer).toBe(0);
      expect(conv?.lastMessageId).toBeDefined();
    });

    it('allows provider to reply, incrementing customer unread count', async () => {
      // First, customer posts message
      await request(app)
        .post(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ content: 'Are you on time?' });

      // Provider replies
      const res = await request(app)
        .post(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ content: 'Yes Pooja, I will arrive at 10 AM with testing gear.' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message.sender.role).toBe('provider');

      const conv = await Conversation.findOne({ bookingId: testBooking._id });
      expect(conv?.unreadCountCustomer).toBe(1);
    });

    it('rejects empty or whitespace-only messages with 400 Bad Request', async () => {
      const res = await request(app)
        .post(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ content: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects messages exceeding 2000 character limit with 400 Bad Request', async () => {
      const longMessage = 'A'.repeat(2005);
      const res = await request(app)
        .post(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ content: longMessage });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('2000 characters');
    });
  });

  describe('2. Chat History Retrieval & Read Receipts', () => {
    it('retrieves chat history chronologically with populated participants and sender details', async () => {
      // Post 2 messages
      await request(app)
        .post(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ content: 'Message 1 from customer' });

      await request(app)
        .post(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${providerToken}`)
        .send({ content: 'Message 2 from provider' });

      const res = await request(app)
        .get(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.conversation).toBeDefined();
      expect(res.body.data.messages).toHaveLength(2);
      expect(res.body.data.messages[0].content).toBe('Message 1 from customer');
      expect(res.body.data.messages[1].content).toBe('Message 2 from provider');
    });

    it('marks unread messages as read and resets recipient unread counter to 0', async () => {
      // Customer sends message
      await request(app)
        .post(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ content: 'Please bring an extra tester' });

      let conv = await Conversation.findOne({ bookingId: testBooking._id });
      expect(conv?.unreadCountProvider).toBe(1);

      // Provider marks messages read
      const markRes = await request(app)
        .patch(`/api/bookings/${testBooking._id}/messages/read`)
        .set('Authorization', `Bearer ${providerToken}`);

      expect(markRes.status).toBe(200);
      expect(markRes.body.success).toBe(true);
      expect(markRes.body.data.markedCount).toBe(1);

      conv = await Conversation.findOne({ bookingId: testBooking._id });
      expect(conv?.unreadCountProvider).toBe(0);

      // Check message readAt timestamp
      const msg = await Message.findOne({ bookingId: testBooking._id });
      expect(msg?.readAt).toBeDefined();
    });

    it('returns total unread counts across all user conversations', async () => {
      // Customer sends message to provider
      await request(app)
        .post(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ content: 'First unread message' });

      const res = await request(app)
        .get('/api/conversations/unread-count')
        .set('Authorization', `Bearer ${providerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalUnread).toBe(1);
      expect(res.body.data.byBooking[testBooking._id.toString()]).toBe(1);
    });
  });

  describe('3. Authorization & Security Guards', () => {
    it('rejects access from an unrelated customer with 403 Forbidden', async () => {
      const getRes = await request(app)
        .get(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${unrelatedToken}`);

      expect(getRes.status).toBe(403);
      expect(getRes.body.success).toBe(false);

      const postRes = await request(app)
        .post(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${unrelatedToken}`)
        .send({ content: 'Sneaky message' });

      expect(postRes.status).toBe(403);
    });

    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app).get(`/api/bookings/${testBooking._id}/messages`);
      expect(res.status).toBe(401);
    });

    it('allows platform administrators to oversee booking conversations', async () => {
      const res = await request(app)
        .get(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('rejects posting to a locked conversation with 403 Forbidden', async () => {
      // Manually lock conversation
      await Conversation.findOneAndUpdate(
        { bookingId: testBooking._id },
        {
          $set: {
            status: 'locked',
            lockedAt: new Date(),
            lockReason: 'Booking completed 48 hours ago',
          },
        },
        { upsert: true }
      );

      const res = await request(app)
        .post(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ content: 'Trying to message locked conversation' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('locked');
    });

    it('rejects sending messages when booking status is cancelled or rejected', async () => {
      // 1. Mark booking as cancelled
      testBooking.status = 'cancelled';
      await testBooking.save();

      const resCancelled = await request(app)
        .post(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ content: 'Attempting to message cancelled booking' });

      expect(resCancelled.status).toBe(403);
      expect(resCancelled.body.message).toContain('locked');

      // 2. Mark booking as rejected
      testBooking.status = 'rejected';
      await testBooking.save();

      const resRejected = await request(app)
        .post(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ content: 'Attempting to message rejected booking' });

      expect(resRejected.status).toBe(403);
      expect(resRejected.body.message).toContain('locked');
    });
  });

  describe('4. Message History Pagination (Phase 5 Remediation)', () => {
    it('enforces limit, before cursor, hasMore, and stable chronological order', async () => {
      // Insert 15 messages with distinct timestamps
      const baseTime = Date.now() - 100000;
      const conversation = await Conversation.create({
        bookingId: testBooking._id,
        customerId: customerUser._id,
        providerId: providerUser._id,
        status: 'active',
      });

      const messageDocs = [];
      for (let i = 1; i <= 15; i++) {
        messageDocs.push({
          conversationId: conversation._id,
          bookingId: testBooking._id,
          senderId: i % 2 === 0 ? providerUser._id : customerUser._id,
          senderRole: i % 2 === 0 ? 'provider' : 'customer',
          content: `Test Message #${i}`,
          createdAt: new Date(baseTime + i * 1000),
        });
      }
      await Message.insertMany(messageDocs);

      // 1. Request latest 5 messages
      const resPage1 = await request(app)
        .get(`/api/bookings/${testBooking._id}/messages?limit=5`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(resPage1.status).toBe(200);
      expect(resPage1.body.data.messages.length).toBe(5);
      expect(resPage1.body.data.pagination.total).toBe(15);
      expect(resPage1.body.data.pagination.hasMore).toBe(true);
      expect(resPage1.body.data.pagination.limit).toBe(5);
      // Chronological order: message #11 to #15
      expect(resPage1.body.data.messages[0].content).toBe('Test Message #11');
      expect(resPage1.body.data.messages[4].content).toBe('Test Message #15');

      // 2. Fetch earlier messages using before cursor (ID of Message #11)
      const nextCursor = resPage1.body.data.pagination.nextCursor;
      const resPage2 = await request(app)
        .get(`/api/bookings/${testBooking._id}/messages?limit=5&before=${nextCursor}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(resPage2.status).toBe(200);
      expect(resPage2.body.data.messages.length).toBe(5);
      expect(resPage2.body.data.pagination.hasMore).toBe(true);
      // Messages #6 to #10
      expect(resPage2.body.data.messages[0].content).toBe('Test Message #6');
      expect(resPage2.body.data.messages[4].content).toBe('Test Message #10');
    });
  });

  describe('5. Chat Message Rate Limiting (Phase 5 Remediation)', () => {
    it('enforces 30 messages per minute rate limit and returns 429 when threshold exceeded', async () => {
      await resetChatRateLimit(customerUser._id.toString());

      // Send 30 allowed messages
      for (let i = 0; i < 30; i++) {
        const res = await request(app)
          .post(`/api/bookings/${testBooking._id}/messages`)
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ content: `Burst message ${i + 1}` });
        expect(res.status).toBe(201);
      }

      // 31st message should be blocked by rate limiter
      const blockedRes = await request(app)
        .post(`/api/bookings/${testBooking._id}/messages`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ content: 'Message 31: Exceeding threshold' });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.success).toBe(false);
      expect(blockedRes.body.message).toContain('Rate limit exceeded');

      // Clean up rate limit store
      await resetChatRateLimit(customerUser._id.toString());
    });
  });

  describe('6. Socket.IO Room Participant Authorization (Phase 5 Remediation)', () => {
    it('verifies socketService.isAuthorizedParticipant rejects unauthorized participants', async () => {
      const isAuthParticipant = (socketService as any).isAuthorizedParticipant.bind(socketService);

      // 1. Legitimate customer -> authorized
      const customerAllowed = await isAuthParticipant(testBooking._id.toString(), customerUser._id.toString(), 'customer');
      expect(customerAllowed).toBe(true);

      // 2. Legitimate provider -> authorized
      const providerAllowed = await isAuthParticipant(testBooking._id.toString(), providerUser._id.toString(), 'provider');
      expect(providerAllowed).toBe(true);

      // 3. Admin -> authorized
      const adminAllowed = await isAuthParticipant(testBooking._id.toString(), adminUser._id.toString(), 'admin');
      expect(adminAllowed).toBe(true);

      // 4. Unrelated third-party user -> unauthorized
      const unrelatedAllowed = await isAuthParticipant(testBooking._id.toString(), unrelatedUser._id.toString(), 'customer');
      expect(unrelatedAllowed).toBe(false);

      // 5. Non-existent booking ID -> unauthorized
      const nonExistentAllowed = await isAuthParticipant('66f000000000000000000999', customerUser._id.toString(), 'customer');
      expect(nonExistentAllowed).toBe(false);
    });
  });
});
