import type { DashboardStatsQuery, DashboardStatsView } from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { recognisedOperatingCost } from '../expenses/expenses.service.js';
import { prisma } from '../../config/database.js';

const DAY = 86_400_000;
const VTE_OFFSET_MS = 7 * 3_600_000; // Asia/Vientiane = UTC+7, no DST

/** Calendar-day key in Vientiane time, e.g. "2026-09-10". */
function vteDayKey(ms: number): string {
  return new Date(ms + VTE_OFFSET_MS).toISOString().slice(0, 10);
}
/** Hour-of-day (0–23) in Vientiane time. */
function vteHour(ms: number): number {
  return new Date(ms + VTE_OFFSET_MS).getUTCHours();
}
/** UTC instant of 00:00 Vientiane for a day key. */
function vteDayStart(key: string): Date {
  return new Date(`${key}T00:00:00+07:00`);
}

const APPT_INCLUDE = {
  branch: { select: { name: true } },
  service: { select: { name: true } },
  customer: { select: { name: true, phone: true } },
  staffProfile: { select: { user: { select: { name: true } } } },
  payment: { select: { depositAmount: true } },
} satisfies Prisma.AppointmentInclude;

type ApptRow = Prisma.AppointmentGetPayload<{ include: typeof APPT_INCLUDE }>;

type Mini = DashboardStatsView['upcoming'][number];

function toMini(a: ApptRow): Mini {
  return {
    id: a.id,
    code: `A-${a.id.slice(0, 8).toUpperCase()}`,
    status: a.status,
    startAt: a.startAt.toISOString(),
    endAt: a.endAt.toISOString(),
    branchId: a.branchId,
    branchName: a.branch.name,
    customerId: a.customerId,
    customerName: a.customer.name,
    customerPhone: a.customer.phone,
    staffId: a.staffProfileId,
    staffName: a.staffProfile.user.name,
    serviceId: a.serviceId,
    serviceName: a.service.name,
    deliveryType: a.deliveryType,
    price: a.totalAmount.toNumber(),
    depositPaid: a.payment?.depositAmount.toNumber() ?? 0,
    isWalkIn: a.source === 'WALK_IN',
    createdAt: a.createdAt.toISOString(),
  };
}

const UPCOMING_STATUSES = ['CONFIRMED', 'PENDING', 'IN_PROGRESS'];
const HOME_SERVICE_ACTIVE = ['MATCHING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'] as const;
const TODAY_AGENDA_LIMIT = 60;
const LOW_STOCK_LIMIT = 6;
const RECENT_REVIEWS_LIMIT = 4;

/**
 * GET /dashboard/stats — ຕົວເລກສະຫຼຸບ + series ສຳລັບໜ້າ Dashboard.
 *
 * `days` (7/14/30) ກຳນົດຊ່ວງວິເຄາະ; ຊ່ວງກ່ອນໜ້າທີ່ຍາວເທົ່າກັນຖືກດຶງມາພ້ອມເພື່ອປຽບທຽບ.
 * ຊື່ field `*14d` ຖືກຮັກສາໄວ້ເພື່ອບໍ່ໃຫ້ client ເກົ່າ (ໜ້າ reports) ແຕກ — ຄ່າຄິດຕາມ `days`.
 */
