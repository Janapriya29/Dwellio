import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { ProviderVerificationStatus } from '@dwellio/shared';

export interface IProviderProfile extends Document {
  userId: Types.ObjectId;
  displayName: string;
  phone: string;
  serviceArea: string;
  skills: string[];
  categories?: Types.ObjectId[];
  verificationStatus: ProviderVerificationStatus;
  rejectionReason?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  ratingAverage: number;
  reviewCount: number;
  ratingVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}

const providerProfileSchema = new Schema<IProviderProfile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID reference is required'],
      unique: true, // Enforce one provider profile per user
    },
    displayName: {
      type: String,
      required: [true, 'Display name is required'],
      trim: true,
      minlength: [2, 'Display name must be at least 2 characters long'],
      maxlength: [100, 'Display name cannot exceed 100 characters'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [
        /^[+]?[0-9\s-]{7,15}$/,
        'Please provide a valid phone number',
      ],
    },
    serviceArea: {
      type: String,
      required: [true, 'Service area is required'],
      trim: true,
      maxlength: [150, 'Service area description cannot exceed 150 characters'],
    },
    skills: {
      type: [String],
      default: [],
    },
    categories: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Category',
      },
    ],
    verificationStatus: {
      type: String,
      enum: {
        values: ['pending', 'approved', 'rejected'] as ProviderVerificationStatus[],
        message: '{VALUE} is not a valid verification status',
      },
      default: 'pending',
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    reviewedAt: {
      type: Date,
    },
    ratingAverage: {
      type: Number,
      default: 0,
      min: [0, 'Rating average cannot be negative'],
      max: [5, 'Rating average cannot exceed 5'],
    },
    reviewCount: {
      type: Number,
      default: 0,
      min: [0, 'Review count cannot be negative'],
    },
    ratingVersion: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export const ProviderProfile: Model<IProviderProfile> =
  mongoose.models.ProviderProfile ||
  mongoose.model<IProviderProfile>('ProviderProfile', providerProfileSchema);
