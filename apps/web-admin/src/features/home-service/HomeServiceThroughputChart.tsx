import { BarChart3 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { HomeServiceTripView } from '@abcp/shared-types';

import { cn } from '@/lib/utils';

const HH = (h: number) => String(h).padStart(2, '0');

/** Completed-trip throughput per hour — one-hue bars, labelled axis, per-bar tooltip. */
export function HomeServiceThroughputChart({ trips }: { trips: HomeServiceTripView[] }) {
  const { t } = useTranslation();

  const { buckets, max, busiest } = useMemo(() => {
    const byHour = new Map<number, number>();
    for (const trip of trips) {
      if (trip.status !== 'COMPLETED' || !trip.completedAt) continue;
      const h = new Date(trip.completedAt).getHours();
      byHour.set(h, (byHour.get(h) ?? 0) + 1);
    }
    if (byHour.size === 0) {
      return { buckets: [] as { hour: number; count: number }[], max: 0, busiest: null as number | null };
    }
    const hours = [...byHour.keys()];
    const lo = Math.min(...hours);
    const hi = Math.max(...hours);
    const list: { hour: number; count: number }[] = [];
    for (let h = lo; h <= hi && list.length < 24; h += 1) {
      list.push({ hour: h, count: byHour.get(h) ?? 0 });
    }
    let peak = lo;
    for (const [h, c] of byHour) if (c > (byHour.get(peak) ?? 0)) peak = h;
    return { buckets: list, max: Math.max(...byHour.values()), busiest: peak };
  }, [trips]);

  if (buckets.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] flex-col items-center justify-center gap-2 text-center">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="text-sm font-medium text-foreground">{t('homeServiceDispatch.noCompletions')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-2xs font-medium text-muted-foreground">{t('homeServiceDispatch.throughput')}</p>
        {busiest != null ? (
          <p className="text-2xs tabular-nums text-muted-foreground">
            {t('homeServiceDispatch.busiestHour', { hour: HH(busiest) })}
          </p>
        ) : null}
      </div>

      <div className="mt-2 flex h-20 gap-1">
        {buckets.map((b) => (
          <div key={b.hour} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span
              title={`${HH(b.hour)}:00 — ${t('homeServiceDispatch.completedCount', { n: b.count })}`}
              className={cn(
                'w-full rounded-t-sm bg-success transition-[height] duration-500 ease-out motion-reduce:transition-none',
                b.count === 0 && 'bg-border',
              )}
              style={{ height: `${b.count === 0 ? 3 : Math.max(12, (b.count / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {buckets.map((b) => (
          <span key={b.hour} className="flex-1 text-center text-[10px] tabular-nums text-muted-foreground">
            {b.hour % 2 === 0 ? HH(b.hour) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
