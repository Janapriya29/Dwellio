import { Response } from 'express';
import { NotificationData } from '@dwellio/shared';
import { redisService } from './redisService';
import { config } from '../config/env';

const MAX_CONNECTIONS_PER_USER = 10;
const HEARTBEAT_INTERVAL_MS = 25000; // 25 seconds
const SSE_PUBSUB_CHANNEL = 'dwellio:notifications:stream';

/**
 * Service to manage Server-Sent Events (SSE) connections for live notifications.
 *
 * Maintains an in-memory registry of active client responses partitioned by userId,
 * and uses Redis Pub/Sub to broadcast notifications across horizontal API replicas
 * and background workers.
 */
class NotificationStreamService {
  private activeConnections: Map<string, Set<Response>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  public instanceId: string = 'sse_' + Math.random().toString(36).substring(2, 10);
  private isSubscribed = false;

  constructor() {
    this.startHeartbeat();
    this.initRedisPubSub();
  }

  /**
   * Initializes Redis Pub/Sub subscription for horizontal cross-instance SSE broadcasting.
   */
  public initRedisPubSub(): void {
    if (this.isSubscribed) return;

    try {
      const sub = redisService.getSubscriberClient();
      if (!sub) return;

      sub.subscribe(SSE_PUBSUB_CHANNEL, (err) => {
        if (err && config.nodeEnv !== 'test') {
          console.warn('[NotificationStream] SSE Redis Pub/Sub subscription warning:', err.message);
        } else {
          this.isSubscribed = true;
        }
      });

      sub.on('message', (channel, message) => {
        if (channel === SSE_PUBSUB_CHANNEL) {
          this.handleRemoteMessage(message);
        }
      });
    } catch (err: any) {
      if (config.nodeEnv !== 'test') {
        console.warn('[NotificationStream] Redis Pub/Sub unavailable, falling back to process-local SSE:', err.message);
      }
    }
  }

  /**
   * Internal handler for incoming messages from Redis Pub/Sub channel.
   * Avoids duplicate broadcasts to local clients that already received the local broadcast.
   */
  public handleRemoteMessage(rawPayload: string): boolean {
    try {
      const payload = JSON.parse(rawPayload);
      if (payload && payload.userId && payload.notification) {
        // Prevent duplicate broadcast if originated from this local instance
        if (payload.originId === this.instanceId) {
          return false;
        }
        this.broadcastLocally(payload.userId, payload.notification);
        return true;
      }
    } catch {
      // Safe isolation: ignore malformed remote messages
    }
    return false;
  }

  /**
   * Starts periodic heartbeat pings (:ping\n\n) to keep connections alive through proxies.
   */
  public startHeartbeat(): void {
    if (this.heartbeatInterval) return;

    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);

    // Unref so the timer does not keep the Node process running if all other work finishes
    if (this.heartbeatInterval && typeof this.heartbeatInterval.unref === 'function') {
      this.heartbeatInterval.unref();
    }
  }

  /**
   * Stop heartbeat timer.
   */
  public stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Register a new client response for a user.
   * Returns true if registered successfully, or false if user reached MAX_CONNECTIONS_PER_USER.
   */
  public addClient(userId: string, res: Response): boolean {
    if (!userId || !res) return false;

    let userConns = this.activeConnections.get(userId);
    if (!userConns) {
      userConns = new Set<Response>();
      this.activeConnections.set(userId, userConns);
    }

    if (userConns.size >= MAX_CONNECTIONS_PER_USER) {
      return false;
    }

    userConns.add(res);
    return true;
  }

  /**
   * Unregister an existing client response.
   * Idempotent; deletes user key when all connections close.
   */
  public removeClient(userId: string, res: Response): void {
    if (!userId || !res) return;

    const userConns = this.activeConnections.get(userId);
    if (userConns) {
      userConns.delete(res);
      if (userConns.size === 0) {
        this.activeConnections.delete(userId);
      }
    }
  }

  /**
   * Broadcast a notification to all active connections belonging to a user.
   * 1. Broadcasts to connections hosted on this local instance.
   * 2. Publishes to Redis Pub/Sub channel so peer instances can deliver to their local connections.
   */
  public broadcastToUser(userId: string, notification: NotificationData): void {
    if (!userId || !notification) return;

    // 1. Deliver to local connections immediately
    this.broadcastLocally(userId, notification);

    // 2. Publish to Redis Pub/Sub for peer instances
    try {
      const pubClient = redisService.getClient();
      if (pubClient) {
        pubClient.publish(
          SSE_PUBSUB_CHANNEL,
          JSON.stringify({
            originId: this.instanceId,
            userId,
            notification,
          })
        ).catch(() => {});
      }
    } catch {
      // Best-effort: failures to publish must not crash the process or rollback notifications
    }
  }

  /**
   * Writes the SSE event payload directly to all local connections for a user.
   */
  public broadcastLocally(userId: string, notification: NotificationData): number {
    const userConns = this.activeConnections.get(userId);
    if (!userConns || userConns.size === 0) return 0;

    const eventPayload = `id: ${notification.id}\nevent: notification\ndata: ${JSON.stringify(notification)}\n\n`;
    let deliveredCount = 0;

    for (const res of userConns) {
      try {
        if (res.writable && !res.writableEnded) {
          res.write(eventPayload);
          deliveredCount++;
        } else {
          // Dead connection cleanup
          this.removeClient(userId, res);
        }
      } catch {
        // Safe isolation: write failure to one client must not affect others
        this.removeClient(userId, res);
      }
    }

    return deliveredCount;
  }

  /**
   * Emits a comment heartbeat across all active connections.
   */
  public sendHeartbeat(): void {
    for (const [userId, conns] of this.activeConnections.entries()) {
      for (const res of conns) {
        try {
          if (res.writable && !res.writableEnded) {
            res.write(':ping\n\n');
          } else {
            this.removeClient(userId, res);
          }
        } catch {
          this.removeClient(userId, res);
        }
      }
    }
  }

  /**
   * Get active connection count for a specific user.
   */
  public getConnectionCountForUser(userId: string): number {
    return this.activeConnections.get(userId)?.size || 0;
  }

  /**
   * Get total active connection count across all users.
   */
  public getTotalConnectionCount(): number {
    let total = 0;
    for (const conns of this.activeConnections.values()) {
      total += conns.size;
    }
    return total;
  }

  /**
   * Graceful shutdown: closes all active streams with an SSE shutdown notice.
   */
  public closeAllClients(): void {
    this.stopHeartbeat();

    for (const [userId, conns] of this.activeConnections.entries()) {
      for (const res of conns) {
        try {
          if (res.writable && !res.writableEnded) {
            res.write(':app-shutdown\n\n');
            res.end();
          }
        } catch {
          // ignore error on shutdown
        }
      }
    }

    this.activeConnections.clear();
  }
}

export const notificationStreamService = new NotificationStreamService();
