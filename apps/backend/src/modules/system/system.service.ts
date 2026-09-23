import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

// ---- in-app notifications (per user) -------------------------------

export type NotificationSeverity = 'info' | 'warning' | 'critical';
export type NotificationCategory = 'booking' | 'staff' | 'inventory' | 'payment' | 'marketing' | 'system';
/** ໂມດູນຕົ້ນທາງ — web-admin ແປເປັນຊື່ ແລະ ໃຊ້ຮ່ວມກັບ `data` ສ້າງ deep link. */
export type NotificationModule =
  | 'appointments'
  | 'waitlist'
  | 'homeService'
  | 'staff'
  | 'inventory'
  | 'payments'
  | 'giftCards'
  | 'loyalty'
  | 'marketing'
  | 'system';

export type AppNotificationView = {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: NotificationSeverity;
  category: NotificationCategory;
  module: NotificationModule;
  /** Kept for older clients — same as `module`. */
  source: string;
  data: Record<string, unknown> | null;
  createdAt: string;
  read: boolean;
  readAt: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: { id: string; name: string } | null;
};

export type NotificationSummary = {
  total: number;
  unread: number;
  /** ຍັງບໍ່ໄດ້ຈັດການ ແລະ ເປັນ warning/critical. */
  needsAction: number;
  critical: number;
  today: number;
  resolved7d: number;
  /** Median minutes from sentAt → resolvedAt over the last 30 days (null = no data). */
  medianResolveMinutes: number | null;
};

export type NotificationListResult = {
  items: AppNotificationView[];
  summary: NotificationSummary;
  /** 14 local-day buckets (Asia/Vientiane), oldest first. */
  daily: { date: string; total: number; critical: number; warning: number }[];
  limit: number;
};

const SEVERITIES: readonly NotificationSeverity[] = ['info', 'warning', 'critical'];

/** Severity ເມື່ອ caller ບໍ່ໄດ້ລະບຸ — ຕ້ອງກົງກັບ backfill ໃນ migration 20260917042855. */
export function inferNotificationSeverity(type: string): NotificationSeverity {
  const t = type.toUpperCase();
  if (t.includes('RECONCILIATION') || t.includes('NO_MATCH') || t.includes('FAILED')) return 'critical';
  if (
    t.includes('SLA_LATE') ||
    t.includes('LOW_STOCK') ||
    t.includes('STAFF_LATE') ||
    t.includes('TIMEOFF') ||
    t.includes('SLIP_REJECTED') ||
    t.includes('EXPENSE_REJECTED') ||
    t.includes('EXPENSE_VOIDED') ||
    t.includes('CANCEL')
  ) {
    return 'warning';
  }
  return 'info';
}

function mapModule(type: string): NotificationModule {
  const t = type.toUpperCase();
  if (t.includes('HOME_SERVICE')) return 'homeService';
  if (t.includes('WAITLIST')) return 'waitlist';
  if (t.includes('APPOINTMENT') || t.includes('BOOKING')) return 'appointments';
  if (t.includes('STAFF') || t.includes('PAYROLL')) return 'staff';
  if (t.includes('INVENTORY') || t.includes('STOCK') || t.includes('PURCHASE_ORDER')) return 'inventory';
  if (t.includes('GIFT_CARD')) return 'giftCards';
  if (t.includes('LOYALTY')) return 'loyalty';
  if (t.includes('PAYMENT') || t.includes('SLIP') || t.includes('EXPENSE')) return 'payments';
  if (t.includes('CAMPAIGN')) return 'marketing';
  return 'system';
}

/** ຈັດກຸ່ມ `NotificationLog.type` (ຄ່າອິດສະຫຼະ ເຊັ່ນ 'PAYMENT_RECEIPT') ໃຫ້ເຂົ້າ category ທີ່ໜ້າ
 * Web Admin ຮອງຮັບ — ຄ່າທີ່ບໍ່ຮູ້ຈັກ fallback ເປັນ 'system' ແທນທີ່ຈະສົ່ງຄ່າດິບອອກໄປ. */
