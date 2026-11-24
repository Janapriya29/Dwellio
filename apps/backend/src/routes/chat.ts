import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  getBookingMessages,
  sendBookingMessage,
  markMessagesRead,
  getUnreadCount,
} from '../controllers/chatController';

export const chatRouter = Router();

// Chat & Real-Time Messaging Endpoints (Phase 5B)
chatRouter.get('/bookings/:bookingId/messages', requireAuth, getBookingMessages);
chatRouter.post('/bookings/:bookingId/messages', requireAuth, sendBookingMessage);
chatRouter.patch('/bookings/:bookingId/messages/read', requireAuth, markMessagesRead);
chatRouter.get('/conversations/unread-count', requireAuth, getUnreadCount);
