import { randomUUID } from 'node:crypto';
import type {
  AppointmentStatus,
  QueueCancelReason,
  QueueCheckInInput,
  QueueCheckInResult,
  QueueListQuery,
  QueueListResult,
  QueueSetStatusInput,
  QueueStatus,
  QueueSummary,
  QueueTicketView,
  QueueUpdateDetailsInput,
  WalkInInput,
  WalkInResult,
} from '@abcp/shared-types';
import { checkInWindow } from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { notifyUser } from '../../services/push.js';
import { ApiError } from '../../utils/ApiError.js';
import { addMinutes } from '../../utils/dateHelpers.js';

const TICKET_INCLUDE = {
  branch: { select: { name: true } },
  service: { select: { name: true, durationMinutes: true, price: true } },
  appointment: {
    select: {
      id: true,
      status: true,
      source: true,
      customerId: true,
      staffProfileId: true,
      staffProfile: { select: { user: { select: { name: true } } } },
    },
  },
} satisfies Prisma.QueueTicketInclude;

type TicketRow = Prisma.QueueTicketGetPayload<{ include: typeof TICKET_INCLUDE }>;

const ACTIVE_STATUSES = ['WAITING', 'CALLED', 'IN_SERVICE'] as const;

/** Vientiane = UTC+7 ຕະຫຼອດປີ (ບໍ່ມີ DST) — "ມື້ນີ້" ຂອງໜ້າຮ້ານ. */
const VTE_OFFSET_MS = 7 * 3_600_000;
export function startOfVientianeDay(date: Date): Date {
  const shifted = new Date(date.getTime() + VTE_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - VTE_OFFSET_MS);
}
const vteHour = (d: Date) => new Date(d.getTime() + VTE_OFFSET_MS).getUTCHours();

/** ການຍ້າຍສະຖານະທີ່ອະນຸຍາດ. CALLED→WAITING = ສົ່ງກັບຄືນຄິວ, CANCELLED→WAITING = ກູ້ຄືນ. */
const TRANSITIONS: Record<QueueStatus, readonly QueueStatus[]> = {
  WAITING: ['CALLED', 'IN_SERVICE', 'CANCELLED'],
  CALLED: ['WAITING', 'IN_SERVICE', 'CANCELLED'],
  IN_SERVICE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: ['WAITING'],
};

const minutesBetween = (a: Date, b: Date) =>
  Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));

function toTicketView(
  t: TicketRow,
  ctx: { dayStart: Date; visits?: Map<string, number> } = { dayStart: startOfVientianeDay(new Date()) },
): QueueTicketView {
  const customerId = t.appointment?.customerId ?? null;
  const isActive = (ACTIVE_STATUSES as readonly string[]).includes(t.status);
  return {
    id: t.id,
    number: t.ticketNumber,
    branchId: t.branchId,
    branchName: t.branch.name,
    customerName: t.customerName,
    customerPhone: t.phone || null,
    serviceName: t.service?.name ?? '',
    serviceDurationMin: t.service?.durationMinutes ?? null,
    servicePrice: t.service ? t.service.price.toNumber() : null,
    staffName: t.appointment?.staffProfile.user.name ?? null,
    staffProfileId: t.appointment?.staffProfileId ?? null,
    appointmentId: t.appointmentId,
    customerId,
    visitCount: customerId ? (ctx.visits?.get(customerId) ?? 0) : 0,
    // VIP ຕັ້ງເອງ > ນັດລ່ວງໜ້າ (online/admin) > ປົກກະຕິ
    priority:
      t.priority === 'VIP'
        ? 'VIP'
        : t.appointment && t.appointment.source !== 'WALK_IN'
          ? 'APPOINTMENT'
          : 'NORMAL',
    status: t.status,
    note: t.note,
    issuedAt: t.createdAt.toISOString(),
    calledAt: t.calledAt?.toISOString() ?? null,
    lastCalledAt: t.lastCalledAt?.toISOString() ?? null,
    callCount: t.callCount,
    startedAt: t.startedAt?.toISOString() ?? null,
    completedAt: t.completedAt?.toISOString() ?? null,
    cancelledAt: t.cancelledAt?.toISOString() ?? null,
    cancelReason: (t.cancelReason as QueueCancelReason | null) ?? null,
    carriedOver: isActive && t.createdAt < ctx.dayStart,
  };
}

