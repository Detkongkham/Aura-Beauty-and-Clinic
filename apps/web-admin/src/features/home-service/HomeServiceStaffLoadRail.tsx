import { UserRound, Users } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { HomeServiceTripView } from '@abcp/shared-types';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  /** ASSIGNED/EN_ROUTE/ARRIVED/IN_PROGRESS trips — those a stylist is currently on. */
  activeTrips: HomeServiceTripView[];
  /** Names of staff eligible for home-service in the current branch scope. */
  rosterNames: string[];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
}

/** At-a-glance stylist workload for the dispatch console — who is on a trip vs. who is free. */
export function HomeServiceStaffLoadRail({ activeTrips, rosterNames }: Props) {
  const { t } = useTranslation();

  const busy = useMemo(() => {
    const map = new Map<string, HomeServiceTripView[]>();
    for (const trip of activeTrips) {
      if (!trip.matchedStaffName) continue;
      const list = map.get(trip.matchedStaffName) ?? [];
      list.push(trip);
      map.set(trip.matchedStaffName, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [activeTrips]);

  const free = useMemo(() => {
    const busyNames = new Set(busy.map(([name]) => name));
    return rosterNames.filter((n) => !busyNames.has(n));
  }, [busy, rosterNames]);

  if (busy.length === 0 && free.length === 0) return null;

  const freeShown = free.slice(0, 6);
  const freeRest = free.length - freeShown.length;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3.5 py-2">
        <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
        <h2 className="text-xs font-semibold">{t('homeServiceDispatch.staffLoad')}</h2>
      </div>
      <div className="flex items-stretch gap-2 overflow-x-auto p-3">
        {busy.map(([name, trips]) => (
          <div
            key={name}
            className="flex shrink-0 items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 shadow-xs"
          >
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xs font-semibold text-primary"
            >
              {initials(name)}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <span className="truncate">{name}</span>
                <span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-2xs font-semibold tabular-nums text-primary">
                  {trips.length}
                </span>
              </p>
              <p className="truncate text-2xs tabular-nums text-muted-foreground">
                {trips.map((trip) => trip.customerName).join(' · ')}
              </p>
            </div>
          </div>
        ))}

        {freeShown.length > 0 ? (
          <div className="flex shrink-0 items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-1.5">
            <UserRound className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-2xs font-semibold text-muted-foreground">{t('homeServiceDispatch.freeStaff')}</p>
              <p className={cn('truncate text-xs')}>
                {freeShown.join(', ')}
                {freeRest > 0 ? ` +${freeRest}` : ''}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
