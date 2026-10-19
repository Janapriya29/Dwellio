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

export const config: AppConfig = {
  port: getEnvNumber('PORT', 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/dwellio',
  jwtSecret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : DEV_JWT_SECRET),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};

// Validate critical configurations
export const validateConfig = (): void => {
  if (!config.port || config.port < 1 || config.port > 65535) {
    throw new Error(`[Config Error] PORT must be a valid port number between 1 and 65535.`);
  }

  if (config.nodeEnv === 'production') {
    if (!config.jwtSecret || config.jwtSecret === DEV_JWT_SECRET) {
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
