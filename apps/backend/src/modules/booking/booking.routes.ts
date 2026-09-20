import { Router } from 'express';
import { z } from 'zod';
import {
  availabilityQuerySchema,
  cancelAppointmentSchema,
  createAppointmentSchema,
  createReviewSchema,
  customerCreateAppointmentSchema,
  myAppointmentsQuerySchema,
  rescheduleAppointmentSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  availabilityHandler,
  bookingPolicyHandler,
  cancelAppointmentHandler,
  createAppointmentHandler,
  customerCreateAppointmentHandler,
  myAppointmentDetailHandler,
  myAppointmentsHandler,
  rescheduleAppointmentHandler,
  reviewAppointmentHandler,
} from './booking.controller.js';

const idParamSchema = z.object({ id: z.string().uuid() });

export const bookingRouter: Router = Router();

/** GET /booking/policy — ນະໂຍບາຍຍົກເລີກ/ເລື່ອນນັດ (ຈາກ Settings) ໃຫ້ແອັບສະແດງກ່ອນຈອງ. */
bookingRouter.get('/policy', authGuard, bookingPolicyHandler);

bookingRouter.get(
  '/availability',
  authGuard,
  validateRequest({ query: availabilityQuerySchema }),
  availabilityHandler,
);

/**
 * POST /booking/appointments — ໜ້າຮ້ານ/ຜູ້ຈັດການຈອງໃຫ້ລູກຄ້າ (customerId ມາຈາກ body).
 * roleGuard ຈຳເປັນ: ບໍ່ດັ່ງນັ້ນລູກຄ້າຄົນໃດກໍ່ຈອງແທນ customerId ຄົນອື່ນໄດ້.
 * ລູກຄ້າຈອງໃຫ້ຕົນເອງແມ່ນ POST /appointments/me ຕ່າງຫາກ.
 */
bookingRouter.post(
  '/appointments',
  authGuard,
  roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'),
  validateRequest({ body: createAppointmentSchema }),
  createAppointmentHandler,
);

// ---- Customer App (Module 05) ----------------------------------------

bookingRouter.get(
  '/appointments/me',
  authGuard,
  validateRequest({ query: myAppointmentsQuerySchema }),
  myAppointmentsHandler,
);

bookingRouter.post(
  '/appointments/me',
  authGuard,
  roleGuard('CUSTOMER'),
  validateRequest({ body: customerCreateAppointmentSchema }),
  customerCreateAppointmentHandler,
);

bookingRouter.get(
  '/appointments/:id',
  authGuard,
  validateRequest({ params: idParamSchema }),
  myAppointmentDetailHandler,
);

bookingRouter.patch(
  '/appointments/:id/cancel',
  authGuard,
  validateRequest({ params: idParamSchema, body: cancelAppointmentSchema }),
  cancelAppointmentHandler,
);

bookingRouter.patch(
  '/appointments/:id/reschedule',
  authGuard,
  validateRequest({ params: idParamSchema, body: rescheduleAppointmentSchema }),
  rescheduleAppointmentHandler,
);

bookingRouter.post(
  '/appointments/:id/review',
  authGuard,
  validateRequest({ params: idParamSchema, body: createReviewSchema }),
  reviewAppointmentHandler,
);
