import { createHash } from 'node:crypto';
import type {
  AccessTokenPayload,
  ClosePeriodInput,
  MatchLineInput,
  PeriodReadiness,
  ReconSettings,
  ReconciliationAccount,
  ReconciliationDayDetail,
  ReconciliationDayQuery,
  ReconciliationIssue,
  ReconciliationPeriodView,
  ReconciliationQuery,
  ReconciliationRow,
  ReconciliationTotals,
  ReconciliationView,
  ResolveStatementInput,
  ResolveStatementsBulkInput,
  StatementHistoryEntry,
  StatementImportInput,
  StatementImportPreview,
  StatementImportResult,
  StatementMapping,
  UpsertBankStatementInput,
  VarianceResolution,
} from '@abcp/shared-types';
import { statementMappingSchema } from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../config/database.js';
import { ApiError } from '../../../utils/ApiError.js';
import { vientianeDateKey, vientianeDayStart } from '../../../utils/dateHelpers.js';
import { round2, toNum } from '../../../utils/money.js';
import { notifyUser } from '../../../services/push.js';
import { scopeBranchId } from '../payments-treasury.service.js';
import { detectMapping, parseCsv, parseStatement } from './csv.js';
import { autoMatch, loadCandidates } from './matcher.js';
import {
  BANK_TENDERS,
  DAY_MS,
  DEFAULT_ALERT_THRESHOLD,
  ISSUE_RESULTS,
  OPEN_SLIP_VERDICTS,
  RECON_ALERT_THRESHOLD_SETTING_KEY,
  RECON_REMINDER_SETTING_KEY,
  VARIANCE_EPSILON,
  assertNotLocked,
  assertRange,
  dateToKey,
  keyToDate,
  lockedMonths,
  monthOf,
  monthsInRange,
  todayKeyVientiane,
} from './recon.util.js';

/**
 * ໂມດູນ 39 — ກະທົບຍອດທະນາຄານ: ລະບົບ (tender BANK_* + ລາຍຈ່າຍ + refund) ທຽບກັບ statement ຂອງທະນາຄານ.
 * statement ມາຈາກການພິມຍອດລວມຕໍ່ມື້ (MANUAL) ຫຼື ນຳເຂົ້າ CSV ເປັນແຖວ (IMPORT) ທີ່ຈັບຄູ່ໄດ້ລາຍການຕໍ່ລາຍການ.
 */

// ── Row building ─────────────────────────────────────────────────────

type RowAccount = {
  id: string;
  accountName: string;
  accountNumber: string;
  currency: string;
  branchId: string;
  branch: { name: string };
  bank: { code: string };
};
type Bucket = { credit: number; creditN: number; fee: number; debit: number; debitN: number };
type StatementRecord = {
  id: string;
  statementCredit: Prisma.Decimal;
  statementDebit: Prisma.Decimal;
  openingBalance: Prisma.Decimal | null;
  closingBalance: Prisma.Decimal | null;
  note: string | null;
  source: 'MANUAL' | 'IMPORT';
  resolution: VarianceResolution | null;
  resolutionNote: string | null;
  resolvedAt: Date | null;
  resolvedById: string | null;
  enteredById: string;
  updatedAt: Date;
};
type RowExtras = {
  users: Map<string, string>;
  lines?: { total: number; unmatched: number };
  locked: boolean;
};

const emptyBucket = (): Bucket => ({ credit: 0, creditN: 0, fee: 0, debit: 0, debitN: 0 });

function buildRow(acct: RowAccount, date: string, b: Bucket, stmt: StatementRecord | null, x: RowExtras): ReconciliationRow {
  const systemCredit = round2(b.credit);
  const systemDebit = round2(b.debit);
  const systemFee = round2(b.fee);
  const expectedCredit = round2(systemCredit - systemFee);
  const statementCredit = stmt ? toNum(stmt.statementCredit) : null;
  const statementDebit = stmt ? toNum(stmt.statementDebit) : null;
  const creditVariance = statementCredit === null ? null : round2(statementCredit - expectedCredit);
  const debitVariance = statementDebit === null ? null : round2(statementDebit - systemDebit);
  const openingBalance = stmt?.openingBalance != null ? toNum(stmt.openingBalance) : null;
  const closingBalance = stmt?.closingBalance != null ? toNum(stmt.closingBalance) : null;
  const balanceGap =
    openingBalance != null && closingBalance != null && statementCredit != null && statementDebit != null
      ? round2(closingBalance - (openingBalance + statementCredit - statementDebit))
      : null;
  const off = stmt ? Math.abs(creditVariance!) > VARIANCE_EPSILON || Math.abs(debitVariance!) > VARIANCE_EPSILON : false;
  const status: ReconciliationRow['status'] = !stmt ? 'UNRECONCILED' : !off ? 'MATCHED' : stmt.resolution ? 'RESOLVED' : 'VARIANCE';
  return {
    date,
    bankAccountId: acct.id,
    accountName: acct.accountName,
    accountNumber: acct.accountNumber,
    bankCode: acct.bank.code,
    branchId: acct.branchId,
    branchName: acct.branch.name,
    currency: acct.currency,
    systemCredit,
    systemCreditCount: b.creditN,
    systemDebit,
    systemDebitCount: b.debitN,
    statementId: stmt?.id ?? null,
    statementCredit,
    statementDebit,
    note: stmt?.note ?? null,
    creditVariance,
    debitVariance,
    status,
    enteredByName: stmt ? (x.users.get(stmt.enteredById) ?? null) : null,
    enteredAt: stmt ? stmt.updatedAt.toISOString() : null,
    systemFee,
    expectedCredit,
    openingBalance,
    closingBalance,
    balanceGap,
    openingGap: null,
    source: stmt?.source ?? 'MANUAL',
    resolution: off ? (stmt?.resolution ?? null) : null,
    resolutionNote: off ? (stmt?.resolutionNote ?? null) : null,
    resolvedByName: off && stmt?.resolvedById ? (x.users.get(stmt.resolvedById) ?? null) : null,
    resolvedAt: off && stmt?.resolvedAt ? stmt.resolvedAt.toISOString() : null,
    lineCount: x.lines?.total ?? 0,
    unmatchedLines: x.lines?.unmatched ?? 0,
    locked: x.locked,
  };
}

const ACCOUNT_SELECT = {
  id: true,
  accountName: true,
  accountNumber: true,
  currency: true,
  branchId: true,
  isActive: true,
  isDefault: true,
  branch: { select: { name: true } },
  bank: { select: { code: true } },
} as const;

async function userNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!unique.length) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

const zeroTotals = (): ReconciliationTotals => ({
  systemCredit: 0,
  systemDebit: 0,
  systemFee: 0,
  statementCredit: 0,
  statementDebit: 0,
  matched: 0,
  variance: 0,
  resolved: 0,
  unreconciled: 0,
});

function addToTotals(t: ReconciliationTotals, r: ReconciliationRow): void {
  t.systemCredit += r.systemCredit;
  t.systemDebit += r.systemDebit;
  t.systemFee += r.systemFee;
  t.statementCredit += r.statementCredit ?? 0;
  t.statementDebit += r.statementDebit ?? 0;
  if (r.status === 'MATCHED') t.matched += 1;
  else if (r.status === 'VARIANCE') t.variance += 1;
  else if (r.status === 'RESOLVED') t.resolved += 1;
  else t.unreconciled += 1;
}

function roundTotals(t: ReconciliationTotals): ReconciliationTotals {
  return {
    ...t,
    systemCredit: round2(t.systemCredit),
    systemDebit: round2(t.systemDebit),
    systemFee: round2(t.systemFee),
    statementCredit: round2(t.statementCredit),
    statementDebit: round2(t.statementDebit),
  };
}

