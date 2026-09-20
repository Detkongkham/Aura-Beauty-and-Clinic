import { CalendarDays, Clock, Clock3, Users } from 'lucide-react';
import { Fragment, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { EmptyState } from '@/components/shared/EmptyState';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Skeleton } from '@/components/ui/skeleton';
import { dayjs, formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AppointmentListItem } from '@/types/models';

import { STATUS_COLOR, formatDuration, isDead } from './appointments.lib';
import { FlagChips } from './appointments.parts';

export type TimelineLayout = 'time' | 'staff';

interface Props {
  rows: AppointmentListItem[];
  loading: boolean;
  now: number;
  onOpen: (id: string) => void;
  layout: TimelineLayout;
  onLayout: (l: TimelineLayout) => void;
}

/** One booking as a run-sheet line. Shared by both layouts so they stay identical to read. */
function AgendaRow({
  item,
  now,
  onOpen,
  showStaff = true,
}: {
  item: AppointmentListItem;
  now: number;
  onOpen: (id: string) => void;
  showStaff?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-muted/40 motion-reduce:transition-none"
    >
      <span className="w-14 shrink-0 pt-0.5 text-right">
        <span className="block text-xs font-semibold tabular-nums">
          <DateTimeText value={item.startAt} mode="time" />
        </span>
        <span className="block text-2xs tabular-nums text-muted-foreground">
          {formatDuration(item.durationMin)}
        </span>
      </span>

      <span
        aria-hidden="true"
        className="mt-1 w-1 shrink-0 self-stretch rounded-full"
        style={{ backgroundColor: STATUS_COLOR[item.status] }}
      />

      <PersonAvatar name={item.customerName} size={30} />

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-sm font-medium">{item.customerName}</span>
          <span className="truncate text-2xs text-muted-foreground">{item.customerPhone}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {item.serviceName}
          {showStaff ? ` · ${item.staffName}` : ''}
          {item.roomName ? ` · ${item.roomName}` : ''}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          <FlagChips item={item} now={now} />
        </span>
      </span>

      <span className="shrink-0 text-right">
        <span
          className={cn(
            'block text-sm font-semibold tabular-nums',
            isDead(item.status) && 'text-muted-foreground line-through',
          )}
        >
          {formatCurrency(item.price)}
        </span>
        <span className="block text-2xs text-muted-foreground">{t(`status.${item.status}`)}</span>
      </span>
    </button>
  );
}

