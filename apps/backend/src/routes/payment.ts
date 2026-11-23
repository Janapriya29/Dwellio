import { Router } from 'express';
import {
  createPaymentOrder,
  verifyPayment,
  handlePaymentWebhook,
} from '../controllers/paymentController';
import { requireAuth } from '../middleware/auth';

export const paymentRouter = Router();

// Customer payment order and verification routes (require JWT authentication)
paymentRouter.post('/payments/create-order', requireAuth, createPaymentOrder);
paymentRouter.post('/payments/verify', requireAuth, verifyPayment);

// Razorpay asynchronous webhook listener (authenticated via HMAC SHA256 header signature)
paymentRouter.post('/payments/webhook', handlePaymentWebhook);
