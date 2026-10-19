import { Router } from 'express';
import { applyProvider, getApplicationStatus } from '../controllers/provider';
import { requireAuth } from '../middleware/auth';

export const providerRouter = Router();

// Provider application & status endpoints (Customer-facing authenticated routes)
providerRouter.post('/providers/apply', requireAuth, applyProvider);
providerRouter.get('/providers/application-status', requireAuth, getApplicationStatus);
