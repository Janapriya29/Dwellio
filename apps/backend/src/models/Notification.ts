import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { NotificationType } from '@dwellio/shared';

export interface INotification extends Document {
  recipientId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  bookingId?: Types.ObjectId;
  isRead: boolean;
  readAt?: Date;
  dedupKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Recipient ID is required'],
      index: true,
    },
    type: {
      type: String,
      required: [true, 'Notification type is required'],
      enum: [
        'BOOKING_REQUESTED',
        'BOOKING_ACCEPTED',
        'BOOKING_REJECTED',
        'BOOKING_ON_THE_WAY',
        'BOOKING_IN_PROGRESS',
        'BOOKING_COMPLETED',
        'BOOKING_CANCELLED',
        'BOOKING_RESCHEDULED',
        'REVIEW_RECEIVED',
        'REVIEW_REPLIED',
        'APPLICATION_APPROVED',
        'APPLICATION_REJECTED',
        'SYSTEM_ANNOUNCEMENT',
        'DISPUTE_RAISED',
        'DISPUTE_RESOLVED',
        'BOOKING_ADMIN_CANCELLED',
        'ACCOUNT_SUSPENDED',
        'PAYMENT_REQUIRED',
        'PAYMENT_SUCCESS',
        'PAYMENT_FAILED',
        'PAYMENT_EXPIRED',
        'REFUND_INITIATED',
        'REFUND_COMPLETED',
        'REFUND_FAILED',
        'PAYOUT_BATCH_GENERATED',
        'PAYOUT_SETTLED',
        'BOOKING_REMINDER',
        'NEW_MESSAGE',
      ],
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
      minlength: [1, 'Title cannot be empty'],
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
      minlength: [1, 'Message cannot be empty'],
      maxlength: [500, 'Message cannot exceed 500 characters'],
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: false,
    },
    isRead: {
      type: Boolean,
      default: false,
      required: true,
    },
    readAt: {
      type: Date,
      required: false,
    },
    dedupKey: {
      type: String,
      trim: true,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// 1. Recipient pagination index (newest first)
notificationSchema.index({ recipientId: 1, createdAt: -1 });

// 2. Recipient unread count and bulk status updates index
notificationSchema.index({ recipientId: 1, isRead: 1 });

// 3. Unique sparse deduplication key index
notificationSchema.index({ dedupKey: 1 }, { unique: true, sparse: true });

export const Notification: Model<INotification> =
  mongoose.models.Notification ||
  mongoose.model<INotification>('Notification', notificationSchema);