/** Day header shared by both layouts. */
function DayHeader({
  date,
  isToday,
  count,
  minutes,
  value,
}: {
  date: string;
  isToday: boolean;
  count: number;
  minutes: number;
  value: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5">
      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <h3 className="text-xs font-semibold">
        <DateTimeText value={`${date}T00:00:00+07:00`} mode="date" />
      </h3>
      <span className="text-2xs text-muted-foreground">{dayjs(date).format('dddd')}</span>
      {isToday ? (
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-semibold text-primary">
          {t('appointments.today')}
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-3 text-2xs tabular-nums text-muted-foreground">
        <span>{t('appointments.itemsCount', { count })}</span>
        <span>{formatDuration(minutes)}</span>
        <span className="font-semibold text-foreground">{formatCurrency(value)}</span>
      </span>
    </div>
  );
}

/**
 * Agenda view — the filtered set read as a run sheet, in the order the desk will
 * work through it.
 *
 * Two layouts over the same rows:
 * - **By time** — every booking of the day in one column, with a "now" line.
 *   Answers *what happens next?*
 * - **By staff** — the day split into per-person lanes, each with its own booked
 *   hours. Answers *who is busy, and who is free?*
 *
 * Deliberately not a second calendar grid — `/calendar` owns the hour-grid. What
 * this adds is the money and the attention flags on every line, which the grid
 * has no room for.
 */
export function AppointmentsTimeline({ rows, loading, now, onOpen, layout, onLayout }: Props) {
  const { t } = useTranslation();

  const days = useMemo(() => {
    const m = new Map<string, AppointmentListItem[]>();
    for (const a of rows) {
      const key = dayjs(a.startAt).format('YYYY-MM-DD');
      const list = m.get(key);
      if (list) list.push(a);
      else m.set(key, [a]);
    }
    return [...m.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => ({
        date,
        list: [...list].sort((a, b) => a.startAt.localeCompare(b.startAt)),
      }));
  }, [rows]);

  const switcher = (
    <div
      role="group"
      aria-label={t('appointments.timelineLayout')}
      className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-xs"
    >
      {(
        [
          { key: 'time' as const, icon: Clock3, label: t('appointments.layoutTime') },
          { key: 'staff' as const, icon: Users, label: t('appointments.layoutStaff') },
        ]
      ).map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => onLayout(key)}
          aria-pressed={layout === key}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-2xs font-medium',
            'transition-colors duration-150 ease-out motion-reduce:transition-none',
            layout === key
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{switcher}</div>
        <EmptyState title={t('appointments.empty')} description={t('appointments.emptyHint')} />
      </div>
    );
  }

  const todayKey = dayjs(now).format('YYYY-MM-DD');

  return (
    <div className="space-y-3">
      <div className="flex justify-end">{switcher}</div>

      {days.map(({ date, list }, dayIndex) => {
        const isToday = date === todayKey;
        const live = list.filter((a) => !isDead(a.status));
        const value = live.reduce((s, a) => s + a.price, 0);
        const minutes = live.reduce((s, a) => s + a.durationMin, 0);

        return (
          <section
            key={date}
            style={{ animationDelay: `${Math.min(dayIndex, 8) * 40}ms` }}
            className={cn(
              'overflow-hidden rounded-xl border bg-card shadow-sm',
              'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
              isToday ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border',
            )}
          >
            <DayHeader
              date={date}
              isToday={isToday}
              count={list.length}
              minutes={minutes}
              value={value}
            />

            {layout === 'time' ? (
              <ol className="divide-y divide-border">
                {list.map((a, i) => {
                  const start = new Date(a.startAt).getTime();
                  const prev = list[i - 1];
                  const crossesNow =
                    isToday && start > now && (!prev || new Date(prev.startAt).getTime() <= now);
                  return (
                    <Fragment key={a.id}>
                      {crossesNow ? (
                        <li className="flex items-center gap-2 bg-primary/5 px-4 py-1" aria-hidden="true">
                          <Clock className="h-3 w-3 text-primary" />
                          <span className="text-2xs font-semibold text-primary">
                            {t('appointments.nowLine')}
                          </span>
                          <span className="h-px flex-1 bg-primary/40" />
                        </li>
                      ) : null}
                      <li>
                        <AgendaRow item={a} now={now} onOpen={onOpen} />
                      </li>
                    </Fragment>
                  );
                })}
              </ol>
            ) : (
              <StaffLanes list={list} now={now} onOpen={onOpen} />
            )}
          </section>
        );
      })}
    </div>
  );
}

/** One day split into per-staff lanes, busiest first. */
function StaffLanes({
  list,
  now,
  onOpen,
}: {
  list: AppointmentListItem[];
  now: number;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();

  const lanes = useMemo(() => {
    const m = new Map<string, { name: string; items: AppointmentListItem[] }>();
    for (const a of list) {
      const lane = m.get(a.staffId) ?? { name: a.staffName, items: [] };
      lane.items.push(a);
      m.set(a.staffId, lane);
    }
    return [...m.entries()]
      .map(([id, lane]) => {
        const live = lane.items.filter((a) => !isDead(a.status));
        return {
          id,
          name: lane.name,
          items: lane.items,
          minutes: live.reduce((s, a) => s + a.durationMin, 0),
          value: live.reduce((s, a) => s + a.price, 0),
        };
      })
      .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
  }, [list]);

  return (
    <div className="divide-y divide-border">
      {lanes.map((lane) => (
        <div key={lane.id}>
          <div className="flex items-center gap-2 bg-muted/30 px-4 py-1.5">
            <PersonAvatar name={lane.name} size={20} />
            <span className="truncate text-2xs font-semibold">{lane.name}</span>
            <span className="ml-auto flex items-center gap-3 text-2xs tabular-nums text-muted-foreground">
              <span>{t('appointments.itemsCount', { count: lane.items.length })}</span>
              <span>{formatDuration(lane.minutes)}</span>
              <span className="font-semibold text-foreground">{formatCurrency(lane.value)}</span>
            </span>
          </div>
          <ol className="divide-y divide-border">
            {lane.items.map((a) => (
              <li key={a.id}>
                <AgendaRow item={a} now={now} onOpen={onOpen} showStaff={false} />
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
