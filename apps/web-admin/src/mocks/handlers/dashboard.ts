import { http } from 'msw';

import type { AppointmentListItem, DashboardPeriod, DashboardStats } from '@/types/models';

import { NOW_MS } from '../fixtures/dataset';
import { db } from '../fixtures/store';
import { api, delay, ok } from '../helpers';

const DAY = 86_400_000;
const sameDay = (aIso: string, ms: number) =>
  new Date(aIso).toDateString() === new Date(ms).toDateString();

export const dashboardHandlers = [
  http.get(api('/dashboard/stats'), async ({ request }) => {
    await delay(300);
    const url = new URL(request.url);
    const branchId = url.searchParams.get('branchId') ?? 'all';
    const daysParam = Number(url.searchParams.get('days') ?? 14);
    const days = (daysParam === 7 || daysParam === 30 ? daysParam : 14) as DashboardPeriod;

    const scoped = db.appointments.filter(
      (a) => branchId === 'all' || a.branchId === branchId,
    );

    const today = scoped.filter((a) => sameDay(a.startAt, NOW_MS));
    const yesterday = scoped.filter((a) => sameDay(a.startAt, NOW_MS - DAY));
    const completedToday = today.filter((a) => a.status === 'COMPLETED');

    const revenueToday = completedToday.reduce((sum, a) => sum + a.price, 0);
    const revenueYesterday = yesterday
      .filter((a) => a.status === 'COMPLETED')
      .reduce((sum, a) => sum + a.price, 0);

    const ratio = (curr: number, prev: number) =>
      prev === 0 ? (curr === 0 ? 0 : 1) : (curr - prev) / prev;

    // period revenue + bookings series
    const revenueSeries = Array.from({ length: days }, (_, i) => {
      const dayMs = NOW_MS - (days - 1 - i) * DAY;
      const dayAppts = scoped.filter((a) => sameDay(a.startAt, dayMs));
      return {
        date: new Date(dayMs).toISOString().slice(0, 10),
        revenue: dayAppts
          .filter((a) => a.status === 'COMPLETED')
          .reduce((s, a) => s + a.price, 0),
        bookings: dayAppts.length,
      };
    });

    const prevSeries = Array.from({ length: days }, (_, i) => {
      const dayAppts = scoped.filter((a) => sameDay(a.startAt, NOW_MS - (2 * days - 1 - i) * DAY));
      return {
        revenue: dayAppts.filter((a) => a.status === 'COMPLETED').reduce((s, a) => s + a.price, 0),
        bookings: dayAppts.length,
      };
    });

    // Every upcoming appointment (client paginates the full list, 10 per page).
    const upcoming = scoped
      .filter((a) => new Date(a.startAt).getTime() >= NOW_MS)
      .filter((a) => a.status === 'CONFIRMED' || a.status === 'PENDING' || a.status === 'IN_PROGRESS');

    // ---- extended metrics ----
    const within = (iso: string, from: number, to: number) => {
      const ts = new Date(iso).getTime();
      return ts >= from && ts <= to;
    };
    const last14 = scoped.filter((a) => within(a.startAt, NOW_MS - days * DAY, NOW_MS));
    const last14Completed = last14.filter((a) => a.status === 'COMPLETED');
    const prevN = scoped.filter((a) =>
      within(a.startAt, NOW_MS - 2 * days * DAY, NOW_MS - days * DAY - 1),
    );
    const prevNCompleted = prevN.filter((a) => a.status === 'COMPLETED');
    const sumPrice = (rows: AppointmentListItem[]) => rows.reduce((s, a) => s + a.price, 0);
    const avgPrice = (rows: AppointmentListItem[]) =>
      rows.length ? Math.round(sumPrice(rows) / rows.length) : 0;

    const mixMap = new Map<string, { name: string; value: number; revenue: number }>();
    for (const a of last14) {
      const e = mixMap.get(a.serviceName) ?? { name: a.serviceName, value: 0, revenue: 0 };
      e.value += 1;
      if (a.status === 'COMPLETED') e.revenue += a.price;
      mixMap.set(a.serviceName, e);
    }
    const serviceMix = [...mixMap.values()].sort((a, b) => b.value - a.value).slice(0, 6);

    const activeIds = new Set(last14.map((a) => a.customerId));
    const returningCustomers = [...activeIds].filter((id) =>
      scoped.some((a) => a.customerId === id && new Date(a.startAt).getTime() < NOW_MS - days * DAY),
    ).length;
    const customerCreated = (from: number, to: number) =>
      db.customers.filter((c) => within(c.createdAt, from, to)).length;

    const cancelledToday = today.filter((a) => a.status === 'CANCELLED').length;
    const noShowToday = today.filter((a) => a.status === 'NO_SHOW').length;

    const avgTicket14d = last14Completed.length
      ? Math.round(last14Completed.reduce((s, a) => s + a.price, 0) / last14Completed.length)
      : 0;

    const vipCustomers = db.customers.filter(
      (c) => c.loyaltyTier === 'GOLD' || c.loyaltyTier === 'PLATINUM',
    ).length;

    const pendingApprovals = db.timeOff.filter((r) => r.status === 'PENDING').length;

    const next7 = scoped.filter((a) => {
      const ts = new Date(a.startAt).getTime();
      return (
        ts >= NOW_MS &&
        ts <= NOW_MS + 7 * DAY &&
        (a.status === 'CONFIRMED' || a.status === 'PENDING' || a.status === 'IN_PROGRESS')
      );
    });
    const pendingConfirmation = next7.filter((a) => a.status === 'PENDING').length;

    const lb = new Map<string, { name: string; completed: number; revenue: number }>();
    for (const a of last14Completed) {
      const e = lb.get(a.staffId) ?? { name: a.staffName, completed: 0, revenue: 0 };
      e.completed += 1;
      e.revenue += a.price;
      lb.set(a.staffId, e);
    }
    const staffLeaderboard = [...lb.values()]
      .sort((a, b) => b.completed - a.completed || b.revenue - a.revenue)
      .slice(0, 5);

    const STATUS_ORDER = [
      'CONFIRMED',
      'PENDING',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
      'NO_SHOW',
    ];
    const sb = new Map<string, number>();
    for (const a of last14) sb.set(a.status, (sb.get(a.status) ?? 0) + 1);
    const statusBreakdown = STATUS_ORDER.filter((s) => sb.has(s)).map((status) => ({
      status,
      count: sb.get(status)!,
    }));

    const homeServiceToday = today.filter((a) => a.deliveryType === 'HOME_SERVICE').length;
    const walkins14 = last14.filter((a) => a.isWalkIn).length;
    const walkinRate14d = last14.length ? walkins14 / last14.length : 0;
    const depositsToday = today.reduce((s, a) => s + (a.depositPaid ?? 0), 0);

    const upcoming7dSeries = Array.from({ length: 7 }, (_, i) =>
      scoped.filter(
        (a) =>
          sameDay(a.startAt, NOW_MS + i * DAY) &&
          (a.status === 'CONFIRMED' || a.status === 'PENDING' || a.status === 'IN_PROGRESS'),
      ).length,
    );

    const vteHour = (aIso: string) =>
      Math.floor(((new Date(aIso).getTime() / 3_600_000 + 7) % 24 + 24) % 24);
    const hoursToday = Array.from({ length: 11 }, (_, i) => {
      const hour = 9 + i;
      return { hour, count: today.filter((a) => vteHour(a.startAt) === hour).length };
    });

    type BranchPerf = DashboardStats['branchPerformance'][number];
    const SPARK_DAYS = 7;
    const bp = new Map<string, BranchPerf & { _customers: Set<string>; _services: Map<string, number> }>();
    const branchEntry = (a: AppointmentListItem) => {
      let e = bp.get(a.branchId);
      if (!e) {
        e = {
          branchId: a.branchId,
          name: a.branchName,
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
    for (const a of last14) {
      const e = branchEntry(a);
      e.bookings += 1;
      e._customers.add(a.customerId);
      e._services.set(a.serviceName, (e._services.get(a.serviceName) ?? 0) + 1);
      if (a.isWalkIn) e.walkins += 1;
      if (a.deliveryType === 'HOME_SERVICE') e.homeService += 1;
      if (a.status === 'COMPLETED') {
        e.revenue += a.price;
        e.completed += 1;
      }
      if (a.status === 'CANCELLED' || a.status === 'NO_SHOW') e.lost += 1;
      for (let i = 0; i < SPARK_DAYS; i++) {
        if (sameDay(a.startAt, NOW_MS - (SPARK_DAYS - 1 - i) * DAY)) e.spark[i]! += 1;
      }
    }
    for (const a of prevN) {
      const e = branchEntry(a);
      e.prevBookings += 1;
      if (a.status === 'COMPLETED') e.prevRevenue += a.price;
    }
    for (const a of today) {
      const e = branchEntry(a);
      e.todayBookings += 1;
      if (a.status === 'COMPLETED') e.todayRevenue += a.price;
    }
    for (const a of next7) branchEntry(a).upcoming7d += 1;
    const branchPerformance: BranchPerf[] = [...bp.values()]
      .map(({ _customers, _services, ...e }) => ({
        ...e,
        customers: _customers.size,
        topService: [..._services.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
        staffCount: db.staff.filter((st) => st.branchId === e.branchId).length,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const confirmedToday = today.filter((a) => a.status === 'CONFIRMED').length;
    const pendingToday = today.filter((a) => a.status === 'PENDING').length;
    const walkinsToday = today.filter((a) => a.isWalkIn).length;

    const q = db.queueTickets.filter((t) => branchId === 'all' || t.branchId === branchId);
    const queueInService = q.filter((t) => t.status === 'IN_SERVICE').length;
    const queueCalled = q.filter((t) => t.status === 'CALLED').length;
    const waitingTickets = q
      .filter((t) => t.status === 'WAITING')
      .sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime());
    const queueLongestWaitMin = waitingTickets.length
      ? Math.max(
          0,
          Math.round((NOW_MS - new Date(waitingTickets[0]!.issuedAt).getTime()) / 60_000),
        )
      : 0;
    const queueNextNumber = waitingTickets[0]?.number ?? null;

    const stats: DashboardStats = {
      branchId: branchId as DashboardStats['branchId'],
      range: {
        from: revenueSeries[0]!.date,
        to: revenueSeries[revenueSeries.length - 1]!.date,
      },
      bookingsToday: today.length,
      bookingsTodayDelta: ratio(today.length, yesterday.length),
      revenueToday,
      revenueTodayDelta: ratio(revenueToday, revenueYesterday),
      queueWaiting: db.queueTickets.filter(
        (q) => (branchId === 'all' || q.branchId === branchId) && q.status === 'WAITING',
      ).length,
      completedToday: completedToday.length,
      revenueSeries,
      serviceMix,
      upcoming,
      cancelledToday,
      noShowToday,
      avgTicket14d,
      vipCustomers,
      totalCustomers: db.customers.length,
      pendingApprovals,
      upcoming7d: next7.length,
      pendingConfirmation,
      staffLeaderboard,
      statusBreakdown,
      homeServiceToday,
      walkinRate14d,
      depositsToday,
      timeOffTotal: db.timeOff.length,
      upcoming7dSeries,
      hoursToday,
      branchPerformance,
      confirmedToday,
      pendingToday,
      walkinsToday,
      queueInService,
      queueCalled,
      queueLongestWaitMin,
      queueNextNumber,
      periodDays: days,
      prevSeries,
      period: {
        revenue: sumPrice(last14Completed),
        bookings: last14.length,
        completed: last14Completed.length,
        cancelled: last14.filter((a) => a.status === 'CANCELLED').length,
        noShow: last14.filter((a) => a.status === 'NO_SHOW').length,
        avgTicket: avgPrice(last14Completed),
        expenses: 0,
        prevRevenue: sumPrice(prevNCompleted),
        prevBookings: prevN.length,
        prevCompleted: prevNCompleted.length,
        prevAvgTicket: avgPrice(prevNCompleted),
        newCustomers: customerCreated(NOW_MS - days * DAY, NOW_MS),
        prevNewCustomers: customerCreated(NOW_MS - 2 * days * DAY, NOW_MS - days * DAY - 1),
        activeCustomers: activeIds.size,
        returningCustomers,
      },
      todayAgenda: [...today].sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(0, 60),
      collectedToday: completedToday.reduce((s, a) => s + a.price, 0),
      // Inventory / receivables / reviews have no MSW fixtures — neutral values.
      attention: {
        lowStock: 0,
        openPurchaseOrders: 0,
        transfersInTransit: 0,
        unpaidBills: 0,
        outstandingBalance: 0,
        waitlist: 0,
        homeServiceActive: 0,
        lowRatings: 0,
      },
      lowStockItems: [],
      rating: { avg: 0, count: 0, distribution: [0, 0, 0, 0, 0] },
      recentReviews: [],
    };

    return ok(stats);
  }),
];
