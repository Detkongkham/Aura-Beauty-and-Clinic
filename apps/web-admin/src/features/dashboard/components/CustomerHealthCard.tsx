import { Crown, Footprints, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DashboardStats } from '@/types/models';

/**
 * Retention (returning vs first-visit split), VIP + walk-in share, the 1–5★ rating
 * histogram for the period, and the two newest reviews.
 */
export function CustomerHealthCard({ data }: { data: DashboardStats }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'lo';
  const { activeCustomers, returningCustomers } = data.period;
  const firstVisit = Math.max(0, activeCustomers - returningCustomers);
  const returningPct = activeCustomers
    ? Math.round((returningCustomers / activeCustomers) * 100)
    : 0;
  const vipPct = data.totalCustomers
    ? Math.round((data.vipCustomers / data.totalCustomers) * 100)
    : 0;
  const walkinPct = Math.round(data.walkinRate14d * 100);
  const { avg, count, distribution } = data.rating;
  const maxBucket = Math.max(1, ...distribution);

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {t('dashboard.customers.active', { count: activeCustomers })}
          </p>
          <p className="text-sm font-semibold tabular-nums text-primary">{returningPct}%</p>
        </div>
        <div
          className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${t('dashboard.customers.returning')} ${returningPct}%`}
        >
          <span
            className="h-full rounded-l-full bg-primary transition-[width] duration-500"
            style={{ width: `${returningPct}%` }}
          />
          <span className="h-full flex-1 rounded-r-full bg-accent/70" />
        </div>
        <div className="mt-1.5 flex justify-between text-xs">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
            {t('dashboard.customers.returning')}
            <span className="font-semibold tabular-nums text-foreground">{returningCustomers}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent/70" />
            {t('dashboard.customers.firstVisit')}
            <span className="font-semibold tabular-nums text-foreground">{firstVisit}</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MiniStat
          icon={<Crown className="h-3.5 w-3.5" aria-hidden="true" />}
          label={t('dashboard.customers.vip')}
          value={`${data.vipCustomers}`}
          sub={`${vipPct}%`}
          className="bg-accent-soft text-accent-foreground"
        />
        <MiniStat
          icon={<Footprints className="h-3.5 w-3.5" aria-hidden="true" />}
          label={t('dashboard.customers.walkin')}
          value={`${walkinPct}%`}
          className="bg-info-soft text-info"
        />
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/30 p-3">
        <div className="shrink-0 text-center">
          <p className="text-2xl font-semibold leading-none tabular-nums">
            {count ? avg.toFixed(1) : '—'}
          </p>
          <Stars value={avg} />
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t('dashboard.kpi.ratingHint', { count })}
          </p>
        </div>
        <ul
          className="min-w-0 flex-1 space-y-0.5"
          aria-label={t('dashboard.customers.ratingTitle')}
        >
          {[5, 4, 3, 2, 1].map((star) => {
            const n = distribution[star - 1] ?? 0;
            return (
              <li key={star} className="flex items-center gap-1.5 text-[11px]">
                <span className="w-3 tabular-nums text-muted-foreground">{star}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      star <= 2 ? 'bg-destructive' : star === 3 ? 'bg-warning' : 'bg-accent',
                    )}
                    style={{ width: `${(n / maxBucket) * 100}%` }}
                  />
                </div>
                <span className="w-5 text-right tabular-nums text-muted-foreground">{n}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {data.recentReviews.length ? (
        <ul className="-mx-1 space-y-1">
          {data.recentReviews.slice(0, 2).map((r) => (
            <li key={r.id} className="flex gap-2.5 rounded-lg px-1 py-1.5">
              <PersonAvatar name={r.customerName} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-medium">{r.customerName}</p>
                  <Stars value={r.rating} small />
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  {r.comment ? `“${r.comment}”` : `${r.serviceName} · ${r.staffName}`}
                </p>
                <p className="text-[10px] text-muted-foreground/80">
                  {formatRelative(r.createdAt, locale)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">{t('dashboard.customers.noReviews')}</p>
      )}
    </div>
  );
}

function Stars({ value, small = false }: { value: number; small?: boolean }) {
  return (
    <span className="mt-1 inline-flex gap-px" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn(
            small ? 'h-2.5 w-2.5' : 'h-3 w-3',
            i <= Math.round(value) ? 'fill-accent text-accent' : 'text-muted-foreground/40',
          )}
        />
      ))}
    </span>
  );
}

function MiniStat({
  icon,
  label,
  value,
  sub,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  className: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border p-2.5">
      <span
        className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', className)}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold tabular-nums">
          {value}
          {sub ? (
            <span className="ml-1 text-[11px] font-normal text-muted-foreground">{sub}</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
