import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Extend Express Request to include requestId
declare global {
  namespace Express {
    interface Request {
      id?: string;
      requestId?: string;
    }
  }
}

// Valid request ID: alphanumeric, dashes, underscores, length 8 to 64
const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9_\-]{8,64}$/;

/**
 * Request correlation ID middleware.
 * Attaches a unique correlation ID to every incoming HTTP request and returns it
 * in the X-Request-Id response header.
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incomingHeader = req.headers['x-request-id'];
  let requestId: string;

  if (
    typeof incomingHeader === 'string' &&
    incomingHeader.trim().length >= 8 &&
    incomingHeader.trim().length <= 64 &&
    VALID_REQUEST_ID_REGEX.test(incomingHeader.trim())
  ) {
    requestId = incomingHeader.trim();
  } else {
    requestId = crypto.randomUUID();
  }

  req.id = requestId;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  next();
};
