import mongoose from 'mongoose';
import { config } from './env';

/**
 * Sanitize a MongoDB URI to safely display in logs without exposing credentials.
 */
export const sanitizeMongoUri = (uri: string): string => {
  try {
    // If standard URI containing credentials, mask user/password
    const parsed = new URL(uri);
    if (parsed.password) {
      parsed.password = '***';
    }
    if (parsed.username) {
      parsed.username = '***';
    }
    return parsed.toString();
  } catch {
    // Fallback if URL parser fails on mongodb:// syntax
    return uri.replace(/\/\/(.*)@/, '//***:***@');
  }
};

/**
 * Returns human-readable state based on mongoose.connection.readyState
 * 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
 */
export const getDatabaseStatus = (): {
  state: 'disconnected' | 'connected' | 'connecting' | 'disconnecting';
  readyState: number;
} => {
  const readyState = mongoose.connection.readyState;
  switch (readyState) {
    case 1:
      return { state: 'connected', readyState };
    case 2:
      return { state: 'connecting', readyState };
    case 3:
      return { state: 'disconnecting', readyState };
    default:
      return { state: 'disconnected', readyState: 0 };
  }
};

/**
 * Check if the database connection is currently active and healthy.
 */
export const isDatabaseConnected = (): boolean => {
  return mongoose.connection.readyState === 1;
};

/**
 * Connect to MongoDB using the configured MONGO_URI and connection pool options.
 *
 * Pool Configuration Architecture:
 * - maxPoolSize (default 50): Restricts maximum concurrent sockets per process to prevent
 *   connection exhaustion on MongoDB during traffic spikes, especially in multi-container setups.
 * - minPoolSize (default 2): Maintains a warm baseline pool to eliminate TCP handshake latency.
 * - serverSelectionTimeoutMS (5000ms): Fast failover detection during server unreachable events.
 * - socketTimeoutMS (45000ms): Closes stalled/inactive sockets to prevent leaked connections.
 * - maxIdleTimeMS (30000ms): Reclaims idle connections above minPoolSize after 30 seconds.
 */
export const connectDatabase = async (): Promise<typeof mongoose> => {
  const targetUri = config.mongoUri;
  const safeUri = sanitizeMongoUri(targetUri);

  const maxPoolSize = process.env.MONGODB_MAX_POOL_SIZE
    ? parseInt(process.env.MONGODB_MAX_POOL_SIZE, 10)
    : 50;
  const minPoolSize = process.env.MONGODB_MIN_POOL_SIZE
    ? parseInt(process.env.MONGODB_MIN_POOL_SIZE, 10)
    : 2;

  try {
    console.log(`[Database] Connecting to MongoDB at ${safeUri} (pool: ${minPoolSize}-${maxPoolSize})...`);
    const conn = await mongoose.connect(targetUri, {
      maxPoolSize,
      minPoolSize,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxIdleTimeMS: 30000,
    });
    console.log(`[Database] Successfully connected to MongoDB (${conn.connection.name || 'dwellio'}).`);
    return conn;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown connection error';
    console.error(`[Database Error] Could not connect to MongoDB at ${safeUri}: ${errorMessage}`);
    throw error;
  }
};

/**
 * Disconnect from MongoDB gracefully.
 */
export const disconnectDatabase = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    console.log('[Database] Closing MongoDB connection...');
    await mongoose.connection.close();
    console.log('[Database] MongoDB connection closed.');
  }
};
