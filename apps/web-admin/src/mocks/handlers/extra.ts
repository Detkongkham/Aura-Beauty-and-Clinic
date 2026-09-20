import { http } from 'msw';

import { NOW_MS } from '../fixtures/dataset';
import { db, newId } from '../fixtures/store';
import { MOCK_USERS } from '../fixtures/users';
import { api, delay, fail, ok } from '../helpers';

const DAY = 86_400_000;
const sameDay = (aIso: string, ms: number) =>
  new Date(aIso).toDateString() === new Date(ms).toDateString();

// --- Branch closures / holidays ---
interface Closure {
  id: string;
  branchId: string | 'all';
  date: string; // YYYY-MM-DD
  reason: string;
}
const closures: Closure[] = [
  { id: 'cls-1', branchId: 'all', date: new Date(NOW_MS + 20 * DAY).toISOString().slice(0, 10), reason: 'ປີໃໝ່ລາວ' },
  {
    id: 'cls-2',
    branchId: db.branches[0]!.id,
    date: new Date(NOW_MS + 5 * DAY).toISOString().slice(0, 10),
    reason: 'ອົບຮົມພະນັກງານ',
  },
];

// --- Notification templates ---
interface NotifTemplate {
  key: string;
  channel: 'sms' | 'push';
  enabled: boolean;
  body: string;
}
const templates: NotifTemplate[] = [
  { key: 'reminder_24h', channel: 'sms', enabled: true, body: 'ສະບາຍດີ {{name}} ເດີ, ມື້ອື່ນທ່ານມີນັດ {{service}} ເວລາ {{time}} ຢ່າລືມມາເດີ!' },
  { key: 'reminder_1h', channel: 'push', enabled: true, body: 'ອີກ 1 ຊົ່ວໂມງ ນັດ {{service}} ຂອງທ່ານຈະເລີ່ມ.' },
  { key: 'booking_confirmed', channel: 'sms', enabled: true, body: 'ຢືນຢັນການຈອງ {{code}} ວັນທີ {{date}}.' },
  { key: 'waitlist_open', channel: 'push', enabled: false, body: 'ມີຄິວວ່າງສຳລັບ {{service}} — ຈອງດ່ວນ!' },
];

// --- Audit log ---
type AuditCategory =
  | 'appointment'
  | 'service'
  | 'staff'
  | 'timeoff'
  | 'walkin'
  | 'customer'
  | 'settings'
  | 'users'
  | 'branch'
  | 'auth';
type AuditSeverity = 'info' | 'warning' | 'critical';

interface AuditChange {
  field: string;
  before: string;
  after: string;
}

interface AuditLog {
  id: string;
  action: string;
  category: AuditCategory;
  severity: AuditSeverity;
  actorId: string;
  actor: string;
  actorRole: string;
  branchId: string;
  branchName: string;
  targetType: string;
  target: string;
  ip: string;
  device: string;
  at: string;
  changes: AuditChange[] | null;
}

/** Tiny deterministic PRNG so the fixture is stable across reloads. */
function auditRng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const auditRand = auditRng(20260902);
const auditPick = <T>(arr: readonly T[]): T => arr[Math.floor(auditRand() * arr.length)]!;

const AUDIT_ACTIONS: Array<{
  action: string;
  category: AuditCategory;
  severity: AuditSeverity;
  targetType: string;
}> = [
  { action: 'appointment.status_changed', category: 'appointment', severity: 'info', targetType: 'appointment' },
  { action: 'appointment.cancelled', category: 'appointment', severity: 'warning', targetType: 'appointment' },
  { action: 'appointment.rescheduled', category: 'appointment', severity: 'info', targetType: 'appointment' },
  { action: 'service.updated', category: 'service', severity: 'info', targetType: 'service' },
  { action: 'service.created', category: 'service', severity: 'info', targetType: 'service' },
  { action: 'service.archived', category: 'service', severity: 'warning', targetType: 'service' },
  { action: 'staff.hours_updated', category: 'staff', severity: 'info', targetType: 'staff' },
  { action: 'staff.created', category: 'staff', severity: 'info', targetType: 'staff' },
  { action: 'staff.deactivated', category: 'staff', severity: 'warning', targetType: 'staff' },
  { action: 'timeoff.approved', category: 'timeoff', severity: 'info', targetType: 'staff' },
  { action: 'timeoff.rejected', category: 'timeoff', severity: 'warning', targetType: 'staff' },
  { action: 'walkin.created', category: 'walkin', severity: 'info', targetType: 'customer' },
  { action: 'customer.note_updated', category: 'customer', severity: 'info', targetType: 'customer' },
  { action: 'customer.merged', category: 'customer', severity: 'warning', targetType: 'customer' },
  { action: 'settings.updated', category: 'settings', severity: 'info', targetType: 'setting' },
  { action: 'users.role_changed', category: 'users', severity: 'critical', targetType: 'user' },
  { action: 'users.invited', category: 'users', severity: 'info', targetType: 'user' },
  { action: 'branch.closure_added', category: 'branch', severity: 'warning', targetType: 'branch' },
  { action: 'auth.login_failed', category: 'auth', severity: 'critical', targetType: 'user' },
  { action: 'auth.password_reset', category: 'auth', severity: 'info', targetType: 'user' },
];

