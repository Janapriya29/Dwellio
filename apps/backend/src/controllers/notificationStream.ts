import { Request, Response } from 'express';
import { notificationStreamService } from '../services/notificationStream';

/**
 * Server-Sent Events (SSE) Stream for real-time in-app notifications
 * GET /api/notifications/stream
 */
export const streamNotifications = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required for notification stream.' });
    return;
  }

  const userId = req.user._id.toString();

  // Set mandatory SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Suppresses reverse-proxy buffering in Nginx
  });

  if (typeof (res as any).flushHeaders === 'function') {
    (res as any).flushHeaders();
  }

  // Register with stream service
  const registered = notificationStreamService.addClient(userId, res);
  if (!registered) {
    res.write(':error Maximum concurrent stream connections reached (10)\n\n');
    res.end();
    return;
  }

  // Initial handshake comment to confirm stream is active
  res.write(':connected\n\n');

  // Idempotent teardown on connection termination
  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    notificationStreamService.removeClient(userId, res);
  };

  res.on('close', cleanup);
  res.on('finish', cleanup);
  res.on('error', cleanup);
};