function mapCategory(module: NotificationModule): NotificationCategory {
  switch (module) {
    case 'appointments':
    case 'waitlist':
    case 'homeService':
      return 'booking';
    case 'staff':
      return 'staff';
    case 'inventory':
      return 'inventory';
    case 'payments':
    case 'giftCards':
    case 'loyalty':
      return 'payment';
    case 'marketing':
      return 'marketing';
    default:
      return 'system';
  }
}

const notificationInclude = { resolvedBy: { select: { id: true, name: true } } } as const;
type NotificationRow = Prisma.NotificationLogGetPayload<{ include: typeof notificationInclude }>;

function toNotificationView(n: NotificationRow): AppNotificationView {
  const module = mapModule(n.type);
  const severity = (SEVERITIES as readonly string[]).includes(n.severity)
    ? (n.severity as NotificationSeverity)
    : inferNotificationSeverity(n.type);
  const data =
    n.data && typeof n.data === 'object' && !Array.isArray(n.data)
      ? (n.data as Record<string, unknown>)
      : null;
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    severity,
    category: mapCategory(module),
    module,
    source: module,
    data,
    createdAt: n.sentAt.toISOString(),
    read: n.isRead,
    readAt: n.readAt?.toISOString() ?? null,
    resolved: n.resolvedAt != null,
    resolvedAt: n.resolvedAt?.toISOString() ?? null,
    resolvedBy: n.resolvedBy ? { id: n.resolvedBy.id, name: n.resolvedBy.name } : null,
  };
}

export const NOTIFICATION_LIST_MAX = 500;

export async function listNotifications(
  userId: string,
  limit = 300,
): Promise<NotificationListResult> {
  const take = Math.min(Math.max(limit, 1), NOTIFICATION_LIST_MAX);
  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * 86_400_000);

  const [rows, total, unread, needsAction, critical, resolved7d, todayRows, dailyRows, medianRows] =
    await Promise.all([
      prisma.notificationLog.findMany({
        where: { userId },
        orderBy: { sentAt: 'desc' },
        take,
        include: notificationInclude,
      }),
      prisma.notificationLog.count({ where: { userId } }),
      prisma.notificationLog.count({ where: { userId, isRead: false } }),
      prisma.notificationLog.count({
        where: { userId, resolvedAt: null, severity: { in: ['warning', 'critical'] } },
      }),
      prisma.notificationLog.count({ where: { userId, resolvedAt: null, severity: 'critical' } }),
      prisma.notificationLog.count({ where: { userId, resolvedAt: { gte: since7d } } }),
      prisma.$queryRaw<{ n: bigint }[]>`
        SELECT COUNT(*)::bigint AS n FROM "notification_logs"
        WHERE "userId" = ${userId}
          AND ("sentAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Vientiane')::date
            = (NOW() AT TIME ZONE 'Asia/Vientiane')::date`,
      prisma.$queryRaw<{ day: string; total: bigint; critical: bigint; warning: bigint }[]>`
        SELECT to_char(("sentAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Vientiane')::date, 'YYYY-MM-DD') AS day,
               COUNT(*)::bigint AS total,
               COUNT(*) FILTER (WHERE "severity" = 'critical')::bigint AS critical,
               COUNT(*) FILTER (WHERE "severity" = 'warning')::bigint AS warning
        FROM "notification_logs"
        WHERE "userId" = ${userId}
          AND "sentAt" >= NOW() - INTERVAL '15 days'
        GROUP BY 1`,
      prisma.$queryRaw<{ m: number | null }[]>`
        SELECT percentile_cont(0.5) WITHIN GROUP (
                 ORDER BY EXTRACT(EPOCH FROM ("resolvedAt" - "sentAt")) / 60
               )::float AS m
        FROM "notification_logs"
        WHERE "userId" = ${userId} AND "resolvedAt" >= NOW() - INTERVAL '30 days'`,
    ]);

  // Fill 14 local days, oldest first, so the sparkline never has gaps.
  const byDay = new Map(dailyRows.map((r) => [r.day, r]));
  const todayLocal = new Date(now.getTime() + 7 * 3_600_000); // Asia/Vientiane is fixed UTC+7
  const daily: NotificationListResult['daily'] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(todayLocal.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const r = byDay.get(d);
    daily.push({
      date: d,
      total: Number(r?.total ?? 0),
      critical: Number(r?.critical ?? 0),
      warning: Number(r?.warning ?? 0),
    });
  }

  const median = medianRows[0]?.m;
  return {
    items: rows.map(toNotificationView),
    summary: {
      total,
      unread,
      needsAction,
      critical,
      today: Number(todayRows[0]?.n ?? 0),
      resolved7d,
      medianResolveMinutes: median == null ? null : Math.round(median),
    },
    daily,
    limit: take,
  };
}

