import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { formatCompactNumber, formatCurrency, formatDate } from '@/lib/format';
import type { DashboardStats } from '@/types/models';

/**
 * Daily revenue as flat azure bars — no gradient, no area, one colour. Uses the
 * system primary so it reads as part of the app, while staying a plain bar
 * "ledger chart" rather than the dashboard's gradient area.
 */
export function ReportRevenueBars({ data }: { data: DashboardStats['revenueSeries'] }) {
  const { t } = useTranslation();
  return (
    <div
      className="h-56 w-full"
      role="img"
      aria-label={t('reports.section.revenueTrend')}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
          <CartesianGrid
            strokeDasharray="2 4"
            stroke="hsl(var(--border))"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => formatDate(v).slice(0, 5)}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            width={44}
            tickFormatter={(v: number) => formatCompactNumber(v)}
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: 'hsl(var(--muted) / 0.6)' }}
            formatter={(value: number, name: string) =>
              name === 'revenue' ? formatCurrency(value) : value
            }
            labelFormatter={(label: string) => formatDate(label)}
            contentStyle={{
              borderRadius: 8,
              border: '1px solid hsl(var(--border))',
              fontSize: 12,
            }}
          />
          <Bar
            dataKey="revenue"
            fill="hsl(var(--primary))"
            fillOpacity={0.9}
            radius={[3, 3, 0, 0]}
            maxBarSize={26}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
