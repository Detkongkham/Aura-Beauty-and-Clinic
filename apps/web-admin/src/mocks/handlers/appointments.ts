import { http } from 'msw';

import type { AppointmentStatus } from '@abcp/shared-types';

import type { AppointmentDetail, AppointmentListItem } from '@/types/models';

import { NOW_MS } from '../fixtures/dataset';
import { db, newId } from '../fixtures/store';
import { api, delay, fail, ok, paginated } from '../helpers';

function num(v: string | null, dflt: number) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : dflt;
}

const DEAD: AppointmentStatus[] = ['CANCELLED', 'NO_SHOW'];
const OPEN: AppointmentStatus[] = ['PENDING', 'CONFIRMED'];

/** Appointments that overlap another booking of the same staff member. */
function conflictIds(): Set<string> {
  const live = db.appointments.filter((a) => OPEN.includes(a.status) || a.status === 'IN_PROGRESS');
  const out = new Set<string>();
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      if (a.staffId !== b.staffId) continue;
      if (a.startAt < b.endAt && a.endAt > b.startAt) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  }
  return out;
}

/** Mirrors `buildAppointmentWhere` on the backend, in-memory. */
function filterAppointments(url: URL): AppointmentListItem[] {
  const q = url.searchParams.get('q')?.toLowerCase() ?? '';
  const get = (k: string) => url.searchParams.get(k) ?? '';
  const from = get('from');
  const to = get('to');
  const now = Date.now();

  let rows = [...db.appointments];
  if (q) {
    rows = rows.filter(
      (a) =>
        a.customerName.toLowerCase().includes(q) ||
        a.code.toLowerCase().includes(q) ||
        a.serviceName.toLowerCase().includes(q) ||
        a.staffName.toLowerCase().includes(q) ||
        a.customerPhone.includes(q),
    );
  }
  const branchId = get('branchId');
  if (branchId && branchId !== 'all') rows = rows.filter((a) => a.branchId === branchId);
  if (get('staffId')) rows = rows.filter((a) => a.staffId === get('staffId'));
  if (get('serviceId')) rows = rows.filter((a) => a.serviceId === get('serviceId'));
  if (get('customerId')) rows = rows.filter((a) => a.customerId === get('customerId'));
  if (get('deliveryType')) rows = rows.filter((a) => a.deliveryType === get('deliveryType'));
  if (get('source')) rows = rows.filter((a) => a.source === get('source'));
  if (from) rows = rows.filter((a) => a.startAt >= from);
  if (to) rows = rows.filter((a) => a.startAt <= to);

  const payment = get('payment');
  if (payment) {
    rows = rows.filter((a) => {
      const state = a.depositPaid <= 0 ? 'unpaid' : a.depositPaid >= a.price ? 'paid' : 'partial';
      return state === payment;
    });
  }

  const flag = get('flag');
  if (flag === 'overdue') {
    rows = rows.filter((a) => OPEN.includes(a.status) && new Date(a.startAt).getTime() < now);
  } else if (flag === 'unconfirmed') {
    rows = rows.filter((a) => {
      const start = new Date(a.startAt).getTime();
      return a.status === 'PENDING' && start >= now && start - now <= 24 * 3_600_000;
    });
  } else if (flag === 'needsDeposit') {
    rows = rows.filter(
      (a) => OPEN.includes(a.status) && a.depositRequired > 0 && a.depositPaid < a.depositRequired,
    );
  } else if (flag === 'unrated') {
    rows = rows.filter((a) => a.status === 'COMPLETED' && a.rating == null);
  } else if (flag === 'conflict') {
    const clashing = conflictIds();
    rows = rows.filter((a) => clashing.has(a.id));
  }

  return rows;
}

