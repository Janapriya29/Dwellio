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

    // 6. Graceful shutdown handler
    let isShuttingDown = false;
    const handleShutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`\n[Worker] Received ${signal}. Draining jobs and shutting down...`);

      try {
        await workerSupervisor.close();
        await queueService.closeQueues();
        await redisService.closeRedisConnections();
        await disconnectDatabase();
        console.log('[Worker] Graceful shutdown completed.');
        process.exit(0);
      } catch (err) {
        console.error('[Worker Shutdown Error]:', err);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  } catch (error) {
    console.error('[Worker Fatal Error]:', error);
    process.exit(1);
  }
};

startWorkerProcess();
