import dotenv from 'dotenv';
import path from 'path';

// Load .env file from apps/backend/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface AppConfig {
  port: number;
  nodeEnv: string;
  clientUrl: string;
  mongoUri: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  razorpayWebhookSecret: string;
  razorpayMode: 'test' | 'live';
  razorpayLiveEnabled: boolean;
  razorpayRouteEnabled: boolean;
  redisUrl?: string;
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  redisTls: boolean;
  redisEnabled: boolean;
}

const getEnvNumber = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    console.warn(`[Config] Invalid number for ${key}: "${value}". Using default: ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
};

// Safe fallback for dev/testing only
const DEV_JWT_SECRET = 'dwellio_development_jwt_secret_key_minimum_32_bytes_long';

// Known insecure or placeholder secrets that must never be permitted in production
const INSECURE_JWT_SECRETS = [
  DEV_JWT_SECRET,
  'dwellio_production_secure_secret_key_minimum_32_chars_long',
  'replace_with_a_secure_production_secret_at_least_32_characters_long',
  'your_super_secret_jwt_key_at_least_32_characters_long',
];

export const config: AppConfig = {
  port: getEnvNumber('PORT', 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/dwellio',
  jwtSecret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : DEV_JWT_SECRET),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder_key_id',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || 'rzp_test_placeholder_secret',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_test_placeholder_webhook_secret',
  razorpayMode: (process.env.RAZORPAY_MODE === 'live' ? 'live' : 'test') as 'test' | 'live',
  razorpayLiveEnabled: process.env.RAZORPAY_LIVE_ENABLED === 'true',
  razorpayRouteEnabled: process.env.RAZORPAY_ROUTE_ENABLED === 'true',
  redisUrl: process.env.REDIS_URL,
  redisHost: process.env.REDIS_HOST || '127.0.0.1',
  redisPort: getEnvNumber('REDIS_PORT', 6379),
  redisPassword: process.env.REDIS_PASSWORD || undefined,
  redisTls: process.env.REDIS_TLS === 'true',
  redisEnabled: process.env.REDIS_ENABLED !== 'false',
};

// Validate critical configurations
export const validateConfig = (): void => {
  // 1. Port range validation
  if (!config.port || config.port < 1 || config.port > 65535) {
    throw new Error('[Config Error] PORT must be a valid port number between 1 and 65535.');
  }

  // 2. Production Environment Validation (Milestone 6A.3)
  if (config.nodeEnv === 'production') {
    // MONGO_URI must be explicitly set and cannot fall back to localhost in production
    if (!process.env.MONGO_URI) {
      throw new Error('[Config Error] MONGO_URI must be explicitly configured in production.');
    }
    const mongoUriLower = config.mongoUri.toLowerCase();
    if (mongoUriLower.includes('localhost') || mongoUriLower.includes('127.0.0.1')) {
      throw new Error('[Config Error] MONGO_URI cannot target localhost or 127.0.0.1 in production. Provide a dedicated database host.');
    }

    // CLIENT_URL must be explicitly set and cannot fall back to localhost in production
    if (!process.env.CLIENT_URL) {
      throw new Error('[Config Error] CLIENT_URL must be explicitly configured in production.');
    }
    const clientUrlLower = config.clientUrl.toLowerCase();
    if (clientUrlLower.includes('localhost') || clientUrlLower.includes('127.0.0.1')) {
      throw new Error('[Config Error] CLIENT_URL cannot point to localhost in production. Provide the public frontend origin.');
    }

    // JWT_SECRET security rules in production
    if (!config.jwtSecret || INSECURE_JWT_SECRETS.includes(config.jwtSecret)) {
      throw new Error('[Config Error] JWT_SECRET must be explicitly set to a unique, secure secret in production.');
    }
    if (config.jwtSecret.length < 32) {
      throw new Error('[Config Error] JWT_SECRET must be at least 32 characters long in production.');
    }

    // Redis configuration validation in production
    if (config.redisEnabled) {
      if (!config.redisUrl && !config.redisHost) {
        throw new Error('[Config Error] Redis is enabled in production, but neither REDIS_URL nor REDIS_HOST is configured.');
      }
    }
  } else {
    // Development & Test Mode validation
    if (!config.jwtSecret || config.jwtSecret.length < 16) {
      throw new Error('[Config Error] JWT_SECRET must be at least 16 characters long.');
    }
  }

  // 3. Payment Mode & Gateway Validation (Milestone 6D.1)
  if (config.razorpayMode === 'live') {
    // Live mode requires explicit production environment and explicit opt-in
    if (config.nodeEnv !== 'production') {
      throw new Error('[Config Error] Razorpay LIVE mode can only be activated when NODE_ENV is set to "production".');
    }
    if (!config.razorpayLiveEnabled) {
      throw new Error('[Config Error] Razorpay LIVE mode requires explicit opt-in via RAZORPAY_LIVE_ENABLED=true.');
    }
    if (!config.razorpayKeyId || !config.razorpayKeyId.startsWith('rzp_live_')) {
      throw new Error('[Config Error] Razorpay LIVE mode requires a valid RAZORPAY_KEY_ID starting with "rzp_live_".');
    }
    if (
      !config.razorpayKeySecret ||
      config.razorpayKeySecret === 'rzp_test_placeholder_secret' ||
      config.razorpayKeySecret.trim().length < 8
    ) {
      throw new Error('[Config Error] Razorpay LIVE mode requires a valid, non-placeholder RAZORPAY_KEY_SECRET.');
    }
  } else {
    // In Test mode, live keys must not be accidentally configured
    if (config.razorpayKeyId && config.razorpayKeyId.startsWith('rzp_live_')) {
      throw new Error('[Config Error] A live Razorpay Key ID ("rzp_live_...") was provided while RAZORPAY_MODE is set to "test".');
    }
  }
};
