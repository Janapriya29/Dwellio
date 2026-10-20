import { Response } from 'express';
import { ApiResponse } from '@dwellio/shared';
import { config } from '../config/env';

/**
 * Escapes all regular expression metacharacters in a string.
 * Ensures user-supplied input is treated as an exact literal pattern
 * when passed to RegExp or MongoDB $regex operators, preventing ReDoS and SyntaxErrors.
 */
export const escapeRegex = (str: string): string => {
  return str.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&');
};

/**
 * Safe 500 Internal Server Error responder.
 * In production: strictly returns a generic message ('Internal Server Error') and suppresses all raw error details.
 * In development: logs diagnostics and includes error message for local debugging.
 */
export const sendInternalError = (
  res: Response,
  context: string,
  error: any,
  devFallbackMessage: string = 'Internal server error occurred.'
): void => {
  // Always log context and diagnostic message to server console
  console.error(`[Error][${context}]`, error?.stack || error?.message || error);

  const isProd = config.nodeEnv === 'production';
  const response: ApiResponse = {
    success: false,
    message: isProd ? 'Internal Server Error' : (error?.message || devFallbackMessage),
    ...(isProd ? {} : { error: error?.message }),
  };

  res.status(500).json(response);
};
