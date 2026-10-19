import express, { Application } from 'express';
import cors from 'cors';
import { config } from './config/env';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { providerRouter } from './routes/provider';
import { adminRouter } from './routes/admin';
import { catalogPublicRouter } from './routes/catalogPublic';
import { bookingRouter } from './routes/booking';
import { reviewRouter } from './routes/review';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';

export const createApp = (customRouter?: express.Router): Application => {
  const app: Application = express();

  // Basic security and parsing middleware
  app.use(
    cors({
      origin: config.clientUrl,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // API Routes
  app.use('/api', healthRouter);
  app.use('/api', authRouter);
  app.use('/api', providerRouter);
  app.use('/api', adminRouter);
  app.use('/api', catalogPublicRouter);
  app.use('/api', bookingRouter);
  app.use('/api', reviewRouter);

  // Optional custom router (used for testing or modular route injection)
  if (customRouter) {
    app.use('/api', customRouter);
  }

  // Fallback 404 handler for unmatched routes
  app.use(notFoundHandler);

  // Centralized error handler
  app.use(errorHandler);

  return app;
};
