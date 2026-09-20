import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import type { DashboardStats } from '@/types/models';

const hourLabel = (h: number) => `${String(h).padStart(2, '0')}:00`;

/** Today's appointments bucketed by hour (09:00–19:00) as a vertical bar row,
 *  topped with a small summary strip and an average reference line so a quiet
 *  day still reads as informative rather than empty. */
export function PeakHours({ data }: { data: DashboardStats['hoursToday'] }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  const avg = data.length ? total / data.length : 0;
  const peak = data.reduce((a, b) => (b.count > a.count ? b : a), data[0] ?? { hour: 0, count: 0 });

  const stats = [
    { label: t('dashboard.peakBusiest'), value: total ? hourLabel(peak.hour) : '—' },
    { label: t('dashboard.peakTotal'), value: total ? String(total) : '—' },
    { label: t('dashboard.peakAvgHour'), value: total ? avg.toFixed(1) : '—' },
  ];

  return (
    <div className="space-y-3">
      <dl className="grid grid-cols-3 divide-x divide-border/60 overflow-hidden rounded-lg border border-border/60 bg-muted/30">
        {stats.map((s) => (
          <div key={s.label} className="px-2 py-2 text-center">
            <dt className="text-[10px] text-muted-foreground">{s.label}</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex items-end gap-1.5" role="img" aria-label={t('dashboard.peakHours')}>
        {data.map((d) => {
          const isPeak = d.count === max && d.count > 0;
          return (
            <div
              key={d.hour}
              className="group flex flex-1 flex-col items-center gap-1"
              title={`${hourLabel(d.hour)} · ${d.count}`}
            >
              <span
                className={cn(
                  'text-[10px] tabular-nums transition-colors',
                  isPeak ? 'font-semibold text-primary' : 'text-muted-foreground',
                )}
              >
                {d.count > 0 ? d.count : ''}
              </span>
              <div className="relative h-24 w-full overflow-hidden rounded-md bg-muted/70">
                {[0.25, 0.5, 0.75].map((f) => (
                  <span
                    key={f}
                    aria-hidden="true"
                    className="absolute inset-x-0 border-t border-border/40"
                    style={{ bottom: `${f * 100}%` }}
                  />
                ))}
                {avg > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 border-t border-dashed border-primary/50"
                    style={{ bottom: `${(avg / max) * 100}%` }}
                  />
                ) : null}
                <div
                  className={cn(
                    'absolute inset-x-0 bottom-0 rounded-md transition-[height,background-color] duration-300 ease-out',
                    isPeak
                      ? 'bg-gradient-to-t from-primary to-primary-hover'
                      : 'bg-primary/35 group-hover:bg-primary/55',
                  )}
                  style={{ height: `${d.count === 0 ? 0 : Math.max((d.count / max) * 100, 6)}%` }}
                />
              </div>
              <span
                className={cn(
                  'text-[10px] tabular-nums',
                  isPeak ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {d.hour % 2 === 1 ? d.hour : ''}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
        <p className="min-w-0 truncate">
          {total
            ? t('dashboard.peakInsight', {
                hour: hourLabel(peak.hour),
                pct: total ? Math.round((peak.count / total) * 100) : 0,
              })
            : t('dashboard.peakInsightEmpty')}
        </p>
        {avg > 0 ? (
          <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
            <span className="inline-block w-4 border-t border-dashed border-primary/50" />
            {t('dashboard.peakAvgLine')} {avg.toFixed(1)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
