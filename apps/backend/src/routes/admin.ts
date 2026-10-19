import { Router } from 'express';
import {
  listApplications,
  getApplicationById,
  approveApplication,
  rejectApplication,
} from '../controllers/admin';
import {
  listAdminCategories,
  createCategory,
  updateCategory,
  setCategoryStatus,
  listAdminServices,
  createService,
  updateService,
  setServiceStatus,
} from '../controllers/catalogAdmin';
import { getAdminOverview } from '../controllers/adminOverview';
import { listAdminBookings, getAdminBookingById } from '../controllers/adminBooking';
import { listAdminReviews, moderateReview } from '../controllers/adminReview';
import { listAuditLogs } from '../controllers/adminAudit';
import { requireAuth, requireRole } from '../middleware/auth';

export const adminRouter = Router();

// Protect all admin routes with authentication and admin role authorization
adminRouter.use('/admin', requireAuth, requireRole('admin'));

// ----------------------------------------------------
// 1. Platform Overview
// ----------------------------------------------------
adminRouter.get('/admin/overview', getAdminOverview);

// ----------------------------------------------------
// 2. Provider Application Management
// ----------------------------------------------------
adminRouter.get('/admin/providers/applications', listApplications);
adminRouter.get('/admin/providers/applications/:id', getApplicationById);
adminRouter.patch('/admin/providers/applications/:id/approve', approveApplication);
adminRouter.patch('/admin/providers/applications/:id/reject', rejectApplication);

// ----------------------------------------------------
// 3. Service Catalog Management
// ----------------------------------------------------
adminRouter.get('/admin/catalog/categories', listAdminCategories);
adminRouter.post('/admin/catalog/categories', createCategory);
adminRouter.patch('/admin/catalog/categories/:id', updateCategory);
adminRouter.patch('/admin/catalog/categories/:id/status', setCategoryStatus);

adminRouter.get('/admin/catalog/services', listAdminServices);
adminRouter.post('/admin/catalog/services', createService);
adminRouter.patch('/admin/catalog/services/:id', updateService);
adminRouter.patch('/admin/catalog/services/:id/status', setServiceStatus);

// ----------------------------------------------------
// 4. Booking Oversight (Read-Only)
// ----------------------------------------------------
adminRouter.get('/admin/bookings', listAdminBookings);
adminRouter.get('/admin/bookings/:id', getAdminBookingById);

// ----------------------------------------------------
// 5. Review Moderation
// ----------------------------------------------------
adminRouter.get('/admin/reviews', listAdminReviews);
adminRouter.patch('/admin/reviews/:id/moderate', moderateReview);

// ----------------------------------------------------
// 6. Audit Logs
// ----------------------------------------------------
adminRouter.get('/admin/audit-logs', listAuditLogs);

