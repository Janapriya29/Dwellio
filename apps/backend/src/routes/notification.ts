import { Router } from 'express';
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../controllers/notification';
import { requireAuth } from '../middleware/auth';

export const notificationRouter = Router();

// All notification endpoints require authenticated session
notificationRouter.get('/notifications', requireAuth, listNotifications);
notificationRouter.get('/notifications/unread-count', requireAuth, getUnreadNotificationCount);
notificationRouter.patch('/notifications/:id/read', requireAuth, markNotificationAsRead);
notificationRouter.patch('/notifications/read-all', requireAuth, markAllNotificationsAsRead);
