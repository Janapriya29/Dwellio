import { Router } from 'express';
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../controllers/notification';
import { streamNotifications } from '../controllers/notificationStream';
import { requireAuth } from '../middleware/auth';
import { notificationRateLimiter } from '../middleware/rateLimiter';

export const notificationRouter = Router();

// Real-time Server-Sent Events (SSE) notification stream
notificationRouter.get('/notifications/stream', requireAuth, streamNotifications);

// All notification endpoints require authenticated session and are protected by notification rate limiter
notificationRouter.get('/notifications', requireAuth, notificationRateLimiter, listNotifications);
notificationRouter.get('/notifications/unread-count', requireAuth, notificationRateLimiter, getUnreadNotificationCount);
notificationRouter.patch('/notifications/:id/read', requireAuth, notificationRateLimiter, markNotificationAsRead);
notificationRouter.patch('/notifications/read-all', requireAuth, notificationRateLimiter, markAllNotificationsAsRead);
