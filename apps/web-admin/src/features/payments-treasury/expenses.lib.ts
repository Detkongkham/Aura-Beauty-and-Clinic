import type { ExpenseCategoryView, ExpenseListFlag, ExpenseListSort, ExpenseStatus, ExpenseView } from '@abcp/shared-types';
import { EXPENSE_LIST_FLAGS, EXPENSE_LIST_SORTS, EXPENSE_STATUSES } from '@abcp/shared-types';
import {
  Building2,
  Car,
  Megaphone,
  Package,
  Receipt,
  Tag,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import type { Tone } from '@/features/payroll/payroll.lib';

import { monthStartKey, shiftDays, todayKey } from './treasury.lib';

// ── page state ───────────────────────────────────────────────────────

export const EXPENSE_VIEWS = ['list', 'board', 'insights'] as const;
export type ExpenseViewMode = (typeof EXPENSE_VIEWS)[number];

export const PERIOD_PRESETS = ['month', 'lastMonth', 'd30', 'd90', 'ytd'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export { EXPENSE_LIST_FLAGS, EXPENSE_LIST_SORTS, EXPENSE_STATUSES };
export type { ExpenseListFlag, ExpenseListSort };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDateKey = (v: string | undefined): v is string => Boolean(v && DATE_RE.test(v));

export function oneOf<T extends string>(list: readonly T[], v: string | undefined): T | undefined {
  return v && (list as readonly string[]).includes(v) ? (v as T) : undefined;
}

/** `{from, to}` for a preset, in Vientiane date keys. */
export function presetRange(p: PeriodPreset, today = todayKey()): { from: string; to: string } {
  switch (p) {
    case 'month':
      return { from: monthStartKey(today), to: today };
    case 'lastMonth': {
      const lastDay = shiftDays(monthStartKey(today), -1);
      return { from: monthStartKey(lastDay), to: lastDay };
    }
    case 'd30':
      return { from: shiftDays(today, -29), to: today };
    case 'd90':
      return { from: shiftDays(today, -89), to: today };
    case 'ytd':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

/** Which preset (if any) a range is — drives the highlighted chip in the period switch. */
export function detectPreset(from: string, to: string): PeriodPreset | null {
  return PERIOD_PRESETS.find((p) => {
    const r = presetRange(p);
    return r.from === from && r.to === to;
  }) ?? null;
}

/** Inclusive day count of a date-key range. */
export function spanDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

// ── status ───────────────────────────────────────────────────────────

export const EXPENSE_STATUS_TONE: Record<ExpenseStatus, Tone> = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  APPROVED: 'info',
  REJECTED: 'danger',
  PAID: 'success',
  VOIDED: 'neutral',
};

/** Board lanes, left → right in workflow order. Rejected sits with drafts: both are "back with the author". */
export const BOARD_LANES = [
  { key: 'draft', statuses: ['DRAFT', 'REJECTED'] as ExpenseStatus[], tone: 'neutral' as Tone },
  { key: 'submitted', statuses: ['SUBMITTED'] as ExpenseStatus[], tone: 'warning' as Tone },
  { key: 'approved', statuses: ['APPROVED'] as ExpenseStatus[], tone: 'info' as Tone },
  { key: 'paid', statuses: ['PAID'] as ExpenseStatus[], tone: 'success' as Tone },
] as const;

/** Whole days since an ISO instant — for "waiting 3 days" on the approval queue. */
export function ageDays(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 86_400_000));
}

/** Approval-queue age → tone. Same day is fine, 3+ days is a nudge, a week is a problem. */
export function ageTone(days: number | null): Tone {
  if (days == null) return 'neutral';
  if (days >= 7) return 'danger';
  if (days >= 3) return 'warning';
  return 'neutral';
}

/** Which workflow step an expense is waiting on, and when it entered that step. */
export function waitingSince(e: Pick<ExpenseView, 'status' | 'submittedAt' | 'approvedAt' | 'createdAt'>): string | null {
  if (e.status === 'SUBMITTED') return e.submittedAt ?? e.createdAt;
  if (e.status === 'APPROVED') return e.approvedAt ?? e.submittedAt ?? e.createdAt;
  return null;
}

// ── categories ───────────────────────────────────────────────────────

const CATEGORY_ICON: Record<string, LucideIcon> = {
  RENT: Building2,
  SALARY: Users,
  MATERIALS: Package,
  UTILITIES: Zap,
  MARKETING: Megaphone,
  TRANSPORT: Car,
  MAINTENANCE: Wrench,
  TAX: Receipt,
};

export function categoryIcon(code: string | undefined): LucideIcon {
  return (code && CATEGORY_ICON[code]) || Tag;
}

export function categoryName(
  c: Pick<ExpenseCategoryView, 'nameLo' | 'nameEn'>,
  lang: 'lo' | 'en',
): string {
  return lang === 'en' ? c.nameEn : c.nameLo;
}

/** Stable chart hue per category — by position in the category master list, not by rank, so a colour means one category everywhere. */
export function categoryColor(categoryId: string, categories: Pick<ExpenseCategoryView, 'id'>[]): string {
  const i = Math.max(0, categories.findIndex((c) => c.id === categoryId));
  return `hsl(var(--chart-${(i % 6) + 1}))`;
}

// ── figures ──────────────────────────────────────────────────────────

/** Home currency — everything else is shown with its code and flagged in totals. */
export const HOME_CURRENCY = 'LAK';

export function isForeign(currency: string): boolean {
  return currency !== HOME_CURRENCY;
}

/** Weekday + short date for the table's date cell — "Mon" reads faster than a bare date. */
export function weekdayShort(dateKey: string, lang: 'lo' | 'en'): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  return new Intl.DateTimeFormat(lang === 'lo' ? 'lo-LA' : 'en-US', { weekday: 'short', timeZone: 'UTC' }).format(d);
}

