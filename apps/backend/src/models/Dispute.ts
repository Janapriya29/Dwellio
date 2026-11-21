import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { DisputeCategory, DisputeStatus } from '@dwellio/shared';

export interface IDispute extends Document {
  bookingId: Types.ObjectId;
  raisedByUserId: Types.ObjectId;
  raisedByRole: 'customer' | 'provider';
  raisedAgainstUserId: Types.ObjectId;
  raisedAgainstRole: 'customer' | 'provider';
  category: DisputeCategory;
  description: string;
  status: DisputeStatus;
  adminNotes?: string;
  resolutionReason?: string;
  resolvedByAdminId?: Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const disputeSchema = new Schema<IDispute>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking reference is required'],
      index: true,
    },
    raisedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Dispute initiator user ID is required'],
      index: true,
    },
    raisedByRole: {
      type: String,
      enum: ['customer', 'provider'],
      required: [true, 'Dispute initiator role is required'],
    },
    raisedAgainstUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Target user ID is required'],
    },
    raisedAgainstRole: {
      type: String,
      enum: ['customer', 'provider'],
      required: [true, 'Target role is required'],
    },
    category: {
      type: String,
      enum: [
        'service_quality',
        'no_show',
        'pricing_dispute',
        'damage_or_safety',
        'communication',
        'other',
      ],
      required: [true, 'Dispute category is required'],
    },
    description: {
      type: String,
      required: [true, 'Dispute description is required'],
      trim: true,
      minlength: [10, 'Description must be at least 10 characters long'],
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    status: {
      type: String,
      enum: ['open', 'under_review', 'resolved', 'rejected'],
      default: 'open',
      index: true,
    },
    adminNotes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Admin notes cannot exceed 2000 characters'],
    },
    resolutionReason: {
      type: String,
      trim: true,
      maxlength: [2000, 'Resolution reason cannot exceed 2000 characters'],
    },
    resolvedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for fast queries
disputeSchema.index({ bookingId: 1, status: 1 });
disputeSchema.index({ createdAt: -1 });

export const Dispute: Model<IDispute> =
  mongoose.models.Dispute || mongoose.model<IDispute>('Dispute', disputeSchema);
