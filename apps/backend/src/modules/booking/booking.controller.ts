import type { Request, Response } from 'express';
import type { MyAppointmentsQuery } from '@abcp/shared-types';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { reminderQueue } from '../../jobs/queues.js';
import { emitHomeServiceAdminUpdate } from '../../realtime/socket.js';
import { getTripViewByAppointmentId, notifyBranchAdmins } from '../home-service/home-service.service.js';
import * as bookingService from './booking.service.js';

/**
 * ໂມດູນ 29 — ຫຼັງສ້າງ HOME_SERVICE appointment ສຳເລັດ, broadcast trip ໃໝ່ໃຫ້ dispatch console ສະເໝີ
 * (ASSIGNED ຫຼື NO_MATCH), ແລະຍິງ push ໃຫ້ branch admin ສະເພາະຕອນ NO_MATCH (ຕ້ອງການຄວາມສົນໃຈ).
 * ບໍ່ໃຫ້ຄວາມພັງບ່ອນນີ້ກະທົບການຈອງທີ່ສຳເລັດແລ້ວ.
 */
async function notifyHomeServiceBookingResult(appointmentId: string): Promise<void> {
  try {
    const trip = await getTripViewByAppointmentId(appointmentId);
    if (!trip) return;
    emitHomeServiceAdminUpdate(trip);
    if (trip.status === 'NO_MATCH') {
      await notifyBranchAdmins(trip.branchId, {
        type: 'HOME_SERVICE_NO_MATCH',
        title: 'ວຽກ Home Service ຕ້ອງການຄວາມສົນໃຈ',
        body: `${trip.customerName} — ຍັງບໍ່ໄດ້ຈັບຄູ່ຊ່າງ, ກະລຸນາຈັດຊ່າງໃຫ້ໃນ Dispatch`,
        data: { appointmentId },
        dedupeKey: `hs-no-match:${appointmentId}`,
      });
    }
  } catch {
    /* best-effort — ບໍ່ໃຫ້ກະທົບການຈອງທີ່ສຳເລັດແລ້ວ */
  }
}

export const availabilityHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await bookingService.getAvailability({
    branchId: String(req.query.branchId),
    serviceId: String(req.query.serviceId),
    date: new Date(String(req.query.date)),
    staffProfileId: req.query.staffProfileId ? String(req.query.staffProfileId) : undefined,
  });
  res.json({ data: result });
});

export const createAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const appointment = await bookingService.createAppointment(req.body);

  // enqueue reminder 24h / 1h (Module 23) — job ຈະ no-op ຖ້າ Redis ບໍ່ພ້ອມ.
  await reminderQueue.add('schedule', { appointmentId: appointment.id }).catch(() => undefined);
  await notifyHomeServiceBookingResult(appointment.id);

  res.status(201).json({ data: appointment });
});

/** POST /booking/appointments/me — Customer App ຈອງໃຫ້ຕົນເອງ. */
export const customerCreateAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const appointment = await bookingService.createAppointmentForCustomer(req.auth!.sub, req.body);
  await reminderQueue.add('schedule', { appointmentId: appointment.id }).catch(() => undefined);
  await notifyHomeServiceBookingResult(appointment.id);
  res.status(201).json({ data: appointment });
});

/** GET /booking/appointments/me */
export const myAppointmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await bookingService.getMyAppointments(
    req.auth!.sub,
    req.query as unknown as MyAppointmentsQuery,
  );
  res.json({ data });
});

/** GET /booking/appointments/:id */
export const myAppointmentDetailHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await bookingService.getMyAppointmentDetail(req.params.id!, req.auth!.sub);
  res.json({ data });
});

/** GET /booking/policy */
export const bookingPolicyHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ data: await bookingService.getBookingPolicy() });
});

/** PATCH /booking/appointments/:id/cancel */
export const cancelAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await bookingService.cancelAppointment(req.params.id!, req.auth!.sub, req.body);
  res.json({ data });
});

/** PATCH /booking/appointments/:id/reschedule */
export const rescheduleAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await bookingService.rescheduleAppointment(req.params.id!, req.auth!.sub, req.body);
  res.json({ data });
});

/** POST /booking/appointments/:id/review */
export const reviewAppointmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await bookingService.addReview(req.params.id!, req.auth!.sub, req.body);
  res.status(201).json({ data });
});
