import { Router } from 'express';
import { z } from 'zod';
import {
  adminAppointmentSummaryQuerySchema,
  adminAppointmentsQuerySchema,
  adminRescheduleSchema,
  adminCalendarQuerySchema,
  bulkAppointmentStatusSchema,
  updateAppointmentStatusSchema,
  walkInSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { walkInHandler } from '../queue/queue.controller.js';
import {
  appointmentDetailHandler,
  appointmentSummaryHandler,
  bulkStatusHandler,
  calendarHandler,
  listAppointmentsHandler,
  rescheduleHandler,
  updateStatusHandler,
} from './appointments.controller.js';

const idParamSchema = z.object({ id: z.string().uuid() });

/**
 * Admin / front-desk view of appointments (Module 03 — Master Calendar).
 * ອ່ານໄດ້ໂດຍ SUPER_ADMIN / BRANCH_ADMIN / STAFF; ປ່ຽນສະຖານະໄດ້ໂດຍ admin.
 */
export const appointmentsRouter: Router = Router();

appointmentsRouter.use(authGuard);

appointmentsRouter.get(
  '/',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  validateRequest({ query: adminAppointmentsQuerySchema }),
  listAppointmentsHandler,
);

// Static routes before the ":id" wildcard.
appointmentsRouter.post(
  '/walk-in',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  validateRequest({ body: walkInSchema }),
  walkInHandler,
);

appointmentsRouter.get(
  '/summary',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  validateRequest({ query: adminAppointmentSummaryQuerySchema }),
  appointmentSummaryHandler,
);

appointmentsRouter.post(
  '/bulk-status',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ body: bulkAppointmentStatusSchema }),
  bulkStatusHandler,
);

appointmentsRouter.get(
  '/calendar',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  validateRequest({ query: adminCalendarQuerySchema }),
  calendarHandler,
);

appointmentsRouter.get(
  '/:id',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  validateRequest({ params: idParamSchema }),
  appointmentDetailHandler,
);

appointmentsRouter.patch(
  '/:id/reschedule',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ params: idParamSchema, body: adminRescheduleSchema }),
  rescheduleHandler,
);

appointmentsRouter.patch(
  '/:id/status',
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'),
  validateRequest({ params: idParamSchema, body: updateAppointmentStatusSchema }),
  updateStatusHandler,
);
