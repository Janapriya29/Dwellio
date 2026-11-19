import { Response } from 'express';
import { NotificationData } from '@dwellio/shared';

const MAX_CONNECTIONS_PER_USER = 10;
const HEARTBEAT_INTERVAL_MS = 25000; // 25 seconds

/**
 * Service to manage Server-Sent Events (SSE) connections for live notifications.
 *
 * Maintains an in-memory registry of active client responses partitioned by userId.
 * Note: For multi-container / horizontal cluster scale, an external event broker
 * (e.g. Redis Pub/Sub) would back this service.
 */
class NotificationStreamService {
  private activeConnections: Map<string, Set<Response>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
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
   */
  public broadcastToUser(userId: string, notification: NotificationData): void {
    if (!userId || !notification) return;

    const userConns = this.activeConnections.get(userId);
    if (!userConns || userConns.size === 0) return;

    const eventPayload = `id: ${notification.id}\nevent: notification\ndata: ${JSON.stringify(notification)}\n\n`;

    for (const res of userConns) {
      try {
        if (res.writable && !res.writableEnded) {
          res.write(eventPayload);
        } else {
          // Dead connection cleanup
          this.removeClient(userId, res);
        }
      } catch (err) {
        // Safe isolation: write failure to one client must not affect others
        this.removeClient(userId, res);
      }
    }
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
