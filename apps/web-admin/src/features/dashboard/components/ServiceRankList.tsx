import { useTranslation } from 'react-i18next';

import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DashboardStats } from '@/types/models';

import { chartColor } from '../chartColors';

/** Service mix as a ranked list — booking share bar (coloured like the donut slice),
 *  plus bookings and completed revenue per service. */
export function ServiceRankList({ data }: { data: DashboardStats['serviceMix'] }) {
  const { t } = useTranslation();
  const total = data.reduce((s, d) => s + d.value, 0);
  const max = Math.max(0, ...data.map((d) => d.value));

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('dashboard.noUpcoming')}</p>;
  }

  return (
    <ol className="-mx-1.5 space-y-1">
      {data.map((d, i) => {
        const share = total ? Math.round((d.value / total) * 100) : 0;
        return (
          <li key={d.name} className="rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/50">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tabular-nums',
                  i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{d.name}</span>
                  <span className="shrink-0 text-xs font-semibold tabular-nums">{share}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{
                      width: `${max ? Math.max((d.value / max) * 100, 2) : 0}%`,
                      backgroundColor: chartColor(i),
                    }}
                  />
                </div>
                <p className="mt-0.5 truncate text-[11px] tabular-nums text-muted-foreground">
                  {t('dashboard.servicesRevenue', {
                    count: d.value,
                    revenue: formatCurrency(d.revenue ?? 0),
                  })}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