/** ຈຳນວນນັດທີ່ສຳເລັດຂອງລູກຄ້າແຕ່ລະຄົນ (ລູກຄ້າໃໝ່/ເກົ່າ). */
async function visitCounts(customerIds: string[]): Promise<Map<string, number>> {
  if (customerIds.length === 0) return new Map();
  const rows = await prisma.appointment.groupBy({
    by: ['customerId'],
    where: { customerId: { in: customerIds }, status: 'COMPLETED', deletedAt: null },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.customerId, r._count._all]));
}

const avg = (xs: number[]) =>
  xs.length ? Math.round(xs.reduce((s, n) => s + n, 0) / xs.length) : null;
function p90(xs: number[]): number | null {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.9) - 1)]!;
}

async function buildSummary(
  branchWhere: Prisma.QueueTicketWhereInput,
  now: Date,
  dayStart: Date,
  carriedOver: number,
): Promise<QueueSummary> {
  const yStart = new Date(dayStart.getTime() - 86_400_000);
  const yNow = new Date(now.getTime() - 86_400_000);
  const [today, yesterday] = await Promise.all([
    prisma.queueTicket.findMany({
      where: { ...branchWhere, createdAt: { gte: dayStart } },
      select: {
        status: true,
        createdAt: true,
        calledAt: true,
        startedAt: true,
        completedAt: true,
        cancelReason: true,
      },
    }),
    prisma.queueTicket.findMany({
      where: { ...branchWhere, createdAt: { gte: yStart, lte: yNow } },
      select: { status: true, createdAt: true, calledAt: true, completedAt: true },
    }),
  ]);
  // ສຳເລັດມື້ນີ້ ນັບຕາມ completedAt (ລວມບັດທີ່ຄ້າງຈາກມື້ກ່ອນ).
  const completedRows = await prisma.queueTicket.findMany({
    where: { ...branchWhere, status: 'COMPLETED', completedAt: { gte: dayStart } },
    select: { startedAt: true, completedAt: true },
  });

  const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, arrivals: 0, completions: 0 }));
  for (const t of today) hourly[vteHour(t.createdAt)]!.arrivals += 1;
  for (const t of completedRows) if (t.completedAt) hourly[vteHour(t.completedAt)]!.completions += 1;

  const waits = today.filter((t) => t.calledAt).map((t) => minutesBetween(t.createdAt, t.calledAt!));
  const services = completedRows
    .filter((t) => t.startedAt && t.completedAt)
    .map((t) => minutesBetween(t.startedAt!, t.completedAt!));
  const yWaits = yesterday
    .filter((t) => t.calledAt && t.calledAt <= yNow)
    .map((t) => minutesBetween(t.createdAt, t.calledAt!));

  return {
    dayStart: dayStart.toISOString(),
    issuedToday: today.length,
    completedToday: completedRows.length,
    cancelledToday: today.filter((t) => t.status === 'CANCELLED').length,
    noShowToday: today.filter((t) => t.status === 'CANCELLED' && t.cancelReason === 'NO_SHOW').length,
    carriedOver,
    avgWaitMin: avg(waits),
    p90WaitMin: p90(waits),
    avgServiceMin: avg(services),
    yesterday: {
      issued: yesterday.length,
      completed: yesterday.filter((t) => t.completedAt && t.completedAt <= yNow).length,
      avgWaitMin: avg(yWaits),
    },
    hourly,
  };
}

