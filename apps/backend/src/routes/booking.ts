import { Router } from 'express';
import { requireAuth, requireApprovedProvider } from '../middleware/auth';
import { bookingCreationRateLimiter } from '../middleware/rateLimiter';
import {
  createBooking,
  getCustomerBookings,
  getCustomerBookingById,
  cancelCustomerBooking,
  rescheduleCustomerBooking,
} from '../controllers/bookingCustomer';
import {
  getProviderBookings,
  getProviderBookingById,
  acceptBooking,
  rejectBooking,
  updateBookingStatus,
  cancelBookingByProvider,
} from '../controllers/bookingProvider';
import {
  createBookingDispute,
  getBookingDisputes,
} from '../controllers/adminDispute';

export const bookingRouter = Router();

// ----------------------------------------------------
// Customer Booking Endpoints
// ----------------------------------------------------
bookingRouter.post('/bookings', requireAuth, bookingCreationRateLimiter, createBooking);
bookingRouter.get('/bookings', requireAuth, getCustomerBookings);
bookingRouter.get('/bookings/:id', requireAuth, getCustomerBookingById);
bookingRouter.patch('/bookings/:id/cancel', requireAuth, cancelCustomerBooking);
bookingRouter.patch('/bookings/:id/reschedule', requireAuth, rescheduleCustomerBooking);

// ----------------------------------------------------
// Service Provider Booking Endpoints
// ----------------------------------------------------
bookingRouter.get('/provider/bookings', requireAuth, requireApprovedProvider, getProviderBookings);
bookingRouter.get('/provider/bookings/:id', requireAuth, requireApprovedProvider, getProviderBookingById);
bookingRouter.patch('/provider/bookings/:id/accept', requireAuth, requireApprovedProvider, acceptBooking);
bookingRouter.patch('/provider/bookings/:id/reject', requireAuth, requireApprovedProvider, rejectBooking);
bookingRouter.patch('/provider/bookings/:id/status', requireAuth, requireApprovedProvider, updateBookingStatus);
bookingRouter.patch('/provider/bookings/:id/cancel', requireAuth, requireApprovedProvider, cancelBookingByProvider);

// ----------------------------------------------------
// Booking Disputes (Customer & Provider)
// ----------------------------------------------------
bookingRouter.post('/bookings/:id/disputes', requireAuth, createBookingDispute);
bookingRouter.get('/bookings/:id/disputes', requireAuth, getBookingDisputes);
