import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type {
  AnnouncementInput,
  AnnouncementPatch,
  AnnouncementView,
  ChecklistDay,
  ChecklistSlot,
  ChecklistTask,
  ChecklistTaskKey,
  Permission,
  PortalCountKey,
  PortalSummary,
  ProbeState,
  SystemStatus,
} from '@abcp/shared-types';
import { Prisma, type Announcement, type UserRole } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import { redis } from '../../config/redis.js';
import { allQueues, slipOcrQueue } from '../../jobs/queues.js';
import type { Actor } from '../../middlewares/permissionGuard.js';
import { getIO } from '../../realtime/socket.js';
import { ApiError } from '../../utils/ApiError.js';
import { countUnreadNotifications } from '../system/system.service.js';

/**
 * web-admin /portal — one round trip for every "what needs me" number, team
 * announcements, the super-admin system status card and the daily checklist.
 * Every figure is gated by the same permission that opens its module, so the
 * portal never reveals a count its viewer couldn't drill into.
 */

const DAY = 86_400_000;
const VTE_OFFSET_MS = 7 * 3_600_000;
const HOME_SERVICE_ACTIVE = ['MATCHING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'] as const;
const SLIP_REVIEWABLE = ['AUTO_MATCHED', 'NEEDS_REVIEW'] as const;
const ADMIN_ROLES: UserRole[] = ['SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'];

function vteDayKey(ms: number): string {
  return new Date(ms + VTE_OFFSET_MS).toISOString().slice(0, 10);
}
function vteDayStart(key: string): Date {
  return new Date(`${key}T00:00:00+07:00`);
}
/** YYYY-MM of the Vientiane month before `ms`. */
function prevVteMonth(ms: number): string {
  const d = new Date(ms + VTE_OFFSET_MS);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-based → previous month in 1-based terms
  return m === 0 ? `${y - 1}-12` : `${y}-${String(m).padStart(2, '0')}`;
}

const can = (actor: Actor, ...perms: Permission[]) =>
  actor.isSuperAdmin || perms.some((p) => actor.permissions.has(p));

/** Non-super-admins are pinned to their own branch whatever they ask for. */
export function resolveScope(actor: Actor, requested?: string): string | 'all' {
  if (!actor.isSuperAdmin) return actor.branchId ?? 'all';
  return requested && requested !== 'all' ? requested : 'all';
}

// --- Summary ---------------------------------------------------------------------------

type Counter = () => Promise<number>;

