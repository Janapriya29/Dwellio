import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { MessageSenderRole } from '@dwellio/shared';

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  bookingId: Types.ObjectId;
  senderId: Types.ObjectId;
  senderRole: MessageSenderRole;
  recipientId?: Types.ObjectId;
  content: string;
  readAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: [true, 'Conversation ID is required'],
      index: true,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking ID is required'],
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Sender ID is required'],
      index: true,
    },
    senderRole: {
      type: String,
      enum: ['customer', 'provider', 'admin', 'system'],
      required: [true, 'Sender role is required'],
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    content: {
      type: String,
      required: [true, 'Message content cannot be empty'],
      trim: true,
      maxlength: [2000, 'Message content cannot exceed 2000 characters'],
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ bookingId: 1, createdAt: 1 });
messageSchema.index({ recipientId: 1, readAt: 1 });

export const Message: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>('Message', messageSchema);