/** ແຖວກະທົບຍອດຂອງບັນຊີຊຸດໜຶ່ງ ໃນຊ່ວງ [fromKey, toKey] — ໃຊ້ຮ່ວມກັນໂດຍ view, day, readiness, reminder. */
async function computeRows(accounts: RowAccount[], fromKey: string, toKey: string): Promise<ReconciliationRow[]> {
  if (!accounts.length) return [];
  const accountIds = accounts.map((a) => a.id);
  const fromDate = keyToDate(fromKey);
  const toDate = keyToDate(toKey);
  const rangeStart = vientianeDayStart(fromDate);
  const rangeEnd = new Date(vientianeDayStart(toDate).getTime() + DAY_MS);

  const [txs, expenses, refunds, statements, prevClosings, lineGroups] = await Promise.all([
    prisma.paymentTransaction.findMany({
      where: {
        bankAccountId: { in: accountIds },
        status: 'SUCCESS',
        method: { in: [...BANK_TENDERS] },
        createdAt: { gte: rangeStart, lt: rangeEnd },
      },
      select: {
        bankAccountId: true,
        amount: true,
        createdAt: true,
        providerIntent: { select: { provider: { select: { feeRate: true, settlesNet: true } } } },
      },
    }),
    prisma.expense.findMany({
      where: { paidFromAccountId: { in: accountIds }, status: 'PAID', paidAt: { gte: rangeStart, lt: rangeEnd } },
      select: { paidFromAccountId: true, amount: true, paidAt: true },
    }),
    prisma.refund.findMany({
      where: { bankAccountId: { in: accountIds }, status: 'PAID', paidAt: { gte: rangeStart, lt: rangeEnd } },
      select: { bankAccountId: true, amount: true, paidAt: true },
    }),
    prisma.bankStatementEntry.findMany({
      where: { bankAccountId: { in: accountIds }, statementDate: { gte: fromDate, lte: toDate } },
    }),
    // closing ຂອງ statement ຫຼ້າສຸດກ່ອນຊ່ວງ — ໃຊ້ກວດຄວາມຕໍ່ເນື່ອງຂອງມື້ທຳອິດ (G4).
    prisma.bankStatementEntry.findMany({
      where: { bankAccountId: { in: accountIds }, statementDate: { lt: fromDate }, closingBalance: { not: null } },
      orderBy: { statementDate: 'desc' },
      distinct: ['bankAccountId'],
      select: { bankAccountId: true, closingBalance: true },
    }),
    prisma.bankStatementLine.groupBy({
      by: ['bankAccountId', 'statementDate', 'matchStatus'],
      where: { bankAccountId: { in: accountIds }, statementDate: { gte: fromDate, lte: toDate } },
      _count: { _all: true },
    }),
  ]);

  const buckets = new Map<string, Bucket>();
  const bucketOf = (accountId: string, date: string): Bucket => {
    const k = `${date}|${accountId}`;
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = emptyBucket()));
    return b;
  };
  for (const t of txs) {
    const b = bucketOf(t.bankAccountId!, dateToKey(vientianeDateKey(t.createdAt)));
    const amt = toNum(t.amount);
    b.credit += amt;
    b.creditN += 1;
    const p = t.providerIntent?.provider;
    if (p?.settlesNet) b.fee += round2(amt * p.feeRate);
  }
  for (const e of expenses) {
    const b = bucketOf(e.paidFromAccountId!, dateToKey(vientianeDateKey(e.paidAt!)));
    b.debit += toNum(e.amount);
    b.debitN += 1;
  }
  for (const r of refunds) {
    const b = bucketOf(r.bankAccountId!, dateToKey(vientianeDateKey(r.paidAt!)));
    b.debit += toNum(r.amount);
    b.debitN += 1;
  }
  const stmtByKey = new Map(statements.map((s) => [`${dateToKey(s.statementDate)}|${s.bankAccountId}`, s]));
  const lineByKey = new Map<string, { total: number; unmatched: number }>();
  for (const g of lineGroups) {
    const k = `${dateToKey(g.statementDate)}|${g.bankAccountId}`;
    const cur = lineByKey.get(k) ?? { total: 0, unmatched: 0 };
    cur.total += g._count._all;
    if (g.matchStatus === 'UNMATCHED') cur.unmatched += g._count._all;
    lineByKey.set(k, cur);
  }
  for (const k of [...stmtByKey.keys(), ...lineByKey.keys()]) if (!buckets.has(k)) buckets.set(k, emptyBucket());

  const users = await userNames(statements.flatMap((s) => [s.enteredById, s.resolvedById]));
  const locks = await lockedMonths(
    [...new Set(accounts.map((a) => a.branchId))],
    monthsInRange(fromKey, toKey),
  );
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const rows: ReconciliationRow[] = [];
  for (const [k, b] of buckets) {
    const [date, accountId] = k.split('|') as [string, string];
    const acct = accountById.get(accountId)!;
    rows.push(
      buildRow(acct, date, b, (stmtByKey.get(k) as StatementRecord | undefined) ?? null, {
        users,
        lines: lineByKey.get(k),
        locked: locks.has(`${acct.branchId}|${monthOf(date)}`),
      }),
    );
  }

  // G4 — ຄວາມຕໍ່ເນື່ອງ: opening ຂອງມື້ນີ້ ທຽບກັບ closing ຂອງ statement ກ່ອນໜ້າ.
  const prevByAccount = new Map(prevClosings.map((p) => [p.bankAccountId, toNum(p.closingBalance)]));
  const asc = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  for (const r of asc) {
    const prev = prevByAccount.get(r.bankAccountId);
    if (r.openingBalance != null && prev != null) r.openingGap = round2(r.openingBalance - prev);
    if (r.closingBalance != null) prevByAccount.set(r.bankAccountId, r.closingBalance);
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.accountName.localeCompare(b.accountName));
  return rows;
}

// ── View ─────────────────────────────────────────────────────────────

