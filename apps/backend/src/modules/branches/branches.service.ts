import type {
  BranchAmenity,
  BranchClosureCreateInput,
  BranchInsight,
  BranchInsightsView,
  BranchClosureView,
  BranchCreateInput,
  BranchUpdateInput,
  BranchView,
  BranchDayHours,
  BranchHistoryEntry,
  LaoProvinceId,
  AccessTokenPayload,
} from '@abcp/shared-types';
import { Prisma, type Branch, type BranchClosure } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  MINUTE_MS,
  timeStringToMinutes,
  vientianeDateKey,
  vientianeDayRangeOf,
} from '../../utils/dateHelpers.js';

const DEFAULT_TIMEZONE = 'Asia/Vientiane';
const DEFAULT_PROVINCE: LaoProvinceId = 'vientiane-capital';

type BranchRow = Branch & { manager?: { name: string } | null };
const BRANCH_INCLUDE = { manager: { select: { name: true } } } satisfies Prisma.BranchInclude;

function weeklyHoursOf(json: Prisma.JsonValue | null): BranchDayHours[] | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  return json.flatMap((x) => {
    const o = x as Partial<BranchDayHours>;
    return typeof o.day === 'number' && typeof o.open === 'string' && typeof o.close === 'string'
      ? [{ day: o.day, open: o.open, close: o.close, closed: Boolean(o.closed) }]
      : [];
  });
}

function toBranchView(b: BranchRow): BranchView {
  return {
    id: b.id,
    name: b.name,
    code: b.code ?? '',
    address: b.address,
    phone: b.phone,
    email: b.email,
    province: (b.province as LaoProvinceId | null) ?? DEFAULT_PROVINCE,
    latitude: b.latitude ?? 0,
    longitude: b.longitude ?? 0,
    timezone: DEFAULT_TIMEZONE,
    isActive: b.isActive,
    openTime: b.openTime,
    closeTime: b.closeTime,
    allowNegativeStock: b.allowNegativeStock,
    amenities: b.amenities as BranchAmenity[],
    createdAt: b.createdAt.toISOString(),
    weeklyHours: weeklyHoursOf(b.weeklyHours),
    managerUserId: b.managerUserId,
    managerName: b.manager?.name ?? null,
    coverImageUrl: b.coverImageUrl,
    photoUrls: b.photoUrls,
    monthlyRevenueTarget: b.monthlyRevenueTarget ? b.monthlyRevenueTarget.toNumber() : null,
    monthlyBookingTarget: b.monthlyBookingTarget,
    archivedAt: b.deletedAt?.toISOString() ?? null,
  };
}

/** Wave 11 — ບັນທຶກປະຫວັດການແກ້ໄຂສາຂາ ພ້ອມຄ່າກ່ອນ/ຫຼັງ (middleware ກາງຂ້າມ /branches ເພື່ອບໍ່ໃຫ້ຊ້ຳ). */
async function auditBranch(
  auth: AccessTokenPayload | undefined,
  action: string,
  branchId: string,
  before: BranchView | null,
  after: BranchView | null,
): Promise<void> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    if (k === 'createdAt' || k === 'managerName') continue;
    const a = (before as Record<string, unknown> | null)?.[k];
    const b = (after as Record<string, unknown> | null)?.[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[k] = { from: a ?? null, to: b ?? null };
  }
  if (before && Object.keys(changes).length === 0) return;
  await prisma.auditLog
    .create({
      data: {
        action: `branch.${action}`,
        entityName: 'branch',
        entityId: branchId,
        userId: auth?.sub ?? null,
        branchId,
        oldValue: (before ? Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.from])) : undefined) as never,
        newValue: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])) as never,
      },
    })
    .catch(() => undefined);
}

