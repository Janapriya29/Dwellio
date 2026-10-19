import { Router, Request, Response } from 'express';
import { ApiResponse, HealthStatus } from '@dwellio/shared';
import { config } from '../config/env';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response): void => {
  const healthData: HealthStatus = {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    service: 'dwellio-backend',
    version: '0.1.0',
  };

  const response: ApiResponse<HealthStatus> = {
    success: true,
    message: 'Dwellio API is healthy and operational. Your Home, in Good Hands.',
    data: healthData,
  };

  res.status(200).json(response);
});
