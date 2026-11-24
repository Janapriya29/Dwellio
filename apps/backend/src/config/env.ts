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
  if (!config.port || config.port < 1 || config.port > 65535) {
    throw new Error(`[Config Error] PORT must be a valid port number between 1 and 65535.`);
  }

  // Phase 4 Gateway Security Restriction: Live mode is strictly prohibited
  if (config.razorpayMode === 'live') {
    throw new Error(`[Config Error] Razorpay LIVE mode is strictly prohibited in this deployment. RAZORPAY_MODE must be 'test'.`);
  }

  if (config.nodeEnv === 'production') {
    if (!config.jwtSecret || INSECURE_JWT_SECRETS.includes(config.jwtSecret)) {
      throw new Error(`[Config Error] JWT_SECRET must be explicitly set to a unique, secure secret in production.`);
    }
    if (config.jwtSecret.length < 32) {
      throw new Error(`[Config Error] JWT_SECRET must be at least 32 characters long in production.`);
    }
  } else {
    if (!config.jwtSecret || config.jwtSecret.length < 16) {
      throw new Error(`[Config Error] JWT_SECRET must be at least 16 characters long.`);
    }
  }
};
