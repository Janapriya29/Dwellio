import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { ProviderVerificationStatus, ProviderWorkingDay, ProviderBlockedDate } from '@dwellio/shared';

export interface IProviderProfile extends Document {
  userId: Types.ObjectId;
  displayName: string;
  phone: string;
  bio?: string;
  experienceYears?: number;
  serviceArea: string;
  businessAddress?: string;
  city?: string;
  skills: string[];
  avatarUrl?: string;
  categories?: Types.ObjectId[];
  verificationStatus: ProviderVerificationStatus;
  rejectionReason?: string;
  reviewedBy?: Types.ObjectId;
  reviewedAt?: Date;
  ratingAverage: number;
  reviewCount: number;
  ratingVersion?: number;
  isAcceptingJobs: boolean;
  workingSchedule?: ProviderWorkingDay[];
  blockedDates?: ProviderBlockedDate[];
  createdAt: Date;
  updatedAt: Date;
}

const workingScheduleSchema = new Schema(
  {
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },
    activeSlotIndices: {
      type: [Number],
      default: [0, 1, 2, 3],
    },
  },
  { _id: false }
);

const blockedDateSchema = new Schema(
  {
    date: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'],
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [200, 'Reason cannot exceed 200 characters'],
    },
  },
  { _id: false }
);

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
    bio: {
      type: String,
      trim: true,
      maxlength: [1000, 'Biography cannot exceed 1000 characters'],
    },
    experienceYears: {
      type: Number,
      min: [0, 'Experience years cannot be negative'],
      max: [60, 'Experience years cannot exceed 60'],
    },
    serviceArea: {
      type: String,
      required: [true, 'Service area is required'],
      trim: true,
      maxlength: [150, 'Service area description cannot exceed 150 characters'],
    },
    businessAddress: {
      type: String,
      trim: true,
      maxlength: [200, 'Business address cannot exceed 200 characters'],
    },
    city: {
      type: String,
      trim: true,
      maxlength: [100, 'City cannot exceed 100 characters'],
    },
    skills: {
      type: [String],
      default: [],
    },
    avatarUrl: {
      type: String,
      trim: true,
      maxlength: [500, 'Avatar URL cannot exceed 500 characters'],
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
    isAcceptingJobs: {
      type: Boolean,
      default: true,
      index: true,
    },
    workingSchedule: {
      type: [workingScheduleSchema],
      default: () => [
        { dayOfWeek: 1, activeSlotIndices: [0, 1, 2, 3] }, // Mon
        { dayOfWeek: 2, activeSlotIndices: [0, 1, 2, 3] }, // Tue
        { dayOfWeek: 3, activeSlotIndices: [0, 1, 2, 3] }, // Wed
        { dayOfWeek: 4, activeSlotIndices: [0, 1, 2, 3] }, // Thu
        { dayOfWeek: 5, activeSlotIndices: [0, 1, 2, 3] }, // Fri
        { dayOfWeek: 6, activeSlotIndices: [0, 1, 2, 3] }, // Sat
        { dayOfWeek: 0, activeSlotIndices: [] },             // Sun (off)
      ],
    },
    blockedDates: {
      type: [blockedDateSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const ProviderProfile: Model<IProviderProfile> =
  mongoose.models.ProviderProfile ||
  mongoose.model<IProviderProfile>('ProviderProfile', providerProfileSchema);