export async function getSummary(actor: Actor, requested?: string): Promise<PortalSummary> {
  const scope = resolveScope(actor, requested);
  const bw = scope === 'all' ? {} : { branchId: scope };
  const nowMs = Date.now();
  const todayKey = vteDayKey(nowMs);
  const todayStart = vteDayStart(todayKey);

  const jobs: Partial<Record<PortalCountKey, Counter>> = {};

  if (can(actor, 'appointments:view', 'calendar:view')) {
    jobs.appointmentsPending = () =>
      prisma.appointment.count({
        where: { ...bw, deletedAt: null, status: 'PENDING', startAt: { gte: new Date(nowMs), lte: new Date(nowMs + 7 * DAY) } },
      });
    jobs.appointmentsToday = () =>
      prisma.appointment.count({
        where: { ...bw, deletedAt: null, startAt: { gte: todayStart, lt: new Date(todayStart.getTime() + DAY) } },
      });
    jobs.waitlist = () => prisma.waitlist.count({ where: { ...bw, preferredDate: { gte: todayStart } } });
  }
  if (can(actor, 'queue:manage')) {
    jobs.queueWaiting = () =>
      prisma.queueTicket.count({ where: { ...bw, status: 'WAITING', createdAt: { gte: todayStart } } });
    jobs.queueLongestWaitMin = async () => {
      const oldest = await prisma.queueTicket.findFirst({
        where: { ...bw, status: 'WAITING', createdAt: { gte: todayStart } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      return oldest ? Math.max(0, Math.round((nowMs - oldest.createdAt.getTime()) / 60_000)) : 0;
    };
    jobs.homeServiceActive = () =>
      prisma.homeServiceTrip.count({
        where: {
          status: { in: [...HOME_SERVICE_ACTIVE] },
          ...(scope === 'all' ? {} : { appointment: { branchId: scope } }),
        },
      });
  }
  if (can(actor, 'staff:view')) {
    jobs.timeOffPending = () =>
      prisma.staffTimeOff.count({
        where: {
          isApproved: false,
          status: { notIn: ['APPROVED', 'REJECTED'] },
          ...(scope === 'all' ? {} : { staffProfile: { staffBranches: { some: { branchId: scope } } } }),
        },
      });
  }
  if (can(actor, 'inventory:view')) {
    jobs.lowStock = async () => {
      const rows = await prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM "products"
        WHERE "deletedAt" IS NULL AND "isActive" = true AND "stockQty" <= "minStockQty"
        ${scope === 'all' ? Prisma.empty : Prisma.sql`AND "branchId" = ${scope}`}`;
      return rows[0]?.n ?? 0;
    };
    jobs.openPurchaseOrders = () =>
      prisma.purchaseOrder.count({ where: { ...bw, status: { in: ['ORDERED', 'PARTIALLY_RECEIVED'] } } });
    jobs.transfersInTransit = () =>
      prisma.stockTransfer.count({
        where: { status: 'IN_TRANSIT', ...(scope === 'all' ? {} : { toBranchId: scope }) },
      });
    jobs.stockCountsOpen = () =>
      prisma.stockCount.count({ where: { ...bw, status: { in: ['COUNTING', 'PENDING_APPROVAL'] } } });
    jobs.adjustmentsPending = () => prisma.stockAdjustmentRequest.count({ where: { ...bw, status: 'PENDING' } });
  }
  if (can(actor, 'payments:review')) {
    jobs.slipsToReview = () =>
      prisma.paymentSlip.count({ where: { ...bw, verdict: { in: [...SLIP_REVIEWABLE] } } });
  }
  if (can(actor, 'expenses:approve')) {
    jobs.expensesToApprove = () => prisma.expense.count({ where: { ...bw, status: 'SUBMITTED' } });
  }
  if (can(actor, 'expenses:view')) {
    jobs.expensesDueSoon = () =>
      prisma.expense.count({
        where: { ...bw, status: 'APPROVED', dueDate: { not: null, lte: new Date(nowMs + 3 * DAY) } },
      });
  }
  if (can(actor, 'payments:reconcile', 'payments:manage')) {
    jobs.statementLinesUnmatched = () =>
      prisma.bankStatementLine.count({
        where: { matchStatus: 'UNMATCHED', ...(scope === 'all' ? {} : { bankAccount: { branchId: scope } }) },
      });
    jobs.cashDrawersOpen = () => prisma.cashDrawerSession.count({ where: { ...bw, status: 'OPEN' } });
  }
  if (can(actor, 'finance:view')) {
    jobs.unpaidBills = async () => {
      const rows = await prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM "payments" p
        WHERE p."paymentStatus" IN ('PENDING', 'DEPOSIT_PAID')
          AND p."totalAmount" > COALESCE((
            SELECT SUM(pt."amount") FROM "payment_transactions" pt
            WHERE pt."paymentId" = p."id" AND pt."status" = 'SUCCESS'
          ), 0)
          ${scope === 'all' ? Prisma.empty : Prisma.sql`AND p."branchId" = ${scope}`}`;
      return rows[0]?.n ?? 0;
    };
  }
  if (can(actor, 'queue:manage')) {
    jobs.messagesUnread = async () => {
      const rows = await prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n
        FROM "chat_messages" m
        JOIN "conversation_participants" p ON p."threadId" = m."threadId" AND p."userId" = ${actor.id}
        JOIN "conversations" c ON c."id" = m."threadId" AND c."type" = 'STAFF_INTERNAL'
        WHERE m."senderId" <> ${actor.id}
          AND m."deletedAt" IS NULL
          AND m."createdAt" > COALESCE(p."lastReadAt", p."joinedAt")`;
      return rows[0]?.n ?? 0;
    };
  }
  jobs.announcementsUnread = () => countUnreadAnnouncements(actor);

  const keys = Object.keys(jobs) as PortalCountKey[];
  const [values, notif, reconOpenMonth] = await Promise.all([
    Promise.all(keys.map((k) => jobs[k]!())),
    countUnreadNotifications(actor.id),
    can(actor, 'payments:reconcile', 'payments:manage') && scope !== 'all'
      ? prisma.reconciliationPeriod
          .findUnique({ where: { branchId_month: { branchId: scope, month: prevVteMonth(nowMs) } } })
          .then((row) => (row ? null : prevVteMonth(nowMs)))
      : Promise.resolve(undefined),
  ]);

  const counts: PortalSummary['counts'] = {
    notificationsUnread: notif.unread,
    notificationsCritical: notif.critical,
  };
  keys.forEach((k, i) => {
    counts[k] = values[i]!;
  });

  return {
    generatedAt: new Date(nowMs).toISOString(),
    branchId: scope,
    counts,
    ...(reconOpenMonth !== undefined ? { reconOpenMonth } : {}),
  };
}

// --- Announcements ---------------------------------------------------------------------

function visibleWhere(actor: Actor, now = new Date()): Prisma.AnnouncementWhereInput {
  return {
    deletedAt: null,
    publishedAt: { lte: now },
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    AND: [
      { OR: [{ audienceRoles: { isEmpty: true } }, { audienceRoles: { has: actor.role } }] },
      actor.isSuperAdmin
        ? {}
        : { OR: [{ branchId: null }, ...(actor.branchId ? [{ branchId: actor.branchId }] : [])] },
    ],
  };
}

async function countUnreadAnnouncements(actor: Actor): Promise<number> {
  return prisma.announcement.count({
    where: { ...visibleWhere(actor), reads: { none: { userId: actor.id } } },
  });
}

async function toViews(
  rows: Array<Announcement & { reads?: { userId: string }[]; _count?: { reads: number } }>,
  viewerId: string,
): Promise<AnnouncementView[]> {
  const userIds = [...new Set(rows.map((r) => r.createdById))];
  const branchIds = [...new Set(rows.map((r) => r.branchId).filter((x): x is string => !!x))];
  const [users, branches] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [],
    branchIds.length
      ? prisma.branch.findMany({ where: { id: { in: branchIds } }, select: { id: true, name: true } })
      : [],
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    kind: r.kind,
    severity: r.severity,
    audienceRoles: r.audienceRoles,
    branchId: r.branchId,
    branchName: r.branchId ? (branchName.get(r.branchId) ?? null) : null,
    pinned: r.pinned,
    publishedAt: r.publishedAt.toISOString(),
    expiresAt: r.expiresAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    author: userName.has(r.createdById) ? { id: r.createdById, name: userName.get(r.createdById)! } : null,
    read: (r.reads ?? []).some((x) => x.userId === viewerId),
    ...(r._count ? { readCount: r._count.reads } : {}),
  }));
}

/** GET /portal/announcements — what this viewer should see now, pinned first. */
export async function listAnnouncements(actor: Actor, limit = 30): Promise<AnnouncementView[]> {
  const rows = await prisma.announcement.findMany({
    where: visibleWhere(actor),
    include: { reads: { where: { userId: actor.id }, select: { userId: true } } },
    orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }],
    take: limit,
  });
  return toViews(rows, actor.id);
}

/** GET /portal/announcements/manage — authoring list incl. scheduled + expired, with read counts. */
export async function listAnnouncementsForManage(actor: Actor): Promise<AnnouncementView[]> {
  const rows = await prisma.announcement.findMany({
    where: {
      deletedAt: null,
      ...(actor.isSuperAdmin ? {} : { OR: [{ branchId: actor.branchId }, { createdById: actor.id }] }),
    },
    include: {
      reads: { where: { userId: actor.id }, select: { userId: true } },
      _count: { select: { reads: true } },
    },
    orderBy: { publishedAt: 'desc' },
    take: 200,
  });
  return toViews(rows, actor.id);
}

function assertBranchAllowed(actor: Actor, branchId: string | null | undefined) {
  if (actor.isSuperAdmin) return;
  // A branch admin may only address their own branch — never the whole company.
  if (branchId !== actor.branchId) {
    throw ApiError.forbidden('ສົ່ງປະກາດໄດ້ສະເພາະສາຂາຂອງທ່ານ');
  }
}

export async function createAnnouncement(actor: Actor, input: AnnouncementInput): Promise<AnnouncementView> {
  const branchId = actor.isSuperAdmin ? (input.branchId ?? null) : actor.branchId;
  assertBranchAllowed(actor, branchId);
  const row = await prisma.announcement.create({
    data: {
      title: input.title,
      body: input.body ?? '',
      kind: input.kind ?? 'ANNOUNCEMENT',
      severity: input.severity ?? 'INFO',
      audienceRoles: (input.audienceRoles ?? []).filter((r) => ADMIN_ROLES.includes(r as UserRole)) as UserRole[],
      branchId,
      pinned: input.pinned ?? false,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : new Date(),
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdById: actor.id,
      // The author has obviously read it.
      reads: { create: { userId: actor.id } },
    },
    include: { reads: { select: { userId: true } }, _count: { select: { reads: true } } },
  });
  return (await toViews([row], actor.id))[0]!;
}

async function loadEditable(actor: Actor, id: string) {
  const row = await prisma.announcement.findFirst({ where: { id, deletedAt: null } });
  if (!row) throw ApiError.notFound('ບໍ່ພົບປະກາດ');
  if (!actor.isSuperAdmin && row.branchId !== actor.branchId && row.createdById !== actor.id) {
    throw ApiError.forbidden('ແກ້ໄຂປະກາດນີ້ບໍ່ໄດ້');
  }
  return row;
}

export async function updateAnnouncement(
  actor: Actor,
  id: string,
  patch: AnnouncementPatch,
): Promise<AnnouncementView> {
  await loadEditable(actor, id);
  // Branch admins can't re-target a post; their branch was fixed at creation.
  if (!actor.isSuperAdmin) patch = { ...patch, branchId: undefined };
  if (patch.branchId !== undefined) assertBranchAllowed(actor, patch.branchId);
  const row = await prisma.announcement.update({
    where: { id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.severity !== undefined ? { severity: patch.severity } : {}),
      ...(patch.audienceRoles !== undefined ? { audienceRoles: patch.audienceRoles as UserRole[] } : {}),
      ...(patch.branchId !== undefined ? { branchId: patch.branchId } : {}),
      ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
      ...(patch.publishedAt !== undefined ? { publishedAt: new Date(patch.publishedAt) } : {}),
      ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt ? new Date(patch.expiresAt) : null } : {}),
    },
    include: {
      reads: { where: { userId: actor.id }, select: { userId: true } },
      _count: { select: { reads: true } },
    },
  });
  return (await toViews([row], actor.id))[0]!;
}

export async function deleteAnnouncement(actor: Actor, id: string): Promise<{ id: string }> {
  await loadEditable(actor, id);
  await prisma.announcement.update({ where: { id }, data: { deletedAt: new Date() } });
  return { id };
}

export async function markAnnouncementRead(actor: Actor, id: string): Promise<{ id: string }> {
  const row = await prisma.announcement.findFirst({ where: { id, ...visibleWhere(actor) }, select: { id: true } });
  if (!row) throw ApiError.notFound('ບໍ່ພົບປະກາດ');
  await prisma.announcementRead.upsert({
    where: { announcementId_userId: { announcementId: id, userId: actor.id } },
    create: { announcementId: id, userId: actor.id },
    update: {},
  });
  return { id };
}

export async function markAllAnnouncementsRead(actor: Actor): Promise<{ count: number }> {
  const unread = await prisma.announcement.findMany({
    where: { ...visibleWhere(actor), reads: { none: { userId: actor.id } } },
    select: { id: true },
  });
  if (unread.length) {
    await prisma.announcementRead.createMany({
      data: unread.map((a) => ({ announcementId: a.id, userId: actor.id })),
      skipDuplicates: true,
    });
  }
  return { count: unread.length };
}

// --- System status (SUPER_ADMIN) ---------------------------------------------------------

const BACKUP_STALE_HOURS = 26;

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; ms: number | null }> {
  const t0 = performance.now();
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2_000)),
    ]);
    return { ok: true, ms: Math.round(performance.now() - t0) };
  } catch {
    return { ok: false, ms: null };
  }
}

async function latestBackup(): Promise<SystemStatus['backup']> {
  const dir = env.BACKUP_DIR;
  if (!dir) {
    return { state: 'unknown', configured: false, lastAt: null, file: null, sizeBytes: null, ageHours: null };
  }
  try {
    const names = (await readdir(dir)).filter((n) => /\.(sql|dump|gz|tar)(\.gz)?$/i.test(n));
    const stats = await Promise.all(
      names.map(async (n) => ({ n, s: await stat(path.join(dir, n)) })),
    );
    const newest = stats.sort((a, b) => b.s.mtimeMs - a.s.mtimeMs)[0];
    if (!newest) {
      return { state: 'down', configured: true, lastAt: null, file: null, sizeBytes: null, ageHours: null };
    }
    const ageHours = Math.round(((Date.now() - newest.s.mtimeMs) / 3_600_000) * 10) / 10;
    return {
      state: ageHours <= BACKUP_STALE_HOURS ? 'ok' : 'degraded',
      configured: true,
      lastAt: newest.s.mtime.toISOString(),
      file: newest.n,
      sizeBytes: newest.s.size,
      ageHours,
    };
  } catch {
    return { state: 'down', configured: true, lastAt: null, file: null, sizeBytes: null, ageHours: null };
  }
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const queues = [...allQueues, slipOcrQueue];
  const [db, rds, backup, queueRows] = await Promise.all([
    timed(() => prisma.$queryRaw`SELECT 1`),
    timed(() => redis.ping()),
    latestBackup(),
    Promise.all(
      queues.map(async (q) => {
        try {
          const [counts, done, failed, workers] = await Promise.all([
            q.getJobCounts('waiting', 'active', 'delayed', 'failed'),
            q.getJobs(['completed'], 0, 0, false),
            q.getJobs(['failed'], 0, 0, false),
            q.getWorkers().catch(() => []),
          ]);
          const lastDone = done[0];
          const lastFail = failed[0];
          return {
            name: q.name,
            waiting: counts.waiting ?? 0,
            active: counts.active ?? 0,
            delayed: counts.delayed ?? 0,
            failed: counts.failed ?? 0,
            workers: workers.length,
            lastCompletedAt: lastDone?.finishedOn ? new Date(lastDone.finishedOn).toISOString() : null,
            lastFailedAt: lastFail?.finishedOn ? new Date(lastFail.finishedOn).toISOString() : null,
            lastFailedReason: lastFail?.failedReason?.slice(0, 200) ?? null,
          };
        } catch {
          return {
            name: q.name,
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
            workers: 0,
            lastCompletedAt: null,
            lastFailedAt: null,
            lastFailedReason: null,
          };
        }
      }),
    ),
  ]);

  let socket: SystemStatus['socket'] = { state: 'unknown', clients: 0 };
  try {
    socket = { state: 'ok', clients: getIO().engine.clientsCount };
  } catch {
    /* socket server not attached (tests / createApp only) */
  }

  const workerCount = Math.max(0, ...queueRows.map((q) => q.workers));
  const mem = process.memoryUsage();
  return {
    checkedAt: new Date().toISOString(),
    api: {
      state: 'ok',
      uptimeSec: Math.round(process.uptime()),
      version: process.env.npm_package_version ?? '0.1.0',
      node: process.version,
      memoryMb: Math.round(mem.rss / 1_048_576),
    },
    database: { state: db.ok ? (db.ms! > 500 ? 'degraded' : 'ok') : 'down', latencyMs: db.ms },
    redis: { state: rds.ok ? (rds.ms! > 300 ? 'degraded' : 'ok') : 'down', latencyMs: rds.ms },
    socket,
    worker: { state: (rds.ok ? (workerCount > 0 ? 'ok' : 'down') : 'unknown') as ProbeState, workers: workerCount },
    queues: queueRows.sort((a, b) => b.failed - a.failed || a.name.localeCompare(b.name)),
    backup,
  };
}

// --- Daily checklist ---------------------------------------------------------------------

interface TaskDef {
  key: ChecklistTaskKey;
  slot: ChecklistSlot;
  to: string;
  visible: (actor: Actor) => boolean;
  /** Returns the live count (or null) and whether the data already proves it done. */
  probe: (ctx: ProbeCtx) => Promise<{ count: number | null; autoDone: boolean }>;
}

interface ProbeCtx {
  actor: Actor;
  scope: string | 'all';
  bw: { branchId?: string };
  todayStart: Date;
  nowMs: number;
}

const TASKS: TaskDef[] = [
  {
    key: 'openDrawer',
    slot: 'open',
    to: '/payments/reconciliation',
    visible: (a) => can(a, 'payments:manage', 'payments:reconcile'),
    probe: async ({ bw, todayStart }) => {
      const opened = await prisma.cashDrawerSession.count({ where: { ...bw, openedAt: { gte: todayStart } } });
      return { count: null, autoDone: opened > 0 };
    },
  },
  {
    key: 'confirmBookings',
    slot: 'open',
    to: '/appointments',
    visible: (a) => can(a, 'appointments:view'),
    probe: async ({ bw, nowMs }) => {
      const n = await prisma.appointment.count({
        where: { ...bw, deletedAt: null, status: 'PENDING', startAt: { gte: new Date(nowMs), lte: new Date(nowMs + 2 * DAY) } },
      });
      return { count: n, autoDone: n === 0 };
    },
  },
  {
    key: 'reviewSlips',
    slot: 'during',
    to: '/payments/slips',
    visible: (a) => can(a, 'payments:review'),
    probe: async ({ bw }) => {
      const n = await prisma.paymentSlip.count({ where: { ...bw, verdict: { in: [...SLIP_REVIEWABLE] } } });
      return { count: n, autoDone: n === 0 };
    },
  },
  {
    key: 'approveExpenses',
    slot: 'during',
    to: '/payments/expenses',
    visible: (a) => can(a, 'expenses:approve'),
    probe: async ({ bw }) => {
      const n = await prisma.expense.count({ where: { ...bw, status: 'SUBMITTED' } });
      return { count: n, autoDone: n === 0 };
    },
  },
  {
    key: 'clearCritical',
    slot: 'during',
    to: '/notifications',
    visible: () => true,
    probe: async ({ actor }) => {
      const { critical } = await countUnreadNotifications(actor.id);
      return { count: critical, autoDone: critical === 0 };
    },
  },
  {
    key: 'checkLowStock',
    slot: 'during',
    to: '/inventory',
    visible: (a) => can(a, 'inventory:view'),
    probe: async ({ scope }) => {
      const rows = await prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM "products"
        WHERE "deletedAt" IS NULL AND "isActive" = true AND "stockQty" <= "minStockQty"
        ${scope === 'all' ? Prisma.empty : Prisma.sql`AND "branchId" = ${scope}`}`;
      const n = rows[0]?.n ?? 0;
      // Nothing low = nothing to check; otherwise someone has to look (manual tick).
      return { count: n, autoDone: n === 0 };
    },
  },
  {
    key: 'weeklyStockCount',
    slot: 'during',
    to: '/inventory',
    visible: (a) => can(a, 'inventory:manage'),
    probe: async ({ bw, nowMs }) => {
      const recent = await prisma.stockCount.count({
        where: {
          ...bw,
          OR: [
            { submittedAt: { gte: new Date(nowMs - 7 * DAY) } },
            { postedAt: { gte: new Date(nowMs - 7 * DAY) } },
          ],
        },
      });
      return { count: null, autoDone: recent > 0 };
    },
  },
  {
    key: 'matchStatement',
    slot: 'close',
    to: '/payments/reconciliation',
    visible: (a) => can(a, 'payments:reconcile'),
    probe: async ({ scope }) => {
      const n = await prisma.bankStatementLine.count({
        where: { matchStatus: 'UNMATCHED', ...(scope === 'all' ? {} : { bankAccount: { branchId: scope } }) },
      });
      return { count: n, autoDone: false };
    },
  },
  {
    key: 'closeDrawer',
    slot: 'close',
    to: '/payments/reconciliation',
    visible: (a) => can(a, 'payments:manage', 'payments:reconcile'),
    probe: async ({ bw, todayStart }) => {
      const [open, closedToday] = await Promise.all([
        prisma.cashDrawerSession.count({ where: { ...bw, status: 'OPEN' } }),
        prisma.cashDrawerSession.count({
          where: { ...bw, status: 'CLOSED', closedAt: { gte: todayStart }, zNo: { not: null } },
        }),
      ]);
      return { count: open, autoDone: open === 0 && closedToday > 0 };
    },
  },
  {
    key: 'verifyBackup',
    slot: 'close',
    to: '/portal#system-status',
    visible: (a) => a.isSuperAdmin,
    probe: async () => {
      const b = await latestBackup();
      return { count: null, autoDone: b.state === 'ok' };
    },
  },
];

export async function getChecklist(actor: Actor, requested?: string): Promise<ChecklistDay> {
  const scope = resolveScope(actor, requested);
  const nowMs = Date.now();
  const day = vteDayKey(nowMs);
  const ctx: ProbeCtx = {
    actor,
    scope,
    bw: scope === 'all' ? {} : { branchId: scope },
    todayStart: vteDayStart(day),
    nowMs,
  };
  const defs = TASKS.filter((t) => t.visible(actor));
  const [probes, ticks] = await Promise.all([
    Promise.all(defs.map((d) => d.probe(ctx).catch(() => ({ count: null, autoDone: false })))),
    prisma.dailyChecklistTick.findMany({ where: { scope, day, taskKey: { in: defs.map((d) => d.key) } } }),
  ]);
  const tickBy = new Map(ticks.map((t) => [t.taskKey, t]));
  const names = ticks.length
    ? new Map(
        (
          await prisma.user.findMany({
            where: { id: { in: [...new Set(ticks.map((t) => t.doneById))] } },
            select: { id: true, name: true },
          })
        ).map((u) => [u.id, u.name]),
      )
    : new Map<string, string>();

  const tasks: ChecklistTask[] = defs.map((d, i) => {
    const p = probes[i]!;
    const tick = tickBy.get(d.key);
    return {
      key: d.key,
      slot: d.slot,
      to: d.to,
      autoDone: p.autoDone,
      ticked: !!tick,
      done: p.autoDone || !!tick,
      doneAt: tick?.doneAt.toISOString() ?? null,
      doneBy: tick ? (names.get(tick.doneById) ?? null) : null,
      count: p.count,
    };
  });
  return { date: day, branchId: scope, tasks };
}

export async function toggleChecklistTask(
  actor: Actor,
  key: ChecklistTaskKey,
  done: boolean,
  requested?: string,
): Promise<ChecklistDay> {
  const def = TASKS.find((t) => t.key === key);
  if (!def || !def.visible(actor)) throw ApiError.forbidden('ບໍ່ມີສິດໃນວຽກນີ້');
  const scope = resolveScope(actor, requested);
  const day = vteDayKey(Date.now());
  if (done) {
    await prisma.dailyChecklistTick.upsert({
      where: { scope_day_taskKey: { scope, day, taskKey: key } },
      create: { scope, day, taskKey: key, doneById: actor.id },
      update: {},
    });
  } else {
    await prisma.dailyChecklistTick.deleteMany({ where: { scope, day, taskKey: key } });
  }
  return getChecklist(actor, scope);
}
