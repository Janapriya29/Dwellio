import mongoose, { Types } from 'mongoose';
import { Coupon, ICoupon } from '../models/Coupon';
import { CouponRedemption } from '../models/CouponRedemption';
import { ValidateCouponResponseData } from '@dwellio/shared';

export interface CouponValidationResult {
  valid: boolean;
  coupon?: ICoupon;
  discountAmountRupees: number;
  finalPayableRupees: number;
  message?: string;
}

export class CouponService {
  /**
   * Validates a coupon code against a candidate booking value and customer.
   * Calculates discount entirely on the server.
   */
  async validateCoupon(
    rawCode: string,
    customerId: Types.ObjectId | string,
    bookingAmountRupees: number
  ): Promise<CouponValidationResult> {
    if (!rawCode || typeof rawCode !== 'string' || rawCode.trim().length === 0) {
      return {
        valid: false,
        discountAmountRupees: 0,
        finalPayableRupees: bookingAmountRupees,
        message: 'Coupon code cannot be empty.',
      };
    }

    const normalizedCode = rawCode.trim().toUpperCase();
    const coupon = await Coupon.findOne({ normalizedCode });

    if (!coupon) {
      return {
        valid: false,
        discountAmountRupees: 0,
        finalPayableRupees: bookingAmountRupees,
        message: `Coupon "${normalizedCode}" does not exist.`,
      };
    }

    if (!coupon.isActive) {
      return {
        valid: false,
        discountAmountRupees: 0,
        finalPayableRupees: bookingAmountRupees,
        message: `Coupon "${normalizedCode}" is no longer active.`,
      };
    }

    const now = new Date();
    if (now < coupon.validFrom) {
      return {
        valid: false,
        discountAmountRupees: 0,
        finalPayableRupees: bookingAmountRupees,
        message: `Coupon "${normalizedCode}" is not yet valid.`,
      };
    }

    if (now > coupon.validUntil) {
      return {
        valid: false,
        discountAmountRupees: 0,
        finalPayableRupees: bookingAmountRupees,
        message: `Coupon "${normalizedCode}" has expired.`,
      };
    }

    if (bookingAmountRupees < coupon.minOrderValue) {
      return {
        valid: false,
        discountAmountRupees: 0,
        finalPayableRupees: bookingAmountRupees,
        message: `Minimum booking amount of ₹${coupon.minOrderValue} required to use coupon "${normalizedCode}".`,
      };
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return {
        valid: false,
        discountAmountRupees: 0,
        finalPayableRupees: bookingAmountRupees,
        message: `Coupon "${normalizedCode}" has reached its maximum global usage limit.`,
      };
    }

    // Check customer-specific redemption count
    const cId = new Types.ObjectId(customerId.toString());
    const customerRedemptions = await CouponRedemption.countDocuments({
      couponId: coupon._id,
      customerId: cId,
      status: 'redeemed',
    });

    if (customerRedemptions >= coupon.perCustomerLimit) {
      return {
        valid: false,
        discountAmountRupees: 0,
        finalPayableRupees: bookingAmountRupees,
        message: `You have already redeemed coupon "${normalizedCode}" the maximum number of times allowed.`,
      };
    }

    // Calculate discount
    let discount = 0;
    if (coupon.discountType === 'percent') {
      discount = Math.round((bookingAmountRupees * coupon.discountValue) / 100);
      if (coupon.maxDiscountAmount && coupon.maxDiscountAmount > 0) {
        discount = Math.min(discount, coupon.maxDiscountAmount);
      }
    } else {
      discount = Math.min(coupon.discountValue, bookingAmountRupees);
    }

    // Payable cannot be negative
    const finalPayable = Math.max(0, bookingAmountRupees - discount);

    return {
      valid: true,
      coupon,
      discountAmountRupees: discount,
      finalPayableRupees: finalPayable,
      message: `Coupon "${normalizedCode}" applied! You save ₹${discount}.`,
    };
  }

