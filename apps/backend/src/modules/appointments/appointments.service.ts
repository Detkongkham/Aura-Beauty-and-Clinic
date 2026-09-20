import type {
  AdminAppointmentConflict,
  AdminAppointmentDetailView,
  AdminAppointmentFilters,
  AdminAppointmentListItem,
  AdminAppointmentSummary,
  AdminAppointmentSummaryQuery,
  AdminAppointmentTimelineEntry,
  AdminAppointmentsQuery,
  AdminCalendarQuery,
  AdminRescheduleInput,
  AppointmentStatus,
  BulkAppointmentStatusInput,
  BulkAppointmentStatusResult,
  Paginated,
  UpdateAppointmentStatusInput,
} from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import {
  ADMIN_APPOINTMENT_INCLUDE,
  appointmentCode,
  toAdminListItem,
  type AdminAppointmentRow,
} from './appointments.mapper.js';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { ErrorCode } from '../../constants/errorCodes.js';
import { MINUTE_MS, addMinutes, tsParam, vientianeDayRangeOf } from '../../utils/dateHelpers.js';
import { logger } from '../../config/logger.js';
import { waitlistQueue } from '../../jobs/queues.js';
import { mirrorTicketFromAppointment } from '../queue/queue.service.js';
import { earnPoints } from '../loyalty/loyalty.service.js';
import { consumeServiceStock } from '../inventory/inventory.service.js';
import { rewardReferralOnComplete } from '../referral/referral.service.js';
import { syncTripOnAppointmentStatus } from '../home-service/home-service.service.js';
import { restorePackageUnit } from '../booking/booking.service.js';

function toAdminDetailView(
  a: AdminAppointmentRow,
  timeline: AdminAppointmentTimelineEntry[],
  conflicts: AdminAppointmentConflict[],
): AdminAppointmentDetailView {
  return {
    ...toAdminListItem(a),
    customerNotes: a.customerNotes,
    staffNotes: a.staffNotes,
    homeAddress: a.homeAddress,
    review: a.review ? { rating: a.review.rating, comment: a.review.comment } : null,
    timeline,
    conflicts,
  };
}

/**
 * ສະຖານະ/ເຫດການ ທີ່ອ່ານອອກມາຈາກ 1 ແຖວ AuditLog.
 * middleware `auditLog` ເກັບ `newValue` = body ທີ່ຕອບກັບ, ຈຶ່ງມີ status ຢູ່ໃນນັ້ນ.
 */
function labelFromAudit(action: string, newValue: unknown): string {
  const status =
    newValue && typeof newValue === 'object' && typeof (newValue as { status?: unknown }).status === 'string'
      ? (newValue as { status: string }).status
      : null;
  if (action.endsWith('.status_changed') && status) return status;
  // ຄຳວ່າ 'ຈອງ' ຄືຄຳຂອງທຸລະກິດ — ຮັກສາໄວ້ໃຫ້ຄືກັບແຖວທີ່ derive ມາ ເພື່ອໃຫ້ UI ມີຄຳສັບຊຸດດຽວ.
  const verb = action.split('.').pop() ?? action;
  if (verb === 'created') return 'BOOKED';
  if (verb === 'walkin_created') return 'WALK_IN';
  return verb;
}

/**
 * ໄທມ໌ໄລນ໌ຈາກ AuditLog ຈິງ (ໂມດູນ 37) — ບອກໄດ້ວ່າ **ໃຜ** ເຮັດ ແລະ **ເມື່ອໃດ**.
 *
 * ກ່ອນໜ້ານີ້ໜ້ານີ້ສ້າງ 2 ແຖວຈາກ createdAt/updatedAt ເອງ ແລະ ໃສ່ຜູ້ເຮັດເປັນ 'system'
 * ທຸກເທື່ອ — ເຊິ່ງບໍ່ແມ່ນປະຫວັດ ແຕ່ເປັນການເດົາ. ນັດເກົ່າກ່ອນເປີດ audit ຍັງບໍ່ມີ log,
 * ຈຶ່ງຍັງເຕີມແຖວ BOOKED ທີ່ derive ໄວ້ (audited: false) ເພື່ອບໍ່ໃຫ້ໜ້າວ່າງເປົ່າ.
 */
