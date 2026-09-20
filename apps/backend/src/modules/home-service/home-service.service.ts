import type {
  AccessTokenPayload,
  HomeServiceLocationEvent,
  HomeServiceTripListQuery,
  HomeServiceTripView,
  TripStatusUpdateInput,
} from '@abcp/shared-types';
import type { HomeServiceJobStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { ErrorCode } from '../../constants/errorCodes.js';
import { haversineMeters } from '../../utils/geo.js';
import { PRICE_ROUNDING_LAK, TRAVEL_FEE_BASE_LAK, TRAVEL_FEE_PER_KM_LAK } from '../../constants/phase7.js';
import { notifyUser } from '../../services/push.js';
import { resolveStaffProfileId } from '../staff-portal/staff-portal.service.js';

type Db = Prisma.TransactionClient | typeof prisma;

/** ຊ່າງທີ່ບໍ່ໄດ້ ping ຕຳແໜ່ງໃນ 15 ນາທີຫຼ້າສຸດ = ບໍ່ຖືວ່າ "ວ່າງແທ້" (ອາດປິດແອັບ/ອອຟລາຍ). */
const LOCATION_FRESHNESS_MS = 15 * 60_000;
/** ຄວາມໄວສະເລ່ຍທີ່ໃຊ້ຄິດໄລ່ ETA ຄ່າວໆ (ກມ/ຊມ) — ບໍ່ອີງ traffic ຈິງ. */
const AVG_SPEED_KMPH = 30;

function roundLak(value: number): number {
  return Math.max(0, Math.round(value / PRICE_ROUNDING_LAK) * PRICE_ROUNDING_LAK);
}

/** ຄ່າທຳນຽມເດີນທາງ = ພື້ນຖານ + (ໄລຍະທາງ km × ອັດຕາ/km), ປັດລົງໂຕເຕັມຄືກັນກັບ dynamic pricing. */
export function computeTravelFee(distanceMeters: number): number {
  return roundLak(TRAVEL_FEE_BASE_LAK + TRAVEL_FEE_PER_KM_LAK * (distanceMeters / 1000));
}

type MatchResult = { staffProfileId: string; distanceMeters: number | null; matched: boolean };

function rankByDistance<T extends { id: string; lastKnownLatitude: number | null; lastKnownLongitude: number | null }>(
  candidates: T[],
  destLatitude: number,
  destLongitude: number,
): { staffProfileId: string; distanceMeters: number | null }[] {
  return candidates
    .map((c) => ({
      staffProfileId: c.id,
      distanceMeters:
        c.lastKnownLatitude != null && c.lastKnownLongitude != null
          ? haversineMeters(destLatitude, destLongitude, c.lastKnownLatitude, c.lastKnownLongitude)
          : null,
    }))
    .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
}

/**
 * ຊອກຊ່າງທີ່ວ່າງ + ໃກ້ຈຸດໝາຍທີ່ສຸດ ສຳລັບ HOME_SERVICE booking ໜຶ່ງ (ຮັນຢູ່ໃນ tx ດຽວກັນກັບ createAppointment).
 *
 * ຈັບຄູ່ 3 ລະດັບ ໂດຍບໍ່ throw ຍົກເວັ້ນລະດັບ 4 (ສາຂາບໍ່ມີຊ່າງ active ຄົນໃດເລີຍ):
 *  1. ວ່າງ + ຕຳແໜ່ງສົດ + ບໍ່ຕິດຄິວ + ຢູ່ໃນລັດສະໝີ → `matched: true` (ຄືເດີມ).
 *  2. ຕັດເງື່ອນໄຂ availability/ຄວາມສົດ/ລັດສະໝີ/ຕິດຄິວ, ຄົງແຕ່ຝຶກອົບຮົມບໍລິການນີ້ຢູ່ສາຂາດຽວກັນ → `matched: false`.
 *  3. ຊ່າງ active ຄົນໃດກໍໄດ້ໃນສາຂາ (ບໍ່ຈຳກັດບໍລິການ) → `matched: false`.
 * ຜົນລັບ `matched: false` ຖືກໃຊ້ເປັນ placeholder `Appointment.staffProfileId` ເພື່ອຮັກສາ FK ໄວ້
 * ຈົນກວ່າ admin ຈະ `assignTrip` ຊ່າງຈິງໃຫ້ (booking.service.ts ຈະສ້າງ trip ສະຖານະ NO_MATCH).
 */
export async function matchNearestStaff(
  tx: Db,
  params: {
    branchId: string;
    serviceId: string;
    destLatitude: number;
    destLongitude: number;
    startAt: Date;
    endAt: Date;
  },
): Promise<MatchResult> {
  const freshSince = new Date(Date.now() - LOCATION_FRESHNESS_MS);
  const candidates = await tx.staffProfile.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      isHomeServiceAvailable: true,
      lastLocationAt: { gte: freshSince },
      lastKnownLatitude: { not: null },
      lastKnownLongitude: { not: null },
      staffBranches: { some: { branchId: params.branchId } },
      staffServices: { some: { serviceId: params.serviceId } },
    },
    select: { id: true, lastKnownLatitude: true, lastKnownLongitude: true },
  });

  if (candidates.length > 0) {
    const ids = candidates.map((c) => c.id);
    const [busyAppts, busyOffs] = await Promise.all([
      tx.appointment.findMany({
        where: {
          staffProfileId: { in: ids },
          deletedAt: null,
          status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
          startAt: { lt: params.endAt },
          endAt: { gt: params.startAt },
        },
        select: { staffProfileId: true },
      }),
      tx.staffTimeOff.findMany({
        where: {
          staffProfileId: { in: ids },
          isApproved: true,
          startDate: { lt: params.endAt },
          endDate: { gt: params.startAt },
        },
        select: { staffProfileId: true },
      }),
    ]);
    const busy = new Set([...busyAppts.map((a) => a.staffProfileId), ...busyOffs.map((o) => o.staffProfileId)]);
    const free = candidates.filter((c) => !busy.has(c.id));

    const ranked = rankByDistance(free, params.destLatitude, params.destLongitude).filter(
      (r) => r.distanceMeters != null && r.distanceMeters <= env.HOME_SERVICE_MATCH_RADIUS_METERS,
    );
    if (ranked.length > 0) {
      return { ...ranked[0]!, matched: true };
    }
  }

  // ລະດັບ 2 — ຊ່າງທີ່ຝຶກອົບຮົມບໍລິການນີ້ຢູ່ສາຂາດຽວກັນ, ບໍ່ສົນ availability/ຄວາມສົດ/ລັດສະໝີ/ຕິດຄິວ.
  const serviceTrained = await tx.staffProfile.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      staffBranches: { some: { branchId: params.branchId } },
      staffServices: { some: { serviceId: params.serviceId } },
    },
    select: { id: true, lastKnownLatitude: true, lastKnownLongitude: true },
  });
  if (serviceTrained.length > 0) {
    const ranked = rankByDistance(serviceTrained, params.destLatitude, params.destLongitude);
    return { ...ranked[0]!, matched: false };
  }

  // ລະດັບ 3 — ຊ່າງ active ຄົນໃດກໍໄດ້ໃນສາຂາ (ບໍ່ຈຳກັດບໍລິການ).
  const anyBranchStaff = await tx.staffProfile.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      staffBranches: { some: { branchId: params.branchId } },
    },
    select: { id: true, lastKnownLatitude: true, lastKnownLongitude: true },
  });
  if (anyBranchStaff.length > 0) {
    const ranked = rankByDistance(anyBranchStaff, params.destLatitude, params.destLongitude);
    return { ...ranked[0]!, matched: false };
  }

  // ລະດັບ 4 — ສາຂານີ້ບໍ່ມີຊ່າງ active ຄົນໃດເລີຍ, ບໍ່ມີຫຍັງໃສ່ FK ໄດ້ຈິງ.
  throw ApiError.conflict('ສາຂານີ້ບໍ່ມີຊ່າງລົງທະບຽນ', ErrorCode.NO_STYLIST_AVAILABLE);
}

