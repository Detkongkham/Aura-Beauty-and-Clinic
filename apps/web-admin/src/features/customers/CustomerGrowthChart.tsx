import { ArrowDownRight, ArrowUpRight, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface GrowthPoint {
  /** ISO first-of-month, used as the stable key. */
  month: string;
  /** Short axis label, e.g. `09/25`. */
  label: string;
  count: number;
}

interface CustomerGrowthChartProps {
  data: GrowthPoint[];
  loading?: boolean;
}

/**
 * New customers per month over the trailing window — area chart mirroring the
 * dashboard `RevenueChart` (gradient 14%→0, x = month, y = count). Headline shows
 * the window total and the last-month change.
 */
export function CustomerGrowthChart({ data, loading = false }: CustomerGrowthChartProps) {
  const { t } = useTranslation();

  const total = data.reduce((n, d) => n + d.count, 0);
  const last = data.at(-1)?.count ?? 0;
  const prev = data.at(-2)?.count ?? 0;
  const deltaPct = prev === 0 ? (last > 0 ? 100 : 0) : Math.round(((last - prev) / prev) * 100);
  const up = deltaPct >= 0;

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-4 animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out motion-reduce:animate-none">
      <div className="mb-1 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="text-[13px] font-semibold text-foreground">{t('customers.growthTitle')}</h3>
      </div>

      {loading ? (
        <Skeleton className="mt-3 h-40 w-full" />
      ) : total === 0 ? (
        <p className="flex flex-1 items-center justify-center py-10 text-center text-xs text-muted-foreground">
          {t('customers.emptyHint')}
        </p>
      ) : (
        <>
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-xl font-semibold tabular-nums text-foreground">{total}</span>
            <span className="text-xs text-muted-foreground">{t('customers.growthWindow')}</span>
            <span
              className={cn(
                'ml-auto inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
                up ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive',
              )}
            >
              {up ? (
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
              )}
              {Math.abs(deltaPct)}%
            </span>
          </div>

          <div
            className="h-40 w-full"
            role="img"
            aria-label={t('customers.growthAria', { count: total })}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="custGrowthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.14} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  interval="preserveStartEnd"
                  minTickGap={16}
                />
                <YAxis
                  width={28}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value: number) => [value, t('customers.newLabel')]}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid hsl(var(--border))',
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  fill="url(#custGrowthFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
