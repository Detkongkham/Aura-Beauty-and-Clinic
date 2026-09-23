import type {
  AccessTokenPayload,
  AssignTransferAccountInput,
  BankAccountInsight,
  BankAccountInsightsQuery,
  BankAccountInsightsView,
  PaymentProviderView,
  SlipSettings,
  UpdatePaymentProviderInput,
  UnassignedTransfer,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { env } from '../../config/env.js';
import {
  SLIP_AMOUNT_TOLERANCE_SETTING_KEY,
  SLIP_AUTO_APPROVE_SETTING_KEY,
  SLIP_BRANCH_SLA_SETTING_KEY,
  SLIP_SLA_ALERT_SETTING_KEY,
  SLIP_SLA_SETTING_KEY,
  DEFAULT_SLIP_SLA_MINUTES,
} from '../../constants/paymentsTreasury.js';
import { ApiError } from '../../utils/ApiError.js';
import { vientianeDateKey, vientianeDayStart } from '../../utils/dateHelpers.js';
import { round2, toNum } from '../../utils/money.js';
import { scopeBranchId } from './payments-treasury.service.js';
import { accountMatches } from './slips/matcher.js';

/** ໂມດູນ 39 W5 — ການຕັ້ງຄ່າ provider/ສະລິບ ແລະ ກະທົບຍອດ (ໜ້າ web-admin «ການຊຳລະເງິນ»). */

const DAY_MS = 24 * 60 * 60_000;
/** ທ່າຄ່າຄວາມຄາດເຄື່ອນ (ກີບ) ທີ່ຖືວ່າກົງກັນ. */
const VARIANCE_EPSILON = 0.01;
/** ຜົນ webhook ທີ່ຕ້ອງໃຫ້ຄົນກວດ. */
const ISSUE_RESULTS = ['AMOUNT_MISMATCH', 'OVERPAY', 'UNKNOWN_INTENT', 'PROVIDER_MISMATCH'] as const;

function dateToKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Providers ────────────────────────────────────────────────────────

function secretConfigured(p: { mode: string; webhookSecretRef: string | null }): boolean {
  if (p.webhookSecretRef) return Boolean(process.env[p.webhookSecretRef]);
  return p.mode === 'MOCK' && Boolean(env.PAYMENT_WEBHOOK_SECRET);
}

export async function listProviders(): Promise<PaymentProviderView[]> {
  const since = new Date(Date.now() - 7 * DAY_MS);
  const [providers, pending, lastEvents, issues] = await Promise.all([
    prisma.paymentProvider.findMany({ orderBy: { code: 'asc' } }),
    prisma.providerIntent.groupBy({
      by: ['providerCode'],
      where: { status: 'PENDING', expiresAt: { gt: new Date() } },
      _count: { _all: true },
    }),
    prisma.providerEvent.groupBy({ by: ['providerCode'], _max: { createdAt: true } }),
    prisma.providerEvent.groupBy({
      by: ['providerCode'],
      where: {
        createdAt: { gte: since },
        OR: [{ result: { in: [...ISSUE_RESULTS] } }, { processedAt: null }],
      },
      _count: { _all: true },
    }),
  ]);
  return providers.map((p) => ({
    code: p.code,
    nameLo: p.nameLo,
    nameEn: p.nameEn,
    mode: p.mode === 'LIVE' ? 'LIVE' : 'MOCK',
    feeRate: p.feeRate,
    settlesNet: p.settlesNet,
    isActive: p.isActive,
    secretConfigured: secretConfigured(p),
    webhookPath: `/api/v1/payments/webhooks/${p.code}`,
    pendingIntents: pending.find((x) => x.providerCode === p.code)?._count._all ?? 0,
    lastEventAt: lastEvents.find((x) => x.providerCode === p.code)?._max.createdAt?.toISOString() ?? null,
    recentIssues: issues.find((x) => x.providerCode === p.code)?._count._all ?? 0,
  }));
}

export async function updateProvider(
  auth: AccessTokenPayload,
  code: string,
  input: UpdatePaymentProviderInput,
): Promise<PaymentProviderView> {
  const existing = await prisma.paymentProvider.findUnique({ where: { code } });
  if (!existing) throw ApiError.notFound(`ບໍ່ພົບ provider: ${code}`);
  const updated = await prisma.paymentProvider.update({
    where: { code },
    data: {
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.feeRate !== undefined ? { feeRate: input.feeRate } : {}),
      ...(input.settlesNet !== undefined ? { settlesNet: input.settlesNet } : {}),
    },
  });
  await prisma.auditLog.create({
    data: {
      userId: auth.sub,
      action: 'UPDATE',
      entityName: 'PaymentProvider',
      entityId: updated.id,
      oldValue: { isActive: existing.isActive, feeRate: existing.feeRate, settlesNet: existing.settlesNet } as never,
      newValue: { isActive: updated.isActive, feeRate: updated.feeRate, settlesNet: updated.settlesNet } as never,
    },
  });
  const view = (await listProviders()).find((p) => p.code === code);
  return view!;
}

