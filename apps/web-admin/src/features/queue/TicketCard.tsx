import { BellRing, Clock, MapPin, Phone, Scissors, StickyNote, Timer, UserRound, UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { DateTimeText } from '@/components/shared/DateTimeText';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { QueueTicket } from '@/types/models';

import { TicketActionsMenu, type TicketHandlers } from './TicketActionsMenu';
import { TicketTags } from './TicketTags';
import type { QueueStatus } from './queue.api';
import {
  ADVANCE_BTN,
  ADVANCE_ICON,
  FLASH_RING,
  HOVER_BORDER,
  NEXT,
  NUM_CHIP,
  RAIL,
  initials,
  serviceProgress,
  urgencyOf,
  type ActiveStatus,
} from './queue.lib';

interface TicketCardProps {
  ticket: QueueTicket;
  now: number;
  position: number;
  /** Estimated minutes until service starts (waiting / called only). */
  etaMin?: number;
  canManage: boolean;
  pending: boolean;
  index: number;
  compact: boolean;
  showBranch: boolean;
  flash: boolean;
  fmtWait: (minutes: number) => string;
  handlers: TicketHandlers;
}

export function TicketCard({
  ticket,
  now,
  position,
  etaMin,
  canManage,
  pending,
  index,
  compact,
  showBranch,
  flash,
  fmtWait,
  handlers,
}: TicketCardProps) {
  const { t } = useTranslation();
  const status = ticket.status as ActiveStatus;
  const next = NEXT[ticket.status as QueueStatus];
  const NextIcon = next ? ADVANCE_ICON[next] : null;

  const { elapsedMin, pct, level } = urgencyOf(ticket, now);
  const fillClass = level === 'late' ? 'bg-destructive' : 'bg-warning';
  const prog = status === 'IN_SERVICE' ? serviceProgress(ticket, now) : null;
  const dur = ticket.serviceDurationMin;
  const finishAt =
    status === 'IN_SERVICE' && dur
      ? new Date(new Date(ticket.startedAt ?? ticket.calledAt ?? ticket.issuedAt).getTime() + dur * 60_000)
      : null;

  return (
    <li
      className={cn(
        'group relative shrink-0 overflow-hidden rounded-lg border border-border bg-card shadow-xs',
        compact ? 'p-2.5 pl-3.5' : 'p-3 pl-4',
        'transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-px hover:shadow-md',
        HOVER_BORDER[status],
        'animate-in fade-in slide-in-from-bottom-1 fill-mode-both motion-reduce:animate-none motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        ticket.priority === 'VIP' && 'border-accent/40 bg-gradient-to-br from-accent-soft/25 to-card',
        flash && cn('ring-2 ring-offset-0', FLASH_RING[status]),
      )}
      style={index > 0 ? { animationDelay: `${Math.min(index, 10) * 30}ms` } : undefined}
    >
      {/* ageing spine — base rail + urgency fill rising from the bottom */}
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', RAIL[status])} />
      {level !== 'ok' ? (
        <span
          aria-hidden="true"
          className={cn(
            'absolute bottom-0 left-0 w-1 transition-[height] duration-500 ease-out motion-reduce:transition-none',
            fillClass,
          )}
          style={{ height: `${Math.max(pct, 8)}%` }}
        />
      ) : null}

      {/* row 1 — number · position · wait */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn('rounded-md px-1.5 py-0.5 text-sm font-bold tabular-nums', NUM_CHIP[status])}
          >
            {ticket.number}
          </span>
          {status === 'WAITING' ? (
            <span className="text-2xs tabular-nums text-muted-foreground">#{position}</span>
          ) : null}
          {(ticket.callCount ?? 0) > 1 ? (
            <span
              className="inline-flex items-center gap-0.5 text-2xs tabular-nums text-muted-foreground"
              title={t('queue.calledTimes', { n: ticket.callCount })}
            >
              <BellRing className="h-3 w-3" aria-hidden="true" />×{ticket.callCount}
            </span>
          ) : null}
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-semibold tabular-nums',
            level === 'late'
              ? 'bg-destructive-soft text-destructive'
              : level === 'warn'
                ? 'bg-warning-soft text-warning'
                : 'bg-muted text-muted-foreground',
          )}
          title={t(`queue.elapsedIn.${status}`)}
        >
          <Clock className="h-3 w-3" aria-hidden="true" />
          {fmtWait(elapsedMin)}
        </span>
      </div>

      {/* row 2 — customer */}
      <div className="mt-2 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-semibold text-muted-foreground ring-1 ring-inset ring-border"
        >
          {initials(ticket.customerName)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{ticket.customerName}</p>
          <TicketTags ticket={ticket} className="mt-0.5" />
        </div>
        {ticket.customerPhone && !compact ? (
          <a
            href={`tel:${ticket.customerPhone}`}
            aria-label={`${t('queue.phoneLabel')} ${ticket.customerPhone}`}
            title={ticket.customerPhone}
            className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Phone className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      {/* row 3 — service + staff */}
      <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
        <p className="flex min-w-0 items-center gap-1.5">
          <Scissors className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate text-foreground">{ticket.serviceName}</span>
          {dur ? (
            <span className="shrink-0 rounded bg-muted px-1 py-px text-2xs tabular-nums">
              {t('queue.estDuration', { n: dur })}
            </span>
          ) : null}
        </p>
        <p className="flex min-w-0 items-center gap-1.5">
          <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{ticket.staffName ?? t('queue.anyStaff')}</span>
          {showBranch && ticket.branchName ? (
            <>
              <MapPin className="ml-1 h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{ticket.branchName}</span>
            </>
          ) : null}
        </p>
      </div>

      {ticket.note ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-warning-soft/60 px-2 py-1 text-2xs text-foreground">
          <StickyNote className="mt-px h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
          <span className="line-clamp-2">{ticket.note}</span>
        </p>
      ) : null}

      {/* row 4 — state-specific context */}
      {!compact ? (
        status === 'IN_SERVICE' && prog ? (
          <div className="mt-2.5">
            <div className="flex items-center justify-between text-2xs tabular-nums text-muted-foreground">
              <span>
                {t('queue.startedLabel')}{' '}
                <DateTimeText value={ticket.startedAt ?? ticket.calledAt} mode="time" />
              </span>
              {finishAt ? (
                <span className="inline-flex items-center gap-1 font-medium text-foreground">
                  <Timer className="h-3 w-3" aria-hidden="true" />
                  {t('queue.eta')} <DateTimeText value={finishAt.toISOString()} mode="time" />
                </span>
              ) : null}
            </div>
            {prog.pct != null ? (
              <div
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(100, prog.pct)}
                aria-label={t('queue.serviceProgress')}
              >
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none',
                    prog.pct > 100 ? 'bg-destructive' : 'bg-success',
                  )}
                  style={{ width: `${Math.min(100, prog.pct)}%` }}
                />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-2xs tabular-nums text-muted-foreground">
            <span>
              {t('queue.waitingSince')} <DateTimeText value={ticket.issuedAt} mode="time" />
            </span>
            {ticket.calledAt ? (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {t('queue.calledLabel')}{' '}
                  <DateTimeText value={ticket.lastCalledAt ?? ticket.calledAt} mode="time" />
                </span>
              </>
            ) : null}
            {etaMin != null && !ticket.carriedOver ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-medium text-foreground">
                  {etaMin === 0 ? t('queue.readyNow') : t('queue.inAbout', { t: fmtWait(etaMin) })}
                </span>
              </>
            ) : null}
          </p>
        )
      ) : null}

      {/* actions */}
      {canManage && next ? (
        <div className="relative z-10 mt-2.5 flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            className={cn('h-8 flex-1', ADVANCE_BTN[status])}
            disabled={pending}
            onClick={() => handlers.advance(ticket)}
          >
            {NextIcon ? <NextIcon className="h-4 w-4" aria-hidden="true" /> : null}
            {t(`queue.advanceTo.${next}`)}
          </Button>
          {status === 'CALLED' ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                className="h-8 w-8 shrink-0 p-0"
                disabled={pending}
                onClick={() => handlers.recall(ticket)}
                aria-label={`${t('queue.recall')} ${ticket.number}`}
                title={t('queue.recall')}
              >
                <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 shrink-0 p-0 text-destructive hover:bg-destructive-soft"
                disabled={pending}
                onClick={() => handlers.cancel(ticket, 'NO_SHOW')}
                aria-label={`${t('queue.markNoShow')} ${ticket.number}`}
                title={t('queue.markNoShow')}
              >
                <UserX className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </>
          ) : null}
          <TicketActionsMenu ticket={ticket} handlers={handlers} disabled={pending} />
        </div>
      ) : null}

      {/* stretched "open detail" target — sits below the interactive controls in z-order */}
      <button
        type="button"
        onClick={() => handlers.openDetail(ticket)}
        aria-label={`${t('queue.viewDetail')} ${ticket.number}`}
        className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
    </li>
  );
}