export const appointmentHandlers = [
  http.get(api('/appointments'), async ({ request }) => {
    await delay();
    const url = new URL(request.url);
    const page = num(url.searchParams.get('page'), 1);
    const pageSize = num(url.searchParams.get('pageSize'), 25);
    const status = url.searchParams.get('status');
    const sort = url.searchParams.get('sort') ?? 'startAt';
    const dir = url.searchParams.get('order') === 'asc' ? 1 : -1;

    let rows = filterAppointments(url);
    if (status) rows = rows.filter((a) => a.status === status);

    const key = (a: AppointmentListItem) =>
      sort === 'price'
        ? a.price
        : sort === 'customer'
          ? a.customerName
          : sort === 'status'
            ? a.status
            : sort === 'createdAt'
              ? a.createdAt
              : a.startAt;
    rows.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      return (typeof x === 'number' ? x - (y as number) : String(x).localeCompare(String(y))) * dir;
    });
    const clashing = conflictIds();
    return paginated(
      rows.map((a) => ({ ...a, hasConflict: clashing.has(a.id) })),
      page,
      pageSize,
    );
  }),

  http.get(api('/appointments/summary'), async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const rows = filterAppointments(url);
    const now = Date.now();

    const byStatus = {
      PENDING: 0,
      CONFIRMED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      NO_SHOW: 0,
    } as Record<AppointmentStatus, number>;
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

    const dayKey = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
    const todayKey = dayKey(new Date(now).toISOString());
    const agg = (m: Map<string, { id: string; name: string; count: number; revenue: number }>, id: string, name: string, rev: number) => {
      const cur = m.get(id) ?? { id, name, count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += rev;
      m.set(id, cur);
    };
    const staff = new Map<string, { id: string; name: string; count: number; revenue: number }>();
    const services = new Map<string, { id: string; name: string; count: number; revenue: number }>();
    const branchMap = new Map<string, { id: string; name: string; count: number; revenue: number }>();
    const days = new Map<string, { count: number; revenue: number }>();
    const hours = new Array<number>(24).fill(0);
    const clashing = conflictIds();
    const customers = new Set<string>();
    let active = 0;
    let ratingSum = 0;
    let durationSum = 0;

    for (const a of rows) {
      const dead = DEAD.includes(a.status);
      const start = new Date(a.startAt).getTime();
      byStatus[a.status] += 1;
      if (clashing.has(a.id)) ops.conflicts += 1;
      customers.add(a.customerId);
      durationSum += a.durationMin;
      const h = new Date(start + 7 * 3_600_000).getUTCHours();
      hours[h] = (hours[h] ?? 0) + 1;
      const dk = dayKey(a.startAt);
      const d = days.get(dk) ?? { count: 0, revenue: 0 };
      d.count += 1;
      if (!dead) d.revenue += a.price;
      days.set(dk, d);
      if (a.source === 'WALK_IN') ops.walkIns += 1;
      if (a.source === 'ONLINE') ops.online += 1;
      if (a.deliveryType === 'HOME_SERVICE') ops.homeService += 1;
      if (a.rating != null) {
        ops.ratedCount += 1;
        ratingSum += a.rating;
      } else if (a.status === 'COMPLETED') ops.unrated += 1;

      if (dead) {
        money.lost += a.price;
        money.lostCount += 1;
        continue;
      }
      money.expected += a.price;
      money.deposits += a.depositPaid;
      money.travelFees += a.travelFee;
      active += 1;
      if (a.status === 'COMPLETED') money.realized += a.price;
      else money.outstanding += Math.max(0, a.price - a.depositPaid);
      if (a.status === 'COMPLETED' || a.status === 'IN_PROGRESS') ops.bookedMinutes += a.durationMin;

      agg(staff, a.staffId, a.staffName, a.price);
      agg(services, a.serviceId, a.serviceName, a.price);
      agg(branchMap, a.branchId, a.branchName, a.price);

      const open = OPEN.includes(a.status);
      if (dk === todayKey) {
        ops.today += 1;
        ops.todayValue += a.price;
        if (a.status !== 'COMPLETED') ops.todayOpen += 1;
      }
      if (dk === dayKey(new Date(now + 86_400_000).toISOString())) ops.tomorrow += 1;
      if (start > now && start <= now + 7 * 86_400_000) {
        ops.next7 += 1;
        ops.next7Value += a.price;
      }
      if (open && start < now) ops.overdue += 1;
      if (a.status === 'PENDING' && start >= now && start - now <= 24 * 3_600_000) ops.unconfirmed += 1;
      if (open && a.depositRequired > a.depositPaid) {
        ops.needsDeposit += 1;
        ops.needsDepositValue += a.depositRequired - a.depositPaid;
      }
    }

    const terminal = byStatus.COMPLETED + byStatus.CANCELLED + byStatus.NO_SHOW;
    money.avgTicket = active ? Math.round(money.expected / active) : 0;
    ops.completionRate = terminal ? byStatus.COMPLETED / terminal : 0;
    ops.noShowRate = terminal ? byStatus.NO_SHOW / terminal : 0;
    ops.cancelRate = terminal ? byStatus.CANCELLED / terminal : 0;
    ops.avgRating = ops.ratedCount ? Math.round((ratingSum / ops.ratedCount) * 10) / 10 : 0;
    ops.distinctCustomers = customers.size;
    ops.avgDurationMin = rows.length ? Math.round(durationSum / rows.length) : 0;

    const top = (m: Map<string, { id: string; name: string; count: number; revenue: number }>) =>
      [...m.values()].sort((a, b) => b.count - a.count).slice(0, 12);

    return ok({
      total: rows.length,
      sampled: rows.length,
      truncated: false,
      byStatus,
      money,
      ops,
      byStaff: top(staff),
      byService: top(services),
      byBranch: top(branchMap),
      byDay: [...days.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v })),
      byHour: hours.map((count, hour) => ({ hour, count })),
    });
  }),

  http.post(api('/appointments/bulk-status'), async ({ request }) => {
    await delay();
    const body = (await request.json().catch(() => ({}))) as { ids?: string[]; status?: AppointmentStatus };
    const updated: string[] = [];
    for (const id of body.ids ?? []) {
      const appt = db.appointments.find((a) => a.id === id);
      if (appt && body.status) {
        appt.status = body.status;
        updated.push(id);
      }
    }
    return ok({ updated, failed: [] });
  }),

  http.get(api('/appointments/calendar'), async ({ request }) => {
    await delay(150);
    const url = new URL(request.url);
    const from = url.searchParams.get('from') ?? '';
    const to = url.searchParams.get('to') ?? '';
    const branchId = url.searchParams.get('branchId');
    let rows = db.appointments.filter(
      (a) => (!from || a.startAt >= from) && (!to || a.startAt <= to),
    );
    if (branchId && branchId !== 'all') rows = rows.filter((a) => a.branchId === branchId);
    return ok({ items: rows });
  }),

  http.get(api('/appointments/:id'), async ({ params }) => {
    await delay(120);
    const a = db.appointments.find((x) => x.id === params.id);
    if (!a) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບການນັດໝາຍ');
    const detail: AppointmentDetail = {
      ...a,
      customerNotes: null,
      staffNotes: null,
      homeAddress: null,
      review: a.rating != null ? { rating: a.rating, comment: null } : null,
      conflicts: db.appointments
        .filter(
          (x) =>
            x.id !== a.id &&
            x.staffId === a.staffId &&
            (OPEN.includes(x.status) || x.status === 'IN_PROGRESS') &&
            x.startAt < a.endAt &&
            x.endAt > a.startAt,
        )
        .map((x) => ({
          id: x.id,
          code: x.code,
          customerName: x.customerName,
          serviceName: x.serviceName,
          staffName: x.staffName,
          startAt: x.startAt,
          endAt: x.endAt,
          status: x.status,
          reason: 'staff' as const,
        })),
      timeline: [
        { at: a.createdAt, label: 'ສ້າງລາຍການ', by: a.isWalkIn ? 'ພະນັກງານຕ້ອນຮັບ' : 'ລູກຄ້າ' },
        ...(a.status !== 'PENDING'
          ? [{ at: a.createdAt, label: 'ຢືນຢັນແລ້ວ', by: 'ພະນັກງານຕ້ອນຮັບ' }]
          : []),
      ],
    };
    return ok(detail);
  }),

  http.patch(api('/appointments/:id/status'), async ({ params, request }) => {
    await delay();
    const appt = db.appointments.find((a) => a.id === params.id);
    if (!appt) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບການນັດໝາຍ');
    const body = (await request.json().catch(() => ({}))) as { status?: AppointmentStatus };
    if (body.status) appt.status = body.status;
    return ok(appt);
  }),

  http.post(api('/appointments/walk-in'), async ({ request }) => {
    await delay();
    const body = (await request.json().catch(() => ({}))) as {
      branchId?: string;
      customerName?: string;
      customerPhone?: string;
      serviceId?: string;
      staffId?: string;
    };
    const branch = db.branches.find((b) => b.id === body.branchId) ?? db.branches[0]!;
    const svc = db.services.find((s) => s.id === body.serviceId);
    const stf = db.staff.find((s) => s.id === body.staffId);
    if (!svc || !body.customerName?.trim()) {
      return fail(400, 'VALIDATION_ERROR', 'ຕ້ອງເລືອກບໍລິການ ແລະ ໃສ່ຊື່ລູກຄ້າ');
    }
    const start = NOW_MS + 10 * 60_000;
    const appt: AppointmentListItem = {
      id: newId('apt'),
      code: `APT-W${String(Math.floor(Math.random() * 9000) + 1000)}`,
      branchId: branch.id,
      branchName: branch.name,
      customerId: newId('cus'),
      customerName: body.customerName.trim(),
      customerPhone: body.customerPhone ?? '',
      staffId: stf?.id ?? db.staff[0]!.id,
      staffName: stf?.name ?? db.staff[0]!.name,
      serviceId: svc.id,
      serviceName: svc.name,
      status: 'CONFIRMED',
      deliveryType: 'IN_STORE',
      startAt: new Date(start).toISOString(),
      endAt: new Date(start + svc.durationMinutes * 60_000).toISOString(),
      price: svc.price,
      depositPaid: 0,
      isWalkIn: true,
      createdAt: new Date().toISOString(),
      source: 'WALK_IN',
      durationMin: svc.durationMinutes,
      updatedAt: new Date().toISOString(),
      paymentStatus: 'PENDING',
      paidAt: null,
      paymentMethods: [],
      depositRequired: svc.requireDeposit ? (svc.depositAmount ?? 0) : 0,
      rating: null,
      hasCustomerNotes: false,
      hasStaffNotes: false,
      roomName: null,
      travelFee: 0,
    };
    db.appointments.push(appt);

    const ticket = {
      id: newId('qt'),
      number: `A${String(db.queueTickets.length + 1).padStart(3, '0')}`,
      branchId: branch.id,
      branchName: branch.name,
      customerName: appt.customerName,
      customerPhone: body.customerPhone || null,
      serviceName: svc.name,
      serviceDurationMin: svc.durationMinutes,
      staffName: appt.staffName,
      priority: 'NORMAL' as const,
      status: 'WAITING' as const,
      issuedAt: new Date().toISOString(),
      calledAt: null,
      startedAt: null,
      completedAt: null,
    };
    db.queueTickets.push(ticket);

    return ok({ appointment: appt, ticket }, { status: 201 });
  }),

  http.get(api('/queue'), async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const branchId = url.searchParams.get('branchId');
    const rows = db.queueTickets.filter(
      (q) => !branchId || branchId === 'all' || q.branchId === branchId,
    );
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, arrivals: 0, completions: 0 }));
    for (const q of rows) {
      hourly[new Date(q.issuedAt).getHours()]!.arrivals += 1;
      if (q.completedAt) hourly[new Date(q.completedAt).getHours()]!.completions += 1;
    }
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const summary = {
      dayStart: dayStart.toISOString(),
      issuedToday: rows.length,
      completedToday: rows.filter((q) => q.status === 'COMPLETED').length,
      cancelledToday: rows.filter((q) => q.status === 'CANCELLED').length,
      noShowToday: rows.filter((q) => q.cancelReason === 'NO_SHOW').length,
      carriedOver: 0,
      avgWaitMin: 12,
      p90WaitMin: 24,
      avgServiceMin: 38,
      yesterday: { issued: rows.length, completed: 3, avgWaitMin: 15 },
      hourly,
    };
    return ok({ items: rows, summary });
  }),

  http.patch(api('/queue/:id/details'), async ({ params, request }) => {
    await delay();
    const ticket = db.queueTickets.find((q) => q.id === params.id);
    if (!ticket) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບບັດຄິວ');
    const body = (await request.json().catch(() => ({}))) as {
      priority?: 'NORMAL' | 'VIP';
      note?: string | null;
    };
    if (body.priority) ticket.priority = body.priority;
    if (body.note !== undefined) ticket.note = body.note;
    return ok(ticket);
  }),

  http.post(api('/queue/:id/recall'), async ({ params }) => {
    await delay();
    const ticket = db.queueTickets.find((q) => q.id === params.id);
    if (!ticket) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບບັດຄິວ');
    ticket.lastCalledAt = new Date().toISOString();
    ticket.callCount = (ticket.callCount ?? 1) + 1;
    return ok(ticket);
  }),

  http.post(api('/queue/clear-stale'), async () => {
    await delay();
    return ok({ cleared: 0 });
  }),

  http.patch(api('/queue/:id'), async ({ params, request }) => {
    await delay();
    const ticket = db.queueTickets.find((q) => q.id === params.id);
    if (!ticket) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບບັດຄິວ');
    const body = (await request.json().catch(() => ({}))) as {
      status?: 'WAITING' | 'CALLED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED';
      reason?: 'NO_SHOW' | 'CUSTOMER_LEFT' | 'DUPLICATE' | 'EXPIRED' | 'OTHER';
    };
    if (body.status) {
      const nowIso = new Date().toISOString();
      ticket.status = body.status;
      if (body.status === 'CALLED') {
        ticket.calledAt ??= nowIso;
        ticket.lastCalledAt = nowIso;
        ticket.callCount = (ticket.callCount ?? 0) + 1;
      }
      if (body.status === 'IN_SERVICE' && !ticket.startedAt) ticket.startedAt = nowIso;
      if (body.status === 'COMPLETED' && !ticket.completedAt) ticket.completedAt = nowIso;
      if (body.status === 'CANCELLED') {
        ticket.cancelledAt = nowIso;
        ticket.cancelReason = body.reason ?? 'OTHER';
      }
      if (body.status === 'WAITING') {
        ticket.cancelledAt = null;
        ticket.cancelReason = null;
      }
    }
    return ok(ticket);
  }),
];
