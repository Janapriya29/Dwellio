import { createApp } from './app';
import { config, validateConfig } from './config/env';

const startServer = (): void => {
  try {
    // Validate configuration
    validateConfig();

    const app = createApp();

    const server = app.listen(config.port, () => {
      console.log(`===============================================`);
      console.log(` Dwellio Backend Service`);
      console.log(` Tagline: Your Home, in Good Hands.`);
      console.log(` Environment : ${config.nodeEnv}`);
      console.log(` Port        : ${config.port}`);
      console.log(` Health URL  : http://localhost:${config.port}/api/health`);
      console.log(` CORS Origin : ${config.clientUrl}`);
      console.log(` Database    : Configured for ${config.mongoUri} (Phase 2)`);
      console.log(`===============================================`);
    });

    // Handle graceful shutdown
    const handleShutdown = (signal: string) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      server.close(() => {
        console.log('HTTP server closed.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => handleShutdown('SIGINT'));
    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  } catch (error) {
    console.error('Failed to start Dwellio backend:', error);
    process.exit(1);
  }
};

startServer();
