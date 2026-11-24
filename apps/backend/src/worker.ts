import { config, validateConfig } from './config/env';
import { connectDatabase, disconnectDatabase, sanitizeMongoUri } from './config/db';
import { redisService } from './services/redisService';
import { queueService } from './services/queueService';
import { workerSupervisor } from './workers/workerSupervisor';

const startWorkerProcess = async (): Promise<void> => {
  try {
    console.log('===============================================');
    console.log(' Dwellio Dedicated Background Worker (Phase 5)');
    console.log(' Tagline: Your Home, in Good Hands.');
    console.log(` Environment: ${config.nodeEnv}`);
    console.log('===============================================');

    // 1. Validate configuration
    validateConfig();

    // 2. Connect to MongoDB
    console.log('[Worker] Connecting to MongoDB...');
    await connectDatabase();
    console.log(`[Worker] Connected to MongoDB: ${sanitizeMongoUri(config.mongoUri)}`);

    // 3. Check Redis connection
    console.log('[Worker] Checking Redis connection...');
    const redisHealth = await redisService.checkRedisHealth();
    console.log(`[Worker] Redis status: ${redisHealth.status} (mode: ${redisHealth.mode})`);

    // 4. Register repeatable schedules (only designated worker registers them)
    console.log('[Worker] Registering repeatable queue jobs...');
    await queueService.registerRepeatableJobs().catch((err) => {
      console.warn('[Worker] Warning registering repeatable schedules:', err.message);
    });

    // 5. Start BullMQ workers
    await workerSupervisor.start();
    console.log('[Worker] Dedicated worker process is active and processing queues.');

    // 6. Graceful shutdown handler and process lifecycle safety (Milestone 6A.4)
    let isShuttingDown = false;
    const handleShutdown = async (signal: string, exitCode: number = 0) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`\n[Worker] Received ${signal}. Draining jobs and shutting down...`);

      // Force terminate after 10s if graceful shutdown hangs
      const forceExitTimer = setTimeout(() => {
        console.error('[Worker Shutdown Error] Graceful shutdown timed out (10s limit). Forcing exit.');
        process.exit(1);
      }, 10000);
      if (typeof forceExitTimer.unref === 'function') {
        forceExitTimer.unref();
      }

      try {
        await workerSupervisor.close().catch((e) => console.warn('[Worker] Error closing workers:', e?.message || e));
        await queueService.closeQueues().catch((e) => console.warn('[Worker] Error closing queues:', e?.message || e));
        await redisService.closeRedisConnections().catch((e) => console.warn('[Worker] Error closing Redis:', e?.message || e));
        await disconnectDatabase().catch((e) => console.warn('[Worker] Error closing DB:', e?.message || e));
        console.log('[Worker] Graceful shutdown completed cleanly.');
        process.exit(exitCode);
      } catch (err: any) {
        console.error('[Worker Shutdown Error]:', err?.message || err);
        process.exit(1);
      }
    };

    // Process signal handlers
    process.on('SIGINT', () => handleShutdown('SIGINT', 0));
    process.on('SIGTERM', () => handleShutdown('SIGTERM', 0));

    // Process exception & unhandled rejection handlers
    process.on('uncaughtException', (err: Error) => {
      console.error('[Worker Fatal] Uncaught Exception:', err?.stack || err?.message || err);
      handleShutdown('uncaughtException', 1);
    });

    process.on('unhandledRejection', (reason: any) => {
      console.error('[Worker Fatal] Unhandled Promise Rejection:', reason?.stack || reason?.message || reason);
      handleShutdown('unhandledRejection', 1);
    });
  } catch (error) {
    console.error('[Worker Fatal Error]:', error);
    process.exit(1);
  }
};

startWorkerProcess();
