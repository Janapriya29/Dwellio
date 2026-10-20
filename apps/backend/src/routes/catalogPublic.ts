import { Router } from 'express';
import {
  getPublicCategories,
  getPublicServices,
  getPublicProviders,
} from '../controllers/catalogPublic';
import { catalogDiscoveryRateLimiter } from '../middleware/rateLimiter';

export const catalogPublicRouter = Router();

catalogPublicRouter.get('/catalog/categories', catalogDiscoveryRateLimiter, getPublicCategories);
catalogPublicRouter.get('/catalog/services', catalogDiscoveryRateLimiter, getPublicServices);
catalogPublicRouter.get('/catalog/providers', catalogDiscoveryRateLimiter, getPublicProviders);
