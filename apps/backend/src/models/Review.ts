import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface IProviderReply {
  replyText: string;
  repliedAt: Date;
}

export interface IReview extends Document {
  bookingId: Types.ObjectId;
  customerId: Types.ObjectId;
  providerId: Types.ObjectId;
  serviceId: Types.ObjectId;
  rating: number;
  comment?: string;
  providerReply?: IProviderReply;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const providerReplySchema = new Schema<IProviderReply>(
  {
    replyText: {
      type: String,
      required: [true, 'Reply text is required'],
      trim: true,
      minlength: [2, 'Reply text must be at least 2 characters long'],
      maxlength: [1000, 'Reply text cannot exceed 1000 characters'],
    },
    repliedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const reviewSchema = new Schema<IReview>(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking reference is required'],
      unique: true, // One review per completed booking
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
    serviceId: {
      type: Schema.Types.ObjectId,
      ref: 'Service',
      required: [true, 'Service reference is required'],
      index: true,
    },
    rating: {
      type: Number,
      required: [true, 'Star rating is required'],
      min: [1, 'Rating must be at least 1 star'],
      max: [5, 'Rating cannot exceed 5 stars'],
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be an integer between 1 and 5',
      },
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [1000, 'Review comment cannot exceed 1000 characters'],
    },
    providerReply: {
      type: providerReplySchema,
      default: undefined,
    },
    isPublished: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound Indexes for fast queries
reviewSchema.index({ providerId: 1, isPublished: 1, createdAt: -1 });
reviewSchema.index({ customerId: 1, createdAt: -1 });

export const Review: Model<IReview> =
  mongoose.models.Review || mongoose.model<IReview>('Review', reviewSchema);