async function loadTimeline(a: AdminAppointmentRow): Promise<AdminAppointmentTimelineEntry[]> {
  const logs = await prisma.auditLog.findMany({
    where: { entityName: 'appointment', entityId: a.id },
    select: {
      action: true,
      createdAt: true,
      newValue: true,
      user: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });

  const entries: AdminAppointmentTimelineEntry[] = logs.map((l) => ({
    at: l.createdAt.toISOString(),
    label: labelFromAudit(l.action, l.newValue),
    by: l.user?.name ?? 'system',
    action: l.action,
    audited: true,
  }));

  // ການຈອງເອງບາງທີກໍ່ເກີດກ່ອນມີ audit (seed / ຂໍ້ມູນເກົ່າ) — ເຕີມຈຸດເລີ່ມໃຫ້ສະເໝີ.
  const hasCreate = entries.some((e) => e.action?.endsWith('.created'));
  if (!hasCreate) {
    entries.unshift({
      at: a.createdAt.toISOString(),
      label: 'BOOKED',
      by: a.customer.name,
      action: null,
      audited: false,
    });
  }
  return entries;
}

type ConflictRow = {
  id: string;
  code: string;
  customerName: string;
  serviceName: string;
  staffName: string;
  startAt: Date;
  endAt: Date;
  status: AppointmentStatus;
  sameStaff: boolean;
  sameRoom: boolean;
  sameEquipment: boolean;
};

/**
 * ນັດອື່ນທີ່ ກິນເວລາກັນ ກັບນັດໜຶ່ງ — ຊ່າງ, ຫ້ອງ ຫຼື ອຸປະກອນດຽວກັນ.
 *
 * ນິຍາມອັນດຽວກັນກັບ `assertSlotFree` ຂອງ booking (start < otherEnd && end > otherStart,
 * ນັບສະເພາະນັດທີ່ຍັງມີຊີວິດ) ເພື່ອບໍ່ໃຫ້ໜ້າ admin ລາຍງານຄົນລະຢ່າງກັບຕອນຈອງ.
 */
async function loadConflicts(a: AdminAppointmentRow): Promise<AdminAppointmentConflict[]> {
  if (a.status === 'CANCELLED' || a.status === 'NO_SHOW') return [];
  const rows = await prisma.$queryRaw<ConflictRow[]>`
    SELECT ap.id,
           u.name  AS "customerName",
           sv.name AS "serviceName",
           su.name AS "staffName",
           ap."startAt",
           ap."endAt",
           ap.status::text AS status,
           (ap."staffProfileId" = ${a.staffProfileId}) AS "sameStaff",
           (${a.roomId}::text IS NOT NULL AND ap."roomId" = ${a.roomId}) AS "sameRoom",
           (${a.equipmentId}::text IS NOT NULL AND ap."equipmentId" = ${a.equipmentId}) AS "sameEquipment",
           '' AS code
      FROM appointments ap
      JOIN users u  ON u.id  = ap."customerId"
      JOIN services sv ON sv.id = ap."serviceId"
      JOIN staff_profiles sp ON sp.id = ap."staffProfileId"
      JOIN users su ON su.id = sp."userId"
     WHERE ap."deletedAt" IS NULL
       AND ap.id <> ${a.id}
       AND ap.status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')
       AND ap."startAt" < ${tsParam(a.endAt)}
       AND ap."endAt"   > ${tsParam(a.startAt)}
       AND (
             ap."staffProfileId" = ${a.staffProfileId}
          OR (${a.roomId}::text IS NOT NULL AND ap."roomId" = ${a.roomId})
          OR (${a.equipmentId}::text IS NOT NULL AND ap."equipmentId" = ${a.equipmentId})
       )
     ORDER BY ap."startAt" ASC
     LIMIT 20
  `;

  return rows.map((r) => ({
    id: r.id,
    code: appointmentCode(r.id),
    customerName: r.customerName,
    serviceName: r.serviceName,
    staffName: r.staffName,
    startAt: r.startAt.toISOString(),
    endAt: r.endAt.toISOString(),
    status: r.status,
    reason: r.sameStaff ? 'staff' : r.sameRoom ? 'room' : 'equipment',
  }));
}

/**
 * id ຂອງນັດທຸກອັນ (ໃນປ່ອງເວລາໜຶ່ງ) ທີ່ຊ້ອນເວລາກັບນັດອື່ນ — self-join ຄັ້ງດຽວ.
 *
 * ເງື່ອນໄຂການຊ້ອນກົງກັບ `assertSlotFree` ຂອງ booking ເປັນຄຳຕໍ່ຄຳ. ຈຳກັດປ່ອງເວລາໄວ້
 * ສະເໝີ (default −30 ມື້ ຫາ +90 ມື້) ເພາະ self-join ທັງຕາຕະລາງບໍ່ຄຸ້ມຕໍ່ການໂຫຼດໜ້າ.
 */
const CONFLICT_SCAN_CAP = 2_000;

async function findConflictIds(f: AdminAppointmentFilters, now: Date): Promise<string[]> {
  const from = f.from ?? new Date(now.getTime() - 30 * 24 * 60 * MINUTE_MS);
  const to = f.to ?? new Date(now.getTime() + 90 * 24 * 60 * MINUTE_MS);
  const branchId = f.branchId ?? null;
  const staffId = f.staffId ?? null;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT a.id
      FROM appointments a
      JOIN appointments b
        ON b."deletedAt" IS NULL
       AND b.id <> a.id
       AND b.status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')
       AND a."startAt" < b."endAt"
       AND a."endAt" > b."startAt"
       AND (
             a."staffProfileId" = b."staffProfileId"
          OR (a."roomId" IS NOT NULL AND a."roomId" = b."roomId")
          OR (a."equipmentId" IS NOT NULL AND a."equipmentId" = b."equipmentId")
       )
     WHERE a."deletedAt" IS NULL
       AND a.status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')
       AND a."startAt" >= ${tsParam(from)}
       AND a."startAt" <= ${tsParam(to)}
       AND (${branchId}::text IS NULL OR a."branchId" = ${branchId})
       AND (${staffId}::text IS NULL OR a."staffProfileId" = ${staffId})
     LIMIT ${CONFLICT_SCAN_CAP}
  `;
  return rows.map((r) => r.id);
}

/**
 * ຕົວກອງສຸດທ້າຍ — ເພີ່ມ `flag=conflict` ທີ່ບໍ່ສາມາດຂຽນເປັນ Prisma where ທຳມະດາໄດ້
 * (ຕ້ອງທຽບແຖວກັບແຖວ) ເທິງ {@link buildAppointmentWhere}.
 */
async function resolveWhere(
  f: AdminAppointmentFilters,
  opts: { ignoreStatus?: boolean; now?: Date } = {},
): Promise<Prisma.AppointmentWhereInput> {
  const now = opts.now ?? new Date();
  const where = buildAppointmentWhere(f, { ...opts, now });
  if (f.flag !== 'conflict') return where;
  const ids = await findConflictIds(f, now);
  return { ...where, id: { in: ids } };
}

/** ນັດທີ່ "ຈົບແລ້ວ" — ໃຊ້ເປັນຕົວຫານຂອງ completion / no-show rate. */
const TERMINAL: AppointmentStatus[] = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
/** ນັດທີ່ຍັງ "ເປີດ" — ຍັງລໍຖ້າການຢືນຢັນ ຫຼື ລໍລູກຄ້າມາ. */
const OPEN: AppointmentStatus[] = ['PENDING', 'CONFIRMED'];

/**
 * ຕົວກອງຊຸດດຽວທີ່ໃຊ້ຮ່ວມກັນລະຫວ່າງ list ແລະ summary — ບ່ອນດຽວທີ່ນິຍາມວ່າ
 * "ຕົງກັບຕົວກອງ" ໝາຍຄວາມວ່າແນວໃດ, ເພື່ອບໍ່ໃຫ້ຕົວເລກລວມກັບແຖວຂັດກັນ.
 *
 * ໝາຍເຫດ `payment`: Prisma ປຽບທຽບ column ຂ້າມ relation ບໍ່ໄດ້, ຈຶ່ງແປເປັນ
 * `paymentStatus` ຂອງບິນແທນ (PENDING/ບໍ່ມີບິນ = unpaid, DEPOSIT_PAID = partial,
 * FULLY_PAID = paid) ເຊິ່ງເປັນຄວາມໝາຍດຽວກັນໃນທາງທຸລະກິດ.
 */
export function buildAppointmentWhere(
  f: AdminAppointmentFilters,
  opts: { ignoreStatus?: boolean; now?: Date } = {},
): Prisma.AppointmentWhereInput {
  const now = opts.now ?? new Date();
  const statusFilter = opts.ignoreStatus
    ? {}
    : f.statuses?.length
      ? { status: { in: f.statuses } }
      : f.status
        ? { status: f.status }
        : {};

  const paymentFilter: Prisma.AppointmentWhereInput =
    f.payment === 'paid'
      ? { payment: { paymentStatus: 'FULLY_PAID' } }
      : f.payment === 'partial'
        ? { payment: { paymentStatus: 'DEPOSIT_PAID' } }
        : f.payment === 'unpaid'
          ? { OR: [{ payment: null }, { payment: { paymentStatus: { in: ['PENDING', 'FAILED'] } } }] }
          : {};

  const flagFilter: Prisma.AppointmentWhereInput =
    f.flag === 'overdue'
      ? { startAt: { lt: now }, status: { in: OPEN } }
      : f.flag === 'unconfirmed'
        ? { status: 'PENDING', startAt: { gte: now, lte: new Date(now.getTime() + 24 * 60 * MINUTE_MS) } }
        : f.flag === 'needsDeposit'
          ? {
              status: { in: OPEN },
              service: { requireDeposit: true },
              OR: [{ payment: null }, { payment: { paymentStatus: { in: ['PENDING', 'FAILED'] } } }],
            }
          : f.flag === 'unrated'
            ? { status: 'COMPLETED', review: null }
            // 'conflict' needs a row-to-row comparison — resolveWhere() adds it.
            : {};

  // `flag` ອາດມີ startAt/status/OR ຂອງມັນເອງ → ວາງທຸກຢ່າງໃນ AND ເພື່ອບໍ່ໃຫ້ key ທັບກັນ.
  const and: Prisma.AppointmentWhereInput[] = [statusFilter, paymentFilter, flagFilter].filter(
    (x) => Object.keys(x).length > 0,
  );

  if (f.from || f.to) {
    and.push({
      startAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) },
    });
  }
  if (f.q) {
    const q = f.q.trim();
    // "A-1F2E3D4C" ຄືລະຫັດທີ່ synthesize ຈາກ 8 ຕົວທຳອິດຂອງ uuid → ຄົ້ນຄືນເປັນ id prefix.
    const codeMatch = /^a-?([0-9a-f]{1,8})$/i.exec(q);
    and.push({
      OR: [
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { phone: { contains: q } } },
        { service: { name: { contains: q, mode: 'insensitive' } } },
        { staffProfile: { user: { name: { contains: q, mode: 'insensitive' } } } },
        ...(codeMatch ? [{ id: { startsWith: codeMatch[1]!.toLowerCase() } }] : []),
      ],
    });
  }

  return {
    deletedAt: null,
    ...(f.branchId ? { branchId: f.branchId } : {}),
    ...(f.staffId ? { staffProfileId: f.staffId } : {}),
    ...(f.serviceId ? { serviceId: f.serviceId } : {}),
    ...(f.customerId ? { customerId: f.customerId } : {}),
    ...(f.deliveryType ? { deliveryType: f.deliveryType } : {}),
    ...(f.source ? { source: f.source } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

/**
 * ຂອງແຖວທີ່ຈະສະແດງໃນໜ້ານີ້ — ອັນໃດຊ້ອນເວລາກັບນັດອື່ນແດ່ (query ດຽວຕໍ່ໜ້າ).
 * ຄິດສະເພາະ `rows` ທີ່ຈະສະແດງຈິງ ຈຶ່ງບໍ່ຕ້ອງ scan ທັງຕາຕະລາງ.
 */
async function conflictSetFor(rows: { id: string }[]): Promise<Set<string>> {
  if (rows.length === 0) return new Set();
  const ids = rows.map((r) => r.id);
  const found = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT DISTINCT a.id
      FROM appointments a
      JOIN appointments b
        ON b."deletedAt" IS NULL
       AND b.id <> a.id
       AND b.status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')
       AND a."startAt" < b."endAt"
       AND a."endAt" > b."startAt"
       AND (
             a."staffProfileId" = b."staffProfileId"
          OR (a."roomId" IS NOT NULL AND a."roomId" = b."roomId")
          OR (a."equipmentId" IS NOT NULL AND a."equipmentId" = b."equipmentId")
       )
     WHERE a.id IN (${Prisma.join(ids)})
       AND a.status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')
  `;
  return new Set(found.map((r) => r.id));
}

const SORT_ORDER: Record<
  AdminAppointmentsQuery['sort'],
  (dir: Prisma.SortOrder) => Prisma.AppointmentOrderByWithRelationInput
> = {
  startAt: (dir) => ({ startAt: dir }),
  createdAt: (dir) => ({ createdAt: dir }),
  price: (dir) => ({ totalAmount: dir }),
  customer: (dir) => ({ customer: { name: dir } }),
  status: (dir) => ({ status: dir }),
};

/** GET /appointments — ລາຍການນັດໝາຍ (ກັ່ນຕອງ + ຮຽງ + ແບ່ງໜ້າ). */
export async function listAppointments(
  query: AdminAppointmentsQuery,
): Promise<Paginated<AdminAppointmentListItem>> {
  const where = await resolveWhere(query);
  const orderBy = SORT_ORDER[query.sort](query.order);

  const [rows, total] = await Promise.all([
    prisma.appointment.findMany({
      where,
      include: ADMIN_APPOINTMENT_INCLUDE,
      // tie-break ດ້ວຍ id ເພື່ອໃຫ້ການແບ່ງໜ້າ deterministic ເມື່ອຄ່າຮຽງຊ້ຳກັນ.
      orderBy: [orderBy, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.appointment.count({ where }),
  ]);

  const clashing = await conflictSetFor(rows);

  return {
    items: rows.map((r) => ({ ...toAdminListItem(r), hasConflict: clashing.has(r.id) })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/** ເພດານແຖວທີ່ຍອມໃຫ້ summary ດຶງມາຄິດໃນ request ດຽວ. */
const SUMMARY_ROW_CAP = 5_000;

const SUMMARY_SELECT = {
  id: true,
  status: true,
  startAt: true,
  endAt: true,
  totalAmount: true,
  travelFee: true,
  deliveryType: true,
  source: true,
  customerId: true,
  branchId: true,
  branch: { select: { name: true } },
  staffProfileId: true,
  staffProfile: { select: { user: { select: { name: true } } } },
  serviceId: true,
  service: { select: { name: true, requireDeposit: true, depositAmount: true } },
  payment: { select: { depositAmount: true, paymentStatus: true } },
  review: { select: { rating: true } },
} satisfies Prisma.AppointmentSelect;

/** ວັນທີແບບ YYYY-MM-DD ຕາມເວລາວຽງຈັນ. */
function vientianeDayKey(at: Date): string {
  return new Date(at.getTime() + 7 * 60 * MINUTE_MS).toISOString().slice(0, 10);
}
function vientianeHour(at: Date): number {
  return new Date(at.getTime() + 7 * 60 * MINUTE_MS).getUTCHours();
}

/**
 * GET /appointments/summary — ຕົວເລກລວມຂອງ **ທຸກແຖວທີ່ຕົງກັບຕົວກອງ**.
 *
 * ກ່ອນນີ້ web-admin ດຶງ 200 ແຖວມາບວກເອງ, ຈຶ່ງຜິດທັນທີທີ່ຜົນກອງເກີນ 200.
 * ນີ້ຄິດຢູ່ຝັ່ງ server ດ້ວຍ select ບາງໆ 1 ຮອບ; ຖ້າເກີນ {@link SUMMARY_ROW_CAP}
 * ຈະສົ່ງ `truncated: true` ກັບໄປໃຫ້ UI ບອກຜູ້ໃຊ້ວ່າເປັນຄ່າປະມານ.
 */
export async function getAppointmentSummary(
  query: AdminAppointmentSummaryQuery,
): Promise<AdminAppointmentSummary> {
  const now = new Date();
  // byStatus ຕ້ອງນັບທຸກສະຖານະ ເພື່ອໃຫ້ແຖບສະຖານະຂອງ UI ຍັງກົດສະຫຼັບໄປມາໄດ້.
  const where = await resolveWhere(query, { ignoreStatus: true, now });

  const [total, rows, clashing] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({
      where,
      select: SUMMARY_SELECT,
      orderBy: { startAt: 'desc' },
      take: SUMMARY_ROW_CAP,
    }),
    findConflictIds(query, now),
  ]);
  const clashingSet = new Set(clashing);

  const byStatus: Record<AppointmentStatus, number> = {
    PENDING: 0,
    CONFIRMED: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    CANCELLED: 0,
    NO_SHOW: 0,
  };
  const money = {
    expected: 0,
    realized: 0,
    outstanding: 0,
    deposits: 0,
    lost: 0,
    lostCount: 0,
    avgTicket: 0,
    travelFees: 0,
  };
  const ops = {
    today: 0,
    todayOpen: 0,
    todayValue: 0,
    tomorrow: 0,
    next7: 0,
    next7Value: 0,
    overdue: 0,
    unconfirmed: 0,
    needsDeposit: 0,
    needsDepositValue: 0,
    unrated: 0,
    conflicts: 0,
    walkIns: 0,
    homeService: 0,
    online: 0,
    noShowRate: 0,
    completionRate: 0,
    cancelRate: 0,
    avgRating: 0,
    ratedCount: 0,
    distinctCustomers: 0,
    avgDurationMin: 0,
    bookedMinutes: 0,
  };

  const today = vientianeDayRangeOf(now);
  const tomorrowStart = today.end;
  const tomorrowEnd = new Date(today.end.getTime() + 24 * 60 * MINUTE_MS);
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * MINUTE_MS);
  const in24h = new Date(now.getTime() + 24 * 60 * MINUTE_MS);

  type Agg = { id: string; name: string; count: number; revenue: number };
  const bump = (m: Map<string, Agg>, id: string, name: string, revenue: number) => {
    const cur = m.get(id) ?? { id, name, count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += revenue;
    m.set(id, cur);
  };
  const staff = new Map<string, Agg>();
  const services = new Map<string, Agg>();
  const branches = new Map<string, Agg>();
  const days = new Map<string, { count: number; revenue: number }>();
  const hours = new Array<number>(24).fill(0);
  const customers = new Set<string>();

  let activeCount = 0;
  let ratingSum = 0;
  let durationSum = 0;

  for (const a of rows) {
    const price = a.totalAmount.toNumber();
    const deposit = a.payment?.depositAmount.toNumber() ?? 0;
    const dead = a.status === 'CANCELLED' || a.status === 'NO_SHOW';
    const durationMin = Math.max(0, Math.round((a.endAt.getTime() - a.startAt.getTime()) / MINUTE_MS));

    byStatus[a.status] += 1;
    customers.add(a.customerId);
    durationSum += durationMin;
    hours[vientianeHour(a.startAt)] = (hours[vientianeHour(a.startAt)] ?? 0) + 1;

    const key = vientianeDayKey(a.startAt);
    const day = days.get(key) ?? { count: 0, revenue: 0 };
    day.count += 1;
    if (!dead) day.revenue += price;
    days.set(key, day);

    if (a.source === 'WALK_IN') ops.walkIns += 1;
    if (a.source === 'ONLINE') ops.online += 1;
    if (a.deliveryType === 'HOME_SERVICE') ops.homeService += 1;
    if (a.review) {
      ops.ratedCount += 1;
      ratingSum += a.review.rating;
    } else if (a.status === 'COMPLETED') {
      ops.unrated += 1;
    }

    if (dead) {
      money.lost += price;
      money.lostCount += 1;
      continue;
    }

    money.expected += price;
    money.deposits += deposit;
    money.travelFees += a.travelFee.toNumber();
    activeCount += 1;
    if (a.status === 'COMPLETED') money.realized += price;
    else money.outstanding += Math.max(0, price - deposit);
    if (a.status === 'COMPLETED' || a.status === 'IN_PROGRESS') ops.bookedMinutes += durationMin;

    bump(staff, a.staffProfileId, a.staffProfile.user.name, price);
    bump(services, a.serviceId, a.service.name, price);
    bump(branches, a.branchId, a.branch.name, price);

    const open = a.status === 'PENDING' || a.status === 'CONFIRMED';
    if (a.startAt >= today.start && a.startAt < today.end) {
      ops.today += 1;
      ops.todayValue += price;
      if (a.status !== 'COMPLETED') ops.todayOpen += 1;
    }
    if (a.startAt >= tomorrowStart && a.startAt < tomorrowEnd) ops.tomorrow += 1;
    if (a.startAt > now && a.startAt <= in7) {
      ops.next7 += 1;
      ops.next7Value += price;
    }
    if (clashingSet.has(a.id)) ops.conflicts += 1;
    if (open && a.startAt < now) ops.overdue += 1;
    if (a.status === 'PENDING' && a.startAt >= now && a.startAt <= in24h) ops.unconfirmed += 1;
    if (open && a.service.requireDeposit) {
      const due = a.service.depositAmount?.toNumber() ?? 0;
      if (deposit < due) {
        ops.needsDeposit += 1;
        ops.needsDepositValue += due - deposit;
      }
    }
  }

  const terminal = TERMINAL.reduce((sum, st) => sum + byStatus[st], 0);
  money.avgTicket = activeCount ? Math.round(money.expected / activeCount) : 0;
  ops.noShowRate = terminal ? byStatus.NO_SHOW / terminal : 0;
  ops.completionRate = terminal ? byStatus.COMPLETED / terminal : 0;
  ops.cancelRate = terminal ? byStatus.CANCELLED / terminal : 0;
  ops.avgRating = ops.ratedCount ? Math.round((ratingSum / ops.ratedCount) * 10) / 10 : 0;
  ops.distinctCustomers = customers.size;
  ops.avgDurationMin = rows.length ? Math.round(durationSum / rows.length) : 0;

  const top = (m: Map<string, Agg>) => [...m.values()].sort((a, b) => b.count - a.count).slice(0, 12);

  return {
    total,
    sampled: rows.length,
    truncated: rows.length < total,
    byStatus,
    money,
    ops,
    byStaff: top(staff),
    byService: top(services),
    byBranch: top(branches),
    byDay: [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-92)
      .map(([date, v]) => ({ date, ...v })),
    byHour: hours.map((count, hour) => ({ hour, count })),
  };
}

/** GET /appointments/calendar — ທຸກນັດໝາຍໃນຊ່ວງວັນທີ (ບໍ່ແບ່ງໜ້າ). */
export async function getCalendar(
  query: AdminCalendarQuery,
): Promise<{ items: AdminAppointmentListItem[] }> {
  const rows = await prisma.appointment.findMany({
    where: {
      deletedAt: null,
      startAt: { gte: query.from, lte: query.to },
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.staffId ? { staffProfileId: query.staffId } : {}),
    },
    include: ADMIN_APPOINTMENT_INCLUDE,
    orderBy: { startAt: 'asc' },
  });
  return { items: rows.map(toAdminListItem) };
}

/** GET /appointments/:id — ລາຍລະອຽດ + timeline. */
export async function getAppointmentDetail(id: string): Promise<AdminAppointmentDetailView> {
  const row = await prisma.appointment.findFirst({
    where: { id, deletedAt: null },
    include: ADMIN_APPOINTMENT_INCLUDE,
  });
  if (!row) throw ApiError.notFound('ບໍ່ພົບນັດໝາຍ');
  const [timeline, conflicts] = await Promise.all([loadTimeline(row), loadConflicts(row)]);
  return toAdminDetailView(row, timeline, conflicts);
}

/** PATCH /appointments/:id/status — ປ່ຽນສະຖານະ (ໜ້າຮ້ານ / ຜູ້ຈັດການ). */
export async function updateAppointmentStatus(
  id: string,
  input: UpdateAppointmentStatusInput,
): Promise<AdminAppointmentDetailView> {
  const existing = await prisma.appointment.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, source: true, status: true, service: { select: { durationMinutes: true } } },
  });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບນັດໝາຍ');

  // walk-in ທີ່ຫາກໍ່ເລີ່ມ → ຕັ້ງ startAt/endAt ໃໝ່.
  const restamp =
    existing.source === 'WALK_IN' && input.status === 'IN_PROGRESS'
      ? { startAt: new Date(), endAt: addMinutes(new Date(), existing.service.durationMinutes) }
      : {};

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.appointment.update({
      where: { id },
      data: {
        status: input.status,
        ...restamp,
        ...(input.staffNotes !== undefined ? { staffNotes: input.staffNotes } : {}),
      },
      include: ADMIN_APPOINTMENT_INCLUDE,
    });
    await mirrorTicketFromAppointment(tx, id, input.status);
    await syncTripOnAppointmentStatus(tx, id, input.status);
    // ຍົກເລີກນັດທີ່ໃຊ້ແພັກເກັດ → ຄືນສິດ 1 ຄັ້ງ (ສະເພາະຕອນປ່ຽນເຂົ້າ CANCELLED ຄັ້ງທຳອິດ).
    if (input.status === 'CANCELLED' && existing.status !== 'CANCELLED') {
      await restorePackageUnit(tx, updated.userPackageItemId);
    }
    if (input.status === 'COMPLETED') {
      await earnPoints(tx, {
        userId: updated.customerId,
        amountLak: updated.totalAmount.toNumber(),
        refId: `appt:${id}`,
        notes: 'ໄດ້ຄະແນນຈາກການໃຊ້ບໍລິການ',
      });
      // ໂມດູນ 14 — ຕັດສະຕັອກ BOM ອັດຕະໂນມັດ (idempotent ຕໍ່ appt:<id>).
      await consumeServiceStock(tx, { appointmentId: id, serviceId: updated.serviceId });

      // ໂມດູນ 33 — ໃຫ້ລາງວັນຜູ້ແນະນຳ (idempotent ຕໍ່ rewardClaimed).
      await rewardReferralOnComplete(tx, id);

      // ໂມດູນ 09 — ບັນທຶກຄ່າຄອມມິດຊັນ (idempotent ຕໍ່ appointmentId unique).
      // ໜ້າຮ້ານ/ຜູ້ຈັດການປິດຄິວເອງກໍ່ຕ້ອງໄດ້ commission ຄືກັບຕອນຊ່າງປິດຜ່ານແອັບ.
      const staffProfile = await tx.staffProfile.findUnique({
        where: { id: updated.staffProfileId },
        select: { commissionRate: true },
      });
      if (staffProfile) {
        const payout =
          Math.round(updated.totalAmount.toNumber() * staffProfile.commissionRate * 100) / 100;
        await tx.staffCommission.upsert({
          where: { appointmentId: id },
          update: {
            serviceAmount: updated.totalAmount,
            commissionRate: staffProfile.commissionRate,
            payoutAmount: new Prisma.Decimal(payout.toFixed(2)),
          },
          create: {
            appointmentId: id,
            staffProfileId: updated.staffProfileId,
            serviceAmount: updated.totalAmount,
            commissionRate: staffProfile.commissionRate,
            payoutAmount: new Prisma.Decimal(payout.toFixed(2)),
          },
        });
      }
    }
    return updated;
  });

  if (input.status === 'CANCELLED' || input.status === 'NO_SHOW') {
    await waitlistQueue
      .add('backfill', {
        branchId: row.branchId,
        serviceId: row.serviceId,
        freedFrom: row.startAt.toISOString(),
        freedTo: row.endAt.toISOString(),
      })
      .catch((err) => logger.warn({ err }, 'waitlist enqueue failed'));
  }

  const [timeline, conflicts] = await Promise.all([loadTimeline(row), loadConflicts(row)]);
  return toAdminDetailView(row, timeline, conflicts);
}

