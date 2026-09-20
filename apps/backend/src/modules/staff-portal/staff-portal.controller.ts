import type { Request, Response } from 'express';
import type {
  AttendanceCheckInput,
  CommissionQuery,
  StaffAppointmentStatusInput,
  StaffScheduleQuery,
  TreatmentPhotoCreateInput,
  TreatmentRecordUpsertInput,
} from '@abcp/shared-types';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as service from './staff-portal.service.js';

/** ທຸກ handler ຮຽກຫຼັງ authGuard + roleGuard('STAFF') — `sub` ຄື userId. */
async function staffId(req: Request): Promise<string> {
  return service.resolveStaffProfileId(req.auth!.sub);
}

/** GET /staff-portal/schedule?date= */
export const scheduleHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getSchedule(
    await staffId(req),
    req.query as unknown as StaffScheduleQuery,
  );
  res.json({ data });
});

/** GET /staff-portal/appointments/:id */
export const appointmentItemHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getScheduleItem(await staffId(req), req.params.id!);
  res.json({ data });
});

/** PATCH /staff-portal/appointments/:id/status */
export const updateStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.updateAppointmentStatus(
    await staffId(req),
    req.params.id!,
    req.body as StaffAppointmentStatusInput,
  );
  res.json({ data });
});

/** GET /staff-portal/attendance?month= */
export const attendanceStateHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getAttendanceState(
    await staffId(req),
    (req.query as { month?: string }).month,
  );
  res.json({ data });
});

/** POST /staff-portal/attendance/check-in */
export const checkInHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.checkIn(await staffId(req), req.body as AttendanceCheckInput);
  res.status(201).json({ data });
});

/** POST /staff-portal/attendance/check-out */
export const checkOutHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.checkOut(await staffId(req), req.body as AttendanceCheckInput);
  res.json({ data });
});

/** GET /staff-portal/commission?month= */
export const commissionHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getCommissionSummary(
    await staffId(req),
    req.query as unknown as CommissionQuery,
  );
  res.json({ data });
});

/** GET /staff-portal/appointments/:id/treatment */
export const getTreatmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.getTreatmentRecord(await staffId(req), req.params.id!);
  res.json({ data });
});

/** PUT /staff-portal/appointments/:id/treatment */
export const upsertTreatmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.upsertTreatmentRecord(
    await staffId(req),
    req.params.id!,
    req.body as TreatmentRecordUpsertInput,
  );
  res.json({ data });
});

/** POST /staff-portal/appointments/:id/treatment/photos */
export const addTreatmentPhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await service.addTreatmentPhoto(
    await staffId(req),
    req.params.id!,
    req.body as TreatmentPhotoCreateInput,
  );
  res.status(201).json({ data });
});