/**
 * ສ້າງແຖວ HomeServiceTrip ຫຼັງ createAppointment (ຮັນຢູ່ໃນ tx ດຽວກັນ). `matched: false` → ສະຖານະ
 * NO_MATCH ໂດຍ `matchedStaffId` ຍັງເປັນ null (ຢືນຢັນ "ຍັງບໍ່ໄດ້ຈັບຄູ່" ໃນ UI) — `params.staffProfileId`
 * ຄືພຽງ placeholder ທີ່ໃຊ້ໃສ່ `Appointment.staffProfileId` (ຮັກສາ FK) ໂດຍ booking.service.ts, ບໍ່ແມ່ນ
 * ຊ່າງທີ່ຈັບຄູ່ໄດ້ຈິງ. Admin ຕ້ອງ `assignTrip` ຊ່າງຈິງໃຫ້ຈຶ່ງຈະຕິດ `matchedStaffId`.
 */
export async function createTrip(
  tx: Db,
  params: { appointmentId: string; staffProfileId: string; distanceMeters: number | null; matched: boolean },
): Promise<void> {
  await tx.homeServiceTrip.create({
    data: {
      appointmentId: params.appointmentId,
      status: params.matched ? 'ASSIGNED' : 'NO_MATCH',
      matchedStaffId: params.matched ? params.staffProfileId : null,
      matchRadiusM: params.matched && params.distanceMeters != null ? Math.round(params.distanceMeters) : null,
      assignedAt: params.matched ? new Date() : null,
    },
  });
}