const AUDIT_ACTORS = [
  { id: MOCK_USERS[0]!.id, name: MOCK_USERS[0]!.name, role: 'SUPER_ADMIN' },
  { id: MOCK_USERS[1]!.id, name: MOCK_USERS[1]!.name, role: 'BRANCH_ADMIN' },
  ...db.staff.slice(0, 4).map((s) => ({ id: s.id, name: s.name, role: 'MANAGER' })),
];

const SETTING_FIELDS = [
  { key: 'ເວລາເປີດ-ປິດ', before: '09:00–20:00', after: '08:00–21:00' },
  { key: 'ນະໂຍບາຍຍົກເລີກ', before: '2 ຊົ່ວໂມງ', after: '4 ຊົ່ວໂມງ' },
  { key: 'ອັດຕາຄ່ານາຍໜ້າ', before: '10%', after: '12%' },
  { key: 'ພາສາເລີ່ມຕົ້ນ', before: 'ລາວ', after: 'English' },
];
const IPS = ['203.144.12.4', '203.144.12.87', '182.53.1.20', '113.190.4.201', '27.109.14.66'];
const DEVICES = [
  'Chrome · Windows',
  'Chrome · Android',
  'Safari · iPhone',
  'Edge · Windows',
  'Firefox · macOS',
];

function auditSummaryChanges(a: (typeof AUDIT_ACTIONS)[number]): AuditChange[] | null {
  switch (a.action) {
    case 'appointment.status_changed':
      return [{ field: 'ສະຖານະ', before: 'ຢືນຢັນແລ້ວ', after: auditPick(['ສຳເລັດ', 'ບໍ່ມາ', 'ກຳລັງບໍລິການ']) }];
    case 'service.updated': {
      const svc = auditPick(db.services);
      return [
        { field: 'ລາຄາ', before: `${svc.price.toLocaleString()} ກີບ`, after: `${(svc.price + 10000).toLocaleString()} ກີບ` },
        { field: 'ໄລຍະເວລາ', before: `${svc.durationMinutes} ນາທີ`, after: `${svc.durationMinutes + 15} ນາທີ` },
      ];
    }
    case 'staff.hours_updated':
      return [
        { field: 'ເວລາເລີ່ມ', before: '09:00', after: '10:00' },
        { field: 'ເວລາເລີກ', before: '18:00', after: '19:00' },
      ];
    case 'customer.note_updated':
      return [{ field: 'ໝາຍເຫດ', before: '—', after: 'ມັກນັດຕອນບ່າຍ. ຜິວແພ້ງ່າຍ.' }];
    case 'settings.updated': {
      const f = auditPick(SETTING_FIELDS);
      return [{ field: f.key, before: f.before, after: f.after }];
    }
    case 'users.role_changed':
      return [{ field: 'ບົດບາດ', before: 'STAFF', after: auditPick(['MANAGER', 'BRANCH_ADMIN']) }];
    default:
      return null;
  }
}

const AUDIT_TOTAL = 150;
const auditLogs: AuditLog[] = Array.from({ length: AUDIT_TOTAL }, (_, i) => {
  const meta = AUDIT_ACTIONS[i % AUDIT_ACTIONS.length]!;
  const actor = auditPick(AUDIT_ACTORS);
  const branch = auditPick(db.branches);
  // Skew recent: most entries land in the last 7 days, a tail stretches to 30.
  const dayOffset = i < 90 ? auditRand() * 7 : 7 + auditRand() * 23;
  const at = new Date(NOW_MS - dayOffset * DAY - Math.floor(auditRand() * DAY)).toISOString();

  let target = `#${1000 + i}`;
  if (meta.targetType === 'appointment' && db.appointments.length) {
    const appt = auditPick(db.appointments);
    target = `${appt.customerName} · ${appt.serviceName}`;
  } else if (meta.targetType === 'service' && db.services.length) {
    target = auditPick(db.services).name;
  } else if (meta.targetType === 'staff' && db.staff.length) {
    target = auditPick(db.staff).name;
  } else if (meta.targetType === 'customer' && db.customers.length) {
    target = auditPick(db.customers).name;
  } else if (meta.targetType === 'user') {
    target = auditPick(MOCK_USERS).name;
  } else if (meta.targetType === 'branch') {
    target = branch.name;
  } else if (meta.targetType === 'setting') {
    target = auditPick(SETTING_FIELDS).key;
  }

  return {
    id: `aud-${i}`,
    action: meta.action,
    category: meta.category,
    severity: meta.severity,
    actorId: actor.id,
    actor: actor.name,
    actorRole: actor.role,
    branchId: branch.id,
    branchName: branch.name,
    targetType: meta.targetType,
    target,
    ip: auditPick(IPS),
    device: auditPick(DEVICES),
    at,
    changes: auditSummaryChanges(meta),
  };
}).sort((a, b) => (a.at < b.at ? 1 : -1));

