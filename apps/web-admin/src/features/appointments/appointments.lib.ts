import type {
  AppointmentFlag,
  AppointmentPaymentState,
  AppointmentSortField,
  AppointmentStatus,
} from '@abcp/shared-types';
import { useEffect, useState } from 'react';

import { dayjs } from '@/lib/format';
import type { AppointmentListItem } from '@/types/models';

type Dayjs = ReturnType<typeof dayjs>;

export const STATUS_VALUES: AppointmentStatus[] = [
  'PENDING',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

/** Token-backed colour per status — shared by the rail, the bar, the board and the timeline. */
export const STATUS_COLOR: Record<AppointmentStatus, string> = {
  PENDING: 'hsl(var(--warning))',
  CONFIRMED: 'hsl(var(--info))',
  IN_PROGRESS: 'hsl(var(--primary))',
  COMPLETED: 'hsl(var(--success))',
  CANCELLED: 'hsl(var(--muted-foreground))',
  NO_SHOW: 'hsl(var(--destructive))',
};

/**
 * Which status a front-desk user can move an appointment to next.
 * Terminal states are intentionally dead ends — reopening a closed booking is a
 * different (auditable) operation, not a dropdown pick.
 */
export const NEXT_STATUS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

/** Changing to one of these loses money / can't be undone from the UI → confirm first. */
export const DESTRUCTIVE_STATUS: AppointmentStatus[] = ['CANCELLED', 'NO_SHOW'];

/** CANCELLED / NO_SHOW carry no realisable revenue. */
export const isDead = (s: AppointmentStatus) => s === 'CANCELLED' || s === 'NO_SHOW';
/** Still waiting on the customer or on a confirmation. */
export const isOpen = (s: AppointmentStatus) => s === 'PENDING' || s === 'CONFIRMED';

export function payState(a: AppointmentListItem): AppointmentPaymentState {
  if (a.depositPaid <= 0) return 'unpaid';
  if (a.depositPaid >= a.price) return 'paid';
  return 'partial';
}

export const balanceOf = (a: AppointmentListItem) =>
  isDead(a.status) ? 0 : Math.max(0, a.price - a.depositPaid);

// ── row flags ──────────────────────────────────────────────────────────────

/** Mirrors the server-side `AppointmentFlag` rules so a row's badges match the KPI counts. */
export interface RowFlags {
  /** Start time has passed but nobody started or closed it. */
  overdue: boolean;
  /** Still PENDING and starting within 24h. */
  unconfirmed: boolean;
  /** Service policy requires a deposit that has not been collected. */
  needsDeposit: boolean;
  /** Service ends within the next hour — worth keeping an eye on. */
  soon: boolean;
  unrated: boolean;
  /**
   * Overlaps another live booking of the same staff member / room / equipment.
   * Server-computed (`hasConflict`) — the browser only ever sees one page of
   * rows, so it cannot work this out for itself.
   */
  conflict: boolean;
}

export function flagsOf(a: AppointmentListItem, now = Date.now()): RowFlags {
  const start = new Date(a.startAt).getTime();
  const open = isOpen(a.status);
  return {
    overdue: open && start < now,
    unconfirmed: a.status === 'PENDING' && start >= now && start - now <= 24 * 3_600_000,
    needsDeposit: open && a.depositRequired > 0 && a.depositPaid < a.depositRequired,
    soon: open && start >= now && start - now <= 3_600_000,
    unrated: a.status === 'COMPLETED' && a.rating == null,
    conflict: a.hasConflict === true,
  };
}

/** Highest-priority flag first — the table shows at most one leading marker per row. */
export function primaryFlag(f: RowFlags): keyof RowFlags | null {
  if (f.conflict) return 'conflict';
  if (f.overdue) return 'overdue';
  if (f.needsDeposit) return 'needsDeposit';
  if (f.unconfirmed) return 'unconfirmed';
  if (f.soon) return 'soon';
  return null;
}

// ── date-range presets ─────────────────────────────────────────────────────

export const RANGE_PRESETS = [
  'today',
  'tomorrow',
  'next7',
  'next30',
  'thisMonth',
  'past7',
  'all',
  'custom',
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export interface DateRange {
  from?: string;
  to?: string;
}

/**
 * Preset → ISO window, anchored to the Vientiane day (not the browser's).
 * `dayjs` is already tz-defaulted to Asia/Vientiane in lib/format.
 */
export function rangeOf(preset: RangePreset, custom: DateRange): DateRange {
  const now = dayjs();
  const day = (d: Dayjs) => ({
    from: d.startOf('day').toISOString(),
    to: d.endOf('day').toISOString(),
  });
  switch (preset) {
    case 'today':
      return day(now);
    case 'tomorrow':
      return day(now.add(1, 'day'));
    case 'next7':
      return { from: now.startOf('day').toISOString(), to: now.add(7, 'day').endOf('day').toISOString() };
    case 'next30':
      return { from: now.startOf('day').toISOString(), to: now.add(30, 'day').endOf('day').toISOString() };
    case 'thisMonth':
      return { from: now.startOf('month').toISOString(), to: now.endOf('month').toISOString() };
    case 'past7':
      return { from: now.subtract(7, 'day').startOf('day').toISOString(), to: now.endOf('day').toISOString() };
    case 'custom':
      return {
        from: custom.from ? dayjs(custom.from).startOf('day').toISOString() : undefined,
        to: custom.to ? dayjs(custom.to).endOf('day').toISOString() : undefined,
      };
    case 'all':
    default:
      return {};
  }
}

// ── view modes ─────────────────────────────────────────────────────────────

export const VIEW_MODES = ['table', 'board', 'timeline', 'insights'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const SORT_FIELDS: AppointmentSortField[] = [
  'startAt',
  'createdAt',
  'price',
  'customer',
  'status',
];

export const FLAG_VALUES: AppointmentFlag[] = [
  'overdue',
  'unconfirmed',
  'needsDeposit',
  'conflict',
  'unrated',
];

// ── misc helpers ───────────────────────────────────────────────────────────

/** `90` → `1h 30m`, `45` → `45m`. */
export function formatDuration(min: number): string {
  if (min <= 0) return '–';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  // BOM so Excel opens Lao text in the right encoding.
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** localStorage-backed view preference — per viewer, best effort (private mode safe). */
export function usePref<T extends string>(key: string, allowed: readonly T[], fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(key) as T | null;
      return v && allowed.includes(v) ? v : fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode — best effort */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

/** Re-renders on an interval so "overdue"/"starts in" badges stay honest without a refetch. */
export function useTicker(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Signed minutes from now to `iso` (negative = in the past). */
export function minutesFromNow(iso: string, now = Date.now()): number {
  return Math.round((new Date(iso).getTime() - now) / 60_000);
}

// ── tone tokens ────────────────────────────────────────────────────────────

export type Tone = 'warning' | 'info' | 'primary' | 'success' | 'danger' | 'neutral' | 'accent';

/** Tone → static Tailwind classes. Static strings so the JIT can see every class. */
export const TONE: Record<Tone, { chip: string; bar: string; ring: string; text: string }> = {
  warning: {
    chip: 'bg-warning-soft text-warning',
    bar: 'bg-warning',
    ring: 'border-warning/50 ring-warning/30',
    text: 'text-warning',
  },
  info: {
    chip: 'bg-info-soft text-info',
    bar: 'bg-info',
    ring: 'border-info/50 ring-info/30',
    text: 'text-info',
  },
  primary: {
    chip: 'bg-primary/10 text-primary',
    bar: 'bg-primary',
    ring: 'border-primary/50 ring-primary/30',
    text: 'text-primary',
  },
  success: {
    chip: 'bg-success-soft text-success',
    bar: 'bg-success',
    ring: 'border-success/50 ring-success/30',
    text: 'text-success',
  },
  danger: {
    chip: 'bg-destructive-soft text-destructive',
    bar: 'bg-destructive',
    ring: 'border-destructive/50 ring-destructive/30',
    text: 'text-destructive',
  },
  accent: {
    chip: 'bg-accent-soft text-accent-foreground',
    bar: 'bg-accent',
    ring: 'border-accent/50 ring-accent/30',
    text: 'text-accent-foreground',
  },
  neutral: {
    chip: 'bg-muted text-muted-foreground',
    bar: 'bg-muted-foreground/40',
    ring: 'border-border ring-border',
    text: 'text-muted-foreground',
  },
};

/** Categorical palette for the ranked bars — matches the chart tokens. */
export const RANK_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
];
