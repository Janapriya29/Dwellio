import { Router } from 'express';
import {
  getPublicCategories,
  getPublicServices,
  getPublicProviders,
  getProviderAvailability,
} from '../controllers/catalogPublic';
import { catalogDiscoveryRateLimiter } from '../middleware/rateLimiter';

export const catalogPublicRouter = Router();

catalogPublicRouter.get('/catalog/categories', catalogDiscoveryRateLimiter, getPublicCategories);
catalogPublicRouter.get('/catalog/services', catalogDiscoveryRateLimiter, getPublicServices);
catalogPublicRouter.get('/catalog/providers', catalogDiscoveryRateLimiter, getPublicProviders);
catalogPublicRouter.get('/catalog/providers/:id/availability', catalogDiscoveryRateLimiter, getProviderAvailability);
