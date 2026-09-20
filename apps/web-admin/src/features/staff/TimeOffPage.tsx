import {
  CalendarClock,
  CalendarOff,
  Check,
  CheckCircle2,
  Clock,
  Hourglass,
  RefreshCw,
  Search,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { EmptyState } from '@/components/shared/EmptyState';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/features/auth/useAuth';
import { dayjs, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { StaffStatCard } from './StaffStatCard';
import { StaffTabs } from './StaffTabs';
import { useReviewTimeOff, useStaffList, useTimeOff } from './staff.api';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED';
type FilterKey = 'ALL' | Status;

const FILTERS: FilterKey[] = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'];

const STATUS_META: Record<
  Status,
  { variant: 'warning' | 'success' | 'danger'; icon: LucideIcon; dot: string }
> = {
  PENDING: { variant: 'warning', icon: Hourglass, dot: 'bg-warning' },
  APPROVED: { variant: 'success', icon: CheckCircle2, dot: 'bg-success' },
  REJECTED: { variant: 'danger', icon: XCircle, dot: 'bg-destructive' },
};

export function TimeOffPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('staff:manage');

  const { data = [], isLoading, isError, refetch, isFetching } = useTimeOff();
  const { data: staffList } = useStaffList({ page: 1, pageSize: 100 });
  const review = useReviewTimeOff();
  const busyId = review.isPending ? review.variables?.id : undefined;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('ALL');

  const staffMeta = useMemo(() => {
    const m = new Map<string, { avatarUrl: string | null; jobTitle: string }>();
    for (const s of staffList?.items ?? []) {
      m.set(s.id, { avatarUrl: s.avatarUrl, jobTitle: s.jobTitle });
    }
    return m;
  }, [staffList?.items]);

  const todayStart = dayjs().tz().startOf('day');

  const rows = useMemo(() => {
    return data
      .map((r) => ({
        ...r,
        days: Math.max(1, dayjs(r.endDate).diff(dayjs(r.startDate), 'day') + 1),
        upcoming: dayjs(r.endDate).endOf('day').isAfter(todayStart),
      }))
      .sort((a, b) => {
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
        if (b.status === 'PENDING' && a.status !== 'PENDING') return 1;
        return a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0;
      });
  }, [data, todayStart]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { ALL: rows.length, PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const r of rows) c[r.status] += 1;
    return c;
  }, [rows]);

  const stats = useMemo(() => {
    const approvedUpcoming = rows.filter((r) => r.status === 'APPROVED' && r.upcoming);
    return {
      upcomingCount: approvedUpcoming.length,
      upcomingDays: approvedUpcoming.reduce((n, r) => n + r.days, 0),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'ALL' && r.status !== filter) return false;
      if (!q) return true;
      return r.staffName.toLowerCase().includes(q) || (r.reason ?? '').toLowerCase().includes(q);
    });
  }, [rows, query, filter]);

  const act = (id: string, status: 'APPROVED' | 'REJECTED') =>
    review.mutate(
      { id, status },
      {
        onSuccess: () => toast.success(t('timeOff.reviewed')),
        onError: () => toast.error(t('services.saveError')),
      },
    );

  const resetFilters = () => {
    setQuery('');
    setFilter('ALL');
  };

  return (
    <div className="space-y-5">
      <StickyPageHeader>
        <div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
            {t('nav.timeOff')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('timeOff.subtitle')}</p>
        </div>
        <StaffTabs active="timeOff" />
      </StickyPageHeader>

      {/* Overview band */}
      <div className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-4">
        <StaffStatCard
          icon={Hourglass}
          tone="primary"
          label={t('timeOff.PENDING')}
          value={isLoading ? '–' : counts.PENDING}
          hint={t('timeOff.pendingHint')}
          index={0}
          active={filter === 'PENDING'}
          onClick={
            isLoading ? undefined : () => setFilter((f) => (f === 'PENDING' ? 'ALL' : 'PENDING'))
          }
        />
        <StaffStatCard
          icon={CheckCircle2}
          tone="success"
          label={t('timeOff.APPROVED')}
          value={isLoading ? '–' : counts.APPROVED}
          hint={t('timeOff.approvedHint', { count: stats.upcomingCount })}
          index={1}
          active={filter === 'APPROVED'}
          onClick={
            isLoading ? undefined : () => setFilter((f) => (f === 'APPROVED' ? 'ALL' : 'APPROVED'))
          }
        />
        <StaffStatCard
          icon={XCircle}
          tone="neutral"
          label={t('timeOff.REJECTED')}
          value={isLoading ? '–' : counts.REJECTED}
          hint={t('timeOff.rejectedHint')}
          index={2}
          active={filter === 'REJECTED'}
          onClick={
            isLoading ? undefined : () => setFilter((f) => (f === 'REJECTED' ? 'ALL' : 'REJECTED'))
          }
        />
        <StaffStatCard
          icon={CalendarClock}
          tone="info"
          label={t('timeOff.upcomingLeave')}
          value={isLoading ? '–' : stats.upcomingCount}
          hint={t('timeOff.upcomingHint', { count: stats.upcomingDays })}
          index={3}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out motion-reduce:animate-none">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-border px-3 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('timeOff.searchPlaceholder')}
                aria-label={t('timeOff.searchPlaceholder')}
                className="h-10 w-full rounded-lg border border-input bg-muted/40 pl-10 pr-3 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="h-9 shrink-0 gap-2 self-start rounded-lg sm:self-auto"
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

          {/* Status segmented filter */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
              {FILTERS.map((key) => {
                const isActive = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    aria-pressed={isActive}
                    className={cn(
                      'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {key === 'ALL' ? t('timeOff.all') : t(`timeOff.${key}`)}
                    <span
                      className={cn(
                        'rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                        isActive ? 'bg-primary-foreground/20' : 'bg-muted-foreground/10',
                      )}
                    >
                      {counts[key]}
                    </span>
                  </button>
                );
              })}
            </div>
            {!isLoading && !isError ? (
              <span className="text-xs text-muted-foreground">
                {t('timeOff.count', { count: filtered.length })}
              </span>
            ) : null}
          </div>
        </div>

        {/* Legend + permission note */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground sm:px-6">
          {(['PENDING', 'APPROVED', 'REJECTED'] as Status[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span
                className={cn('h-2.5 w-2.5 rounded-full', STATUS_META[s].dot)}
                aria-hidden="true"
              />
              {t(`timeOff.${s}`)}
            </span>
          ))}
          <span className="ml-auto inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" aria-hidden="true" />
            {canManage ? t('timeOff.manageNote') : t('timeOff.readOnly')}
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
          <TimeOffSkeleton canManage={canManage} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={CalendarOff}
            title={t('timeOff.empty')}
            description={t('timeOff.emptyHint')}
            className="border-0"
          />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">{t('timeOff.noMatch')}</p>
            <Button variant="secondary" size="sm" onClick={resetFilters}>
              {t('timeOff.clearFilters')}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <Th className="text-left">{t('staff.name')}</Th>
                  <Th className="text-left">{t('timeOff.dates')}</Th>
                  <Th className="text-left">{t('timeOff.reason')}</Th>
                  <Th className="text-left">{t('timeOff.requested')}</Th>
                  <Th className="text-center">{t('services.status')}</Th>
                  {canManage ? (
                    <Th className="w-[132px] text-center">{t('timeOff.action')}</Th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const meta = staffMeta.get(r.staffId);
                  const sm = STATUS_META[r.status];
                  const StatusIcon = sm.icon;
                  const isPendingRow = r.status === 'PENDING';
                  const rowBusy = busyId === r.id;
                  const cellTint = cn(
                    'border-b border-border/60 px-3 py-3 align-middle transition-colors group-hover:bg-primary-subtle/15',
                    isPendingRow && 'bg-warning-soft/25',
                  );
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        'group animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
                        rowBusy && 'opacity-60',
                      )}
                      style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                    >
                      <td className={cn(cellTint, 'relative')}>
                        {isPendingRow ? (
                          <span
                            className="absolute inset-y-0 left-0 w-0.5 bg-warning"
                            aria-hidden="true"
                          />
                        ) : null}
                        <div className="flex items-center gap-2.5">
                          <PersonAvatar name={r.staffName} size={32} />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-foreground">
                              {r.staffName}
                            </p>
                            {meta?.jobTitle ? (
                              <p className="truncate text-[11px] text-muted-foreground">
                                {meta.jobTitle}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      <td className={cellTint}>
                        <div className="flex flex-col gap-1">
                          <span className="text-[13px] font-medium text-foreground">
                            {r.startDate === r.endDate
                              ? formatDate(r.startDate)
                              : `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`}
                          </span>
                          <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-px font-medium tabular-nums text-foreground/70">
                              <Clock className="h-3 w-3" aria-hidden="true" />
                              {t('timeOff.days', { count: r.days })}
                            </span>
                            <DateTimeText value={r.startDate} mode="relative" />
                          </span>
                        </div>
                      </td>

                      <td className={cn(cellTint, 'max-w-[260px]')}>
                        {r.reason ? (
                          <span className="line-clamp-2 text-sm text-muted-foreground" title={r.reason}>
                            {r.reason}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground/40">—</span>
                        )}
                      </td>

                      <td className={cn(cellTint, 'text-[13px] text-muted-foreground')}>
                        <DateTimeText value={r.requestedAt} mode="relative" />
                      </td>

                      <td className={cn(cellTint, 'text-center')}>
                        <Badge variant={sm.variant} className="whitespace-nowrap">
                          <StatusIcon className="h-3 w-3" aria-hidden="true" />
                          {t(`timeOff.${r.status}`)}
                        </Badge>
                      </td>

                      {canManage ? (
                        <td className={cellTint}>
                          {isPendingRow ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => act(r.id, 'APPROVED')}
                                disabled={rowBusy}
                                aria-label={t('timeOff.approve')}
                                title={t('timeOff.approve')}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-[color,background-color,border-color,transform] duration-150 hover:border-success/30 hover:bg-success-soft hover:text-success active:scale-90 disabled:pointer-events-none disabled:opacity-40 motion-reduce:active:scale-100"
                              >
                                <Check className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => act(r.id, 'REJECTED')}
                                disabled={rowBusy}
                                aria-label={t('timeOff.reject')}
                                title={t('timeOff.reject')}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-[color,background-color,border-color,transform] duration-150 hover:border-destructive/30 hover:bg-destructive-soft hover:text-destructive active:scale-90 disabled:pointer-events-none disabled:opacity-40 motion-reduce:active:scale-100"
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          ) : (
                            <p className="text-center text-xs text-muted-foreground/60">
                              {t('timeOff.reviewedMark')}
                            </p>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <th
      scope="col"
      className={cn(
        'sticky top-0 z-10 border-b border-border bg-muted px-3 py-3 text-[13px] font-semibold text-muted-foreground',
        className,
      )}
    >
      {children}
    </th>
  );
}

function TimeOffSkeleton({ canManage }: { canManage: boolean }) {
  const chips = canManage ? 4 : 3;
  return (
    <div className="divide-y divide-border/60">
      {Array.from({ length: 5 }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 px-3 py-3.5 sm:px-6">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-28 animate-pulse rounded bg-muted" />
          <div className="ml-auto flex items-center gap-3">
            {Array.from({ length: chips }).map((_, c) => (
              <div key={c} className="h-4 w-20 animate-pulse rounded bg-muted" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