export async function getReconciliation(auth: AccessTokenPayload, query: ReconciliationQuery): Promise<ReconciliationView> {
  const branchId = scopeBranchId(auth, query.branchId);
  const { fromDate, toDate } = assertRange(query.from, query.to);
  const rangeStart = vientianeDayStart(fromDate);
  const rangeEnd = new Date(vientianeDayStart(toDate).getTime() + DAY_MS);

  const accounts = await prisma.bankAccount.findMany({
    where: {
      ...(branchId ? { branchId } : {}),
      ...(query.bankAccountId ? { id: query.bankAccountId } : {}),
    },
    select: ACCOUNT_SELECT,
    orderBy: [{ isDefault: 'desc' }, { accountName: 'asc' }],
  });
  const accountIds = accounts.map((a) => a.id);
  const rows = await computeRows(accounts, query.from, query.to);

  const totals = zeroTotals();
  const byCurrency: Record<string, ReconciliationTotals> = {};
  for (const r of rows) {
    addToTotals(totals, r);
    addToTotals((byCurrency[r.currency] ??= zeroTotals()), r);
  }
  const totalsByCurrency = Object.fromEntries(Object.entries(byCurrency).map(([c, t]) => [c, roundTotals(t)]));

  const openSlips = await prisma.paymentSlip.count({
    where: { verdict: { in: [...OPEN_SLIP_VERDICTS] }, ...(branchId ? { branchId } : {}) },
  });

  const events = await prisma.providerEvent.findMany({
    where: {
      createdAt: { gte: rangeStart, lt: rangeEnd },
      OR: [{ result: { in: [...ISSUE_RESULTS] } }, { processedAt: null }],
      ...(branchId ? { providerIntent: { payment: { branchId } } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, providerCode: true, eventId: true, result: true, payload: true, createdAt: true },
  });
  const issues: ReconciliationIssue[] = events.map((e) => {
    const payload = (e.payload ?? {}) as { amount?: unknown; reference?: unknown };
    const amount = Number(payload.amount);
    return {
      id: e.id,
      providerCode: e.providerCode,
      eventId: e.eventId,
      result: e.result,
      amount: Number.isFinite(amount) ? amount : null,
      reference: typeof payload.reference === 'string' ? payload.reference : null,
      createdAt: e.createdAt.toISOString(),
    };
  });

  const lastStatements = accountIds.length
    ? await prisma.bankStatementEntry.groupBy({
        by: ['bankAccountId'],
        where: { bankAccountId: { in: accountIds } },
        _max: { statementDate: true },
      })
    : [];
  const lastByAccount = new Map(lastStatements.map((l) => [l.bankAccountId, l._max.statementDate]));
  const accountViews: ReconciliationAccount[] = accounts.map((a) => {
    const last = lastByAccount.get(a.id);
    return {
      bankAccountId: a.id,
      accountName: a.accountName,
      accountNumber: a.accountNumber,
      bankCode: a.bank.code,
      branchId: a.branchId,
      branchName: a.branch.name,
      currency: a.currency,
      isActive: a.isActive,
      isDefault: a.isDefault,
      lastStatementDate: last ? dateToKey(last) : null,
    };
  });

  const periods = await listPeriodsFor(
    [...new Set(accounts.map((a) => a.branchId))],
    monthsInRange(query.from, query.to),
  );

  return {
    from: query.from,
    to: query.to,
    rows,
    totals: roundTotals(totals),
    totalsByCurrency,
    periods,
    openSlips,
    issues,
    accounts: accountViews,
  };
}

// ── Day detail ───────────────────────────────────────────────────────

async function scopedAccount(auth: AccessTokenPayload, bankAccountId: string) {
  const acct = await prisma.bankAccount.findUnique({ where: { id: bankAccountId }, select: ACCOUNT_SELECT });
  if (!acct) throw ApiError.notFound('ບໍ່ພົບບັນຊີທະນາຄານ');
  scopeBranchId(auth, acct.branchId);
  return acct;
}

export async function getReconciliationDay(
  auth: AccessTokenPayload,
  query: ReconciliationDayQuery,
): Promise<ReconciliationDayDetail> {
  const acct = await scopedAccount(auth, query.bankAccountId);
  const { fromDate } = assertRange(query.date, query.date);
  const dayStart = vientianeDayStart(fromDate);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  const [rows, txs, expenses, refunds, slipRows, lines] = await Promise.all([
    computeRows([acct], query.date, query.date),
    prisma.paymentTransaction.findMany({
      where: { bankAccountId: acct.id, status: 'SUCCESS', method: { in: [...BANK_TENDERS] }, createdAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        amount: true,
        method: true,
        qrReference: true,
        createdAt: true,
        paymentId: true,
        slip: { select: { id: true, txnRef: true } },
        providerIntent: { select: { reference: true, providerCode: true, provider: { select: { feeRate: true, settlesNet: true } } } },
        payment: {
          select: {
            appointmentId: true,
            appointment: { select: { customer: { select: { name: true } }, service: { select: { name: true } } } },
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: { paidFromAccountId: acct.id, status: 'PAID', paidAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { paidAt: 'asc' },
      select: {
        id: true,
        amount: true,
        title: true,
        paidAt: true,
        paidReference: true,
        category: { select: { nameLo: true, nameEn: true } },
        supplier: { select: { name: true } },
      },
    }),
    prisma.refund.findMany({
      where: { bankAccountId: acct.id, status: 'PAID', paidAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { paidAt: 'asc' },
      select: { id: true, amount: true, reason: true, paidAt: true, providerRef: true },
    }),
    prisma.paymentSlip.findMany({
      where: {
        createdAt: { gte: dayStart, lt: dayEnd },
        OR: [{ bankAccountId: acct.id }, { bankAccountId: null, branchId: acct.branchId }],
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        verdict: true,
        amount: true,
        declaredAmount: true,
        txnRef: true,
        senderName: true,
        transferredAt: true,
        createdAt: true,
        paymentId: true,
      },
    }),
    prisma.bankStatementLine.findMany({
      where: { bankAccountId: acct.id, statementDate: fromDate },
      orderBy: [{ postedAt: 'asc' }, { seq: 'asc' }],
    }),
  ]);

  const lineByTx = new Map(lines.filter((l) => l.matchedTxId).map((l) => [l.matchedTxId!, l.id]));
  const lineByExp = new Map(lines.filter((l) => l.matchedExpenseId).map((l) => [l.matchedExpenseId!, l.id]));
  const lineByRefund = new Map(lines.filter((l) => l.matchedRefundId).map((l) => [l.matchedRefundId!, l.id]));
  // ແຖວ statement ທີ່ຈັບຄູ່ກັບລາຍການມື້ອື່ນ (±1) ກໍສະແດງ matchedLineId ຂອງລາຍການມື້ນີ້ຖ້າຢູ່ມື້ອື່ນ.
  const crossDay = await prisma.bankStatementLine.findMany({
    where: {
      bankAccountId: acct.id,
      statementDate: { not: fromDate },
      OR: [
        { matchedTxId: { in: txs.map((t) => t.id) } },
        { matchedExpenseId: { in: expenses.map((e) => e.id) } },
        { matchedRefundId: { in: refunds.map((r) => r.id) } },
      ],
    },
    select: { id: true, matchedTxId: true, matchedExpenseId: true, matchedRefundId: true },
  });
  for (const l of crossDay) {
    if (l.matchedTxId) lineByTx.set(l.matchedTxId, l.id);
    if (l.matchedExpenseId) lineByExp.set(l.matchedExpenseId, l.id);
    if (l.matchedRefundId) lineByRefund.set(l.matchedRefundId, l.id);
  }

  const row =
    rows[0] ??
    buildRow(acct, query.date, emptyBucket(), null, {
      users: new Map(),
      locked: (await lockedMonths([acct.branchId], [monthOf(query.date)])).size > 0,
    });

  return {
    row,
    credits: txs.map((t) => {
      const amount = toNum(t.amount);
      const p = t.providerIntent?.provider;
      return {
        id: t.id,
        fee: p?.settlesNet ? round2(amount * p.feeRate) : 0,
        providerCode: t.providerIntent?.providerCode ?? null,
        matchedLineId: lineByTx.get(t.id) ?? null,
        at: t.createdAt.toISOString(),
        amount,
        method: t.method,
        reference: t.slip?.txnRef ?? t.providerIntent?.reference ?? t.qrReference ?? null,
        paymentId: t.paymentId,
        appointmentId: t.payment.appointmentId,
        customerName: t.payment.appointment?.customer.name ?? null,
        serviceName: t.payment.appointment?.service.name ?? null,
        slipId: t.slip?.id ?? null,
      };
    }),
    debits: [
      ...expenses.map((e) => ({
        id: e.id,
        kind: 'EXPENSE' as const,
        matchedLineId: lineByExp.get(e.id) ?? null,
        at: e.paidAt!.toISOString(),
        amount: toNum(e.amount),
        title: e.title,
        categoryLo: e.category.nameLo,
        categoryEn: e.category.nameEn,
        supplierName: e.supplier?.name ?? null,
        reference: e.paidReference,
      })),
      ...refunds.map((r) => ({
        id: r.id,
        kind: 'REFUND' as const,
        matchedLineId: lineByRefund.get(r.id) ?? null,
        at: r.paidAt!.toISOString(),
        amount: toNum(r.amount),
        title: r.reason,
        categoryLo: 'ຄືນເງິນລູກຄ້າ',
        categoryEn: 'Customer refund',
        supplierName: null,
        reference: r.providerRef,
      })),
    ].sort((a, b) => a.at.localeCompare(b.at)),
    lines: lines.map((l) => ({
      id: l.id,
      seq: l.seq,
      postedAt: l.postedAt?.toISOString() ?? null,
      direction: l.direction,
      amount: toNum(l.amount),
      balance: l.balance != null ? toNum(l.balance) : null,
      description: l.description,
      reference: l.reference,
      matchStatus: l.matchStatus,
      matchedKind: l.matchedTxId ? 'TX' : l.matchedExpenseId ? 'EXPENSE' : l.matchedRefundId ? 'REFUND' : null,
      matchedId: l.matchedTxId ?? l.matchedExpenseId ?? l.matchedRefundId ?? null,
      autoMatched: l.matchStatus === 'MATCHED' && !l.matchedById,
    })),
    slips: slipRows.map((s) => ({
      id: s.id,
      verdict: s.verdict,
      amount: s.amount != null ? toNum(s.amount) : null,
      declaredAmount: s.declaredAmount != null ? toNum(s.declaredAmount) : null,
      txnRef: s.txnRef,
      senderName: s.senderName,
      transferredAt: s.transferredAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      paymentId: s.paymentId,
    })),
  };
}

async function dayRow(auth: AccessTokenPayload, bankAccountId: string, date: string): Promise<ReconciliationRow> {
  return (await getReconciliationDay(auth, { bankAccountId, date })).row;
}

// ── Statements (MANUAL) ──────────────────────────────────────────────

export async function upsertBankStatement(
  auth: AccessTokenPayload,
  input: UpsertBankStatementInput,
): Promise<ReconciliationRow> {
  const account = await prisma.bankAccount.findUnique({ where: { id: input.bankAccountId } });
  if (!account) throw ApiError.notFound('ບໍ່ພົບບັນຊີທະນາຄານ');
  scopeBranchId(auth, account.branchId);
  const date = keyToDate(input.date);
  if (Number.isNaN(date.getTime())) throw ApiError.badRequest('ວັນທີບໍ່ຖືກຕ້ອງ');
  if (date > vientianeDateKey(new Date())) throw ApiError.badRequest('ບັນທຶກ statement ຂອງມື້ໃນອະນາຄົດບໍ່ໄດ້');
  await assertNotLocked(account.branchId, input.date);

  const where = { bankAccountId_statementDate: { bankAccountId: account.id, statementDate: date } };
  const before = await prisma.bankStatementEntry.findUnique({ where });
  const totalsChanged =
    !before || toNum(before.statementCredit) !== input.statementCredit || toNum(before.statementDebit) !== input.statementDebit;
  const balances = {
    ...(input.openingBalance !== undefined ? { openingBalance: input.openingBalance } : {}),
    ...(input.closingBalance !== undefined ? { closingBalance: input.closingBalance } : {}),
  };
  const entry = await prisma.bankStatementEntry.upsert({
    where,
    create: {
      bankAccountId: account.id,
      statementDate: date,
      statementCredit: input.statementCredit,
      statementDebit: input.statementDebit,
      note: input.note ?? null,
      enteredById: auth.sub,
      source: 'MANUAL',
      ...balances,
    },
    update: {
      statementCredit: input.statementCredit,
      statementDebit: input.statementDebit,
      note: input.note ?? null,
      enteredById: auth.sub,
      ...(totalsChanged ? { source: 'MANUAL', resolution: null, resolutionNote: null, resolvedById: null, resolvedAt: null } : {}),
      ...balances,
    },
  });
  await prisma.auditLog.create({
    data: {
      branchId: account.branchId,
      userId: auth.sub,
      action: before ? 'UPDATE' : 'CREATE',
      entityName: 'BankStatementEntry',
      entityId: entry.id,
      oldValue: before
        ? ({
            credit: toNum(before.statementCredit),
            debit: toNum(before.statementDebit),
            opening: before.openingBalance != null ? toNum(before.openingBalance) : null,
            closing: before.closingBalance != null ? toNum(before.closingBalance) : null,
            note: before.note,
          } as never)
        : undefined,
      newValue: {
        date: input.date,
        credit: input.statementCredit,
        debit: input.statementDebit,
        opening: entry.openingBalance != null ? toNum(entry.openingBalance) : null,
        closing: entry.closingBalance != null ? toNum(entry.closingBalance) : null,
        note: entry.note,
      } as never,
    },
  });
  return dayRow(auth, account.id, input.date);
}

export async function deleteBankStatement(auth: AccessTokenPayload, id: string): Promise<void> {
  const entry = await prisma.bankStatementEntry.findUnique({
    where: { id },
    include: { bankAccount: { select: { branchId: true } } },
  });
  if (!entry) throw ApiError.notFound('ບໍ່ພົບລາຍການ statement');
  scopeBranchId(auth, entry.bankAccount.branchId);
  await assertNotLocked(entry.bankAccount.branchId, dateToKey(entry.statementDate));
  await prisma.bankStatementEntry.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      branchId: entry.bankAccount.branchId,
      userId: auth.sub,
      action: 'DELETE',
      entityName: 'BankStatementEntry',
      entityId: id,
      oldValue: {
        date: dateToKey(entry.statementDate),
        credit: toNum(entry.statementCredit),
        debit: toNum(entry.statementDebit),
      } as never,
    },
  });
}

// ── Resolution (G3) ──────────────────────────────────────────────────

async function resolveOne(
  auth: AccessTokenPayload,
  statementId: string,
  input: { resolution: VarianceResolution; note?: string },
  tx: Prisma.TransactionClient,
): Promise<{ bankAccountId: string; date: string }> {
  const entry = await tx.bankStatementEntry.findUnique({
    where: { id: statementId },
    include: { bankAccount: { select: { branchId: true } } },
  });
  if (!entry) throw ApiError.notFound('ບໍ່ພົບລາຍການ statement');
  scopeBranchId(auth, entry.bankAccount.branchId);
  const date = dateToKey(entry.statementDate);
  await assertNotLocked(entry.bankAccount.branchId, date);
  // maker ≠ checker — SUPER_ADMIN ຍົກເວັ້ນ (ຮ້ານຄົນດຽວ) ແຕ່ຍັງຖືກບັນທຶກໃນ audit.
  if (auth.role !== 'SUPER_ADMIN' && entry.enteredById === auth.sub) {
    throw ApiError.forbidden('ຜູ້ປ້ອນ statement ອະນຸມັດສ່ວນຕ່າງຂອງຕົນເອງບໍ່ໄດ້ — ໃຫ້ຜູ້ອື່ນກວດ');
  }
  const updated = await tx.bankStatementEntry.update({
    where: { id: statementId },
    data: { resolution: input.resolution, resolutionNote: input.note ?? null, resolvedById: auth.sub, resolvedAt: new Date() },
  });
  await tx.auditLog.create({
    data: {
      branchId: entry.bankAccount.branchId,
      userId: auth.sub,
      action: 'RESOLVE',
      entityName: 'BankStatementEntry',
      entityId: statementId,
      oldValue: entry.resolution ? ({ resolution: entry.resolution, note: entry.resolutionNote } as never) : undefined,
      newValue: {
        resolution: updated.resolution,
        note: updated.resolutionNote,
        selfApproved: entry.enteredById === auth.sub,
      } as never,
    },
  });
  return { bankAccountId: entry.bankAccountId, date };
}

export async function resolveStatement(
  auth: AccessTokenPayload,
  statementId: string,
  input: ResolveStatementInput,
): Promise<ReconciliationRow> {
  const { bankAccountId, date } = await prisma.$transaction((tx) => resolveOne(auth, statementId, input, tx));
  const row = await dayRow(auth, bankAccountId, date);
  if (row.status === 'MATCHED') {
    // ບໍ່ມີສ່ວນຕ່າງແລ້ວ — ບໍ່ຄວນມີ resolution ຄ້າງ.
    await prisma.bankStatementEntry.update({
      where: { id: statementId },
      data: { resolution: null, resolutionNote: null, resolvedById: null, resolvedAt: null },
    });
    throw ApiError.badRequest('ມື້ນີ້ບໍ່ມີສ່ວນຕ່າງ — ບໍ່ຕ້ອງອະທິບາຍ');
  }
  return row;
}

export async function resolveStatementsBulk(
  auth: AccessTokenPayload,
  input: ResolveStatementsBulkInput,
): Promise<{ resolved: number }> {
  await prisma.$transaction(async (tx) => {
    for (const id of input.statementIds) await resolveOne(auth, id, input, tx);
  });
  return { resolved: input.statementIds.length };
}

export async function reopenStatement(auth: AccessTokenPayload, statementId: string): Promise<ReconciliationRow> {
  const entry = await prisma.bankStatementEntry.findUnique({
    where: { id: statementId },
    include: { bankAccount: { select: { branchId: true } } },
  });
  if (!entry) throw ApiError.notFound('ບໍ່ພົບລາຍການ statement');
  scopeBranchId(auth, entry.bankAccount.branchId);
  const date = dateToKey(entry.statementDate);
  await assertNotLocked(entry.bankAccount.branchId, date);
  await prisma.bankStatementEntry.update({
    where: { id: statementId },
    data: { resolution: null, resolutionNote: null, resolvedById: null, resolvedAt: null },
  });
  await prisma.auditLog.create({
    data: {
      branchId: entry.bankAccount.branchId,
      userId: auth.sub,
      action: 'REOPEN',
      entityName: 'BankStatementEntry',
      entityId: statementId,
      oldValue: { resolution: entry.resolution, note: entry.resolutionNote } as never,
    },
  });
  return dayRow(auth, entry.bankAccountId, date);
}

// ── History (G11) ────────────────────────────────────────────────────

export async function statementHistory(auth: AccessTokenPayload, statementId: string): Promise<StatementHistoryEntry[]> {
  const entry = await prisma.bankStatementEntry.findUnique({
    where: { id: statementId },
    include: { bankAccount: { select: { branchId: true } } },
  });
  if (!entry) throw ApiError.notFound('ບໍ່ພົບລາຍການ statement');
  scopeBranchId(auth, entry.bankAccount.branchId);
  const logs = await prisma.auditLog.findMany({
    where: { entityName: 'BankStatementEntry', entityId: statementId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, action: true, createdAt: true, oldValue: true, newValue: true, user: { select: { name: true } } },
  });
  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    at: l.createdAt.toISOString(),
    userName: l.user?.name ?? null,
    oldValue: (l.oldValue as Record<string, unknown> | null) ?? null,
    newValue: (l.newValue as Record<string, unknown> | null) ?? null,
  }));
}

// ── Periods (G5) ─────────────────────────────────────────────────────

async function listPeriodsFor(branchIds: string[], months?: string[]): Promise<ReconciliationPeriodView[]> {
  if (!branchIds.length) return [];
  const periods = await prisma.reconciliationPeriod.findMany({
    where: { branchId: { in: branchIds }, ...(months ? { month: { in: months } } : {}) },
    orderBy: { month: 'desc' },
    take: 60,
  });
  if (!periods.length) return [];
  const [users, branches] = await Promise.all([
    userNames(periods.map((p) => p.closedById)),
    prisma.branch.findMany({ where: { id: { in: [...new Set(periods.map((p) => p.branchId))] } }, select: { id: true, name: true } }),
  ]);
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  return periods.map((p) => ({
    id: p.id,
    branchId: p.branchId,
    branchName: branchName.get(p.branchId) ?? '',
    month: p.month,
    closedAt: p.closedAt.toISOString(),
    closedByName: users.get(p.closedById) ?? null,
    note: p.note,
    summary: (p.summary as Record<string, unknown>) ?? {},
  }));
}

export async function listPeriods(auth: AccessTokenPayload, branchId?: string): Promise<ReconciliationPeriodView[]> {
  const scoped = scopeBranchId(auth, branchId);
  const branchIds = scoped
    ? [scoped]
    : (await prisma.branch.findMany({ select: { id: true } })).map((b) => b.id);
  return listPeriodsFor(branchIds);
}

function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export async function periodReadiness(auth: AccessTokenPayload, branchIdRaw: string, month: string): Promise<PeriodReadiness> {
  const branchId = scopeBranchId(auth, branchIdRaw) ?? branchIdRaw;
  const today = todayKeyVientiane();
  const monthOpen = month >= monthOf(today);
  const { from, to } = monthBounds(month);
  const end = to > today ? today : to;
  const closed = Boolean(
    await prisma.reconciliationPeriod.findUnique({ where: { branchId_month: { branchId, month } }, select: { id: true } }),
  );
  const accounts = await prisma.bankAccount.findMany({ where: { branchId }, select: ACCOUNT_SELECT });
  const rows = from <= end ? await computeRows(accounts, from, end) : [];
  const unmatchedLines = accounts.length
    ? await prisma.bankStatementLine.count({
        where: {
          bankAccountId: { in: accounts.map((a) => a.id) },
          matchStatus: 'UNMATCHED',
          statementDate: { gte: keyToDate(from), lte: keyToDate(to) },
        },
      })
    : 0;
  const unreconciled = rows.filter((r) => r.status === 'UNRECONCILED').length;
  const unresolvedVariance = rows.filter((r) => r.status === 'VARIANCE').length;
  const balanceBreaks = rows.filter(
    (r) => Math.abs(r.balanceGap ?? 0) > VARIANCE_EPSILON || Math.abs(r.openingGap ?? 0) > VARIANCE_EPSILON,
  ).length;
  return {
    branchId,
    month,
    closed,
    unreconciled,
    unresolvedVariance,
    unmatchedLines,
    balanceBreaks,
    monthOpen,
    canClose: !closed && !monthOpen && unreconciled === 0 && unresolvedVariance === 0 && unmatchedLines === 0 && balanceBreaks === 0,
  };
}

export async function closePeriod(auth: AccessTokenPayload, input: ClosePeriodInput): Promise<ReconciliationPeriodView> {
  const r = await periodReadiness(auth, input.branchId, input.month);
  if (r.closed) throw ApiError.conflict(`ງວດ ${input.month} ປິດແລ້ວ`);
  if (r.monthOpen) throw ApiError.badRequest('ເດືອນນີ້ຍັງບໍ່ຈົບ — ປິດງວດໄດ້ຫຼັງວັນສຸດທ້າຍຂອງເດືອນ');
  if (!r.canClose) {
    throw ApiError.conflict(
      `ຍັງປິດງວດບໍ່ໄດ້: ຍັງບໍ່ໃສ່ statement ${r.unreconciled} ມື້, ສ່ວນຕ່າງທີ່ບໍ່ອະທິບາຍ ${r.unresolvedVariance}, ແຖວ statement ບໍ່ຈັບຄູ່ ${r.unmatchedLines}, ຍອດບໍ່ຕໍ່ເນື່ອງ ${r.balanceBreaks}`,
    );
  }
  const { from, to } = monthBounds(input.month);
  const accounts = await prisma.bankAccount.findMany({ where: { branchId: r.branchId }, select: ACCOUNT_SELECT });
  const rows = await computeRows(accounts, from, to);
  const totals = zeroTotals();
  rows.forEach((row) => addToTotals(totals, row));
  const period = await prisma.reconciliationPeriod.create({
    data: {
      branchId: r.branchId,
      month: input.month,
      closedById: auth.sub,
      note: input.note ?? null,
      summary: { ...roundTotals(totals), days: rows.length, accounts: accounts.length } as never,
    },
  });
  await prisma.auditLog.create({
    data: {
      branchId: r.branchId,
      userId: auth.sub,
      action: 'CLOSE',
      entityName: 'ReconciliationPeriod',
      entityId: period.id,
      newValue: { month: input.month, note: input.note ?? null } as never,
    },
  });
  return (await listPeriodsFor([r.branchId], [input.month]))[0]!;
}

export async function reopenPeriod(auth: AccessTokenPayload, id: string, reason?: string): Promise<void> {
  if (auth.role !== 'SUPER_ADMIN') throw ApiError.forbidden('ສະເພາະ SUPER_ADMIN ເປີດງວດທີ່ປິດແລ້ວຄືນໄດ້');
  const period = await prisma.reconciliationPeriod.findUnique({ where: { id } });
  if (!period) throw ApiError.notFound('ບໍ່ພົບງວດ');
  await prisma.reconciliationPeriod.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      branchId: period.branchId,
      userId: auth.sub,
      action: 'REOPEN',
      entityName: 'ReconciliationPeriod',
      entityId: id,
      oldValue: { month: period.month, closedById: period.closedById, closedAt: period.closedAt.toISOString() } as never,
      newValue: { reason: reason ?? null } as never,
    },
  });
}