// ── Slip settings ────────────────────────────────────────────────────

const SLIP_SETTING_KEYS = [
  SLIP_AUTO_APPROVE_SETTING_KEY,
  SLIP_AMOUNT_TOLERANCE_SETTING_KEY,
  SLIP_SLA_SETTING_KEY,
  SLIP_BRANCH_SLA_SETTING_KEY,
  SLIP_SLA_ALERT_SETTING_KEY,
];

export async function getSlipSettings(): Promise<SlipSettings> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: SLIP_SETTING_KEYS } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const tol = Number(byKey.get(SLIP_AMOUNT_TOLERANCE_SETTING_KEY));
  const sla = Number(byKey.get(SLIP_SLA_SETTING_KEY));
  const rawBranch = byKey.get(SLIP_BRANCH_SLA_SETTING_KEY);
  const branchSlaMinutes: Record<string, number> = {};
  if (rawBranch && typeof rawBranch === 'object' && !Array.isArray(rawBranch)) {
    for (const [k, v] of Object.entries(rawBranch as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isInteger(n) && n >= 5) branchSlaMinutes[k] = n;
    }
  }
  return {
    autoApprove: byKey.get(SLIP_AUTO_APPROVE_SETTING_KEY) === true,
    amountTolerance: Number.isFinite(tol) && tol > 0 ? tol : 0,
    reviewSlaMinutes: Number.isInteger(sla) && sla >= 5 ? sla : DEFAULT_SLIP_SLA_MINUTES,
    branchSlaMinutes,
    // ເປີດເປັນຄ່າເລີ່ມຕົ້ນ — ປິດໄດ້ໃນ Settings
    slaAlertEnabled: byKey.get(SLIP_SLA_ALERT_SETTING_KEY) !== false,
  };
}

/** SLA (ນາທີ) ຂອງສາຂາໜຶ່ງ — override ຂອງສາຂາ ຫຼື ຄ່າເລີ່ມຕົ້ນ. */
export function slaForBranch(settings: SlipSettings, branchId: string | null | undefined): number {
  return (branchId && settings.branchSlaMinutes[branchId]) || settings.reviewSlaMinutes;
}

