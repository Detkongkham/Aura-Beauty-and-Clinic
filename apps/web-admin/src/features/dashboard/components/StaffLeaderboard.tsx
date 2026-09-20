import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';
import type { DashboardStats } from '@/types/models';

/** Top staff by completed appointments over the 14-day window. */
export function StaffLeaderboard({ data }: { data: DashboardStats['staffLeaderboard'] }) {
  const { t } = useTranslation();
  const max = data[0]?.completed ?? 0;

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('dashboard.noUpcoming')}</p>;
  }

  return (
    <ol className="-mx-1.5 space-y-1">
      {data.map((s, i) => (
        <li key={s.name} className="rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/50">
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums',
                  i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {i + 1}
              </span>
              <span className="truncate font-medium">{s.name}</span>
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {t('dashboard.completedCount', { count: s.completed })} · {formatCurrency(s.revenue)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-500 ease-out"
              style={{ width: `${max ? Math.max((s.completed / max) * 100, 3) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
