import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { HomeServiceJobStatus, HomeServiceTripView } from '@abcp/shared-types';

import { DateTimeText } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { cn } from '@/lib/utils';

const STATUS_DOT: Record<HomeServiceJobStatus, string> = {
  MATCHING: 'bg-muted-foreground',
  ASSIGNED: 'bg-primary',
  EN_ROUTE: 'bg-warning',
  ARRIVED: 'bg-accent',
  IN_PROGRESS: 'bg-primary',
  COMPLETED: 'bg-success',
  CANCELLED: 'bg-destructive',
  NO_MATCH: 'bg-destructive',
};

function lastActivityAt(trip: HomeServiceTripView): string {
  return (
    trip.completedAt ??
    trip.cancelledAt ??
    trip.startedAt ??
    trip.arrivedAt ??
    trip.enRouteAt ??
    trip.assignedAt ??
    trip.createdAt
  );
}

/** Most-recently-updated trips, newest first — fills the console with a live glance at what just happened. */
export function HomeServiceActivityFeed({
  trips,
  onSelect,
}: {
  trips: HomeServiceTripView[];
  onSelect: (trip: HomeServiceTripView) => void;
}) {
  const { t } = useTranslation();

  const recent = useMemo(
    () =>
      [...trips]
        .sort((a, b) => new Date(lastActivityAt(b)).getTime() - new Date(lastActivityAt(a)).getTime())
        .slice(0, 7),
    [trips],
  );

  if (recent.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center text-xs text-muted-foreground">
        {t('homeServiceDispatch.empty')}
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {recent.map((trip) => (
        <li key={trip.id}>
          <button
            type="button"
            onClick={() => onSelect(trip)}
            className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-muted/50"
          >
            {trip.matchedStaffName ? (
              <PersonAvatar name={trip.matchedStaffName} size={26} />
            ) : (
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-muted">
                <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[trip.status])} aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{trip.customerName}</p>
              <p className="truncate text-2xs text-muted-foreground">
                {t(`homeServiceDispatch.status.${trip.status}`)}
                {trip.matchedStaffName ? ` · ${trip.matchedStaffName}` : ''}
              </p>
            </div>
            <DateTimeText
              value={lastActivityAt(trip)}
              mode="relative"
              className="shrink-0 text-2xs tabular-nums text-muted-foreground"
            />
          </button>
        </li>
      ))}
    </ul>
  );
}
