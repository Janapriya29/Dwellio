import http from 'http';
import { createApp } from './app';
import { config, validateConfig } from './config/env';
import { connectDatabase, disconnectDatabase, sanitizeMongoUri } from './config/db';
import { notificationStreamService } from './services/notificationStream';
import { socketService } from './services/socketService';
import { redisService } from './services/redisService';
import { queueService } from './services/queueService';

const startServer = async (): Promise<void> => {
  try {
    // 1. Validate configuration
    validateConfig();

    // 2. Connect to MongoDB
    console.log('[Startup] Initializing MongoDB connection...');
    await connectDatabase();

    // 3. Start Express HTTP server & Socket.IO
    const app = createApp();
    const server = http.createServer(app);

    // Initialize Socket.IO with HTTP server
    socketService.init(server);

    server.listen(config.port, () => {
      console.log(`===============================================`);
      console.log(` Dwellio Backend Service (Phase 5)`);
      console.log(` Tagline: Your Home, in Good Hands.`);
      console.log(` Environment : ${config.nodeEnv}`);
      console.log(` Port        : ${config.port}`);
      console.log(` Health URL  : http://localhost:${config.port}/api/health`);
      console.log(` DB Health   : http://localhost:${config.port}/api/health/db`);
      console.log(` CORS Origin : ${config.clientUrl}`);
      console.log(` Database    : ${sanitizeMongoUri(config.mongoUri)}`);
      console.log(` Redis State : ${config.redisEnabled ? 'Enabled' : 'Disabled'}`);
      console.log(`===============================================`);
    });

    // 4. Handle graceful shutdown and process lifecycle safety (Milestone 6A.4)
    let isShuttingDown = false;
    const handleShutdown = async (signal: string, exitCode: number = 0) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`\n[Process] Received ${signal}. Initiating graceful shutdown...`);

      // Force terminate after 10s if graceful shutdown hangs
      const forceExitTimer = setTimeout(() => {
        console.error('[Shutdown Error] Graceful shutdown timed out (10s limit). Forcing exit.');
        process.exit(1);
      }, 10000);
      if (typeof forceExitTimer.unref === 'function') {
        forceExitTimer.unref();
      }

      try {
        // Stop accepting new HTTP requests
        server.close(async () => {
          console.log('[Shutdown] HTTP server stopped accepting connections.');
        });

        // Close all live notification SSE streams
        notificationStreamService.closeAllClients();

        // Close Socket.IO server
        await socketService.close().catch((e) => console.warn('[Shutdown] Error closing Socket.IO:', e?.message || e));

        // Close BullMQ queue handles
        await queueService.closeQueues().catch((e) => console.warn('[Shutdown] Error closing Queues:', e?.message || e));

        // Close Redis connections
        await redisService.closeRedisConnections().catch((e) => console.warn('[Shutdown] Error closing Redis:', e?.message || e));

        // Disconnect MongoDB cleanly
        await disconnectDatabase();
        console.log('[Shutdown] Graceful shutdown completed cleanly.');
        process.exit(exitCode);
      } catch (err: any) {
        console.error('[Shutdown Error] Fatal error during shutdown sequence:', err?.message || err);
        process.exit(1);
      }
    };

    // Process signal handlers
    process.on('SIGINT', () => handleShutdown('SIGINT', 0));
    process.on('SIGTERM', () => handleShutdown('SIGTERM', 0));

    // Process exception & unhandled rejection handlers
    process.on('uncaughtException', (err: Error) => {
      console.error('[Process Fatal] Uncaught Exception:', err?.stack || err?.message || err);
      handleShutdown('uncaughtException', 1);
    });

    process.on('unhandledRejection', (reason: any) => {
      console.error('[Process Fatal] Unhandled Promise Rejection:', reason?.stack || reason?.message || reason);
      handleShutdown('unhandledRejection', 1);
    });
  } catch (error) {
    console.error('[Startup Failure] Failed to start Dwellio backend:', error);
    process.exit(1);
  }
};

startServer();
