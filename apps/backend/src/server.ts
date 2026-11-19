import { createApp } from './app';
import { config, validateConfig } from './config/env';
import { connectDatabase, disconnectDatabase, sanitizeMongoUri } from './config/db';
import { notificationStreamService } from './services/notificationStream';

const startServer = async (): Promise<void> => {
  try {
    // 1. Validate configuration
    validateConfig();

    // 2. Connect to MongoDB
    console.log('[Startup] Initializing MongoDB connection...');
    await connectDatabase();

    // 3. Start Express HTTP server
    const app = createApp();

    const server = app.listen(config.port, () => {
      console.log(`===============================================`);
      console.log(` Dwellio Backend Service (Phase 2)`);
      console.log(` Tagline: Your Home, in Good Hands.`);
      console.log(` Environment : ${config.nodeEnv}`);
      console.log(` Port        : ${config.port}`);
      console.log(` Health URL  : http://localhost:${config.port}/api/health`);
      console.log(` DB Health   : http://localhost:${config.port}/api/health/db`);
      console.log(` CORS Origin : ${config.clientUrl}`);
      console.log(` Database    : ${sanitizeMongoUri(config.mongoUri)}`);
      console.log(`===============================================`);
    });

    // 4. Handle graceful shutdown
    let isShuttingDown = false;
    const handleShutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`\nReceived ${signal}. Starting graceful shutdown...`);

      // Close all live notification streams
      notificationStreamService.closeAllClients();

      server.close(async () => {
        console.log('[Shutdown] HTTP server closed.');
        try {
          await disconnectDatabase();
          console.log('[Shutdown] Graceful shutdown completed.');
          process.exit(0);
        } catch (dbError) {
          console.error('[Shutdown Error] Failed to close database cleanly:', dbError);
          process.exit(1);
        }
      });

      // Force terminate after 10s if graceful shutdown hangs
      setTimeout(() => {
        console.error('[Shutdown Error] Graceful shutdown timed out. Forcing exit.');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  } catch (error) {
    console.error('[Startup Failure] Failed to start Dwellio backend:', error);
    process.exit(1);
  }
};

startServer();
