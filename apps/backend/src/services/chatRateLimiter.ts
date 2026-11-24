import { redisService } from './redisService';
import { config } from '../config/env';

export interface ChatRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

const CHAT_LIMIT = 30; // 30 messages per minute
const WINDOW_SECONDS = 60;

// In-memory fallback store when Redis is unavailable or mocked
const memoryStore = new Map<string, { count: number; expiresAt: number }>();

/**
 * Checks and enforces the chat messaging rate limit across all transports (REST and Socket.IO).
 * Uses Redis when active so limits are enforced across horizontal API replicas.
 */
export const checkChatRateLimit = async (userId: string): Promise<ChatRateLimitResult> => {
  if (!userId) {
    return { allowed: false, remaining: 0, resetInSeconds: WINDOW_SECONDS };
  }

  // 1. Try Redis-backed rate limiting if Redis is healthy / real
  try {
    const health = await redisService.checkRedisHealth();
    if (health.status === 'healthy' && health.mode === 'real') {
      const client = redisService.getClient();
      const key = `ratelimit:chat:${userId}`;
      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, WINDOW_SECONDS);
      }
      const ttl = await client.ttl(key);
      const resetInSeconds = ttl > 0 ? ttl : WINDOW_SECONDS;

      if (count > CHAT_LIMIT) {
        return {
          allowed: false,
          remaining: 0,
          resetInSeconds,
        };
      }

      return {
        allowed: true,
        remaining: Math.max(0, CHAT_LIMIT - count),
        resetInSeconds,
      };
    }
  } catch (err) {
    // Fall through to in-memory store
  }

  // 2. In-memory fallback (used in test mode or when Redis is offline)
  const now = Date.now();
  let entry = memoryStore.get(userId);

  if (!entry || entry.expiresAt <= now) {
    entry = { count: 1, expiresAt: now + WINDOW_SECONDS * 1000 };
    memoryStore.set(userId, entry);
    return {
      allowed: true,
      remaining: CHAT_LIMIT - 1,
      resetInSeconds: WINDOW_SECONDS,
    };
  }

  entry.count += 1;
  const resetInSeconds = Math.max(1, Math.ceil((entry.expiresAt - now) / 1000));

  if (entry.count > CHAT_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds,
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, CHAT_LIMIT - entry.count),
    resetInSeconds,
  };
};

/**
 * Resets rate limit for a specific user (useful for testing)
 */
export const resetChatRateLimit = async (userId: string): Promise<void> => {
  memoryStore.delete(userId);
  try {
    const client = redisService.getClient();
    await client.del(`ratelimit:chat:${userId}`).catch(() => {});
  } catch {
    // Ignore
  }
};
