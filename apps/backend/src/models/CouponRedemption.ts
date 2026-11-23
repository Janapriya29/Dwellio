import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface ICouponRedemption extends Document {
  couponId: Types.ObjectId;
  couponCode: string;
  customerId: Types.ObjectId;
  bookingId: Types.ObjectId;
  discountAmount: number; // in paise
  status: 'reserved' | 'redeemed' | 'released' | 'expired';
  reservedAt: Date;
  redeemedAt?: Date;
  releasedAt?: Date;
  releaseReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const couponRedemptionSchema = new Schema<ICouponRedemption>(
  {
    couponId: {
      type: Schema.Types.ObjectId,
      ref: 'Coupon',
      required: true,
      index: true,
    },
    couponCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    discountAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['reserved', 'redeemed', 'released', 'expired'],
      default: 'reserved',
      index: true,
    },
    reservedAt: {
      type: Date,
      default: Date.now,
    },
    redeemedAt: {
      type: Date,
    },
    releasedAt: {
      type: Date,
    },
    releaseReason: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound Unique Index: At most one redemption reservation per booking
couponRedemptionSchema.index({ couponId: 1, bookingId: 1 }, { unique: true });
couponRedemptionSchema.index({ customerId: 1, couponId: 1, status: 1 });

export const CouponRedemption: Model<ICouponRedemption> =
  mongoose.models.CouponRedemption ||
  mongoose.model<ICouponRedemption>('CouponRedemption', couponRedemptionSchema);
