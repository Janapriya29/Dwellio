import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IPaymentWebhookEvent extends Document {
  eventId: string;
  eventType: string;
  payload: Record<string, any>;
  signature: string;
  processingStatus: 'received' | 'processing' | 'processed' | 'failed' | 'ignored';
  error?: string;
  retryCount: number;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentWebhookEventSchema = new Schema<IPaymentWebhookEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    eventType: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    signature: {
      type: String,
      required: true,
      trim: true,
    },
    processingStatus: {
      type: String,
      enum: ['received', 'processing', 'processed', 'failed', 'ignored'],
      default: 'received',
      index: true,
    },
    error: {
      type: String,
      trim: true,
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    processedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

paymentWebhookEventSchema.index({ eventType: 1, createdAt: -1 });

export const PaymentWebhookEvent: Model<IPaymentWebhookEvent> =
  mongoose.models.PaymentWebhookEvent ||
  mongoose.model<IPaymentWebhookEvent>('PaymentWebhookEvent', paymentWebhookEventSchema);
