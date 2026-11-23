import mongoose, { Document, Schema, Model, Types } from 'mongoose';
import { CouponDiscountType } from '@dwellio/shared';

export interface ICoupon extends Document {
  code: string;
  normalizedCode: string;
  discountType: CouponDiscountType;
  discountValue: number; // % (1-100) or ₹ amount
  minOrderValue: number; // in rupees
  maxDiscountAmount?: number; // in rupees (cap for percentage discounts)
  usageLimit?: number; // total global uses allowed
  usedCount: number;
  perCustomerLimit: number;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
  createdByAdminId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 20,
    },
    normalizedCode: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      uppercase: true,
    },
    discountType: {
      type: String,
      enum: ['percent', 'fixed'],
      required: [true, 'Discount type is required'],
    },
    discountValue: {
      type: Number,
      required: [true, 'Discount value is required'],
      min: [1, 'Discount value must be at least 1'],
    },
    minOrderValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxDiscountAmount: {
      type: Number,
      min: 0,
    },
    usageLimit: {
      type: Number,
      min: 1,
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    perCustomerLimit: {
      type: Number,
      default: 1,
      min: 1,
    },
    validFrom: {
      type: Date,
      required: [true, 'Valid from date is required'],
    },
    validUntil: {
      type: Date,
      required: [true, 'Valid until date is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdByAdminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

couponSchema.pre('validate', function () {
  if (this.code) {
    this.code = this.code.trim().toUpperCase();
    this.normalizedCode = this.code;
  }
});

couponSchema.index({ isActive: 1, validFrom: 1, validUntil: 1 });

export const Coupon: Model<ICoupon> =
  mongoose.models.Coupon || mongoose.model<ICoupon>('Coupon', couponSchema);
