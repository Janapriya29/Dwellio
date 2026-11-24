import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import { healthRouter } from './routes/health';
import { authRouter } from './routes/auth';
import { providerRouter } from './routes/provider';
import { adminRouter } from './routes/admin';
import { catalogPublicRouter } from './routes/catalogPublic';
import { bookingRouter } from './routes/booking';
import { reviewRouter } from './routes/review';
import { notificationRouter } from './routes/notification';
import { paymentRouter } from './routes/payment';
import { couponRouter } from './routes/coupon';
import { chatRouter } from './routes/chat';
import { requestIdMiddleware } from './middleware/requestId';
import { requestLoggingMiddleware } from './utils/logger';
import { generalApiRateLimiter } from './middleware/rateLimiter';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';

export const createApp = (customRouter?: express.Router): Application => {
  const app: Application = express();

  // 1. Request correlation ID and structured access logging (Milestone 6B)
  app.use(requestIdMiddleware);
  app.use(requestLoggingMiddleware);

  // 2. Basic security headers and banner suppression
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: false, // CSP is managed at the frontend / reverse-proxy layer
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // Permit cross-origin API access per CORS policy
      hsts:
        config.nodeEnv === 'production'
          ? { maxAge: 31536000, includeSubDomains: true }
          : false, // Do not force HSTS on local HTTP development
    })
  );

  // 3. CORS configuration
  app.use(
    cors({
      origin: config.clientUrl,
      credentials: true,
    })
  );

  // 4. Explicit request body size limits (15kb cap) with raw body preservation for webhooks (Phase 4A)
  app.use(
    express.json({
      limit: '15kb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '15kb' }));

  // 5. General API Rate Limiter across /api (automatically preserves health checks)
  app.use('/api', generalApiRateLimiter);

  // API Routes
  app.use('/api', healthRouter);
  app.use('/api', authRouter);
  app.use('/api', providerRouter);
  app.use('/api', adminRouter);
  app.use('/api', catalogPublicRouter);
  app.use('/api', bookingRouter);
  app.use('/api', reviewRouter);
  app.use('/api', notificationRouter);
  app.use('/api', paymentRouter);
  app.use('/api', couponRouter);
  app.use('/api', chatRouter);

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
