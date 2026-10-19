import { Router } from 'express';
import { register, login, getMe } from '../controllers/auth';
import { requireAuth } from '../middleware/auth';
import { authRateLimiter } from '../middleware/rateLimiter';

export const authRouter = Router();

// Public auth endpoints with rate limiting
authRouter.post('/auth/register', authRateLimiter, register);
authRouter.post('/auth/login', authRateLimiter, login);

// Authenticated current-user profile
authRouter.get('/auth/me', requireAuth, getMe);
