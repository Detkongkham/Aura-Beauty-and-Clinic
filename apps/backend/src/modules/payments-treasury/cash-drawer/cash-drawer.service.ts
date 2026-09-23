import type {
  AccessTokenPayload,
  CashDrawerMovementInput,
  CashDrawerSessionView,
  CashVarianceQuery,
  CashVarianceReport,
  CashVarianceRow,
  ZReportView,
  CloseCashDrawerInput,
  OpenCashDrawerInput,
} from '@abcp/shared-types';
import { LAK_DENOMINATIONS } from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ApiError } from '../../../utils/ApiError.js';
import { vientianeDayStart } from '../../../utils/dateHelpers.js';
import { nextDocumentNo } from '../../../utils/documentNumbers.js';
import { round2, toNum } from '../../../utils/money.js';
import { scopeBranchId } from '../payments-treasury.service.js';

/**
 * ໂມດູນ 39 G10 — ລິ້ນຊັກເງິນສົດ: ຍອດທີ່ຄວນມີ = ເງິນທອນຕອນເປີດ + ຂາຍເງິນສົດ − ຄືນເງິນສົດ + PAYIN − DROP − PAYOUT.
 * ປິດກະດ້ວຍການນັບໃບເງິນ → ສ່ວນຕ່າງ (+ ເກີນ / − ຂາດ) ບັນທຶກພ້ອມຜູ້ນັບ ແລະ ໝາຍເຫດ (ບັງຄັບເມື່ອມີສ່ວນຕ່າງ).
 */

const SESSION_INCLUDE = { movements: { orderBy: { createdAt: 'asc' } } } as const satisfies Prisma.CashDrawerSessionInclude;
type SessionRow = Prisma.CashDrawerSessionGetPayload<{ include: typeof SESSION_INCLUDE }>;

