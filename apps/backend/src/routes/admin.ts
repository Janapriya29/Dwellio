import { Router } from 'express';
import {
  listApplications,
  getApplicationById,
  approveApplication,
  rejectApplication,
} from '../controllers/admin';
import { requireAuth, requireRole } from '../middleware/auth';

export const adminRouter = Router();

// Protect all admin routes with authentication and admin role authorization
adminRouter.use('/admin', requireAuth, requireRole('admin'));

// Provider application management endpoints
adminRouter.get('/admin/providers/applications', listApplications);
adminRouter.get('/admin/providers/applications/:id', getApplicationById);
adminRouter.patch('/admin/providers/applications/:id/approve', approveApplication);
adminRouter.patch('/admin/providers/applications/:id/reject', rejectApplication);