// ── Statement import (G1) ────────────────────────────────────────────

function lineHash(l: { date: string; direction: string; amount: number; reference: string | null; description: string | null; balance: number | null }, nth: number): string {
  return createHash('sha256')
    .update([l.date, l.direction, l.amount.toFixed(2), l.reference ?? '', l.description ?? '', l.balance ?? '', nth].join('|'))
    .digest('hex');
}

export async function importStatement(
  auth: AccessTokenPayload,
  input: StatementImportInput,
): Promise<StatementImportPreview | StatementImportResult> {
  const acct = await scopedAccount(auth, input.bankAccountId);
  const rows = parseCsv(input.csv);
  if (!rows.length) throw ApiError.badRequest('ໄຟລ໌ວ່າງ');

  // mapping: ຈາກຜູ້ໃຊ້ > ຈາກ import ຄັ້ງກ່ອນຂອງບັນຊີນີ້ (ຖ້າຫົວຕາຕະລາງຄືເກົ່າ) > ເດົາຈາກຫົວ.
  let mapping: StatementMapping | null = input.mapping ?? null;
  let detected = false;
  if (!mapping) {
    const last = await prisma.bankStatementImport.findFirst({
      where: { bankAccountId: acct.id },
      orderBy: { createdAt: 'desc' },
      select: { mapping: true },
    });
    const prev = last ? statementMappingSchema.safeParse(last.mapping) : null;
    const guess = detectMapping(rows);
    if (guess) {
      mapping = guess;
      detected = true;
    } else if (prev?.success) mapping = prev.data;
  }
  if (!mapping) {
    const width = rows[0]!.length;
    mapping = statementMappingSchema.parse({ date: 0, description: width > 2 ? 1 : null, amount: width - 1, hasHeader: true });
  }

  const parsed = parseStatement(rows, mapping);
  const seen = new Map<string, number>();
  const withHash = parsed.lines.map((l) => {
    const base = [l.date, l.direction, l.amount, l.reference, l.description, l.balance].join('|');
    const nth = seen.get(base) ?? 0;
    seen.set(base, nth + 1);
    return { ...l, hash: lineHash(l, nth) };
  });
  const existing = withHash.length
    ? new Set(
        (
          await prisma.bankStatementLine.findMany({
            where: { bankAccountId: acct.id, dedupeHash: { in: withHash.map((l) => l.hash) } },
            select: { dedupeHash: true },
          })
        ).map((x) => x.dedupeHash),
      )
    : new Set<string>();
  const dates = [...new Set(withHash.map((l) => l.date))].sort();
  const locks = await lockedMonths([acct.branchId], [...new Set(dates.map(monthOf))]);
  const lockedDates = dates.filter((d) => locks.has(`${acct.branchId}|${monthOf(d)}`));
  const today = todayKeyVientiane();
  const futureRows = withHash.filter((l) => l.date > today);
  const errors = [
    ...parsed.errors,
    ...futureRows.slice(0, 20).map((l) => ({ row: l.row, message: `ວັນທີໃນອະນາຄົດ: ${l.date}` })),
  ];
  const importable = withHash.filter((l) => !existing.has(l.hash) && !lockedDates.includes(l.date) && l.date <= today);

  if (input.dryRun) {
    return {
      mapping,
      detected,
      headers: parsed.headers,
      sampleRows: parsed.sampleRows,
      lines: withHash.slice(0, 200).map(({ hash: _h, ...l }) => l),
      count: withHash.length,
      creditTotal: round2(withHash.filter((l) => l.direction === 'CREDIT').reduce((n, l) => n + l.amount, 0)),
      debitTotal: round2(withHash.filter((l) => l.direction === 'DEBIT').reduce((n, l) => n + l.amount, 0)),
      fromDate: dates[0] ?? null,
      toDate: dates[dates.length - 1] ?? null,
      errors,
      duplicates: withHash.filter((l) => existing.has(l.hash)).length,
      lockedDates,
    };
  }

  if (!importable.length) throw ApiError.badRequest('ບໍ່ມີແຖວໃໝ່ໃຫ້ນຳເຂົ້າ (ຊ້ຳທັງໝົດ, ຢູ່ໃນງວດທີ່ປິດແລ້ວ ຫຼື ອ່ານບໍ່ໄດ້)');
  const impDates = [...new Set(importable.map((l) => l.date))].sort();
  const imp = await prisma.$transaction(async (tx) => {
    const created = await tx.bankStatementImport.create({
      data: {
        bankAccountId: acct.id,
        fileName: input.fileName,
        mapping: mapping as never,
        rowCount: importable.length,
        creditTotal: round2(importable.filter((l) => l.direction === 'CREDIT').reduce((n, l) => n + l.amount, 0)),
        debitTotal: round2(importable.filter((l) => l.direction === 'DEBIT').reduce((n, l) => n + l.amount, 0)),
        fromDate: keyToDate(impDates[0]!),
        toDate: keyToDate(impDates[impDates.length - 1]!),
        importedById: auth.sub,
      },
    });
    await tx.bankStatementLine.createMany({
      data: importable.map((l) => ({
        importId: created.id,
        bankAccountId: acct.id,
        statementDate: keyToDate(l.date),
        postedAt: l.postedAt ? new Date(l.postedAt) : null,
        direction: l.direction,
        amount: l.amount,
        balance: l.balance,
        description: l.description,
        reference: l.reference,
        seq: l.row,
        dedupeHash: l.hash,
      })),
    });
    // ລວມແຖວທັງໝົດຂອງມື້ (ທຸກ import) ເປັນຍອດ statement ຂອງມື້ນັ້ນ.
    for (const d of impDates) {
      const dayLines = await tx.bankStatementLine.findMany({
        where: { bankAccountId: acct.id, statementDate: keyToDate(d) },
        orderBy: [{ postedAt: 'asc' }, { seq: 'asc' }],
      });
      const credit = round2(dayLines.filter((l) => l.direction === 'CREDIT').reduce((n, l) => n + toNum(l.amount), 0));
      const debit = round2(dayLines.filter((l) => l.direction === 'DEBIT').reduce((n, l) => n + toNum(l.amount), 0));
      const withBal = dayLines.filter((l) => l.balance != null);
      const first = withBal[0];
      const last = withBal[withBal.length - 1];
      const opening = first
        ? round2(toNum(first.balance) + (first.direction === 'CREDIT' ? -toNum(first.amount) : toNum(first.amount)))
        : null;
      const closing = last ? toNum(last.balance) : null;
      const key = { bankAccountId_statementDate: { bankAccountId: acct.id, statementDate: keyToDate(d) } };
      const before = await tx.bankStatementEntry.findUnique({ where: key });
      const changed = !before || toNum(before.statementCredit) !== credit || toNum(before.statementDebit) !== debit;
      await tx.bankStatementEntry.upsert({
        where: key,
        create: {
          bankAccountId: acct.id,
          statementDate: keyToDate(d),
          statementCredit: credit,
          statementDebit: debit,
          openingBalance: opening,
          closingBalance: closing,
          source: 'IMPORT',
          enteredById: auth.sub,
        },
        update: {
          statementCredit: credit,
          statementDebit: debit,
          openingBalance: opening,
          closingBalance: closing,
          source: 'IMPORT',
          enteredById: auth.sub,
          ...(changed ? { resolution: null, resolutionNote: null, resolvedById: null, resolvedAt: null } : {}),
        },
      });
    }
    await tx.auditLog.create({
      data: {
        branchId: acct.branchId,
        userId: auth.sub,
        action: 'IMPORT',
        entityName: 'BankStatementImport',
        entityId: created.id,
        newValue: { fileName: input.fileName, rows: importable.length, from: impDates[0], to: impDates[impDates.length - 1] } as never,
      },
    });
    return created;
  });

  const matched = await autoMatch(acct.id, impDates[0]!, impDates[impDates.length - 1]!);
  return {
    importId: imp.id,
    inserted: importable.length,
    duplicates: withHash.length - importable.length - lockedDates.length,
    days: impDates.length,
    matched,
    unmatched: importable.length - matched,
  };
}

