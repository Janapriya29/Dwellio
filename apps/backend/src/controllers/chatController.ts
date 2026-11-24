import { Request, Response } from 'express';
import { Types } from 'mongoose';
import {
  ApiResponse,
  ConversationData,
  MessageData,
  UnreadCountResponseData,
  BookingMessagesResponseData,
} from '@dwellio/shared';
import { Booking } from '../models/Booking';
import { ProviderProfile } from '../models/ProviderProfile';
import { Conversation, IConversation } from '../models/Conversation';
import { Message, IMessage } from '../models/Message';
import { User } from '../models/User';
import { socketService } from '../services/socketService';
import { checkChatRateLimit } from '../services/chatRateLimiter';

type AccessResult =
  | { error: string; status: number }
  | {
      booking: any;
      isCustomer: boolean;
      isProvider: boolean;
      isAdmin: boolean;
      providerUserId: string;
      customerId: string;
    };

/**
 * Helper to resolve whether a user has access to a booking's conversation
 */
const resolveBookingAccess = async (bookingId: string, userId: string, userRole: string): Promise<AccessResult> => {
  if (!bookingId || !Types.ObjectId.isValid(bookingId)) {
    return { error: 'Invalid booking ID format', status: 400 };
  }

  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return { error: 'Booking not found', status: 404 };
  }

  let providerUserId = booking.providerUserId ? booking.providerUserId.toString() : '';
  if (!providerUserId && booking.providerId) {
    const providerProfile = await ProviderProfile.findById(booking.providerId).lean();
    if (providerProfile) {
      providerUserId = providerProfile.userId.toString();
    }
  }

  const isCustomer = booking.customerId.toString() === userId;
  const isProvider = providerUserId === userId;
  const isAdmin = userRole === 'admin';

  if (!isCustomer && !isProvider && !isAdmin) {
    return { error: 'Forbidden: You do not have permission to access messages for this booking', status: 403 };
  }

  return {
    booking,
    isCustomer,
    isProvider,
    isAdmin,
    providerUserId,
    customerId: booking.customerId.toString(),
  };
};

/**
 * Format conversation document for API response
 */
const formatConversationData = async (conv: any, bookingId: string): Promise<ConversationData> => {
  const [customerUser, providerUser, lastMsg] = await Promise.all([
    User.findById(conv.customerId).select('name').lean(),
    User.findById(conv.providerId).select('name').lean(),
    conv.lastMessageId ? Message.findById(conv.lastMessageId).populate('senderId', 'name').lean() : null,
  ]);

  let lastMessageFormatted: MessageData | undefined;
  if (lastMsg) {
    const sender = lastMsg.senderId as any;
    lastMessageFormatted = {
      id: lastMsg._id.toString(),
      conversationId: lastMsg.conversationId.toString(),
      bookingId: lastMsg.bookingId.toString(),
      sender: {
        id: sender?._id ? sender._id.toString() : lastMsg.senderId.toString(),
        name: sender?.name || 'User',
        role: lastMsg.senderRole,
      },
      content: lastMsg.content,
      readAt: lastMsg.readAt ? lastMsg.readAt.toISOString() : null,
      createdAt: lastMsg.createdAt.toISOString(),
    };
  }

  return {
    id: conv._id.toString(),
    bookingId,
    customer: {
      id: conv.customerId.toString(),
      name: customerUser?.name || 'Customer',
      role: 'customer',
    },
    provider: {
      id: conv.providerId.toString(),
      name: providerUser?.name || 'Provider',
      role: 'provider',
    },
    status: conv.status,
    lastMessage: lastMessageFormatted,
    unreadCountCustomer: conv.unreadCountCustomer || 0,
    unreadCountProvider: conv.unreadCountProvider || 0,
    createdAt: conv.createdAt.toISOString(),
    updatedAt: conv.updatedAt.toISOString(),
  };
};

/**
 * GET /api/bookings/:bookingId/messages
 * Retrieve conversation details and chat history
 */
