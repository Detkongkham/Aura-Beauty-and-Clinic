import {
  CalendarClock,
  CalendarDays,
  CalendarOff,
  Clock3,
  Moon,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { useBranches } from '@/features/branches/branches.api';
import { dayjs } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import { useUiStore } from '@/store/ui.store';
import type { StaffProfile, WorkingHour } from '@/types/models';

import { StaffStatCard } from './StaffStatCard';
import { StaffTabs } from './StaffTabs';
import { useStaffList } from './staff.api';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_INDEX = [1, 2, 3, 4, 5, 6, 0];
const WEEKEND = new Set([0, 6]);

function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':');
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

/** Shift length in minutes; tolerates a shift that crosses midnight. */
function shiftMinutes(wh: WorkingHour) {
  const diff = toMinutes(wh.endTime) - toMinutes(wh.startTime);
  return diff < 0 ? diff + 1440 : diff;
}

/** `8.5` — one decimal, trailing `.0` stripped. */
function hoursLabel(minutes: number) {
  return (Math.round((minutes / 60) * 10) / 10).toString();
}

type CellKind = 'working' | 'off' | 'unset';

interface StaffWeek {
  staff: StaffProfile;
  cells: { di: number; kind: CellKind; wh?: WorkingHour; minutes: number }[];
  totalMinutes: number;
  workingDays: number;
}

