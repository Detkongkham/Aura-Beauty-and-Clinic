import {
  Activity,
  BarChart3,
  BellRing,
  Boxes,
  Building2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Circle,
  CircleCheck,
  CircleCheckBig,
  CircleSlash,
  CircleX,
  Clock,
  FileCheck2,
  HeartHandshake,
  Loader,
  PieChart,
  ReceiptText,
  RefreshCw,
  Scissors,
  Search,
  Star,
  TrendingUp,
  Trophy,
  UserPlus,
  Users,
  Wallet,
  CalendarRange,
  UserCheck,
  CircleDollarSign,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { CardCount } from '@/components/shared/CardCount';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageNav } from '@/components/shared/PageNav';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import {
  dayjs,
  formatCompactNumber,
  formatCurrency,
  formatDate,
  formatRelative,
  formatTime,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import { useUiStore } from '@/store/ui.store';
import type { AppointmentListItem, DashboardPeriod } from '@/types/models';

import { useDashboardStats } from './dashboard.api';
import { AttentionStrip } from './components/AttentionStrip';
import { BranchPerformance } from './components/BranchPerformance';
import { CashflowCard } from './components/CashflowCard';
import { CustomerHealthCard } from './components/CustomerHealthCard';
import { DashboardPanel as Panel } from './components/DashboardPanel';
import { KpiCard } from './components/KpiCard';
import { PeakHours } from './components/PeakHours';
import { ProvinceMapCard } from './components/ProvinceMapCard';
import { RevenueChart } from './components/RevenueChart';
import { RevenueHeroCard } from './components/RevenueHeroCard';
import { ServiceMixChart } from './components/ServiceMixChart';
import { ServiceRankList } from './components/ServiceRankList';
import { StaffLeaderboard } from './components/StaffLeaderboard';
import { StatusBreakdown } from './components/StatusBreakdown';
import { StockWatchCard } from './components/StockWatchCard';
import { TodayTimeline } from './components/TodayTimeline';

/** Signed % change as a KPI delta. `lowerIsBetter` flips the colour, not the arrow. */
function change(
  curr: number,
  prev: number,
  lowerIsBetter = false,
): { value: string; direction: 'up' | 'down' | 'flat'; good?: boolean } {
  const ratio = prev === 0 ? (curr === 0 ? 0 : 1) : (curr - prev) / prev;
  if (Math.abs(ratio) < 0.005) return { value: '0%', direction: 'flat' };
  const direction = ratio > 0 ? 'up' : 'down';
  return {
    value: `${ratio > 0 ? '+' : ''}${Math.round(ratio * 100)}%`,
    direction,
    good: lowerIsBetter ? direction === 'down' : direction === 'up',
  };
}

/** Delta from a precomputed ratio (e.g. `bookingsTodayDelta`, vs yesterday). */
function ratioDelta(ratio: number): { value: string; direction: 'up' | 'down' | 'flat' } {
  if (Math.abs(ratio) < 0.005) return { value: '0%', direction: 'flat' };
  return {
    value: `${ratio > 0 ? '+' : ''}${Math.round(ratio * 100)}%`,
    direction: ratio > 0 ? 'up' : 'down',
  };
}

const PERIODS: DashboardPeriod[] = [7, 14, 30];
const PERIOD_STORAGE_KEY = 'aura.dashboard.days';
const AUTO_REFRESH_MS = 60_000;
const UPCOMING_PAGE_SIZE = 10;

function readStoredPeriod(): DashboardPeriod {
  try {
    const v = Number(window.localStorage.getItem(PERIOD_STORAGE_KEY));
    return v === 7 || v === 30 ? v : 14;
  } catch {
    return 14;
  }
}

/** Re-renders every `intervalMs` — drives the clock, "updated x ago" and the Now marker. */
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

const STATUS_ORDER = ['CONFIRMED', 'PENDING', 'IN_PROGRESS'];
const STATUS_ICON: Record<string, LucideIcon> = {
  CONFIRMED: CircleCheck,
  PENDING: Clock,
  IN_PROGRESS: Loader,
  COMPLETED: CircleCheckBig,
  CANCELLED: CircleSlash,
  NO_SHOW: CircleX,
  WAITING: Clock,
  CALLED: BellRing,
  IN_SERVICE: Scissors,
};
const STATUS_TEXT: Record<string, string> = {
  CONFIRMED: 'text-info',
  PENDING: 'text-warning',
  IN_PROGRESS: 'text-primary',
};

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en' : 'lo';
  const { user } = useAuth();
  const branchId = useUiStore((s) => s.activeBranchId);
  const [days, setDays] = useState<DashboardPeriod>(readStoredPeriod);
  const { data, isError, refetch, isFetching, isPlaceholderData, dataUpdatedAt } =
    useDashboardStats(branchId, days, { refetchIntervalMs: AUTO_REFRESH_MS });
  const now = useNow(30_000);

  const choosePeriod = (d: DashboardPeriod) => {
    setDays(d);
    try {
      window.localStorage.setItem(PERIOD_STORAGE_KEY, String(d));
    } catch {
      /* storage unavailable — period just won't be remembered */
    }
  };

  const [upcomingPage, setUpcomingPage] = useState(1);
  const [upcomingQuery, setUpcomingQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const q = useDebounce(upcomingQuery.trim().toLowerCase(), 200);
  const matches = (a: AppointmentListItem, term: string) =>
    [a.customerName, a.serviceName, a.staffName].some((v) => v?.toLowerCase().includes(term));
  const filteredUpcoming = (data?.upcoming ?? []).filter(
    (a) => (!statusFilter || a.status === statusFilter) && (!q || matches(a, q)),
  );
  const upcomingPageCount = Math.max(1, Math.ceil(filteredUpcoming.length / UPCOMING_PAGE_SIZE));
  useEffect(() => {
    setUpcomingPage(1);
  }, [branchId, q, statusFilter]);
  useEffect(() => {
    setUpcomingPage((p) => Math.min(p, upcomingPageCount));
  }, [upcomingPageCount]);
  const pagedUpcoming = filteredUpcoming.slice(
    (upcomingPage - 1) * UPCOMING_PAGE_SIZE,
    upcomingPage * UPCOMING_PAGE_SIZE,
  );
  const upcomingStatusCounts = (() => {
    const m = new Map<string, number>();
    for (const a of data?.upcoming ?? []) m.set(a.status, (m.get(a.status) ?? 0) + 1);
    return STATUS_ORDER.filter((s) => m.has(s)).map((status) => ({
      status,
      count: m.get(status)!,
    }));
  })();

  const hour = Number(dayjs(now).tz().format('H'));
  const greetingKey =
    hour < 12
      ? 'dashboard.greetingMorning'
      : hour < 17
        ? 'dashboard.greetingAfternoon'
        : 'dashboard.greetingEvening';
  // Full name — Lao names carry a title + given name + surname, so no "first name" split.
  const firstName = user?.name?.trim() ?? '';

  const bookedToday = data ? Math.max(data.bookingsToday, 1) : 1;
  const queuePct = data ? Math.round((data.queueWaiting / bookedToday) * 100) : 0;
  const cancelledToday = data ? data.cancelledToday + data.noShowToday : 0;
  const completionRate =
    data && data.completedToday + cancelledToday > 0
      ? Math.round((data.completedToday / (data.completedToday + cancelledToday)) * 100)
      : 0;

  const p = data?.period;
  const net = p ? p.revenue - p.expenses : 0;
  const lossRate = p && p.bookings ? (p.cancelled + p.noShow) / p.bookings : 0;
  const returningRate = p && p.activeCustomers ? p.returningCustomers / p.activeCustomers : 0;
  const revenueSpark = data?.revenueSeries.map((d) => d.revenue);
  const bookingSpark = data?.revenueSeries.map((d) => d.bookings);
  const vsPrev = t('dashboard.vsPrevPeriod', { days });

  if (isError && !data) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold">{t('nav.dashboard')}</h1>
        <EmptyState
          title={t('dashboard.loadError')}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('dashboard.refresh')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 font-sans [&_h1]:font-sans [&_h2]:font-sans [&_h3]:font-sans">
      {/* ── Header: greeting, live date, period switch, refresh ─────────────── */}
      <header className="relative overflow-hidden rounded-2xl border border-border bg-card px-4 py-4 shadow-sm animate-in fade-in slide-in-from-top-2 fill-mode-both duration-300 motion-reduce:animate-none sm:px-6 sm:py-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 right-40 h-40 w-40 rounded-full bg-accent/10 blur-3xl"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-primary">
              {firstName ? t(greetingKey, { name: firstName }) : t('dashboard.subtitle')}
            </p>
            <h1 className="text-2xl font-semibold leading-tight">{t('nav.dashboard')}</h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                <span className="tabular-nums">
                  {formatDate(now)} · {formatTime(now)}
                </span>
              </span>
              <span aria-hidden="true">·</span>
              <span>{t('dashboard.subtitle')}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="radiogroup"
              aria-label={t('dashboard.periodAria')}
              className="inline-flex items-center rounded-xl border border-border bg-muted/50 p-1"
            >
              {PERIODS.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={days === d}
                  onClick={() => choosePeriod(d)}
                  className={cn(
                    'h-8 rounded-lg px-3 text-xs font-semibold tabular-nums transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    days === d
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t('dashboard.periodOption', { days: d })}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="h-10 gap-2 rounded-xl"
              onClick={() => void refetch()}
              disabled={isFetching}
              title={t('dashboard.autoRefresh')}
            >
              <RefreshCw
                className={cn('h-4 w-4', isFetching && 'animate-spin motion-reduce:animate-none')}
                aria-hidden="true"
              />
              <span className="hidden text-xs sm:inline">
                {dataUpdatedAt
                  ? t('dashboard.updatedAgo', {
                      time: formatRelative(Math.min(dataUpdatedAt, now), locale),
                    })
                  : t('dashboard.refresh')}
              </span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Needs attention ─────────────────────────────────────────────────── */}
      <section aria-labelledby="dash-attention" className="space-y-2">
        <h2 id="dash-attention" className="flex items-center gap-2 text-sm font-semibold">
          <BellRing className="h-4 w-4 text-warning" aria-hidden="true" />
          {t('dashboard.attention.title')}
        </h2>
        <AttentionStrip data={data} />
      </section>

      <div
        className={cn(
          'space-y-5 transition-opacity duration-200',
          isPlaceholderData && 'pointer-events-none opacity-60',
        )}
        aria-busy={isPlaceholderData || undefined}
      >
        {/* ── Today: hero revenue + live operations ─────────────────────────── */}
        <div className="grid gap-3 lg:grid-cols-3">
          <RevenueHeroCard
            revenue={data?.revenueToday}
            delta={data?.revenueTodayDelta}
            mix={data?.serviceMix.map((d) => ({ name: d.name, value: d.revenue }))}
            mixLabel={`${t('dashboard.revenueShare')} · ${t('dashboard.periodLabel', { days })}`}
            to={ROUTES.finance}
            loading={!data}
            index={0}
          />
          <div className="grid gap-3 sm:auto-rows-fr sm:grid-cols-3 lg:col-span-2">
            <KpiCard
              label={t('dashboard.bookingsToday')}
              value={!data ? '—' : data.bookingsToday}
              delta={
                data
                  ? { ...ratioDelta(data.bookingsTodayDelta), caption: t('dashboard.vsYesterday') }
                  : undefined
              }
              icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
              tone="primary"
              rows={
                data
                  ? [
                      { label: t('status.CONFIRMED'), value: data.confirmedToday },
                      { label: t('status.PENDING'), value: data.pendingToday },
                      { label: t('dashboard.walkin'), value: data.walkinsToday },
                      { label: t('dashboard.homeServiceToday'), value: data.homeServiceToday },
                    ]
                  : undefined
              }
              to={ROUTES.calendar}
              loading={!data}
              index={1}
            />
            <KpiCard
              label={t('dashboard.queueWaiting')}
              value={!data ? '—' : data.queueWaiting}
              icon={<Users className="h-4 w-4" aria-hidden="true" />}
              tone={
                data && data.queueLongestWaitMin >= 20 && data.queueWaiting > 0
                  ? 'destructive'
                  : 'info'
              }
              rows={
                data
                  ? [
                      { label: t('status.IN_SERVICE'), value: data.queueInService },
                      { label: t('status.CALLED'), value: data.queueCalled },
                      {
                        label: t('dashboard.longestWait'),
                        value: t('dashboard.minShort', { n: data.queueLongestWaitMin }),
                      },
                    ]
                  : undefined
              }
              progress={!data ? undefined : { value: data.queueWaiting, max: bookedToday }}
              hint={t('dashboard.ofBookingsToday', { pct: queuePct })}
              to={ROUTES.queue}
              loading={!data}
              index={2}
            />
            <KpiCard
              label={t('dashboard.completedToday')}
              value={!data ? '—' : data.completedToday}
              icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              tone="success"
              rows={
                data
                  ? [
                      { label: t('status.CANCELLED'), value: data.cancelledToday },
                      { label: t('status.NO_SHOW'), value: data.noShowToday },
                      {
                        label: t('dashboard.depositsToday'),
                        value: formatCompactNumber(data.depositsToday),
                      },
                    ]
                  : undefined
              }
              progress={!data ? undefined : { value: data.completedToday, max: bookedToday }}
              hint={t('dashboard.completionRate', { pct: completionRate })}
              to={ROUTES.appointments}
              loading={!data}
              index={3}
            />
          </div>
        </div>

        {/* ── Period performance vs previous period ─────────────────────────── */}
        <section aria-labelledby="dash-period" className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="dash-period" className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
              {t('dashboard.kpi.sectionTitle')} · {t('dashboard.periodLabel', { days })}
            </h2>
            <p className="text-xs text-muted-foreground">{vsPrev}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={t('dashboard.kpi.revenue')}
              value={!p ? '—' : formatCurrency(p.revenue)}
              delta={p ? change(p.revenue, p.prevRevenue) : undefined}
              icon={<CircleDollarSign className="h-4 w-4" aria-hidden="true" />}
              tone="primary"
              spark={revenueSpark}
              hint={p ? t('dashboard.kpi.completedHint', { count: p.completed }) : undefined}
              to={ROUTES.finance}
              loading={!data}
              index={0}
            />
            <KpiCard
              label={t('dashboard.kpi.bookings')}
              value={!p ? '—' : p.bookings.toLocaleString()}
              delta={p ? change(p.bookings, p.prevBookings) : undefined}
              icon={<CalendarRange className="h-4 w-4" aria-hidden="true" />}
              tone="info"
              spark={bookingSpark}
              hint={data ? t('dashboard.upcomingNext7', { count: data.upcoming7d }) : undefined}
              to={ROUTES.appointments}
              loading={!data}
              index={1}
            />
            <KpiCard
              label={t('dashboard.kpi.avgTicket')}
              value={!p ? '—' : formatCurrency(p.avgTicket)}
              delta={p ? change(p.avgTicket, p.prevAvgTicket) : undefined}
              icon={<ReceiptText className="h-4 w-4" aria-hidden="true" />}
              tone="primary"
              hint={
                p
                  ? t('dashboard.kpi.prevHint', { value: formatCurrency(p.prevAvgTicket) })
                  : undefined
              }
              to={ROUTES.reports}
              loading={!data}
              index={2}
            />
            <KpiCard
              label={t('dashboard.kpi.net')}
              value={!p ? '—' : formatCurrency(net)}
              icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
              tone={net < 0 ? 'destructive' : 'success'}
              rows={
                p
                  ? [
                      {
                        label: t('dashboard.cash.expenses'),
                        value: formatCompactNumber(p.expenses),
                      },
                      {
                        label: t('dashboard.cash.marginLabel'),
                        value: `${p.revenue > 0 ? Math.round((net / p.revenue) * 100) : 0}%`,
                      },
                    ]
                  : undefined
              }
              to={ROUTES.finance}
              loading={!data}
              index={3}
            />
            <KpiCard
              label={t('dashboard.kpi.newCustomers')}
              value={!p ? '—' : p.newCustomers}
              delta={p ? change(p.newCustomers, p.prevNewCustomers) : undefined}
              icon={<UserPlus className="h-4 w-4" aria-hidden="true" />}
              tone="info"
              hint={
                p ? t('dashboard.kpi.newCustomersHint', { count: p.prevNewCustomers }) : undefined
              }
              to={ROUTES.customers}
              loading={!data}
              index={4}
            />
            <KpiCard
              label={t('dashboard.kpi.returning')}
              value={!p ? '—' : `${Math.round(returningRate * 100)}%`}
              icon={<UserCheck className="h-4 w-4" aria-hidden="true" />}
              tone="primary"
              progress={
                p ? { value: p.returningCustomers, max: Math.max(p.activeCustomers, 1) } : undefined
              }
              hint={
                p
                  ? t('dashboard.kpi.returningHint', {
                      returning: p.returningCustomers,
                      active: p.activeCustomers,
                    })
                  : undefined
              }
              to={ROUTES.customers}
              loading={!data}
              index={5}
            />
            <KpiCard
              label={t('dashboard.kpi.rating')}
              value={!data ? '—' : data.rating.count ? `${data.rating.avg.toFixed(1)} ★` : '—'}
              icon={<Star className="h-4 w-4" aria-hidden="true" />}
              tone={data && data.rating.count && data.rating.avg < 4 ? 'destructive' : 'success'}
              progress={
                data && data.rating.count
                  ? { value: Math.round(data.rating.avg * 10) / 10, max: 5 }
                  : undefined
              }
              hint={
                data
                  ? data.rating.count
                    ? t('dashboard.kpi.ratingHint', { count: data.rating.count })
                    : t('dashboard.kpi.noRating')
                  : undefined
              }
              loading={!data}
              index={6}
            />
            <KpiCard
              label={t('dashboard.kpi.lossRate')}
              value={!p ? '—' : `${Math.round(lossRate * 100)}%`}
              icon={<CircleSlash className="h-4 w-4" aria-hidden="true" />}
              tone={lossRate >= 0.15 ? 'destructive' : 'info'}
              progress={
                p ? { value: p.cancelled + p.noShow, max: Math.max(p.bookings, 1) } : undefined
              }
              hint={
                p
                  ? t('dashboard.kpi.lossHint', { cancelled: p.cancelled, noShow: p.noShow })
                  : undefined
              }
              to={ROUTES.appointments}
              loading={!data}
              index={7}
            />
          </div>
        </section>

        {/* ── Trend + today's schedule ──────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel
            title={t('dashboard.revenueTrendN', { days })}
            subtitle={
              data ? `${formatDate(data.range.from)} – ${formatDate(data.range.to)}` : undefined
            }
            icon={<TrendingUp aria-hidden="true" />}
            className="lg:col-span-2"
          >
            {!data ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <RevenueChart data={data.revenueSeries} prev={data.prevSeries} days={days} />
            )}
          </Panel>
          <Panel
            title={t('dashboard.timeline.title')}
            subtitle={
              data ? t('dashboard.bookingsCount', { count: data.bookingsToday }) : undefined
            }
            icon={<CalendarClock aria-hidden="true" />}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to={ROUTES.calendar}>{t('nav.calendar')}</Link>
              </Button>
            }
            index={1}
          >
            {!data ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <TodayTimeline items={data.todayAgenda} total={data.bookingsToday} now={now} />
            )}
          </Panel>
        </div>

        {/* ── Business health: money · customers · stock ────────────────────── */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Panel
            title={t('dashboard.cash.title')}
            subtitle={t('dashboard.periodLabel', { days })}
            icon={<Wallet aria-hidden="true" />}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to={ROUTES.finance}>{t('dashboard.cash.open')}</Link>
              </Button>
            }
          >
            {!data ? <Skeleton className="h-72 w-full" /> : <CashflowCard data={data} />}
          </Panel>
          <Panel
            title={t('dashboard.customers.title')}
            subtitle={t('dashboard.periodLabel', { days })}
            icon={<HeartHandshake aria-hidden="true" />}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to={ROUTES.customers}>{t('dashboard.customers.open')}</Link>
              </Button>
            }
            index={1}
          >
            {!data ? <Skeleton className="h-72 w-full" /> : <CustomerHealthCard data={data} />}
          </Panel>
          <Panel
            title={t('dashboard.stock.title')}
            subtitle={
              data
                ? t('dashboard.attention.lowStock', { count: data.attention.lowStock })
                : undefined
            }
            icon={<Boxes aria-hidden="true" />}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to={ROUTES.inventory}>{t('dashboard.stock.open')}</Link>
              </Button>
            }
            className="md:col-span-2 xl:col-span-1"
            index={2}
          >
            {!data ? <Skeleton className="h-72 w-full" /> : <StockWatchCard data={data} />}
          </Panel>
        </div>

        {/* ── Services ──────────────────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel
            title={t('dashboard.serviceMix')}
            subtitle={t('dashboard.periodLabel', { days })}
            icon={<PieChart aria-hidden="true" />}
          >
            {!data ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <ServiceMixChart data={data.serviceMix} />
            )}
          </Panel>
          <Panel
            title={t('dashboard.byService')}
            subtitle={t('dashboard.periodLabel', { days })}
            icon={<BarChart3 aria-hidden="true" />}
            index={1}
          >
            {!data ? <ListSkeleton rows={5} /> : <ServiceRankList data={data.serviceMix} />}
          </Panel>
          <Panel
            title={t('dashboard.statusBreakdown')}
            subtitle={t('dashboard.periodLabel', { days })}
            icon={<Activity aria-hidden="true" />}
            index={2}
          >
            {!data ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <StatusBreakdown data={data.statusBreakdown} />
            )}
          </Panel>
        </div>

        {/* ── People & places ───────────────────────────────────────────────── */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Panel
            title={t('dashboard.staffLeaderboard')}
            subtitle={t('dashboard.periodLabel', { days })}
            icon={<Trophy aria-hidden="true" />}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to={ROUTES.staff}>{t('nav.staff')}</Link>
              </Button>
            }
          >
            {!data ? <ListSkeleton rows={5} /> : <StaffLeaderboard data={data.staffLeaderboard} />}
          </Panel>
          <Panel
            title={t('dashboard.peakHours')}
            subtitle={t('dashboard.today')}
            icon={<Clock aria-hidden="true" />}
            index={1}
          >
            {!data ? <Skeleton className="h-32 w-full" /> : <PeakHours data={data.hoursToday} />}
          </Panel>
          <Panel
            title={t('dashboard.branchPerformance')}
            subtitle={t('dashboard.periodLabel', { days })}
            icon={<Building2 aria-hidden="true" />}
            action={
              <Button asChild variant="ghost" size="sm">
                <Link to={ROUTES.branches}>{t('nav.branches')}</Link>
              </Button>
            }
            index={2}
          >
            {!data ? (
              <ListSkeleton rows={2} />
            ) : (
              <BranchPerformance data={data.branchPerformance} />
            )}
          </Panel>
        </div>

        {/* ── Branch footprint by province ──────────────────────────────────── */}
        <ProvinceMapCard data={data} days={days} now={now} scopeBranchId={branchId} />

        {/* ── Upcoming appointments ─────────────────────────────────────────── */}
        <Panel
          title={t('dashboard.upcoming')}
          subtitle={data ? t('dashboard.upcomingNext7', { count: data.upcoming7d }) : undefined}
          icon={<CalendarClock aria-hidden="true" />}
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to={ROUTES.appointments}>{t('nav.appointments')}</Link>
            </Button>
          }
        >
          {!data ? (
            <ListSkeleton rows={6} />
          ) : data.upcoming.length === 0 ? (
            <EmptyState title={t('dashboard.noUpcoming')} className="border-0" />
          ) : (
            <>
              <NextSevenDays series={data.upcoming7dSeries} now={now} />

              <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <CardCount
                  icon={<FileCheck2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
                  label={t('dashboard.upcomingTotal')}
                  value={data.upcoming.length}
                  active={statusFilter === null}
                  onClick={() => setStatusFilter(null)}
                  index={0}
                />
                {upcomingStatusCounts.map(({ status, count }, i) => {
                  const Icon = STATUS_ICON[status] ?? Circle;
                  return (
                    <CardCount
                      key={status}
                      icon={
                        <Icon
                          className={cn(
                            'h-5 w-5 shrink-0',
                            STATUS_TEXT[status] ?? 'text-muted-foreground',
                          )}
                          aria-hidden="true"
                        />
                      }
                      label={t(`status.${status}`)}
                      value={count}
                      active={statusFilter === status}
                      onClick={() => setStatusFilter((cur) => (cur === status ? null : status))}
                      index={i + 1}
                    />
                  );
                })}
              </div>

              <div className="relative mb-3">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  value={upcomingQuery}
                  onChange={(e) => setUpcomingQuery(e.target.value)}
                  placeholder={t('dashboard.searchUpcoming')}
                  aria-label={t('dashboard.searchUpcoming')}
                  className="h-10 rounded-xl pl-9 text-sm"
                />
              </div>

              {filteredUpcoming.length === 0 ? (
                <EmptyState title={t('dashboard.noMatch')} className="border-0" />
              ) : (
                <>
                  <ul className="-mx-2">
                    {pagedUpcoming.map((a, i) => {
                      const dayKey = dayjs(a.startAt).tz().format('YYYY-MM-DD');
                      const prevKey =
                        i > 0
                          ? dayjs(pagedUpcoming[i - 1]!.startAt)
                              .tz()
                              .format('YYYY-MM-DD')
                          : null;
                      return (
                        <Fragment key={a.id}>
                          {dayKey !== prevKey ? (
                            <li className="px-2 pb-1 pt-3 text-xs font-semibold text-muted-foreground first:pt-0">
                              {dayLabel(dayKey, now, t)}
                            </li>
                          ) : null}
                          <li>
                            <Link
                              to={ROUTES.appointmentDetail(a.id)}
                              className="group flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span className="w-12 shrink-0 text-center text-sm font-semibold tabular-nums">
                                {formatTime(a.startAt)}
                              </span>
                              <PersonAvatar name={a.customerName} size={32} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{a.customerName}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {a.serviceName} · {a.staffName}
                                  {branchId === 'all' ? ` · ${a.branchName}` : ''}
                                </p>
                              </div>
                              <span className="hidden text-xs tabular-nums text-muted-foreground md:inline">
                                {formatCurrency(a.price)}
                              </span>
                              <StatusPill status={a.status} label={t(`status.${a.status}`)} />
                            </Link>
                          </li>
                        </Fragment>
                      );
                    })}
                  </ul>
                  <PageNav
                    page={upcomingPage}
                    pageCount={upcomingPageCount}
                    onChange={setUpcomingPage}
                  />
                </>
              )}
            </>
          )}
        </Panel>
      </div>

      {data ? (
        <p className="text-xs text-muted-foreground">
          {t('dashboard.rangeNote', {
            from: data.range.from,
            to: data.range.to,
            total: formatCompactNumber(data.revenueSeries.reduce((s, d) => s + d.bookings, 0)),
          })}
          {' · '}
          {t('dashboard.autoRefresh')}
        </p>
      ) : null}
    </div>
  );
}