/** ລົບ import ທັງໝົດ (ຜິດໄຟລ໌/ຜິດບັນຊີ) — ຍອດ statement ຂອງມື້ທີ່ກ່ຽວຂ້ອງຖືກຄຳນວນຄືນຈາກແຖວທີ່ເຫຼືອ. */
export async function deleteImport(auth: AccessTokenPayload, importId: string): Promise<void> {
  const imp = await prisma.bankStatementImport.findUnique({
    where: { id: importId },
    include: { bankAccount: { select: { branchId: true } }, lines: { select: { statementDate: true } } },
  });
  if (!imp) throw ApiError.notFound('ບໍ່ພົບການນຳເຂົ້າ');
  scopeBranchId(auth, imp.bankAccount.branchId);
  const dates = [...new Set(imp.lines.map((l) => dateToKey(l.statementDate)))];
  for (const d of dates) await assertNotLocked(imp.bankAccount.branchId, d);
  await prisma.$transaction(async (tx) => {
    await tx.bankStatementImport.delete({ where: { id: importId } });
    for (const d of dates) {
      const rest = await tx.bankStatementLine.findMany({ where: { bankAccountId: imp.bankAccountId, statementDate: keyToDate(d) } });
      const key = { bankAccountId_statementDate: { bankAccountId: imp.bankAccountId, statementDate: keyToDate(d) } };
      if (!rest.length) {
        await tx.bankStatementEntry.deleteMany({ where: { bankAccountId: imp.bankAccountId, statementDate: keyToDate(d), source: 'IMPORT' } });
        continue;
      }
      await tx.bankStatementEntry.update({
        where: key,
        data: {
          statementCredit: round2(rest.filter((l) => l.direction === 'CREDIT').reduce((n, l) => n + toNum(l.amount), 0)),
          statementDebit: round2(rest.filter((l) => l.direction === 'DEBIT').reduce((n, l) => n + toNum(l.amount), 0)),
          resolution: null,
          resolutionNote: null,
          resolvedById: null,
          resolvedAt: null,
        },
      });
    }
    await tx.auditLog.create({
      data: {
        branchId: imp.bankAccount.branchId,
        userId: auth.sub,
        action: 'DELETE',
        entityName: 'BankStatementImport',
        entityId: importId,
        oldValue: { fileName: imp.fileName, rows: imp.rowCount } as never,
      },
    });
  });
}

