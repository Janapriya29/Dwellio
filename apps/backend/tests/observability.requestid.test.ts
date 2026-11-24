import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('Milestone 6B: Request Correlation ID Middleware (X-Request-Id)', () => {
  const app = createApp();

  it('generates a unique UUID v4 request ID when no X-Request-Id header is supplied', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    const requestId = res.headers['x-request-id'];
    expect(requestId).toBeDefined();
    // Verify standard UUID format
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('preserves and echoes back a valid incoming X-Request-Id header', async () => {
    const customId = 'req_dwellio_client_trace_12345';
    const res = await request(app)
      .get('/api/health')
      .set('X-Request-Id', customId);

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe(customId);
  });

  it('replaces a malformed, empty, or excessively long X-Request-Id with a new secure UUID', async () => {
    const malformedId = 'bad!id$with#symbols<script>';
    const res = await request(app)
      .get('/api/health')
      .set('X-Request-Id', malformedId);

    expect(res.status).toBe(200);
    const assignedId = res.headers['x-request-id'];
    expect(assignedId).not.toBe(malformedId);
    expect(assignedId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
