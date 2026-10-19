import dotenv from 'dotenv';
import path from 'path';

// Load .env file from apps/backend/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export interface AppConfig {
  port: number;
  nodeEnv: string;
  clientUrl: string;
  mongoUri: string;
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

export const config: AppConfig = {
  port: getEnvNumber('PORT', 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/dwellio',
};

// Validate critical configurations
export const validateConfig = (): void => {
  if (!config.port || config.port < 1 || config.port > 65535) {
    throw new Error(`[Config Error] PORT must be a valid port number between 1 and 65535.`);
  }

  // NOTE on Database Integration (Phase 2):
  // The MongoDB connection via Mongoose will be initialized in Phase 2 using config.mongoUri.
  // In Phase 1, the server runs independently to verify foundational HTTP and health check behavior.
};