export async function listImports(auth: AccessTokenPayload, bankAccountId: string) {
  await scopedAccount(auth, bankAccountId);
  const rows = await prisma.bankStatementImport.findMany({
    where: { bankAccountId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { _count: { select: { lines: true } } },
  });
  const users = await userNames(rows.map((r) => r.importedById));
  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    rowCount: r._count.lines,
    creditTotal: toNum(r.creditTotal),
    debitTotal: toNum(r.debitTotal),
    fromDate: dateToKey(r.fromDate),
    toDate: dateToKey(r.toDate),
    importedByName: users.get(r.importedById) ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ── Line matching (G1) ───────────────────────────────────────────────

async function scopedLine(auth: AccessTokenPayload, lineId: string) {
  const line = await prisma.bankStatementLine.findUnique({
    where: { id: lineId },
    include: { bankAccount: { select: { branchId: true } } },
  });
  if (!line) throw ApiError.notFound('ບໍ່ພົບແຖວ statement');
  scopeBranchId(auth, line.bankAccount.branchId);
  await assertNotLocked(line.bankAccount.branchId, dateToKey(line.statementDate));
  return line;
}

export async function lineCandidates(auth: AccessTokenPayload, lineId: string) {
  const line = await scopedLine(auth, lineId);
  const d = dateToKey(line.statementDate);
  const from = dateToKey(new Date(line.statementDate.getTime() - 2 * DAY_MS));
  const to = dateToKey(new Date(line.statementDate.getTime() + 2 * DAY_MS));
  const { credits, debits } = await loadCandidates(line.bankAccountId, from, to);
  const pool = line.direction === 'CREDIT' ? credits : debits;
  const amount = toNum(line.amount);
  return pool
    .map((c) => ({
      kind: c.kind,
      id: c.id,
      amount: c.amount,
      netAmount: c.netAmount,
      at: c.at.toISOString(),
      date: c.dateKey,
      reference: c.refs[0] ?? null,
      amountDiff: round2(Math.min(Math.abs(c.amount - amount), Math.abs(c.netAmount - amount))),
      sameDay: c.dateKey === d,
    }))
    .sort((a, b) => a.amountDiff - b.amountDiff || Number(b.sameDay) - Number(a.sameDay))
    .slice(0, 15);
}

export async function matchLine(auth: AccessTokenPayload, lineId: string, input: MatchLineInput): Promise<void> {
  const line = await scopedLine(auth, lineId);
  if (line.direction === 'CREDIT' && input.kind !== 'TX') throw ApiError.badRequest('ເງິນເຂົ້າຈັບຄູ່ໄດ້ກັບການຊຳລະເທົ່ານັ້ນ');
  if (line.direction === 'DEBIT' && input.kind === 'TX') throw ApiError.badRequest('ເງິນອອກຈັບຄູ່ໄດ້ກັບລາຍຈ່າຍ ຫຼື ການຄືນເງິນ');
  const owner =
    input.kind === 'TX'
      ? await prisma.paymentTransaction.findUnique({ where: { id: input.id }, select: { bankAccountId: true } })
      : input.kind === 'EXPENSE'
        ? await prisma.expense.findUnique({ where: { id: input.id }, select: { paidFromAccountId: true } }).then((e) => (e ? { bankAccountId: e.paidFromAccountId } : null))
        : await prisma.refund.findUnique({ where: { id: input.id }, select: { bankAccountId: true } });
  if (!owner) throw ApiError.notFound('ບໍ່ພົບລາຍການໃນລະບົບ');
  if (owner.bankAccountId !== line.bankAccountId) throw ApiError.badRequest('ລາຍການນີ້ບໍ່ແມ່ນຂອງບັນຊີດຽວກັນ');
  const taken = await prisma.bankStatementLine.findFirst({
    where: input.kind === 'TX' ? { matchedTxId: input.id } : input.kind === 'EXPENSE' ? { matchedExpenseId: input.id } : { matchedRefundId: input.id },
    select: { id: true },
  });
  if (taken && taken.id !== lineId) throw ApiError.conflict('ລາຍການນີ້ຖືກຈັບຄູ່ກັບແຖວ statement ອື່ນແລ້ວ');
  await prisma.bankStatementLine.update({
    where: { id: lineId },
    data: {
      matchStatus: 'MATCHED',
      matchedTxId: input.kind === 'TX' ? input.id : null,
      matchedExpenseId: input.kind === 'EXPENSE' ? input.id : null,
      matchedRefundId: input.kind === 'REFUND' ? input.id : null,
      matchedById: auth.sub,
      matchedAt: new Date(),
    },
  });
  await prisma.auditLog.create({
    data: {
      branchId: line.bankAccount.branchId,
      userId: auth.sub,
      action: 'MATCH',
      entityName: 'BankStatementLine',
      entityId: lineId,
      newValue: { kind: input.kind, id: input.id } as never,
    },
  });
}

export async function setLineStatus(auth: AccessTokenPayload, lineId: string, status: 'UNMATCHED' | 'IGNORED'): Promise<void> {
  const line = await scopedLine(auth, lineId);
  await prisma.bankStatementLine.update({
    where: { id: lineId },
    data: {
      matchStatus: status,
      matchedTxId: null,
      matchedExpenseId: null,
      matchedRefundId: null,
      matchedById: status === 'IGNORED' ? auth.sub : null,
      matchedAt: status === 'IGNORED' ? new Date() : null,
    },
  });
  await prisma.auditLog.create({
    data: {
      branchId: line.bankAccount.branchId,
      userId: auth.sub,
      action: status === 'IGNORED' ? 'IGNORE' : 'UNMATCH',
      entityName: 'BankStatementLine',
      entityId: lineId,
      oldValue: { matchStatus: line.matchStatus, tx: line.matchedTxId, expense: line.matchedExpenseId, refund: line.matchedRefundId } as never,
    },
  });
}

export async function rematch(auth: AccessTokenPayload, bankAccountId: string, from: string, to: string): Promise<{ matched: number }> {
  await scopedAccount(auth, bankAccountId);
  assertRange(from, to);
  return { matched: await autoMatch(bankAccountId, from, to) };
}

// ── Settings (G9) ────────────────────────────────────────────────────

export async function getReconSettings(): Promise<ReconSettings> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [RECON_REMINDER_SETTING_KEY, RECON_ALERT_THRESHOLD_SETTING_KEY] } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value as unknown]));
  const threshold = Number(byKey.get(RECON_ALERT_THRESHOLD_SETTING_KEY));
  return {
    reminderEnabled: byKey.get(RECON_REMINDER_SETTING_KEY) !== false,
    varianceAlertThreshold: Number.isFinite(threshold) ? threshold : DEFAULT_ALERT_THRESHOLD,
  };
}

