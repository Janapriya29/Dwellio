import { Router } from 'express';
import { requireAuth, requireApprovedProvider } from '../middleware/auth';
import {
  createBookingReview,
  getBookingReview,
  getProviderReviews,
  replyToReview,
} from '../controllers/review';

export const reviewRouter = Router();

// ----------------------------------------------------
// Customer Booking Review Endpoints
// ----------------------------------------------------
reviewRouter.post('/bookings/:id/reviews', requireAuth, createBookingReview);
reviewRouter.get('/bookings/:id/review', requireAuth, getBookingReview);

// ----------------------------------------------------
// Public Provider Reviews Endpoint
// ----------------------------------------------------
reviewRouter.get('/providers/:id/reviews', getProviderReviews);

// ----------------------------------------------------
// Provider Review Reply Endpoint
// ----------------------------------------------------
reviewRouter.patch('/reviews/:id/reply', requireAuth, requireApprovedProvider, replyToReview);
