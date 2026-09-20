import { Clock, Coins, LayoutGrid, Power, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CardCount } from '@/components/shared/CardCount';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { cn } from '@/lib/utils';

import { useServiceStats } from './services.api';

const ICON = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary';
/** Hero (Total) card — filled chip instead of the tinted one the rest use. */
const ICON_HERO =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm';
/** Shared polish for the KPI strip — a faint vertical wash + hairline border. */
const CARD_SHELL = 'border-border/70 bg-gradient-to-b from-card to-muted/25';
/** The one featured metric gets a primary-tinted wash and a soft ring. */
const CARD_HERO =
  'border-primary/20 bg-gradient-to-br from-primary-subtle/60 via-card to-card ring-1 ring-primary/10';

/** chart-1..6, cycled, at a consistent 0.85 alpha. */
const catColor = (i: number) => `hsl(var(--chart-${(i % 6) + 1}) / 0.85)`;

interface Props {
  /** Current `isActive` filter on the page ('', 'true' or 'false'). */
  activeFilter: string;
  onActiveFilterChange: (value: string) => void;
}

/** KPI strip + "by category" bar list above the Services table. Fed by the
 *  server-aggregated `/services/stats` endpoint — never the paginated list. */
export function ServicesStats({ activeFilter, onActiveFilterChange }: Props) {
  const { t } = useTranslation();
  const { data, isLoading } = useServiceStats();

  // Grow the bars from 0 on first paint.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    if (!data) return;
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[76px] animate-pulse rounded-lg border border-border bg-muted/40" />
        ))}
      </div>
    );
  }

  const cycleActive = () =>
    onActiveFilterChange(activeFilter === '' ? 'true' : activeFilter === 'true' ? 'false' : '');

  const maxCount = Math.max(...data.byCategory.map((c) => c.count), 1);
  const spectrumTotal = data.byCategory.reduce((sum, c) => sum + c.count, 0) || 1;
  const topCats = data.byCategory.slice(0, 8);
  const restCount = data.byCategory.length - topCats.length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <CardCount
          index={0}
          className={CARD_HERO}
          icon={
            <span className={ICON_HERO}>
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            </span>
          }
          label={t('services.stats.total')}
          value={data.total}
        />
        <CardCount
          index={1}
          className={CARD_SHELL}
          icon={
            <span className={ICON}>
              <Power className="h-4 w-4" aria-hidden="true" />
            </span>
          }
          label={t('services.stats.active')}
          value={
            <span className="tabular-nums">
              <span className="text-success">{data.active}</span>
              <span className="text-muted-foreground"> / {data.inactive}</span>
            </span>
          }
          onClick={cycleActive}
          active={activeFilter !== ''}
        />
        <CardCount
          index={2}
          className={CARD_SHELL}
          icon={
            <span className={ICON}>
              <Coins className="h-4 w-4" aria-hidden="true" />
            </span>
          }
          label={t('services.stats.avgPrice')}
          value={<CurrencyText amount={data.avgPrice} />}
        />
        <CardCount
          index={3}
          className={CARD_SHELL}
          icon={
            <span className={ICON}>
              <Clock className="h-4 w-4" aria-hidden="true" />
            </span>
          }
          label={t('services.stats.avgDuration')}
          value={
            <span className="tabular-nums">
              {data.avgDuration}{' '}
              <span className="text-sm font-normal text-muted-foreground">
                {t('services.stats.min')}
              </span>
            </span>
          }
        />
        <CardCount
          index={4}
          className={CARD_SHELL}
          icon={
            <span className={ICON}>
              <Wallet className="h-4 w-4" aria-hidden="true" />
            </span>
          }
          label={t('services.stats.withDeposit')}
          value={data.withDeposit}
        />
      </div>

      {/* "By category" — signature panel: a single proportion spectrum on top of
          a ranked bar list, wrapped in a card with a gold hairline + corner glow. */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-500 ease-out motion-reduce:animate-none">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 -top-20 h-44 w-44 rounded-full bg-primary/5 blur-2xl"
        />

        <div className="relative">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">{t('services.stats.byCategory')}</p>
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
              {data.total} · {data.byCategory.length} {t('nav.categories')}
            </span>
          </div>

          {/* Proportion spectrum — every category as one glanceable strip. */}
          <div className="mb-4 flex h-2.5 gap-px overflow-hidden rounded-full bg-muted/70">
            {data.byCategory.map((c, i) => (
              <span
                key={c.id}
                title={`${c.name} · ${c.count}`}
                className="h-full transition-[flex-grow] duration-700 ease-out motion-reduce:transition-none"
                style={{
                  flexGrow: grown ? c.count : 0,
                  flexBasis: 0,
                  minWidth: grown && c.count ? 2 : 0,
                  backgroundColor: catColor(i),
                }}
              />
            ))}
            <span className="sr-only">
              {data.byCategory.map((c) => `${c.name}: ${Math.round((c.count / spectrumTotal) * 100)}%`).join(', ')}
            </span>
          </div>

          <ul className="space-y-0.5">
            {topCats.map((c, i) => (
              <li
                key={c.id}
                className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-muted/50 animate-in fade-in slide-in-from-left-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <span className="w-5 shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground/70">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="flex w-24 shrink-0 items-center gap-1.5 sm:w-36" title={c.name}>
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: catColor(i) }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                    {c.name}
                  </span>
                </span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted/70">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none"
                    style={{
                      width: grown ? `${(c.count / maxCount) * 100}%` : '0%',
                      backgroundColor: catColor(i),
                    }}
                  />
                </span>
                <span
                  className={cn(
                    'w-7 shrink-0 text-right text-xs font-semibold tabular-nums',
                    i === 0 ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {c.count}
                </span>
              </li>
            ))}
          </ul>

          {restCount > 0 ? (
            <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-2.5">
              <span className="flex -space-x-1" aria-hidden="true">
                {[0, 1, 2].map((k) => (
                  <span
                    key={k}
                    className="h-2 w-2 rounded-full ring-1 ring-card"
                    style={{ backgroundColor: catColor(topCats.length + k) }}
                  />
                ))}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t('services.stats.others', { count: restCount })}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
