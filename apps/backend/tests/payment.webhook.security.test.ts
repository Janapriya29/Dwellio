import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { createApp } from '../src/app';
import { connectTestDb, disconnectTestDb } from './setup';
import { PaymentWebhookEvent } from '../src/models/PaymentWebhookEvent';
import { config } from '../src/config/env';

describe('Milestone 6D: Razorpay Webhook Security & Idempotency Tests', () => {
  const app = createApp();
  const testSecret = config.razorpayWebhookSecret;

  beforeAll(async () => {
    await connectTestDb('dwellio_test_webhook_sec_6d');
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  const generateSignature = (body: string, secret = testSecret): string => {
    return crypto.createHmac('sha256', secret).update(body).digest('hex');
  };

  it('rejects webhook request when x-razorpay-signature header is missing', async () => {
    const payload = { event: 'payment.captured', entity: {} };
    const res = await request(app)
      .post('/api/payments/webhook')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Missing x-razorpay-signature header/i);
  });

  it('rejects webhook request with an invalid or forged signature', async () => {
    const rawBody = JSON.stringify({ event: 'payment.captured', test: 123 });
    const forgedSig = 'forged_invalid_signature_hex_string_12345';

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('x-razorpay-signature', forgedSig)
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Invalid webhook signature/i);
  });

  it('rejects webhook request when payload has been tampered after signing', async () => {
    const originalBody = JSON.stringify({ event: 'payment.captured', amount: 50000 });
    const validSignatureForOriginal = generateSignature(originalBody);

    const tamperedBody = JSON.stringify({ event: 'payment.captured', amount: 100 }); // tampered!

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('x-razorpay-signature', validSignatureForOriginal)
      .set('Content-Type', 'application/json')
      .send(tamperedBody);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Invalid webhook signature/i);
  });

  it('accepts and safely processes a valid webhook signature for an unknown event type without failing', async () => {
    const eventId = `evt_test_unknown_${Date.now()}`;
    const payload = {
      event: 'refund.speed_changed', // unhandled/unknown event type
      payload: { refund: { id: 'rfnd_123' } },
    };
    const rawBody = JSON.stringify(payload);
    const validSig = generateSignature(rawBody);

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('x-razorpay-signature', validSig)
      .set('x-razorpay-event-id', eventId)
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const saved = await PaymentWebhookEvent.findOne({ eventId });
    expect(saved).not.toBeNull();
    expect(saved?.processingStatus).toBe('processed');
  });

  it('strictly enforces event idempotency: second identical event returns 200 without reprocessing', async () => {
    const eventId = `evt_test_dedup_${Date.now()}`;
    const payload = {
      event: 'payment.authorized',
      payload: { payment: { id: 'pay_999' } },
    };
    const rawBody = JSON.stringify(payload);
    const validSig = generateSignature(rawBody);

    // First delivery
    const res1 = await request(app)
      .post('/api/payments/webhook')
      .set('x-razorpay-signature', validSig)
      .set('x-razorpay-event-id', eventId)
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res1.status).toBe(200);

    // Duplicate delivery
    const res2 = await request(app)
      .post('/api/payments/webhook')
      .set('x-razorpay-signature', validSig)
      .set('x-razorpay-event-id', eventId)
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res2.status).toBe(200);
    expect(res2.body.message).toMatch(/already processed/i);

    // Ensure only 1 document exists in database
    const count = await PaymentWebhookEvent.countDocuments({ eventId });
    expect(count).toBe(1);
  });
});
