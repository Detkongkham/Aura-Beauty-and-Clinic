import { Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Skeleton } from '@/components/ui/skeleton';
import { formatCompactNumber, formatCurrency } from '@/lib/format';

import type { TierKey } from './tierMeta';

export interface TierValue {
  key: TierKey;
  label: string;
  color: string;
  revenue: number;
  count: number;
}

interface CustomerValueChartProps {
  data: TierValue[];
  loading?: boolean;
}

/**
 * Lifetime spend booked by each loyalty tier — vertical bars, colours locked to
 * the tier donut. Surfaces the money story the tier mix alone can't: how few
 * customers can drive the bulk of revenue.
 */
export function CustomerValueChart({ data, loading = false }: CustomerValueChartProps) {
  const { t } = useTranslation();

  const totalRevenue = data.reduce((n, d) => n + d.revenue, 0);
  const bars = data.filter((d) => d.revenue > 0);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-4 animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out motion-reduce:animate-none">
      <div className="mb-1 flex items-center gap-2">
        <Coins className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <h3 className="text-[13px] font-semibold text-foreground">{t('customers.valueTitle')}</h3>
      </div>

      {loading ? (
        <Skeleton className="mt-3 h-40 w-full" />
      ) : totalRevenue === 0 ? (
        <p className="flex flex-1 items-center justify-center py-10 text-center text-xs text-muted-foreground">
          {t('customers.emptyHint')}
        </p>
      ) : (
        <>
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {formatCurrency(totalRevenue)}
            </span>
            <span className="text-xs text-muted-foreground">{t('customers.valueSubtitle')}</span>
          </div>

          <div
            className="h-40 w-full"
            role="img"
            aria-label={t('customers.valueAria', { value: formatCurrency(totalRevenue) })}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                <XAxis
                  dataKey="label"
                  interval={0}
                  tickFormatter={(v: string) => (v === t('customers.noTier') ? '—' : v)}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis
                  width={38}
                  tickFormatter={(v: number) => formatCompactNumber(v)}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
                  formatter={(value: number, _name, item) => [
                    `${formatCurrency(value)} · ${t('customers.count', {
                      count: (item?.payload as TierValue | undefined)?.count ?? 0,
                    })}`,
                    t('customers.spent'),
                  ]}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid hsl(var(--border))',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={56}>
                  {bars.map((d) => (
                    <Cell key={d.key} fill={d.color} />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="top"
                    className="fill-muted-foreground text-[10px] tabular-nums"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
