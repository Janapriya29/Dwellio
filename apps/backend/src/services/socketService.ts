import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  MessageData,
  ConversationData,
  ClientToServerEvents,
  ServerToClientEvents,
  MessageSenderRole,
} from '@dwellio/shared';
import { config } from '../config/env';
import { verifyAuthToken } from '../utils/auth';
import { redisService } from './redisService';
import { User } from '../models/User';
import { Booking } from '../models/Booking';
import { ProviderProfile } from '../models/ProviderProfile';
import { Conversation, IConversation } from '../models/Conversation';
import { Message, IMessage } from '../models/Message';
import { checkChatRateLimit } from './chatRateLimiter';

interface AuthenticatedSocketData {
  userId: string;
  role: MessageSenderRole;
  name: string;
}

export class SocketService {
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, AuthenticatedSocketData> | null = null;

  public init(server: HttpServer): SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, AuthenticatedSocketData> {
    this.io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, AuthenticatedSocketData>(server, {
      cors: {
        origin: config.clientUrl || '*',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 30000,
      pingInterval: 25000,
    });

    // Attempt Redis adapter attachment for multi-node horizontal scale
    try {
      const pubClient = redisService.getRedisClient();
      const subClient = redisService.getRedisSubscriberClient();
      if (pubClient && subClient && config.redisEnabled) {
        this.io.adapter(createAdapter(pubClient, subClient));
        console.log('[SocketService] Socket.IO Redis Adapter configured successfully.');
      }
    } catch (err: any) {
      console.warn('[SocketService] Redis adapter setup skipped, using in-memory adapter:', err?.message || err);
    }

    // Handshake Authentication Middleware
    this.io.use(async (socket, next) => {
      try {
        let token = socket.handshake.auth?.token;
        if (!token && socket.handshake.headers?.authorization) {
          const authHeader = socket.handshake.headers.authorization;
          if (authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
          } else {
            token = authHeader;
          }
        }

        if (!token) {
          return next(new Error('Authentication required: Token missing in handshake'));
        }

        const decoded = verifyAuthToken(token);
        if (!decoded || !decoded.userId) {
          return next(new Error('Authentication failed: Invalid token payload'));
        }

        const user = await User.findById(decoded.userId).lean();
        if (!user || !user.isActive) {
          return next(new Error('Authentication failed: User account inactive or not found'));
        }

        socket.data = {
          userId: user._id.toString(),
          role: user.role as MessageSenderRole,
          name: user.name,
        };

        return next();
      } catch (err: any) {
        return next(new Error(`Authentication error: ${err.message || 'Token verification failed'}`));
      }
    });

    this.setupConnectionHandlers();
    return this.io;
  }

  private async isAuthorizedParticipant(bookingId: string, userId: string, role: MessageSenderRole): Promise<boolean> {
    if (!bookingId) return false;
    try {
      const booking = await Booking.findById(bookingId).select('customerId providerId providerUserId status').lean();
      if (!booking) return false;

      let providerUserId = booking.providerUserId ? booking.providerUserId.toString() : '';
      if (!providerUserId && booking.providerId) {
        const providerProfile = await ProviderProfile.findById(booking.providerId).select('userId').lean();
        if (providerProfile) {
          providerUserId = providerProfile.userId.toString();
        }
      }

      const isCustomer = booking.customerId.toString() === userId;
      const isProvider = providerUserId === userId;
      const isAdmin = role === 'admin';

      return isCustomer || isProvider || isAdmin;
    } catch {
      return false;
    }
  }

  private setupConnectionHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, AuthenticatedSocketData>) => {
      const { userId, role, name } = socket.data;

      // Join individual user room for private events
      socket.join(`user:${userId}`);

      // 1. Join Booking Chat Room
      socket.on('join_booking', async ({ bookingId }: { bookingId: string }) => {
        try {
          if (!bookingId) return;

          const booking = await Booking.findById(bookingId).lean();
          if (!booking) {
            socket.emit('error', { message: 'Booking not found' });
            return;
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
          const isAdmin = role === 'admin';

          if (!isCustomer && !isProvider && !isAdmin) {
            socket.emit('error', { message: 'Unauthorized to join this booking conversation' });
            return;
          }

          socket.join(`booking:${bookingId}`);
        } catch (err: any) {
          socket.emit('error', { message: err?.message || 'Failed to join booking room' });
        }
      });

      // 2. Leave Booking Chat Room
      socket.on('leave_booking', ({ bookingId }: { bookingId: string }) => {
        if (bookingId) {
          socket.leave(`booking:${bookingId}`);
        }
      });

      // 3. Typing Indicators
      socket.on('typing_start', async ({ bookingId }: { bookingId: string }) => {
        if (!bookingId) return;
        const authorized = await this.isAuthorizedParticipant(bookingId, userId, role);
        if (!authorized) {
          socket.emit('error', { message: 'Unauthorized for this booking conversation' });
          return;
        }

        socket.to(`booking:${bookingId}`).emit('user_typing', {
          bookingId,
          userId,
          role,
        });
      });

      socket.on('typing_stop', async ({ bookingId }: { bookingId: string }) => {
        if (!bookingId) return;
        const authorized = await this.isAuthorizedParticipant(bookingId, userId, role);
        if (!authorized) {
          socket.emit('error', { message: 'Unauthorized for this booking conversation' });
          return;
        }

        socket.to(`booking:${bookingId}`).emit('user_stopped_typing', {
          bookingId,
          userId,
        });
      });

      // 4. Send Message via Socket
      socket.on('send_message', async ({ bookingId, content }: { bookingId: string; content: string }) => {
        try {
          if (!bookingId || !content || !content.trim()) {
            socket.emit('error', { message: 'Message content cannot be empty' });
            return;
          }

          const trimmed = content.trim();
          if (trimmed.length > 2000) {
            socket.emit('error', { message: 'Message content cannot exceed 2000 characters' });
            return;
          }

          // Enforce shared chat rate limit (30 messages per minute)
          const rateLimit = await checkChatRateLimit(userId);
          if (!rateLimit.allowed) {
            socket.emit('error', {
              message: 'Rate limit exceeded: You can send at most 30 messages per minute. Please wait.',
            });
            return;
          }

          const booking = await Booking.findById(bookingId);
          if (!booking) {
            socket.emit('error', { message: 'Booking not found' });
            return;
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
          const isAdmin = role === 'admin';

          if (!isCustomer && !isProvider && !isAdmin) {
            socket.emit('error', { message: 'Unauthorized to post messages to this booking' });
            return;
          }

          // Fetch or initialize conversation
          let conversation = await Conversation.findOne({ bookingId: booking._id });
          if (!conversation) {
            conversation = await Conversation.create({
              bookingId: booking._id,
              customerId: booking.customerId,
              providerId: providerUserId,
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
            socket.emit('error', { message: 'Conversation is locked for completed, cancelled, or rejected bookings' });
            return;
          }

          // Determine recipient
          const recipientId = isCustomer ? providerUserId : booking.customerId.toString();

          const messageDoc = await Message.create({
            conversationId: conversation._id,
            bookingId: booking._id,
            senderId: userId,
            senderRole: role,
            recipientId: recipientId || undefined,
            content: trimmed,
            readAt: null,
          });

          // Update conversation counters & last message
          conversation.lastMessageId = messageDoc._id;
          conversation.lastMessageAt = messageDoc.createdAt;
          if (isCustomer) {
            conversation.unreadCountProvider += 1;
          } else {
            conversation.unreadCountCustomer += 1;
          }
          await conversation.save();

          const formattedMessage: MessageData = {
            id: messageDoc._id.toString(),
            conversationId: conversation._id.toString(),
            bookingId: booking._id.toString(),
            sender: {
              id: userId,
              name,
              role,
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

          // Emit to room (including sender)
          this.io?.to(`booking:${bookingId}`).emit('new_message', formattedMessage);
        } catch (err: any) {
          socket.emit('error', { message: err?.message || 'Failed to send message' });
        }
      });

      // 5. Mark Messages Read via Socket
      socket.on('mark_read', async ({ bookingId }: { bookingId: string }) => {
        try {
          if (!bookingId) return;

          const authorized = await this.isAuthorizedParticipant(bookingId, userId, role);
          if (!authorized) {
            socket.emit('error', { message: 'Unauthorized for this booking conversation' });
            return;
          }

          const conversation = await Conversation.findOne({ bookingId });
          if (!conversation) return;

          const readAtDate = new Date();
          await Message.updateMany(
            {
              conversationId: conversation._id,
              recipientId: userId,
              readAt: null,
            },
            {
              $set: { readAt: readAtDate },
            }
          );

          if (conversation.customerId.toString() === userId) {
            conversation.unreadCountCustomer = 0;
          } else if (conversation.providerId.toString() === userId) {
            conversation.unreadCountProvider = 0;
          }
          await conversation.save();

          this.io?.to(`booking:${bookingId}`).emit('messages_read', {
            bookingId,
            readBy: userId,
            readAt: readAtDate.toISOString(),
          });
        } catch (err: any) {
          socket.emit('error', { message: err?.message || 'Failed to mark messages as read' });
        }
      });
    });
  }

  public emitToBooking(bookingId: string, event: keyof ServerToClientEvents, payload: any): void {
    if (this.io) {
      this.io.to(`booking:${bookingId}`).emit(event as any, payload);
    }
  }

  public emitToUser(userId: string, event: keyof ServerToClientEvents, payload: any): void {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event as any, payload);
    }
  }

  public getIO(): SocketIOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, AuthenticatedSocketData> | null {
    return this.io;
  }

  public async close(): Promise<void> {
    if (this.io) {
      await new Promise<void>((resolve) => {
        this.io?.close(() => resolve());
      });
      this.io = null;
    }
  }
}

export const socketService = new SocketService();
