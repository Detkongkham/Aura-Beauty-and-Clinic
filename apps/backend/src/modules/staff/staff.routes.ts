import { Router } from 'express';
import { z } from 'zod';
import { adminStaffUpdateSchema, staffListQuerySchema, timeOffDecisionSchema } from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  decideTimeOffHandler,
  getStaffHandler,
  listStaffHandler,
  listTimeOffHandler,
  updateStaffHandler,
} from './staff.controller.js';

const idParamSchema = z.object({ id: z.string().uuid() });

export const staffRouter: Router = Router();

staffRouter.use(authGuard);

// GET /staff serves both the Customer App (array) and Web Admin (paginated, ?page=).
// The `staffListQuerySchema` covers the customer filters; admin's extra params
// (page/pageSize/q) are validated inside the admin branch's own schema.
staffRouter.get('/', validateRequest({ query: staffListQuerySchema.passthrough() }), listStaffHandler);

// Static "/time-off" sub-routes before the ":id" wildcard.
staffRouter.get(
  '/time-off',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  listTimeOffHandler,
);
staffRouter.patch(
  '/time-off/:id',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ params: idParamSchema, body: timeOffDecisionSchema }),
  decideTimeOffHandler,
);

staffRouter.get('/:id', validateRequest({ params: idParamSchema }), getStaffHandler);
staffRouter.patch(
  '/:id',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ params: idParamSchema, body: adminStaffUpdateSchema }),
  updateStaffHandler,
);
