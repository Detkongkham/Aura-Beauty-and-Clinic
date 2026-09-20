import type { AppointmentStatus } from '@abcp/shared-types';
import { ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/shared/EmptyState';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Skeleton } from '@/components/ui/skeleton';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AppointmentListItem } from '@/types/models';

import { STATUS_COLOR, STATUS_VALUES, formatDuration, isDead } from './appointments.lib';
import { ChannelChips, FlagChips, PaymentCell } from './appointments.parts';

interface Props {
  rows: AppointmentListItem[];
  loading: boolean;
  now: number;
  onOpen: (id: string) => void;
  /** Clicking a lane header narrows the page to that status. */
  onPickStatus: (s: AppointmentStatus) => void;
  /** Total per status across the whole filtered set, so a lane can say "showing 12 of 340". */
  byStatus?: Record<AppointmentStatus, number>;
}

function Card({
  item,
  now,
  onOpen,
  index,
}: {
  item: AppointmentListItem;
  now: number;
  onOpen: (id: string) => void;
  index: number;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
      className={cn(
        'group w-full rounded-lg border border-border bg-card p-2.5 text-left shadow-xs',
        'animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
        'transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
      )}
    >
      <div className="flex items-start gap-2">
        <PersonAvatar name={item.customerName} size={28} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold">{item.customerName}</p>
          <p className="truncate text-2xs text-muted-foreground">{item.serviceName}</p>
        </div>
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden="true"
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-2xs tabular-nums text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <DateTimeText value={item.startAt} mode="date" />
          <span className="font-semibold text-foreground">
            <DateTimeText value={item.startAt} mode="time" />
          </span>
          <span>· {formatDuration(item.durationMin)}</span>
        </span>
        <span className={cn('font-semibold', isDead(item.status) ? 'line-through' : 'text-foreground')}>
          {formatCurrency(item.price)}
        </span>
      </div>

      <p className="mt-1 truncate text-2xs text-muted-foreground" title={item.staffName}>
        {item.staffName} · {item.branchName}
      </p>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
        <span className="flex flex-wrap items-center gap-1">
          <FlagChips item={item} now={now} />
          <ChannelChips item={item} />
        </span>
        {!isDead(item.status) ? <PaymentCell item={item} align="left" /> : null}
      </div>
      <span className="sr-only">{t('appointments.details')}</span>
    </button>
  );
}

/**
 * Status board — one lane per stage of the booking lifecycle.
 *
 * It shows the rows of the **current page**, not the whole result set: paging
 * stays server-side, so a lane header states how many of that status exist in
 * total and clicking it filters the page down to exactly those.
 */
export function AppointmentsBoard({ rows, loading, now, onOpen, onPickStatus, byStatus }: Props) {
  const { t } = useTranslation();

  const lanes = useMemo(() => {
    const m = new Map<AppointmentStatus, AppointmentListItem[]>(STATUS_VALUES.map((s) => [s, []]));
    for (const a of rows) m.get(a.status)?.push(a);
    for (const list of m.values()) list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return m;
  }, [rows]);

  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {STATUS_VALUES.map((s) => (
          <Skeleton key={s} className="h-64 rounded-xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState title={t('appointments.empty')} description={t('appointments.emptyHint')} />;
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {STATUS_VALUES.map((s) => {
        const list = lanes.get(s) ?? [];
        const totalForStatus = byStatus?.[s];
        return (
          <section
            key={s}
            className={cn(
              'flex min-h-[120px] flex-col overflow-hidden rounded-xl border border-border bg-muted/20',
              'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
            )}
          >
            <button
              type="button"
              onClick={() => onPickStatus(s)}
              className="flex items-center gap-2 border-b border-border bg-card px-3 py-2 text-left transition-colors duration-150 hover:bg-muted/50 motion-reduce:transition-none"
              style={{ boxShadow: `inset 0 2px 0 0 ${STATUS_COLOR[s]}` }}
            >
              <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[s] }} />
              <h3 className="truncate text-xs font-semibold">{t(`status.${s}`)}</h3>
              <span className="ml-auto shrink-0 text-2xs tabular-nums text-muted-foreground">
                {totalForStatus != null && totalForStatus !== list.length
                  ? t('appointments.showing', { shown: list.length, total: totalForStatus })
                  : list.length}
              </span>
            </button>

            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2 [max-height:70vh]">
              {list.length === 0 ? (
                <p className="px-1 py-6 text-center text-2xs text-muted-foreground">
                  {t('appointments.laneEmpty')}
                </p>
              ) : (
                list.map((a, i) => <Card key={a.id} item={a} now={now} onOpen={onOpen} index={i} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