/** GET /queue — ບັດ active (ລວມທີ່ຄ້າງ) + ສຳເລັດ/ຍົກເລີກມື້ນີ້ + ສະຫຼຸບ. */
export async function listQueue(query: QueueListQuery): Promise<QueueListResult> {
  const now = new Date();
  const dayStart = startOfVientianeDay(now);
  const branchWhere: Prisma.QueueTicketWhereInput =
    query.branchId === 'all' ? {} : { branchId: query.branchId };
  const rows = await prisma.queueTicket.findMany({
    where: {
      ...branchWhere,
      OR: [
        { status: { in: [...ACTIVE_STATUSES] } },
        { status: 'COMPLETED', completedAt: { gte: dayStart } },
        { status: 'CANCELLED', cancelledAt: { gte: dayStart } },
      ],
    },
    include: TICKET_INCLUDE,
    orderBy: { createdAt: 'asc' },
  });
  const visits = await visitCounts([
    ...new Set(rows.map((r) => r.appointment?.customerId).filter((x): x is string => !!x)),
  ]);
  const items = rows.map((r) => toTicketView(r, { dayStart, visits }));
  const summary = await buildSummary(
    branchWhere,
    now,
    dayStart,
    items.filter((i) => i.carriedOver).length,
  );
  return { items, summary };
}

/** BRANCH_ADMIN / STAFF ແຕະໄດ້ສະເພາະບັດຂອງສາຂາຕົນ. */
async function loadTicketForWrite(id: string, scopeBranchId: string | null) {
  const existing = await prisma.queueTicket.findUnique({ where: { id }, include: TICKET_INCLUDE });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບບັດຄິວ');
  if (scopeBranchId && existing.branchId !== scopeBranchId) {
    throw ApiError.forbidden('ຈັດການໄດ້ສະເພາະຄິວສາຂາຂອງທ່ານ');
  }
  return existing;
}

/** ແຈ້ງລູກຄ້າ (ຖ້າເປັນບັນຊີແທ້ — ບໍ່ແມ່ນ guest walk-in) ວ່າຮອດຄິວແລ້ວ. */
async function notifyCalled(ticket: TicketRow, callNo: number): Promise<void> {
  const customerId = ticket.appointment?.customerId;
  if (!customerId || !ticket.phone) return;
  await notifyUser({
    userId: customerId,
    type: 'APPOINTMENT_QUEUE_CALLED',
    title: `ຮອດຄິວ ${ticket.ticketNumber} ແລ້ວ`,
    body: `ກະລຸນາມາທີ່ເຄົາເຕີ້ — ${ticket.service?.name ?? 'ບໍລິການ'}`,
    data: { appointmentId: ticket.appointmentId, ticketId: ticket.id },
    dedupeKey: `queue-called:${ticket.id}:${callNo}`,
  }).catch(() => undefined);
}

const APPT_STATUS_OF: Partial<Record<QueueStatus, AppointmentStatus>> = {
  WAITING: 'CONFIRMED',
  IN_SERVICE: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
};

