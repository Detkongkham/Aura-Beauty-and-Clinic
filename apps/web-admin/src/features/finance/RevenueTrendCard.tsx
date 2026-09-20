import { useId } from 'react';
import { Activity, Flame } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CurrencyText } from '@/components/shared';
import {
  CHART_AXIS_TICK,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from '@/features/dashboard/chartTheme';
import { formatCompactNumber, formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import type { LedgerInsights } from './finance.lib';

interface RevenueTrendCardProps {
  insights: LedgerInsights;
  loading?: boolean;
  /** True when the range holds more bills than the overview fetched. */
  truncated?: boolean;
}

/**
 * Billed-vs-collected trend for the selected range. Collected is the solid
 * filled area, billed a dashed line on top — the gap between the two *is* the
 * money still owed, so series are told apart by line style, not hue alone.
 */
export function RevenueTrendCard({ insights, loading = false, truncated = false }: RevenueTrendCardProps) {
  const { t } = useTranslation();
  const gradientId = useId().replace(/:/g, '');
  const { series, billed, collected, peak, granularity } = insights;
  const hasData = series.some((p) => p.billed > 0);
  const tickLabel = (key: string) => formatDate(key).replace(/\/\d{4}$/, '');

  if (loading) {
    return <div className="h-full min-h-[300px] w-full animate-pulse rounded-xl border border-border bg-card" />;
  }

  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-sm',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
      )}
      style={{ animationDelay: '120ms' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{t('finance.trend.title')}</p>
            <p className="text-2xs text-muted-foreground">
              {t(granularity === 'week' ? 'finance.trend.weekly' : 'finance.trend.daily')}
              {truncated ? ` · ${t('finance.trend.truncated')}` : ''}
            </p>
          </div>
        </div>

        <dl className="flex flex-wrap items-start gap-x-5 gap-y-2">
          <div>
            <dt className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
              {t('finance.trend.collected')}
            </dt>
            <dd>
              <CurrencyText amount={collected} className="text-sm font-semibold text-foreground" />
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <span className="w-3 border-t-2 border-dashed border-muted-foreground" aria-hidden="true" />
              {t('finance.trend.billed')}
            </dt>
            <dd>
              <CurrencyText amount={billed} className="text-sm font-semibold text-muted-foreground" />
            </dd>
          </div>
          {peak ? (
            <div className="rounded-md bg-accent/10 px-2 py-1">
              <dt className="flex items-center gap-1 text-2xs text-muted-foreground">
                <Flame className="h-3 w-3 text-accent" aria-hidden="true" />
                {t('finance.trend.peak')}
              </dt>
              <dd className="text-xs font-semibold text-foreground">
                {tickLabel(peak.key)} · {formatCompactNumber(peak.collected)}
              </dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="mt-3 min-h-[220px] flex-1">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%" minHeight={220}>
            <AreaChart data={series} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 4" />
              <XAxis
                dataKey="key"
                tickFormatter={tickLabel}
                tick={CHART_AXIS_TICK}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tickFormatter={(v: number) => formatCompactNumber(v)}
                tick={CHART_AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                cursor={{ stroke: 'hsl(var(--primary))', strokeOpacity: 0.3 }}
                labelFormatter={(key: string) =>
                  granularity === 'week' ? t('finance.trend.weekOf', { date: formatDate(key) }) : formatDate(key)
                }
                formatter={(value: number, name: string) => [
                  formatCurrency(value, 'LAK'),
                  name === 'collected' ? t('finance.trend.collected') : t('finance.trend.billed'),
                ]}
              />
              <Area
                type="monotone"
                dataKey="collected"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                activeDot={{ r: 4, strokeWidth: 0 }}
                animationDuration={700}
              />
              <Line
                type="monotone"
                dataKey="billed"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
                animationDuration={700}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-center">
            <Activity className="h-5 w-5 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">{t('finance.trend.empty')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
