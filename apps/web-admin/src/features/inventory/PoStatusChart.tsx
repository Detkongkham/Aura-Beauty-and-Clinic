import { ArrowDownRight, ArrowUpRight, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import type { PoStatusValue } from '@abcp/shared-types';

import {
  CHART_AXIS_TICK,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from '@/features/dashboard/chartTheme';
import { formatDate } from '@/lib/format';
import { APP_TIMEZONE } from '@/lib/constants';
import { cn } from '@/lib/utils';

import { usePurchaseOrders } from './inventory.api';

const STATUSES: PoStatusValue[] = ['DRAFT', 'PENDING_APPROVAL', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'];
const DAYS = 14;

// Distinct colour *and* distinct dash pattern per line (chart domain guidance:
// never separate series by hue alone) — solid for the two "active pipeline"
// states, dashed/dotted for the two "at rest" states.
const STATUS_STYLE: Record<
  PoStatusValue,
  { line: string; dash?: string; border: string; text: string }
> = {
  DRAFT: { line: 'hsl(var(--muted-foreground))', dash: '5 4', border: 'dashed', text: 'text-muted-foreground' },
  PENDING_APPROVAL: { line: 'hsl(var(--warning))', dash: '6 2 1.5 2', border: 'dashed', text: 'text-warning' },
  ORDERED: { line: 'hsl(var(--info))', border: 'solid', text: 'text-info' },
  PARTIALLY_RECEIVED: { line: 'hsl(var(--primary))', dash: '8 3', border: 'dashed', text: 'text-primary' },
  RECEIVED: { line: 'hsl(var(--success))', border: 'solid', text: 'text-success' },
  CANCELLED: { line: 'hsl(var(--warning))', dash: '1.5 3.5', border: 'dotted', text: 'text-warning' },
};

type DayBucket = { date: string; total: number } & Record<PoStatusValue, number>;

interface PoStatusChartProps {
  branchId?: string;
}

/**
 * 14-day trend of purchase orders by status (one line per status, keyed off
 * `orderDate`) — same card chrome, headline figure and axis styling as the
 * dashboard's `RevenueChart`, plus a soft gradient area for the daily total
 * underneath so overall volume reads as a shape, not just four thin lines.
 * Custom dot-legend (Recharts' default legend doesn't match the app's type
 * scale). No dedicated stats endpoint backs this yet, so it pulls its own
 * wider, unfiltered-by-status page of POs (still scoped to the branch
 * filter) rather than the table's page.
 */
export function PoStatusChart({ branchId }: PoStatusChartProps) {
  const { t } = useTranslation();
  const { data, isLoading } = usePurchaseOrders({ branchId, page: 1, pageSize: 300 });

  const { chartData, totals, deltaPct } = useMemo(() => {
    const days = Array.from({ length: DAYS }, (_, i) =>
      dayjs().tz(APP_TIMEZONE).subtract(DAYS - 1 - i, 'day').format('YYYY-MM-DD'),
    );
    const buckets = new Map<string, DayBucket>(
      days.map((date) => [date, { date, total: 0, DRAFT: 0, PENDING_APPROVAL: 0, ORDERED: 0, PARTIALLY_RECEIVED: 0, RECEIVED: 0, CANCELLED: 0 }]),
    );
    const totalByStatus: Record<PoStatusValue, number> = {
      DRAFT: 0,
      PENDING_APPROVAL: 0,
      ORDERED: 0,
      PARTIALLY_RECEIVED: 0,
      RECEIVED: 0,
      CANCELLED: 0,
    };
    for (const po of data?.items ?? []) {
      const key = dayjs(po.orderDate).tz(APP_TIMEZONE).format('YYYY-MM-DD');
      const bucket = buckets.get(key);
      if (bucket) {
        bucket[po.status] += 1;
        bucket.total += 1;
        totalByStatus[po.status] += 1;
      }
    }
    const series = days.map((date) => buckets.get(date)!);
    const recent7 = series.slice(7).reduce((s, b) => s + b.total, 0);
    const prior7 = series.slice(0, 7).reduce((s, b) => s + b.total, 0);
    const pct = prior7 > 0 ? (recent7 - prior7) / prior7 : recent7 > 0 ? 1 : 0;
    return { chartData: series, totals: totalByStatus, deltaPct: pct };
  }, [data]);

  const total = STATUSES.reduce((s, k) => s + totals[k], 0);
  const up = deltaPct > 0.005;
  const down = deltaPct < -0.005;

  if (isLoading && !data) {
    return <div className="h-[300px] w-full animate-pulse rounded-xl border border-border bg-card" />;
  }

  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow duration-200 hover:shadow-md',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:h-4 [&_svg]:w-4"
            aria-hidden="true"
          >
            <TrendingUp aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight">{t('inventory.po.statusChart.title')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('inventory.po.statusChart.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xl font-semibold tabular-nums">{total.toLocaleString()}</p>
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
              <span>{t('inventory.po.statusChart.weekOverWeek')}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {STATUSES.map((s) => {
              const c = STATUS_STYLE[s];
              return (
                <div key={s} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="h-0 w-3.5 shrink-0"
                    style={{ borderTop: `2.5px ${c.border} ${c.line}` }}
                    aria-hidden="true"
                  />
                  <span className="text-muted-foreground">{t(`inventory.po.st.${s}`)}</span>
                  <span className={cn('font-semibold tabular-nums', c.text)}>{totals[s]}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="h-56 w-full" role="img" aria-label={t('inventory.po.statusChart.title')}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="poVolumeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
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
                width={24}
                allowDecimals={false}
                tick={CHART_AXIS_TICK}
                tickLine={false}
                axisLine={false}
                tickCount={4}
              />
              <Tooltip
                labelFormatter={(label: string) => formatDate(label)}
                formatter={(value: number, name: string) => [value, name]}
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                cursor={{ stroke: 'hsl(var(--primary))', strokeOpacity: 0.3, strokeWidth: 1 }}
              />
              <Area
                type="monotone"
                dataKey="total"
                name={t('inventory.po.items')}
                stroke="none"
                fill="url(#poVolumeFill)"
                isAnimationActive
                animationDuration={450}
                legendType="none"
              />
              {STATUSES.map((s) => (
                <Line
                  key={s}
                  type="monotone"
                  dataKey={s}
                  name={t(`inventory.po.st.${s}`)}
                  stroke={STATUS_STYLE[s].line}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeDasharray={STATUS_STYLE[s].dash}
                  dot={false}
                  activeDot={{ r: 4.5, strokeWidth: 2.5, stroke: 'hsl(var(--card))' }}
                  animationDuration={450}
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