export async function updateSlipSettings(
  auth: AccessTokenPayload,
  input: Partial<SlipSettings>,
): Promise<SlipSettings> {
  const before = await getSlipSettings();
  const writes: [string, Prisma.InputJsonValue | undefined][] = [
    [SLIP_AUTO_APPROVE_SETTING_KEY, input.autoApprove],
    [SLIP_AMOUNT_TOLERANCE_SETTING_KEY, input.amountTolerance],
    [SLIP_SLA_SETTING_KEY, input.reviewSlaMinutes],
    [SLIP_BRANCH_SLA_SETTING_KEY, input.branchSlaMinutes],
    [SLIP_SLA_ALERT_SETTING_KEY, input.slaAlertEnabled],
  ];
  if (input.branchSlaMinutes) {
    const ids = Object.keys(input.branchSlaMinutes);
    const found = ids.length ? await prisma.branch.count({ where: { id: { in: ids } } }) : 0;
    if (found !== ids.length) throw ApiError.badRequest('ມີສາຂາທີ່ບໍ່ຖືກຕ້ອງໃນ SLA ແຍກຕາມສາຂາ');
  }
  await prisma.$transaction(
    writes
      .filter((w): w is [string, Prisma.InputJsonValue] => w[1] !== undefined)
      .map(([key, value]) => prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } })),
  );
  const after = await getSlipSettings();
  await prisma.auditLog.create({
    data: {
      userId: auth.sub,
      action: 'UPDATE',
      entityName: 'SlipSettings',
      oldValue: before as never,
      newValue: after as never,
    },
  });
  return after;
}

// ── Bank-account insights (ໜ້າ /payments/banks) ──────────────────────

const BANK_TENDERS = ['BANK_TRANSFER', 'BANK_QR'] as const;
const OPEN_SLIP_VERDICTS = ['PENDING', 'AUTO_MATCHED', 'NEEDS_REVIEW'] as const;

/**
 * ກິດຈະກຳຕໍ່ບັນຊີຮັບເງິນ ສຳລັບ `days` ມື້ຫຼ້າສຸດ (ວຽງຈັນ, ລວມມື້ນີ້): ເງິນເຂົ້າ/ອອກ, ເສັ້ນລາຍວັນ,
 * ສະລິບ/intent ທີ່ຄ້າງ ແລະ ສະຖານະກະທົບຍອດ. ນັບທຸກບັນຊີ (ລວມທີ່ປິດແລ້ວ) ເພາະເງິນອາດເຂົ້າກ່ອນປິດ.
 */