// ---- ຊ່າງ: ເປີດ/ປິດຮັບວຽກ + ping ຕຳແໜ່ງ ---------------------------------

export async function getStaffAvailability(userId: string): Promise<{ isAvailable: boolean }> {
  const staffProfileId = await resolveStaffProfileId(userId);
  const profile = await prisma.staffProfile.findUniqueOrThrow({
    where: { id: staffProfileId },
    select: { isHomeServiceAvailable: true },
  });
  return { isAvailable: profile.isHomeServiceAvailable };
}

export async function setStaffAvailability(
  userId: string,
  isAvailable: boolean,
): Promise<{ isAvailable: boolean }> {
  const staffProfileId = await resolveStaffProfileId(userId);
  await prisma.staffProfile.update({
    where: { id: staffProfileId },
    data: { isHomeServiceAvailable: isAvailable },
  });
  return { isAvailable };
}

/**
 * REST fallback ping (socket.io ເປັນທາງຫຼັກ — Wave 7B.2). ອັບເດດ StaffProfile.lastKnown* ສະເໝີ,
 * ແລະຖ້າມີວຽກ active (ASSIGNED/EN_ROUTE) ກໍ່ອັບເດດ trip + ຄິດ ETA ໃໝ່.
 */
export async function recordLocationPing(
  userId: string,
  input: { lat: number; lng: number },
): Promise<HomeServiceLocationEvent | null> {
  const staffProfileId = await resolveStaffProfileId(userId);
  const now = new Date();
  await prisma.staffProfile.update({
    where: { id: staffProfileId },
    data: { lastKnownLatitude: input.lat, lastKnownLongitude: input.lng, lastLocationAt: now },
  });

  const trip = await prisma.homeServiceTrip.findFirst({
    where: { matchedStaffId: staffProfileId, status: { in: ['ASSIGNED', 'EN_ROUTE'] } },
    include: { appointment: { select: { destLatitude: true, destLongitude: true } } },
  });
  if (!trip) return null;

  let etaMinutes: number | null = trip.etaMinutes;
  const { destLatitude, destLongitude } = trip.appointment;
  if (destLatitude != null && destLongitude != null) {
    const distanceMeters = haversineMeters(input.lat, input.lng, destLatitude, destLongitude);
    etaMinutes = Math.max(1, Math.round((distanceMeters / 1000 / AVG_SPEED_KMPH) * 60));
  }

  await prisma.homeServiceTrip.update({
    where: { id: trip.id },
    data: { lastLatitude: input.lat, lastLongitude: input.lng, lastPingAt: now, etaMinutes },
  });

  return { appointmentId: trip.appointmentId, lat: input.lat, lng: input.lng, etaMinutes, ts: now.toISOString() };
}

// ---- ຊ່າງ: ປ່ຽນສະຖານະວຽກ (ກ່ອນຮອດ) ------------------------------------

const STAFF_TRIP_TRANSITIONS: Record<string, ReadonlyArray<string>> = {
  ASSIGNED: ['EN_ROUTE', 'CANCELLED'],
  EN_ROUTE: ['ARRIVED', 'CANCELLED'],
  ARRIVED: ['CANCELLED'],
};

const STAMP_FIELD: Record<string, 'enRouteAt' | 'arrivedAt' | 'cancelledAt'> = {
  EN_ROUTE: 'enRouteAt',
  ARRIVED: 'arrivedAt',
  CANCELLED: 'cancelledAt',
};

