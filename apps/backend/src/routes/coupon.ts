import { Router } from 'express';
import { validateCoupon } from '../controllers/couponController';
import { requireAuth } from '../middleware/auth';

export const couponRouter = Router();

// Customer coupon preview validation route (requires JWT authentication)
couponRouter.post('/coupons/validate', requireAuth, validateCoupon);
