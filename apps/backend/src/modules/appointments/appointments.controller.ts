import type { Request, Response } from 'express';
import type {
  AdminAppointmentSummaryQuery,
  AdminAppointmentsQuery,
  AdminCalendarQuery,
  AdminRescheduleInput,
  BulkAppointmentStatusInput,
  UpdateAppointmentStatusInput,
} from '@abcp/shared-types';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as appointmentsService from './appointments.service.js';

/** GET /appointments */
export const listAppointmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await appointmentsService.listAppointments(
    req.query as unknown as AdminAppointmentsQuery,
  );
  res.json({ data });
});

/** GET /appointments/summary — ຕົວເລກລວມທັງຊຸດຕາມຕົວກອງ (ບໍ່ຈຳກັດຈຳນວນໜ້າ). */
export const appointmentSummaryHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await appointmentsService.getAppointmentSummary(
    req.query as unknown as AdminAppointmentSummaryQuery,
  );
  res.json({ data });
});

/** GET /appointments/calendar */
export const calendarHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await appointmentsService.getCalendar(req.query as unknown as AdminCalendarQuery);
  res.json({ data });
});

/** GET /appointments/:id */
export const appointmentDetailHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await appointmentsService.getAppointmentDetail(req.params.id!);
  res.json({ data });
});

/** PATCH /appointments/:id/status */
export const updateStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await appointmentsService.updateAppointmentStatus(
    req.params.id!,
    req.body as UpdateAppointmentStatusInput,
  );
  res.json({ data });
});

/** POST /appointments/bulk-status */
export const bulkStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await appointmentsService.bulkUpdateAppointmentStatus(
    req.body as BulkAppointmentStatusInput,
  );
  res.json({ data });
});

/** PATCH /appointments/:id/reschedule */
export const rescheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await appointmentsService.rescheduleAppointmentAsAdmin(
    req.params.id!,
    req.body as AdminRescheduleInput,
  );
  res.json({ data });
});