/** ຜູ້ຈັດການຕ້ອງເປັນພະນັກງານ/ຜູ້ຈັດການທີ່ຜູກກັບສາຂານີ້ (ຫຼື SUPER_ADMIN). */
async function assertManager(managerUserId: string | null | undefined, branchId: string | null): Promise<void> {
  if (!managerUserId) return;
  const u = await prisma.user.findFirst({
    where: { id: managerUserId, deletedAt: null },
    select: { role: true, branchId: true },
  });
  if (!u || !['SUPER_ADMIN', 'BRANCH_ADMIN', 'STAFF'].includes(u.role)) throw ApiError.badRequest('ຜູ້ຈັດການຕ້ອງເປັນພະນັກງານ');
  if (branchId && u.role !== 'SUPER_ADMIN' && u.branchId !== branchId) {
    throw ApiError.badRequest('ຜູ້ຈັດການຕ້ອງເປັນພະນັກງານຂອງສາຂານີ້');
  }
}

function hoursJson(v: BranchDayHours[] | null | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (v === undefined) return undefined;
  if (v === null || v.length === 0) return Prisma.DbNull;
  if (new Set(v.map((d) => d.day)).size !== v.length) throw ApiError.badRequest('ມື້ຊ້ຳກັນໃນເວລາເປີດ-ປິດ');
  return [...v].sort((a, b) => a.day - b.day);
}

function toClosureView(c: BranchClosure & { branch: { name: string } | null }): BranchClosureView {
  return {
    id: c.id,
    branchId: c.branchId ?? 'all',
    branchName: c.branch?.name ?? 'ທຸກສາຂາ',
    date: c.date.toISOString().slice(0, 10),
    reason: c.reason,
    createdAt: c.createdAt.toISOString(),
  };
}

/** GET /branches — ທຸກສາຂາ (ບໍ່ລວມທີ່ລຶບແລ້ວ). */
export async function listBranches(includeArchived = false): Promise<{ items: BranchView[] }> {
  const rows = await prisma.branch.findMany({
    where: includeArchived ? {} : { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: BRANCH_INCLUDE,
  });
  return { items: rows.map(toBranchView) };
}

function normaliseEmail(email?: string): string | null {
  return email && email.trim() !== '' ? email.trim() : null;
}

async function assertCodeFree(code: string, exceptId?: string): Promise<void> {
  const clash = await prisma.branch.findFirst({
    where: { code, deletedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw ApiError.conflict('ລະຫັດສາຂານີ້ຖືກໃຊ້ແລ້ວ');
}

export async function createBranch(input: BranchCreateInput, auth?: AccessTokenPayload): Promise<BranchView> {
  await assertCodeFree(input.code);
  await assertManager(input.managerUserId, null);
  const data: Prisma.BranchCreateInput = {
    name: input.name,
    code: input.code,
    address: input.address,
    phone: input.phone,
    email: normaliseEmail(input.email),
    province: input.province ?? DEFAULT_PROVINCE,
    openTime: input.openTime,
    closeTime: input.closeTime,
    isActive: input.isActive,
    allowNegativeStock: input.allowNegativeStock,
    amenities: input.amenities ?? [],
    ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
    ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
    ...(hoursJson(input.weeklyHours) !== undefined ? { weeklyHours: hoursJson(input.weeklyHours) } : {}),
    ...(input.managerUserId ? { manager: { connect: { id: input.managerUserId } } } : {}),
    coverImageUrl: input.coverImageUrl ?? null,
    photoUrls: input.photoUrls ?? [],
    monthlyRevenueTarget: input.monthlyRevenueTarget ?? null,
    monthlyBookingTarget: input.monthlyBookingTarget ?? null,
  };
  const branch = await prisma.branch.create({ data, include: BRANCH_INCLUDE });
  const view = toBranchView(branch);
  await auditBranch(auth, 'created', branch.id, null, view);
  return view;
}

export async function updateBranch(id: string, input: BranchUpdateInput, auth?: AccessTokenPayload): Promise<BranchView> {
  const existing = await prisma.branch.findFirst({ where: { id, deletedAt: null }, include: BRANCH_INCLUDE });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບສາຂາ');
  if (input.managerUserId !== undefined) await assertManager(input.managerUserId, id);
  const hours = hoursJson(input.weeklyHours);
  if (input.code !== undefined) await assertCodeFree(input.code, id);
  if (input.isActive === false && !input.force) {
    const upcoming = await countUpcomingAppointments(id);
    if (upcoming > 0) {
      throw ApiError.conflict(`ສາຂານີ້ຍັງມີ ${upcoming} ນັດໝາຍທີ່ຈະມາເຖິງ — ຢືນຢັນກ່ອນປິດສາຂາ`);
    }
  }

  const branch = await prisma.branch.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: normaliseEmail(input.email) } : {}),
      ...(input.province !== undefined ? { province: input.province } : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
      ...(input.openTime !== undefined ? { openTime: input.openTime } : {}),
      ...(input.closeTime !== undefined ? { closeTime: input.closeTime } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.allowNegativeStock !== undefined ? { allowNegativeStock: input.allowNegativeStock } : {}),
      ...(input.amenities !== undefined ? { amenities: input.amenities } : {}),
      ...(hours !== undefined ? { weeklyHours: hours } : {}),
      ...(input.managerUserId !== undefined ? { managerUserId: input.managerUserId } : {}),
      ...(input.coverImageUrl !== undefined ? { coverImageUrl: input.coverImageUrl } : {}),
      ...(input.photoUrls !== undefined ? { photoUrls: input.photoUrls } : {}),
      ...(input.monthlyRevenueTarget !== undefined ? { monthlyRevenueTarget: input.monthlyRevenueTarget } : {}),
      ...(input.monthlyBookingTarget !== undefined ? { monthlyBookingTarget: input.monthlyBookingTarget } : {}),
    },
    include: BRANCH_INCLUDE,
  });
  const view = toBranchView(branch);
  await auditBranch(auth, 'updated', id, toBranchView(existing), view);
  return view;
}

