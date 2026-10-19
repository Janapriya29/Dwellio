import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '@dwellio/shared';
import { config } from '../config/env';

/**
 * Handle 404 - Not Found for unhandled routes
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  const response: ApiResponse = {
    success: false,
    message: `Resource not found: ${req.method} ${req.originalUrl}`,
  };
  res.status(404).json(response);
};

/**
 * Centralized error-handling middleware
 */
export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('[Error]', err.stack || err.message);

  const statusCode = res.statusCode >= 400 ? res.statusCode : 500;
  const response: ApiResponse = {
    success: false,
    message: err.message || 'Internal Server Error',
    ...(config.nodeEnv === 'development' ? { error: err.stack } : {}),
  };

  res.status(statusCode).json(response);
};
