import { Types } from 'mongoose';
import { NotificationData, NotificationType } from '@dwellio/shared';
import { Notification, INotification } from '../models/Notification';
import { notificationStreamService } from '../services/notificationStream';

export interface CreateNotificationInput {
  recipientId: Types.ObjectId | string;
  type: NotificationType;
  title: string;
  message: string;
  bookingId?: Types.ObjectId | string;
  dedupKey?: string;
}

/**
 * Serialize a Mongoose Notification document into a safe public DTO.
 * Guarantees no Mongoose internal fields, passwords, or private data are leaked.
 */
export const formatNotificationDto = (notification: INotification): NotificationData => {
  return {
    id: notification._id.toString(),
    recipientId: notification.recipientId.toString(),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    bookingId: notification.bookingId ? notification.bookingId.toString() : undefined,
    isRead: Boolean(notification.isRead),
    readAt: notification.readAt ? notification.readAt.toISOString() : undefined,
    createdAt: notification.createdAt ? notification.createdAt.toISOString() : new Date().toISOString(),
  };
};

/**
 * Send an in-app notification in a non-blocking, best-effort manner.
 *
 * Requirements:
 * - Must be called only AFTER the primary business operation has successfully committed.
 * - Handles duplicate key (E11000 on dedupKey index) cleanly as an idempotent delivery without throwing.
 * - Catches any persistence errors and logs structured non-sensitive diagnostics.
 * - Prevents notification insertion failures from failing or rolling back the business operation.
 * - Note: This operates on a best-effort basis for the standalone MongoDB environment;
 *   unrelated persistence errors are logged and not retried automatically.
 */
export const sendInAppNotification = async (
  input: CreateNotificationInput
): Promise<INotification | null> => {
  try {
    const notification = new Notification({
      recipientId:
        typeof input.recipientId === 'string'
          ? new Types.ObjectId(input.recipientId)
          : input.recipientId,
      type: input.type,
      title: input.title.trim().slice(0, 120),
      message: input.message.trim().slice(0, 500),
      bookingId: input.bookingId
        ? typeof input.bookingId === 'string'
          ? new Types.ObjectId(input.bookingId)
          : input.bookingId
        : undefined,
      dedupKey: input.dedupKey ? input.dedupKey.trim() : undefined,
    });

    const saved = await notification.save();

    // Broadcast in real-time to active SSE streams (non-blocking)
    try {
      const dto = formatNotificationDto(saved);
      notificationStreamService.broadcastToUser(saved.recipientId.toString(), dto);
    } catch (streamErr) {
      // Do not allow stream broadcast failure to affect notification persistence
      console.warn('[NotificationService] SSE broadcast error:', streamErr);
    }

    return saved;
  } catch (error: any) {
    // If MongoDB confirms a duplicate key error on the deduplication index (code 11000),
    // this is a confirmed duplicate event and is handled idempotently without throwing.
    if (error && error.code === 11000) {
      return null;
    }

    // Log structured diagnostic context without any sensitive data
    console.error('[NotificationService] Best-effort delivery error:', {
      type: input.type,
      recipientId: typeof input.recipientId === 'string' ? input.recipientId : input.recipientId.toString(),
      bookingId: input.bookingId ? input.bookingId.toString() : undefined,
      dedupKey: input.dedupKey,
      errorCode: error?.code,
      errorMessage: error?.message,
    });

    // Do not throw: preserve the success of the primary business transaction
    return null;
  }
};