export async function updateTripStatusByStaff(
  userId: string,
  appointmentId: string,
  input: TripStatusUpdateInput,
): Promise<{ appointmentId: string; status: HomeServiceJobStatus; at: string }> {
  const staffProfileId = await resolveStaffProfileId(userId);
  const trip = await prisma.homeServiceTrip.findUnique({ where: { appointmentId } });
  if (!trip || trip.matchedStaffId !== staffProfileId) {
    throw ApiError.notFound('ບໍ່ພົບວຽກ ຫຼື ບໍ່ແມ່ນຄິວຂອງທ່ານ');
  }
  const allowed = STAFF_TRIP_TRANSITIONS[trip.status] ?? [];
  if (!allowed.includes(input.status)) {
    throw ApiError.conflict(`ບໍ່ສາມາດປ່ຽນຈາກ ${trip.status} ໄປ ${input.status} ໄດ້`);
  }
  const now = new Date();
  const updated = await prisma.homeServiceTrip.update({
    where: { id: trip.id },
    data: {
      status: input.status,
      [STAMP_FIELD[input.status]!]: now,
      ...(input.status === 'CANCELLED' && input.reason ? { cancelReason: input.reason } : {}),
    },
  });
  return { appointmentId, status: updated.status, at: now.toISOString() };
}

/**
 * ໂຮງງານ appointment.status → HomeServiceTrip.status (ໂທຫາຈາກ staff-portal / appointments admin flow).
 * no-op ຖ້າ appointment ນີ້ບໍ່ແມ່ນ HOME_SERVICE (ບໍ່ມີ trip).
 */
export async function syncTripOnAppointmentStatus(
  tx: Db,
  appointmentId: string,
  appointmentStatus: string,
): Promise<void> {
  const trip = await tx.homeServiceTrip.findUnique({ where: { appointmentId } });
  if (!trip) return;

  const map: Record<string, { status: HomeServiceJobStatus; field: 'startedAt' | 'completedAt' | 'cancelledAt' }> = {
    IN_PROGRESS: { status: 'IN_PROGRESS', field: 'startedAt' },
    COMPLETED: { status: 'COMPLETED', field: 'completedAt' },
    CANCELLED: { status: 'CANCELLED', field: 'cancelledAt' },
  };
  const next = map[appointmentStatus];
  if (!next) return;

  await tx.homeServiceTrip.update({
    where: { id: trip.id },
    data: { status: next.status, [next.field]: new Date() },
  });

  // Best-effort live update ໃຫ້ dispatch console — dynamic import ກັນ circular deps ກັບ
  // realtime/socket.ts (ຊຶ່ງ import home-service.service.ts ຢູ່ແລ້ວ). ບໍ່ໃຫ້ພັງ tx ຫຼັກ.
  try {
    const view = await getTripViewByAppointmentId(appointmentId);
    if (view) {
      const { emitHomeServiceAdminUpdate } = await import('../../realtime/socket.js');
      emitHomeServiceAdminUpdate(view);
    }
  } catch {
    /* socket best-effort — polling fallback ໃນ web-admin ຄຸ້ມຄອງກໍລະນີພາດ */
  }
}

// ---- ອ່ານ / admin -------------------------------------------------------

const TRIP_INCLUDE = {
  appointment: {
    select: {
      branchId: true,
      branch: { select: { name: true, phone: true } },
      customerId: true,
      homeAddress: true,
      destLatitude: true,
      destLongitude: true,
      startAt: true,
      customerNotes: true,
      customer: { select: { name: true, phone: true } },
      service: { select: { name: true } },
    },
  },
  matchedStaff: {
    select: { title: true, rating: true, user: { select: { name: true, avatarUrl: true } } },
  },
} satisfies Prisma.HomeServiceTripInclude;

type TripRow = Prisma.HomeServiceTripGetPayload<{ include: typeof TRIP_INCLUDE }>;

function toTripView(t: TripRow): HomeServiceTripView {
  return {
    id: t.id,
    appointmentId: t.appointmentId,
    status: t.status,
    branchId: t.appointment.branchId,
    branchName: t.appointment.branch.name,
    branchPhone: t.appointment.branch.phone,
    customerId: t.appointment.customerId,
    customerName: t.appointment.customer.name,
    customerPhone: t.appointment.customer.phone,
    serviceName: t.appointment.service.name,
    customerNotes: t.appointment.customerNotes,
    matchedStaffId: t.matchedStaffId,
    matchedStaffName: t.matchedStaff?.user.name ?? null,
    matchedStaffTitle: t.matchedStaff?.title ?? null,
    matchedStaffAvatarUrl: t.matchedStaff?.user.avatarUrl ?? null,
    matchedStaffRating: t.matchedStaff?.rating ?? null,
    homeAddress: t.appointment.homeAddress,
    destLatitude: t.appointment.destLatitude,
    destLongitude: t.appointment.destLongitude,
    lastLatitude: t.lastLatitude,
    lastLongitude: t.lastLongitude,
    lastPingAt: t.lastPingAt ? t.lastPingAt.toISOString() : null,
    etaMinutes: t.etaMinutes,
    distanceMeters: t.matchRadiusM,
    cancelReason: t.cancelReason,
    createdAt: t.createdAt.toISOString(),
    startAt: t.appointment.startAt.toISOString(),
    assignedAt: t.assignedAt ? t.assignedAt.toISOString() : null,
    enRouteAt: t.enRouteAt ? t.enRouteAt.toISOString() : null,
    arrivedAt: t.arrivedAt ? t.arrivedAt.toISOString() : null,
    startedAt: t.startedAt ? t.startedAt.toISOString() : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    cancelledAt: t.cancelledAt ? t.cancelledAt.toISOString() : null,
  };
}

