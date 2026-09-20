import { Router } from 'express';
import {
  changePasswordSchema,
  loginSchema,
  quickLoginInputSchema,
  refreshSchema,
  registerSchema,
  updateProfileSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { authLimiter } from '../../middlewares/rateLimiter.js';
import {
  changePasswordHandler,
  loginHandler,
  meHandler,
  quickLoginHandler,
  refreshHandler,
  registerHandler,
  updateProfileHandler,
} from './auth.controller.js';

export const authRouter: Router = Router();

authRouter.post('/register', authLimiter, validateRequest({ body: registerSchema }), registerHandler);
authRouter.post('/login', authLimiter, validateRequest({ body: loginSchema }), loginHandler);
authRouter.post(
  '/quick-login',
  authLimiter,
  validateRequest({ body: quickLoginInputSchema }),
  quickLoginHandler,
);
authRouter.post('/refresh', authLimiter, validateRequest({ body: refreshSchema }), refreshHandler);
authRouter.get('/me', authGuard, meHandler);
authRouter.patch(
  '/me',
  authGuard,
  validateRequest({ body: updateProfileSchema }),
  updateProfileHandler,
);
authRouter.post(
  '/change-password',
  authGuard,
  authLimiter,
  validateRequest({ body: changePasswordSchema }),
  changePasswordHandler,
);