function dayLabel(key: string, now: number, t: (k: string) => string): string {
  const today = dayjs(now).tz().format('YYYY-MM-DD');
  const tomorrow = dayjs(now).tz().add(1, 'day').format('YYYY-MM-DD');
  if (key === today) return t('dashboard.dayToday');
  if (key === tomorrow) return t('dashboard.dayTomorrow');
  return formatDate(key);
}

function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** 7 mini columns — upcoming bookings per day, today first. */
function NextSevenDays({ series, now }: { series: number[]; now: number }) {
  const max = Math.max(1, ...series);
  return (
    <div className="mb-4 grid grid-cols-7 gap-1.5" aria-hidden="true">
      {series.map((n, i) => {
        const d = dayjs(now).tz().add(i, 'day');
        return (
          <div key={i} className="flex flex-col items-center gap-1">
            <span className="text-[11px] font-semibold tabular-nums">{n}</span>
            <div className="relative h-12 w-full overflow-hidden rounded-lg bg-muted">
              <div
                className={cn(
                  'absolute inset-x-0 bottom-0 rounded-lg transition-[height] duration-500',
                  i === 0 ? 'bg-primary' : 'bg-primary/40',
                )}
                style={{ height: `${n ? Math.max((n / max) * 100, 8) : 0}%` }}
              />
            </div>
            <span
              className={cn(
                'text-[11px] tabular-nums',
                i === 0 ? 'font-semibold text-primary' : 'text-muted-foreground',
              )}
            >
              {d.format('DD/MM')}
            </span>
          </div>
        );
      })}
    </div>
  );
}
