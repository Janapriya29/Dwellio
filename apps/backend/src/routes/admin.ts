import { Router } from 'express';
import {
  listApplications,
  getApplicationById,
  approveApplication,
  rejectApplication,
} from '../controllers/admin';
import {
  listAdminProviders,
  getAdminProviderDetail,
  updateProviderStatus,
} from '../controllers/adminProvider';
import {
  listAdminCustomers,
  getAdminCustomerById,
  updateCustomerStatus,
} from '../controllers/adminCustomer';
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
import {
  getAdminOverview,
  getAdminAnalytics,
} from '../controllers/adminOverview';
import {
  listAdminBookings,
  getAdminBookingById,
  adminCancelBooking,
  adminUpdatePaymentStatus,
} from '../controllers/adminBooking';
import {
  listAdminDisputes,
  getAdminDisputeById,
  resolveAdminDispute,
} from '../controllers/adminDispute';
import {
  createAnnouncement,
  listAdminAnnouncements,
  retryAnnouncementDelivery,
} from '../controllers/adminAnnouncement';
import {
  getAdminSettings,
  updateAdminSettings,
} from '../controllers/adminSettings';
import { listAdminReviews, moderateReview } from '../controllers/adminReview';
import { listAuditLogs } from '../controllers/adminAudit';
import { requireAuth, requireRole } from '../middleware/auth';

export const adminRouter = Router();

// Protect all admin routes with authentication and admin role authorization
adminRouter.use('/admin', requireAuth, requireRole('admin'));

// ----------------------------------------------------
// 1. Platform Overview & Financial Analytics (Milestone 3A)
// ----------------------------------------------------
adminRouter.get('/admin/overview', getAdminOverview);
adminRouter.get('/admin/analytics', getAdminAnalytics);

// ----------------------------------------------------
// 2. Customer Management (Milestone 3B)
// ----------------------------------------------------
adminRouter.get('/admin/customers', listAdminCustomers);
adminRouter.get('/admin/customers/:id', getAdminCustomerById);
adminRouter.patch('/admin/customers/:id/status', updateCustomerStatus);

// ----------------------------------------------------
// 3. Provider Governance & Applications (Milestone 3C)
// ----------------------------------------------------
adminRouter.get('/admin/providers/applications', listApplications);
adminRouter.get('/admin/providers/applications/:id', getApplicationById);
adminRouter.patch('/admin/providers/applications/:id/approve', approveApplication);
adminRouter.patch('/admin/providers/applications/:id/reject', rejectApplication);

adminRouter.get('/admin/providers', listAdminProviders);
adminRouter.get('/admin/providers/:id', getAdminProviderDetail);
adminRouter.patch('/admin/providers/:id/status', updateProviderStatus);

// ----------------------------------------------------
// 4. Service Catalog Management & Pricing (Milestone 3C)
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
// 5. Booking Oversight & Intervention (Milestone 3D)
// ----------------------------------------------------
adminRouter.get('/admin/bookings', listAdminBookings);
adminRouter.get('/admin/bookings/:id', getAdminBookingById);
adminRouter.patch('/admin/bookings/:id/cancel', adminCancelBooking);
adminRouter.patch('/admin/bookings/:id/payment-status', adminUpdatePaymentStatus);

// ----------------------------------------------------
// 6. Dispute Resolution (Milestone 3D)
// ----------------------------------------------------
adminRouter.get('/admin/disputes', listAdminDisputes);
adminRouter.get('/admin/disputes/:id', getAdminDisputeById);
adminRouter.patch('/admin/disputes/:id/resolve', resolveAdminDispute);

// ----------------------------------------------------
// 7. Announcements Broadcast (Milestone 3E)
// ----------------------------------------------------
adminRouter.post('/admin/announcements', createAnnouncement);
adminRouter.get('/admin/announcements', listAdminAnnouncements);
adminRouter.post('/admin/announcements/:id/retry', retryAnnouncementDelivery);

// ----------------------------------------------------
// 8. Platform Settings (Milestone 3E)
// ----------------------------------------------------
adminRouter.get('/admin/settings', getAdminSettings);
adminRouter.put('/admin/settings', updateAdminSettings);

// ----------------------------------------------------
// 9. Review Moderation
// ----------------------------------------------------
adminRouter.get('/admin/reviews', listAdminReviews);
adminRouter.patch('/admin/reviews/:id/moderate', moderateReview);

// ----------------------------------------------------
// 10. Audit Logs
// ----------------------------------------------------
adminRouter.get('/admin/audit-logs', listAuditLogs);
