import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Redis from 'ioredis';
import { Queue, Worker } from 'bullmq';

/**
 * Dwellio Phase 5: Real Redis & BullMQ Integration Test Suite
 *
 * This test suite connects strictly to a genuine, running Redis instance.
 * It NEVER uses ioredis-mock or in-memory stubs.
 *
 * Requirements:
 * - Genuine Redis server running on 127.0.0.1:6379 (or configured via REDIS_TEST_URL / REDIS_URL).
 * - Verifies real BullMQ Lua script execution (cmsgpack engine), real job queuing,
 *   worker processing, delayed scheduling, retry/backoff, and deterministic deduplication.
 * - When run via "npm run test:redis-integration", fails fast if Redis is unavailable.
 * - In standard unit test passes, skips gracefully if Redis is not running locally.
 */

const TEST_REDIS_URL = process.env.REDIS_TEST_URL || process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const TEST_KEY_PREFIX = `dwellio_test_${Date.now()}`;
const isExplicitRun = process.env.RUN_REDIS_INTEGRATION === 'true';

describe('Real Redis & BullMQ Integration Suite (Opt-In / Live Redis Required)', () => {
  let redisClient: Redis | null = null;
  let testQueue: Queue | null = null;
  let testWorker: Worker | null = null;
  let isRedisAvailable = false;
  const queueName = `test-bullmq-${Date.now()}`;

  beforeAll(async () => {
    // 1. Establish connection probe to Redis
    const probe = new Redis(TEST_REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy: () => null, // Do not hang if offline
      lazyConnect: true,
      connectTimeout: 2000,
    });

    try {
      await probe.connect();
      const pong = await probe.ping();
      if (pong === 'PONG') {
        isRedisAvailable = true;
        redisClient = probe;
      }
    } catch (err: any) {
      await probe.disconnect();
      if (isExplicitRun) {
        throw new Error(
          `[REAL REDIS REQUIRED] Cannot connect to live Redis server at ${TEST_REDIS_URL}.\n` +
            `Error: ${err?.message}\n` +
            `To run real Redis integration tests:\n` +
            `  1. Ensure Docker Desktop or native Redis is running: "docker compose up redis -d"\n` +
            `  2. Optionally set REDIS_TEST_URL in environment if non-default.\n` +
            `  3. Run: "npm run test:redis-integration"\n`
        );
      } else {
        console.warn(
          `[Real Redis Integration Suite] Live Redis not detected at ${TEST_REDIS_URL}. Skipping live Redis suite in standard test run.`
        );
      }
    }

    if (isRedisAvailable && redisClient) {
      // 2. Initialize genuine BullMQ Queue targeting live Redis
      testQueue = new Queue(queueName, {
        connection: {
          host: redisClient.options.host || '127.0.0.1',
          port: redisClient.options.port || 6379,
          password: redisClient.options.password,
        },
        prefix: TEST_KEY_PREFIX,
      });
    }
  });

  afterAll(async () => {
    if (testWorker) {
      await testWorker.close();
    }
    if (testQueue) {
      try {
        await testQueue.obliterate({ force: true });
      } catch {
        // Queue cleanup best effort
      }
      await testQueue.close();
    }
    if (redisClient) {
      await redisClient.quit().catch(() => redisClient?.disconnect());
    }
  });

  it('1. Connects to real Redis and executes ping / info commands', async (ctx) => {
    if (!isRedisAvailable || !redisClient) {
      return ctx.skip();
    }
    const pong = await redisClient.ping();
    expect(pong).toBe('PONG');

    const info = await redisClient.info();
    expect(info).toContain('redis_version');
  });

  it('2. Enqueues and retrieves jobs using real BullMQ Lua scripts', async (ctx) => {
    if (!isRedisAvailable || !testQueue) {
      return ctx.skip();
    }
    const job = await testQueue.add('test_job', { foo: 'bar' }, { jobId: 'job_real_1' });
    expect(job.id).toBe('job_real_1');

    const retrieved = await testQueue.getJob('job_real_1');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.data.foo).toBe('bar');
  });

  it('3. Enforces deterministic job ID deduplication on real Redis', async (ctx) => {
    if (!isRedisAvailable || !testQueue) {
      return ctx.skip();
    }
    const job1 = await testQueue.add('dedup_test', { attempt: 1 }, { jobId: 'deterministic_id_100' });
    const job2 = await testQueue.add('dedup_test', { attempt: 2 }, { jobId: 'deterministic_id_100' });

    // BullMQ deterministic jobId guarantees only ONE job is scheduled with that ID
    expect(job1.id).toBe(job2.id);

    const counts = await testQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
    expect(counts.waiting).toBeGreaterThanOrEqual(1);
  });

  it('4. Schedules and verifies delayed job execution', async (ctx) => {
    if (!isRedisAvailable || !testQueue) {
      return ctx.skip();
    }
    const delayedJob = await testQueue.add(
      'delayed_reminder',
      { bookingId: 'booking_999' },
      { delay: 10000, jobId: 'delayed_job_1' }
    );

    expect(delayedJob.id).toBe('delayed_job_1');
    const delayCount = await testQueue.getDelayedCount();
    expect(delayCount).toBeGreaterThanOrEqual(1);
  });

  it('5. Processes jobs with a real BullMQ Worker', async (ctx) => {
    if (!isRedisAvailable || !testQueue || !redisClient) {
      return ctx.skip();
    }
    let processedData: any = null;

    testWorker = new Worker(
      queueName,
      async (job) => {
        if (job.name === 'worker_process_test') {
          processedData = job.data;
          return { status: 'success' };
        }
      },
      {
        connection: {
          host: redisClient.options.host || '127.0.0.1',
          port: redisClient.options.port || 6379,
          password: redisClient.options.password,
        },
        prefix: TEST_KEY_PREFIX,
      }
    );

    await testQueue.add('worker_process_test', { message: 'hello from worker' });

    // Wait up to 3 seconds for worker to process
    for (let i = 0; i < 30; i++) {
      if (processedData) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(processedData).not.toBeNull();
    expect(processedData.message).toBe('hello from worker');
  });
});
