import { Router } from 'express';
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../controllers/notification';
import { requireAuth } from '../middleware/auth';
import { notificationRateLimiter } from '../middleware/rateLimiter';

export const notificationRouter = Router();

// All notification endpoints require authenticated session and are protected by notification rate limiter
notificationRouter.get('/notifications', requireAuth, notificationRateLimiter, listNotifications);
notificationRouter.get('/notifications/unread-count', requireAuth, notificationRateLimiter, getUnreadNotificationCount);
notificationRouter.patch('/notifications/:id/read', requireAuth, notificationRateLimiter, markNotificationAsRead);
notificationRouter.patch('/notifications/read-all', requireAuth, notificationRateLimiter, markAllNotificationsAsRead);