export async function updateReconSettings(auth: AccessTokenPayload, input: Partial<ReconSettings>): Promise<ReconSettings> {
  if (auth.role !== 'SUPER_ADMIN') throw ApiError.forbidden('ສະເພາະ SUPER_ADMIN');
  const before = await getReconSettings();
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (input.reminderEnabled !== undefined) {
    ops.push(
      prisma.appSetting.upsert({
        where: { key: RECON_REMINDER_SETTING_KEY },
        create: { key: RECON_REMINDER_SETTING_KEY, value: input.reminderEnabled },
        update: { value: input.reminderEnabled },
      }),
    );
  }
  if (input.varianceAlertThreshold !== undefined) {
    ops.push(
      prisma.appSetting.upsert({
        where: { key: RECON_ALERT_THRESHOLD_SETTING_KEY },
        create: { key: RECON_ALERT_THRESHOLD_SETTING_KEY, value: input.varianceAlertThreshold },
        update: { value: input.varianceAlertThreshold },
      }),
    );
  }
  await prisma.$transaction(ops);
  const after = await getReconSettings();
  await prisma.auditLog.create({
    data: { userId: auth.sub, action: 'UPDATE', entityName: 'ReconSettings', oldValue: before as never, newValue: after as never },
  });
  return after;
}

