import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/shared/EmptyState';
import { cn } from '@/lib/utils';
import type { QueueTicket } from '@/types/models';

import { TicketCard } from './TicketCard';
import type { TicketHandlers } from './TicketActionsMenu';
import { urgencyOf, type LaneDef } from './queue.lib';

interface Props {
  lane: LaneDef;
  /** Every ticket in the lane (unfiltered) — for position + "n/m" counts. */
  all: QueueTicket[];
  /** The filtered subset that is rendered. */
  tickets: QueueTicket[];
  filtered: boolean;
  now: number;
  eta: Map<string, number>;
  canManage: boolean;
  pendingId?: string;
  compact: boolean;
  showBranch: boolean;
  flashIds: Set<string>;
  fmtWait: (m: number) => string;
  handlers: TicketHandlers;
  /** Tall single-lane layout (lane filter on) — cards flow into a grid. */
  expanded: boolean;
}

export function QueueLane({
  lane,
  all,
  tickets,
  filtered,
  now,
  eta,
  canManage,
  pendingId,
  compact,
  showBranch,
  flashIds,
  fmtWait,
  handlers,
  expanded,
}: Props) {
  const { t } = useTranslation();
  const Icon = lane.icon;
  const late = all.filter((tk) => urgencyOf(tk, now).level === 'late').length;
  const avg = all.length
    ? Math.round(all.reduce((sum, tk) => sum + urgencyOf(tk, now).elapsedMin, 0) / all.length)
    : 0;

  return (
    <section
      aria-labelledby={`lane-${lane.status}`}
      className={cn('flex min-w-0 flex-col overflow-hidden rounded-xl border border-border shadow-sm', lane.body)}
    >
      <header className={cn('sticky top-0 z-[1] flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5', lane.tint)}>
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', lane.chip)}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <h2 id={`lane-${lane.status}`} className="truncate text-sm font-semibold">
            {t(`status.${lane.status}`)}
          </h2>
          <span
            className={cn(
              'inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
              lane.count,
            )}
          >
            {filtered ? `${tickets.length}/${all.length}` : all.length}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {late > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive-soft px-1.5 py-0.5 text-2xs font-semibold tabular-nums text-destructive">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden="true" />
              {t('queue.slaBreached', { n: late })}
            </span>
          ) : null}
          {all.length > 0 ? (
            <span
              className="hidden items-center gap-1 text-2xs tabular-nums text-muted-foreground sm:inline-flex"
              title={t(`queue.laneAvg.${lane.status}`)}
            >
              <Clock className="h-3 w-3" aria-hidden="true" />
              {fmtWait(avg)}
            </span>
          ) : null}
        </div>
      </header>

      <div className="flex-1 p-2.5">
        {tickets.length === 0 ? (
          <EmptyState
            title={filtered && all.length > 0 ? t('queue.noMatch') : t(`queue.laneEmptyBy.${lane.status}`)}
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <ul
            className={cn(
              'gap-2 overflow-y-auto pr-0.5',
              expanded
                ? 'grid sm:grid-cols-2'
                : 'flex max-h-[calc(100dvh-330px)] min-h-[260px] flex-col',
            )}
          >
            {tickets.map((tk, i) => (
              <TicketCard
                key={tk.id}
                ticket={tk}
                now={now}
                position={all.indexOf(tk) + 1}
                etaMin={eta.get(tk.id)}
                canManage={canManage}
                pending={pendingId === tk.id}
                index={i}
                compact={compact}
                showBranch={showBranch}
                flash={flashIds.has(tk.id)}
                fmtWait={fmtWait}
                handlers={handlers}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