/** PATCH /queue/:id — ຍ້າຍສະຖານະ + ຕີເວລາ + sync ໄປ Appointment ທີ່ຜູກ. */
export async function setTicketStatus(
  id: string,
  input: QueueSetStatusInput,
  scopeBranchId: string | null = null,
): Promise<QueueTicketView> {
  const existing = await loadTicketForWrite(id, scopeBranchId);
  if (existing.status === input.status) return toTicketView(existing);
  if (!TRANSITIONS[existing.status].includes(input.status)) {
    throw ApiError.conflict(`ບໍ່ສາມາດປ່ຽນບັດຄິວຈາກ ${existing.status} ໄປ ${input.status} ໄດ້`);
  }

  const now = new Date();
  const data: Prisma.QueueTicketUpdateInput = { status: input.status };
  switch (input.status) {
    case 'CALLED':
      Object.assign(data, {
        calledAt: existing.calledAt ?? now,
        lastCalledAt: now,
        callCount: { increment: 1 },
      });
      break;
    case 'IN_SERVICE':
      Object.assign(data, { calledAt: existing.calledAt ?? now, startedAt: existing.startedAt ?? now });
      break;
    case 'COMPLETED':
      Object.assign(data, { completedAt: now });
      break;
    case 'CANCELLED':
      Object.assign(data, { cancelledAt: now, cancelReason: input.reason ?? 'OTHER' });
      break;
    case 'WAITING':
      // ກູ້ຄືນ / ສົ່ງກັບຄິວ — ລ້າງເຫດຜົນຍົກເລີກ, ເກັບ calledAt ໄວ້ເປັນປະຫວັດ.
      Object.assign(data, { cancelledAt: null, cancelReason: null });
      break;
  }
  const row = await prisma.queueTicket.update({ where: { id }, data, include: TICKET_INCLUDE });

  // sync Appointment ຜ່ານ service ຫຼັກ (ຄະແນນ, ສະຕັອກ, ຄອມມິດຊັນ, waitlist).
  const appt = existing.appointment;
  if (appt) {
    const target: AppointmentStatus | undefined =
      input.status === 'CANCELLED'
        ? input.reason === 'NO_SHOW'
          ? 'NO_SHOW'
          : 'CANCELLED'
        : APPT_STATUS_OF[input.status];
    if (target && target !== appt.status && !['COMPLETED'].includes(appt.status)) {
      const { updateAppointmentStatus } = await import('../appointments/appointments.service.js');
      await updateAppointmentStatus(appt.id, { status: target });
    }
  }

  if (input.status === 'CALLED') await notifyCalled(row, row.callCount);
  return getTicket(id);
}

async function getTicket(id: string): Promise<QueueTicketView> {
  const row = await prisma.queueTicket.findUniqueOrThrow({ where: { id }, include: TICKET_INCLUDE });
  const customerId = row.appointment?.customerId;
  const visits = customerId ? await visitCounts([customerId]) : undefined;
  return toTicketView(row, { dayStart: startOfVientianeDay(new Date()), visits });
}

/** POST /queue/:id/recall — ເອີ້ນຊ້ຳ (ລູກຄ້າຍັງບໍ່ມາ). */
export async function recallTicket(
  id: string,
  scopeBranchId: string | null = null,
): Promise<QueueTicketView> {
  const existing = await loadTicketForWrite(id, scopeBranchId);
  if (existing.status !== 'CALLED') throw ApiError.conflict('ເອີ້ນຊ້ຳໄດ້ສະເພາະບັດທີ່ຖືກເອີ້ນແລ້ວ');
  const row = await prisma.queueTicket.update({
    where: { id },
    data: { lastCalledAt: new Date(), callCount: { increment: 1 } },
    include: TICKET_INCLUDE,
  });
  await notifyCalled(row, row.callCount);
  return getTicket(id);
}

/** PATCH /queue/:id/details — VIP / ໝາຍເຫດ / ປ່ຽນຊ່າງ (ອັບເດດ Appointment ທີ່ຜູກ). */
export async function updateTicketDetails(
  id: string,
  input: QueueUpdateDetailsInput,
  scopeBranchId: string | null = null,
): Promise<QueueTicketView> {
  const existing = await loadTicketForWrite(id, scopeBranchId);
  if (input.staffProfileId && input.staffProfileId !== existing.appointment?.staffProfileId) {
    if (!existing.appointment) throw ApiError.badRequest('ບັດຄິວນີ້ບໍ່ໄດ້ຜູກກັບນັດໝາຍ — ປ່ຽນຊ່າງບໍ່ໄດ້');
    if (existing.status === 'COMPLETED' || existing.status === 'CANCELLED') {
      throw ApiError.conflict('ປ່ຽນຊ່າງໄດ້ສະເພາະບັດທີ່ຍັງ active');
    }
    const staff = await prisma.staffProfile.findFirst({
      where: {
        id: input.staffProfileId,
        isActive: true,
        deletedAt: null,
        staffBranches: { some: { branchId: existing.branchId } },
        ...(existing.serviceId ? { staffServices: { some: { serviceId: existing.serviceId } } } : {}),
      },
      select: { id: true },
    });
    if (!staff) throw ApiError.badRequest('ຊ່າງທີ່ເລືອກໃຫ້ບໍລິການນີ້ຢູ່ສາຂານີ້ບໍ່ໄດ້');
    await prisma.appointment.update({
      where: { id: existing.appointment.id },
      data: { staffProfileId: staff.id },
    });
  }
  if (input.priority !== undefined || input.note !== undefined) {
    await prisma.queueTicket.update({
      where: { id },
      data: {
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.note !== undefined ? { note: input.note || null } : {}),
      },
    });
  }
  return getTicket(id);
}

