import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { PaymentStatus } from '@dwellio/shared';

export interface IPayment extends Document {
  bookingId: Types.ObjectId;
  customerId: Types.ObjectId;
  providerId: Types.ObjectId;
  razorpayOrderId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  amount: number; // in integer paise (e.g. 49900 for ₹499.00)
  currency: string;
  status: PaymentStatus;
  method?: string;
  signatureVerified: boolean;
  errorCode?: string;
  errorDescription?: string;
  attemptCount: number;
  refundedAmount: number; // in paise
  receipt: string;
  notes?: Record<string, string>;
  capturedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking reference is required'],
      index: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer reference is required'],
      index: true,
    },
    providerId: {
      type: Schema.Types.ObjectId,
      ref: 'ProviderProfile',
      required: [true, 'Provider profile reference is required'],
      index: true,
    },
    razorpayOrderId: {
      type: String,
      required: [true, 'Razorpay order ID is required'],
      unique: true,
      index: true,
      trim: true,
    },
    razorpayPaymentId: {
      type: String,
      sparse: true,
      index: true,
      trim: true,
    },
    razorpaySignature: {
      type: String,
      trim: true,
    },
    amount: {
      type: Number,
      required: [true, 'Amount in paise is required'],
      min: [100, 'Minimum payment amount is ₹1 (100 paise)'],
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
      uppercase: true,
    },
    status: {
      type: String,
      enum: ['created', 'authorized', 'captured', 'failed', 'partially_refunded', 'refunded'],
      default: 'created',
      index: true,
    },
    method: {
      type: String,
      trim: true,
    },
    signatureVerified: {
      type: Boolean,
      default: false,
    },
    errorCode: {
      type: String,
      trim: true,
    },
    errorDescription: {
      type: String,
      trim: true,
    },
    attemptCount: {
      type: Number,
      default: 1,
      min: 1,
    },
    refundedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    receipt: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    notes: {
      type: Map,
      of: String,
      default: {},
    },
    capturedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

paymentSchema.index({ customerId: 1, createdAt: -1 });
paymentSchema.index({ bookingId: 1, status: 1 });

export const Payment: Model<IPayment> =
  mongoose.models.Payment || mongoose.model<IPayment>('Payment', paymentSchema);
