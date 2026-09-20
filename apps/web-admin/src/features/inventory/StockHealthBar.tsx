import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';

import { CHART_TOOLTIP_STYLE } from '@/features/dashboard/chartTheme';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface StockHealthBarProps {
  healthy: number;
  low: number;
  out: number;
  loading?: boolean;
}

const SEGMENTS = [
  { key: 'healthy', bar: 'bg-success', dot: 'bg-success', text: 'text-success', hsl: 'hsl(var(--success))' },
  { key: 'low', bar: 'bg-warning', dot: 'bg-warning', text: 'text-warning', hsl: 'hsl(var(--warning))' },
  { key: 'out', bar: 'bg-destructive', dot: 'bg-destructive', text: 'text-destructive', hsl: 'hsl(var(--destructive))' },
] as const;

/**
 * Wide "at a glance" stock-health visualization for the Inventory overview —
 * a segmented ratio bar (healthy / low / out) with a companion donut, hover
 * tooltips per segment, and a fill-in reveal on mount, so status distribution
 * reads as a shape, not just four separate numbers.
 */
export function StockHealthBar({ healthy, low, out, loading = false }: StockHealthBarProps) {
  const { t } = useTranslation();
  const total = healthy + low + out;
  const [filled, setFilled] = useState(false);

  const counts: Record<(typeof SEGMENTS)[number]['key'], number> = { healthy, low, out };
  const labels: Record<(typeof SEGMENTS)[number]['key'], string> = {
    healthy: t('inventory.health.healthy'),
    low: t('inventory.health.low'),
    out: t('inventory.health.out'),
  };

  useEffect(() => {
    if (loading) return;
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, [loading]);

  const pieData = SEGMENTS.map((s) => ({ name: labels[s.key], value: counts[s.key], color: s.hsl })).filter(
    (d) => d.value > 0,
  );

  if (loading) {
    return <div className="h-[110px] w-full animate-pulse rounded-lg border border-border bg-card" />;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          'rounded-lg border border-border bg-card p-4 shadow-sm',
          'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
        )}
        style={{ animationDelay: '180ms' }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-foreground">{t('inventory.health.title')}</p>
          <p className="text-xs text-muted-foreground">
            {t('inventory.health.totalHint', { count: total })}
          </p>
        </div>

        <div className="mt-3 flex items-center gap-4">
          {total > 0 ? (
            <div className="h-16 w-16 shrink-0" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    innerRadius="68%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                    isAnimationActive
                    animationDuration={700}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => [value, name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          <div className="min-w-0 flex-1">
            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={SEGMENTS.map((s) => `${labels[s.key]}: ${counts[s.key]}`).join(', ')}
            >
              {total === 0
                ? null
                : SEGMENTS.map((s) => {
                    const pct = (counts[s.key] / total) * 100;
                    if (pct <= 0) return null;
                    return (
                      <Tooltip key={s.key}>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              'h-full transition-[width] duration-700 ease-out first:rounded-l-full last:rounded-r-full',
                              s.bar,
                            )}
                            style={{ width: `${filled ? pct : 0}%` }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {labels[s.key]}: {counts[s.key]} ({Math.round(pct)}%)
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
              {SEGMENTS.map((s) => {
                const pct = total > 0 ? Math.round((counts[s.key] / total) * 100) : 0;
                return (
                  <div key={s.key} className="flex items-center gap-1.5 text-xs">
                    <span
                      className={cn('h-2 w-2 shrink-0 rounded-full', s.dot, s.key === 'out' && counts.out > 0 && 'animate-pulse')}
                      aria-hidden="true"
                    />
                    <span className="text-muted-foreground">{labels[s.key]}</span>
                    <span className={cn('font-semibold tabular-nums', s.text)}>{counts[s.key]}</span>
                    <span className="text-2xs text-muted-foreground">({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
