import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { connectTestDb, disconnectTestDb } from './setup';

describe('Health & Database Route Integration Tests', () => {
  const app = createApp();

  beforeAll(async () => {
    await connectTestDb('dwellio_test_health');
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('GET /api/health should return 200 with backward-compatible payload and database status', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Dwellio API is healthy');
    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.service).toBe('dwellio-backend');
    expect(res.body.data.database).toBe('connected');
    expect(res.body.data.uptime).toBeTypeOf('number');

    // Security check: ensure no raw credentials or full connection strings are exposed
    expect(JSON.stringify(res.body)).not.toContain('mongodb://');
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('GET /api/health/db should return 200 when database is connected', async () => {
    const res = await request(app).get('/api/health/db');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Database connection is healthy');
    expect(res.body.data.status).toBe('connected');
    expect(res.body.data.readyState).toBe(1);

    // Security check
    expect(JSON.stringify(res.body)).not.toContain('mongodb://');
  });

  it('GET /api/health/db should return 503 when database is disconnected', async () => {
    // Disconnect database temporarily
    await disconnectTestDb();

    const res = await request(app).get('/api/health/db');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Database connection is unavailable');
    expect(res.body.data.status).toBe('disconnected');
    expect(res.body.data.readyState).toBe(0);

    // Reconnect for cleanup in afterAll
    await connectTestDb('dwellio_test_health');
  });

  it('GET /api/nonexistent should trigger 404 handler with consistent envelope', async () => {
    const res = await request(app).get('/api/nonexistent-endpoint');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Resource not found');
  });
});
