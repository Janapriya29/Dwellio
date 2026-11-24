import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { ConversationStatus } from '@dwellio/shared';

export interface IConversation extends Document {
  bookingId: Types.ObjectId;
  customerId: Types.ObjectId;
  providerId: Types.ObjectId;
  status: ConversationStatus;
  lastMessageId?: Types.ObjectId;
  lastMessageAt?: Date;
  unreadCountCustomer: number;
  unreadCountProvider: number;
  lockedAt?: Date;
  lockReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking ID is required'],
      unique: true,
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer ID is required'],
      index: true,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Provider ID is required'],
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'archived', 'locked'],
      default: 'active',
      index: true,
    },
    lastMessageId: {
      type: Schema.Types.ObjectId,
      ref: 'Message',
    },
    lastMessageAt: {
      type: Date,
    },
    unreadCountCustomer: {
      type: Number,
      default: 0,
      min: 0,
    },
    unreadCountProvider: {
      type: Number,
      default: 0,
      min: 0,
    },
    lockedAt: {
      type: Date,
    },
    lockReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.index({ customerId: 1, status: 1 });
conversationSchema.index({ providerId: 1, status: 1 });
conversationSchema.index({ updatedAt: -1 });

export const Conversation: Model<IConversation> =
  mongoose.models.Conversation || mongoose.model<IConversation>('Conversation', conversationSchema);
