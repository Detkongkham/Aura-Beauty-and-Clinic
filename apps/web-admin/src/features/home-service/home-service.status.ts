import type { HomeServiceJobStatus, HomeServiceTripView } from '@abcp/shared-types';

export type HomeServiceStatusVariant = 'neutral' | 'primary' | 'warning' | 'accent' | 'success' | 'danger';

export const STATUS_VARIANT: Record<HomeServiceJobStatus, HomeServiceStatusVariant> = {
  MATCHING: 'neutral',
  ASSIGNED: 'primary',
  EN_ROUTE: 'warning',
  ARRIVED: 'accent',
  IN_PROGRESS: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  NO_MATCH: 'danger',
};

export const STATUS_DOT: Record<HomeServiceStatusVariant, string> = {
  neutral: 'bg-muted-foreground',
  primary: 'bg-primary',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
};

const LIVE_PING_WINDOW_MS = 90_000;
const SLA_STALE_MINUTES = 10;

export function isLive(trip: HomeServiceTripView, now: number): boolean {
  if (!trip.lastPingAt) return false;
  if (trip.status !== 'EN_ROUTE' && trip.status !== 'ASSIGNED') return false;
  return now - new Date(trip.lastPingAt).getTime() < LIVE_PING_WINDOW_MS;
}

/** Client-side SLA hint — the real notifier is the backend sweep job; this is just a visual flag. */
export function slaBreached(trip: HomeServiceTripView, now: number): boolean {
  if (trip.status === 'MATCHING' || trip.status === 'NO_MATCH') {
    return now - new Date(trip.createdAt).getTime() > SLA_STALE_MINUTES * 60_000;
  }
  if ((trip.status === 'ASSIGNED' || trip.status === 'EN_ROUTE') && trip.etaMinutes != null) {
    const from = trip.enRouteAt ?? trip.assignedAt;
    if (!from) return false;
    return now - new Date(from).getTime() > (trip.etaMinutes + SLA_STALE_MINUTES) * 60_000;
  }
  return false;
}
