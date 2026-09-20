import 'dayjs/locale/lo';

import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleCheckBig,
  CircleSlash,
  CircleX,
  Clock,
  Loader,
  Search,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { StatusPill } from '@/components/shared/StatusPill';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCalendarAppointments } from '@/features/appointments/appointments.api';
import { useStaffList } from '@/features/staff/staff.api';
import { dayjs, formatDate, formatCurrency, startOfWeekApp } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui.store';
import type { AppointmentListItem, StaffProfile } from '@/types/models';

/** Fallback grid window when a day has no appointments to size it from. */
const FALLBACK_START_HOUR = 9;
const FALLBACK_END_HOUR = 18;
const MIN_HOUR = 6;
const MAX_HOUR = 23;
const HOUR_PX = 40;

const STATUS_ORDER = [
  'CONFIRMED',
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
] as const;

/** Per-status visual language — mirrors the dashboard's status treatment so the
 *  two pages read as one system. Class strings are complete literals so Tailwind
 *  keeps them. */
type ApptStatusKey =
  | 'CONFIRMED'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

const STATUS_STYLE: Record<
  ApptStatusKey,
  { icon: LucideIcon; text: string; tint: string; accent: string; dot: string; bar: string }
> = {
  CONFIRMED: {
    icon: CircleCheck,
    text: 'text-info',
    tint: 'bg-info/10 hover:bg-info/15',
    accent: 'border-l-info',
    dot: 'bg-info',
    bar: 'bg-info',
  },
  PENDING: {
    icon: Clock,
    text: 'text-warning',
    tint: 'bg-warning/10 hover:bg-warning/15',
    accent: 'border-l-warning',
    dot: 'bg-warning',
    bar: 'bg-warning',
  },
  IN_PROGRESS: {
    icon: Loader,
    text: 'text-primary',
    tint: 'bg-primary/10 hover:bg-primary/15',
    accent: 'border-l-primary',
    dot: 'bg-primary',
    bar: 'bg-primary',
  },
  COMPLETED: {
    icon: CircleCheckBig,
    text: 'text-success',
    tint: 'bg-success/10 hover:bg-success/15',
    accent: 'border-l-success',
    dot: 'bg-success',
    bar: 'bg-success',
  },
  CANCELLED: {
    icon: CircleSlash,
    text: 'text-muted-foreground',
    tint: 'bg-muted hover:bg-muted/80',
    accent: 'border-l-muted-foreground/40',
    dot: 'bg-muted-foreground',
    bar: 'bg-muted-foreground/50',
  },
  NO_SHOW: {
    icon: CircleX,
    text: 'text-destructive',
    tint: 'bg-destructive/10 hover:bg-destructive/15',
    accent: 'border-l-destructive',
    dot: 'bg-destructive',
    bar: 'bg-destructive',
  },
};

function styleFor(status: string) {
  return STATUS_STYLE[status as ApptStatusKey] ?? STATUS_STYLE.CANCELLED;
}

/** Day with Lao weekday / month names, without switching the global dayjs locale. */
const lao = (d: ReturnType<typeof dayjs>) => d.locale('lo');

/** Shared entrance for staggered card grids — fade + rise, capped like CardCount. */
const ENTER = 'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none';
function stagger(index: number): CSSProperties {
  return { animationDelay: `${Math.min(index, 12) * 40}ms` };
}

/** Framed block — one radius / border / shadow for every calendar surface. */
function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card shadow-sm', className)}>
      {children}
    </div>
  );
}

/**
 * Status filter chip — soft status-tinted card with a left accent bar. Clicking
 * toggles the grid/roster filter. Carries the CardCount motion contract:
 * staggered entrance + hover/press interaction, both dropped for reduced motion.
 */
function StatusCard({
  icon: Icon,
  label,
  value,
  text,
  tint,
  accent,
  active,
  onClick,
  index,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  text: string;
  tint: string;
  accent: string;
  active: boolean;
  onClick: () => void;
  index: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={stagger(index)}
      className={cn(
        ENTER,
        'flex items-center gap-2.5 rounded-lg border border-l-[3px] border-border p-2.5 text-left shadow-xs',
        'transition-[transform,background-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:shadow-xs motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        tint,
        accent,
        active && 'ring-1 ring-primary ring-offset-1 ring-offset-background',
      )}
    >
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background/70',
          text,
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-2xs font-medium text-muted-foreground">{label}</span>
        <span className={cn('block text-lg font-semibold leading-tight tabular-nums', text)}>
          {value}
        </span>
      </span>
    </button>
  );
}