/** POST /queue/clear-stale — ປິດບັດ active ທີ່ອອກກ່ອນມື້ນີ້ (EXPIRED). ບໍ່ແຕະ Appointment. */
export async function clearStaleTickets(branchId: string | 'all'): Promise<{ cleared: number }> {
  const now = new Date();
  const res = await prisma.queueTicket.updateMany({
    where: {
      ...(branchId === 'all' ? {} : { branchId }),
      status: { in: [...ACTIVE_STATUSES] },
      createdAt: { lt: startOfVientianeDay(now) },
    },
    data: { status: 'CANCELLED', cancelledAt: now, cancelReason: 'EXPIRED' },
  });
  return { cleared: res.count };
}

/** ເລກບັດຖັດໄປສຳລັບສາຂາ+ວັນນີ້ (ເວລາວຽງຈັນ) — `A001`, `A002`, … */
async function nextTicketNumber(
  branchId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<string> {
  const todayCount = await client.queueTicket.count({
    where: { branchId, createdAt: { gte: startOfVientianeDay(new Date()) } },
  });
  return `A${String(todayCount + 1).padStart(3, '0')}`;
}

/** ນັດໝາຍ status → ບັດຄິວ status (mirror). undefined = ບໍ່ຕ້ອງແຕະບັດຄິວ. */
const TICKET_STATUS_OF: Partial<Record<AppointmentStatus, QueueStatus>> = {
  CONFIRMED: 'WAITING',
  IN_PROGRESS: 'IN_SERVICE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'CANCELLED',
};

/**
 * ໃຫ້ບັດຄິວທີ່ຜູກກັບ appointment ນີ້ຕິດຕາມສະຖານະ appointment.
 * no-op ເມື່ອບໍ່ມີບັດຄິວຜູກ (ນັດ online) — ໃຊ້ updateMany.
 */
export async function mirrorTicketFromAppointment(
  tx: Prisma.TransactionClient,
  appointmentId: string,
  status: AppointmentStatus,
): Promise<void> {
  const target = TICKET_STATUS_OF[status];
  if (!target) return;
  const ticket = await tx.queueTicket.findUnique({
    where: { appointmentId },
    select: { id: true, status: true, calledAt: true, startedAt: true, completedAt: true, cancelReason: true },
  });
  if (!ticket || ticket.status === target) return;
  const now = new Date();
  await tx.queueTicket.update({
    where: { id: ticket.id },
    data: {
      status: target,
      ...(target === 'IN_SERVICE' ? { calledAt: ticket.calledAt ?? now, startedAt: ticket.startedAt ?? now } : {}),
      ...(target === 'COMPLETED'
        ? { startedAt: ticket.startedAt ?? now, completedAt: ticket.completedAt ?? now }
        : {}),
      ...(target === 'CANCELLED'
        ? { cancelledAt: now, cancelReason: status === 'NO_SHOW' ? 'NO_SHOW' : 'OTHER' }
        : {}),
      ...(target === 'WAITING' ? { cancelledAt: null, cancelReason: null } : {}),
    },
  });
}

/**
 * POST /queue/check-in — QR Check-in ໜ້າຮ້ານ (Module 10).
 * ລູກຄ້າສະແກນ QR ຂອງສາຂາ → ນັດ CONFIRMED + ອອກ/ຜູກບັດຄິວໃຫ້.
 */
export async function checkInByAppointment(
  customerId: string,
  input: QueueCheckInInput,
): Promise<QueueCheckInResult> {
  const appt = await prisma.appointment.findFirst({
    where: { id: input.appointmentId, customerId, deletedAt: null },
    select: {
      id: true,
      branchId: true,
      status: true,
      startAt: true,
      customerId: true,
      serviceId: true,
      service: { select: { name: true } },
      customer: { select: { name: true, phone: true } },
      queueTicket: { select: { id: true, status: true } },
    },
  });
  if (!appt) throw ApiError.notFound('ບໍ່ພົບນັດໝາຍ ຫຼື ບໍ່ແມ່ນນັດຂອງທ່ານ');
  if (input.branchId && input.branchId !== appt.branchId) {
    throw ApiError.badRequest('QR ນີ້ບໍ່ແມ່ນຂອງສາຂາທີ່ທ່ານມີນັດ');
  }
  if (!['PENDING', 'CONFIRMED'].includes(appt.status)) {
    throw ApiError.badRequest('ນັດໝາຍນີ້ check-in ບໍ່ໄດ້ (ສະຖານະປັດຈຸບັນ: ' + appt.status + ')');
  }
  // ອະນຸຍາດ check-in ພາຍໃນວັນນັດ (ບໍ່ເກີນ 1 ມື້ລ່ວງໜ້າ / 4 ຊມ. ຫຼັງເລີ່ມ) — ຄ່າຮ່ວມກັບ mobile
  const window = checkInWindow(appt.startAt);
  if (window === 'too-early') throw ApiError.badRequest('ຍັງບໍ່ຮອດເວລາ check-in ຂອງນັດນີ້ (ເປີດກ່ອນເວລານັດ 24 ຊົ່ວໂມງ)');
  if (window === 'closed') throw ApiError.badRequest('ໝົດເວລາ check-in ຂອງນັດນີ້ແລ້ວ');

  // ສະແກນຊ້ຳ — ບັດຍັງ active ຢູ່ ຄືນບັດເດີມ (ບໍ່ reset CALLED/IN_SERVICE ກັບເປັນ WAITING).
  if (appt.queueTicket && (ACTIVE_STATUSES as readonly string[]).includes(appt.queueTicket.status)) {
    const existing = await prisma.queueTicket.findUniqueOrThrow({
      where: { id: appt.queueTicket.id },
      include: TICKET_INCLUDE,
    });
    return { appointmentId: appt.id, status: existing.status, ticket: toTicketView(existing) };
  }

  return prisma.$transaction(async (tx) => {
    if (appt.status === 'PENDING') {
      await tx.appointment.update({ where: { id: appt.id }, data: { status: 'CONFIRMED' } });
    }

    let ticket: TicketRow;
    if (appt.queueTicket) {
      ticket = await tx.queueTicket.update({
        where: { id: appt.queueTicket.id },
        data: { status: 'WAITING' },
        include: TICKET_INCLUDE,
      });
    } else {
      ticket = await tx.queueTicket.create({
        data: {
          branchId: appt.branchId,
          serviceId: appt.serviceId,
          appointmentId: appt.id,
          ticketNumber: await nextTicketNumber(appt.branchId, tx),
          customerName: appt.customer.name,
          phone: appt.customer.phone.startsWith('walkin-') ? '' : appt.customer.phone,
          status: 'WAITING',
        },
        include: TICKET_INCLUDE,
      });
    }

    return { appointmentId: appt.id, status: 'WAITING', ticket: toTicketView(ticket) };
  });
}

/**
 * POST /appointments/walk-in — walk-in ໜ້າຮ້ານ.
 * ສ້າງ **Appointment ຈິງ** (source = WALK_IN) + ບັດຄິວທີ່ຜູກກັນ ໃນ transaction ດຽວ.
 * ຊ່າງ: ຖ້າ input.staffId ບໍ່ໃສ່ → ເລືອກຊ່າງ eligible ທີ່ຄິວ active ມື້ນີ້ໜ້ອຍສຸດ.
 * ລູກຄ້າ: upsert ຕາມເບີໂທ (ຖ້າມີ) ບໍ່ດັ່ງນັ້ນສ້າງ guest user.
 */
export async function createWalkIn(input: WalkInInput): Promise<WalkInResult> {
  const [branch, service] = await Promise.all([
    prisma.branch.findFirst({ where: { id: input.branchId, deletedAt: null }, select: { id: true } }),
    prisma.service.findFirst({
      where: { id: input.serviceId, deletedAt: null },
      select: { id: true, durationMinutes: true, price: true },
    }),
  ]);
  if (!branch) throw ApiError.notFound('ບໍ່ພົບສາຂາ');
  if (!service) throw ApiError.notFound('ບໍ່ພົບບໍລິການ');

  // 1) ຫາຊ່າງ — ຕ້ອງຢູ່ສາຂານີ້ + ໃຫ້ບໍລິການນີ້ໄດ້
  const eligibleWhere: Prisma.StaffProfileWhereInput = {
    isActive: true,
    deletedAt: null,
    staffBranches: { some: { branchId: input.branchId } },
    staffServices: { some: { serviceId: input.serviceId } },
    ...(input.staffId ? { id: input.staffId } : {}),
  };

  let staffProfileId: string;
  if (input.staffId) {
    const staff = await prisma.staffProfile.findFirst({ where: eligibleWhere, select: { id: true } });
    if (!staff) throw ApiError.badRequest('ຊ່າງທີ່ເລືອກໃຫ້ບໍລິການນີ້ຢູ່ສາຂານີ້ບໍ່ໄດ້');
    staffProfileId = staff.id;
  } else {
    const dayStart = startOfVientianeDay(new Date());
    const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1);
    const candidates = await prisma.staffProfile.findMany({
      where: eligibleWhere,
      select: {
        id: true,
        _count: {
          select: {
            appointments: {
              where: {
                deletedAt: null,
                status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] },
                startAt: { gte: dayStart, lte: dayEnd },
              },
            },
          },
        },
      },
    });
    if (candidates.length === 0) {
      throw ApiError.badRequest('ບໍ່ມີຊ່າງໃຫ້ບໍລິການນີ້ຢູ່ສາຂານີ້');
    }
    candidates.sort((a, b) => a._count.appointments - b._count.appointments);
    staffProfileId = candidates[0]!.id;
  }

  // 2) ລູກຄ້າ — upsert ຕາມເບີ ຫຼື guest
  const name = input.customerName.trim();
  const phone = input.customerPhone?.trim();
  const customer = phone
    ? await prisma.user.upsert({
        where: { phone },
        update: {},
        create: { name, phone, role: 'CUSTOMER', branchId: input.branchId },
        select: { id: true },
      })
    : await prisma.user.create({
        data: {
          name,
          phone: `walkin-${randomUUID().slice(0, 18)}`,
          role: 'CUSTOMER',
          branchId: input.branchId,
        },
        select: { id: true },
      });

  // 3) Appointment + ບັດຄິວ ໃນ transaction ດຽວ
  const now = new Date();
  const endAt = addMinutes(now, service.durationMinutes);
  return prisma.$transaction(async (tx) => {
    const appt = await tx.appointment.create({
      data: {
        branchId: input.branchId,
        customerId: customer.id,
        staffProfileId,
        serviceId: input.serviceId,
        startAt: now,
        endAt,
        status: 'CONFIRMED',
        source: 'WALK_IN',
        deliveryType: 'IN_STORE',
        totalAmount: service.price,
        currency: 'LAK',
      },
      select: { id: true },
    });

    const ticket = await tx.queueTicket.create({
      data: {
        branchId: input.branchId,
        serviceId: input.serviceId,
        appointmentId: appt.id,
        ticketNumber: await nextTicketNumber(input.branchId, tx),
        customerName: name,
        phone: phone ?? '',
        status: 'WAITING',
        priority: input.priority ?? 'NORMAL',
        note: input.note || null,
      },
      include: TICKET_INCLUDE,
    });

    return { ticket: toTicketView(ticket), appointmentId: appt.id };
  });
}