  /**
   * Atomically reserves a coupon for a pending booking checkout.
   * Enforces global usageLimit atomically via MongoDB conditional update.
   */
  async reserveCoupon(
    couponId: Types.ObjectId | string,
    bookingId: Types.ObjectId | string,
    customerId: Types.ObjectId | string,
    couponCode: string,
    discountAmountPaise: number
  ): Promise<void> {
    const cId = new Types.ObjectId(couponId.toString());
    const bId = new Types.ObjectId(bookingId.toString());
    const custId = new Types.ObjectId(customerId.toString());

    // 1. Idempotency check: Is there already an active reservation for this exact booking & coupon?
    const existingActiveReservation = await CouponRedemption.findOne({
      couponId: cId,
      bookingId: bId,
      status: 'reserved',
    });

    if (existingActiveReservation) {
      // Already reserved for this exact booking. Do not double-reserve or double-increment usedCount.
      return;
    }

    // 2. Check customer-specific limit
    const coupon = await Coupon.findById(cId);
    if (!coupon) {
      throw new Error(`Coupon "${couponCode}" not found.`);
    }

    const customerRedemptions = await CouponRedemption.countDocuments({
      couponId: cId,
      customerId: custId,
      status: { $in: ['reserved', 'redeemed'] },
      bookingId: { $ne: bId },
    });

    if (customerRedemptions >= (coupon.perCustomerLimit || 1)) {
      throw new Error(`You have reached the maximum allowed uses for coupon "${coupon.code}".`);
    }

    // 3. Atomically claim 1 usage slot against the coupon pool
    // Strictly enforces isActive: true and validity period [validFrom, validUntil] at DB level
    const now = new Date();
    const baseConditions: Record<string, any> = {
      _id: cId,
      isActive: true,
      validFrom: { $lte: now },
      validUntil: { $gte: now },
    };

    if (typeof coupon.usageLimit === 'number' && coupon.usageLimit > 0) {
      baseConditions.$expr = { $lt: ['$usedCount', coupon.usageLimit] };
    }

    const updatedCoupon = await Coupon.findOneAndUpdate(
      baseConditions,
      { $inc: { usedCount: 1 } },
      { returnDocument: 'after' }
    );

    if (!updatedCoupon) {
      const freshCoupon = await Coupon.findById(cId);
      if (!freshCoupon || !freshCoupon.isActive) {
        throw new Error(`Coupon "${coupon.code}" is no longer active.`);
      }
      if (freshCoupon.validUntil && freshCoupon.validUntil < now) {
        throw new Error(`Coupon "${coupon.code}" has expired.`);
      }
      if (freshCoupon.validFrom && freshCoupon.validFrom > now) {
        throw new Error(`Coupon "${coupon.code}" is not yet active.`);
      }
      throw new Error(`Coupon "${coupon.code}" has reached its maximum global usage limit.`);
    }

    // 4. Record or update reservation document
    try {
      await CouponRedemption.findOneAndUpdate(
        { couponId: cId, bookingId: bId },
        {
          $set: {
            couponCode: couponCode.trim().toUpperCase(),
            customerId: custId,
            discountAmount: discountAmountPaise,
            status: 'reserved',
            reservedAt: new Date(),
          },
        },
        { upsert: true, returnDocument: 'after' }
      );
    } catch (saveErr) {
      // Rollback the atomic increment if saving redemption document fails
      await Coupon.findByIdAndUpdate(cId, { $inc: { usedCount: -1 } }).catch(() => {});
      throw saveErr;
    }
  }

  /**
   * Marks a coupon reservation as redeemed once payment is verified/captured.
   * Note: usedCount was already claimed upon reservation to prevent race conditions.
   */
  async redeemCoupon(bookingId: Types.ObjectId | string): Promise<void> {
    const bId = new Types.ObjectId(bookingId.toString());
    const redemption = await CouponRedemption.findOne({
      bookingId: bId,
      status: 'reserved',
    });

    if (!redemption) return;

    redemption.status = 'redeemed';
    redemption.redeemedAt = new Date();
    await redemption.save();
  }

  /**
   * Releases a reserved coupon (e.g. upon payment failure, expiry, or booking cancellation).
   * Atomically decrements coupon usedCount back to the global pool.
   */
  async releaseCouponReservation(
    bookingId: Types.ObjectId | string,
    reason: string
  ): Promise<void> {
    const bId = new Types.ObjectId(bookingId.toString());
    const activeReservations = await CouponRedemption.find({
      bookingId: bId,
      status: 'reserved',
    });

    for (const r of activeReservations) {
      r.status = 'released';
      r.releasedAt = new Date();
      r.releaseReason = reason;
      await r.save();

      // Return usage slot back to the coupon pool
      await Coupon.findOneAndUpdate(
        { _id: r.couponId, usedCount: { $gt: 0 } },
        { $inc: { usedCount: -1 } }
      ).catch(() => {});
    }
  }
}

export const couponService = new CouponService();