/**
 * Wave 11 — ເກັບສາຂາເຂົ້າຄັງ (soft delete: deletedAt + ປິດ). ບໍ່ລຶບຂໍ້ມູນ — ລາຍງານເກົ່າຍັງອ້າງອີງໄດ້ ແລະ ກູ້ຄືນໄດ້.
 * ບັງຄັບຢືນຢັນ (force) ຖ້າຍັງມີນັດທີ່ຈະມາເຖິງ; ບໍ່ໃຫ້ເກັບສາຂາສຸດທ້າຍທີ່ເປີດຢູ່.
 */
export async function archiveBranch(id: string, force: boolean, auth?: AccessTokenPayload): Promise<BranchView> {
  const existing = await prisma.branch.findFirst({ where: { id, deletedAt: null }, include: BRANCH_INCLUDE });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບສາຂາ');
  const others = await prisma.branch.count({ where: { deletedAt: null, isActive: true, NOT: { id } } });
  if (others === 0) throw ApiError.conflict('ເກັບສາຂາສຸດທ້າຍທີ່ເປີດຢູ່ບໍ່ໄດ້');
  if (!force) {
    const upcoming = await countUpcomingAppointments(id);
    if (upcoming > 0) throw ApiError.conflict(`ສາຂານີ້ຍັງມີ ${upcoming} ນັດໝາຍທີ່ຈະມາເຖິງ — ຢືນຢັນກ່ອນເກັບເຂົ້າຄັງ`);
  }
  const branch = await prisma.branch.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
    include: BRANCH_INCLUDE,
  });
  const view = toBranchView(branch);
  await auditBranch(auth, 'archived', id, toBranchView(existing), view);
  return view;
}

export async function restoreBranch(id: string, auth?: AccessTokenPayload): Promise<BranchView> {
  const existing = await prisma.branch.findFirst({ where: { id, deletedAt: { not: null } }, include: BRANCH_INCLUDE });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບສາຂາທີ່ເກັບເຂົ້າຄັງ');
  if (existing.code) await assertCodeFree(existing.code, id);
  const branch = await prisma.branch.update({ where: { id }, data: { deletedAt: null }, include: BRANCH_INCLUDE });
  const view = toBranchView(branch);
  await auditBranch(auth, 'restored', id, toBranchView(existing), view);
  return view;
}

