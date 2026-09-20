import dayjs from 'dayjs';
import type { PaymentMethod, PaymentStatus, PaymentView } from '@abcp/shared-types';

import type { BadgeProps } from '@/components/ui/badge';
import { APP_TIMEZONE } from '@/lib/constants';
// Side-effect: registers dayjs utc/timezone plugins used by `.tz()` below.
import '@/lib/format';

export const PAYMENT_STATUS_VARIANT: Record<PaymentStatus, NonNullable<BadgeProps['variant']>> = {
  PENDING: 'warning',
  DEPOSIT_PAID: 'info',
  FULLY_PAID: 'success',
  REFUNDED: 'neutral',
  FAILED: 'danger',
};

/** i18n key suffix under `finance.method.*` and `finance.status.*`. */
export const paymentStatusKey = (s: PaymentStatus) => `finance.status.${s}`;
export const paymentMethodKey = (m: PaymentMethod) => `finance.method.${m}`;

export const PAYMENT_METHODS: PaymentMethod[] = [
  'CASH',
  'BCEL_ONE_QR',
  'CREDIT_CARD',
  'GIFT_CARD',
  'LOYALTY_POINTS',
  'PACKAGE_CREDIT',
];

export const PAYMENT_STATUSES: PaymentStatus[] = [
  'PENDING',
  'DEPOSIT_PAID',
  'FULLY_PAID',
  'REFUNDED',
  'FAILED',
];

// ---- ledger insights (client-side, derived from one capped fetch) ----------

export interface TrendPoint {
  key: string;
  billed: number;
  collected: number;
  count: number;
}

export type AgingBucket = 'fresh' | 'week' | 'month' | 'stale';
export const AGING_BUCKETS: AgingBucket[] = ['fresh', 'week', 'month', 'stale'];

export interface LedgerInsights {
  series: TrendPoint[];
  granularity: 'day' | 'week';
  statusCounts: Record<PaymentStatus, number>;
  billed: number;
  collected: number;
  outstanding: number;
  /** 0–100, collected ÷ billed on non-refunded, non-failed bills. */
  collectionRate: number;
  aging: Record<AgingBucket, { amount: number; count: number }>;
  peak: TrendPoint | null;
}

const vte = (v: string | Date) => dayjs(v).tz(APP_TIMEZONE);

function agingBucket(days: number): AgingBucket {
  if (days <= 2) return 'fresh';
  if (days <= 7) return 'week';
  if (days <= 30) return 'month';
  return 'stale';
}

/**
 * Everything the overview charts need from a page of payments: a gap-free time
 * series (daily up to ~2 months, weekly beyond so the chart stays legible),
 * per-status counts, collection rate and a receivables-aging split.
 */
export function buildLedgerInsights(payments: PaymentView[], from: string, to: string): LedgerInsights {
  const start = vte(from).startOf('day');
  const end = vte(to).startOf('day');
  const spanDays = Math.max(0, end.diff(start, 'day'));
  const granularity: 'day' | 'week' = spanDays > 62 ? 'week' : 'day';
  const bucketKey = (d: dayjs.Dayjs) =>
    (granularity === 'week' ? d.startOf('week') : d.startOf('day')).format('YYYY-MM-DD');

  const buckets = new Map<string, TrendPoint>();
  for (let d = start; !d.isAfter(end, 'day'); d = d.add(1, granularity)) {
    const key = bucketKey(d);
    buckets.set(key, { key, billed: 0, collected: 0, count: 0 });
  }

  const statusCounts = Object.fromEntries(PAYMENT_STATUSES.map((s) => [s, 0])) as Record<PaymentStatus, number>;
  const aging = Object.fromEntries(AGING_BUCKETS.map((b) => [b, { amount: 0, count: 0 }])) as LedgerInsights['aging'];
  const now = dayjs();
  let billed = 0;
  let collected = 0;
  let outstanding = 0;

  for (const p of payments) {
    statusCounts[p.paymentStatus] += 1;
    if (p.paymentStatus === 'REFUNDED' || p.paymentStatus === 'FAILED') continue;
    billed += p.totalAmount;
    collected += p.paidAmount;
    const point = buckets.get(bucketKey(vte(p.createdAt)));
    if (point) {
      point.billed += p.totalAmount;
      point.collected += p.paidAmount;
      point.count += 1;
    }
    if (p.balanceAmount > 0) {
      outstanding += p.balanceAmount;
      const bucket = aging[agingBucket(now.diff(dayjs(p.createdAt), 'day'))];
      bucket.amount += p.balanceAmount;
      bucket.count += 1;
    }
  }

  const series = [...buckets.values()];
  const peak = series.reduce<TrendPoint | null>((best, p) => (p.collected > (best?.collected ?? 0) ? p : best), null);

  return {
    series,
    granularity,
    statusCounts,
    billed,
    collected,
    outstanding,
    collectionRate: billed > 0 ? Math.round((collected / billed) * 100) : 0,
    aging,
    peak,
  };
}

/** Distinct tender methods on a bill, in first-used order. */
export function paymentMethodsOf(p: PaymentView): PaymentMethod[] {
  return [...new Set(p.transactions.filter((tx) => tx.status === 'SUCCESS').map((tx) => tx.method))];
}
