import type { BranchAmenity, BranchInsight } from '@abcp/shared-types';
import { Baby, Coffee, CreditCard, Sofa, SquareParking, Wifi, type LucideIcon } from 'lucide-react';

import { formatDelta, type Tone } from '@/features/payroll/payroll.lib';
import type { Branch } from '@/types/models';

export const AMENITY_IDS: BranchAmenity[] = ['wifi', 'parking', 'drink', 'lounge', 'kids', 'card'];

export const AMENITY_ICON: Record<BranchAmenity, LucideIcon> = {
  wifi: Wifi,
  parking: SquareParking,
  drink: Coffee,
  lounge: Sofa,
  kids: Baby,
  card: CreditCard,
};

/** Deterministic hue in the brand's violet → rose → teal arc (avoids pure red/green, which read as status). */
export function branchHue(seed: string, alpha = 1): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = [262, 280, 300, 322, 200, 186, 228, 244][h % 8];
  return `hsl(${hue} 62% 52% / ${alpha})`;
}

export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];

export type BranchView = 'cards' | 'map' | 'compare';
export type StatusFilter = 'all' | 'open' | 'closed' | 'attention';
export type SortKey = 'revenue' | 'bookings' | 'utilization' | 'rating' | 'name' | 'issues';

const toMin = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Open state + the next schedule boundary (close time if open, else open time). Handles past-midnight. */
export function openState(open: string, close: string, now: string): { isOpen: boolean; boundary: string } {
  if (!open || !close) return { isOpen: false, boundary: open || close };
  const isOpen =
    open === close ? true : open < close ? now >= open && now < close : now >= open || now < close;
  return { isOpen, boundary: isOpen ? close : open };
}

/** Minutes open per day (open === close → 24h). */
export function openMinutes(open: string, close: string): number {
  let span = toMin(close) - toMin(open);
  if (span <= 0) span += 24 * 60;
  return span;
}

export function weeklyHours(open: string, close: string): number {
  return Math.round((openMinutes(open, close) / 60) * 7);
}

/** How far through today's opening window `now` is, 0–1 (null when closed). */
export function dayProgress(open: string, close: string, now: string): number | null {
  if (!openState(open, close, now).isOpen) return null;
  let elapsed = toMin(now) - toMin(open);
  if (elapsed < 0) elapsed += 24 * 60;
  return Math.min(1, elapsed / openMinutes(open, close));
}

export function hasCoords(b: Pick<Branch, 'latitude' | 'longitude'>): boolean {
  return (
    Number.isFinite(b.latitude) && Number.isFinite(b.longitude) && (b.latitude !== 0 || b.longitude !== 0)
  );
}

/** Fractional change vs the previous window; null when there is no baseline. */
export function deltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null;
  return (curr - prev) / prev;
}

/** A fractional change (0.12) as the house delta string (+12%). */
export function fmtDelta(frac: number | null): string {
  return formatDelta(frac == null ? null : Math.round(frac * 100));
}

/** Cancellations + no-shows as a share of all bookings in the window. */
export function lossRate(i: BranchInsight): number | null {
  const n = i.period.bookings;
  return n > 0 ? (i.period.cancelled + i.period.noShow) / n : null;
}

export type IssueKind =
  | 'closedWithBookings'
  | 'noStaff'
  | 'noServices'
  | 'queueBacklog'
  | 'unpaid'
  | 'lowStock'
  | 'highLoss'
  | 'lowRating'
  | 'noCoords'
  | 'noPhone'
  | 'closureSoon';

export type BranchIssue = {
  kind: IssueKind;
  tone: Extract<Tone, 'danger' | 'warning' | 'info'>;
  /** Interpolation values for the `branches.issue.<kind>` string. */
  values: Record<string, string | number>;
};

const SEVERITY: Record<BranchIssue['tone'], number> = { danger: 0, warning: 1, info: 2 };

/**
 * Everything worth a manager's attention for one branch, most severe first.
 * Thresholds are deliberately conservative so a quiet branch doesn't light up.
 */
export function branchIssues(b: Branch, i: BranchInsight | undefined, todayKey?: string): BranchIssue[] {
  const out: BranchIssue[] = [];
  if (!b.isActive && i && i.upcomingAppointments > 0)
    out.push({ kind: 'closedWithBookings', tone: 'danger', values: { count: i.upcomingAppointments } });
  if (b.isActive && i && i.staffCount === 0) out.push({ kind: 'noStaff', tone: 'danger', values: {} });
  if (b.isActive && i && i.serviceCount === 0) out.push({ kind: 'noServices', tone: 'danger', values: {} });
  if (i && i.today.queueWaiting >= 5)
    out.push({ kind: 'queueBacklog', tone: 'warning', values: { count: i.today.queueWaiting } });
  if (i && i.outstandingBills > 0)
    out.push({ kind: 'unpaid', tone: 'warning', values: { count: i.outstandingBills, amount: i.outstandingAmount } });
  if (i && i.lowStock > 0) out.push({ kind: 'lowStock', tone: 'warning', values: { count: i.lowStock } });
  const loss = i ? lossRate(i) : null;
  if (i && loss != null && i.period.bookings >= 5 && loss >= 0.2)
    out.push({ kind: 'highLoss', tone: 'warning', values: { pct: Math.round(loss * 100) } });
  if (i && i.rating.avg != null && i.rating.count >= 3 && i.rating.avg < 4)
    out.push({ kind: 'lowRating', tone: 'warning', values: { avg: i.rating.avg.toFixed(1) } });
  if (!hasCoords(b)) out.push({ kind: 'noCoords', tone: 'info', values: {} });
  if (!b.phone) out.push({ kind: 'noPhone', tone: 'info', values: {} });
  const next = i?.closures[0];
  if (next && todayKey && daysBetween(todayKey, next.date) <= 14)
    out.push({ kind: 'closureSoon', tone: 'info', values: { date: next.date, reason: next.reason } });
  return out.sort((a, z) => SEVERITY[a.tone] - SEVERITY[z.tone]);
}