export function RosterPage() {
  const { t } = useTranslation();
  const activeBranch = useUiStore((s) => s.activeBranchId);
  const setBranch = useUiStore((s) => s.setActiveBranch);
  const { data: branches = [] } = useBranches();

  const [query, setQuery] = useState('');
  const [focusDay, setFocusDay] = useState<number | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useStaffList({
    page: 1,
    pageSize: 100,
    branchId: activeBranch === 'all' ? undefined : activeBranch,
  });

  const todayIdx = dayjs().tz().day();

  const roster = useMemo<StaffWeek[]>(() => {
    const active = (data?.items ?? []).filter((s) => s.isActive);
    return active.map((staff) => {
      const cells = DAY_INDEX.map((di) => {
        const wh = staff.workingHours.find((w) => w.dayOfWeek === di);
        if (!wh) return { di, kind: 'unset' as const, minutes: 0 };
        if (wh.isDayOff) return { di, kind: 'off' as const, wh, minutes: 0 };
        return { di, kind: 'working' as const, wh, minutes: shiftMinutes(wh) };
      });
      const totalMinutes = cells.reduce((n, c) => n + c.minutes, 0);
      const workingDays = cells.filter((c) => c.kind === 'working').length;
      return { staff, cells, totalMinutes, workingDays };
    });
  }, [data?.items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(
      (r) =>
        r.staff.name.toLowerCase().includes(q) ||
        (r.staff.jobTitle ?? '').toLowerCase().includes(q),
    );
  }, [roster, query]);

  const summary = useMemo(() => {
    const n = roster.length;
    const workingToday = roster.filter(
      (r) => r.cells.find((c) => c.di === todayIdx)?.kind === 'working',
    ).length;
    const weekly = roster.map((r) => r.totalMinutes).filter((m) => m > 0);
    const avg = weekly.length
      ? weekly.reduce((a, b) => a + b, 0) / weekly.length
      : 0;
    const dayCounts = DAY_INDEX.map(
      (di) => roster.filter((r) => r.cells.find((c) => c.di === di)?.kind === 'working').length,
    );
    return {
      total: n,
      workingToday,
      offToday: Math.max(n - workingToday, 0),
      pctWorking: n ? Math.round((workingToday / n) * 100) : 0,
      avgHours: hoursLabel(avg),
      minHours: weekly.length ? hoursLabel(Math.min(...weekly)) : '0',
      maxHours: weekly.length ? hoursLabel(Math.max(...weekly)) : '0',
      dayCounts,
      teamMinutes: roster.reduce((n2, r) => n2 + r.totalMinutes, 0),
      maxWeek: Math.max(1, ...roster.map((r) => r.totalMinutes)),
      maxDay: Math.max(1, ...DAY_INDEX.map(
        (di) => roster.filter((r) => r.cells.find((c) => c.di === di)?.kind === 'working').length,
      )),
    };
  }, [roster, todayIdx]);

  const focusLabel =
    focusDay == null ? null : t(`day.${DAY_KEYS[DAY_INDEX.indexOf(focusDay)]}`);

  return (
    <div className="space-y-5">
      <StickyPageHeader>
        <div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
            {t('nav.roster')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('roster.subtitle')}</p>
        </div>
        <StaffTabs active="roster" />
      </StickyPageHeader>

      {/* Overview band */}
      <div className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-4">
        <StaffStatCard
          icon={Users}
          tone="primary"
          label={t('roster.onRoster')}
          value={isLoading ? '–' : summary.total}
          hint={t('roster.onRosterHint')}
          index={0}
        />
        <StaffStatCard
          icon={CalendarClock}
          tone="success"
          label={t('roster.workingToday')}
          value={isLoading ? '–' : summary.workingToday}
          hint={t('roster.ofTotal', { pct: summary.pctWorking })}
          index={1}
          active={focusDay === todayIdx}
          onClick={
            isLoading
              ? undefined
              : () => setFocusDay((d) => (d === todayIdx ? null : todayIdx))
          }
        />
        <StaffStatCard
          icon={CalendarOff}
          tone="neutral"
          label={t('roster.offToday')}
          value={isLoading ? '–' : summary.offToday}
          hint={t('roster.ofTotal', { pct: 100 - summary.pctWorking })}
          index={2}
        />
        <StaffStatCard
          icon={Clock3}
          tone="info"
          label={t('roster.avgWeek')}
          value={isLoading ? '–' : `${summary.avgHours}${t('roster.hUnit')}`}
          hint={t('roster.rangeHrs', { min: summary.minHours, max: summary.maxHours })}
          index={3}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out motion-reduce:animate-none">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-border px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('roster.searchPlaceholder')}
                aria-label={t('roster.searchPlaceholder')}
                className="h-10 w-full rounded-lg border border-input bg-muted/40 pl-10 pr-3 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
            {!isLoading && !isError ? (
              <span className="text-xs text-muted-foreground">
                {t('roster.count', { count: filtered.length })}
              </span>
            ) : null}
            {focusLabel ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary animate-in fade-in slide-in-from-left-1 duration-200 motion-reduce:animate-none">
                {t('roster.focusing', { day: focusLabel })}
                <button
                  type="button"
                  onClick={() => setFocusDay(null)}
                  aria-label={t('roster.clearFocus')}
                  className="-mr-1 rounded-full p-0.5 hover:bg-primary/20"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Select
              className="h-10 w-44 rounded-lg"
              value={activeBranch}
              onChange={(e) => setBranch(e.target.value)}
              aria-label={t('nav.branches')}
              options={[
                { value: 'all', label: t('branch.all') },
                ...branches.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
            <Button
              variant="secondary"
              size="sm"
              className="h-9 gap-2 rounded-lg"
              onClick={() => void refetch()}
              disabled={isFetching}
              title={t('common.reload')}
            >
              <RefreshCw
                className={cn('h-4 w-4 text-primary', isFetching && 'animate-spin')}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">{t('common.reload')}</span>
            </Button>
          </div>
        </div>

        {/* Legend + read-only note */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground sm:px-6">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-primary-subtle ring-1 ring-inset ring-primary/30" aria-hidden="true" />
            {t('roster.legendWorking')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Moon className="h-3 w-3" aria-hidden="true" />
            {t('roster.legendOff')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground" aria-hidden="true">
              {t('roster.today')}
            </span>
            {t('roster.todayHint')}
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" aria-hidden="true" />
            {t('roster.readOnly')}
          </span>
        </div>

        {isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive-soft text-destructive">
              <RefreshCw className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm text-muted-foreground">{t('dashboard.loadError')}</p>
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              {t('common.reload')}
            </Button>
          </div>
        ) : isLoading ? (
          <RosterSkeleton />
        ) : roster.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={t('roster.empty')}
            description={t('roster.emptyHint')}
            className="border-0"
            action={
              <Button asChild variant="secondary" size="sm">
                <Link to={ROUTES.staff}>{t('roster.viewStaff')}</Link>
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">{t('roster.noMatch')}</p>
            <Button variant="secondary" size="sm" onClick={() => setQuery('')}>
              {t('roster.clearFocus')}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[868px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 top-0 z-30 w-[168px] min-w-[168px] border-b border-r border-border bg-muted px-3 py-3 text-left text-[13px] font-semibold text-muted-foreground"
                  >
                    {t('staff.name')}
                  </th>
                  {DAY_INDEX.map((di, i) => {
                    const key = DAY_KEYS[i];
                    const isToday = di === todayIdx;
                    const isFocused = di === focusDay;
                    const count = summary.dayCounts[i] ?? 0;
                    return (
                      <th
                        key={di}
                        scope="col"
                        className={cn(
                          'sticky top-0 z-20 min-w-[84px] border-b border-border p-0 text-center align-middle',
                          isFocused || isToday ? 'bg-primary-subtle' : 'bg-muted',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setFocusDay((d) => (d === di ? null : di))}
                          aria-pressed={isFocused}
                          title={t('roster.focusToggle')}
                          className="flex min-h-[3.5rem] w-full flex-col items-center justify-center gap-1.5 px-2 py-2.5 transition-colors hover:bg-primary/5"
                        >
                          <span
                            className={cn(
                              'text-[13px] font-semibold leading-none',
                              isToday ? 'text-primary' : 'text-foreground',
                            )}
                          >
                            {t(`day.${key}`)}
                          </span>
                          {isToday ? (
                            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                              {t('roster.today')}
                            </span>
                          ) : (
                            <span
                              title={t('roster.legendWorking')}
                              className={cn(
                                'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none tabular-nums',
                                count === 0
                                  ? 'bg-muted-foreground/10 text-muted-foreground/60'
                                  : 'bg-primary/10 text-primary',
                              )}
                            >
                              {count}
                            </span>
                          )}
                        </button>
                      </th>
                    );
                  })}
                  <th
                    scope="col"
                    className="sticky top-0 z-20 w-[116px] min-w-[116px] border-b border-l border-border bg-muted px-3 py-3 text-right text-[13px] font-semibold text-muted-foreground"
                  >
                    {t('roster.weeklyTotal')}
                  </th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((row, ri) => (
                  <tr
                    key={row.staff.id}
                    className="group animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
                    style={{ animationDelay: `${Math.min(ri, 12) * 35}ms` }}
                  >
                    <td className="sticky left-0 z-10 border-b border-r border-border/70 bg-card px-3 py-2 transition-colors group-hover:bg-primary-subtle/30">
                      <div className="flex items-center gap-2.5">
                        <PersonAvatar name={row.staff.name} size={32} />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-foreground">
                            {row.staff.name}
                          </p>
                          {row.staff.jobTitle ? (
                            <p className="truncate text-[11px] text-muted-foreground">
                              {row.staff.jobTitle}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>

                    {row.cells.map((cell) => {
                      const isToday = cell.di === todayIdx;
                      const isFocused = cell.di === focusDay;
                      const dimmed = focusDay != null && !isFocused;
                      return (
                        <td
                          key={cell.di}
                          className={cn(
                            'border-b border-border/60 px-1 py-1.5 text-center align-middle transition-colors group-hover:bg-primary-subtle/20',
                            isFocused
                              ? 'bg-primary-subtle/25'
                              : isToday
                                ? 'bg-primary-subtle/15'
                                : WEEKEND.has(cell.di)
                                  ? 'bg-muted/25'
                                  : undefined,
                            dimmed && 'opacity-40',
                          )}
                        >
                          <DayCell cell={cell} emphasize={isToday || isFocused} />
                        </td>
                      );
                    })}

                    <td className="border-b border-l border-border/70 bg-card px-3 py-2 transition-colors group-hover:bg-primary-subtle/20">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[13px] font-semibold tabular-nums text-foreground">
                          {hoursLabel(row.totalMinutes)}
                          <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">
                            {t('roster.hUnit')}
                          </span>
                        </span>
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {t('roster.days', { count: row.workingDays })}
                        </span>
                        <span className="mt-0.5 h-1 w-16 overflow-hidden rounded-full bg-muted">
                          <span
                            className="block h-full rounded-full bg-primary/70"
                            style={{
                              width: `${Math.round((row.totalMinutes / summary.maxWeek) * 100)}%`,
                            }}
                          />
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr>
                  <td className="sticky left-0 z-10 border-r border-border bg-muted px-3 py-2 text-[13px] font-semibold text-muted-foreground">
                    {t('roster.teamTotal')}
                  </td>
                  {DAY_INDEX.map((di, i) => {
                    const isToday = di === todayIdx;
                    const isFocused = di === focusDay;
                    const dimmed = focusDay != null && !isFocused;
                    const count = summary.dayCounts[i] ?? 0;
                    return (
                      <td
                        key={di}
                        className={cn(
                          'bg-muted/40 px-1 py-1.5 text-center align-middle',
                          isFocused && 'bg-primary-subtle/30',
                          isToday && !isFocused && 'bg-primary-subtle/20',
                          dimmed && 'opacity-40',
                        )}
                      >
                        <span
                          className={cn(
                            'text-[13px] font-semibold tabular-nums',
                            count === 0
                              ? 'text-muted-foreground/50'
                              : isToday
                                ? 'text-primary'
                                : 'text-foreground',
                          )}
                        >
                          {count}
                        </span>
                        <span className="mx-auto mt-1 block h-1 w-8 overflow-hidden rounded-full bg-muted-foreground/15">
                          <span
                            className="block h-full rounded-full bg-primary/60"
                            style={{
                              width: `${Math.round((count / summary.maxDay) * 100)}%`,
                            }}
                          />
                        </span>
                      </td>
                    );
                  })}
                  <td className="border-l border-border bg-muted/40 px-3 py-2 text-right">
                    <span className="text-[13px] font-semibold tabular-nums text-foreground">
                      {hoursLabel(summary.teamMinutes)}
                      <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">
                        {t('roster.hUnit')}
                      </span>
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

interface DayCellProps {
  cell: StaffWeek['cells'][number];
  emphasize: boolean;
}

function DayCell({ cell, emphasize }: DayCellProps) {
  const { t } = useTranslation();

  if (cell.kind === 'unset') {
    return (
      <span className="text-muted-foreground/40" title={t('roster.notSet')} aria-hidden="true">
        ·
      </span>
    );
  }

  if (cell.kind === 'off') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted/70 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
        <Moon className="h-3 w-3" aria-hidden="true" />
        {t('staff.dayOff')}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex flex-col items-center gap-0 rounded-md px-1.5 py-0.5',
        emphasize
          ? 'bg-primary/10 ring-1 ring-inset ring-primary/25'
          : 'bg-primary-subtle ring-1 ring-inset ring-primary/15',
      )}
    >
      <span className="text-[11px] font-semibold tabular-nums text-primary-strong">
        {cell.wh!.startTime}–{cell.wh!.endTime}
      </span>
      <span className="text-[10px] tabular-nums text-primary/70">
        {hoursLabel(cell.minutes)}
        {t('roster.hUnit')}
      </span>
    </span>
  );
}

function RosterSkeleton() {
  return (
    <div className="space-y-2 p-4 sm:p-6">
      <div className="flex gap-2">
        <div className="h-8 w-[168px] shrink-0 animate-pulse rounded bg-muted" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-8 flex-1 animate-pulse rounded bg-muted" />
        ))}
        <div className="h-8 w-[88px] shrink-0 animate-pulse rounded bg-muted" />
      </div>
      {Array.from({ length: 6 }).map((_, r) => (
        <div key={r} className="flex gap-2">
          <div className="flex w-[168px] shrink-0 items-center gap-2.5">
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
            <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
          </div>
          {Array.from({ length: 7 }).map((_, c) => (
            <div key={c} className="h-10 flex-1 animate-pulse rounded bg-muted" />
          ))}
          <div className="h-10 w-[88px] shrink-0 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
