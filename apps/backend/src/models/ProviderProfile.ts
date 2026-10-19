import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { ProviderVerificationStatus } from '@dwellio/shared';

export interface IProviderProfile extends Document {
  userId: Types.ObjectId;
  displayName: string;
  phone: string;
  serviceArea: string;
  skills: string[];
  verificationStatus: ProviderVerificationStatus;
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
    verificationStatus: {
      type: String,
      enum: {
        values: ['pending', 'approved', 'rejected'] as ProviderVerificationStatus[],
        message: '{VALUE} is not a valid verification status',
      },
      default: 'pending',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const ProviderProfile: Model<IProviderProfile> =
  mongoose.models.ProviderProfile ||
  mongoose.model<IProviderProfile>('ProviderProfile', providerProfileSchema);
