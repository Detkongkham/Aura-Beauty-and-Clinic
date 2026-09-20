import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import type { DashboardStats } from '@/types/models';

/** Today's load by hour — thin azure ticks on a baseline rule. */
export function HourHistogram({ data }: { data: DashboardStats['hoursToday'] }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  const peak = data.reduce((a, b) => (b.count > a.count ? b : a), data[0] ?? { hour: 0, count: 0 });

  if (total === 0) {
    return <p className="text-sm text-muted-foreground">{t('reports.empty')}</p>;
  }

  return (
    <div>
      <div
        className="flex items-end gap-1.5 border-b border-border pb-0"
        role="img"
        aria-label={t('reports.section.peakHours')}
      >
        {data.map((d) => {
          const isPeak = d.count === peak.count && d.count > 0;
          return (
            <div key={d.hour} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {d.count > 0 ? d.count : ''}
              </span>
              <div
                className={cn(
                  'w-full rounded-t',
                  isPeak ? 'bg-primary' : 'bg-primary/35',
                )}
                style={{ height: `${d.count === 0 ? 2 : Math.max((d.count / max) * 72, 4)}px` }}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {data.map((d) => (
          <span
            key={d.hour}
            className="flex-1 text-center text-[10px] tabular-nums text-muted-foreground"
          >
            {d.hour % 2 === 1 ? d.hour : ''}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {t('reports.peakAt', { hour: String(peak.hour).padStart(2, '0'), count: peak.count })}
      </p>
    </div>
  );
}
