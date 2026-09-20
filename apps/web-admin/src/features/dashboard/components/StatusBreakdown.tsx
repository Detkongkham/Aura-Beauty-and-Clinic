import { useTranslation } from 'react-i18next';

import type { DashboardStats } from '@/types/models';

/** Appointment status split over the 14-day window — stacked bar + legend. */
const STATUS_COLOR: Record<string, string> = {
  CONFIRMED: 'hsl(var(--info))',
  PENDING: 'hsl(var(--warning))',
  IN_PROGRESS: 'hsl(var(--primary))',
  COMPLETED: 'hsl(var(--success))',
  CANCELLED: 'hsl(var(--muted-foreground))',
  NO_SHOW: 'hsl(var(--destructive))',
};

export function StatusBreakdown({ data }: { data: DashboardStats['statusBreakdown'] }) {
  const { t } = useTranslation();
  const total = data.reduce((s, d) => s + d.count, 0);

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">{t('dashboard.noUpcoming')}</p>;
  }

  return (
    <div className="space-y-3">
      <div
        className="flex h-3 gap-px overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={t('dashboard.statusBreakdown')}
      >
        {data.map((d) => (
          <span
            key={d.status}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(d.count / total) * 100}%`,
              backgroundColor: STATUS_COLOR[d.status] ?? 'hsl(var(--muted-foreground))',
            }}
          />
        ))}
      </div>

      <ul className="-mx-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
        {data.map((d) => (
          <li
            key={d.status}
            className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-muted/50"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: STATUS_COLOR[d.status] ?? 'hsl(var(--muted-foreground))',
                }}
              />
              <span className="truncate text-muted-foreground">{t(`status.${d.status}`)}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">
              {d.count} · {Math.round((d.count / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