/** GET /branches/:id/history — ປະຫວັດ 100 ລາຍການຫຼ້າສຸດ. */
export async function branchHistory(id: string): Promise<BranchHistoryEntry[]> {
  const rows = await prisma.auditLog.findMany({
    where: { entityName: 'branch', entityId: id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { user: { select: { name: true } } },
  });
  return rows.map((r) => {
    const from = (r.oldValue ?? null) as Record<string, unknown> | null;
    const to = (r.newValue ?? null) as Record<string, unknown> | null;
    const changes =
      to && typeof to === 'object' && !Array.isArray(to) && from !== null
        ? Object.fromEntries(Object.keys(to).map((k) => [k, { from: from?.[k] ?? null, to: to[k] }]))
        : r.action === 'branch.created' && to
          ? Object.fromEntries(Object.keys(to).map((k) => [k, { from: null, to: to[k] }]))
          : null;
    return { id: r.id, action: r.action, at: r.createdAt.toISOString(), userName: r.user?.name ?? null, changes };
  });
}

// ---- branch closures ---------------------------------------------------

export async function listClosures(): Promise<{ items: BranchClosureView[] }> {
  const rows = await prisma.branchClosure.findMany({
    include: { branch: { select: { name: true } } },
    orderBy: { date: 'desc' },
  });
  return { items: rows.map(toClosureView) };
}

/**
 * `scopeBranchId` = ສາຂາຂອງ BRANCH_ADMIN — ເພີ່ມວັນປິດໄດ້ສະເພາະສາຂາຕົນ (ບໍ່ແມ່ນທົ່ວບໍລິສັດ).
 * SUPER_ADMIN ສົ່ງ undefined.
 */
export async function createClosure(
  input: BranchClosureCreateInput,
  scopeBranchId?: string,
): Promise<BranchClosureView> {
  const branchId = input.branchId === 'all' ? null : input.branchId;
  if (scopeBranchId !== undefined && branchId !== scopeBranchId) {
    throw ApiError.forbidden('ເພີ່ມວັນປິດໄດ້ສະເພາະສາຂາຂອງທ່ານ');
  }
  if (branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) throw ApiError.notFound('ບໍ່ພົບສາຂາ');
  }

  const date = new Date(`${input.date}T00:00:00.000Z`);
  const clash = await prisma.branchClosure.findFirst({
    where: { branchId, date },
    select: { id: true },
  });
  if (clash) throw ApiError.conflict('ວັນປິດຮ້ານນີ້ຖືກເພີ່ມແລ້ວ');

  const row = await prisma.branchClosure.create({
    data: { branchId, date, reason: input.reason },
    include: { branch: { select: { name: true } } },
  });
  return toClosureView(row);
}

export async function deleteClosure(id: string, scopeBranchId?: string): Promise<void> {
  const existing = await prisma.branchClosure.findUnique({
    where: { id },
    select: { id: true, branchId: true },
  });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບວັນປິດຮ້ານ');
  if (scopeBranchId !== undefined && existing.branchId !== scopeBranchId) {
    throw ApiError.forbidden('ລຶບໄດ້ສະເພາະວັນປິດຂອງສາຂາທ່ານ');
  }
  await prisma.branchClosure.delete({ where: { id } });
}

// ---- insights ------------------------------------------------------------

const DAY_MS = 24 * 60 * MINUTE_MS;
const LIVE_STATUSES = ['PENDING', 'CONFIRMED'] as const;

async function countUpcomingAppointments(branchId: string): Promise<number> {
  return prisma.appointment.count({
    where: {
      branchId,
      deletedAt: null,
      status: { in: [...LIVE_STATUSES] },
      startAt: { gte: new Date() },
    },
  });
}