/** "Sep 12" style axis label for the daily trend. */
export function dayAxisLabel(dateKey: string, lang: 'lo' | 'en'): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  return new Intl.DateTimeFormat(lang === 'lo' ? 'lo-LA' : 'en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
}

/**
 * Collapses a daily series into weeks once the range is long, so a 90-day or YTD view is a readable
 * trend rather than a comb. The previous period's series is bucketed by the same index.
 */
export function bucketTrend(
  current: { date: string; amount: number }[],
  previous: { date: string; amount: number }[],
): { label: string; date: string; amount: number; previous: number; cumulative: number; prevCumulative: number }[] {
  const size = current.length > 62 ? 7 : 1;
  const out: { label: string; date: string; amount: number; previous: number; cumulative: number; prevCumulative: number }[] = [];
  let cum = 0;
  let prevCum = 0;
  for (let i = 0; i < current.length; i += size) {
    const slice = current.slice(i, i + size);
    const amount = slice.reduce((s, d) => s + d.amount, 0);
    const prev = previous.slice(i, i + size).reduce((s, d) => s + d.amount, 0);
    cum += amount;
    prevCum += prev;
    out.push({ label: slice[0]!.date, date: slice[0]!.date, amount, previous: prev, cumulative: cum, prevCumulative: prevCum });
  }
  return out;
}

/** Days until a due date (negative = overdue), in whole Vientiane calendar days. */
export function daysUntil(dateKey: string | null, today: string): number | null {
  if (!dateKey) return null;
  return Math.round((Date.parse(`${dateKey}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Budget usage → tone: under 80% fine, to 100% nudge, over is a problem. */
export function budgetTone(actual: number, budget: number): Tone {
  if (budget <= 0) return 'neutral';
  const r = actual / budget;
  if (r > 1) return 'danger';
  if (r >= 0.8) return 'warning';
  return 'success';
}

/** `YYYY-MM` helpers for the budget editor. */
export function monthOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}
