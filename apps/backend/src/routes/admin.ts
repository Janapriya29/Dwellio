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
import { requireAuth, requireRole } from '../middleware/auth';

export const adminRouter = Router();

// Protect all admin routes with authentication and admin role authorization
adminRouter.use('/admin', requireAuth, requireRole('admin'));

// Provider application management endpoints
adminRouter.get('/admin/providers/applications', listApplications);
adminRouter.get('/admin/providers/applications/:id', getApplicationById);
adminRouter.patch('/admin/providers/applications/:id/approve', approveApplication);
adminRouter.patch('/admin/providers/applications/:id/reject', rejectApplication);

// Admin Service Catalog Management
adminRouter.get('/admin/catalog/categories', listAdminCategories);
adminRouter.post('/admin/catalog/categories', createCategory);
adminRouter.patch('/admin/catalog/categories/:id', updateCategory);
adminRouter.patch('/admin/catalog/categories/:id/status', setCategoryStatus);

adminRouter.get('/admin/catalog/services', listAdminServices);
adminRouter.post('/admin/catalog/services', createService);
adminRouter.patch('/admin/catalog/services/:id', updateService);
adminRouter.patch('/admin/catalog/services/:id/status', setServiceStatus);