/** ນາທີເປີດຕໍ່ມື້ຈາກ HH:mm (ຮອງຮັບປິດຫຼັງທ່ຽງຄືນ; open === close → 24 ຊມ). */
function openMinutesPerDay(open: string, close: string): number {
  let span = timeStringToMinutes(close) - timeStringToMinutes(open);
  if (span <= 0) span += 24 * 60;
  return span;
}

const round = (n: number, dp = 0) => Math.round(n * 10 ** dp) / 10 ** dp;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/**
 * GET /branches/insights — ຕົວຊີ້ວັດການດຳເນີນງານຕໍ່ສາຂາ ສຳລັບໜ້າ /branches.
 * ລາຍຮັບ = ຍອດນັດທີ່ COMPLETED ຕາມມື້ເລີ່ມນັດ (ສູດດຽວກັບ dashboard). ມື້ = ວຽງຈັນ.
 * `branchIds` undefined = ທຸກສາຂາ (SUPER_ADMIN); BRANCH_ADMIN ສົ່ງ [ສາຂາຕົນ].
 */
export async function getBranchInsights(
  days: number,
  branchIds?: string[],
  now: Date = new Date(),
): Promise<BranchInsightsView> {
  const branches = await prisma.branch.findMany({
    where: { deletedAt: null, ...(branchIds ? { id: { in: branchIds } } : {}) },
    select: { id: true, openTime: true, closeTime: true, monthlyRevenueTarget: true, monthlyBookingTarget: true },
  });
  const ids = branches.map((b) => b.id);
  const inIds = { in: ids };

  const today = vientianeDayRangeOf(now);
  const periodStart = new Date(today.start.getTime() - (days - 1) * DAY_MS);
  const prevStart = new Date(periodStart.getTime() - days * DAY_MS);
  const todayKey = vientianeDateKey(now);
  const closureUntil = new Date(todayKey.getTime() + 60 * DAY_MS);

  const [
    appts,
    staff,
    rooms,
    equipment,
    services,
    globalServices,
    queue,
    reviews,
    upcoming,
    lowStock,
    outstanding,
    closures,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: { branchId: inIds, deletedAt: null, startAt: { gte: prevStart, lt: today.end } },
      select: {
        branchId: true,
        startAt: true,
        endAt: true,
        status: true,
        totalAmount: true,
        customerId: true,
      },
    }),
    prisma.staffBranch.groupBy({
      by: ['branchId'],
      where: { branchId: inIds, staffProfile: { deletedAt: null } },
      _count: { _all: true },
    }),
    prisma.room.groupBy({
      by: ['branchId', 'isAvailable'],
      where: { branchId: inIds },
      _count: { _all: true },
    }),
    prisma.equipment.groupBy({
      by: ['branchId'],
      where: { branchId: inIds },
      _count: { _all: true },
    }),
    prisma.service.groupBy({
      by: ['branchId'],
      where: { branchId: inIds, isActive: true, deletedAt: null },
      _count: { _all: true },
    }),
    // ບໍລິການທີ່ບໍ່ຜູກສາຂາ = ມີໃຫ້ທຸກສາຂາ
    prisma.service.count({ where: { branchId: null, isActive: true, deletedAt: null } }),
    prisma.queueTicket.groupBy({
      by: ['branchId'],
      where: {
        branchId: inIds,
        status: { in: ['WAITING', 'CALLED'] },
        createdAt: { gte: today.start, lt: today.end },
      },
      _count: { _all: true },
    }),
    prisma.review.findMany({
      where: { createdAt: { gte: periodStart }, appointment: { branchId: inIds } },
      select: { rating: true, appointment: { select: { branchId: true } } },
    }),
    prisma.appointment.groupBy({
      by: ['branchId'],
      where: {
        branchId: inIds,
        deletedAt: null,
        status: { in: [...LIVE_STATUSES] },
        startAt: { gte: now },
      },
      _count: { _all: true },
    }),
    ids.length === 0
      ? Promise.resolve([] as { branchId: string; n: bigint }[])
      : prisma.$queryRaw<{ branchId: string; n: bigint }[]>`
          SELECT "branchId", COUNT(*) AS n FROM "products"
          WHERE "isActive" = true AND "deletedAt" IS NULL AND "stockQty" <= "minStockQty"
            AND "branchId" IN (${Prisma.join(ids)})
          GROUP BY "branchId"`,
    ids.length === 0
      ? Promise.resolve([] as { branchId: string; bills: bigint; outstanding: Prisma.Decimal | null }[])
      : prisma.$queryRaw<{ branchId: string; bills: bigint; outstanding: Prisma.Decimal | null }[]>`
          SELECT p."branchId",
            COUNT(*) FILTER (WHERE p."totalAmount" - COALESCE(paid.amount, 0) > 0) AS bills,
            COALESCE(SUM(GREATEST(p."totalAmount" - COALESCE(paid.amount, 0), 0)), 0) AS outstanding
          FROM "payments" p
          LEFT JOIN LATERAL (
            SELECT SUM(pt."amount") AS amount FROM "payment_transactions" pt
            WHERE pt."paymentId" = p."id" AND pt."status" = 'SUCCESS'
          ) paid ON true
          WHERE p."paymentStatus" IN ('PENDING', 'DEPOSIT_PAID') AND p."branchId" IN (${Prisma.join(ids)})
          GROUP BY p."branchId"`,
    prisma.branchClosure.findMany({
      where: {
        date: { gte: todayKey, lt: closureUntil },
        OR: [{ branchId: null }, { branchId: inIds }],
      },
      orderBy: { date: 'asc' },
      select: { id: true, branchId: true, date: true, reason: true },
    }),
  ]);

  const countBy = <T extends { branchId: string | null; _count: { _all: number } }>(rows: T[]) => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.branchId) m.set(r.branchId, (m.get(r.branchId) ?? 0) + r._count._all);
    return m;
  };
  const staffBy = countBy(staff);
  const equipBy = countBy(equipment);
  const serviceBy = countBy(services);
  const queueBy = countBy(queue);
  const upcomingBy = countBy(upcoming);
  const lowStockBy = new Map(lowStock.map((r) => [r.branchId, Number(r.n)]));
  const billsBy = new Map(
    outstanding.map((r) => [r.branchId, { bills: Number(r.bills), amount: Number(r.outstanding ?? 0) }]),
  );

  // Wave 11 — ຄວາມຄືບໜ້າເປົ້າເດືອນ: ນັດ COMPLETED ແຕ່ວັນທີ 1 ຂອງເດືອນ (ວຽງຈັນ).
  const todayVte = vientianeDateKey(now);
  const monthStart = new Date(today.start.getTime() - (todayVte.getUTCDate() - 1) * DAY_MS);
  const daysInMonth = new Date(Date.UTC(todayVte.getUTCFullYear(), todayVte.getUTCMonth() + 1, 0)).getUTCDate();
  const monthRows = await prisma.appointment.groupBy({
    by: ['branchId'],
    where: { branchId: inIds, deletedAt: null, status: 'COMPLETED', startAt: { gte: monthStart, lt: today.end } },
    _sum: { totalAmount: true },
    _count: { _all: true },
  });
  const monthBy = new Map(monthRows.map((r) => [r.branchId, { revenue: r._sum.totalAmount?.toNumber() ?? 0, completed: r._count._all }]));

  const nowMs = now.getTime();
  const items: BranchInsight[] = branches.map((b) => {
    const mine = appts.filter((a) => a.branchId === b.id);
    const inRange = (from: Date, to: Date) =>
      mine.filter((a) => a.startAt >= from && a.startAt < to);
    const period = inRange(periodStart, today.end);
    const prev = inRange(prevStart, periodStart);
    const todays = inRange(today.start, today.end);
    const completed = (rows: typeof mine) => rows.filter((a) => a.status === 'COMPLETED');
    const revenue = (rows: typeof mine) =>
      completed(rows).reduce((s, a) => s + a.totalAmount.toNumber(), 0);
    const booked = (rows: typeof mine) =>
      rows
        .filter((a) => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW')
        .reduce((s, a) => s + Math.max(0, a.endAt.getTime() - a.startAt.getTime()) / MINUTE_MS, 0);

    const staffCount = staffBy.get(b.id) ?? 0;
    const dayCapacity = staffCount * openMinutesPerDay(b.openTime, b.closeTime);
    const util = (minutes: number, nDays: number) =>
      dayCapacity > 0 ? round(Math.min(1.5, minutes / (dayCapacity * nDays)), 3) : null;

    const daily = Array.from({ length: days }, (_, i) => {
      const from = new Date(periodStart.getTime() + i * DAY_MS);
      return revenue(inRange(from, new Date(from.getTime() + DAY_MS)));
    });

    const periodCompleted = completed(period);
    const periodRevenue = revenue(period);
    const ratings = reviews.filter((r) => r.appointment.branchId === b.id).map((r) => r.rating);
    const roomRows = rooms.filter((r) => r.branchId === b.id);

    return {
      branchId: b.id,
      staffCount,
      roomCount: roomRows.reduce((s, r) => s + r._count._all, 0),
      roomsAvailable: roomRows.filter((r) => r.isAvailable).reduce((s, r) => s + r._count._all, 0),
      equipmentCount: equipBy.get(b.id) ?? 0,
      serviceCount: (serviceBy.get(b.id) ?? 0) + globalServices,
      today: {
        appointments: todays.length,
        completed: completed(todays).length,
        inProgress: todays.filter((a) => a.status === 'IN_PROGRESS').length,
        upcoming: todays.filter(
          (a) => (a.status === 'PENDING' || a.status === 'CONFIRMED') && a.startAt.getTime() >= nowMs,
        ).length,
        revenue: revenue(todays),
        queueWaiting: queueBy.get(b.id) ?? 0,
        utilization: util(booked(todays), 1),
      },
      period: {
        bookings: period.length,
        completed: periodCompleted.length,
        cancelled: period.filter((a) => a.status === 'CANCELLED').length,
        noShow: period.filter((a) => a.status === 'NO_SHOW').length,
        revenue: periodRevenue,
        revenuePrev: revenue(prev),
        bookingsPrev: prev.length,
        avgTicket: periodCompleted.length ? Math.round(periodRevenue / periodCompleted.length) : 0,
        customers: new Set(period.map((a) => a.customerId)).size,
        utilization: util(booked(period), days),
        daily,
      },
      rating: {
        avg: ratings.length ? round(ratings.reduce((s, r) => s + r, 0) / ratings.length, 2) : null,
        count: ratings.length,
      },
      upcomingAppointments: upcomingBy.get(b.id) ?? 0,
      lowStock: lowStockBy.get(b.id) ?? 0,
      outstandingBills: billsBy.get(b.id)?.bills ?? 0,
      outstandingAmount: billsBy.get(b.id)?.amount ?? 0,
      month: {
        revenue: monthBy.get(b.id)?.revenue ?? 0,
        completed: monthBy.get(b.id)?.completed ?? 0,
        revenueTarget: b.monthlyRevenueTarget ? b.monthlyRevenueTarget.toNumber() : null,
        bookingTarget: b.monthlyBookingTarget,
        dayOfMonth: todayVte.getUTCDate(),
        daysInMonth,
      },
      closures: closures
        .filter((c) => c.branchId === null || c.branchId === b.id)
        .slice(0, 5)
        .map((c) => ({ id: c.id, date: ymd(c.date), reason: c.reason, companyWide: c.branchId === null })),
    };
  });

  return {
    days,
    from: ymd(vientianeDateKey(periodStart)),
    to: ymd(todayKey),
    generatedAt: now.toISOString(),
    items,
  };
}
