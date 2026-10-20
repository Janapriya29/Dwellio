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
 * Centralized error-handling middleware.
 * Guarantees controlled responses for body-parser exceptions (400, 413)
 * and strictly prevents internal database/system details from leaking in 500 responses.
 */
export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Always log server-side diagnostics
  console.error('[Error Handler]', err?.stack || err?.message || err);

  // 1. Determine HTTP status code
  let statusCode = 500;
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 600) {
    statusCode = err.status;
  } else if (typeof err?.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) {
    statusCode = err.statusCode;
  } else if (res.statusCode >= 400 && res.statusCode < 600) {
    statusCode = res.statusCode;
  }

  // 2. Controlled messages for common parser and validation errors
  let message = 'Internal Server Error';

  if (statusCode === 413 || err?.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Payload too large. Request body cannot exceed 15kb.';
  } else if (
    statusCode === 400 ||
    err?.type === 'entity.parse.failed' ||
    (err instanceof SyntaxError && 'body' in err)
  ) {
    statusCode = 400;
    message = 'Malformed JSON in request body.';
  } else if (statusCode < 500) {
    // Client-side errors (400, 401, 403, 404, 409, 429) retain safe client messages
    message = err?.message || 'Bad Request';
  } else {
    // 500 Server-side errors: enforce generic message in production
    message = config.nodeEnv === 'production' ? 'Internal Server Error' : (err?.message || 'Internal Server Error');
  }

  const isProd = config.nodeEnv === 'production';
  const response: ApiResponse = {
    success: false,
    message,
    ...(!isProd && statusCode === 500 ? { error: err?.stack || err?.message } : {}),
  };

  res.status(statusCode).json(response);
};
