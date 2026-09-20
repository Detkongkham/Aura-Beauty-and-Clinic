import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { chartColor } from '@/features/dashboard/chartColors';

interface Slice {
  label: string;
  value: number;
  display?: string;
}

/** Donut for a user-picked breakdown — caps at 6 slices, folds the rest into
 *  "Other", and always shows a labelled legend (the table below is the
 *  accessible fallback). System chart palette. */
export function MiniDonut({ data, ariaLabel }: { data: Slice[]; ariaLabel: string }) {
  const { t } = useTranslation();
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, 6);
  const rest = sorted.slice(6);
  const slices = rest.length
    ? [...head, { label: t('reports.custom.other'), value: rest.reduce((s, r) => s + r.value, 0) }]
    : head;
  const total = slices.reduce((s, r) => s + r.value, 0) || 1;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-40 w-40 shrink-0" role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius={42}
              outerRadius={70}
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
            >
              {slices.map((_, i) => (
                <Cell key={i} fill={chartColor(i)} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v: number) => `${v} · ${Math.round((v / total) * 100)}%`}
              contentStyle={{
                borderRadius: 8,
                border: '1px solid hsl(var(--border))',
                fontSize: 12,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full flex-1 space-y-1.5 text-sm">
        {slices.map((s, i) => (
          <li key={s.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: chartColor(i) }}
              />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {s.display ?? s.value} · {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
