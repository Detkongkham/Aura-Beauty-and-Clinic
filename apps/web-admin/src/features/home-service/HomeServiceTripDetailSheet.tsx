import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import {
  CalendarClock,
  CheckCircle2,
  MapPin,
  Navigation,
  Phone,
  Route,
  Ruler,
  Scissors,
  StickyNote,
  Timer,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { HomeServiceJobStatus, HomeServiceTripView } from '@abcp/shared-types';

import { DateTimeText } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import { isLive, slaBreached, STATUS_DOT, STATUS_VARIANT } from './home-service.status';

const TIMELINE: { key: keyof HomeServiceTripView; status: HomeServiceJobStatus }[] = [
  { key: 'assignedAt', status: 'ASSIGNED' },
  { key: 'enRouteAt', status: 'EN_ROUTE' },
  { key: 'arrivedAt', status: 'ARRIVED' },
  { key: 'startedAt', status: 'IN_PROGRESS' },
  { key: 'completedAt', status: 'COMPLETED' },
];

const REASSIGNABLE: ReadonlyArray<HomeServiceJobStatus> = ['NO_MATCH', 'ASSIGNED', 'EN_ROUTE'];

const STAFF_ICON = L.divIcon({
  className: 'dispatch-staff-icon',
  html: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" fill="hsl(var(--primary))" stroke="hsl(var(--card))" stroke-width="2"/>
  </svg>`,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const DEST_ICON = L.divIcon({
  className: 'dispatch-dest-icon',
  html: `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 22s7-6.16 7-12A7 7 0 0 0 5 10c0 5.84 7 12 7 12Z" fill="hsl(var(--accent))" stroke="hsl(var(--card))" stroke-width="1.5"/>
    <circle cx="12" cy="10" r="2.6" fill="hsl(var(--card))"/>
  </svg>`,
  iconSize: [28, 28],
  iconAnchor: [14, 26],
});

/** Read-only mini-map — destination pin + stylist's last known position (if any). */
function MiniMap({ trip }: { trip: HomeServiceTripView }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return undefined;
    const points: [number, number][] = [];
    if (trip.destLatitude != null && trip.destLongitude != null) points.push([trip.destLatitude, trip.destLongitude]);
    if (trip.lastLatitude != null && trip.lastLongitude != null) points.push([trip.lastLatitude, trip.lastLongitude]);
    if (points.length === 0) return undefined;

    const map = L.map(containerRef.current, {
      center: points[0],
      zoom: 13,
      zoomControl: false,
      dragging: true,
      scrollWheelZoom: false,
    });
    mapRef.current = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    if (trip.destLatitude != null && trip.destLongitude != null) {
      L.marker([trip.destLatitude, trip.destLongitude], { icon: DEST_ICON }).addTo(map);
    }
    if (trip.lastLatitude != null && trip.lastLongitude != null) {
      L.marker([trip.lastLatitude, trip.lastLongitude], { icon: STAFF_ICON }).addTo(map);
    }
    if (points.length > 1) {
      map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
    }

    const timer = window.setTimeout(() => map.invalidateSize(), 250);
    return () => {
      window.clearTimeout(timer);
      map.remove();
      mapRef.current = null;
    };
  }, [trip.destLatitude, trip.destLongitude, trip.lastLatitude, trip.lastLongitude]);

  if (trip.destLatitude == null && trip.lastLatitude == null) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-border shadow-sm">
      <div ref={containerRef} className="h-[190px] w-full" />
    </div>
  );
}

/** Small uppercase section heading with a tone-tinted icon chip, mirrors the stat-card idiom. */
function SectionHeading({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</span>
    </div>
  );
}

/** Compact labelled fact tile used in the info grid. */
function InfoTile({
  icon: Icon,
  label,
  children,
  span,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
  span?: boolean;
  tone?: 'default' | 'danger';
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-xl border border-border bg-muted/20 p-3 transition-colors hover:bg-muted/35',
        tone === 'danger' && 'border-destructive/25 bg-destructive-soft/60 hover:bg-destructive-soft',
        span && 'col-span-2',
      )}
    >
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
          tone === 'danger' ? 'bg-destructive/10 text-destructive' : 'bg-card text-muted-foreground shadow-xs',
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 pt-0.5">
        <p
          className={cn(
            'text-2xs font-medium uppercase tracking-wide',
            tone === 'danger' ? 'text-destructive/70' : 'text-muted-foreground',
          )}
        >
          {label}
        </p>
        <div className={cn('mt-0.5 truncate text-sm font-medium', tone === 'danger' && 'text-destructive')}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function HomeServiceTripDetailSheet({
  trip,
  now,
  onClose,
  onReassign,
  canManage,
}: {
  trip: HomeServiceTripView | null;
  now: number;
  onClose: () => void;
  onReassign?: (trip: HomeServiceTripView) => void;
  canManage: boolean;
}) {
  const { t } = useTranslation();

  const variant = trip ? STATUS_VARIANT[trip.status] : 'neutral';
  const live = trip ? isLive(trip, now) : false;
  const breach = trip ? slaBreached(trip, now) : false;
  const canReassign = Boolean(trip && canManage && onReassign && REASSIGNABLE.includes(trip.status));

  return (
    <Dialog open={Boolean(trip)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[88vh] w-full flex-col gap-0 overflow-hidden rounded-xl p-0 shadow-2xl sm:max-w-lg">
        {trip ? (
          <>
            <div className="relative flex items-start gap-3.5 overflow-hidden border-b border-border bg-gradient-to-b from-primary/[0.06] to-transparent px-6 py-5">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-primary/[0.07] blur-2xl"
              />
              <PersonAvatar name={trip.customerName} size={52} className="shrink-0 shadow-sm ring-4 ring-card" />
              <div className="min-w-0 flex-1 pr-6">
                <DialogTitle className="truncate text-lg">{trip.customerName}</DialogTitle>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{trip.serviceName}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant={variant} className="shadow-xs">
                    <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[variant])} aria-hidden="true" />
                    {t(`homeServiceDispatch.status.${trip.status}`)}
                  </Badge>
                  {breach ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive-soft px-2 py-0.5 text-2xs font-medium text-destructive shadow-xs">
                      <Timer className="h-3 w-3" aria-hidden="true" />
                      {t('homeServiceDispatch.slaBreach')}
                    </span>
                  ) : null}
                  {live ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-2xs font-medium text-success shadow-xs">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75 motion-reduce:animate-none" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                      </span>
                      {t('homeServiceDispatch.gpsLive')}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-2 gap-2.5">
                {trip.homeAddress ? (
                  <InfoTile icon={MapPin} label={t('homeServiceDispatch.detail.address')} span>
                    {trip.homeAddress}
                  </InfoTile>
                ) : null}
                <InfoTile icon={Phone} label={t('homeServiceDispatch.detail.phone')}>
                  <a href={`tel:${trip.customerPhone}`} className="text-primary hover:underline">
                    {trip.customerPhone}
                  </a>
                </InfoTile>
                <InfoTile icon={CalendarClock} label={t('homeServiceDispatch.detail.requestedAt')}>
                  <DateTimeText value={trip.startAt} mode="datetime" />
                </InfoTile>
                {trip.distanceMeters != null ? (
                  <InfoTile icon={Ruler} label={t('homeServiceDispatch.detail.distance')}>
                    {(trip.distanceMeters / 1000).toFixed(1)} km
                  </InfoTile>
                ) : null}
                {trip.customerNotes ? (
                  <InfoTile icon={StickyNote} label={t('homeServiceDispatch.detail.notes')} span>
                    <span className="text-muted-foreground">{trip.customerNotes}</span>
                  </InfoTile>
                ) : null}
                {trip.cancelReason ? (
                  <InfoTile icon={XCircle} label={t('homeServiceDispatch.detail.cancelReason')} span tone="danger">
                    {trip.cancelReason}
                  </InfoTile>
                ) : null}
              </div>

              <MiniMap trip={trip} />

              <div className="space-y-2.5">
                <SectionHeading icon={Scissors}>{t('homeServiceDispatch.col.stylist')}</SectionHeading>
                {trip.matchedStaffName ? (
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3">
                    <PersonAvatar name={trip.matchedStaffName} size={36} className="shadow-xs ring-2 ring-card" />
                    <span className="text-sm font-medium">{trip.matchedStaffName}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-xl border border-dashed border-destructive/30 bg-destructive-soft/50 p-3">
                    <Badge variant="danger">{t('homeServiceDispatch.noStylist')}</Badge>
                  </div>
                )}
              </div>

              <div className="space-y-2.5">
                <SectionHeading icon={Navigation}>{t('homeServiceDispatch.timeline')}</SectionHeading>
                <ol className="relative space-y-4 rounded-xl border border-border bg-muted/10 p-3.5 pl-4">
                  {TIMELINE.map((step, i) => {
                    const at = trip[step.key] as string | null;
                    const isLast = i === TIMELINE.length - 1;
                    return (
                      <li key={step.status} className="relative flex items-start gap-3 text-sm">
                        {!isLast ? (
                          <span
                            className={cn(
                              'absolute left-[7px] top-5 -bottom-4 w-px',
                              at ? 'bg-primary/30' : 'bg-border',
                            )}
                            aria-hidden="true"
                          />
                        ) : null}
                        <span className="relative mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center" aria-hidden="true">
                          {at ? (
                            <CheckCircle2 className="h-3.5 w-3.5 fill-primary text-card" />
                          ) : (
                            <span className="h-2 w-2 rounded-full bg-muted-foreground/30 ring-4 ring-card" />
                          )}
                        </span>
                        <span className={cn('flex-1 leading-5', !at && 'text-muted-foreground')}>
                          {t(`homeServiceDispatch.status.${step.status}`)}
                        </span>
                        {at ? (
                          <DateTimeText
                            value={at}
                            mode="time"
                            className="text-xs font-medium tabular-nums text-muted-foreground"
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            </div>

            {canReassign ? (
              <div className="border-t border-border bg-card px-6 py-4 shadow-[0_-4px_12px_-8px_rgb(0_0_0/0.15)]">
                <Button className="w-full gap-1.5" onClick={() => onReassign!(trip)}>
                  <Route className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('homeServiceDispatch.reassign')}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