export async function getBankAccountInsights(
  auth: AccessTokenPayload,
  query: BankAccountInsightsQuery,
): Promise<BankAccountInsightsView> {
  const branchId = scopeBranchId(auth, query.branchId);
  const days = query.days;
  const todayKey = vientianeDateKey(new Date());
  const fromKey = new Date(todayKey.getTime() - (days - 1) * DAY_MS);
  const prevFromKey = new Date(fromKey.getTime() - days * DAY_MS);
  const rangeStart = vientianeDayStart(fromKey);
  const prevStart = vientianeDayStart(prevFromKey);
  const todayStart = vientianeDayStart(todayKey);
  const rangeEnd = new Date(todayStart.getTime() + DAY_MS);

  const accounts = await prisma.bankAccount.findMany({
    where: branchId ? { branchId } : {},
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);
  const now = new Date();

  const [txs, prevTotals, lastTx, expenses, statements, lastStatements, slips, intents, unassigned] =
    await Promise.all([
      prisma.paymentTransaction.findMany({
        where: {
          bankAccountId: { in: accountIds },
          status: 'SUCCESS',
          method: { in: [...BANK_TENDERS] },
          createdAt: { gte: rangeStart, lt: rangeEnd },
        },
        select: { bankAccountId: true, amount: true, createdAt: true },
      }),
      prisma.paymentTransaction.groupBy({
        by: ['bankAccountId'],
        where: {
          bankAccountId: { in: accountIds },
          status: 'SUCCESS',
          method: { in: [...BANK_TENDERS] },
          createdAt: { gte: prevStart, lt: rangeStart },
        },
        _sum: { amount: true },
      }),
      prisma.paymentTransaction.groupBy({
        by: ['bankAccountId'],
        where: { bankAccountId: { in: accountIds }, status: 'SUCCESS', method: { in: [...BANK_TENDERS] } },
        _max: { createdAt: true },
      }),
      prisma.expense.findMany({
        where: { paidFromAccountId: { in: accountIds }, status: 'PAID', paidAt: { gte: rangeStart, lt: rangeEnd } },
        select: { paidFromAccountId: true, amount: true, paidAt: true },
      }),
      prisma.bankStatementEntry.findMany({
        where: { bankAccountId: { in: accountIds }, statementDate: { gte: fromKey, lte: todayKey } },
        select: { bankAccountId: true, statementDate: true, statementCredit: true, statementDebit: true },
      }),
      prisma.bankStatementEntry.groupBy({
        by: ['bankAccountId'],
        where: { bankAccountId: { in: accountIds } },
        _max: { statementDate: true },
      }),
      prisma.paymentSlip.groupBy({
        by: ['bankAccountId'],
        where: { bankAccountId: { in: accountIds }, verdict: { in: [...OPEN_SLIP_VERDICTS] } },
        _count: { _all: true },
      }),
      prisma.providerIntent.groupBy({
        by: ['bankAccountId'],
        where: { bankAccountId: { in: accountIds }, status: 'PENDING', expiresAt: { gt: now } },
        _count: { _all: true },
      }),
      prisma.paymentTransaction.aggregate({
        where: {
          bankAccountId: null,
          status: 'SUCCESS',
          method: { in: [...BANK_TENDERS] },
          createdAt: { gte: rangeStart, lt: rangeEnd },
          ...(branchId ? { payment: { branchId } } : {}),
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

  const dayIndex = (at: Date) => Math.round((vientianeDateKey(at).getTime() - fromKey.getTime()) / DAY_MS);
  const todayIdx = days - 1;

  type Acc = BankAccountInsight & { credit: Map<number, number>; debit: Map<number, number> };
  const byId = new Map<string, Acc>(
    accountIds.map((id) => [
      id,
      {
        bankAccountId: id,
        receivedToday: 0,
        receivedTodayCount: 0,
        receivedPeriod: 0,
        receivedPeriodCount: 0,
        receivedPrevPeriod: round2(toNum(prevTotals.find((p) => p.bankAccountId === id)?._sum.amount ?? 0)),
        paidOutPeriod: 0,
        paidOutPeriodCount: 0,
        daily: Array.from({ length: days }, () => 0),
        lastReceivedAt: lastTx.find((p) => p.bankAccountId === id)?._max.createdAt?.toISOString() ?? null,
        openSlips: slips.find((p) => p.bankAccountId === id)?._count._all ?? 0,
        pendingIntents: intents.find((p) => p.bankAccountId === id)?._count._all ?? 0,
        lastStatementDate: (() => {
          const d = lastStatements.find((p) => p.bankAccountId === id)?._max.statementDate;
          return d ? dateToKey(d) : null;
        })(),
        unreconciledDays: 0,
        varianceDays: 0,
        credit: new Map(),
        debit: new Map(),
      },
    ]),
  );

  for (const t of txs) {
    const a = byId.get(t.bankAccountId!);
    if (!a) continue;
    const i = dayIndex(t.createdAt);
    if (i < 0 || i >= days) continue;
    const amt = toNum(t.amount);
    a.daily[i] = (a.daily[i] ?? 0) + amt;
    a.receivedPeriod += amt;
    a.receivedPeriodCount += 1;
    if (i === todayIdx) {
      a.receivedToday += amt;
      a.receivedTodayCount += 1;
    }
    a.credit.set(i, (a.credit.get(i) ?? 0) + amt);
  }
  for (const e of expenses) {
    const a = byId.get(e.paidFromAccountId!);
    if (!a) continue;
    const i = dayIndex(e.paidAt!);
    if (i < 0 || i >= days) continue;
    const amt = toNum(e.amount);
    a.paidOutPeriod += amt;
    a.paidOutPeriodCount += 1;
    a.debit.set(i, (a.debit.get(i) ?? 0) + amt);
  }
  // ກະທົບຍອດ — ກົດດຽວກັບ getReconciliation (ມື້ທີ່ມີເງິນເຄື່ອນໄຫວ ຫຼື ມີ statement)
  const stmtIdx = new Map<string, Map<number, { credit: number; debit: number }>>();
  for (const s of statements) {
    const i = Math.round((s.statementDate.getTime() - fromKey.getTime()) / DAY_MS);
    let m = stmtIdx.get(s.bankAccountId);
    if (!m) stmtIdx.set(s.bankAccountId, (m = new Map()));
    m.set(i, { credit: toNum(s.statementCredit), debit: toNum(s.statementDebit) });
  }
  for (const a of byId.values()) {
    const stmts = stmtIdx.get(a.bankAccountId) ?? new Map();
    const activeDays = new Set<number>([...a.credit.keys(), ...a.debit.keys(), ...stmts.keys()]);
    for (const i of activeDays) {
      const st = stmts.get(i);
      if (!st) {
        a.unreconciledDays += 1;
        continue;
      }
      const cv = Math.abs(st.credit - round2(a.credit.get(i) ?? 0));
      const dv = Math.abs(st.debit - round2(a.debit.get(i) ?? 0));
      if (cv > VARIANCE_EPSILON || dv > VARIANCE_EPSILON) a.varianceDays += 1;
    }
  }

  const list: BankAccountInsight[] = [...byId.values()].map(({ credit: _c, debit: _d, ...a }) => ({
    ...a,
    receivedToday: round2(a.receivedToday),
    receivedPeriod: round2(a.receivedPeriod),
    paidOutPeriod: round2(a.paidOutPeriod),
    daily: a.daily.map(round2),
  }));

  const totals = list.reduce(
    (t, a) => {
      t.receivedToday += a.receivedToday;
      t.receivedTodayCount += a.receivedTodayCount;
      t.receivedPeriod += a.receivedPeriod;
      t.receivedPeriodCount += a.receivedPeriodCount;
      t.receivedPrevPeriod += a.receivedPrevPeriod;
      t.paidOutPeriod += a.paidOutPeriod;
      t.openSlips += a.openSlips;
      t.pendingIntents += a.pendingIntents;
      t.unreconciledDays += a.unreconciledDays;
      t.varianceDays += a.varianceDays;
      a.daily.forEach((v, i) => (t.daily[i] = (t.daily[i] ?? 0) + v));
      return t;
    },
    {
      receivedToday: 0,
      receivedTodayCount: 0,
      receivedPeriod: 0,
      receivedPeriodCount: 0,
      receivedPrevPeriod: 0,
      paidOutPeriod: 0,
      openSlips: 0,
      pendingIntents: 0,
      unreconciledDays: 0,
      varianceDays: 0,
      daily: Array.from({ length: days }, () => 0),
    },
  );

  return {
    days,
    from: dateToKey(fromKey),
    to: dateToKey(todayKey),
    accounts: list,
    totals: {
      ...totals,
      receivedToday: round2(totals.receivedToday),
      receivedPeriod: round2(totals.receivedPeriod),
      receivedPrevPeriod: round2(totals.receivedPrevPeriod),
      paidOutPeriod: round2(totals.paidOutPeriod),
      daily: totals.daily.map(round2),
    },
    unassigned: { amount: round2(toNum(unassigned._sum.amount ?? 0)), count: unassigned._count._all },
  };
}

// ── Unassigned bank transfers ────────────────────────────────────────

/** ຫຼາຍສຸດທີ່ຄືນຕໍ່ຄັ້ງ — ລາຍການເກົ່າທີ່ຄ້າງຄວນໜ້ອຍ ແລະ ຈະຫຼຸດລົງເມື່ອຜູກບັນຊີ. */
const UNASSIGNED_LIMIT = 200;

export async function listUnassignedTransfers(
  auth: AccessTokenPayload,
  query: { branchId?: string },
): Promise<UnassignedTransfer[]> {
  const branchId = scopeBranchId(auth, query.branchId);
  const rows = await prisma.paymentTransaction.findMany({
    where: {
      bankAccountId: null,
      status: 'SUCCESS',
      method: { in: [...BANK_TENDERS] },
      ...(branchId ? { payment: { branchId } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: UNASSIGNED_LIMIT,
    select: {
      id: true,
      paymentId: true,
      method: true,
      amount: true,
      currency: true,
      qrReference: true,
      createdAt: true,
      slip: { select: { id: true, receiverAccount: true } },
      payment: { select: { branchId: true, branch: { select: { name: true } } } },
    },
  });
  const branchIds = [...new Set(rows.map((r) => r.payment.branchId))];
  const accounts = branchIds.length
    ? await prisma.bankAccount.findMany({
        where: { branchId: { in: branchIds }, isActive: true },
        select: { id: true, branchId: true, accountNumber: true },
      })
    : [];
  return rows.map((r) => {
    const own = accounts.filter((a) => a.branchId === r.payment.branchId);
    const token = (r.slip?.receiverAccount ?? '').replace(/\D/g, '');
    const hits = token ? own.filter((a) => accountMatches(token, a.accountNumber)) : [];
    const suggested = hits.length === 1 ? hits[0]!.id : own.length === 1 ? own[0]!.id : null;
    return {
      id: r.id,
      paymentId: r.paymentId,
      method: r.method as UnassignedTransfer['method'],
      amount: toNum(r.amount),
      currency: r.currency,
      reference: r.qrReference,
      createdAt: r.createdAt.toISOString(),
      branchId: r.payment.branchId,
      branchName: r.payment.branch.name,
      receiverAccount: r.slip?.receiverAccount ?? null,
      slipId: r.slip?.id ?? null,
      suggestedAccountId: suggested,
    };
  });
}

/**
 * ຜູກບັນຊີໃຫ້ເງິນໂອນທີ່ຍັງບໍ່ມີ. ຍອມສະເພາະ null → ບັນຊີ (ບໍ່ຍ້າຍລາຍການທີ່ຜູກແລ້ວ ເພາະຈະປ່ຽນຍອດທີ່
 * ກະທົບແລ້ວຂອງບັນຊີເດີມ). ບັນຊີຕ້ອງເປັນຂອງສາຂາທີ່ອອກບິນ; ບັນທຶກ audit.
 */
export async function assignTransferAccount(
  auth: AccessTokenPayload,
  txId: string,
  input: AssignTransferAccountInput,
): Promise<void> {
  const tx = await prisma.paymentTransaction.findUnique({
    where: { id: txId },
    select: { id: true, method: true, status: true, bankAccountId: true, payment: { select: { branchId: true } } },
  });
  if (!tx) throw ApiError.notFound('ບໍ່ພົບລາຍການ');
  scopeBranchId(auth, tx.payment.branchId);
  if (!(BANK_TENDERS as readonly string[]).includes(tx.method) || tx.status !== 'SUCCESS') {
    throw ApiError.badRequest('ຜູກບັນຊີໄດ້ສະເພາະເງິນໂອນທະນາຄານທີ່ສຳເລັດແລ້ວ');
  }
  const account = await prisma.bankAccount.findUnique({
    where: { id: input.bankAccountId },
    select: { branchId: true },
  });
  if (!account || account.branchId !== tx.payment.branchId) {
    throw ApiError.badRequest('ບັນຊີນີ້ບໍ່ແມ່ນຂອງສາຂາທີ່ອອກບິນ');
  }
  const claimed = await prisma.paymentTransaction.updateMany({
    where: { id: txId, bankAccountId: null },
    data: { bankAccountId: input.bankAccountId },
  });
  if (claimed.count === 0) throw ApiError.conflict('ລາຍການນີ້ຜູກບັນຊີແລ້ວ');
  await prisma.paymentSlip.updateMany({
    where: { paymentTransactionId: txId, bankAccountId: null },
    data: { bankAccountId: input.bankAccountId },
  });
  await prisma.auditLog.create({
    data: {
      branchId: tx.payment.branchId,
      userId: auth.sub,
      action: 'UPDATE',
      entityName: 'PaymentTransaction',
      entityId: txId,
      oldValue: { bankAccountId: null } as never,
      newValue: { bankAccountId: input.bankAccountId } as never,
    },
  });
}
