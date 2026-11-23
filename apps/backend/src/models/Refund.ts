import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { RefundStatus } from '@dwellio/shared';

export interface IRefund extends Document {
  paymentId: Types.ObjectId;
  bookingId: Types.ObjectId;
  razorpayRefundId?: string;
  razorpayPaymentId: string;
  amount: number; // in paise
  currency: string;
  reason: string;
  status: RefundStatus;
  initiatedByRole: 'customer' | 'provider' | 'admin' | 'system';
  initiatedByUserId?: Types.ObjectId;
  disputeId?: Types.ObjectId;
  idempotencyKey?: string;
  errorCode?: string;
  errorDescription?: string;
  createdAt: Date;
  updatedAt: Date;
}

const refundSchema = new Schema<IRefund>(
  {
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: 'Payment',
      required: [true, 'Payment reference is required'],
      index: true,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking reference is required'],
      index: true,
    },
    razorpayRefundId: {
      type: String,
      sparse: true,
      index: true,
      trim: true,
    },
    razorpayPaymentId: {
      type: String,
      required: [true, 'Razorpay payment ID is required'],
      trim: true,
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Refund amount in paise is required'],
      min: [100, 'Minimum refund amount is ₹1 (100 paise)'],
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
      uppercase: true,
    },
    reason: {
      type: String,
      required: [true, 'Refund reason is required'],
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },
    status: {
      type: String,
      enum: ['pending', 'processed', 'failed'],
      default: 'pending',
      index: true,
    },
    initiatedByRole: {
      type: String,
      enum: ['customer', 'provider', 'admin', 'system'],
      required: true,
    },
    initiatedByUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    disputeId: {
      type: Schema.Types.ObjectId,
      ref: 'Dispute',
    },
    idempotencyKey: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
    },
    errorCode: {
      type: String,
      trim: true,
    },
    errorDescription: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

refundSchema.index({ bookingId: 1, createdAt: -1 });

export const Refund: Model<IRefund> =
  mongoose.models.Refund || mongoose.model<IRefund>('Refund', refundSchema);
