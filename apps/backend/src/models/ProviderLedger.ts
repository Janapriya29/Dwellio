import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { LedgerEntryType } from '@dwellio/shared';

export interface IProviderLedger extends Document {
  providerId: Types.ObjectId;
  bookingId?: Types.ObjectId;
  paymentId?: Types.ObjectId;
  entryType: LedgerEntryType;
  creditAmount: number; // in paise
  debitAmount: number; // in paise
  netAmount: number; // in paise (credit - debit)
  currency: string;
  resultingBalance: number; // in paise
  status: 'pending' | 'available' | 'allocated' | 'settled' | 'cancelled';
  payoutBatchId?: Types.ObjectId;
  description: string;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

const providerLedgerSchema = new Schema<IProviderLedger>(
  {
    providerId: {
      type: Schema.Types.ObjectId,
      ref: 'ProviderProfile',
      required: [true, 'Provider profile reference is required'],
      index: true,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      index: true,
    },
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: 'Payment',
    },
    entryType: {
      type: String,
      enum: [
        'job_earning_credit',
        'platform_commission_deduction',
        'refund_reversal_debit',
        'dispute_adjustment_debit',
        'payout_batch_allocation',
        'manual_adjustment',
      ],
      required: true,
      index: true,
    },
    creditAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    debitAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    netAmount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
    },
    resultingBalance: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'available', 'allocated', 'settled', 'cancelled'],
      default: 'available',
      index: true,
    },
    payoutBatchId: {
      type: Schema.Types.ObjectId,
      ref: 'PayoutBatch',
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    idempotencyKey: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

providerLedgerSchema.index({ providerId: 1, createdAt: -1 });
providerLedgerSchema.index({ providerId: 1, status: 1 });

export const ProviderLedger: Model<IProviderLedger> =
  mongoose.models.ProviderLedger ||
  mongoose.model<IProviderLedger>('ProviderLedger', providerLedgerSchema);
