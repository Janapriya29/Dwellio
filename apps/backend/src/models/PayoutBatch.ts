import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { PayoutBatchStatus } from '@dwellio/shared';

export interface IPayoutBatchItem {
  providerId: Types.ObjectId;
  providerDisplayName: string;
  providerPhone?: string;
  eligibleAmount: number; // in paise
  bookingIds: Types.ObjectId[];
  ledgerEntryIds: Types.ObjectId[];
  settlementStatus: 'pending' | 'settled' | 'failed';
  settlementReference?: string;
  settledAt?: Date;
}

export interface IPayoutBatch extends Document {
  batchNumber: string;
  periodStart: Date;
  periodEnd: Date;
  totalAmount: number; // in paise
  totalProvidersCount: number;
  status: PayoutBatchStatus;
  items: IPayoutBatchItem[];
  generatedByAdminId?: Types.ObjectId;
  approvedByAdminId?: Types.ObjectId;
  settledAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const payoutBatchItemSchema = new Schema<IPayoutBatchItem>(
  {
    providerId: {
      type: Schema.Types.ObjectId,
      ref: 'ProviderProfile',
      required: true,
    },
    providerDisplayName: {
      type: String,
      required: true,
      trim: true,
    },
    providerPhone: {
      type: String,
      trim: true,
    },
    eligibleAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    bookingIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Booking',
      },
    ],
    ledgerEntryIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'ProviderLedger',
      },
    ],
    settlementStatus: {
      type: String,
      enum: ['pending', 'settled', 'failed'],
      default: 'pending',
    },
    settlementReference: {
      type: String,
      trim: true,
    },
    settledAt: {
      type: Date,
    },
  },
  { _id: false }
);

const payoutBatchSchema = new Schema<IPayoutBatch>(
  {
    batchNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    totalProvidersCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['draft', 'pending_approval', 'approved', 'settled', 'cancelled'],
      default: 'draft',
      index: true,
    },
    items: {
      type: [payoutBatchItemSchema],
      default: [],
    },
    generatedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    settledAt: {
      type: Date,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

payoutBatchSchema.index({ status: 1, createdAt: -1 });

export const PayoutBatch: Model<IPayoutBatch> =
  mongoose.models.PayoutBatch ||
  mongoose.model<IPayoutBatch>('PayoutBatch', payoutBatchSchema);
