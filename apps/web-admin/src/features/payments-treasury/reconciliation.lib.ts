import type {
  ReconciliationAccount,
  ReconciliationRow,
  ReconciliationStatus,
  ReconciliationView,
} from '@abcp/shared-types';

import { BadgeCheck, Check, CircleDashed, EqualNot, type LucideIcon } from 'lucide-react';

import { dayjs } from '@/lib/format';
import type { Tone } from '@/features/payroll/payroll.lib';

import { monthStartKey, shiftDays, todayKey } from './treasury.lib';

// ── URL vocabulary ───────────────────────────────────────────────────
export const RECON_VIEWS = ['ledger', 'calendar', 'accounts', 'cash'] as const;
export type ReconView = (typeof RECON_VIEWS)[number];

export const RECON_STATUSES: ReconciliationStatus[] = ['UNRECONCILED', 'VARIANCE', 'RESOLVED', 'MATCHED'];

export const RANGE_PRESETS = ['today', 'd7', 'd30', 'month', 'lastMonth'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

/** Same cap as the backend (`MAX_RECONCILE_DAYS`) — a longer URL range is clamped, not sent. */
export const MAX_RANGE_DAYS = 62;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isDateKey(v: string | undefined | null): v is string {
  return Boolean(v && DATE_RE.test(v) && dayjs(v, 'YYYY-MM-DD').isValid());
}

export function presetRange(p: RangePreset, today = todayKey()): { from: string; to: string } {
  switch (p) {
    case 'today':
      return { from: today, to: today };
    case 'd7':
      return { from: shiftDays(today, -6), to: today };
    case 'd30':
      return { from: shiftDays(today, -29), to: today };
    case 'month':
      return { from: monthStartKey(today), to: today };
    case 'lastMonth': {
      const firstThis = dayjs(monthStartKey(today), 'YYYY-MM-DD');
      const firstPrev = firstThis.subtract(1, 'month');
      return { from: firstPrev.format('YYYY-MM-DD'), to: firstThis.subtract(1, 'day').format('YYYY-MM-DD') };
    }
  }
}

/** Which preset (if any) the current range is exactly — drives the pressed state of the preset chips. */
export function matchPreset(from: string, to: string, today = todayKey()): RangePreset | null {
  return RANGE_PRESETS.find((p) => {
    const r = presetRange(p, today);
    return r.from === from && r.to === to;
  }) ?? null;
}

export function daysBetween(from: string, to: string): number {
  return dayjs(to, 'YYYY-MM-DD').diff(dayjs(from, 'YYYY-MM-DD'), 'day') + 1;
}

/** Slide the whole window back/forward by its own length, never past today. */
export function shiftRange(from: string, to: string, dir: -1 | 1, today = todayKey()): { from: string; to: string } {
  const len = daysBetween(from, to);
  let f = shiftDays(from, dir * len);
  let t = shiftDays(to, dir * len);
  if (t > today) {
    t = today;
    f = shiftDays(today, -(len - 1));
  }
  return { from: f, to: t };
}

/** Every date key in [from, to], newest first (the ledger reads top-down from today). */
export function enumerateDays(from: string, to: string): string[] {
  const out: string[] = [];
  const n = Math.min(daysBetween(from, to), MAX_RANGE_DAYS);
  for (let i = 0; i < n; i++) out.push(shiftDays(to, -i));
  return out;
}

/** Short weekday for a date key, in the UI language (dayjs has no Lao locale loaded; Intl does). */
export function weekdayShort(date: string, lang: string): string {
  try {
    return new Date(`${date}T00:00:00Z`).toLocaleDateString(lang.startsWith('en') ? 'en-GB' : 'lo-LA', {
      weekday: 'short',
      timeZone: 'UTC',
    });
  } catch {
    return '';
  }
}

export function rowKey(r: Pick<ReconciliationRow, 'date' | 'bankAccountId'>): string {
  return `${r.date}|${r.bankAccountId}`;
}

export function ageInDays(date: string, today = todayKey()): number {
  return Math.max(0, dayjs(today, 'YYYY-MM-DD').diff(dayjs(date, 'YYYY-MM-DD'), 'day'));
}

// ── status presentation ──────────────────────────────────────────────
export const STATUS_TONE: Record<ReconciliationStatus, Tone> = {
  MATCHED: 'success',
  VARIANCE: 'danger',
  RESOLVED: 'info',
  UNRECONCILED: 'warning',
};

export const STATUS_ICON: Record<ReconciliationStatus, LucideIcon> = {
  MATCHED: Check,
  VARIANCE: EqualNot,
  RESOLVED: BadgeCheck,
  UNRECONCILED: CircleDashed,
};

/** Opening/closing that don't roll forward (G4). */
export function hasBalanceBreak(r: Pick<ReconciliationRow, 'balanceGap' | 'openingGap'>): boolean {
  return Math.abs(r.balanceGap ?? 0) > 0.01 || Math.abs(r.openingGap ?? 0) > 0.01;
}

/** Largest single-direction difference on a row (absolute), 0 when there is no statement. */
export function rowGap(r: ReconciliationRow): number {
  return Math.abs(r.creditVariance ?? 0) + Math.abs(r.debitVariance ?? 0);
}

// ── summary ──────────────────────────────────────────────────────────
export type ReconSummary = {
  days: number;
  rows: number;
  matched: number;
  variance: number;
  resolved: number;
  unreconciled: number;
  /** matched ÷ days that have a statement — how often the books tie out once checked. */
  accuracyPct: number | null;
  /** days with a statement ÷ all account-days with activity. */
  coveragePct: number | null;
  netCreditVariance: number;
  netDebitVariance: number;
  /** Σ|variance| of unresolved days — what the reconciler still has to explain. */
  absVariance: number;
  /** Σ|variance| already explained and approved. */
  resolvedVariance: number;
  systemFee: number;
  /** Rows whose opening/closing balances don't roll forward. */
  balanceBreaks: number;
  unmatchedLines: number;
  /** System credit on days not yet checked against a statement. */
  unverifiedCredit: number;
  oldestUnreconciled: ReconciliationRow | null;
  largestVariance: ReconciliationRow | null;
};

export function summarize(view: ReconciliationView | undefined): ReconSummary {
  const rows = view?.rows ?? [];
  const s: ReconSummary = {
    days: view ? daysBetween(view.from, view.to) : 0,
    rows: rows.length,
    matched: 0,
    variance: 0,
    resolved: 0,
    unreconciled: 0,
    accuracyPct: null,
    coveragePct: null,
    netCreditVariance: 0,
    netDebitVariance: 0,
    absVariance: 0,
    resolvedVariance: 0,
    systemFee: 0,
    balanceBreaks: 0,
    unmatchedLines: 0,
    unverifiedCredit: 0,
    oldestUnreconciled: null,
    largestVariance: null,
  };
  for (const r of rows) {
    if (r.status === 'MATCHED') s.matched += 1;
    else if (r.status === 'VARIANCE') s.variance += 1;
    else if (r.status === 'RESOLVED') s.resolved += 1;
    else {
      s.unreconciled += 1;
      s.unverifiedCredit += r.systemCredit;
      if (!s.oldestUnreconciled || r.date < s.oldestUnreconciled.date) s.oldestUnreconciled = r;
    }
    s.netCreditVariance += r.creditVariance ?? 0;
    s.netDebitVariance += r.debitVariance ?? 0;
    if (r.status === 'RESOLVED') s.resolvedVariance += rowGap(r);
    else s.absVariance += rowGap(r);
    s.systemFee += r.systemFee ?? 0;
    if (hasBalanceBreak(r)) s.balanceBreaks += 1;
    s.unmatchedLines += r.unmatchedLines ?? 0;
    if (r.status === 'VARIANCE' && (!s.largestVariance || rowGap(r) > rowGap(s.largestVariance))) {
      s.largestVariance = r;
    }
  }
  const checked = s.matched + s.variance + s.resolved;
  s.accuracyPct = checked > 0 ? Math.round((s.matched / checked) * 100) : null;
  s.coveragePct = s.rows > 0 ? Math.round((checked / s.rows) * 100) : null;
  s.netCreditVariance = Math.round(s.netCreditVariance * 100) / 100;
  s.netDebitVariance = Math.round(s.netDebitVariance * 100) / 100;
  s.absVariance = Math.round(s.absVariance * 100) / 100;
  s.resolvedVariance = Math.round(s.resolvedVariance * 100) / 100;
  return s;
}

// ── per-account ──────────────────────────────────────────────────────
export type AccountStats = ReconciliationAccount & {
  rows: ReconciliationRow[];
  matched: number;
  variance: number;
  resolved: number;
  unreconciled: number;
  systemCredit: number;
  systemDebit: number;
  statementCredit: number;
  statementDebit: number;
  absVariance: number;
  byDate: Map<string, ReconciliationRow>;
};

export function accountStats(view: ReconciliationView | undefined): AccountStats[] {
  if (!view) return [];
  const map = new Map<string, AccountStats>();
  for (const a of view.accounts ?? []) {
    map.set(a.bankAccountId, {
      ...a,
      rows: [],
      matched: 0,
      variance: 0,
      resolved: 0,
      unreconciled: 0,
      systemCredit: 0,
      systemDebit: 0,
      statementCredit: 0,
      statementDebit: 0,
      absVariance: 0,
      byDate: new Map(),
    });
  }
  for (const r of view.rows) {
    let a = map.get(r.bankAccountId);
    if (!a) {
      // An older API without `accounts` — synthesise the account from its rows.
      a = {
        bankAccountId: r.bankAccountId,
        accountName: r.accountName,
        accountNumber: r.accountNumber,
        bankCode: r.bankCode,
        branchId: r.branchId,
        branchName: r.branchName,
        currency: r.currency,
        isActive: true,
        isDefault: false,
        lastStatementDate: null,
        rows: [],
        matched: 0,
        variance: 0,
        resolved: 0,
        unreconciled: 0,
        systemCredit: 0,
        systemDebit: 0,
        statementCredit: 0,
        statementDebit: 0,
        absVariance: 0,
        byDate: new Map(),
      };
      map.set(r.bankAccountId, a);
    }
    a.rows.push(r);
    a.byDate.set(r.date, r);
    if (r.status === 'MATCHED') a.matched += 1;
    else if (r.status === 'VARIANCE') a.variance += 1;
    else if (r.status === 'RESOLVED') a.resolved += 1;
    else a.unreconciled += 1;
    a.systemCredit += r.systemCredit;
    a.systemDebit += r.systemDebit;
    a.statementCredit += r.statementCredit ?? 0;
    a.statementDebit += r.statementDebit ?? 0;
    if (r.status !== 'RESOLVED') a.absVariance += rowGap(r);
  }
  return [...map.values()];
}

/** Worst-first: accounts with differences, then those with missing statements, then the clean ones. */
export function sortAccountsByAttention(list: AccountStats[]): AccountStats[] {
  return [...list].sort(
    (a, b) =>
      b.variance - a.variance ||
      b.unreconciled - a.unreconciled ||
      b.systemCredit - a.systemCredit ||
      a.accountName.localeCompare(b.accountName),
  );
}

// ── export ───────────────────────────────────────────────────────────
function csvCell(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function reconciliationCsv(rows: ReconciliationRow[]): string {
  const head = [
    'date',
    'bank',
    'account_name',
    'account_number',
    'branch',
    'currency',
    'system_in',
    'system_in_count',
    'system_out',
    'system_out_count',
    'statement_in',
    'statement_out',
    'variance_in',
    'variance_out',
    'status',
    'note',
    'entered_by',
    'entered_at',
    'provider_fee',
    'expected_in',
    'opening_balance',
    'closing_balance',
    'resolution',
    'resolution_note',
    'resolved_by',
    'statement_lines',
    'unmatched_lines',
    'source',
  ];
  const lines = rows.map((r) =>
    [
      r.date,
      r.bankCode,
      r.accountName,
      r.accountNumber,
      r.branchName,
      r.currency,
      r.systemCredit,
      r.systemCreditCount,
      r.systemDebit,
      r.systemDebitCount,
      r.statementCredit,
      r.statementDebit,
      r.creditVariance,
      r.debitVariance,
      r.status,
      r.note,
      r.enteredByName,
      r.enteredAt,
      r.systemFee,
      r.expectedCredit,
      r.openingBalance,
      r.closingBalance,
      r.resolution,
      r.resolutionNote,
      r.resolvedByName,
      r.lineCount,
      r.unmatchedLines,
      r.source,
    ]
      .map(csvCell)
      .join(','),
  );
  return [head.join(','), ...lines].join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM so Excel opens Lao text as UTF-8.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── timing pairs (G8) ────────────────────────────────────────────────
export type TimingPair = { a: ReconciliationRow; b: ReconciliationRow; amount: number };

/**
 * Money that left the books on day N but reached the bank on N+1 shows as −x then +x on
 * adjacent days of the same account. Pairs those (unresolved, with a statement) so both
 * can be explained as TIMING in one action.
 */
export function findTimingPairs(rows: ReconciliationRow[]): TimingPair[] {
  const open = rows
    .filter((r) => r.status === 'VARIANCE' && r.statementId && Math.abs(r.creditVariance ?? 0) > 0.01)
    .sort((x, y) => x.bankAccountId.localeCompare(y.bankAccountId) || x.date.localeCompare(y.date));
  const used = new Set<string>();
  const out: TimingPair[] = [];
  for (let i = 0; i < open.length; i++) {
    const a = open[i]!;
    if (used.has(rowKey(a))) continue;
    const b = open.find(
      (r) =>
        !used.has(rowKey(r)) &&
        r.bankAccountId === a.bankAccountId &&
        r.date === shiftDays(a.date, 1) &&
        Math.abs((r.creditVariance ?? 0) + (a.creditVariance ?? 0)) <= 0.01,
    );
    if (!b) continue;
    used.add(rowKey(a));
    used.add(rowKey(b));
    out.push({ a, b, amount: Math.abs(a.creditVariance ?? 0) });
  }
  return out;
}

/** Currencies present in the view, LAK first. */
export function viewCurrencies(view: ReconciliationView | undefined): string[] {
  const set = new Set((view?.rows ?? []).map((r) => r.currency));
  for (const a of view?.accounts ?? []) set.add(a.currency);
  return [...set].sort((a, b) => (a === 'LAK' ? -1 : b === 'LAK' ? 1 : a.localeCompare(b)));
}

/** A view narrowed to one currency (rows, accounts and totals). */
export function viewForCurrency(view: ReconciliationView | undefined, currency: string | null): ReconciliationView | undefined {
  if (!view || !currency) return view;
  const t = view.totalsByCurrency?.[currency];
  return {
    ...view,
    rows: view.rows.filter((r) => r.currency === currency),
    accounts: view.accounts.filter((a) => a.currency === currency),
    totals: t ?? view.totals,
  };
}
