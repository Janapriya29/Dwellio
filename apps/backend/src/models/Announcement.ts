import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { AnnouncementAudience, AnnouncementDeliveryStatus } from '@dwellio/shared';

export interface IAnnouncement extends Document {
  title: string;
  message: string;
  audience: AnnouncementAudience;
  createdByAdminId: Types.ObjectId;
  recipientCount: number;
  deliveredCount: number;
  failedCount: number;
  deliveryStatus: AnnouncementDeliveryStatus;
  deliveredUserIds: Types.ObjectId[];
  lastDeliveryError?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const announcementSchema = new Schema<IAnnouncement>(
  {
    title: {
      type: String,
      required: [true, 'Announcement title is required'],
      trim: true,
      minlength: [3, 'Title must be at least 3 characters long'],
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    message: {
      type: String,
      required: [true, 'Announcement message is required'],
      trim: true,
      minlength: [5, 'Message must be at least 5 characters long'],
      maxlength: [1000, 'Message cannot exceed 1000 characters'],
    },
    audience: {
      type: String,
      enum: ['all', 'customers', 'providers'],
      required: [true, 'Target audience is required'],
      index: true,
    },
    createdByAdminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Administrator ID is required'],
    },
    recipientCount: {
      type: Number,
      default: 0,
    },
    deliveredCount: {
      type: Number,
      default: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
    },
    deliveryStatus: {
      type: String,
      enum: ['pending', 'processing', 'delivered', 'partially_failed'],
      default: 'pending',
      index: true,
    },
    deliveredUserIds: {
      type: [Schema.Types.ObjectId],
      default: [],
    },
    lastDeliveryError: {
      type: String,
      trim: true,
    },
    expiresAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

announcementSchema.index({ createdAt: -1 });

export const Announcement: Model<IAnnouncement> =
  mongoose.models.Announcement || mongoose.model<IAnnouncement>('Announcement', announcementSchema);
