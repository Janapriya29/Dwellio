import { Router, Request, Response } from 'express';
import { ApiResponse, HealthStatus } from '@dwellio/shared';
import { config } from '../config/env';
import { getDatabaseStatus, isDatabaseConnected } from '../config/db';

export const healthRouter = Router();

/**
 * General API Health Check
 * Preserves Phase 1 compatibility while exposing non-sensitive database readiness state.
 */
healthRouter.get('/health', (_req: Request, res: Response): void => {
  const dbStatus = getDatabaseStatus();
  const isHealthy = isDatabaseConnected();

  const healthData: HealthStatus = {
    status: isHealthy ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    service: 'dwellio-backend',
    version: '0.1.0',
    database: dbStatus.state,
  };

  const response: ApiResponse<HealthStatus> = {
    success: true,
    message: isHealthy
      ? 'Dwellio API is healthy and operational. Your Home, in Good Hands.'
      : 'Dwellio API is running with degraded database connectivity.',
    data: healthData,
  };

  res.status(200).json(response);
});

/**
 * Dedicated Database Readiness Health Check
 * Returns 200 if MongoDB is connected, or 503 Service Unavailable if disconnected.
 * Never exposes credentials, connection strings, or internal stack traces.
 */
healthRouter.get('/health/db', (_req: Request, res: Response): void => {
  const dbStatus = getDatabaseStatus();
  const connected = isDatabaseConnected();

  if (connected) {
    const response: ApiResponse<{ status: string; readyState: number }> = {
      success: true,
      message: 'Database connection is healthy and active.',
      data: {
        status: dbStatus.state,
        readyState: dbStatus.readyState,
      },
    };
    res.status(200).json(response);
    return;
  }

  const response: ApiResponse<{ status: string; readyState: number }> = {
    success: false,
    message: 'Database connection is unavailable or disconnected.',
    data: {
      status: dbStatus.state,
      readyState: dbStatus.readyState,
    },
  };
  res.status(503).json(response);
});