// ── Reminders (G9) ───────────────────────────────────────────────────

async function notifyBranch(
  branchId: string,
  payload: { type: string; title: string; body: string; data: Record<string, unknown>; dedupeKey: string; severity: 'info' | 'warning' },
): Promise<number> {
  const admins = await prisma.user.findMany({
    where: { isActive: true, deletedAt: null, OR: [{ role: 'SUPER_ADMIN' }, { role: 'BRANCH_ADMIN', branchId }] },
    select: { id: true },
  });
  const results = await Promise.all(
    admins.map((a) =>
      notifyUser({
        userId: a.id,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        severity: payload.severity,
        dedupeKey: `${payload.dedupeKey}:${a.id}`,
      }),
    ),
  );
  return results.filter((r) => !r.skipped).length;
}

/**
 * ແລ່ນທຸກເຊົ້າ: (1) ມື້ວານມີການເຄື່ອນໄຫວແຕ່ຍັງບໍ່ມີ statement → ເຕືອນ; (2) ສ່ວນຕ່າງທີ່ບໍ່ອະທິບາຍ ≥ threshold
 * ໃນ 7 ມື້ຫຼ້າສຸດ → warning. dedupe ຕໍ່ສາຂາ/ມື້ ເພື່ອບໍ່ສະແປມ.
 */
export async function runReconciliationReminders(now = new Date()): Promise<{ missing: number; variance: number; notified: number }> {
  const settings = await getReconSettings();
  if (!settings.reminderEnabled) return { missing: 0, variance: 0, notified: 0 };
  const today = todayKeyVientiane(now);
  const yesterday = dateToKey(new Date(keyToDate(today).getTime() - DAY_MS));
  const weekAgo = dateToKey(new Date(keyToDate(today).getTime() - 7 * DAY_MS));
  const accounts = await prisma.bankAccount.findMany({ where: { isActive: true }, select: ACCOUNT_SELECT });
  const rows = await computeRows(accounts, weekAgo, yesterday);
  let notified = 0;
  let missing = 0;
  let variance = 0;
  const byBranch = new Map<string, ReconciliationRow[]>();
  for (const r of rows) byBranch.set(r.branchId, [...(byBranch.get(r.branchId) ?? []), r]);
  for (const [branchId, list] of byBranch) {
    const miss = list.filter((r) => r.date === yesterday && r.status === 'UNRECONCILED');
    if (miss.length) {
      missing += miss.length;
      notified += await notifyBranch(branchId, {
        type: 'reconciliation_missing',
        title: `ຍັງບໍ່ໄດ້ກະທົບຍອດທະນາຄານຂອງມື້ວານ (${miss.length} ບັນຊີ)`,
        body: miss.map((r) => `${r.bankCode} ${r.accountName}: ເງິນເຂົ້າ ${r.systemCredit.toLocaleString('en-US')} ₭`).join('\n'),
        data: { module: 'payments', path: `/payments/reconciliation?from=${yesterday}&to=${yesterday}` },
        dedupeKey: `recon-missing:${branchId}:${yesterday}`,
        severity: 'info',
      });
    }
    const big = list.filter(
      (r) => r.status === 'VARIANCE' && Math.abs(r.creditVariance ?? 0) + Math.abs(r.debitVariance ?? 0) >= settings.varianceAlertThreshold,
    );
    if (big.length) {
      variance += big.length;
      notified += await notifyBranch(branchId, {
        type: 'reconciliation_variance',
        title: `ສ່ວນຕ່າງທະນາຄານທີ່ຍັງບໍ່ອະທິບາຍ (${big.length} ມື້)`,
        body: big
          .slice(0, 5)
          .map((r) => `${r.date} ${r.bankCode}: ${(r.creditVariance ?? 0).toLocaleString('en-US')} / ${(r.debitVariance ?? 0).toLocaleString('en-US')} ₭`)
          .join('\n'),
        data: { module: 'payments', path: `/payments/reconciliation?status=VARIANCE&from=${weekAgo}&to=${yesterday}` },
        dedupeKey: `recon-variance:${branchId}:${today}`,
        severity: 'warning',
      });
    }
  }
  return { missing, variance, notified };
}
