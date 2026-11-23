import { Router } from 'express';
import { applyProvider, getApplicationStatus } from '../controllers/provider';
import { getMyProviderProfile, updateMyProviderProfile } from '../controllers/providerProfile';
import {
  getMySchedule,
  updateMySchedule,
  updateMyAvailabilityStatus,
} from '../controllers/providerSchedule';
import { getMyDashboardStats, getMyReviews } from '../controllers/providerDashboard';
import {
  getProviderEarningsSummary,
  getProviderEarningsLedger,
  getProviderPayoutAccount,
  updateProviderPayoutAccount,
} from '../controllers/providerPayoutController';
import { requireAuth, requireApprovedProvider } from '../middleware/auth';

export const providerRouter = Router();

// Provider application & status endpoints (Customer-facing authenticated routes)
providerRouter.post('/providers/apply', requireAuth, applyProvider);
providerRouter.get('/providers/application-status', requireAuth, getApplicationStatus);

// Approved Provider Profile management endpoints (Phase 2 Milestone 2A)
providerRouter.get('/provider/profile', requireAuth, requireApprovedProvider, getMyProviderProfile);
providerRouter.patch('/provider/profile', requireAuth, requireApprovedProvider, updateMyProviderProfile);

// Approved Provider Schedule & Availability endpoints (Phase 2 Milestone 2B)
providerRouter.get('/provider/schedule', requireAuth, requireApprovedProvider, getMySchedule);
providerRouter.put('/provider/schedule', requireAuth, requireApprovedProvider, updateMySchedule);
providerRouter.patch('/provider/availability-status', requireAuth, requireApprovedProvider, updateMyAvailabilityStatus);

// Approved Provider Dashboard & Reviews endpoints (Phase 2 Milestone 2D)
providerRouter.get('/provider/dashboard/stats', requireAuth, requireApprovedProvider, getMyDashboardStats);
providerRouter.get('/provider/reviews', requireAuth, requireApprovedProvider, getMyReviews);

// Approved Provider Earnings Ledger & Payout Account endpoints (Phase 4 Milestone 4B)
providerRouter.get('/provider/earnings/summary', requireAuth, requireApprovedProvider, getProviderEarningsSummary);
providerRouter.get('/provider/earnings/ledger', requireAuth, requireApprovedProvider, getProviderEarningsLedger);
providerRouter.get('/provider/payout-account', requireAuth, requireApprovedProvider, getProviderPayoutAccount);
providerRouter.post('/provider/payout-account', requireAuth, requireApprovedProvider, updateProviderPayoutAccount);
providerRouter.put('/provider/payout-account', requireAuth, requireApprovedProvider, updateProviderPayoutAccount);