export type Health = 'good' | 'watch' | 'risk';
export function healthOf(issues: BranchIssue[]): Health {
  if (issues.some((x) => x.tone === 'danger')) return 'risk';
  if (issues.some((x) => x.tone === 'warning')) return 'watch';
  return 'good';
}
export const HEALTH_TONE: Record<Health, Tone> = { good: 'success', watch: 'warning', risk: 'danger' };

export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

/** Setup completeness — what a branch needs before it runs smoothly. */
export type SetupCheck = { key: 'code' | 'phone' | 'email' | 'coords' | 'staff' | 'rooms' | 'services' | 'amenities'; ok: boolean };
export function setupChecks(b: Branch, i: BranchInsight | undefined): SetupCheck[] {
  return [
    { key: 'code', ok: Boolean(b.code) },
    { key: 'phone', ok: Boolean(b.phone) },
    { key: 'email', ok: Boolean(b.email) },
    { key: 'coords', ok: hasCoords(b) },
    { key: 'staff', ok: (i?.staffCount ?? 0) > 0 },
    { key: 'rooms', ok: (i?.roomCount ?? 0) > 0 },
    { key: 'services', ok: (i?.serviceCount ?? 0) > 0 },
    { key: 'amenities', ok: (b.amenities?.length ?? 0) > 0 },
  ];
}

export type NetworkTotals = {
  revenue: number;
  revenuePrev: number;
  bookings: number;
  bookingsPrev: number;
  todayAppointments: number;
  todayInProgress: number;
  todayRevenue: number;
  queueWaiting: number;
  staff: number;
  customers: number;
  lossRate: number | null;
  /** Review-count-weighted average. */
  rating: number | null;
  ratingCount: number;
  /** Staff-capacity-weighted average over branches that have staff. */
  utilization: number | null;
  daily: number[];
};

export function networkTotals(items: BranchInsight[]): NetworkTotals {
  const sum = (f: (i: BranchInsight) => number) => items.reduce((s, i) => s + f(i), 0);
  const bookings = sum((i) => i.period.bookings);
  const ratingCount = sum((i) => i.rating.count);
  const withUtil = items.filter((i) => i.period.utilization != null && i.staffCount > 0);
  const staffW = withUtil.reduce((s, i) => s + i.staffCount, 0);
  const len = Math.max(0, ...items.map((i) => i.period.daily.length));
  return {
    revenue: sum((i) => i.period.revenue),
    revenuePrev: sum((i) => i.period.revenuePrev),
    bookings,
    bookingsPrev: sum((i) => i.period.bookingsPrev),
    todayAppointments: sum((i) => i.today.appointments),
    todayInProgress: sum((i) => i.today.inProgress),
    todayRevenue: sum((i) => i.today.revenue),
    queueWaiting: sum((i) => i.today.queueWaiting),
    staff: sum((i) => i.staffCount),
    customers: sum((i) => i.period.customers),
    lossRate: bookings > 0 ? sum((i) => i.period.cancelled + i.period.noShow) / bookings : null,
    rating: ratingCount > 0 ? sum((i) => (i.rating.avg ?? 0) * i.rating.count) / ratingCount : null,
    ratingCount,
    utilization: staffW > 0 ? withUtil.reduce((s, i) => s + (i.period.utilization ?? 0) * i.staffCount, 0) / staffW : null,
    daily: Array.from({ length: len }, (_, d) => sum((i) => i.period.daily[d] ?? 0)),
  };
}

export type Row = { branch: Branch; insight: BranchInsight | undefined; issues: BranchIssue[] };

export function sortRows(rows: Row[], key: SortKey): Row[] {
  const num = (r: Row): number => {
    const i = r.insight;
    switch (key) {
      case 'revenue':
        return i?.period.revenue ?? -1;
      case 'bookings':
        return i?.period.bookings ?? -1;
      case 'utilization':
        return i?.period.utilization ?? -1;
      case 'rating':
        return i?.rating.avg ?? -1;
      case 'issues':
        return r.issues.reduce((s, x) => s + (3 - SEVERITY[x.tone]) * 10, 0);
      default:
        return 0;
    }
  };
  return [...rows].sort((a, z) =>
    key === 'name' ? a.branch.name.localeCompare(z.branch.name) : num(z) - num(a) || a.branch.name.localeCompare(z.branch.name),
  );
}

export function matchesQuery(b: Branch, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [b.name, b.code, b.address, b.phone].some((v) => (v ?? '').toLowerCase().includes(needle));
}
