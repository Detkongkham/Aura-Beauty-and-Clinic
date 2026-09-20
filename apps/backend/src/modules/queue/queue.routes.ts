import { Router } from 'express';
import { z } from 'zod';
import {
  queueCheckInSchema,
  queueClearStaleSchema,
  queueListQuerySchema,
  queueSetStatusSchema,
  queueUpdateDetailsSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { checkInByAppointment } from './queue.service.js';
import {
  clearStaleHandler,
  listQueueHandler,
  recallTicketHandler,
  setTicketStatusHandler,
  updateTicketDetailsHandler,
} from './queue.controller.js';

const idParamSchema = z.object({ id: z.string().uuid() });

/** Module 07 — Queue board (Web Admin ▸ front desk). Walk-in POST lives on /appointments/walk-in. */
export const queueRouter: Router = Router();

/** POST /queue/check-in — QR Check-in ໜ້າຮ້ານ (Module 10). ລູກຄ້າ scan QR ສາຂາ. */
queueRouter.post(
  '/check-in',
  authGuard,
  validateRequest({ body: queueCheckInSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await checkInByAppointment(req.auth!.sub, req.body) });
  }),
);

queueRouter.use(authGuard, roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'));

queueRouter.get('/', validateRequest({ query: queueListQuerySchema }), listQueueHandler);
queueRouter.post(
  '/clear-stale',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ body: queueClearStaleSchema }),
  clearStaleHandler,
);
queueRouter.post('/:id/recall', validateRequest({ params: idParamSchema }), recallTicketHandler);
queueRouter.patch(
  '/:id/details',
  validateRequest({ params: idParamSchema, body: queueUpdateDetailsSchema }),
  updateTicketDetailsHandler,
);
queueRouter.patch(
  '/:id',
  validateRequest({ params: idParamSchema, body: queueSetStatusSchema }),
  setTicketStatusHandler,
);