async function cashFlows(branchId: string, currency: string, from: Date, to: Date) {
  const [sales, refunds] = await Promise.all([
    prisma.paymentTransaction.aggregate({
      where: { method: 'CASH', status: 'SUCCESS', currency, createdAt: { gte: from, lt: to }, payment: { branchId } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.refund.aggregate({
      where: { method: 'CASH', status: 'PAID', paidAt: { gte: from, lt: to }, payment: { branchId, currency } },
      _sum: { amount: true },
    }),
  ]);
  return {
    cashSales: round2(toNum(sales._sum.amount ?? 0)),
    cashSalesCount: sales._count._all,
    cashRefunds: round2(toNum(refunds._sum.amount ?? 0)),
  };
}

async function toView(s: SessionRow): Promise<CashDrawerSessionView> {
  const end = s.closedAt ?? new Date();
  const [flows, users, branch] = await Promise.all([
    cashFlows(s.branchId, s.currency, s.openedAt, end),
    prisma.user.findMany({
      where: { id: { in: [s.openedById, s.closedById, ...s.movements.map((m) => m.createdById)].filter((x): x is string => Boolean(x)) } },
      select: { id: true, name: true },
    }),
    prisma.branch.findUnique({ where: { id: s.branchId }, select: { name: true } }),
  ]);
  const name = new Map(users.map((u) => [u.id, u.name]));
  const sum = (type: string) => round2(s.movements.filter((m) => m.type === type).reduce((n, m) => n + toNum(m.amount), 0));
  const payIns = sum('PAYIN');
  const drops = sum('DROP');
  const payouts = sum('PAYOUT');
  const live = round2(toNum(s.openingFloat) + flows.cashSales - flows.cashRefunds + payIns - drops - payouts);
  return {
    id: s.id,
    branchId: s.branchId,
    branchName: branch?.name ?? '',
    currency: s.currency,
    status: s.status,
    openedAt: s.openedAt.toISOString(),
    openedByName: name.get(s.openedById) ?? null,
    openingFloat: toNum(s.openingFloat),
    openingNote: s.openingNote,
    closedAt: s.closedAt?.toISOString() ?? null,
    closedByName: s.closedById ? (name.get(s.closedById) ?? null) : null,
    ...flows,
    payIns,
    drops,
    payouts,
    expectedAmount: s.expectedAmount != null ? toNum(s.expectedAmount) : live,
    countedAmount: s.countedAmount != null ? toNum(s.countedAmount) : null,
    variance: s.variance != null ? toNum(s.variance) : null,
    denominations: (s.denominations as Record<string, number> | null) ?? null,
    closingNote: s.closingNote,
    movements: s.movements.map((m) => ({
      id: m.id,
      type: m.type,
      amount: toNum(m.amount),
      note: m.note,
      createdByName: name.get(m.createdById) ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

async function loadScoped(auth: AccessTokenPayload, id: string): Promise<SessionRow> {
  const s = await prisma.cashDrawerSession.findUnique({ where: { id }, include: SESSION_INCLUDE });
  if (!s) throw ApiError.notFound('ບໍ່ພົບກະລິ້ນຊັກ');
  scopeBranchId(auth, s.branchId);
  return s;
}

function requireBranch(auth: AccessTokenPayload, branchId?: string): string {
  const b = scopeBranchId(auth, branchId);
  if (!b) throw ApiError.badRequest('ຕ້ອງເລືອກສາຂາ');
  return b;
}

export async function currentSession(auth: AccessTokenPayload, branchId?: string): Promise<CashDrawerSessionView | null> {
  const b = requireBranch(auth, branchId);
  const s = await prisma.cashDrawerSession.findFirst({ where: { branchId: b, status: 'OPEN' }, include: SESSION_INCLUDE });
  return s ? toView(s) : null;
}

export async function listSessions(auth: AccessTokenPayload, branchId?: string, limit = 30): Promise<CashDrawerSessionView[]> {
  const b = scopeBranchId(auth, branchId);
  const rows = await prisma.cashDrawerSession.findMany({
    where: { ...(b ? { branchId: b } : {}) },
    orderBy: { openedAt: 'desc' },
    take: Math.min(limit, 100),
    include: SESSION_INCLUDE,
  });
  return Promise.all(rows.map(toView));
}

export async function openSession(auth: AccessTokenPayload, input: OpenCashDrawerInput): Promise<CashDrawerSessionView> {
  const branchId = requireBranch(auth, input.branchId);
  try {
    const s = await prisma.cashDrawerSession.create({
      data: { branchId, openedById: auth.sub, openingFloat: input.openingFloat, openingNote: input.note ?? null },
      include: SESSION_INCLUDE,
    });
    await prisma.auditLog.create({
      data: { branchId, userId: auth.sub, action: 'OPEN', entityName: 'CashDrawerSession', entityId: s.id, newValue: { float: input.openingFloat } as never },
    });
    return toView(s);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('ລິ້ນຊັກຂອງສາຂານີ້ເປີດຢູ່ແລ້ວ — ປິດກະເກົ່າກ່ອນ');
    }
    throw err;
  }
}

export async function addMovement(auth: AccessTokenPayload, id: string, input: CashDrawerMovementInput): Promise<CashDrawerSessionView> {
  const s = await loadScoped(auth, id);
  if (s.status !== 'OPEN') throw ApiError.conflict('ກະນີ້ປິດແລ້ວ');
  await prisma.cashDrawerMovement.create({
    data: { sessionId: id, type: input.type, amount: input.amount, note: input.note ?? null, createdById: auth.sub },
  });
  await prisma.auditLog.create({
    data: { branchId: s.branchId, userId: auth.sub, action: input.type, entityName: 'CashDrawerSession', entityId: id, newValue: input as never },
  });
  return toView(await loadScoped(auth, id));
}

export async function closeSession(auth: AccessTokenPayload, id: string, input: CloseCashDrawerInput): Promise<CashDrawerSessionView> {
  const s = await loadScoped(auth, id);
  if (s.status !== 'OPEN') throw ApiError.conflict('ກະນີ້ປິດແລ້ວ');
  const allowed = new Set(LAK_DENOMINATIONS.map(String));
  let counted: number;
  if (input.denominations) {
    for (const k of Object.keys(input.denominations)) if (!allowed.has(k)) throw ApiError.badRequest(`ລາຄາໃບເງິນບໍ່ຖືກຕ້ອງ: ${k}`);
    counted = round2(Object.entries(input.denominations).reduce((n, [k, q]) => n + Number(k) * q, 0));
    if (input.countedAmount !== undefined && Math.abs(input.countedAmount - counted) > 0.01) {
      throw ApiError.badRequest('ຍອດລວມບໍ່ກົງກັບຈຳນວນໃບເງິນ');
    }
  } else counted = round2(input.countedAmount!);
  const closedAt = new Date();
  const view = await toView({ ...s, closedAt });
  const expected = view.expectedAmount;
  const variance = round2(counted - expected);
  if (Math.abs(variance) > 0.01 && !input.note) throw ApiError.badRequest('ມີສ່ວນຕ່າງ — ຕ້ອງຂຽນໝາຍເຫດ');
  // ປິດແບບມີເງື່ອນໄຂ status=OPEN ກັນການປິດຊ້ຳພ້ອມກັນ. Wave 10C: ອອກເລກ Z + snapshot Z-report ໃນ transaction ດຽວກັນ
  // (ເລກ Z ຕໍ່ເນື່ອງບໍ່ຂາດ; ຖ້າສ້າງ report ລົ້ມ ກະກໍບໍ່ຖືກປິດ).
  await prisma.$transaction(async (tx) => {
    const done = await tx.cashDrawerSession.updateMany({
      where: { id, status: 'OPEN' },
      data: {
        status: 'CLOSED',
        closedById: auth.sub,
        closedAt,
        expectedAmount: expected,
        countedAmount: counted,
        variance,
        denominations: (input.denominations ?? undefined) as never,
        closingNote: input.note ?? null,
      },
    });
    if (done.count === 0) throw ApiError.conflict('ກະນີ້ປິດແລ້ວ');
    const zNo = await nextDocumentNo(tx, s.branchId, 'Z', closedAt);
    const closedView: CashDrawerSessionView = {
      ...view,
      status: 'CLOSED',
      closedAt: closedAt.toISOString(),
      closedByName: (await tx.user.findUnique({ where: { id: auth.sub }, select: { name: true } }))?.name ?? null,
      expectedAmount: expected,
      countedAmount: counted,
      variance,
      denominations: (input.denominations as Record<string, number> | undefined) ?? null,
      closingNote: input.note ?? null,
    };
    const z = await buildZReport(tx, closedView, { zNo, live: false, start: s.openedAt, end: closedAt });
    await tx.cashDrawerSession.update({ where: { id }, data: { zNo, zReport: z as unknown as Prisma.InputJsonValue } });
  });
  await prisma.auditLog.create({
    data: {
      branchId: s.branchId,
      userId: auth.sub,
      action: 'CLOSE',
      entityName: 'CashDrawerSession',
      entityId: id,
      newValue: { expected, counted, variance, note: input.note ?? null } as never,
    },
  });
  return toView(await loadScoped(auth, id));
}

// ---- Wave 10C: Z-report ---------------------------------------------

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Z-report = ສະຫຼຸບກະ: ຍອດຮັບແຍກວິທີຈ່າຍ, ຊ່ວງເລກໃບຮັບເງິນ, ໃບຄືນເງິນ, void, ແລະ ການນັບເງິນສົດ (expected/counted/variance).
 * ຕອນປິດກະ ຖືກ snapshot ລົງ `zReport` — ຫຼັງປິດ ບິນ/ຍອດຂອງກະນັ້ນຢືນຢັນຄືນໄດ້ ແລະ ບໍ່ປ່ຽນ (ການແກ້ຫຼັງປິດ = ໃບຄືນເງິນ CN
 * ໃນກະ/ວັນໃໝ່ ບໍ່ແມ່ນການແກ້ບິນເກົ່າ).
 */
async function buildZReport(
  db: Db,
  v: CashDrawerSessionView,
  opts: { zNo: string | null; live: boolean; start: Date; end: Date },
): Promise<ZReportView> {
  const win = { gte: opts.start, lt: opts.end };
  const [tx, invoices, refunds, voids] = await Promise.all([
    db.paymentTransaction.groupBy({
      by: ['method'],
      where: { status: 'SUCCESS', currency: v.currency, createdAt: win, payment: { branchId: v.branchId } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.payment.findMany({
      where: { branchId: v.branchId, currency: v.currency, paidAt: win, invoiceNo: { not: null } },
      select: { invoiceNo: true, totalAmount: true, netAmount: true, taxAmount: true },
      orderBy: { invoiceNo: 'asc' },
    }),
    db.refund.findMany({
      where: { status: 'PAID', paidAt: win, payment: { branchId: v.branchId, currency: v.currency } },
      select: { amount: true, storeCreditAmount: true, taxAmount: true, creditNoteNo: true },
      orderBy: { creditNoteNo: 'asc' },
    }),
    db.payment.count({ where: { branchId: v.branchId, voidedAt: win } }),
  ]);
  const sales = tx
    .map((r) => ({ method: r.method as string, count: r._count._all, amount: toNum(r._sum.amount) }))
    .sort((a, b) => b.amount - a.amount);
  const grossSum = round2(invoices.reduce((n, i) => n + toNum(i.totalAmount), 0));
  const taxSum = round2(invoices.reduce((n, i) => n + toNum(i.taxAmount), 0));
  const netSum = round2(invoices.reduce((n, i) => n + (i.netAmount != null ? toNum(i.netAmount) : toNum(i.totalAmount)), 0));
  const payout = round2(refunds.reduce((n, r) => n + toNum(r.amount), 0));
  const store = round2(refunds.reduce((n, r) => n + toNum(r.storeCreditAmount), 0));
  return {
    sessionId: v.id,
    zNo: opts.zNo,
    isLive: opts.live,
    branchName: v.branchName,
    currency: v.currency,
    openedAt: v.openedAt,
    openedByName: v.openedByName,
    closedAt: v.closedAt,
    closedByName: v.closedByName,
    sales,
    salesTotal: round2(sales.reduce((n, r) => n + r.amount, 0)),
    invoices: {
      count: invoices.length,
      first: invoices[0]?.invoiceNo ?? null,
      last: invoices[invoices.length - 1]?.invoiceNo ?? null,
      gross: grossSum,
      net: netSum,
      tax: taxSum,
    },
    refunds: {
      count: refunds.length,
      total: round2(payout + store),
      payout,
      storeCredit: store,
      tax: round2(refunds.reduce((n, r) => n + toNum(r.taxAmount), 0)),
      firstCreditNote: refunds.find((r) => r.creditNoteNo)?.creditNoteNo ?? null,
      lastCreditNote: [...refunds].reverse().find((r) => r.creditNoteNo)?.creditNoteNo ?? null,
    },
    voids,
    cash: {
      openingFloat: v.openingFloat,
      cashSales: v.cashSales,
      cashRefunds: v.cashRefunds,
      payIns: v.payIns,
      drops: v.drops,
      payouts: v.payouts,
      expected: v.expectedAmount,
      counted: v.countedAmount,
      variance: v.variance,
      denominations: v.denominations,
      note: v.closingNote,
    },
    generatedAt: new Date().toISOString(),
  };
}

export async function getZReport(auth: AccessTokenPayload, id: string): Promise<ZReportView> {
  const s = await loadScoped(auth, id);
  if (s.status === 'CLOSED' && s.zReport) return s.zReport as unknown as ZReportView;
  const view = await toView(s);
  return buildZReport(prisma, view, { zNo: s.zNo, live: s.status === 'OPEN', start: s.openedAt, end: s.closedAt ?? new Date() });
}

// ---- Wave 10C: ລາຍງານ over/short (ຫາການທຸຈະລິດ) --------------------------

export async function varianceReport(auth: AccessTokenPayload, q: CashVarianceQuery): Promise<CashVarianceReport> {
  const branchId = scopeBranchId(auth, q.branchId);
  const from = vientianeDayStart(new Date(q.from));
  const to = new Date(vientianeDayStart(new Date(q.to)).getTime() + 86_400_000);
  const rows = await prisma.cashDrawerSession.findMany({
    where: { status: 'CLOSED', closedAt: { gte: from, lt: to }, ...(branchId ? { branchId } : {}) },
    select: { branchId: true, closedById: true, variance: true },
  });
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.closedById).filter((x): x is string => Boolean(x)))] } },
    select: { id: true, name: true },
  });
  const branches = await prisma.branch.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.branchId))] } }, select: { id: true, name: true } });
  const uname = new Map(users.map((u) => [u.id, u.name]));
  const bname = new Map(branches.map((b) => [b.id, b.name]));

  const fold = (keyOf: (r: (typeof rows)[number]) => string, nameOf: (k: string) => string): CashVarianceRow[] => {
    const m = new Map<string, CashVarianceRow>();
    for (const r of rows) {
      const k = keyOf(r);
      const v = toNum(r.variance);
      const row = m.get(k) ?? { key: k, name: nameOf(k), sessions: 0, sessionsWithVariance: 0, over: 0, short: 0, net: 0, worst: 0 };
      row.sessions += 1;
      if (Math.abs(v) > 0.01) row.sessionsWithVariance += 1;
      if (v > 0) row.over += v;
      if (v < 0) row.short += -v;
      row.net += v;
      if (Math.abs(v) > Math.abs(row.worst)) row.worst = v;
      m.set(k, row);
    }
    return [...m.values()].sort((a, b) => a.net - b.net);
  };
  const variances = rows.map((r) => toNum(r.variance));
  return {
    from: q.from,
    to: q.to,
    totalSessions: rows.length,
    net: round2(variances.reduce((n, v) => n + v, 0)),
    over: round2(variances.filter((v) => v > 0).reduce((n, v) => n + v, 0)),
    short: round2(-variances.filter((v) => v < 0).reduce((n, v) => n + v, 0)),
    byStaff: fold((r) => r.closedById ?? 'unknown', (k) => uname.get(k) ?? '—'),
    byBranch: fold((r) => r.branchId, (k) => bname.get(k) ?? '—'),
  };
}