export async function countUnreadNotifications(
  userId: string,
): Promise<{ unread: number; critical: number }> {
  const [unread, critical] = await Promise.all([
    prisma.notificationLog.count({ where: { userId, isRead: false } }),
    prisma.notificationLog.count({
      where: { userId, isRead: false, resolvedAt: null, severity: 'critical' },
    }),
  ]);
  return { unread, critical };
}

async function getOwnedNotification(userId: string, id: string): Promise<AppNotificationView> {
  const row = await prisma.notificationLog.findFirst({
    where: { id, userId },
    include: notificationInclude,
  });
  if (!row) throw ApiError.notFound('ບໍ່ພົບການແຈ້ງເຕືອນ');
  return toNotificationView(row);
}

export type NotificationAction = 'read' | 'unread' | 'resolve' | 'reopen' | 'delete';

export async function applyNotificationAction(
  userId: string,
  id: string,
  action: Exclude<NotificationAction, 'delete'>,
): Promise<AppNotificationView> {
  const current = await getOwnedNotification(userId, id);
  const now = new Date();
  let data: Prisma.NotificationLogUncheckedUpdateInput | null = null;
  switch (action) {
    case 'read':
      // Keep the original readAt when re-marking an already-read row.
      if (!current.read) data = { isRead: true, readAt: now };
      break;
    case 'unread':
      if (current.read) data = { isRead: false, readAt: null };
      break;
    case 'resolve':
      // Resolving implies it has been seen.
      if (!current.resolved) {
        data = { resolvedAt: now, resolvedById: userId, ...(current.read ? {} : { isRead: true, readAt: now }) };
      }
      break;
    case 'reopen':
      if (current.resolved) data = { resolvedAt: null, resolvedById: null };
      break;
  }
  if (!data) return current;
  await prisma.notificationLog.update({ where: { id }, data });
  return getOwnedNotification(userId, id);
}

export async function deleteNotification(userId: string, id: string): Promise<{ id: string }> {
  await getOwnedNotification(userId, id);
  await prisma.notificationLog.delete({ where: { id } });
  return { id };
}

export async function markAllNotificationsRead(userId: string): Promise<{ updated: number }> {
  const res = await prisma.notificationLog.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { updated: res.count };
}

export async function bulkNotificationAction(
  userId: string,
  ids: string[],
  action: NotificationAction,
): Promise<{ updated: number }> {
  const scope = { userId, id: { in: ids } };
  if (action === 'delete') {
    const res = await prisma.notificationLog.deleteMany({ where: scope });
    return { updated: res.count };
  }
  // Only touch rows whose state actually changes so timestamps stay truthful.
  const where: Prisma.NotificationLogWhereInput =
    action === 'read'
      ? { ...scope, isRead: false }
      : action === 'unread'
        ? { ...scope, isRead: true }
        : action === 'resolve'
          ? { ...scope, resolvedAt: null }
          : { ...scope, resolvedAt: { not: null } };
  if (action === 'resolve') {
    const now = new Date();
    const [a, b] = await prisma.$transaction([
      prisma.notificationLog.updateMany({
        where: { ...where, isRead: false },
        data: { isRead: true, readAt: now, resolvedAt: now, resolvedById: userId },
      }),
      prisma.notificationLog.updateMany({
        where: { ...where, isRead: true },
        data: { resolvedAt: now, resolvedById: userId },
      }),
    ]);
    return { updated: a.count + b.count };
  }
  const data: Prisma.NotificationLogUncheckedUpdateManyInput =
    action === 'read'
      ? { isRead: true, readAt: new Date() }
      : action === 'unread'
        ? { isRead: false, readAt: null }
        : { resolvedAt: null, resolvedById: null };
  const res = await prisma.notificationLog.updateMany({ where, data });
  return { updated: res.count };
}

