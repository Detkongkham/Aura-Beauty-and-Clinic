import { Router, json } from 'express';
import { z } from 'zod';
import {
  attendanceCheckSchema,
  attendanceQuerySchema,
  commissionQuerySchema,
  staffAppointmentStatusSchema,
  staffScheduleQuerySchema,
  treatmentPhotoCreateSchema,
  treatmentRecordUpsertSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import {
  addTreatmentPhotoHandler,
  appointmentItemHandler,
  attendanceStateHandler,
  checkInHandler,
  checkOutHandler,
  commissionHandler,
  getTreatmentHandler,
  scheduleHandler,
  updateStatusHandler,
  upsertTreatmentHandler,
} from './staff-portal.controller.js';

const idParamSchema = z.object({ id: z.string().uuid() });

/**
 * Staff Mobile Portal (Module 06 / Phase 4).
 * ທຸກ route: authGuard + role STAFF ; `staffProfileId` ດຶງຈາກ JWT ພາຍໃນ service.
 */
export const staffPortalRouter: Router = Router();

staffPortalRouter.use(authGuard, roleGuard('STAFF'));

// 1. ຕາຕະລາງງານປະຈຳວັນ
staffPortalRouter.get(
  '/schedule',
  validateRequest({ query: staffScheduleQuerySchema }),
  scheduleHandler,
);

// 3. GPS Attendance (static ກ່ອນ ":id")
staffPortalRouter.get(
  '/attendance',
  validateRequest({ query: attendanceQuerySchema }),
  attendanceStateHandler,
);
staffPortalRouter.post(
  '/attendance/check-in',
  validateRequest({ body: attendanceCheckSchema }),
  checkInHandler,
);
staffPortalRouter.post(
  '/attendance/check-out',
  validateRequest({ body: attendanceCheckSchema }),
  checkOutHandler,
);

// 5. ສະຫຼຸບຄ່າຄອມມິດຊັນ
staffPortalRouter.get(
  '/commission',
  validateRequest({ query: commissionQuerySchema }),
  commissionHandler,
);

// 2. ອັບເດດສະຖານະຄິວ
staffPortalRouter.get(
  '/appointments/:id',
  validateRequest({ params: idParamSchema }),
  appointmentItemHandler,
);
staffPortalRouter.patch(
  '/appointments/:id/status',
  validateRequest({ params: idParamSchema, body: staffAppointmentStatusSchema }),
  updateStatusHandler,
);

// 4. Treatment Records + ຮູບ Before/After/Progress
staffPortalRouter.get(
  '/appointments/:id/treatment',
  validateRequest({ params: idParamSchema }),
  getTreatmentHandler,
);
staffPortalRouter.put(
  '/appointments/:id/treatment',
  validateRequest({ params: idParamSchema, body: treatmentRecordUpsertSchema }),
  upsertTreatmentHandler,
);
// ຮູບ base64 ອາດໃຫຍ່ກວ່າ global 2mb limit — ຍົກ limit ສະເພາະ route ນີ້.
staffPortalRouter.post(
  '/appointments/:id/treatment/photos',
  json({ limit: '8mb' }),
  validateRequest({ params: idParamSchema, body: treatmentPhotoCreateSchema }),
  addTreatmentPhotoHandler,
);
