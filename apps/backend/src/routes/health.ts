import { Router, Request, Response } from 'express';
import { ApiResponse, HealthStatus } from '@dwellio/shared';
import { config } from '../config/env';
import { getDatabaseStatus, isDatabaseConnected } from '../config/db';
import { redisService } from '../services/redisService';

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
 * Liveness Health Check (Kubernetes / Docker liveness probe)
 * Indicates whether the application process is running and responding to requests.
 * Must not fail merely because an external downstream dependency is degraded.
 */
healthRouter.get('/health/liveness', (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    message: 'Process is alive.',
    data: {
      status: 'alive',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      service: 'dwellio-backend',
    },
  });
});

/**
 * Readiness Health Check (Kubernetes / Docker readiness probe)
 * Checks whether the service can accept incoming client traffic.
 * Requires MongoDB and Redis (if enabled) to be healthy and ready.
 */
healthRouter.get('/health/readiness', async (_req: Request, res: Response): Promise<void> => {
  const dbStatus = getDatabaseStatus();
  const dbHealthy = isDatabaseConnected();

  let redisHealthy = true;
  let redisState: string = 'disabled';

  if (config.redisEnabled) {
    try {
      const redisHealth = await redisService.checkRedisHealth();
      redisState = redisHealth.status;
      // In test mode or with mock active, status can be 'healthy' or 'degraded'
      redisHealthy = redisHealth.status === 'healthy';
    } catch {
      redisHealthy = false;
      redisState = 'unavailable';
    }
  }

  const isReady = dbHealthy && redisHealthy;
  const statusCode = isReady ? 200 : 503;

  res.status(statusCode).json({
    success: isReady,
    message: isReady ? 'Service is ready to handle traffic.' : 'Service dependencies not ready.',
    data: {
      status: isReady ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      dependencies: {
        database: {
          status: dbStatus.state,
          connected: dbHealthy,
        },
        redis: {
          status: redisState,
          ready: redisHealthy,
        },
      },
    },
  });
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

/**
 * Dedicated Redis Health Check
 * Safe connectivity check that reports operational status and latency without exposing credentials.
 */
healthRouter.get('/health/redis', async (_req: Request, res: Response): Promise<void> => {
  if (!config.redisEnabled) {
    res.status(200).json({
      success: true,
      message: 'Redis is disabled by configuration.',
      data: {
        status: 'disabled',
        mode: 'none',
      },
    });
    return;
  }

  try {
    const redisHealth = await redisService.checkRedisHealth();
    const isHealthy = redisHealth.status === 'healthy';
    const statusCode = isHealthy ? 200 : 503;

    res.status(statusCode).json({
      success: isHealthy,
      message: isHealthy ? 'Redis connection is healthy.' : 'Redis connection is degraded or unavailable.',
      data: {
        status: redisHealth.status,
        mode: redisHealth.mode,
        latencyMs: redisHealth.latencyMs,
        uptimeSeconds: redisHealth.uptimeSeconds,
        connectedClients: redisHealth.connectedClients,
      },
    });
  } catch (err: any) {
    res.status(503).json({
      success: false,
      message: 'Failed to communicate with Redis.',
      data: {
        status: 'unavailable',
        error: config.nodeEnv === 'production' ? 'Connection check failed' : err.message,
      },
    });
  }
});
