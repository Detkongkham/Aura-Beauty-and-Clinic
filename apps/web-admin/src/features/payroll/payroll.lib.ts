import type { PayoutState, PayrollRow } from '@abcp/shared-types';

/** Tone → static Tailwind classes. Static strings so the JIT can see every class. */
export type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral';

export const TONE: Record<Tone, { chip: string; bar: string; ring: string; text: string; soft: string }> = {
  primary: {
    chip: 'bg-primary/10 text-primary',
    bar: 'bg-primary',
    ring: 'border-primary/50 ring-primary/30',
    text: 'text-primary',
    soft: 'bg-primary/5',
  },
  success: {
    chip: 'bg-success-soft text-success',
    bar: 'bg-success',
    ring: 'border-success/50 ring-success/30',
    text: 'text-success',
    soft: 'bg-success-soft/50',
  },
  warning: {
    chip: 'bg-warning-soft text-warning',
    bar: 'bg-warning',
    ring: 'border-warning/50 ring-warning/30',
    text: 'text-warning',
    soft: 'bg-warning-soft/50',
  },
  danger: {
    chip: 'bg-destructive-soft text-destructive',
    bar: 'bg-destructive',
    ring: 'border-destructive/50 ring-destructive/30',
    text: 'text-destructive',
    soft: 'bg-destructive-soft/50',
  },
  info: {
    chip: 'bg-info-soft text-info',
    bar: 'bg-info',
    ring: 'border-info/50 ring-info/30',
    text: 'text-info',
    soft: 'bg-info-soft/50',
  },
  accent: {
    chip: 'bg-accent-soft text-accent-foreground',
    bar: 'bg-accent',
    ring: 'border-accent/50 ring-accent/30',
    text: 'text-accent-foreground',
    soft: 'bg-accent-soft/50',
  },
  neutral: {
    chip: 'bg-muted text-muted-foreground',
    bar: 'bg-muted-foreground/40',
    ring: 'border-border ring-border',
    text: 'text-muted-foreground',
    soft: 'bg-muted',
  },
};

export const VIEW_MODES = ['roster', 'leaderboard', 'insights'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const SORT_KEYS = [
  'revenue',
  'outstanding',
  'attainment',
  'jobs',
  'commission',
  'bonus',
  'name',
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Row-level filters that the stat tiles and chips toggle. */
export const PAYROLL_FLAGS = ['owing', 'bonusDue', 'noTarget', 'targetMet', 'inactive'] as const;
export type PayrollFlag = (typeof PAYROLL_FLAGS)[number];

export const FLAG_TEST: Record<PayrollFlag, (r: PayrollRow) => boolean> = {
  owing: (r) => r.outstanding > 0,
  bonusDue: (r) => r.bonusAmount > 0 && !r.bonusPaid,
  noTarget: (r) => r.targetRevenue <= 0,
  targetMet: (r) => r.targetMet,
  inactive: (r) => !r.isActive,
};

export const SORTERS: Record<SortKey, (a: PayrollRow, b: PayrollRow) => number> = {
  revenue: (a, b) => b.grossRevenue - a.grossRevenue || b.completedJobs - a.completedJobs,
  outstanding: (a, b) => b.outstanding - a.outstanding || b.grossRevenue - a.grossRevenue,
  attainment: (a, b) => b.attainmentPct - a.attainmentPct || b.grossRevenue - a.grossRevenue,
  jobs: (a, b) => b.completedJobs - a.completedJobs || b.grossRevenue - a.grossRevenue,
  commission: (a, b) => b.commissionTotal - a.commissionTotal,
  bonus: (a, b) => b.bonusAmount - a.bonusAmount,
  name: (a, b) => a.staffName.localeCompare(b.staffName),
};

export const PAYOUT_STATE_TONE: Record<PayoutState, Tone> = {
  CLEAR: 'success',
  PARTIAL: 'warning',
  DUE: 'danger',
  NONE: 'neutral',
};

/** i18n key for a payout state — `payroll.state.*`. */
export function payoutStateKey(state: PayoutState): string {
  return `payroll.state.${state.toLowerCase()}`;
}

// ── month helpers ────────────────────────────────────────────────────
// `monthYear` is a bare `YYYY-MM` string; every helper stays on that
// representation and never round-trips through a local Date, so a browser in
// any timezone resolves the same month (the same reason DateField exists).

/** The current Vientiane month as `YYYY-MM` — the page's default. */
export function currentMonthYear(): string {
  const v = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Shift a `YYYY-MM` by `delta` months. */
export function shiftMonth(monthYear: string, delta: number): string {
  const y = Number(monthYear.slice(0, 4));
  const m = Number(monthYear.slice(5, 7)) - 1;
  const d = new Date(Date.UTC(y, m + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** `YYYY-MM` → "September 2026" / Lao equivalent, per the active locale. */
export function monthLabel(monthYear: string, locale: string): string {
  const y = Number(monthYear.slice(0, 4));
  const m = Number(monthYear.slice(5, 7)) - 1;
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthYear;
  return new Intl.DateTimeFormat(locale === 'lo' ? 'lo-LA' : 'en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m, 1)));
}

/** Short form for chart axes — "Sep". */
export function monthShort(monthYear: string, locale: string): string {
  const y = Number(monthYear.slice(0, 4));
  const m = Number(monthYear.slice(5, 7)) - 1;
  return new Intl.DateTimeFormat(locale === 'lo' ? 'lo-LA' : 'en-US', {
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m, 1)));
}

/** The last `n` months ending at the current one, newest first. */
export function recentMonths(n: number): string[] {
  const now = currentMonthYear();
  return Array.from({ length: n }, (_, i) => shiftMonth(now, -i));
}

/** True once `monthYear` is past the current Vientiane month — nothing to step forward into. */
export function isFutureMonth(monthYear: string): boolean {
  return monthYear >= currentMonthYear();
}

// ── figures ──────────────────────────────────────────────────────────

/**
 * Signed percentage change, or `null` when the baseline is zero — a jump from
 * nothing is not "+∞%", it is "no comparison", and the UI has to say so rather
 * than print a misleading number.
 */
export function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** "+12%" / "−8%" / "—". Uses a real minus sign, not a hyphen. */
export function formatDelta(pct: number | null): string {
  if (pct == null) return '—';
  if (pct === 0) return '0%';
  return pct > 0 ? `+${pct}%` : `−${Math.abs(pct)}%`;
}

/** Attainment → tone, so the colour and the number always agree. */
export function attainmentTone(pct: number, hasTarget: boolean): Tone {
  if (!hasTarget) return 'neutral';
  if (pct >= 100) return 'success';
  if (pct >= 80) return 'info';
  if (pct >= 50) return 'warning';
  return 'danger';
}

/** Pace check for an unfinished month: are they ahead of a straight-line target? */
export function paceRatio(
  attainmentPct: number,
  daysElapsed: number,
  daysInMonth: number,
): number | null {
  if (daysInMonth <= 0 || daysElapsed <= 0 || daysElapsed >= daysInMonth) return null;
  const expected = (daysElapsed / daysInMonth) * 100;
  if (expected <= 0) return null;
  return attainmentPct / expected;
}
