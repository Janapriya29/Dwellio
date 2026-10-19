import { Router } from 'express';
import { requireAuth, requireApprovedProvider } from '../middleware/auth';
import {
  createBooking,
  getCustomerBookings,
  getCustomerBookingById,
  cancelCustomerBooking,
} from '../controllers/bookingCustomer';
import {
  getProviderBookings,
  getProviderBookingById,
  acceptBooking,
  rejectBooking,
  updateBookingStatus,
} from '../controllers/bookingProvider';

export const bookingRouter = Router();

// ----------------------------------------------------
// Customer Booking Endpoints
// ----------------------------------------------------
bookingRouter.post('/bookings', requireAuth, createBooking);
bookingRouter.get('/bookings', requireAuth, getCustomerBookings);
bookingRouter.get('/bookings/:id', requireAuth, getCustomerBookingById);
bookingRouter.patch('/bookings/:id/cancel', requireAuth, cancelCustomerBooking);

// ----------------------------------------------------
// Service Provider Booking Endpoints
// ----------------------------------------------------
bookingRouter.get('/provider/bookings', requireAuth, requireApprovedProvider, getProviderBookings);
bookingRouter.get('/provider/bookings/:id', requireAuth, requireApprovedProvider, getProviderBookingById);
bookingRouter.patch('/provider/bookings/:id/accept', requireAuth, requireApprovedProvider, acceptBooking);
bookingRouter.patch('/provider/bookings/:id/reject', requireAuth, requireApprovedProvider, rejectBooking);
bookingRouter.patch('/provider/bookings/:id/status', requireAuth, requireApprovedProvider, updateBookingStatus);