/** ຫໍ່ TRIP_INCLUDE/toTripView ໂດຍບໍ່ກວດ actor — ໃຊ້ພາຍໃນສະເພາະຈຸດ emit socket admin. */
export async function getTripViewByAppointmentId(appointmentId: string): Promise<HomeServiceTripView | null> {
  const trip = await prisma.homeServiceTrip.findUnique({ where: { appointmentId }, include: TRIP_INCLUDE });
  return trip ? toTripView(trip) : null;
}

/** ແຈ້ງ push ໃຫ້ admin ຂອງສາຂາໜຶ່ງ (SUPER_ADMIN ທຸກຄົນ + BRANCH_ADMIN ຂອງສາຂານັ້ນ). */
export async function notifyBranchAdmins(
  branchId: string,
  payload: { type: string; title: string; body: string; data?: Record<string, unknown>; dedupeKey?: string },
): Promise<void> {
  const admins = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      OR: [{ role: 'SUPER_ADMIN' }, { role: 'BRANCH_ADMIN', branchId }],
    },
    select: { id: true },
  });
  await Promise.all(
    admins.map((a) =>
      notifyUser({
        userId: a.id,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        dedupeKey: payload.dedupeKey ? `${payload.dedupeKey}:${a.id}` : undefined,
      }),
    ),
  );
}

/** 403 ຖ້າ actor ບໍ່ແມ່ນລູກຄ້າເຈົ້າຂອງ, ຊ່າງທີ່ຖືກຈັບຄູ່, ຫຼື admin/branch-admin. */
export async function getTripView(
  actor: AccessTokenPayload,
  appointmentId: string,
): Promise<HomeServiceTripView> {
  const trip = await prisma.homeServiceTrip.findUnique({
    where: { appointmentId },
    include: TRIP_INCLUDE,
  });
  if (!trip) throw ApiError.notFound('ບໍ່ພົບວຽກ Home Service ນີ້');

  const isAdmin = actor.role === 'SUPER_ADMIN' || actor.role === 'BRANCH_ADMIN';
  const isCustomer = actor.sub === trip.appointment.customerId;
  const isMatchedStaff = trip.matchedStaffId
    ? (await prisma.staffProfile.findUnique({ where: { id: trip.matchedStaffId }, select: { userId: true } }))
        ?.userId === actor.sub
    : false;
  if (!isAdmin && !isCustomer && !isMatchedStaff) throw ApiError.forbidden();

  return toTripView(trip);
}

export async function listTrips(query: HomeServiceTripListQuery): Promise<HomeServiceTripView[]> {
  const rows = await prisma.homeServiceTrip.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.branchId ? { appointment: { branchId: query.branchId } } : {}),
    },
    include: TRIP_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map(toTripView);
}

export async function assignTrip(appointmentId: string, staffProfileId: string): Promise<HomeServiceTripView> {
  const trip = await prisma.homeServiceTrip.findUnique({ where: { appointmentId } });
  if (!trip) throw ApiError.notFound('ບໍ່ພົບວຽກ Home Service ນີ້');
  if (trip.status === 'COMPLETED' || trip.status === 'CANCELLED') {
    throw ApiError.conflict('ວຽກນີ້ຈົບແລ້ວ, ປ່ຽນຊ່າງບໍ່ໄດ້');
  }
  const staff = await prisma.staffProfile.findFirst({
    where: { id: staffProfileId, isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (!staff) throw ApiError.badRequest('ບໍ່ພົບຊ່າງ');

  const updated = await prisma.homeServiceTrip.update({
    where: { id: trip.id },
    data: {
      matchedStaffId: staffProfileId,
      status: trip.status === 'MATCHING' || trip.status === 'NO_MATCH' ? 'ASSIGNED' : trip.status,
      assignedAt: trip.assignedAt ?? new Date(),
    },
    include: TRIP_INCLUDE,
  });
  await prisma.appointment.update({ where: { id: appointmentId }, data: { staffProfileId } });
  return toTripView(updated);
}