// ---- push devices (Expo, Module 23) -----------------------------

export type PushDeviceView = {
  id: string;
  platform: string;
  deviceName: string | null;
  lastSeenAt: string;
  createdAt: string;
};

export async function registerPushDevice(
  userId: string,
  input: { token: string; platform: string; deviceName?: string },
): Promise<PushDeviceView> {
  // token unique globally — re-register moves it to the current user & refreshes lastSeenAt.
  const row = await prisma.pushDevice.upsert({
    where: { token: input.token },
    update: { userId, platform: input.platform, deviceName: input.deviceName ?? null, lastSeenAt: new Date() },
    create: { userId, token: input.token, platform: input.platform, deviceName: input.deviceName ?? null },
    select: { id: true, platform: true, deviceName: true, lastSeenAt: true, createdAt: true },
  });
  // keep the legacy single-token mirror on User in sync (used by older code paths)
  await prisma.user.update({ where: { id: userId }, data: { expoPushToken: input.token } }).catch(() => undefined);
  return {
    id: row.id,
    platform: row.platform,
    deviceName: row.deviceName,
    lastSeenAt: row.lastSeenAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function unregisterPushDevice(userId: string, token: string): Promise<{ ok: true }> {
  await prisma.pushDevice.deleteMany({ where: { userId, token } });
  return { ok: true };
}

// ---- audit log (read-only feed) ----------------------------------

const AUDIT_CATEGORIES = [
  'appointment',
  'service',
  'staff',
  'timeoff',
  'walkin',
  'customer',
  'settings',
  'users',
  'branch',
  'auth',
  'supplier',
  'product',
  'stock',
  'purchase_order',
  'queue',
  'payment',
  'loyalty',
  'giftcard',
  'marketing',
  'waitlist',
] as const;

function auditCategory(action: string): string {
  const head = action.split('.')[0] ?? '';
  return (AUDIT_CATEGORIES as readonly string[]).includes(head) ? head : 'settings';
}
function auditSeverity(action: string): 'info' | 'warning' | 'critical' {
  if (/fail|role_changed|delete|deleted/.test(action)) return 'critical';
  if (/cancel|archiv|deactiv|reject/.test(action)) return 'warning';
  return 'info';
}

export type AuditEntryView = {
  id: string;
  action: string;
  category: string;
  severity: 'info' | 'warning' | 'critical';
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
  changes: Array<{ field: string; before: string; after: string }> | null;
};

type AuditRow = Prisma.AuditLogGetPayload<{
  include: { branch: { select: { name: true } }; user: { select: { name: true; role: true } } };
}>;

function toAuditEntry(l: AuditRow): AuditEntryView {
  let changes: AuditEntryView['changes'] = null;
  if (l.oldValue && l.newValue && typeof l.oldValue === 'object' && typeof l.newValue === 'object') {
    const before = l.oldValue as Record<string, unknown>;
    const after = l.newValue as Record<string, unknown>;
    changes = Object.keys(after)
      .filter((k) => String(before[k]) !== String(after[k]))
      .map((k) => ({ field: k, before: String(before[k] ?? '—'), after: String(after[k] ?? '—') }));
    if (changes.length === 0) changes = null;
  }
  return {
    id: l.id,
    action: l.action,
    category: auditCategory(l.action),
    severity: auditSeverity(l.action),
    actorId: l.userId ?? '',
    actor: l.user?.name ?? 'system',
    actorRole: l.user?.role ?? '—',
    branchId: l.branchId ?? '',
    branchName: l.branch?.name ?? '—',
    targetType: l.entityName,
    target: l.entityId ?? '—',
    ip: l.ipAddress ?? '',
    device: '',
    at: l.createdAt.toISOString(),
    changes,
  };
}

export type AuditQuery = {
  page: number;
  pageSize: number;
  q?: string;
  category?: string;
  actorId?: string;
  from?: string;
  to?: string;
};

export async function listAuditLogs(query: AuditQuery): Promise<{
  items: AuditEntryView[];
  page: number;
  pageSize: number;
  total: number;
  facets: {
    categories: Array<{ key: string; count: number }>;
    actors: Array<{ id: string; name: string; count: number }>;
    totalAll: number;
    totalToday: number;
    totalCritical: number;
  };
}> {
  const where: Prisma.AuditLogWhereInput = {
    ...(query.actorId ? { userId: query.actorId } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          OR: [
            { action: { contains: query.q, mode: 'insensitive' } },
            { entityName: { contains: query.q, mode: 'insensitive' } },
            { user: { name: { contains: query.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const include = {
    branch: { select: { name: true } },
    user: { select: { name: true, role: true } },
  } satisfies Prisma.AuditLogInclude;

  const [rows, total, all] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ include, orderBy: { createdAt: 'desc' }, take: 2000 }),
  ]);

  let entries = rows.map(toAuditEntry);
  const allEntries = all.map(toAuditEntry);
  if (query.category && query.category !== 'ALL') {
    entries = entries.filter((e) => e.category === query.category);
  }

  const catMap = new Map<string, number>();
  const actorMap = new Map<string, { id: string; name: string; count: number }>();
  for (const e of allEntries) {
    catMap.set(e.category, (catMap.get(e.category) ?? 0) + 1);
    if (e.actorId) {
      const cur = actorMap.get(e.actorId);
      if (cur) cur.count += 1;
      else actorMap.set(e.actorId, { id: e.actorId, name: e.actor, count: 1 });
    }
  }
  const dayAgo = Date.now() - 86_400_000;

  return {
    items: entries,
    page: query.page,
    pageSize: query.pageSize,
    total: query.category && query.category !== 'ALL' ? entries.length : total,
    facets: {
      categories: [...catMap.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count),
      actors: [...actorMap.values()].sort((a, b) => b.count - a.count),
      totalAll: allEntries.length,
      totalToday: allEntries.filter((e) => new Date(e.at).getTime() >= dayAgo).length,
      totalCritical: allEntries.filter((e) => e.severity === 'critical').length,
    },
  };
}

// ---- end-of-day report -----------------------------------------------

export async function endOfDayReport(date: string, branchId: string): Promise<unknown> {
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(`${date}T23:59:59.999+07:00`);
  const rows = await prisma.appointment.findMany({
    where: {
      deletedAt: null,
      startAt: { gte: start, lte: end },
      ...(branchId === 'all' ? {} : { branchId }),
    },
    include: { service: { select: { name: true } }, payment: { select: { depositAmount: true } } },
  });
  const completed = rows.filter((a) => a.status === 'COMPLETED');
  const revenue = completed.reduce((s, a) => s + a.totalAmount.toNumber(), 0);
  const deposits = rows.reduce((s, a) => s + (a.payment?.depositAmount.toNumber() ?? 0), 0);

  const svcMap = new Map<string, { count: number; revenue: number }>();
  for (const a of completed) {
    const cur = svcMap.get(a.service.name) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += a.totalAmount.toNumber();
    svcMap.set(a.service.name, cur);
  }

  return {
    date,
    branchId,
    totals: {
      bookings: rows.length,
      completed: completed.length,
      cancelled: rows.filter((a) => a.status === 'CANCELLED' || a.status === 'NO_SHOW').length,
      walkIns: 0,
      revenue,
      deposits,
    },
    topServices: [...svcMap.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5),
  };
}