/**
 * POST /appointments/bulk-status — ປ່ຽນສະຖານະຫຼາຍນັດຈາກໜ້າລາຍການ.
 *
 * ເຮັດເທື່ອລະລາຍການ (ບໍ່ແມ່ນ transaction ດຽວ) ໂດຍເຈດຕະນາ: ແຕ່ລະນັດມີ side-effect
 * ຂອງມັນເອງ (ຄິວ, ຄະແນນ, ສະຕັອກ, ຄອມມິດຊັນ) ແລະ ນັດໜຶ່ງລົ້ມເຫຼວບໍ່ຄວນລົບລ້າງນັດອື່ນ.
 * ຜົນລັບບອກທັງອັນທີ່ສຳເລັດ ແລະ ອັນທີ່ລົ້ມ ພ້ອມເຫດຜົນ.
 */
export async function bulkUpdateAppointmentStatus(
  input: BulkAppointmentStatusInput,
): Promise<BulkAppointmentStatusResult> {
  const updated: string[] = [];
  const failed: BulkAppointmentStatusResult['failed'] = [];

  for (const id of input.ids) {
    try {
      await updateAppointmentStatus(id, { status: input.status });
      updated.push(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'ປ່ຽນສະຖານະບໍ່ສຳເລັດ';
      logger.warn({ err, id }, 'bulk status update failed');
      failed.push({ id, message });
    }
  }

  return { updated, failed };
}

/**
 * PATCH /appointments/:id/reschedule — ໜ້າຮ້ານ/ຜູ້ຈັດການເລື່ອນນັດໃຫ້ລູກຄ້າ.
 *
 * ຕ່າງຈາກ `booking.rescheduleAppointment` ຢູ່ 3 ຈຸດ, ແລະ ນັ້ນຄືເຫດຜົນທີ່ມັນຢູ່ນີ້:
 * 1. ບໍ່ຜູກກັບຜູ້ເປັນເຈົ້າຂອງ (admin ເລື່ອນໃຫ້ໃຜກໍ່ໄດ້),
 * 2. ບໍ່ບັງຄັບ cancellation window ຂອງລູກຄ້າ (ໜ້າຮ້ານຕ້ອງເລື່ອນນັດມື້ນີ້ໄດ້),
 * 3. ຮອງຮັບ `force` ເພື່ອຍອມຮັບການຈອງຊ້ອນຢ່າງຕັ້ງໃຈ (ເຊັ່ນ ຊ່າງຮັບ 2 ຄົນພ້ອມກັນ)
 *    — ແຕ່ຍັງຕ້ອງກວດກ່ອນສະເໝີ ແລະ ຄືນລາຍການທີ່ຊ້ອນໄປໃຫ້ UI ເຫັນ.
 *
 * ສະຖານະຖືກຮັກສາໄວ້ຕາມເດີມ (ບໍ່ຄືນເປັນ PENDING ຄືຝັ່ງລູກຄ້າ): ນັດທີ່ຢືນຢັນແລ້ວ
 * ແລະ ໜ້າຮ້ານເລື່ອນເອງ ຍັງຄືນັດທີ່ຢືນຢັນແລ້ວ.
 */
export async function rescheduleAppointmentAsAdmin(
  id: string,
  input: AdminRescheduleInput,
): Promise<AdminAppointmentDetailView> {
  const existing = await prisma.appointment.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      status: true,
      staffProfileId: true,
      serviceId: true,
      roomId: true,
      equipmentId: true,
      service: { select: { durationMinutes: true } },
    },
  });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບນັດໝາຍ');
  if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
    throw ApiError.badRequest('ນັດທີ່ປິດແລ້ວເລື່ອນບໍ່ໄດ້');
  }

  const staffProfileId = input.staffProfileId ?? existing.staffProfileId;
  const startAt = input.startAt;
  const endAt = addMinutes(startAt, existing.service.durationMinutes);

  if (staffProfileId !== existing.staffProfileId) {
    const canDo = await prisma.staffService.findFirst({
      where: { staffProfileId, serviceId: existing.serviceId },
      select: { id: true },
    });
    if (!canDo) throw ApiError.badRequest('ຊ່າງທີ່ເລືອກບໍ່ໄດ້ໃຫ້ບໍລິການນີ້');
  }

  const clashes = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM appointments
     WHERE "deletedAt" IS NULL
       AND id <> ${id}
       AND status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS')
       AND "startAt" < ${tsParam(endAt)}
       AND "endAt" > ${tsParam(startAt)}
       AND (
             "staffProfileId" = ${staffProfileId}
          OR (${existing.roomId}::text IS NOT NULL AND "roomId" = ${existing.roomId})
          OR (${existing.equipmentId}::text IS NOT NULL AND "equipmentId" = ${existing.equipmentId})
       )
     LIMIT 5
  `;
  if (clashes.length > 0 && !input.force) {
    throw ApiError.conflict('ຊ່ວງເວລານີ້ຖືກຈອງແລ້ວ', ErrorCode.DOUBLE_BOOKING);
  }

  await prisma.appointment.update({
    where: { id },
    data: { staffProfileId, startAt, endAt },
  });

  const row = await prisma.appointment.findFirstOrThrow({
    where: { id },
    include: ADMIN_APPOINTMENT_INCLUDE,
  });
  const [timeline, conflicts] = await Promise.all([loadTimeline(row), loadConflicts(row)]);
  return toAdminDetailView(row, timeline, conflicts);
}