export const extraHandlers = [
  http.get(api('/branch-closures'), async () => {
    await delay(120);
    return ok({ items: closures });
  }),
  http.post(api('/branch-closures'), async ({ request }) => {
    await delay();
    const body = (await request.json().catch(() => ({}))) as Partial<Closure>;
    if (!body.date) return fail(400, 'VALIDATION_ERROR', 'ຕ້ອງໃສ່ວັນທີ');
    const c: Closure = {
      id: newId('cls'),
      branchId: body.branchId ?? 'all',
      date: body.date,
      reason: body.reason ?? '',
    };
    closures.push(c);
    return ok(c, { status: 201 });
  }),
  http.delete(api('/branch-closures/:id'), async ({ params }) => {
    await delay(100);
    const idx = closures.findIndex((c) => c.id === params.id);
    if (idx < 0) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບ');
    closures.splice(idx, 1);
    return ok({ id: params.id });
  }),

  http.get(api('/notification-templates'), async () => {
    await delay(120);
    return ok({ items: templates });
  }),
  http.put(api('/notification-templates/:key'), async ({ params, request }) => {
    await delay();
    const tpl = templates.find((x) => x.key === params.key);
    if (!tpl) return fail(404, 'NOT_FOUND', 'ບໍ່ພົບ');
    const body = (await request.json().catch(() => ({}))) as Partial<NotifTemplate>;
    Object.assign(tpl, body);
    return ok(tpl);
  }),

  http.get(api('/reports/end-of-day'), async ({ request }) => {
    await delay(250);
    const url = new URL(request.url);
    const date = url.searchParams.get('date') ?? new Date(NOW_MS).toISOString().slice(0, 10);
    const branchId = url.searchParams.get('branchId') ?? 'all';
    const target = new Date(`${date}T12:00:00+07:00`).getTime();

    const rows = db.appointments.filter(
      (a) => (branchId === 'all' || a.branchId === branchId) && sameDay(a.startAt, target),
    );
    const completed = rows.filter((a) => a.status === 'COMPLETED');
    const revenue = completed.reduce((s, a) => s + a.price, 0);
    const deposits = rows.reduce((s, a) => s + a.depositPaid, 0);

    const svcMap = new Map<string, { count: number; revenue: number }>();
    for (const a of completed) {
      const cur = svcMap.get(a.serviceName) ?? { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += a.price;
      svcMap.set(a.serviceName, cur);
    }

    return ok({
      date,
      branchId,
      totals: {
        bookings: rows.length,
        completed: completed.length,
        cancelled: rows.filter((a) => a.status === 'CANCELLED' || a.status === 'NO_SHOW').length,
        walkIns: rows.filter((a) => a.isWalkIn).length,
        revenue,
        deposits,
      },
      topServices: [...svcMap.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5),
    });
  }),

  http.get(api('/audit-logs'), async ({ request }) => {
    await delay(150);
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = Math.max(1, Number(url.searchParams.get('pageSize')) || 25);
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const category = url.searchParams.get('category');
    const actorId = url.searchParams.get('actorId');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    const filtered = auditLogs.filter((l) => {
      if (category && category !== 'ALL' && l.category !== category) return false;
      if (actorId && l.actorId !== actorId) return false;
      if (from && l.at < from) return false;
      if (to && l.at > to) return false;
      if (q) {
        const hay = `${l.actor} ${l.target} ${l.action} ${l.branchName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const categoryCounts = new Map<string, number>();
    for (const l of auditLogs) categoryCounts.set(l.category, (categoryCounts.get(l.category) ?? 0) + 1);

    const actorCounts = new Map<string, { id: string; name: string; count: number }>();
    for (const l of auditLogs) {
      const cur = actorCounts.get(l.actorId);
      if (cur) cur.count += 1;
      else actorCounts.set(l.actorId, { id: l.actorId, name: l.actor, count: 1 });
    }

    const todayCutoff = new Date(NOW_MS - DAY).toISOString();
    const start = (page - 1) * pageSize;

    return ok({
      items: filtered.slice(start, start + pageSize),
      page,
      pageSize,
      total: filtered.length,
      facets: {
        categories: [...categoryCounts.entries()]
          .map(([key, count]) => ({ key, count }))
          .sort((a, b) => b.count - a.count),
        actors: [...actorCounts.values()].sort((a, b) => b.count - a.count),
        totalAll: auditLogs.length,
        totalToday: auditLogs.filter((l) => l.at >= todayCutoff).length,
        totalCritical: auditLogs.filter((l) => l.severity === 'critical').length,
      },
    });
  }),
];
