import { House } from 'lucide-react';
import { Fragment, useEffect, useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { StatusPill } from '@/components/shared/StatusPill';
import { formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import type { AppointmentListItem } from '@/types/models';

/** Rail dot colour per status — mirrors StatusPill's palette. */
const DOT: Record<string, string> = {
  PENDING: 'bg-warning',
  CONFIRMED: 'bg-info',
  IN_PROGRESS: 'bg-primary',
  COMPLETED: 'bg-success',
  CANCELLED: 'bg-muted-foreground/50',
  NO_SHOW: 'bg-destructive',
};
const CLOSED = new Set(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

interface Props {
  items: AppointmentListItem[];
  /** Total booked today — may exceed `items` when the server capped the agenda. */
  total: number;
  now: number;
}

/**
 * Today's agenda as a vertical rail. Past / closed slots are muted, the running one
 * is ringed, and a "Now" marker is drawn between the last past slot and the next
 * one. On mount the list scrolls itself (not the page) so "Now" sits near the top.
 */
export function TodayTimeline({ items, total, now }: Props) {
  const { t } = useTranslation();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const nowRef = useRef<HTMLLIElement>(null);
  const didScroll = useRef(false);

  const nowIndex = items.findIndex((a) => new Date(a.startAt).getTime() > now);
  const done = items.filter((a) => a.status === 'COMPLETED').length;
  const remaining = items.filter((a) => !CLOSED.has(a.status)).length;

  useLayoutEffect(() => {
    if (didScroll.current) return;
    const scroller = scrollerRef.current;
    const marker = nowRef.current;
    if (!scroller || !marker) return;
    scroller.scrollTop = Math.max(0, marker.offsetTop - 56);
    didScroll.current = true;
  }, [items.length]);

  // Reset when the agenda list changes identity entirely (branch switch).
  const firstId = items[0]?.id;
  useEffect(() => {
    didScroll.current = false;
  }, [firstId]);

  if (items.length === 0) {
    return (
      <div className="flex h-full min-h-40 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
        {t('dashboard.timeline.empty')}
      </div>
    );
  }

  const nowMarker = (
    <li ref={nowRef} className="relative flex items-center gap-2 py-1 pl-[68px]" aria-hidden="true">
      <span className="absolute left-[55px] h-2.5 w-2.5 rounded-full bg-destructive ring-4 ring-destructive/15 motion-safe:animate-pulse" />
      <span className="h-px flex-1 bg-destructive/50" />
      <span className="rounded-full bg-destructive px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white">
        {t('dashboard.timeline.now')} · {formatTime(now)}
      </span>
    </li>
  );

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
          {t('dashboard.timeline.remaining', { count: remaining })}
        </span>
        <span className="rounded-full bg-success-soft px-2 py-0.5 font-medium text-success">
          {t('dashboard.timeline.done', { count: done })}
        </span>
        <div
          className="ml-auto flex h-1.5 w-24 overflow-hidden rounded-full bg-muted"
          aria-hidden="true"
        >
          <span
            className="h-full rounded-full bg-success transition-[width] duration-500"
            style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="relative -mr-2 max-h-[340px] min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-width:thin]"
      >
        {/* rail */}
        <span aria-hidden="true" className="absolute bottom-2 left-[59px] top-2 w-px bg-border" />
        <ol className="relative space-y-0.5">
          {items.map((a, i) => {
            const start = new Date(a.startAt).getTime();
            const end = new Date(a.endAt).getTime();
            const live =
              a.status === 'IN_PROGRESS' || (start <= now && now < end && !CLOSED.has(a.status));
            const past = CLOSED.has(a.status) || end <= now;
            return (
              <Fragment key={a.id}>
                {i === nowIndex ? nowMarker : null}
                <li>
                  <Link
                    to={ROUTES.appointmentDetail(a.id)}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-xl py-1.5 pr-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      live && 'bg-primary/[0.06]',
                    )}
                  >
                    <span
                      className={cn(
                        'w-11 shrink-0 text-right text-xs font-semibold tabular-nums',
                        past ? 'text-muted-foreground' : 'text-foreground',
                      )}
                    >
                      {formatTime(a.startAt)}
                    </span>
                    <span className="relative flex w-3 shrink-0 justify-center">
                      <span
                        className={cn(
                          'h-2.5 w-2.5 rounded-full ring-[3px] ring-card',
                          DOT[a.status] ?? 'bg-muted-foreground',
                          live && 'ring-primary/25 motion-safe:animate-pulse',
                        )}
                      />
                    </span>
                    <PersonAvatar name={a.customerName} size={28} />
                    <div className={cn('min-w-0 flex-1', past && 'opacity-70')}>
                      <p
                        className={cn(
                          'truncate text-sm font-medium',
                          a.status === 'CANCELLED' && 'line-through decoration-muted-foreground/60',
                        )}
                      >
                        {a.customerName}
                      </p>
                      <p className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
                        {a.deliveryType === 'HOME_SERVICE' ? (
                          <House
                            className="h-3 w-3 shrink-0 text-primary"
                            aria-label={t('dashboard.timeline.home')}
                          />
                        ) : null}
                        <span className="truncate">
                          {a.serviceName} · {a.staffName}
                        </span>
                      </p>
                    </div>
                    <StatusPill
                      status={a.status}
                      label={t(`status.${a.status}`)}
                      className="hidden sm:inline-flex"
                    />
                  </Link>
                </li>
              </Fragment>
            );
          })}
          {nowIndex === -1 ? nowMarker : null}
        </ol>
      </div>

      {total > items.length ? (
        <Link
          to={ROUTES.calendar}
          className="text-center text-xs font-medium text-primary hover:underline"
        >
          {t('dashboard.timeline.more', { count: total - items.length })}
        </Link>
      ) : null}
    </div>
  );
}
