import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { cn } from '@/lib/utils';
import { formatCompactNumber, formatCurrency, formatDate } from '@/lib/format';
import type { DashboardStats } from '@/types/models';

import {
  CHART_AXIS_TICK,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from '../chartTheme';

type Metric = 'revenue' | 'bookings';
type Shape = 'area' | 'bar';

interface Props {
  data: DashboardStats['revenueSeries'];
  /** Previous equal-length window, index-aligned with `data`. */
  prev?: DashboardStats['prevSeries'];
  days?: number;
}

/** design.md §13 — period trend. Metric + shape are switchable inline so the same
 *  panel serves revenue and volume; a dashed "previous period" line can be overlaid
 *  (index-aligned: day 1 of this window vs day 1 of the one before). */
export function RevenueChart({ data, prev, days = data.length }: Props) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<Metric>('revenue');
  const [shape, setShape] = useState<Shape>('area');
  const [compare, setCompare] = useState(true);
  const canCompare = Boolean(prev && prev.length === data.length);

  const rows = useMemo(
    () =>
      data.map((d, i) => ({
        ...d,
        prevRevenue: prev?.[i]?.revenue ?? 0,
        prevBookings: prev?.[i]?.bookings ?? 0,
      })),
    [data, prev],
  );

  const { total, avg, deltaPct, prevTotal } = useMemo(() => {
    const values = data.map((d) => d[metric]);
    const sum = values.reduce((s, v) => s + v, 0);
    const prevSum = (prev ?? []).reduce((s, d) => s + d[metric], 0);
    return {
      total: sum,
      prevTotal: prevSum,
      avg: values.length ? Math.round(sum / values.length) : 0,
      deltaPct: prevSum ? (sum - prevSum) / prevSum : 0,
    };
  }, [data, prev, metric]);
  const prevKey = metric === 'revenue' ? 'prevRevenue' : 'prevBookings';
  const showPrev = canCompare && compare;

  const fmt = (v: number) => (metric === 'revenue' ? formatCurrency(v) : String(v));
  const fmtShort = (v: number) => formatCompactNumber(v);
  const up = deltaPct > 0.005;
  const down = deltaPct < -0.005;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xl font-semibold tabular-nums" title={String(total)}>
            {metric === 'revenue' ? formatCurrency(total) : formatCompactNumber(total)}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-medium',
                up && 'text-success',
                down && 'text-destructive',
              )}
            >
              {up ? (
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              ) : down ? (
                <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
              ) : null}
              {`${deltaPct > 0 ? '+' : ''}${Math.round(deltaPct * 100)}%`}
            </span>
            <span aria-hidden="true">·</span>
            <span>{t('dashboard.vsPrevPeriod', { days })}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums" title={String(avg)}>
              {t('dashboard.chart.avgPerDay', {
                value: metric === 'revenue' ? formatCurrency(avg) : formatCompactNumber(avg),
              })}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {canCompare ? (
            <button
              type="button"
              onClick={() => setCompare((c) => !c)}
              aria-pressed={compare}
              className={cn(
                'inline-flex h-[30px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
                compare
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground',
              )}
            >
              <span aria-hidden="true" className="w-3.5 border-t-2 border-dashed border-current" />
              {t('dashboard.chart.compare')}
            </button>
          ) : null}
          <Segmented
            options={[
              { value: 'revenue', label: t('dashboard.revenue') },
              { value: 'bookings', label: t('nav.appointments') },
            ]}
            value={metric}
            onChange={(v) => setMetric(v as Metric)}
          />
          <Segmented
            options={[
              { value: 'area', label: t('dashboard.chartArea') },
              { value: 'bar', label: t('dashboard.chartBar') },
            ]}
            value={shape}
            onChange={(v) => setShape(v as Shape)}
          />
        </div>
      </div>

      <div className="h-64 w-full" role="img" aria-label={t('dashboard.revenueTrendN', { days })}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.24} />
                <stop offset="75%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
                <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="revBar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.9} />
                <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.45} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="2 5"
              stroke="hsl(var(--border))"
              strokeOpacity={0.6}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => formatDate(v).slice(0, 5)}
              tick={CHART_AXIS_TICK}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
              dy={6}
            />
            <YAxis
              width={44}
              tickFormatter={fmtShort}
              tick={CHART_AXIS_TICK}
              tickLine={false}
              axisLine={false}
              tickCount={4}
            />
            <Tooltip
              formatter={(value: number) => fmt(value)}
              labelFormatter={(label: string) => formatDate(label)}
              cursor={
                shape === 'bar'
                  ? { fill: 'hsl(var(--primary) / 0.08)' }
                  : { stroke: 'hsl(var(--primary))', strokeOpacity: 0.3, strokeWidth: 1 }
              }
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={CHART_TOOLTIP_LABEL_STYLE}
              itemStyle={CHART_TOOLTIP_ITEM_STYLE}
            />
            {showPrev ? (
              <Line
                type="monotone"
                dataKey={prevKey}
                name={t('dashboard.chart.previous')}
                stroke="hsl(var(--muted-foreground))"
                strokeOpacity={0.55}
                strokeWidth={1.75}
                strokeDasharray="4 4"
                dot={false}
                activeDot={{ r: 3 }}
                animationDuration={450}
              />
            ) : null}
            {shape === 'area' ? (
              <Area
                type="monotone"
                dataKey={metric}
                name={t('dashboard.chart.current')}
                stroke="hsl(var(--chart-1))"
                strokeWidth={2.5}
                strokeLinecap="round"
                fill="url(#revFill)"
                dot={false}
                activeDot={{
                  r: 4.5,
                  strokeWidth: 2.5,
                  stroke: 'hsl(var(--card))',
                  fill: 'hsl(var(--chart-1))',
                }}
                animationDuration={450}
              />
            ) : (
              <Bar
                dataKey={metric}
                name={t('dashboard.chart.current')}
                fill="url(#revBar)"
                radius={[4, 4, 0, 0]}
                maxBarSize={26}
                animationDuration={450}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {showPrev ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-3.5 rounded-sm bg-chart-1" />
            {t('dashboard.chart.current')}
            <span className="font-semibold tabular-nums text-foreground">{fmt(total)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="w-3.5 border-t-2 border-dashed border-muted-foreground/60"
            />
            {t('dashboard.chart.previous')}
            <span className="font-semibold tabular-nums text-foreground">{fmt(prevTotal)}</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div
      role="group"
      className="inline-flex items-center rounded-lg border border-border bg-muted/40 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
            value === o.value
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