export const getBookingMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const bookingId = (Array.isArray(req.params.bookingId) ? req.params.bookingId[0] : req.params.bookingId) as string;
    const user = req.user!;

    const access = await resolveBookingAccess(bookingId, user._id.toString(), user.role);
    if ('error' in access) {
      res.status(access.status).json({ success: false, message: access.error });
      return;
    }

    const { booking, customerId, providerUserId } = access;

    let conversation = await Conversation.findOne({ bookingId: booking._id });
    if (!conversation) {
      conversation = await Conversation.create({
        bookingId: booking._id,
        customerId: new Types.ObjectId(customerId),
        providerId: new Types.ObjectId(providerUserId || customerId),
        status: ['completed', 'cancelled', 'rejected'].includes(booking.status) ? 'locked' : 'active',
      });
    }

    // Pagination query parameters
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
    const before = req.query.before as string | undefined;

    const query: Record<string, unknown> = { bookingId: booking._id };
    if (before) {
      if (Types.ObjectId.isValid(before)) {
        query._id = { $lt: new Types.ObjectId(before) };
      } else {
        const beforeDate = new Date(before);
        if (!isNaN(beforeDate.getTime())) {
          query.createdAt = { $lt: beforeDate };
        }
      }
    }

    const totalMessages = await Message.countDocuments({ bookingId: booking._id });

    // Fetch up to limit + 1 in reverse chronological order
    const rawMessages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('senderId', 'name')
      .lean();

    const hasMore = rawMessages.length > limit;
    const messagesToReturn = hasMore ? rawMessages.slice(0, limit) : rawMessages;

    // Reverse to chronological order (oldest to newest)
    messagesToReturn.reverse();

    const formattedMessages: MessageData[] = messagesToReturn.map((m: any) => ({
      id: m._id.toString(),
      conversationId: m.conversationId.toString(),
      bookingId: m.bookingId.toString(),
      sender: {
        id: m.senderId?._id ? m.senderId._id.toString() : m.senderId.toString(),
        name: m.senderId?.name || (m.senderRole === 'system' ? 'System' : 'User'),
        role: m.senderRole,
      },
      recipient: m.recipientId
        ? {
            id: m.recipientId.toString(),
            role: m.senderRole === 'customer' ? 'provider' : 'customer',
          }
        : undefined,
      content: m.content,
      readAt: m.readAt ? m.readAt.toISOString() : null,
      createdAt: m.createdAt.toISOString(),
    }));

    const conversationData = await formatConversationData(conversation, bookingId);
    const nextCursor = messagesToReturn.length > 0 ? messagesToReturn[0]._id.toString() : undefined;

    const response: ApiResponse<BookingMessagesResponseData> = {
      success: true,
      message: 'Booking messages retrieved successfully',
      data: {
        conversation: conversationData,
        messages: formattedMessages,
        pagination: {
          total: totalMessages,
          limit,
          hasMore,
          nextCursor,
        },
      },
    };
    res.status(200).json(response);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * POST /api/bookings/:bookingId/messages
 * Post a new message to the booking conversation
 */
