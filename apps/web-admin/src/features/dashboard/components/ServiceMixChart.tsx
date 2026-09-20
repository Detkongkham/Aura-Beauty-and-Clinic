import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { cn } from '@/lib/utils';
import { formatCompactNumber } from '@/lib/format';
import type { DashboardStats } from '@/types/models';

import { CHART_COLORS as COLORS } from '../chartColors';
import {
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from '../chartTheme';

/** design.md §13 — thin donut, ≤6 slices. Hovering a slice or a legend row
 *  focuses it (others dim) and swaps the centre readout to that service. */
export function ServiceMixChart({ data }: { data: DashboardStats['serviceMix'] }) {
  const { t } = useTranslation();
  const [active, setActive] = useState<number | null>(null);

  const total = useMemo(() => data.reduce((s, d) => s + d.value, 0), [data]);
  const focused = active != null ? data[active] : undefined;
  const focusedPct = focused && total ? Math.round((focused.value / total) * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className="relative h-40 w-40 shrink-0"
        role="img"
        aria-label={t('dashboard.serviceMixAria')}
        onMouseLeave={() => setActive(null)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={74}
              paddingAngle={data.length > 1 ? 2 : 0}
              cornerRadius={3}
              stroke="hsl(var(--card))"
              strokeWidth={2}
              onMouseEnter={(_, i) => setActive(i)}
            >
              {data.map((_, i) => (
                <Cell
                  key={i}
                  fill={COLORS[i % COLORS.length]}
                  fillOpacity={active == null || active === i ? 1 : 0.28}
                  className="outline-none transition-[fill-opacity] duration-200"
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => `${value}`}
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
                {focused.name}
              </span>
              <span className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                {focused.value} · {focusedPct}%
              </span>
            </>
          ) : (
            <>
              <span className="text-lg font-semibold leading-none tabular-nums">
                {formatCompactNumber(total)}
              </span>
              <span className="mt-1 text-[10px] text-muted-foreground">
                {t('dashboard.upcomingTotal')}
              </span>
            </>
          )}
        </div>
      </div>

      <ul className="-mx-1.5 flex-1 space-y-0.5 text-sm">
        {data.map((d, i) => {
          const pct = total ? Math.round((d.value / total) * 100) : 0;
          const color = COLORS[i % COLORS.length];
          return (
            <li
              key={d.name}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              className={cn(
                'rounded-md px-1.5 py-1.5 transition-colors',
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
                  <span className="truncate">{d.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  <span className="font-medium text-foreground">{d.value}</span> · {pct}%
                </span>
              </div>
              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: `${Math.max(pct, d.value > 0 ? 3 : 0)}%`,
                    backgroundColor: color,
                    opacity: active == null || active === i ? 1 : 0.4,
                  }}
                />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
