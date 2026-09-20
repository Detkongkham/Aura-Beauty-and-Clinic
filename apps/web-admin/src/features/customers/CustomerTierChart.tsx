import { Check, Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { TIER_COLOR, TIER_ORDER, type TierKey } from './tierMeta';

export type TierCounts = Record<TierKey, number>;

interface CustomerTierChartProps {
  counts: TierCounts;
  loading?: boolean;
  /** Currently applied tier filter (`''` = none). */
  activeTier: string;
  onSelectTier: (tier: string) => void;
}

/**
 * Loyalty-tier mix — a rounded-segment donut with a KPI in the hole, paired with
 * a legend of share bars that doubles as the tier filter. Card frame matches the
 * sibling insight charts; colours are locked to {@link TIER_COLOR}.
 */
export function CustomerTierChart({
  counts,
  loading = false,
  activeTier,
  onSelectTier,
}: CustomerTierChartProps) {
  const { t } = useTranslation();

  const rows = TIER_ORDER.map((key) => ({
    key,
    color: TIER_COLOR[key],
    filterable: key !== 'NONE',
    label: key === 'NONE' ? t('customers.noTier') : t(`customers.${key}`),
    value: counts[key],
  }));
  const total = rows.reduce((n, r) => n + r.value, 0);
  const data = rows.filter((r) => r.value > 0);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-primary/20 bg-gradient-to-br from-primary-subtle/70 to-card p-4 shadow-sm animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out motion-reduce:animate-none">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Crown className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="text-[13px] font-semibold text-foreground">{t('customers.tierMix')}</h3>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center gap-5">
          <Skeleton className="h-28 w-28 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </div>
      ) : total === 0 ? (
        <p className="flex flex-1 items-center justify-center py-6 text-center text-xs text-muted-foreground">
          {t('customers.empty')}
        </p>
      ) : (
        <div className="flex flex-1 items-center gap-5">
          <div
            className="relative h-28 w-28 shrink-0"
            role="img"
            aria-label={t('customers.tierMixAria')}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={38}
                  outerRadius={54}
                  paddingAngle={3}
                  cornerRadius={4}
                  stroke="none"
                >
                  {data.map((d) => {
                    const on = !activeTier || activeTier === d.key;
                    return (
                      <Cell
                        key={d.key}
                        fill={d.color}
                        opacity={on ? 1 : 0.24}
                        stroke={activeTier === d.key ? 'hsl(var(--card))' : 'none'}
                        strokeWidth={2}
                      />
                    );
                  })}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value} · ${Math.round((value / total) * 100)}%`,
                    name,
                  ]}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid hsl(var(--border))',
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold leading-none tabular-nums text-foreground">
                {total}
              </span>
              <span className="mt-0.5 max-w-[68px] truncate text-[10px] text-muted-foreground">
                {t('nav.customers')}
              </span>
            </div>
          </div>

          <ul className="min-w-0 flex-1 space-y-1 text-sm">
            {rows.map((r) => {
              const pct = total ? Math.round((r.value / total) * 100) : 0;
              const isActive = activeTier === r.key;
              const dimmed = Boolean(activeTier) && !isActive && r.filterable;
              const body = (
                <>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-[4px]"
                      style={{ backgroundColor: r.color }}
                      aria-hidden="true"
                    />
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-[13px]',
                        isActive ? 'font-semibold text-primary' : 'font-medium text-foreground',
                      )}
                    >
                      {r.label}
                    </span>
                    {isActive ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    ) : null}
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums text-foreground">
                      {r.value}
                    </span>
                    <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                      {pct}%
                    </span>
                  </div>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                      style={{ width: `${pct}%`, backgroundColor: r.color }}
                    />
                  </span>
                </>
              );
              const base = 'block w-full rounded-lg px-2 py-1.5 text-left transition-colors';
              return (
                <li key={r.key}>
                  {r.filterable ? (
                    <button
                      type="button"
                      onClick={() => onSelectTier(isActive ? '' : r.key)}
                      aria-pressed={isActive}
                      title={t('customers.filterByTier', { tier: r.label })}
                      className={cn(
                        base,
                        'hover:bg-card/70',
                        isActive && 'bg-card shadow-sm ring-1 ring-inset ring-primary/30',
                        dimmed && 'opacity-45',
                      )}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className={cn(base, 'opacity-80')}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
