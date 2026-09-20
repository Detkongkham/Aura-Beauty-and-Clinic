import { Router } from 'express';
import { dashboardStatsQuerySchema } from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { dashboardStatsHandler } from './dashboard.controller.js';

/** Module 07 — Web Admin Dashboard Overview. Admin / manager only. */
export const dashboardRouter: Router = Router();

dashboardRouter.get(
  '/stats',
  authGuard,
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ query: dashboardStatsQuerySchema }),
  dashboardStatsHandler,
);
