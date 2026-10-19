import { Router } from 'express';
import {
  getPublicCategories,
  getPublicServices,
  getPublicProviders,
} from '../controllers/catalogPublic';

export const catalogPublicRouter = Router();

catalogPublicRouter.get('/catalog/categories', getPublicCategories);
catalogPublicRouter.get('/catalog/services', getPublicServices);
catalogPublicRouter.get('/catalog/providers', getPublicProviders);
