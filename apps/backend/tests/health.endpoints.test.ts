import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { connectTestDb, disconnectTestDb } from './setup';

describe('Milestone 6A: Extended Health Endpoints', () => {
  const app = createApp();

  beforeAll(async () => {
    await connectTestDb('dwellio_test_health_6a');
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('GET /api/health returns 200 with general system status and uptime', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.uptime).toBeGreaterThanOrEqual(0);
    expect(res.body.data.service).toBe('dwellio-backend');
    expect(res.body.data.database).toBe('connected');
  });

  it('GET /api/health/liveness returns 200 with process alive indicator', async () => {
    const res = await request(app).get('/api/health/liveness');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('alive');
    expect(res.body.data.uptime).toBeGreaterThanOrEqual(0);
  });

  it('GET /api/health/readiness returns 200 when database and redis dependencies are ready', async () => {
    const res = await request(app).get('/api/health/readiness');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ready');
    expect(res.body.data.dependencies.database.connected).toBe(true);
    expect(res.body.data.dependencies.redis.ready).toBe(true);
  });

  it('GET /api/health/db returns 200 when MongoDB connection is active', async () => {
    const res = await request(app).get('/api/health/db');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('connected');
    expect(res.body.data.readyState).toBe(1);
  });

  it('GET /api/health/redis returns 200 with non-sensitive redis health metrics', async () => {
    const res = await request(app).get('/api/health/redis');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('healthy');
    // Must NOT leak credentials or connection host/password
    expect(res.body.data.password).toBeUndefined();
    expect(res.body.data.redisUrl).toBeUndefined();
  });
});
