import { useEffect, useState } from 'react';
import { Check, HeartPulse, Hourglass } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PaymentStatus } from '@abcp/shared-types';

import { CurrencyText } from '@/components/shared';
import { cn } from '@/lib/utils';

import {
  AGING_BUCKETS,
  PAYMENT_STATUSES,
  paymentStatusKey,
  type AgingBucket,
  type LedgerInsights,
} from './finance.lib';

interface CollectionHealthCardProps {
  insights: LedgerInsights;
  loading?: boolean;
  activeStatus: PaymentStatus | '';
  onStatusSelect: (status: PaymentStatus | '') => void;
}

const STATUS_DOT: Record<PaymentStatus, string> = {
  FULLY_PAID: 'bg-success',
  DEPOSIT_PAID: 'bg-info',
  PENDING: 'bg-warning',
  REFUNDED: 'bg-muted-foreground/50',
  FAILED: 'bg-destructive',
  VOIDED: 'bg-muted-foreground/30',
};

const AGING_TONE: Record<AgingBucket, string> = {
  fresh: 'bg-success',
  week: 'bg-info',
  month: 'bg-warning',
  stale: 'bg-destructive',
};

/** Ring colour follows how healthy collection is — the % is always printed too. */
function rateTone(rate: number) {
  if (rate >= 85) return { stroke: 'hsl(var(--success))', text: 'text-success' };
  if (rate >= 60) return { stroke: 'hsl(var(--warning))', text: 'text-warning' };
  return { stroke: 'hsl(var(--destructive))', text: 'text-destructive' };
}

const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;

/**
 * "Are we actually getting paid?" — collection-rate ring, a status split whose
 * legend doubles as the table's status filter, and receivables aging so staff
 * can see whether the outstanding figure is last night's deposits or month-old
 * debt worth chasing.
 */
export function CollectionHealthCard({
  insights,
  loading = false,
  activeStatus,
  onStatusSelect,
}: CollectionHealthCardProps) {
  const { t } = useTranslation();
  const [filled, setFilled] = useState(false);
  const { collectionRate, statusCounts, aging, outstanding } = insights;
  const totalBills = PAYMENT_STATUSES.reduce((s, k) => s + statusCounts[k], 0);
  const tone = rateTone(collectionRate);
  const maxAging = Math.max(...AGING_BUCKETS.map((b) => aging[b].amount), 1);

  useEffect(() => {
    if (loading) return;
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, [loading]);

  if (loading) {
    return <div className="h-full min-h-[300px] w-full animate-pulse rounded-xl border border-border bg-card" />;
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
      )}
      style={{ animationDelay: '160ms' }}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-success-soft text-success">
          <HeartPulse className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold text-foreground">{t('finance.health.title')}</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative h-[76px] w-[76px] shrink-0">
          <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="38" cy="38" r={RING_R} fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
            <circle
              cx="38"
              cy="38"
              r={RING_R}
              fill="none"
              stroke={tone.stroke}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={filled ? RING_C * (1 - collectionRate / 100) : RING_C}
              className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
            />
          </svg>
          <span className={cn('absolute inset-0 flex items-center justify-center text-base font-semibold tabular-nums', tone.text)}>
            {collectionRate}%
          </span>
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs font-medium text-foreground">{t('finance.health.rate')}</p>
          <p className="text-2xs leading-relaxed text-muted-foreground">{t('finance.health.rateHint')}</p>
          <p className="text-2xs text-muted-foreground">
            {t('finance.health.owed')}{' '}
            <CurrencyText amount={outstanding} className="font-semibold text-warning" />
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-medium text-foreground">{t('finance.health.statusSplit')}</p>
          <p className="text-2xs tabular-nums text-muted-foreground">{t('finance.byMethodCount', { count: totalBills })}</p>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          {PAYMENT_STATUSES.map((s) =>
            statusCounts[s] > 0 ? (
              <span
                key={s}
                className={cn('h-full transition-[width] duration-700 ease-out', STATUS_DOT[s])}
                style={{ width: filled && totalBills > 0 ? `${(statusCounts[s] / totalBills) * 100}%` : '0%' }}
              />
            ) : null,
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PAYMENT_STATUSES.map((s) => {
            const active = activeStatus === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => onStatusSelect(active ? '' : s)}
                className={cn(
                  'inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active
                    ? 'border-primary bg-primary/10 font-medium text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                {active ? (
                  <Check className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[s])} aria-hidden="true" />
                )}
                {t(paymentStatusKey(s))}
                <span className="tabular-nums font-semibold text-foreground">{statusCounts[s]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Hourglass className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          {t('finance.health.aging')}
        </p>
        {outstanding === 0 ? (
          <p className="rounded-md bg-success-soft px-2.5 py-2 text-2xs text-success">{t('finance.health.agingClear')}</p>
        ) : (
          <ul className="space-y-1.5">
            {AGING_BUCKETS.map((b) => (
              <li key={b} className="grid grid-cols-[72px_1fr_auto] items-center gap-2 text-2xs">
                <span className="truncate text-muted-foreground">{t(`finance.health.bucket.${b}`)}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span
                    className={cn('block h-full rounded-full transition-[width] duration-700 ease-out', AGING_TONE[b])}
                    style={{ width: filled ? `${(aging[b].amount / maxAging) * 100}%` : '0%' }}
                  />
                </span>
                <span className="text-right">
                  <CurrencyText amount={aging[b].amount} className="font-medium text-foreground" />
                  <span className="ml-1 text-muted-foreground">({aging[b].count})</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
