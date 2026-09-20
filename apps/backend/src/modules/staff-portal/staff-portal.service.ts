import { randomUUID } from 'node:crypto';
import type {
  AttendanceCheckInput,
  AttendanceRecordView,
  AttendanceStateView,
  CommissionQuery,
  CommissionServiceBreakdown,
  CommissionSummaryView,
  StaffAppointmentStatusInput,
  StaffScheduleItem,
  StaffScheduleQuery,
  TreatmentPhotoCreateInput,
  TreatmentPhotoView,
  TreatmentRecordUpsertInput,
  TreatmentRecordView,
} from '@abcp/shared-types';
import type { Prisma, StaffAttendance } from '@prisma/client';
import { Prisma as PrismaNS } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { storage } from '../../storage/index.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  addMinutes,
  minutesOfDayVientiane,
  timeStringToMinutes,
  vientianeDateKey,
  vientianeDayOfWeek,
  vientianeDayStart,
} from '../../utils/dateHelpers.js';
import { haversineMeters } from '../../utils/geo.js';
import { mirrorTicketFromAppointment } from '../queue/queue.service.js';
import { earnPoints } from '../loyalty/loyalty.service.js';
import { consumeServiceStock } from '../inventory/inventory.service.js';
import { rewardReferralOnComplete } from '../referral/referral.service.js';
import { syncTripOnAppointmentStatus } from '../home-service/home-service.service.js';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** YYYY-MM (ຫຼື undefined = ເດືອນປັດຈຸບັນ) → ຊ່ວງ [ຕົ້ນເດືອນ, ທ້າຍເດືອນ) ແບບ UTC. */
function monthRange(month?: string): { from: Date; to: Date; label: string } {
  const now = new Date();
  const y = month ? Number(month.slice(0, 4)) : now.getUTCFullYear();
  const m = month ? Number(month.slice(5, 7)) - 1 : now.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(y, m + 1, 1, 0, 0, 0, 0));
  const label = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}`;
  return { from, to, label };
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** userId (JWT sub) → staffProfileId. 403 ຖ້າ user ນີ້ບໍ່ມີ staff profile. */
export async function resolveStaffProfileId(userId: string): Promise<string> {
  const profile = await prisma.staffProfile.findFirst({
    where: { userId, deletedAt: null },
    select: { id: true },
  });
  if (!profile) throw ApiError.forbidden('ບັນຊີນີ້ບໍ່ແມ່ນພະນັກງານ');
  return profile.id;
}

// ---- 1. ຕາຕະລາງງານປະຈຳວັນ ---------------------------------------------

const SCHEDULE_INCLUDE = {
  customer: { select: { name: true, phone: true } },
  service: { select: { name: true, durationMinutes: true } },
  treatmentRecord: { select: { id: true } },
} satisfies Prisma.AppointmentInclude;

function scheduleCode(id: string): string {
  return `A-${id.slice(0, 8).toUpperCase()}`;
}

type ScheduleRow = Prisma.AppointmentGetPayload<{ include: typeof SCHEDULE_INCLUDE }>;

function toScheduleItem(a: ScheduleRow): StaffScheduleItem {
  return {
    id: a.id,
    code: scheduleCode(a.id),
    status: a.status,
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
    customerId: a.customerId,
    customerName: a.customer.name,
    customerPhone: a.customer.phone,
    serviceId: a.serviceId,
    serviceName: a.service.name,
    serviceDurationMin: a.service.durationMinutes,
    deliveryType: a.deliveryType,
    isWalkIn: a.source === 'WALK_IN',
    homeAddress: a.homeAddress,
    customerNotes: a.customerNotes,
    staffNotes: a.staffNotes,
    hasTreatmentRecord: a.treatmentRecord !== null,
  };
}

export async function getSchedule(
  staffProfileId: string,
  query: StaffScheduleQuery,
): Promise<{ date: string; items: StaffScheduleItem[] }> {
  const dayStart = vientianeDayStart(new Date(`${query.date}T00:00:00.000Z`));
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);
  const rows = await prisma.appointment.findMany({
    where: {
      staffProfileId,
      deletedAt: null,
      startAt: { gte: dayStart, lt: dayEnd },
    },
    include: SCHEDULE_INCLUDE,
    orderBy: { startAt: 'asc' },
  });

  return { date: query.date, items: rows.map(toScheduleItem) };
}

export async function getScheduleItem(
  staffProfileId: string,
  appointmentId: string,
): Promise<StaffScheduleItem> {
  const row = await prisma.appointment.findFirst({
    where: { id: appointmentId, staffProfileId, deletedAt: null },
    include: SCHEDULE_INCLUDE,
  });
  if (!row) throw ApiError.notFound('ບໍ່ພົບນັດໝາຍ ຫຼື ບໍ່ແມ່ນຄິວຂອງທ່ານ');
  return toScheduleItem(row);
}

// ---- 2. ອັບເດດສະຖານະຄິວ ---------------------------------------------

/**
 * ການປ່ຽນສະຖານະທີ່ພະນັກງານໄດ້ຮັບອະນຸຍາດ.
 * PENDING ຍັງເລີ່ມໄດ້ (ຄິວມື້ນີ້ / walk-in ທີ່ໜ້າຮ້ານຍັງບໍ່ທັນຢືນຢັນ).
 */
const STAFF_TRANSITIONS: Record<string, ReadonlyArray<string>> = {
  PENDING: ['IN_PROGRESS'],
  CONFIRMED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
};

const OWNED_APPT_SELECT = {
  id: true,
  status: true,
  totalAmount: true,
  source: true,
  service: { select: { durationMinutes: true } },
} satisfies Prisma.AppointmentSelect;

async function assertOwnedAppointment(
  staffProfileId: string,
  appointmentId: string,
): Promise<Prisma.AppointmentGetPayload<{ select: typeof OWNED_APPT_SELECT }>> {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, staffProfileId, deletedAt: null },
    select: OWNED_APPT_SELECT,
  });
  if (!appt) throw ApiError.notFound('ບໍ່ພົບນັດໝາຍ ຫຼື ບໍ່ແມ່ນຄິວຂອງທ່ານ');
  return appt;
}

export async function updateAppointmentStatus(
  staffProfileId: string,
  appointmentId: string,
  input: StaffAppointmentStatusInput,
): Promise<StaffScheduleItem> {
  const appt = await assertOwnedAppointment(staffProfileId, appointmentId);

  const allowed = STAFF_TRANSITIONS[appt.status] ?? [];
  if (!allowed.includes(input.status)) {
    throw ApiError.conflict(
      `ບໍ່ສາມາດປ່ຽນຈາກ ${appt.status} ໄປ ${input.status} ໄດ້`,
    );
  }

  // walk-in ທີ່ຫາກໍ່ເລີ່ມ → ຕັ້ງ startAt/endAt ໃໝ່ ໃຫ້ Master Calendar ຖືກຕ້ອງ.
  const restamp =
    appt.source === 'WALK_IN' && input.status === 'IN_PROGRESS'
      ? { startAt: new Date(), endAt: addMinutes(new Date(), appt.service.durationMinutes) }
      : {};

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.appointment.update({
      where: { id: appointmentId },
      data: {
        status: input.status,
        ...restamp,
        ...(input.staffNotes !== undefined ? { staffNotes: input.staffNotes } : {}),
      },
      include: SCHEDULE_INCLUDE,
    });

    // ບັດຄິວ walk-in ທີ່ຜູກໄວ້ຕິດຕາມສະຖານະ (no-op ສຳລັບນັດ online).
    await mirrorTicketFromAppointment(tx, appointmentId, input.status);

    // ໂມດູນ 29 — sync HomeServiceTrip (no-op ຖ້າບໍ່ແມ່ນ HOME_SERVICE booking).
    await syncTripOnAppointmentStatus(tx, appointmentId, input.status);

    // ສຳເລັດ → ບັນທຶກຄ່າຄອມມິດຊັນ (idempotent — appointmentId ເປັນ unique).
    if (input.status === 'COMPLETED') {
      const profile = await tx.staffProfile.findUniqueOrThrow({
        where: { id: staffProfileId },
        select: { commissionRate: true },
      });
      const serviceAmount = row.totalAmount;
      const payout = round2(serviceAmount.toNumber() * profile.commissionRate);
      await tx.staffCommission.upsert({
        where: { appointmentId },
        update: {
          serviceAmount,
          commissionRate: profile.commissionRate,
          payoutAmount: new PrismaNS.Decimal(payout),
        },
        create: {
          appointmentId,
          staffProfileId,
          serviceAmount,
          commissionRate: profile.commissionRate,
          payoutAmount: new PrismaNS.Decimal(payout),
        },
      });

      // ໃຫ້ຄະແນນສະສົມ (Module 19) — idempotent ຕໍ່ appt:<id>, ຮ່ວມກັບ path ຊຳລະບິນ.
      await earnPoints(tx, {
        userId: row.customerId,
        amountLak: serviceAmount.toNumber(),
        refId: `appt:${appointmentId}`,
        notes: 'ໄດ້ຄະແນນຈາກການໃຊ້ບໍລິການ',
      });

      // ໂມດູນ 14 — ຕັດສະຕັອກ BOM ອັດຕະໂນມັດ (idempotent ຕໍ່ appt:<id>).
      await consumeServiceStock(tx, { appointmentId, serviceId: row.serviceId });

      // ໂມດູນ 33 — ໃຫ້ລາງວັນຜູ້ແນະນຳ (idempotent ຕໍ່ rewardClaimed).
      await rewardReferralOnComplete(tx, appointmentId);
    }

    return row;
  });

  return toScheduleItem(updated);
}

// ---- 3. GPS Attendance ---------------------------------------------

function toAttendanceView(a: StaffAttendance): AttendanceRecordView {
  return {
    id: a.id,
    date: ymd(a.date),
    checkIn: a.checkIn.toISOString(),
    checkOut: a.checkOut ? a.checkOut.toISOString() : null,
    status: a.status,
    latitude: a.latitude,
    longitude: a.longitude,
    workedMinutes: a.checkOut
      ? Math.round((a.checkOut.getTime() - a.checkIn.getTime()) / 60_000)
      : null,
  };
}

/** ສາຂາປະຈຳຂອງຊ່າງ (isPrimary, ຖ້າບໍ່ມີ = ອັນທຳອິດ). */
async function primaryBranch(staffProfileId: string): Promise<{
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
}> {
  const link = await prisma.staffBranch.findFirst({
    where: { staffProfileId },
    orderBy: { isPrimary: 'desc' },
    select: { branch: { select: { id: true, name: true, latitude: true, longitude: true } } },
  });
  if (!link) throw ApiError.badRequest('ຍັງບໍ່ໄດ້ກຳນົດສາຂາປະຈຳ');
  return link.branch;
}

function assertWithinRadius(
  branch: { latitude: number | null; longitude: number | null },
  input: AttendanceCheckInput,
): void {
  if (branch.latitude == null || branch.longitude == null) return; // ສາຂາບໍ່ມີພິກັດ — ຂ້າມການກວດ
  const dist = haversineMeters(branch.latitude, branch.longitude, input.latitude, input.longitude);
  if (dist > env.STAFF_ATTENDANCE_RADIUS_METERS) {
    throw ApiError.badRequest(
      `ຢູ່ໄກຈາກຮ້ານ ${Math.round(dist)} ແມັດ (ອະນຸຍາດ ${env.STAFF_ATTENDANCE_RADIUS_METERS} ແມັດ)`,
    );
  }
}

async function workingBoundsForToday(
  staffProfileId: string,
  today: Date,
): Promise<{ startMin: number | null; endMin: number | null }> {
  const wh = await prisma.workingHour.findFirst({
    where: { staffProfileId, dayOfWeek: vientianeDayOfWeek(today) },
    select: { startTime: true, endTime: true, isDayOff: true },
  });
  if (!wh || wh.isDayOff) return { startMin: null, endMin: null };
  return { startMin: timeStringToMinutes(wh.startTime), endMin: timeStringToMinutes(wh.endTime) };
}

const LATE_GRACE_MIN = 5;

export async function getAttendanceState(
  staffProfileId: string,
  month?: string,
): Promise<AttendanceStateView> {
  const branch = await primaryBranch(staffProfileId);
  const now = new Date();
  const range = month ? monthRange(month) : null;
  const [todayRow, historyRows] = await Promise.all([
    prisma.staffAttendance.findFirst({
      where: { staffProfileId, date: vientianeDateKey(now) },
    }),
    prisma.staffAttendance.findMany({
      where: range
        ? { staffProfileId, date: { gte: range.from, lt: range.to } }
        : { staffProfileId },
      orderBy: { date: 'desc' },
      take: range ? undefined : 31,
    }),
  ]);

  return {
    today: todayRow ? toAttendanceView(todayRow) : null,
    branch: { ...branch, radiusMeters: env.STAFF_ATTENDANCE_RADIUS_METERS },
    history: historyRows.map(toAttendanceView),
  };
}

export async function checkIn(
  staffProfileId: string,
  input: AttendanceCheckInput,
): Promise<AttendanceRecordView> {
  const branch = await primaryBranch(staffProfileId);
  assertWithinRadius(branch, input);

  const now = new Date();
  const dateKey = vientianeDateKey(now);
  const existing = await prisma.staffAttendance.findFirst({
    where: { staffProfileId, date: dateKey },
  });
  if (existing) throw ApiError.conflict('ລົງເວລາເຂົ້າວຽກແລ້ວມື້ນີ້');

  const { startMin } = await workingBoundsForToday(staffProfileId, now);
  const status =
    startMin != null && minutesOfDayVientiane(now) > startMin + LATE_GRACE_MIN ? 'LATE' : 'ON_TIME';

  const row = await prisma.staffAttendance.create({
    data: {
      staffProfileId,
      date: dateKey,
      checkIn: now,
      latitude: input.latitude,
      longitude: input.longitude,
      status,
    },
  });
  return toAttendanceView(row);
}

export async function checkOut(
  staffProfileId: string,
  input: AttendanceCheckInput,
): Promise<AttendanceRecordView> {
  const branch = await primaryBranch(staffProfileId);
  assertWithinRadius(branch, input);

  const now = new Date();
  const row = await prisma.staffAttendance.findFirst({
    where: { staffProfileId, date: vientianeDateKey(now) },
  });
  if (!row) throw ApiError.badRequest('ຍັງບໍ່ໄດ້ລົງເວລາເຂົ້າວຽກມື້ນີ້');
  if (row.checkOut) throw ApiError.conflict('ລົງເວລາອອກວຽກແລ້ວ');

  const { endMin } = await workingBoundsForToday(staffProfileId, now);
  const nextStatus =
    endMin != null && minutesOfDayVientiane(now) > endMin ? 'OVERTIME' : row.status;

  const updated = await prisma.staffAttendance.update({
    where: { id: row.id },
    data: { checkOut: now, status: nextStatus },
  });
  return toAttendanceView(updated);
}

// ---- 5. ສະຫຼຸບຄ່າຄອມມິດຊັນ ----------------------------------------

export async function getCommissionSummary(
  staffProfileId: string,
  query: CommissionQuery,
): Promise<CommissionSummaryView> {
  const { from, to, label } = monthRange(query.month);
  const profile = await prisma.staffProfile.findUniqueOrThrow({
    where: { id: staffProfileId },
    select: { commissionRate: true },
  });

  const rows = await prisma.staffCommission.findMany({
    where: {
      staffProfileId,
      appointment: { startAt: { gte: from, lt: to }, status: 'COMPLETED', deletedAt: null },
    },
    select: {
      serviceAmount: true,
      payoutAmount: true,
      isPaid: true,
      appointment: { select: { serviceId: true, service: { select: { name: true } } } },
    },
  });

  const byService = new Map<string, CommissionServiceBreakdown>();
  let grossServiceAmount = 0;
  let totalPayout = 0;
  let paidPayout = 0;

  for (const r of rows) {
    const svcAmt = r.serviceAmount.toNumber();
    const payout = r.payoutAmount.toNumber();
    grossServiceAmount += svcAmt;
    totalPayout += payout;
    if (r.isPaid) paidPayout += payout;

    const key = r.appointment.serviceId;
    const bucket =
      byService.get(key) ??
      {
        serviceId: key,
        serviceName: r.appointment.service.name,
        count: 0,
        serviceAmount: 0,
        payoutAmount: 0,
      };
    bucket.count += 1;
    bucket.serviceAmount = round2(bucket.serviceAmount + svcAmt);
    bucket.payoutAmount = round2(bucket.payoutAmount + payout);
    byService.set(key, bucket);
  }

  const kpi = await prisma.staffKpiGoal.findFirst({
    where: { staffProfileId, monthYear: label },
    select: { targetRevenue: true, actualRevenue: true, bonusAmount: true, isBonusPaid: true },
  });

  return {
    month: label,
    commissionRate: profile.commissionRate,
    appointmentsCompleted: rows.length,
    grossServiceAmount: round2(grossServiceAmount),
    totalPayout: round2(totalPayout),
    paidPayout: round2(paidPayout),
    unpaidPayout: round2(totalPayout - paidPayout),
    services: [...byService.values()].sort((a, b) => b.payoutAmount - a.payoutAmount),
    kpiGoal: kpi
      ? {
          targetRevenue: kpi.targetRevenue.toNumber(),
          actualRevenue: kpi.actualRevenue.toNumber(),
          bonusAmount: kpi.bonusAmount.toNumber(),
          isBonusPaid: kpi.isBonusPaid,
        }
      : null,
  };
}

// ---- 4. Treatment Records ----------------------------------------

const TREATMENT_INCLUDE = {
  photos: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TreatmentRecordInclude;

function toTreatmentView(
  r: Prisma.TreatmentRecordGetPayload<{ include: typeof TREATMENT_INCLUDE }>,
): TreatmentRecordView {
  return {
    id: r.id,
    appointmentId: r.appointmentId,
    customerId: r.customerId,
    medicalNotes: r.medicalNotes,
    treatmentDate: r.treatmentDate.toISOString(),
    photos: r.photos.map(
      (p): TreatmentPhotoView => ({
        id: p.id,
        photoUrl: p.photoUrl,
        type: p.type,
        caption: p.caption,
        createdAt: p.createdAt.toISOString(),
      }),
    ),
  };
}

export async function getTreatmentRecord(
  staffProfileId: string,
  appointmentId: string,
): Promise<TreatmentRecordView | null> {
  await assertOwnedAppointment(staffProfileId, appointmentId);
  const row = await prisma.treatmentRecord.findUnique({
    where: { appointmentId },
    include: TREATMENT_INCLUDE,
  });
  return row ? toTreatmentView(row) : null;
}

export async function upsertTreatmentRecord(
  staffProfileId: string,
  appointmentId: string,
  input: TreatmentRecordUpsertInput,
): Promise<TreatmentRecordView> {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, staffProfileId, deletedAt: null },
    select: { customerId: true },
  });
  if (!appt) throw ApiError.notFound('ບໍ່ພົບນັດໝາຍ ຫຼື ບໍ່ແມ່ນຄິວຂອງທ່ານ');

  const row = await prisma.treatmentRecord.upsert({
    where: { appointmentId },
    update: { medicalNotes: input.medicalNotes ?? null },
    create: {
      appointmentId,
      customerId: appt.customerId,
      medicalNotes: input.medicalNotes ?? null,
    },
    include: TREATMENT_INCLUDE,
  });
  return toTreatmentView(row);
}

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function addTreatmentPhoto(
  staffProfileId: string,
  appointmentId: string,
  input: TreatmentPhotoCreateInput,
): Promise<TreatmentPhotoView> {
  const record = await upsertTreatmentRecord(staffProfileId, appointmentId, {});

  const buffer = Buffer.from(input.dataBase64, 'base64');
  if (buffer.byteLength === 0) throw ApiError.badRequest('ຮູບບໍ່ຖືກຕ້ອງ');
  if (buffer.byteLength > MAX_PHOTO_BYTES) throw ApiError.badRequest('ຮູບໃຫຍ່ເກີນ 6MB');

  const ext = EXT_BY_TYPE[input.contentType] ?? 'jpg';
  const key = `treatments/${record.id}/${randomUUID()}.${ext}`;
  const { url } = await storage.save(key, buffer, input.contentType);

  const photo = await prisma.treatmentPhoto.create({
    data: {
      treatmentRecordId: record.id,
      photoUrl: url,
      type: input.type,
      caption: input.caption ?? null,
    },
  });
  return {
    id: photo.id,
    photoUrl: photo.photoUrl,
    type: photo.type,
    caption: photo.caption,
    createdAt: photo.createdAt.toISOString(),
  };
}
