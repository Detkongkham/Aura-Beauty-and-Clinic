import { Router } from 'express';
import { z } from 'zod';
import {
  accountActivityQuerySchema,
  changePasswordSchema,
  loginSchema,
  quickLoginInputSchema,
  refreshSchema,
  registerSchema,
  setOwnQuickLoginPinSchema,
  updateProfileSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { authLimiter } from '../../middlewares/rateLimiter.js';
import {
  activityHandler,
  changePasswordHandler,
  disableOwnPinHandler,
  listSessionsHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  overviewHandler,
  quickLoginHandler,
  refreshHandler,
  registerHandler,
  revokeOtherSessionsHandler,
  revokeSessionHandler,
  setOwnPinHandler,
  updateProfileHandler,
} from './auth.controller.js';

const sessionIdParamSchema = z.object({ id: z.string().uuid() });

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

// Refresh token in the body (not the access token) so logout still works after the 15-min access TTL.
authRouter.post('/logout', validateRequest({ body: refreshSchema }), logoutHandler);

// --- Account console (web-admin /account) — always the caller's own account ---
authRouter.get('/me/overview', authGuard, overviewHandler);
authRouter.get('/me/sessions', authGuard, listSessionsHandler);
// Static sub-route before ":id" so it isn't shadowed.
authRouter.post('/me/sessions/revoke-others', authGuard, revokeOtherSessionsHandler);
authRouter.delete(
  '/me/sessions/:id',
  authGuard,
  validateRequest({ params: sessionIdParamSchema }),
  revokeSessionHandler,
);
authRouter.get('/me/activity', authGuard, validateRequest({ query: accountActivityQuerySchema }), activityHandler);
authRouter.put(
  '/me/quick-login-pin',
  authGuard,
  authLimiter,
  validateRequest({ body: setOwnQuickLoginPinSchema }),
  setOwnPinHandler,
);
authRouter.delete('/me/quick-login-pin', authGuard, disableOwnPinHandler);
