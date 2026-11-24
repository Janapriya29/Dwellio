import Redis, { RedisOptions } from 'ioredis';
import { config } from '../config/env';

export interface RedisHealthStatus {
  status: 'healthy' | 'degraded' | 'unavailable';
  latencyMs?: number;
  mode: 'real' | 'mock';
  error?: string;
  uptimeSeconds?: number;
  connectedClients?: number;
}

/**
 * Centralized Redis Service for Dwellio.
 *
 * Manages separate connections for:
 * 1. General command producer
 * 2. Dedicated Pub/Sub subscriber
 * 3. BullMQ connection options
 *
 * In test mode (NODE_ENV === 'test'), provides a seamless in-memory fallback
 * using ioredis-mock when an external Redis server is not reachable.
 */
class RedisService {
  private defaultClient: Redis | null = null;
  private subscriberClient: Redis | null = null;
  private isShuttingDown = false;
  private isMockActive = false;

  public getRedisOptions(): RedisOptions {
    if (config.redisUrl) {
      return {
        retryStrategy: (times: number) => {
          if (this.isShuttingDown) return null;
          if (times > 10) {
            console.warn(`[Redis] Max reconnection attempts (10) reached for ${config.redisUrl}`);
            return null;
          }
          return Math.min(times * 200, 3000);
        },
        maxRetriesPerRequest: null, // Required by BullMQ
        enableReadyCheck: false,
      };
    }

    return {
      host: config.redisHost,
      port: config.redisPort,
      password: config.redisPassword,
      tls: config.redisTls ? {} : undefined,
      retryStrategy: (times: number) => {
        if (this.isShuttingDown) return null;
        if (times > 10) {
          console.warn(`[Redis] Max reconnection attempts (10) reached for ${config.redisHost}:${config.redisPort}`);
          return null;
        }
        return Math.min(times * 200, 3000);
      },
      maxRetriesPerRequest: null, // Required by BullMQ
      enableReadyCheck: false,
    };
  }

  /**
   * Creates a new isolated Redis client instance.
   * Useful when BullMQ or Socket.IO adapter requires duplicate dedicated connections.
   */
  public createClient(purpose: string = 'general'): Redis {
    // If in test mode and mock is active, return an in-memory mock client
    if (config.nodeEnv === 'test') {
      try {
        const IORedisMock = require('ioredis-mock');
        this.isMockActive = true;
        const mock = new IORedisMock();
        return mock;
      } catch (err) {
        console.warn('[Redis] ioredis-mock not available, falling back to standard client');
      }
    }

    const options = this.getRedisOptions();
    const client = config.redisUrl ? new Redis(config.redisUrl, options) : new Redis(options);

    client.on('error', (err) => {
      // Avoid unhandled rejection crashing the process if Redis is temporarily offline in dev
      if (!this.isShuttingDown && config.nodeEnv !== 'test') {
        console.error(`[Redis Error][${purpose}]:`, err.message);
      }
    });

    client.on('connect', () => {
      if (config.nodeEnv !== 'test') {
        console.log(`[Redis Connected][${purpose}] successfully.`);
      }
    });

    return client;
  }

  /**
   * Returns the shared producer client for general Redis commands (caching, publish, etc.).
   */
  public getClient(): Redis {
    if (!this.defaultClient) {
      this.defaultClient = this.createClient('producer');
    }
    return this.defaultClient;
  }

  public getRedisClient(): Redis {
    return this.getClient();
  }

  /**
   * Returns the dedicated subscriber client for Pub/Sub events.
   * Note: Dedicated subscriber connection cannot issue non-Pub/Sub commands.
   */
  public getSubscriberClient(): Redis {
    if (!this.subscriberClient) {
      this.subscriberClient = this.createClient('subscriber');
    }
    return this.subscriberClient;
  }

  public getRedisSubscriberClient(): Redis {
    return this.getSubscriberClient();
  }

  /**
   * Returns BullMQ-compatible connection options.
   */
  public getBullMQConnection(): Redis | RedisOptions {
    if (config.nodeEnv === 'test') {
      try {
        const IORedisMock = require('ioredis-mock');
        this.isMockActive = true;
        return new IORedisMock();
      } catch {
        // fallback
      }
    }

    return this.getRedisOptions();
  }

  /**
   * Health check for Redis connectivity and latency monitoring.
   */
  public async checkRedisHealth(): Promise<RedisHealthStatus> {
    const client = this.getClient();
    const start = Date.now();

    try {
      const pong = await client.ping();
      const latencyMs = Date.now() - start;

      if (pong === 'PONG') {
        let uptimeSeconds: number | undefined;
        let connectedClients: number | undefined;

        try {
          const info = await client.info();
          const uptimeMatch = info.match(/uptime_in_seconds:(\d+)/);
          if (uptimeMatch) uptimeSeconds = parseInt(uptimeMatch[1], 10);
          const clientsMatch = info.match(/connected_clients:(\d+)/);
          if (clientsMatch) connectedClients = parseInt(clientsMatch[1], 10);
        } catch {
          // info might not be available in mocks
        }

        return {
          status: 'healthy',
          latencyMs,
          mode: this.isMockActive || config.nodeEnv === 'test' ? 'mock' : 'real',
          uptimeSeconds,
          connectedClients,
        };
      }

      return {
        status: 'degraded',
        latencyMs,
        mode: this.isMockActive || config.nodeEnv === 'test' ? 'mock' : 'real',
        error: `Unexpected ping response: ${pong}`,
      };
    } catch (err: any) {
      return {
        status: 'unavailable',
        mode: this.isMockActive || config.nodeEnv === 'test' ? 'mock' : 'real',
        error: err?.message || 'Redis connection failed',
      };
    }
  }

  /**
   * Graceful shutdown of all active Redis clients.
   */
  public async closeRedisConnections(): Promise<void> {
    this.isShuttingDown = true;
    const promises: Promise<any>[] = [];

    if (this.defaultClient) {
      promises.push(
        this.defaultClient.quit().catch(() => {
          this.defaultClient?.disconnect();
        })
      );
      this.defaultClient = null;
    }

    if (this.subscriberClient) {
      promises.push(
        this.subscriberClient.quit().catch(() => {
          this.subscriberClient?.disconnect();
        })
      );
      this.subscriberClient = null;
    }

    await Promise.allSettled(promises);
    this.isShuttingDown = false;
  }
}

export const redisService = new RedisService();
