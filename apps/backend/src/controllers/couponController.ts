import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Coupon } from '../models/Coupon';
import { AuditLog } from '../models/AuditLog';
import { couponService } from '../services/couponService';
import { sendInternalError } from '../utils/security';
import {
  ApiResponse,
  PaginationMeta,
  CouponData,
  ValidateCouponPayload,
  ValidateCouponResponseData,
  CreateCouponPayload,
  UpdateCouponPayload,
} from '@dwellio/shared';

/**
 * Customer: Validate Coupon Code for Checkout Preview
 * POST /api/coupons/validate
 */
export const validateCoupon = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    const { code, bookingAmountRupees }: ValidateCouponPayload = req.body || {};

    if (!code || typeof code !== 'string') {
      res.status(400).json({ success: false, message: 'Coupon code is required.' });
      return;
    }

    const amount = typeof bookingAmountRupees === 'number' && bookingAmountRupees > 0 ? bookingAmountRupees : 499;

    const result = await couponService.validateCoupon(code, req.user._id, amount);

    if (!result.valid) {
      res.status(400).json({
        success: false,
        message: result.message || 'Invalid or expired coupon code.',
      });
      return;
    }

    const responseData: ValidateCouponResponseData = {
      valid: true,
      code: result.coupon!.code,
      discountType: result.coupon!.discountType,
      discountValue: result.coupon!.discountValue,
      discountAmountRupees: result.discountAmountRupees,
      finalPayableRupees: result.finalPayableRupees,
      message: result.message,
    };

    res.status(200).json({
      success: true,
      message: result.message || 'Coupon validated successfully.',
      data: responseData,
    });
  } catch (error: any) {
    sendInternalError(res, 'CouponController.validateCoupon', error, 'Failed to validate coupon.');
  }
};

/**
 * Admin: List All Coupons with Pagination and Search
 * GET /api/admin/coupons
 */
export const listAdminCoupons = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 10));
    const q = req.query.q as string | undefined;

    const filter: any = {};
    if (q && q.trim().length > 0) {
      filter.code = { $regex: q.trim().toUpperCase(), $options: 'i' };
    }

    const total = await Coupon.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const rawCoupons = await Coupon.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const coupons: CouponData[] = rawCoupons.map((c) => ({
      id: c._id.toString(),
      code: c.code,
      discountType: c.discountType,
      discountValue: c.discountValue,
      minOrderValueRupees: c.minOrderValue,
      maxDiscountAmountRupees: c.maxDiscountAmount,
      usageLimit: c.usageLimit,
      usedCount: c.usedCount,
      validFrom: c.validFrom.toISOString(),
      validUntil: c.validUntil.toISOString(),
      isActive: c.isActive,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    const pagination: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
    };

    res.status(200).json({
      success: true,
      message: 'Coupons retrieved successfully.',
      data: {
        coupons,
        pagination,
      },
    });
  } catch (error: any) {
    sendInternalError(res, 'CouponController.listAdminCoupons', error, 'Failed to list coupons.');
  }
};

/**
 * Admin: Create a New Promotion Coupon
 * POST /api/admin/coupons
 */