export async function getDashboardStats(query: DashboardStatsQuery): Promise<DashboardStatsView> {
  const branchId = query.branchId;
  const days = Number(query.days ?? 14);
  const branchWhere = branchId === 'all' ? {} : { branchId };
  const nowMs = Date.now();
  const todayKey = vteDayKey(nowMs);
  const ydayKey = vteDayKey(nowMs - DAY);
  const todayStart = vteDayStart(todayKey);
  const periodStart = new Date(nowMs - days * DAY);
  const prevStart = new Date(nowMs - 2 * days * DAY);

  // ຂອບເຂດລູກຄ້າ / ພະນັກງານ ຕາມສາຂາ. ລູກຄ້າບໍ່ມີສາຂາສັງກັດ — "ລູກຄ້າຂອງສາຂາ" = ມີນັດຢູ່ສາຂານັ້ນຢ່າງໜ້ອຍ 1 ນັດ.
  const customerWhere: Prisma.UserWhereInput = {
    role: 'CUSTOMER',
    deletedAt: null,
    ...(branchId === 'all' ? {} : { appointments: { some: { branchId, deletedAt: null } } }),
  };
  const timeOffWhere: Prisma.StaffTimeOffWhereInput =
    branchId === 'all' ? {} : { staffProfile: { staffBranches: { some: { branchId } } } };
  // ກົງກັບ toTimeOffView (staff-admin): ຄຳຂໍທີ່ REJECTED ກໍມີ isApproved=false ແຕ່ບໍ່ແມ່ນ "ລໍຖ້າ".
  const pendingTimeOffWhere: Prisma.StaffTimeOffWhereInput = {
    ...timeOffWhere,
    isApproved: false,
    status: { notIn: ['APPROVED', 'REJECTED'] },
  };

  const [
    appts,
    queue,
    totalCustomers,
    vipCustomers,
    timeOffTotal,
    pendingApprovals,
    newCustomers,
    prevNewCustomers,
    products,
    openPurchaseOrders,
    transfersInTransit,
    waitlist,
    homeServiceActive,
    reviews,
    collectedAgg,
    expensesAgg,
    receivables,
    staffPerBranch,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        deletedAt: null,
        ...branchWhere,
        startAt: { gte: new Date(nowMs - (2 * days + 1) * DAY), lte: new Date(nowMs + 8 * DAY) },
      },
      include: APPT_INCLUDE,
      orderBy: { startAt: 'asc' },
    }),
    // ບັດຄິວຂອງມື້ນີ້ເທົ່ານັ້ນ — ບັດເກົ່າທີ່ຄ້າງ WAITING ບໍ່ໃຫ້ນັບເປັນ "ກຳລັງລໍຖ້າ".
    prisma.queueTicket.findMany({ where: { ...branchWhere, createdAt: { gte: todayStart } } }),
    prisma.user.count({ where: customerWhere }),
    prisma.user.count({
      where: { ...customerWhere, loyaltyAccount: { tierLevel: { in: ['GOLD', 'PLATINUM'] } } },
    }),
    prisma.staffTimeOff.count({ where: timeOffWhere }),
    prisma.staffTimeOff.count({ where: pendingTimeOffWhere }),
    prisma.user.count({ where: { ...customerWhere, createdAt: { gte: periodStart } } }),
    prisma.user.count({
      where: { ...customerWhere, createdAt: { gte: prevStart, lt: periodStart } },
    }),
    prisma.product.findMany({
      where: { deletedAt: null, isActive: true, ...branchWhere },
      select: {
        id: true,
        name: true,
        sku: true,
        unit: true,
        stockQty: true,
        minStockQty: true,
        branch: { select: { name: true } },
      },
    }),
    prisma.purchaseOrder.count({ where: { ...branchWhere, status: 'ORDERED' } }),
    prisma.stockTransfer.count({
      where: {
        status: 'IN_TRANSIT',
        ...(branchId === 'all' ? {} : { toBranchId: branchId }),
      },
    }),
    prisma.waitlist.count({
      where: { ...branchWhere, preferredDate: { gte: vteDayStart(todayKey) } },
    }),
    prisma.homeServiceTrip.count({
      where: {
        status: { in: [...HOME_SERVICE_ACTIVE] },
        ...(branchId === 'all' ? {} : { appointment: { branchId } }),
      },
    }),
    prisma.review.findMany({
      where: {
        createdAt: { gte: periodStart },
        ...(branchId === 'all' ? {} : { appointment: { branchId } }),
      },
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        user: { select: { name: true } },
        appointment: {
          select: {
            branchId: true,
            service: { select: { name: true } },
            staffProfile: { select: { user: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.paymentTransaction.aggregate({
      _sum: { amount: true },
      where: {
        status: 'SUCCESS',
        createdAt: { gte: todayStart },
        ...(branchId === 'all' ? {} : { payment: { branchId } }),
      },
    }),
    // E10 — ຕາມສ່ວນແບ່ງຂອງສາຂາ; amountBase = LAK. ໝວດຊື້ສິນຄ້າບໍ່ນັບ (COGS ຄິດຈາກສະຕັອກແລ້ວ).
    recognisedOperatingCost(branchId === 'all' ? undefined : branchId, vteDayStart(vteDayKey(periodStart.getTime()))),
    // ບິນທີ່ຍັງຄ້າງຊຳລະ (ທຸກຊ່ວງເວລາ) — ສູດດຽວກັບ financeSummary: total − Σ SUCCESS tenders.
    prisma.$queryRaw<{ bills: bigint; outstanding: Prisma.Decimal | null }[]>`
      SELECT
        COUNT(*) FILTER (WHERE p."totalAmount" - COALESCE(paid.amount, 0) > 0) AS bills,
        COALESCE(SUM(GREATEST(p."totalAmount" - COALESCE(paid.amount, 0), 0)), 0) AS outstanding
      FROM "payments" p
      LEFT JOIN LATERAL (
        SELECT SUM(pt."amount") AS amount
        FROM "payment_transactions" pt
        WHERE pt."paymentId" = p."id" AND pt."status" = 'SUCCESS'
      ) paid ON true
      WHERE p."paymentStatus" IN ('PENDING', 'DEPOSIT_PAID')
        ${branchId === 'all' ? Prisma.empty : Prisma.sql`AND p."branchId" = ${branchId}`}
    `,
    prisma.staffBranch.groupBy({
      by: ['branchId'],
      where: { ...branchWhere, staffProfile: { deletedAt: null } },
      _count: { _all: true },
    }),
  ]);

  const dayKey = (d: Date) => vteDayKey(d.getTime());
  const today = appts.filter((a) => dayKey(a.startAt) === todayKey);
  const yesterday = appts.filter((a) => dayKey(a.startAt) === ydayKey);
  const completedToday = today.filter((a) => a.status === 'COMPLETED');
  const price = (a: ApptRow) => a.totalAmount.toNumber();
  const sum = (rows: ApptRow[]) => rows.reduce((s, a) => s + price(a), 0);
  const completedOf = (rows: ApptRow[]) => rows.filter((a) => a.status === 'COMPLETED');

  const revenueToday = sum(completedToday);
  const revenueYesterday = sum(completedOf(yesterday));
  const ratio = (curr: number, prev: number) =>
    prev === 0 ? (curr === 0 ? 0 : 1) : (curr - prev) / prev;

  // Bucket every fetched appointment by Vientiane day once, then read series from the map.
  const byDay = new Map<string, ApptRow[]>();
  for (const a of appts) {
    const k = dayKey(a.startAt);
    const list = byDay.get(k);
    if (list) list.push(a);
    else byDay.set(k, [a]);
  }
  const seriesPoint = (key: string) => {
    const rows = byDay.get(key) ?? [];
    return { revenue: sum(completedOf(rows)), bookings: rows.length };
  };
  const revenueSeries = Array.from({ length: days }, (_, i) => {
    const key = vteDayKey(nowMs - (days - 1 - i) * DAY);
    return { date: key, ...seriesPoint(key) };
  });
  const prevSeries = Array.from({ length: days }, (_, i) =>
    seriesPoint(vteDayKey(nowMs - (2 * days - 1 - i) * DAY)),
  );

  const inWindow = (a: ApptRow, from: number, to: number) => {
    const ts = a.startAt.getTime();
    return ts >= from && ts <= to;
  };
  const lastN = appts.filter((a) => inWindow(a, periodStart.getTime(), nowMs));
  const prevN = appts.filter((a) => inWindow(a, prevStart.getTime(), periodStart.getTime() - 1));
  const lastNCompleted = completedOf(lastN);
  const prevNCompleted = completedOf(prevN);
  const avg = (rows: ApptRow[]) => (rows.length ? Math.round(sum(rows) / rows.length) : 0);

  const mix = new Map<string, { name: string; value: number; revenue: number }>();
  for (const a of lastN) {
    const e = mix.get(a.service.name) ?? { name: a.service.name, value: 0, revenue: 0 };
    e.value += 1;
    if (a.status === 'COMPLETED') e.revenue += price(a);
    mix.set(a.service.name, e);
  }
  const serviceMix = [...mix.values()].sort((a, b) => b.value - a.value).slice(0, 6);

  const upcoming = appts
    .filter((a) => a.startAt.getTime() >= nowMs && UPCOMING_STATUSES.includes(a.status))
    .map(toMini);

  const next7 = appts.filter((a) => {
    const ts = a.startAt.getTime();
    return ts >= nowMs && ts <= nowMs + 7 * DAY && UPCOMING_STATUSES.includes(a.status);
  });

  const lb = new Map<string, { name: string; completed: number; revenue: number }>();
  for (const a of lastNCompleted) {
    const e = lb.get(a.staffProfileId) ?? {
      name: a.staffProfile.user.name,
      completed: 0,
      revenue: 0,
    };
    e.completed += 1;
    e.revenue += price(a);
    lb.set(a.staffProfileId, e);
  }
  const staffLeaderboard = [...lb.values()]
    .sort((a, b) => b.completed - a.completed || b.revenue - a.revenue)
    .slice(0, 5);

  const STATUS_ORDER = ['CONFIRMED', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];
  const sb = new Map<string, number>();
  for (const a of lastN) sb.set(a.status, (sb.get(a.status) ?? 0) + 1);
  const statusBreakdown = STATUS_ORDER.filter((s) => sb.has(s)).map((status) => ({
    status,
    count: sb.get(status)!,
  }));

  const upcoming7dSeries = Array.from(
    { length: 7 },
    (_, i) =>
      (byDay.get(vteDayKey(nowMs + i * DAY)) ?? []).filter((a) =>
        UPCOMING_STATUSES.includes(a.status),
      ).length,
  );

  const hoursToday = Array.from({ length: 11 }, (_, i) => {
    const hour = 9 + i;
    return { hour, count: today.filter((a) => vteHour(a.startAt.getTime()) === hour).length };
  });

  // ── Per-branch drill-down (dashboard province map) ──
  type BranchPerf = DashboardStatsView['branchPerformance'][number];
  const SPARK_DAYS = 7;
  const bp = new Map<
    string,
    BranchPerf & { _customers: Set<string>; _services: Map<string, number> }
  >();
  const branchEntry = (a: ApptRow) => {
    let e = bp.get(a.branchId);
    if (!e) {
      e = {
        branchId: a.branchId,
        name: a.branch.name,
        revenue: 0,
        bookings: 0,
        completed: 0,
        lost: 0,
        prevRevenue: 0,
        prevBookings: 0,
        todayBookings: 0,
        todayRevenue: 0,
        upcoming7d: 0,
        customers: 0,
        walkins: 0,
        homeService: 0,
        topService: null,
        staffCount: 0,
        ratingAvg: 0,
        ratingCount: 0,
        spark: Array.from({ length: SPARK_DAYS }, () => 0),
        _customers: new Set(),
        _services: new Map(),
      };
      bp.set(a.branchId, e);
    }
    return e;
  };
  const sparkKeys = Array.from({ length: SPARK_DAYS }, (_, i) =>
    vteDayKey(nowMs - (SPARK_DAYS - 1 - i) * DAY),
  );
  for (const a of lastN) {
    const e = branchEntry(a);
    e.bookings += 1;
    e._customers.add(a.customerId);
    e._services.set(a.service.name, (e._services.get(a.service.name) ?? 0) + 1);
    if (a.source === 'WALK_IN') e.walkins += 1;
    if (a.deliveryType !== 'IN_STORE') e.homeService += 1;
    if (a.status === 'COMPLETED') {
      e.revenue += price(a);
      e.completed += 1;
    }
    if (a.status === 'CANCELLED' || a.status === 'NO_SHOW') e.lost += 1;
    const si = sparkKeys.indexOf(dayKey(a.startAt));
    if (si >= 0) e.spark[si]! += 1;
  }
  for (const a of prevN) {
    const e = branchEntry(a);
    e.prevBookings += 1;
    if (a.status === 'COMPLETED') e.prevRevenue += price(a);
  }
  for (const a of today) {
    const e = branchEntry(a);
    e.todayBookings += 1;
    if (a.status === 'COMPLETED') e.todayRevenue += price(a);
  }
  for (const a of next7) branchEntry(a).upcoming7d += 1;
  const ratingSums = new Map<string, number>();
  for (const rv of reviews) {
    const e = bp.get(rv.appointment.branchId);
    if (!e) continue;
    e.ratingCount += 1;
    ratingSums.set(e.branchId, (ratingSums.get(e.branchId) ?? 0) + rv.rating);
  }
  const staffCounts = new Map(staffPerBranch.map((g) => [g.branchId, g._count._all]));
  const branchPerformance: BranchPerf[] = [...bp.values()]
    .map(({ _customers, _services, ...e }) => ({
      ...e,
      customers: _customers.size,
      topService: [..._services.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
      staffCount: staffCounts.get(e.branchId) ?? 0,
      ratingAvg: e.ratingCount
        ? Math.round(((ratingSums.get(e.branchId) ?? 0) / e.ratingCount) * 10) / 10
        : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const waiting = queue
    .filter((t) => t.status === 'WAITING')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const queueLongestWaitMin = waiting.length
    ? Math.max(0, Math.round((nowMs - waiting[0]!.createdAt.getTime()) / 60_000))
    : 0;

  // Returning = active customers in the period who already had an appointment before it.
  const activeIds = [...new Set(lastN.map((a) => a.customerId))];
  const returningCustomers = activeIds.length
    ? (
        await prisma.appointment.groupBy({
          by: ['customerId'],
          where: { deletedAt: null, customerId: { in: activeIds }, startAt: { lt: periodStart } },
        })
      ).length
    : 0;

  const num = (d: Prisma.Decimal | null | undefined) => (d ? d.toNumber() : 0);
  const lowStockRows = products
    .map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      stockQty: p.stockQty.toNumber(),
      minStockQty: p.minStockQty.toNumber(),
      branchName: p.branch.name,
    }))
    .filter((p) => p.stockQty <= p.minStockQty)
    .sort((a, b) => a.stockQty / (a.minStockQty || 1) - b.stockQty / (b.minStockQty || 1));

  const distribution = [0, 0, 0, 0, 0];
  for (const r of reviews) {
    const idx = Math.min(5, Math.max(1, r.rating)) - 1;
    distribution[idx] = (distribution[idx] ?? 0) + 1;
  }
  const ratingAvg = reviews.length
    ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10
    : 0;

  return {
    branchId,
    range: { from: revenueSeries[0]!.date, to: revenueSeries[revenueSeries.length - 1]!.date },
    bookingsToday: today.length,
    bookingsTodayDelta: ratio(today.length, yesterday.length),
    revenueToday,
    revenueTodayDelta: ratio(revenueToday, revenueYesterday),
    queueWaiting: waiting.length,
    completedToday: completedToday.length,
    revenueSeries,
    serviceMix,
    upcoming,
    cancelledToday: today.filter((a) => a.status === 'CANCELLED').length,
    noShowToday: today.filter((a) => a.status === 'NO_SHOW').length,
    avgTicket14d: avg(lastNCompleted),
    vipCustomers,
    totalCustomers,
    pendingApprovals,
    upcoming7d: next7.length,
    pendingConfirmation: next7.filter((a) => a.status === 'PENDING').length,
    staffLeaderboard,
    statusBreakdown,
    homeServiceToday: today.filter((a) => a.deliveryType === 'HOME_SERVICE').length,
    // 0..1 ratio — the web-admin contract (types/models.ts) multiplies by 100 itself.
    walkinRate14d: lastN.length
      ? lastN.filter((a) => a.source === 'WALK_IN').length / lastN.length
      : 0,
    depositsToday: today.reduce((s, a) => s + (a.payment?.depositAmount.toNumber() ?? 0), 0),
    timeOffTotal,
    upcoming7dSeries,
    hoursToday,
    branchPerformance,
    confirmedToday: today.filter((a) => a.status === 'CONFIRMED').length,
    pendingToday: today.filter((a) => a.status === 'PENDING').length,
    walkinsToday: today.filter((a) => a.source === 'WALK_IN').length,
    queueInService: queue.filter((t) => t.status === 'IN_SERVICE').length,
    queueCalled: queue.filter((t) => t.status === 'CALLED').length,
    queueLongestWaitMin,
    queueNextNumber: waiting[0]?.ticketNumber ?? null,

    periodDays: days,
    prevSeries,
    period: {
      revenue: sum(lastNCompleted),
      bookings: lastN.length,
      completed: lastNCompleted.length,
      cancelled: lastN.filter((a) => a.status === 'CANCELLED').length,
      noShow: lastN.filter((a) => a.status === 'NO_SHOW').length,
      avgTicket: avg(lastNCompleted),
      expenses: expensesAgg,
      prevRevenue: sum(prevNCompleted),
      prevBookings: prevN.length,
      prevCompleted: prevNCompleted.length,
      prevAvgTicket: avg(prevNCompleted),
      newCustomers,
      prevNewCustomers,
      activeCustomers: activeIds.length,
      returningCustomers,
    },
    todayAgenda: today.slice(0, TODAY_AGENDA_LIMIT).map(toMini),
    collectedToday: num(collectedAgg._sum.amount),
    attention: {
      lowStock: lowStockRows.length,
      openPurchaseOrders,
      transfersInTransit,
      unpaidBills: Number(receivables[0]?.bills ?? 0),
      outstandingBalance: num(receivables[0]?.outstanding),
      waitlist,
      homeServiceActive,
      lowRatings: reviews.filter((r) => r.rating <= 2).length,
    },
    lowStockItems: lowStockRows.slice(0, LOW_STOCK_LIMIT),
    rating: { avg: ratingAvg, count: reviews.length, distribution },
    recentReviews: reviews.slice(0, RECENT_REVIEWS_LIMIT).map((r) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      customerName: r.user.name,
      serviceName: r.appointment.service.name,
      staffName: r.appointment.staffProfile.user.name,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}
