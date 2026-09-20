import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { HomeServiceJobStatus } from '@abcp/shared-types';

import { cn } from '@/lib/utils';

import {
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from '../dashboard/chartTheme';

/**
 * Status is a reserved semantic palette, not a generic categorical one — every
 * slice uses the SAME tone as that status's badge/dot elsewhere on this page, so
 * colour identity stays consistent between the chart, the table and the board.
 */
const STATUS_COLOR: Record<HomeServiceJobStatus, string> = {
  MATCHING: 'hsl(var(--muted-foreground))',
  ASSIGNED: 'hsl(var(--primary))',
  EN_ROUTE: 'hsl(var(--warning))',
  ARRIVED: 'hsl(var(--accent))',
  IN_PROGRESS: 'hsl(var(--primary))',
  COMPLETED: 'hsl(var(--success))',
  CANCELLED: 'hsl(var(--destructive))',
  NO_MATCH: 'hsl(var(--destructive))',
};

const ORDER: HomeServiceJobStatus[] = [
  'NO_MATCH',
  'MATCHING',
  'ASSIGNED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

/** Donut breakdown of the currently-filtered trips by status — status-tone slices + legend. */
export function HomeServiceStatusChart({ counts }: { counts: Record<HomeServiceJobStatus, number> }) {
  const { t } = useTranslation();
  const [active, setActive] = useState<number | null>(null);

  const data = useMemo(
    () =>
      ORDER.map((status) => ({ status, value: counts[status] })).filter((d) => d.value > 0),
    [counts],
  );
  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const focused = active != null ? data[active] : undefined;
  const focusedPct = focused && total ? Math.round((focused.value / total) * 100) : 0;

  if (total === 0) {
    return (
      <div className="flex h-full min-h-[180px] items-center justify-center text-xs text-muted-foreground">
        {t('homeServiceDispatch.empty')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div
        className="relative h-36 w-36 shrink-0"
        role="img"
        aria-label={t('homeServiceDispatch.statusBreakdown')}
        onMouseLeave={() => setActive(null)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="status"
              innerRadius={44}
              outerRadius={68}
              paddingAngle={data.length > 1 ? 2 : 0}
              cornerRadius={3}
              stroke="hsl(var(--card))"
              strokeWidth={2}
              onMouseEnter={(_, i) => setActive(i)}
            >
              {data.map((d) => (
                <Cell
                  key={d.status}
                  fill={STATUS_COLOR[d.status]}
                  fillOpacity={active == null || data[active]?.status === d.status ? 1 : 0.28}
                  className="outline-none transition-[fill-opacity] duration-200"
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, _name, entry) => [
                value,
                t(`homeServiceDispatch.status.${(entry.payload as { status: HomeServiceJobStatus }).status}`),
              ]}
              contentStyle={CHART_TOOLTIP_STYLE}
              labelStyle={CHART_TOOLTIP_LABEL_STYLE}
              itemStyle={CHART_TOOLTIP_ITEM_STYLE}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          {focused ? (
            <>
              <span className="line-clamp-2 text-xs font-semibold leading-tight">
                {t(`homeServiceDispatch.status.${focused.status}`)}
              </span>
              <span className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                {focused.value} · {focusedPct}%
              </span>
            </>
          ) : (
            <>
              <span className="text-lg font-semibold leading-none tabular-nums">{total}</span>
              <span className="mt-1 text-[10px] text-muted-foreground">
                {t('homeServiceDispatch.totalTrips')}
              </span>
            </>
          )}
        </div>
      </div>

      <ul className="-mx-1.5 flex-1 space-y-0.5 text-sm">
        {data.map((d, i) => {
          const pct = total ? Math.round((d.value / total) * 100) : 0;
          const color = STATUS_COLOR[d.status];
          return (
            <li
              key={d.status}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              className={cn(
                'rounded-md px-1.5 py-1 transition-colors',
                active === i ? 'bg-muted/60' : 'hover:bg-muted/50',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-xs">{t(`homeServiceDispatch.status.${d.status}`)}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  <span className="font-medium text-foreground">{d.value}</span> · {pct}%
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