export const createAdminCoupon = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      code,
      discountType,
      discountValue,
      minOrderValueRupees,
      maxDiscountAmountRupees,
      usageLimit,
      validFrom,
      validUntil,
      isActive = true,
    }: CreateCouponPayload = req.body || {};

    if (!code || typeof code !== 'string' || code.trim().length < 3) {
      res.status(400).json({
        success: false,
        message: 'Valid coupon code is required (min 3 characters).',
      });
      return;
    }

    if (!discountType || !['percent', 'fixed'].includes(discountType)) {
      res.status(400).json({
        success: false,
        message: 'Discount type must be either "percent" or "fixed".',
      });
      return;
    }

    if (typeof discountValue !== 'number' || discountValue <= 0) {
      res.status(400).json({
        success: false,
        message: 'Discount value must be a positive number.',
      });
      return;
    }

    if (discountType === 'percent' && discountValue > 100) {
      res.status(400).json({
        success: false,
        message: 'Percentage discount cannot exceed 100%.',
      });
      return;
    }

    const start = new Date(validFrom);
    const end = new Date(validUntil);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start >= end) {
      res.status(400).json({
        success: false,
        message: 'Invalid validity window. validFrom must precede validUntil.',
      });
      return;
    }

    const normalizedCode = code.trim().toUpperCase();
    const existing = await Coupon.findOne({ normalizedCode });
    if (existing) {
      res.status(409).json({
        success: false,
        message: `Coupon code "${normalizedCode}" already exists.`,
      });
      return;
    }

    const coupon = new Coupon({
      code: normalizedCode,
      normalizedCode,
      discountType,
      discountValue,
      minOrderValue: minOrderValueRupees || 0,
      maxDiscountAmount: maxDiscountAmountRupees,
      usageLimit: usageLimit || undefined,
      validFrom: start,
      validUntil: end,
      isActive,
      createdByAdminId: req.user?._id,
    });

    await coupon.save();

    if (req.user) {
      await new AuditLog({
        adminId: req.user._id,
        action: 'COUPON_CREATED',
        targetId: coupon._id,
        targetType: 'Coupon',
        details: {
          code: normalizedCode,
          discountType,
          discountValue,
        },
      }).save().catch(() => {});
    }

    res.status(201).json({
      success: true,
      message: `Coupon "${normalizedCode}" created successfully.`,
      data: {
        id: coupon._id.toString(),
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        isActive: coupon.isActive,
      },
    });
  } catch (error: any) {
    sendInternalError(res, 'CouponController.createAdminCoupon', error, 'Failed to create coupon.');
  }
};

/**
 * Admin: Update an Existing Coupon
 * PUT /api/admin/coupons/:id
 */
export const updateAdminCoupon = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid coupon ID.' });
      return;
    }

    const {
      discountType,
      discountValue,
      minOrderValueRupees,
      maxDiscountAmountRupees,
      usageLimit,
      validFrom,
      validUntil,
      isActive,
    }: UpdateCouponPayload = req.body || {};

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      res.status(404).json({ success: false, message: 'Coupon not found.' });
      return;
    }

    if (discountType) coupon.discountType = discountType;
    if (typeof discountValue === 'number' && discountValue > 0) coupon.discountValue = discountValue;
    if (typeof minOrderValueRupees === 'number') coupon.minOrderValue = minOrderValueRupees;
    if (maxDiscountAmountRupees !== undefined) coupon.maxDiscountAmount = maxDiscountAmountRupees;
    if (usageLimit !== undefined) coupon.usageLimit = usageLimit;
    if (validFrom) coupon.validFrom = new Date(validFrom);
    if (validUntil) coupon.validUntil = new Date(validUntil);
    if (typeof isActive === 'boolean') coupon.isActive = isActive;

    await coupon.save();

    if (req.user) {
      await new AuditLog({
        adminId: req.user._id,
        action: 'COUPON_UPDATED',
        targetId: coupon._id,
        targetType: 'Coupon',
        details: {
          code: coupon.code,
        },
      }).save().catch(() => {});
    }

    res.status(200).json({
      success: true,
      message: `Coupon "${coupon.code}" updated successfully.`,
      data: {
        id: coupon._id.toString(),
        code: coupon.code,
        isActive: coupon.isActive,
      },
    });
  } catch (error: any) {
    sendInternalError(res, 'CouponController.updateAdminCoupon', error, 'Failed to update coupon.');
  }
};

/**
 * Admin: Toggle Active Status of a Coupon
 * PATCH /api/admin/coupons/:id/status
 */
export const toggleAdminCouponStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    if (!id || !Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, message: 'Invalid coupon ID.' });
      return;
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      res.status(404).json({ success: false, message: 'Coupon not found.' });
      return;
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    if (req.user) {
      await new AuditLog({
        adminId: req.user._id,
        action: coupon.isActive ? 'COUPON_UPDATED' : 'COUPON_DEACTIVATED',
        targetId: coupon._id,
        targetType: 'Coupon',
        details: {
          code: coupon.code,
          isActive: coupon.isActive,
        },
      }).save().catch(() => {});
    }

    res.status(200).json({
      success: true,
      message: `Coupon "${coupon.code}" is now ${coupon.isActive ? 'active' : 'inactive'}.`,
      data: {
        id: coupon._id.toString(),
        code: coupon.code,
        isActive: coupon.isActive,
      },
    });
  } catch (error: any) {
    sendInternalError(res, 'CouponController.toggleAdminCouponStatus', error, 'Failed to toggle coupon status.');
  }
};
