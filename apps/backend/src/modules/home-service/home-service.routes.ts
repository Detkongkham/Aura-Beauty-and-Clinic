import { Router } from 'express';
import { z } from 'zod';
import {
  assignTripSchema,
  homeServiceTripListQuerySchema,
  locationPingSchema,
  staffAvailabilityUpdateSchema,
  tripStatusUpdateSchema,
} from '@abcp/shared-types';
import { authGuard } from '../../middlewares/authGuard.js';
import { roleGuard } from '../../middlewares/roleGuard.js';
import { validateRequest } from '../../middlewares/validateRequest.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { emitHomeServiceAdminUpdate, emitTripLocation, emitTripStatus } from '../../realtime/socket.js';
import * as homeService from './home-service.service.js';

const appointmentIdParamSchema = z.object({ appointmentId: z.string().uuid() });

/** GET /home-service/:appointmentId — ລູກຄ້າເຈົ້າຂອງ, ຊ່າງທີ່ຖືກຈັບຄູ່, ຫຼື admin (ໂມດູນ 29). */
export const homeServiceTripsRouter: Router = Router();
homeServiceTripsRouter.use(authGuard);
homeServiceTripsRouter.get(
  '/:appointmentId',
  validateRequest({ params: appointmentIdParamSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await homeService.getTripView(req.auth!, req.params.appointmentId!) });
  }),
);

/** /home-service/staff — ຊ່າງເປີດ/ປິດຮັບວຽກ, ping ຕຳແໜ່ງ, ປ່ຽນສະຖານະວຽກຂອງຕົນເອງ. */
export const homeServiceStaffRouter: Router = Router();
homeServiceStaffRouter.use(authGuard, roleGuard('STAFF'));

homeServiceStaffRouter.get(
  '/availability',
  asyncHandler(async (req, res) => {
    res.json({ data: await homeService.getStaffAvailability(req.auth!.sub) });
  }),
);

homeServiceStaffRouter.patch(
  '/availability',
  validateRequest({ body: staffAvailabilityUpdateSchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await homeService.setStaffAvailability(req.auth!.sub, req.body.isAvailable) });
  }),
);

homeServiceStaffRouter.post(
  '/location',
  validateRequest({ body: locationPingSchema }),
  asyncHandler(async (req, res) => {
    const event = await homeService.recordLocationPing(req.auth!.sub, req.body);
    if (event) {
      emitTripLocation(event);
      const view = await homeService.getTripViewByAppointmentId(event.appointmentId);
      if (view) emitHomeServiceAdminUpdate(view);
    }
    res.json({ data: event });
  }),
);

homeServiceStaffRouter.patch(
  '/trips/:appointmentId/status',
  validateRequest({ params: appointmentIdParamSchema, body: tripStatusUpdateSchema }),
  asyncHandler(async (req, res) => {
    const result = await homeService.updateTripStatusByStaff(
      req.auth!.sub,
      req.params.appointmentId!,
      req.body,
    );
    emitTripStatus(result);
    const view = await homeService.getTripViewByAppointmentId(result.appointmentId);
    if (view) emitHomeServiceAdminUpdate(view);
    res.json({
      data: result,
    });
  }),
);

/** /home-service/admin — Web Admin ▸ Dispatch (Module 29). */
export const homeServiceAdminRouter: Router = Router();
homeServiceAdminRouter.use(authGuard, roleGuard('SUPER_ADMIN', 'BRANCH_ADMIN'));

homeServiceAdminRouter.get(
  '/trips',
  validateRequest({ query: homeServiceTripListQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json({ data: await homeService.listTrips(req.query as never) });
  }),
);

homeServiceAdminRouter.patch(
  '/trips/:appointmentId/assign',
  validateRequest({ params: appointmentIdParamSchema, body: assignTripSchema }),
  asyncHandler(async (req, res) => {
    const trip = await homeService.assignTrip(req.params.appointmentId!, req.body.staffProfileId);
    emitHomeServiceAdminUpdate(trip);
    res.json({ data: trip });
  }),
);