export const sendBookingMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const bookingId = (Array.isArray(req.params.bookingId) ? req.params.bookingId[0] : req.params.bookingId) as string;
    const { content } = req.body;
    const user = req.user!;

    if (!content || typeof content !== 'string' || !content.trim()) {
      res.status(400).json({ success: false, message: 'Message content cannot be empty' });
      return;
    }

    const trimmed = content.trim();
    if (trimmed.length > 2000) {
      res.status(400).json({ success: false, message: 'Message content cannot exceed 2000 characters' });
      return;
    }

    // Enforce shared chat rate limit (30 messages per minute)
    const rateLimit = await checkChatRateLimit(user._id.toString());
    if (!rateLimit.allowed) {
      res.status(429).json({
        success: false,
        message: 'Rate limit exceeded: You can send at most 30 messages per minute. Please wait.',
      });
      return;
    }

    const access = await resolveBookingAccess(bookingId, user._id.toString(), user.role);
    if ('error' in access) {
      res.status(access.status).json({ success: false, message: access.error });
      return;
    }

    const { booking, isCustomer, customerId, providerUserId } = access;

    let conversation = await Conversation.findOne({ bookingId: booking._id });
    if (!conversation) {
      conversation = await Conversation.create({
        bookingId: booking._id,
        customerId: new Types.ObjectId(customerId),
        providerId: new Types.ObjectId(providerUserId || customerId),
        status: ['completed', 'cancelled', 'rejected'].includes(booking.status) ? 'locked' : 'active',
      });
    }

    if (['completed', 'cancelled', 'rejected'].includes(booking.status) || conversation.status === 'locked') {
      if (conversation.status !== 'locked') {
        conversation.status = 'locked';
        conversation.lockedAt = new Date();
        conversation.lockReason = `Booking status is ${booking.status}`;
        await conversation.save().catch(() => {});
      }
      res.status(403).json({
        success: false,
        message: 'This conversation has been locked and no further messages can be sent',
      });
      return;
    }

    const recipientId = isCustomer ? providerUserId : customerId;

    const messageDoc = await Message.create({
      conversationId: conversation._id,
      bookingId: booking._id,
      senderId: user._id,
      senderRole: user.role,
      recipientId: recipientId ? new Types.ObjectId(recipientId) : undefined,
      content: trimmed,
      readAt: null,
    });

    conversation.lastMessageId = messageDoc._id;
    conversation.lastMessageAt = messageDoc.createdAt;
    if (isCustomer) {
      conversation.unreadCountProvider = (conversation.unreadCountProvider || 0) + 1;
    } else {
      conversation.unreadCountCustomer = (conversation.unreadCountCustomer || 0) + 1;
    }
    await conversation.save();

    const formattedMessage: MessageData = {
      id: messageDoc._id.toString(),
      conversationId: conversation._id.toString(),
      bookingId: booking._id.toString(),
      sender: {
        id: user._id.toString(),
        name: user.name,
        role: user.role as any,
      },
      recipient: recipientId
        ? {
            id: recipientId,
            role: isCustomer ? 'provider' : 'customer',
          }
        : undefined,
      content: trimmed,
      readAt: null,
      createdAt: messageDoc.createdAt.toISOString(),
    };

    // Broadcast to real-time room
    socketService.emitToBooking(bookingId, 'new_message', formattedMessage);

    const response: ApiResponse<{ message: MessageData }> = {
      success: true,
      message: 'Message sent successfully',
      data: {
        message: formattedMessage,
      },
    };
    res.status(201).json(response);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * PATCH /api/bookings/:bookingId/messages/read
 * Mark messages in this booking conversation as read by the current user
 */
export const markMessagesRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const bookingId = (Array.isArray(req.params.bookingId) ? req.params.bookingId[0] : req.params.bookingId) as string;
    const user = req.user!;

    const access = await resolveBookingAccess(bookingId, user._id.toString(), user.role);
    if ('error' in access) {
      res.status(access.status).json({ success: false, message: access.error });
      return;
    }

    const { booking, customerId } = access;
    const conversation = await Conversation.findOne({ bookingId: booking._id });
    if (!conversation) {
      res.status(200).json({ success: true, data: { markedCount: 0 } });
      return;
    }

    const now = new Date();
    const updateResult = await Message.updateMany(
      {
        conversationId: conversation._id,
        recipientId: user._id,
        readAt: null,
      },
      {
        $set: { readAt: now },
      }
    );

    const isCustomer = customerId === user._id.toString();
    if (isCustomer) {
      conversation.unreadCountCustomer = 0;
    } else {
      conversation.unreadCountProvider = 0;
    }
    await conversation.save();

    // Broadcast read receipt to room
    socketService.emitToBooking(bookingId, 'messages_read', {
      bookingId,
      readBy: user._id.toString(),
      readAt: now.toISOString(),
    });

    const response: ApiResponse<{ markedCount: number }> = {
      success: true,
      message: 'Messages marked as read',
      data: {
        markedCount: updateResult.modifiedCount || 0,
      },
    };
    res.status(200).json(response);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};

/**
 * GET /api/conversations/unread-count
 * Get unread messages count for the authenticated user across all conversations
 */
export const getUnreadCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.user!;
    const userId = user._id;

    let conversations: IConversation[] = [];
    if (user.role === 'customer') {
      conversations = await Conversation.find({
        customerId: userId,
        unreadCountCustomer: { $gt: 0 },
      }).lean();
    } else if (user.role === 'provider') {
      conversations = await Conversation.find({
        providerId: userId,
        unreadCountProvider: { $gt: 0 },
      }).lean();
    }

    let totalUnread = 0;
    const byBooking: Record<string, number> = {};

    for (const conv of conversations) {
      const count = user.role === 'customer' ? conv.unreadCountCustomer : conv.unreadCountProvider;
      if (count > 0) {
        totalUnread += count;
        byBooking[conv.bookingId.toString()] = count;
      }
    }

    const response: ApiResponse<UnreadCountResponseData> = {
      success: true,
      message: 'Unread counts retrieved',
      data: {
        totalUnread,
        byBooking,
      },
    };
    res.status(200).json(response);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || 'Internal server error' });
  }
};
