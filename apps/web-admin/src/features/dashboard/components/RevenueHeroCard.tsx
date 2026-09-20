import { ArrowDownRight, ArrowRight, ArrowUpRight, Coins } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DashboardStats } from '@/types/models';

import { chartColor } from '../chartColors';

interface Props {
  revenue?: number;
  delta?: number; // ratio vs yesterday
  mix?: Array<Pick<DashboardStats['serviceMix'][number], 'name' | 'value'>>;
  /** Caption above the split bar — defaults to "Split by service category". */
  mixLabel?: string;
  /** When set, the card links here with hover + focus affordances. */
  to?: string;
  loading?: boolean;
  /** Position in a card grid — staggers the mount animation (0-based). */
  index?: number;
}

/**
 * Primary KPI — revenue today, over the brand ramp gradient (--primary →
 * --primary-hover → --primary-strong). The stacked bar + legend break the
 * figure down by service category using the shared chart palette.
 */
export function RevenueHeroCard({
  revenue = 0,
  delta = 0,
  mix = [],
  mixLabel,
  to,
  loading = false,
  index = 0,
}: Props) {
  const { t } = useTranslation();
  const total = mix.reduce((s, d) => s + d.value, 0);
  const pctText =
    Math.abs(delta) < 0.005 ? '0%' : `${delta > 0 ? '+' : ''}${Math.round(delta * 100)}%`;
  const DeltaIcon = delta > 0.005 ? ArrowUpRight : delta < -0.005 ? ArrowDownRight : null;
  const interactive = Boolean(to) && !loading;

  const className = cn(
    'group relative flex min-h-[188px] flex-col overflow-hidden rounded-lg bg-gradient-to-br from-primary via-primary-hover to-primary-strong p-3.5 text-primary-foreground shadow-md',
    // entrance — matches the KPI / count-card animation convention
    'animate-in fade-in zoom-in-95 slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
    interactive &&
      'cursor-pointer transition-all duration-150 hover:-translate-y-px hover:shadow-lg motion-reduce:transform-none',
  );
  const style: CSSProperties | undefined =
    index > 0 ? { animationDelay: `${Math.min(index, 12) * 40}ms` } : undefined;

  const content = (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl"
      />
      {interactive ? (
        <ArrowRight
          className="pointer-events-none absolute bottom-3 right-3 h-4 w-4 text-primary-foreground/70 opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        />
      ) : null}

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-primary-foreground/80">
            {t('dashboard.revenueToday')}
          </p>
          {loading ? (
            <div className="mt-1.5 h-7 w-36 animate-pulse rounded-md bg-white/25" />
          ) : (
            <p className="mt-1 text-xl font-semibold tabular-nums" title={String(revenue)}>
              {formatCurrency(revenue)}
            </p>
          )}
          {!loading ? (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary-foreground/85">
              {DeltaIcon ? <DeltaIcon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              {pctText} · {t('dashboard.vsYesterday')}
            </p>
          ) : null}
        </div>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/20">
          <Coins className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>

      <div className="relative mt-3">
        <p className="mb-1.5 text-[11px] font-medium text-primary-foreground/75">
          {mixLabel ?? t('dashboard.revenueShare')}
        </p>

        {loading ? (
          <div className="h-2 animate-pulse rounded-full bg-white/25" />
        ) : total > 0 ? (
          <div className="flex h-2 gap-px overflow-hidden rounded-full bg-white/25">
            {mix.map((d, i) => (
              <span
                key={d.name}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(d.value / total) * 100}%`, backgroundColor: chartColor(i) }}
              />
            ))}
          </div>
        ) : null}

        {!loading ? (
          <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
            {mix.map((d, i) => (
              <li key={d.name} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: chartColor(i) }}
                  />
                  <span className="truncate text-primary-foreground/80">{d.name}</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {total ? Math.round((d.value / total) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );

  return interactive && to ? (
    <Link to={to} className={className} style={style}>
      {content}
    </Link>
  ) : (
    <div className={className} style={style}>
      {content}
    </div>
  );
}
