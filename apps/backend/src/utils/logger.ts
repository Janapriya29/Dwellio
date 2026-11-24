import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
const currentLevelWeight = LOG_LEVELS[currentLevel] || LOG_LEVELS.info;

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'jwt',
  'authorization',
  'cookie',
  'secret',
  'jwtsecret',
  'keysecret',
  'webhooksecret',
  'razorpaykeysecret',
  'razorpaywebhooksecret',
  'accountnumber',
  'cardnumber',
  'cvv',
  'rawbody',
]);

/**
 * Recursively redacts sensitive keys from an object to prevent credential leakage.
 */
export const redactSensitive = (data: any, depth = 0): any => {
  if (depth > 4 || data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactSensitive(item, depth + 1));
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = redactSensitive(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

class StructuredLogger {
  private serviceName: string;

  constructor(serviceName = 'dwellio-backend') {
    this.serviceName = serviceName;
  }

  private emit(level: LogLevel, message: string, context?: Record<string, any>, error?: any): void {
    if (LOG_LEVELS[level] < currentLevelWeight) {
      return;
    }

    const timestamp = new Date().toISOString();
    const isProduction = config.nodeEnv === 'production';

    const safeContext = context ? redactSensitive(context) : undefined;
    const errorDetails = error
      ? {
          message: error?.message || String(error),
          stack: error?.stack,
          ...(typeof error === 'object' ? redactSensitive(error) : {}),
        }
      : undefined;

    const logEntry: Record<string, any> = {
      timestamp,
      level,
      message,
      service: this.serviceName,
      ...safeContext,
      ...(errorDetails ? { error: errorDetails } : {}),
    };

    if (isProduction) {
      // Structured JSON output in production for ELK / CloudWatch / Datadog
      const jsonLine = JSON.stringify(logEntry);
      if (level === 'error') {
        console.error(jsonLine);
      } else if (level === 'warn') {
        console.warn(jsonLine);
      } else {
        console.log(jsonLine);
      }
    } else {
      // Clean readable output in development
      const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.serviceName}]`;
      const meta = safeContext ? ` ${JSON.stringify(safeContext)}` : '';
      if (level === 'error') {
        console.error(`${prefix} ${message}${meta}`, error?.stack || error || '');
      } else if (level === 'warn') {
        console.warn(`${prefix} ${message}${meta}`);
      } else {
        console.log(`${prefix} ${message}${meta}`);
      }
    }
  }

  public debug(message: string, context?: Record<string, any>): void {
    this.emit('debug', message, context);
  }

  public info(message: string, context?: Record<string, any>): void {
    this.emit('info', message, context);
  }

  public warn(message: string, context?: Record<string, any>): void {
    this.emit('warn', message, context);
  }

  public error(message: string, error?: any, context?: Record<string, any>): void {
    this.emit('error', message, context, error);
  }
}

export const logger = new StructuredLogger();

/**
 * Express middleware for request tracing and structured HTTP access logging.
 */
export const requestLoggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();

  res.on('finish', () => {
    // Avoid noisy logging of high-frequency health probes in non-debug mode
    const isHealthCheck = req.originalUrl.startsWith('/api/health');
    if (isHealthCheck && res.statusCode === 200 && currentLevelWeight > LOG_LEVELS.debug) {
      return;
    }

    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode;
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    logger[level](`${req.method} ${req.originalUrl} - ${statusCode} (${durationMs}ms)`, {
      requestId: req.id || req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode,
      durationMs,
      userId: req.user?._id?.toString(),
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  });

  next();
};