export function CalendarPage() {
  const { t } = useTranslation();
  const branchId = useUiStore((s) => s.activeBranchId);
  const [anchor, setAnchor] = useState(() => dayjs().startOf('day'));
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [mode, setMode] = useState<'day' | 'week'>('day');

  const weekStart = startOfWeekApp(anchor);
  const weekEnd = weekStart.add(6, 'day').endOf('day');

  const { data: staffPage } = useStaffList({
    page: 1,
    pageSize: 100,
    branchId: branchId === 'all' ? undefined : branchId,
  });
  const staff = (staffPage?.items ?? []).filter((s) => s.isActive);

  const { data: appts = [], isLoading } = useCalendarAppointments({
    from: weekStart.toISOString(),
    to: weekEnd.toISOString(),
    branchId: branchId === 'all' ? undefined : branchId,
  });

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')),
    [weekStart],
  );

  // Per-day buckets keyed by ISO date — drives the strip and the grid.
  const byDay = useMemo(() => {
    const m = new Map<string, AppointmentListItem[]>();
    for (const a of appts) {
      const key = dayjs(a.startAt).format('YYYY-MM-DD');
      const list = m.get(key);
      if (list) list.push(a);
      else m.set(key, [a]);
    }
    return m;
  }, [appts]);

  // Per-staff buckets — drives the "by staff" week view.
  const byStaff = useMemo(() => {
    const m = new Map<string, AppointmentListItem[]>();
    for (const a of appts) {
      const list = m.get(a.staffId);
      if (list) list.push(a);
      else m.set(a.staffId, [a]);
    }
    return m;
  }, [appts]);

  const statusCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of appts) m.set(a.status, (m.get(a.status) ?? 0) + 1);
    return STATUS_ORDER.filter((s) => m.has(s)).map((status) => ({
      status,
      count: m.get(status)!,
    }));
  }, [appts]);

  const matchesFilter = (a: AppointmentListItem) => !statusFilter || a.status === statusFilter;
  const visibleAppts = appts.filter(matchesFilter);

  const dayKey = anchor.format('YYYY-MM-DD');
  const dayAppts = useMemo(() => byDay.get(dayKey) ?? [], [byDay, dayKey]);
  const dayVisible = dayAppts.filter(matchesFilter);

  // Dynamic hour window — size the grid to the day's real span, not a fixed 08–21.
  const [startHour, endHour] = useMemo(() => {
    if (dayAppts.length === 0) return [FALLBACK_START_HOUR, FALLBACK_END_HOUR];
    let min = 24;
    let max = 0;
    for (const a of dayAppts) {
      const s = dayjs(a.startAt);
      const e = dayjs(a.endAt);
      min = Math.min(min, s.hour());
      max = Math.max(max, e.hour() + (e.minute() > 0 ? 1 : 0));
    }
    const lo = Math.max(MIN_HOUR, min - 1);
    const hi = Math.min(MAX_HOUR, Math.max(max + 1, lo + 4));
    return [lo, hi];
  }, [dayAppts]);

  const hours = useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour],
  );
  const gridHeight = hours.length * HOUR_PX;

  const now = dayjs();
  const isTodaySelected = anchor.isSame(now, 'day');
  const nowTop = (now.hour() + now.minute() / 60 - startHour) * HOUR_PX;
  const showNowLine = isTodaySelected && nowTop >= 0 && nowTop <= gridHeight;

  const shiftWeek = (dir: 1 | -1) => setAnchor((a) => a.add(dir * 7, 'day'));

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('nav.calendar')}
        description={t('calendar.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-1 shadow-sm">
              {/* Date field — native picker, but the visible label is our own
                  locale-neutral format so it never renders in the OS locale. */}
              <div className="relative flex items-center">
                <CalendarDays
                  className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary"
                  aria-hidden="true"
                />
                <span className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 whitespace-nowrap text-xs font-semibold tabular-nums">
                  {formatDate(anchor.toDate())}
                </span>
                <input
                  type="date"
                  lang="lo"
                  aria-label={t('calendar.pickDate')}
                  value={anchor.format('YYYY-MM-DD')}
                  onChange={(e) => {
                    const d = dayjs(e.target.value);
                    if (d.isValid()) setAnchor(d.startOf('day'));
                  }}
                  className={cn(
                    'h-8 w-[128px] cursor-pointer rounded-md bg-transparent pl-7 pr-2 text-transparent outline-none',
                    'transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40',
                    '[&::-webkit-datetime-edit]:text-transparent',
                    '[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0',
                  )}
                />
              </div>

              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => shiftWeek(-1)}
                aria-label={t('pagination.prev')}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5"
                onClick={() => setAnchor(dayjs().startOf('day'))}
              >
                {t('calendar.today')}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => shiftWeek(1)}
                aria-label={t('pagination.next')}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        }
      />

      {/* Range label + live count */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold tabular-nums">
          {formatDate(weekStart.toDate())} – {formatDate(weekEnd.toDate())}
        </span>
        <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
          {t('calendar.apptCount', { count: visibleAppts.length })}
        </span>
      </div>

      {/* Status summary cards — click to filter the strip + grid below */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-[60px] w-full rounded-lg" />
          ))}
        </div>
      ) : appts.length > 0 ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
          <StatusCard
            icon={CalendarDays}
            label={t('calendar.total')}
            value={appts.length}
            text="text-primary"
            tint="bg-primary/10 hover:bg-primary/15"
            accent="border-l-primary"
            active={statusFilter === null}
            onClick={() => setStatusFilter(null)}
            index={0}
          />
          {statusCounts.map(({ status, count }, i) => {
            const s = styleFor(status);
            return (
              <StatusCard
                key={status}
                icon={s.icon}
                label={t(`status.${status}`)}
                value={count}
                text={s.text}
                tint={s.tint}
                accent={s.accent}
                active={statusFilter === status}
                onClick={() => setStatusFilter((cur) => (cur === status ? null : status))}
                index={i + 1}
              />
            );
          })}
        </div>
      ) : null}

      {/* Week strip — always-visible overview + day picker */}
      <Panel className="p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{t('calendar.overview')}</p>
          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <TabsList className="h-8">
              <TabsTrigger value="day" className="text-xs">
                {t('calendar.tabDay')}
              </TabsTrigger>
              <TabsTrigger value="week" className="text-xs">
                {t('calendar.tabWeek')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((d, i) => {
            const key = d.format('YYYY-MM-DD');
            const items = (byDay.get(key) ?? []).filter(matchesFilter);
            const isSel = d.isSame(anchor, 'day');
            const isToday = d.isSame(now, 'day');
            const segCounts = STATUS_ORDER.map((st) => ({
              st,
              n: items.filter((a) => a.status === st).length,
            })).filter((s) => s.n > 0);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setAnchor(d.startOf('day'))}
                aria-pressed={isSel}
                style={stagger(i)}
                className={cn(
                  ENTER,
                  'flex flex-col items-center gap-1 rounded-lg border p-1.5',
                  'transition-[transform,background-color,border-color,box-shadow] duration-200',
                  'hover:-translate-y-0.5 hover:shadow-sm motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                  isSel
                    ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                    : 'border-border bg-background hover:bg-muted/50',
                )}
              >
                <span
                  className={cn(
                    'text-[10px] font-semibold uppercase tracking-wide',
                    isSel ? 'text-primary' : isToday ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {lao(d).format('ddd')}
                </span>
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-colors',
                    isToday
                      ? 'bg-primary text-primary-foreground'
                      : isSel
                        ? 'bg-primary/15 text-primary'
                        : 'text-foreground',
                  )}
                >
                  {d.format('D')}
                </span>
                <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                  {items.length || '·'}
                </span>
                <span className="flex h-1 w-full gap-px overflow-hidden rounded-full bg-muted">
                  {segCounts.map(({ st, n }) => (
                    <span
                      key={st}
                      className={cn('h-full rounded-full transition-all', styleFor(st).bar)}
                      style={{ width: `${(n / items.length) * 100}%` }}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Detail — day grid · week-by-day agenda. Keyed so it fades on switch. */}
      <div
        key={`${mode}-${dayKey}`}
        className="animate-in fade-in duration-200 motion-reduce:animate-none"
      >
      {isLoading ? (
        <Skeleton className="h-[420px] w-full rounded-xl" />
      ) : mode === 'week' ? (
        <WeekAgenda
          days={weekDays}
          byDay={byDay}
          matchesFilter={matchesFilter}
          statusFiltered={statusFilter !== null}
        />
      ) : staff.length === 0 ? (
        <EmptyState title={t('calendar.noStaff')} />
      ) : (
        <Panel className="overflow-hidden">
          <div className="max-h-[440px] overflow-auto">
            <div className="flex min-w-[600px]">
              {/* time gutter */}
              <div className="sticky left-0 z-30 w-14 shrink-0 border-r border-border bg-card">
                <div className="h-12 border-b border-border" />
                <div className="relative" style={{ height: gridHeight }}>
                  {hours.map((h, i) => (
                    <div
                      key={h}
                      className="absolute right-2 -translate-y-1/2 text-2xs font-medium tabular-nums text-muted-foreground"
                      style={{ top: i * HOUR_PX }}
                    >
                      {String(h).padStart(2, '0')}:00
                    </div>
                  ))}
                  {showNowLine ? (
                    <div
                      className="absolute right-1.5 -translate-y-1/2 rounded bg-destructive px-1 py-px text-[10px] font-semibold leading-none tabular-nums text-white"
                      style={{ top: nowTop }}
                    >
                      {now.format('HH:mm')}
                    </div>
                  ) : null}
                </div>
              </div>

              {staff.map((s) => {
                const lane = dayVisible.filter((a) => a.staffId === s.id);
                return (
                  <div
                    key={s.id}
                    className="min-w-[150px] flex-1 border-r border-border last:border-r-0"
                  >
                    <div className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-border bg-card/95 px-2 backdrop-blur supports-[backdrop-filter]:bg-card/80">
                      <PersonAvatar name={s.name} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold leading-tight">
                          {s.name}
                        </span>
                        <span className="block text-2xs text-muted-foreground">
                          {t('calendar.apptCount', { count: lane.length })}
                        </span>
                      </span>
                    </div>

                    <div className="relative" style={{ height: gridHeight }}>
                      {hours.map((h, i) => (
                        <div
                          key={h}
                          className={cn(
                            'absolute inset-x-0 border-b border-border/50',
                            i % 2 === 1 && 'bg-muted/30',
                          )}
                          style={{ top: i * HOUR_PX, height: HOUR_PX }}
                        />
                      ))}

                      {showNowLine ? (
                        <div
                          className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                          style={{ top: nowTop }}
                        >
                          <span className="relative flex h-1.5 w-1.5 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60 motion-reduce:hidden" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
                          </span>
                          <span className="h-px flex-1 bg-destructive/60" />
                        </div>
                      ) : null}

                      {lane.map((a, ai) => {
                        const start = dayjs(a.startAt);
                        const end = dayjs(a.endAt);
                        const top = (start.hour() + start.minute() / 60 - startHour) * HOUR_PX;
                        const height = Math.max(20, end.diff(start, 'minute') * (HOUR_PX / 60));
                        if (top < 0 || top > gridHeight) return null;
                        const st = styleFor(a.status);
                        return (
                          <div
                            key={a.id}
                            className={cn(
                              'absolute left-1 right-1 overflow-hidden rounded-md border border-border border-l-[3px] px-1.5 py-1 shadow-xs',
                              'animate-in fade-in zoom-in-95 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
                              'transition-[transform,box-shadow] duration-150 hover:z-30 hover:-translate-y-px hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                              st.tint,
                              st.accent,
                            )}
                            style={{ top, height, animationDelay: `${Math.min(ai, 10) * 35}ms` }}
                            title={`${start.format('HH:mm')} · ${a.customerName} · ${a.serviceName}`}
                          >
                            <p
                              className={cn(
                                'truncate text-2xs font-semibold tabular-nums',
                                st.text,
                              )}
                            >
                              {start.format('HH:mm')} · {a.customerName}
                            </p>
                            <p className="truncate text-2xs text-muted-foreground">
                              {a.serviceName}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      )}
      </div>

      {/* Weekly staff roster — always visible, one block per day, fully detailed */}
      {!isLoading && staff.length > 0 && appts.length > 0 ? (
        <StaffRoster
          days={weekDays}
          staff={staff}
          byStaff={byStaff}
          matchesFilter={matchesFilter}
          statusFiltered={statusFilter !== null}
          anchor={anchor}
          onPickWeek={(d) => setAnchor(d.startOf('day'))}
        />
      ) : null}
    </div>
  );
}

function WeekAgenda({
  days,
  byDay,
  matchesFilter,
  statusFiltered,
}: {
  days: ReturnType<typeof dayjs>[];
  byDay: Map<string, AppointmentListItem[]>;
  matchesFilter: (a: AppointmentListItem) => boolean;
  statusFiltered: boolean;
}) {
  const { t } = useTranslation();
  const today = dayjs();

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {days.map((d, di) => {
        const isToday = d.isSame(today, 'day');
        const items = (byDay.get(d.format('YYYY-MM-DD')) ?? [])
          .filter(matchesFilter)
          .sort((a, b) => a.startAt.localeCompare(b.startAt));
        return (
          <section
            key={d.toISOString()}
            style={stagger(di)}
            className={cn(
              ENTER,
              'rounded-xl border bg-card shadow-sm',
              'transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0',
              isToday ? 'border-primary/50 ring-1 ring-primary/30' : 'border-border',
            )}
          >
            <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">{lao(d).format('dddd')}</p>
                <p className="text-2xs tabular-nums text-muted-foreground">
                  {formatDate(d.toDate())}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isToday ? <Badge variant="info">{t('calendar.today')}</Badge> : null}
                <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </div>
            </header>

            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                {statusFiltered ? t('calendar.noMatch') : t('calendar.noneToday')}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((a) => {
                  const st = styleFor(a.status);
                  return (
                    <li
                      key={a.id}
                      className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50"
                    >
                      <span
                        className={cn('h-2 w-2 shrink-0 rounded-full', st.dot)}
                        aria-hidden="true"
                      />
                      <span className="w-10 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                        {dayjs(a.startAt).format('HH:mm')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{a.customerName}</span>
                        <span className="block truncate text-2xs text-muted-foreground">
                          {a.serviceName} · {a.staffName}
                        </span>
                      </span>
                      <StatusPill status={a.status} label={t(`status.${a.status}`)} />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/** Sum the on-clock minutes for a set of same-staff appointments. */
function bookedMinutes(items: AppointmentListItem[]): number {
  return items.reduce((sum, a) => sum + dayjs(a.endAt).diff(dayjs(a.startAt), 'minute'), 0);
}

/**
 * Weekly staff roster — a block per weekday, and within each day a detailed row
 * per staff who is on shift: shift window, booked minutes, revenue, deposits,
 * walk-in / off-site counts, per-status tally, and every appointment expanded.
 */
function StaffRoster({
  days,
  staff,
  byStaff,
  matchesFilter,
  statusFiltered,
  anchor,
  onPickWeek,
}: {
  days: ReturnType<typeof dayjs>[];
  staff: StaffProfile[];
  byStaff: Map<string, AppointmentListItem[]>;
  matchesFilter: (a: AppointmentListItem) => boolean;
  statusFiltered: boolean;
  anchor: ReturnType<typeof dayjs>;
  onPickWeek: (weekStart: ReturnType<typeof dayjs>) => void;
}) {
  const { t } = useTranslation();
  const today = dayjs();
  const [q, setQ] = useState('');
  const [dayFilter, setDayFilter] = useState<string>('all');
  const ql = q.trim().toLowerCase();

  // Weeks that overlap the anchored month — for the "Week 1–5" jump menu.
  const monthWeeks = useMemo(() => {
    const monthEnd = anchor.endOf('month');
    const out: { n: number; start: ReturnType<typeof dayjs>; end: ReturnType<typeof dayjs> }[] = [];
    let cur = anchor.startOf('month').startOf('week');
    let n = 1;
    while (cur.isBefore(monthEnd)) {
      out.push({ n, start: cur, end: cur.endOf('week') });
      cur = cur.add(7, 'day');
      n += 1;
    }
    return out;
  }, [anchor]);
  const activeWeekLabel =
    monthWeeks.find((w) => anchor.isSame(w.start, 'week'))?.n ?? 1;

  // Drop a stale day pick when the week changes out from under it.
  const activeDay =
    dayFilter !== 'all' && days.some((d) => d.format('YYYY-MM-DD') === dayFilter)
      ? dayFilter
      : 'all';
  const visibleDays = activeDay === 'all' ? days : days.filter((d) => d.format('YYYY-MM-DD') === activeDay);

  const searchItem = (a: AppointmentListItem) =>
    a.customerName.toLowerCase().includes(ql) || a.serviceName.toLowerCase().includes(ql);

  // Week totals for the header strip — whole week, honours search + status filter.
  let wkStaff = 0;
  let wkAppts = 0;
  let wkRevenue = 0;
  for (const s of staff) {
    const base = (byStaff.get(s.id) ?? []).filter(matchesFilter);
    const nameHit = ql !== '' && s.name.toLowerCase().includes(ql);
    const items = ql === '' || nameHit ? base : base.filter(searchItem);
    if (items.length > 0) {
      wkStaff += 1;
      wkAppts += items.length;
      wkRevenue += items.reduce((sum, a) => sum + a.price, 0);
    }
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border bg-gradient-to-r from-primary/[0.06] to-transparent px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/[0.12] text-primary ring-1 ring-inset ring-primary/20">
            <Users className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-tight">{t('calendar.roster')}</h2>
            <p className="truncate text-2xs text-muted-foreground">{t('calendar.rosterHint')}</p>
          </div>
        </div>

        <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
          <div className="relative min-w-[170px] flex-1 sm:max-w-[240px]">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('calendar.searchRoster')}
              aria-label={t('calendar.searchRoster')}
              className="h-8 pl-8 text-xs"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="h-8 gap-1.5 text-xs">
                {t('calendar.weekN', { n: activeWeekLabel })}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {monthWeeks.map((w) => (
                <DropdownMenuItem
                  key={w.n}
                  onSelect={() => onPickWeek(w.start)}
                  className="gap-2 text-xs"
                >
                  <Check
                    className={cn(
                      'h-4 w-4',
                      anchor.isSame(w.start, 'week') ? 'opacity-100' : 'opacity-0',
                    )}
                    aria-hidden="true"
                  />
                  {t('calendar.weekN', { n: w.n })}
                  <span className="ml-auto pl-3 text-2xs tabular-nums text-muted-foreground">
                    {w.start.format('D')}–{w.end.format('D/M')}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm" className="h-8 gap-1.5 text-xs">
                {activeDay === 'all'
                  ? t('calendar.allWeek')
                  : lao(dayjs(activeDay)).format('ddd D')}
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDayFilter('all')} className="gap-2 text-xs">
                <Check
                  className={cn('h-4 w-4', activeDay === 'all' ? 'opacity-100' : 'opacity-0')}
                  aria-hidden="true"
                />
                {t('calendar.allWeek')}
              </DropdownMenuItem>
              {days.map((d) => {
                const key = d.format('YYYY-MM-DD');
                return (
                  <DropdownMenuItem
                    key={key}
                    onSelect={() => setDayFilter(key)}
                    className="gap-2 text-xs"
                  >
                    <Check
                      className={cn('h-4 w-4', activeDay === key ? 'opacity-100' : 'opacity-0')}
                      aria-hidden="true"
                    />
                    {lao(d).format('dddd')}
                    <span className="ml-auto pl-3 text-2xs tabular-nums text-muted-foreground">
                      {d.format('D/M')}
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-2xs tabular-nums text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Users className="h-3 w-3" aria-hidden="true" />
          {t('calendar.onDuty', { count: wkStaff })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3 w-3" aria-hidden="true" />
          {t('calendar.apptCount', { count: wkAppts })}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Wallet className="h-3 w-3" aria-hidden="true" />
          {formatCurrency(wkRevenue)}
        </span>
      </div>

      <div className="bg-muted/30 p-3 sm:p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleDays.map((d, di) => {
          const isToday = d.isSame(today, 'day');
          const lanes = staff
            .map((s) => {
              const base = (byStaff.get(s.id) ?? [])
                .filter(matchesFilter)
                .filter((a) => dayjs(a.startAt).isSame(d, 'day'))
                .sort((a, b) => a.startAt.localeCompare(b.startAt));
              const nameHit = ql !== '' && s.name.toLowerCase().includes(ql);
              const items = ql === '' || nameHit ? base : base.filter(searchItem);
              return { s, items };
            })
            .filter((l) => l.items.length > 0);

          const dayCount = lanes.reduce((n, l) => n + l.items.length, 0);
          const dayRevenue = lanes.reduce(
            (sum, l) => sum + l.items.reduce((s, a) => s + a.price, 0),
            0,
          );

          return (
            <section
              key={d.toISOString()}
              style={stagger(di)}
              className={cn(
                ENTER,
                'flex flex-col rounded-xl border bg-card shadow-sm',
                'transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                isToday ? 'border-primary/50 ring-1 ring-primary/30' : 'border-border',
              )}
            >
              <header className="border-b border-border px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      'text-sm font-semibold',
                      isToday ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {lao(d).format('dddd')}
                  </span>
                  <span className="text-2xs tabular-nums text-muted-foreground">
                    {formatDate(d.toDate())}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs tabular-nums text-muted-foreground">
                  <span>{t('calendar.onDuty', { count: lanes.length })}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t('calendar.apptCount', { count: dayCount })}</span>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1">
                    <Wallet className="h-3 w-3" aria-hidden="true" />
                    {formatCurrency(dayRevenue)}
                  </span>
                </div>
              </header>

              {lanes.length === 0 ? (
                <p className="px-3 py-4 text-center text-2xs text-muted-foreground">
                  {ql
                    ? t('calendar.noRosterMatch')
                    : statusFiltered
                      ? t('calendar.noMatch')
                      : t('calendar.noOnDuty')}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {lanes.map(({ s, items }) => {
                    // `lanes` is filtered to non-empty `items` above.
                    const first = items[0]!;
                    const start = dayjs(first.startAt);
                    const end = items.reduce(
                      (max, a) => (dayjs(a.endAt).isAfter(max) ? dayjs(a.endAt) : max),
                      dayjs(first.endAt),
                    );
                    const revenue = items.reduce((sum, a) => sum + a.price, 0);
                    const deposits = items.reduce((sum, a) => sum + a.depositPaid, 0);
                    const walkins = items.filter((a) => a.isWalkIn).length;
                    const offsite = items.filter((a) => a.deliveryType === 'HOME_SERVICE').length;
                    const statusSeg = STATUS_ORDER.map((st) => ({
                      st,
                      n: items.filter((a) => a.status === st).length,
                    })).filter((x) => x.n > 0);

                    return (
                      <li key={s.id} className="p-3">
                        <div className="flex items-center gap-2">
                        <PersonAvatar name={s.name} size={28} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold leading-tight">{s.name}</p>
                          <p className="truncate text-2xs text-muted-foreground">
                            {s.jobTitle}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end text-2xs tabular-nums">
                          <span className="font-semibold">
                            {start.format('HH:mm')}–{end.format('HH:mm')}
                          </span>
                          <span className="text-muted-foreground">
                            {t('calendar.apptCount', { count: items.length })}
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs tabular-nums text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {t('calendar.bookedMin', { count: bookedMinutes(items) })}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Wallet className="h-3 w-3" aria-hidden="true" />
                          {formatCurrency(revenue)}
                        </span>
                        {deposits > 0 ? (
                          <span>{t('appointments.deposit')} {formatCurrency(deposits)}</span>
                        ) : null}
                        {walkins > 0 ? (
                          <span>
                            {t('appointments.walkIn')} {walkins}
                          </span>
                        ) : null}
                        {offsite > 0 ? <span>{t('calendar.offsite', { count: offsite })}</span> : null}
                        <span className="inline-flex items-center gap-2">
                          {statusSeg.map(({ st, n }) => (
                            <span key={st} className="inline-flex items-center gap-1">
                              <span
                                className={cn('h-1.5 w-1.5 rounded-full', styleFor(st).dot)}
                                aria-hidden="true"
                              />
                              {n}
                            </span>
                          ))}
                        </span>
                      </div>

                      <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
                        {items.map((a) => {
                          const st = styleFor(a.status);
                          return (
                            <li key={a.id} className="flex items-center gap-2 text-2xs">
                              <span
                                className={cn('h-1.5 w-1.5 shrink-0 rounded-full', st.dot)}
                                aria-hidden="true"
                              />
                              <span className="w-[86px] shrink-0 font-medium tabular-nums">
                                {dayjs(a.startAt).format('HH:mm')}–{dayjs(a.endAt).format('HH:mm')}
                              </span>
                              <span className="min-w-0 flex-1 truncate">
                                {a.customerName}
                                <span className="text-muted-foreground"> · {a.serviceName}</span>
                              </span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {formatCurrency(a.price)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      </div>
    </section>
  );
}
