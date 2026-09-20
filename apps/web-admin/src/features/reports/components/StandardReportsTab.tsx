import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  CalendarCheck,
  CalendarDays,
  Clock,
  ListChecks,
  Scissors,
  Split,
  Timer,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { DateField } from '@/components/shared/DateField';
import { Skeleton } from '@/components/ui/skeleton';
import { http } from '@/services/http';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DashboardStats } from '@/types/models';

import { downloadCsv, type CsvRow } from '../lib/csv';
import { HourHistogram } from './HourHistogram';
import { CellBar, LedgerTable } from './LedgerTable';
import { ReportDocHeader } from './ReportDocHeader';
import { ReportRevenueBars } from './ReportRevenueBars';
import { ReportStatCard, type StatTone } from './ReportStatCard';
import { SplitMeter } from './SplitMeter';
import { StatusStackBar } from './StatusStackBar';

interface EndOfDay {
  date: string;
  branchId: string;
  totals: {
    bookings: number;
    completed: number;
    cancelled: number;
    walkIns: number;
    revenue: number;
    deposits: number;
  };
  topServices: { name: string; count: number; revenue: number }[];
}

type ReportId =
  | 'end-of-day'
  | 'sales-by-day'
  | 'revenue-by-service'
  | 'staff-performance'
  | 'branch-performance'
  | 'status'
  | 'peak-hours'
  | 'channel'
  | 'queue';

const CATALOG: { groupKey: string; items: { id: ReportId; icon: LucideIcon }[] }[] = [
  { groupKey: 'daily', items: [{ id: 'end-of-day', icon: CalendarCheck }] },
  {
    groupKey: 'sales',
    items: [
      { id: 'sales-by-day', icon: CalendarDays },
      { id: 'revenue-by-service', icon: Scissors },
    ],
  },
  {
    groupKey: 'people',
    items: [
      { id: 'staff-performance', icon: Users },
      { id: 'branch-performance', icon: Building2 },
    ],
  },
  {
    groupKey: 'ops',
    items: [
      { id: 'status', icon: ListChecks },
      { id: 'peak-hours', icon: Clock },
      { id: 'channel', icon: Split },
      { id: 'queue', icon: Timer },
    ],
  },
];
const FLAT_IDS = CATALOG.flatMap((g) => g.items.map((i) => i.id));
const camel = (id: string) => id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

interface Props {
  branchId: string;
  branchName: string;
  stats?: DashboardStats;
}

/** Standard reports — a catalogue on the left, the selected report rendered as a
 *  print-ready document on the right (masthead, KPIs, a chart, and a sortable
 *  ledger). Its own master–detail layout, distinct from the Overview scroll. */
export function StandardReportsTab({ branchId, branchName, stats }: Props) {
  const { t } = useTranslation();
  const [active, setActive] = useState<ReportId>('end-of-day');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const navRefs = useRef<Partial<Record<ReportId, HTMLButtonElement | null>>>({});

  const { data: eod, isLoading: eodLoading } = useQuery({
    queryKey: ['reports', 'end-of-day', date, branchId],
    queryFn: async () => {
      const res = await http.get<{ data: EndOfDay }>('/reports/end-of-day', {
        params: { date, branchId },
      });
      return res.data.data;
    },
    enabled: active === 'end-of-day',
  });

  const onNavKey = (e: KeyboardEvent, id: ReportId) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = FLAT_IDS.indexOf(id);
    const next =
      e.key === 'ArrowDown' ? (i + 1) % FLAT_IDS.length : (i - 1 + FLAT_IDS.length) % FLAT_IDS.length;
    const nid = FLAT_IDS[next]!;
    setActive(nid);
    navRefs.current[nid]?.focus();
  };

  const win = t('dashboard.last14Window');
  const today = t('dashboard.today');

  // ---- derived datasets ----
  const svc = useMemo(() => {
    const rows = stats?.serviceMix ?? [];
    const total = rows.reduce((s, d) => s + d.value, 0);
    return { rows, total, max: Math.max(1, ...rows.map((d) => d.value)), top: rows[0] };
  }, [stats]);

  const daily = useMemo(() => {
    const src = stats?.revenueSeries ?? [];
    let run = 0;
    const rows = src.map((d) => ({ ...d, running: (run += d.revenue) }));
    const revenue = src.reduce((s, d) => s + d.revenue, 0);
    const bookings = src.reduce((s, d) => s + d.bookings, 0);
    const best = src.reduce<DashboardStats['revenueSeries'][number] | null>(
      (a, b) => (!a || b.revenue > a.revenue ? b : a),
      null,
    );
    return { rows, revenue, bookings, avg: src.length ? Math.round(revenue / src.length) : 0, best };
  }, [stats]);

  const staff = useMemo(() => {
    const rows = stats?.staffLeaderboard ?? [];
    return {
      rows,
      completed: rows.reduce((s, d) => s + d.completed, 0),
      revenue: rows.reduce((s, d) => s + d.revenue, 0),
    };
  }, [stats]);

  const branch = useMemo(() => {
    const rows = stats?.branchPerformance ?? [];
    return {
      rows,
      revenue: rows.reduce((s, d) => s + d.revenue, 0),
      bookings: rows.reduce((s, d) => s + d.bookings, 0),
    };
  }, [stats]);

  const status = useMemo(() => {
    const rows = stats?.statusBreakdown ?? [];
    const total = rows.reduce((s, d) => s + d.count, 0);
    const done = rows.find((r) => r.status === 'COMPLETED')?.count ?? 0;
    const cancel =
      (rows.find((r) => r.status === 'CANCELLED')?.count ?? 0) +
      (rows.find((r) => r.status === 'NO_SHOW')?.count ?? 0);
    return {
      rows,
      total,
      done,
      cancel,
      rate: done + cancel > 0 ? Math.round((done / (done + cancel)) * 100) : 0,
    };
  }, [stats]);

  const hours = useMemo(() => {
    const rows = stats?.hoursToday ?? [];
    return {
      rows,
      total: rows.reduce((s, d) => s + d.count, 0),
      peak: rows.reduce<DashboardStats['hoursToday'][number] | undefined>(
        (a, b) => (b.count > (a?.count ?? -1) ? b : a),
        undefined,
      ),
    };
  }, [stats]);

  const meta = {
    label: t(`reports.std.${camel(active)}`),
    desc: t(`reports.std.${camel(active)}Desc`),
  };
  const scope = active === 'end-of-day' ? [formatDate(date), branchName] : [win, branchName];
  const loadingStats = !stats && active !== 'end-of-day';
  const busy = loadingStats || (active === 'end-of-day' && eodLoading);

  function handleExport() {
    let body: CsvRow[] = [];
    if (active === 'end-of-day' && eod) {
      body = [
        [t('reports.std.date'), formatDate(date)],
        [t('reports.bookings'), eod.totals.bookings],
        [t('reports.completed'), eod.totals.completed],
        [t('status.CANCELLED'), eod.totals.cancelled],
        [t('reports.std.walkIns'), eod.totals.walkIns],
        [t('reports.revenue'), eod.totals.revenue],
        [t('reports.deposits'), eod.totals.deposits],
        [],
        [t('reports.col.service'), t('reports.col.count'), t('reports.col.revenue')],
        ...eod.topServices.map((s): CsvRow => [s.name, s.count, s.revenue]),
      ];
    } else if (active === 'sales-by-day') {
      body = [
        [
          t('reports.col.date'),
          t('reports.col.bookings'),
          t('reports.col.revenue'),
          t('reports.col.runningTotal'),
        ],
        ...daily.rows.map((d): CsvRow => [d.date, d.bookings, d.revenue, d.running]),
        [t('reports.total'), daily.bookings, daily.revenue, daily.revenue],
      ];
    } else if (active === 'revenue-by-service') {
      body = [
        [t('reports.col.service'), t('reports.col.count'), t('reports.col.share')],
        ...svc.rows.map((s): CsvRow => [
          s.name,
          s.value,
          `${svc.total ? Math.round((s.value / svc.total) * 100) : 0}%`,
        ]),
      ];
    } else if (active === 'staff-performance') {
      body = [
        [
          t('reports.col.staff'),
          t('reports.col.completed'),
          t('reports.col.revenue'),
          t('reports.col.perVisit'),
        ],
        ...staff.rows.map((s): CsvRow => [
          s.name,
          s.completed,
          s.revenue,
          s.completed ? Math.round(s.revenue / s.completed) : 0,
        ]),
      ];
    } else if (active === 'branch-performance') {
      body = [
        [t('reports.col.branch'), t('reports.col.bookings'), t('reports.col.revenue')],
        ...branch.rows.map((b): CsvRow => [b.name, b.bookings, b.revenue]),
      ];
    } else if (active === 'status') {
      body = [
        [t('reports.col.status'), t('reports.col.count'), t('reports.col.share')],
        ...status.rows.map((r): CsvRow => [
          t(`status.${r.status}`),
          r.count,
          `${status.total ? Math.round((r.count / status.total) * 100) : 0}%`,
        ]),
      ];
    } else if (active === 'peak-hours') {
      body = [
        [t('reports.col.hour'), t('reports.col.count')],
        ...hours.rows.map((h): CsvRow => [`${String(h.hour).padStart(2, '0')}:00`, h.count]),
      ];
    } else if (active === 'channel' && stats) {
      body = [
        [t('reports.channel.bookingType'), t('reports.col.count')],
        [t('reports.channel.booked'), Math.max(0, stats.bookingsToday - stats.walkinsToday)],
        [t('reports.channel.walkIn'), stats.walkinsToday],
        [],
        [t('reports.channel.delivery'), t('reports.col.count')],
        [t('reports.channel.inStore'), Math.max(0, stats.bookingsToday - stats.homeServiceToday)],
        [t('reports.channel.homeService'), stats.homeServiceToday],
      ];
    } else if (active === 'queue' && stats) {
      body = [
        [t('reports.metric'), t('reports.value')],
        [t('reports.queue.waiting'), stats.queueWaiting],
        [t('reports.queue.inService'), stats.queueInService],
        [t('reports.queue.called'), stats.queueCalled],
        [t('reports.queue.longestWait'), stats.queueLongestWaitMin],
        [t('reports.queue.nextNumber'), stats.queueNextNumber ?? '—'],
      ];
    }
    const stamp = active === 'end-of-day' ? date : new Date().toISOString().slice(0, 10);
    downloadCsv(`${active}-${stamp}`, [
      [t('reports.businessName'), t('reports.title'), meta.label],
      [t('reports.branch'), branchName],
      [],
      ...body,
    ]);
  }

  const kpi = (p: {
    label: string;
    value: ReactNode;
    icon: LucideIcon;
    tone: StatTone;
    sub?: string;
    loading?: boolean;
    index: number;
  }) => (
    <ReportStatCard
      label={p.label}
      value={p.value}
      icon={<p.icon className="h-4 w-4" aria-hidden="true" />}
      tone={p.tone}
      sub={p.sub}
      loading={p.loading}
      index={p.index}
    />
  );

  function renderBody(): ReactNode {
    if (active === 'end-of-day') {
      const tot = eod?.totals;
      const svcTotal = eod?.topServices.reduce((s, x) => s + x.count, 0) ?? 0;
      const revTotal = eod?.topServices.reduce((s, x) => s + x.revenue, 0) ?? 0;
      const avgTicket = tot && tot.completed ? Math.round(tot.revenue / tot.completed) : 0;
      const closeRate =
        tot && tot.completed + tot.cancelled > 0
          ? Math.round((tot.completed / (tot.completed + tot.cancelled)) * 100)
          : 0;
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.bookings'), value: tot?.bookings ?? '—', icon: CalendarCheck, tone: 'primary', loading: eodLoading, index: 0 })}
            {kpi({ label: t('reports.completed'), value: tot?.completed ?? '—', icon: ListChecks, tone: 'success', loading: eodLoading, index: 1 })}
            {kpi({ label: t('reports.revenue'), value: tot ? formatCurrency(tot.revenue) : '—', icon: CalendarDays, tone: 'info', loading: eodLoading, index: 2 })}
            {kpi({ label: t('reports.deposits'), value: tot ? formatCurrency(tot.deposits) : '—', icon: Timer, tone: 'violet', loading: eodLoading, index: 3 })}
          </KpiRow>

          {tot ? (
            <LedgerTable
              rows={[
                { k: t('status.CANCELLED'), v: String(tot.cancelled) },
                { k: t('reports.std.walkIns'), v: String(tot.walkIns) },
                { k: t('reports.kpi.avgTicket'), v: formatCurrency(avgTicket) },
                { k: t('reports.kpi.completionRate'), v: `${closeRate}%` },
              ]}
              rowKey={(r) => r.k}
              columns={[
                { key: 'k', label: t('reports.metric'), render: (r) => r.k },
                { key: 'v', label: t('reports.value'), align: 'right', render: (r) => r.v },
              ]}
            />
          ) : null}

          <TableWrap title={t('reports.topServices')}>
            {eodLoading || !eod ? (
              <Skeleton className="h-40 w-full" />
            ) : eod.topServices.length === 0 ? (
              <Empty label={t('reports.empty')} />
            ) : (
              <LedgerTable
                rows={eod.topServices}
                rowKey={(r) => r.name}
                columns={[
                  { key: 'name', label: t('reports.col.service'), render: (r) => <span className="font-medium">{r.name}</span>, sortValue: (r) => r.name },
                  { key: 'count', label: t('reports.col.count'), align: 'right', render: (r) => r.count, sortValue: (r) => r.count },
                  { key: 'revenue', label: t('reports.col.revenue'), align: 'right', render: (r) => formatCurrency(r.revenue), sortValue: (r) => r.revenue },
                  { key: 'share', label: t('reports.col.share'), align: 'right', render: (r) => `${svcTotal ? Math.round((r.count / svcTotal) * 100) : 0}%` },
                ]}
                total={[t('reports.total'), svcTotal, formatCurrency(revTotal), '100%']}
              />
            )}
          </TableWrap>
        </div>
      );
    }

    if (active === 'sales-by-day') {
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.kpi.revenue'), value: formatCurrency(daily.revenue), icon: CalendarDays, tone: 'primary', sub: win, index: 0 })}
            {kpi({ label: t('reports.kpi.bookings'), value: daily.bookings, icon: CalendarCheck, tone: 'info', sub: win, index: 1 })}
            {kpi({ label: t('reports.col.avgPerDay'), value: formatCurrency(daily.avg), icon: Timer, tone: 'violet', sub: win, index: 2 })}
            {kpi({ label: t('reports.std.bestDay'), value: daily.best ? formatCurrency(daily.best.revenue) : '—', sub: daily.best ? formatDate(daily.best.date) : undefined, icon: ListChecks, tone: 'success', index: 3 })}
          </KpiRow>
          <ReportRevenueBars data={stats?.revenueSeries ?? []} />
          <LedgerTable
            rows={daily.rows}
            rowKey={(r) => r.date}
            defaultSort={{ key: 'date', dir: 'asc' }}
            columns={[
              { key: 'date', label: t('reports.col.date'), render: (r) => formatDate(r.date), sortValue: (r) => r.date },
              { key: 'bookings', label: t('reports.col.bookings'), align: 'right', render: (r) => r.bookings, sortValue: (r) => r.bookings },
              { key: 'revenue', label: t('reports.col.revenue'), align: 'right', render: (r) => formatCurrency(r.revenue), sortValue: (r) => r.revenue },
              { key: 'running', label: t('reports.col.runningTotal'), align: 'right', render: (r) => <span className="text-muted-foreground">{formatCurrency(r.running)}</span> },
            ]}
            total={[t('reports.total'), daily.bookings, formatCurrency(daily.revenue), formatCurrency(daily.revenue)]}
          />
        </div>
      );
    }

    if (active === 'revenue-by-service') {
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.col.count'), value: svc.total, icon: Scissors, tone: 'primary', sub: win, index: 0 })}
            {kpi({ label: t('reports.std.serviceCount'), value: svc.rows.length, icon: ListChecks, tone: 'info', sub: win, index: 1 })}
            {kpi({ label: t('reports.std.topService'), value: svc.top?.name ?? '—', sub: svc.top && svc.total ? `${Math.round((svc.top.value / svc.total) * 100)}%` : undefined, icon: CalendarCheck, tone: 'success', index: 2 })}
          </KpiRow>
          <LedgerTable
            rows={svc.rows}
            rowKey={(r) => r.name}
            empty={t('reports.empty')}
            columns={[
              { key: 'name', label: t('reports.col.service'), render: (r) => <span className="font-medium">{r.name}</span>, sortValue: (r) => r.name },
              {
                key: 'value',
                label: t('reports.col.count'),
                align: 'right',
                render: (r) => (
                  <span className="inline-flex items-center justify-end">
                    {r.value}
                    <CellBar value={r.value} max={svc.max} />
                  </span>
                ),
                sortValue: (r) => r.value,
              },
              { key: 'share', label: t('reports.col.share'), align: 'right', render: (r) => `${svc.total ? Math.round((r.value / svc.total) * 100) : 0}%`, sortValue: (r) => r.value },
            ]}
            total={[t('reports.total'), svc.total, '100%']}
          />
        </div>
      );
    }

    if (active === 'staff-performance') {
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.std.staffCount'), value: staff.rows.length, icon: Users, tone: 'primary', sub: win, index: 0 })}
            {kpi({ label: t('reports.col.completed'), value: staff.completed, icon: ListChecks, tone: 'success', sub: win, index: 1 })}
            {kpi({ label: t('reports.col.revenue'), value: formatCurrency(staff.revenue), icon: CalendarDays, tone: 'info', sub: win, index: 2 })}
            {kpi({ label: t('reports.kpi.avgTicket'), value: formatCurrency(staff.completed ? Math.round(staff.revenue / staff.completed) : 0), icon: Timer, tone: 'violet', sub: win, index: 3 })}
          </KpiRow>
          <LedgerTable
            rows={staff.rows}
            rowKey={(r) => r.name}
            empty={t('reports.empty')}
            columns={[
              { key: 'name', label: t('reports.col.staff'), render: (r) => <span className="font-medium">{r.name}</span>, sortValue: (r) => r.name },
              { key: 'completed', label: t('reports.col.completed'), align: 'right', render: (r) => r.completed, sortValue: (r) => r.completed },
              { key: 'revenue', label: t('reports.col.revenue'), align: 'right', render: (r) => formatCurrency(r.revenue), sortValue: (r) => r.revenue },
              {
                key: 'avg',
                label: t('reports.col.perVisit'),
                align: 'right',
                render: (r) => <span className="text-muted-foreground">{formatCurrency(r.completed ? Math.round(r.revenue / r.completed) : 0)}</span>,
                sortValue: (r) => (r.completed ? r.revenue / r.completed : 0),
              },
            ]}
            total={[t('reports.total'), staff.completed, formatCurrency(staff.revenue), '']}
          />
        </div>
      );
    }

    if (active === 'branch-performance') {
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.std.branchCount'), value: branch.rows.length, icon: Building2, tone: 'primary', sub: win, index: 0 })}
            {kpi({ label: t('reports.col.revenue'), value: formatCurrency(branch.revenue), icon: CalendarDays, tone: 'info', sub: win, index: 1 })}
            {kpi({ label: t('reports.col.bookings'), value: branch.bookings, icon: CalendarCheck, tone: 'success', sub: win, index: 2 })}
          </KpiRow>
          <LedgerTable
            rows={branch.rows}
            rowKey={(r) => r.name}
            empty={t('reports.empty')}
            columns={[
              { key: 'name', label: t('reports.col.branch'), render: (r) => <span className="font-medium">{r.name}</span>, sortValue: (r) => r.name },
              { key: 'bookings', label: t('reports.col.bookings'), align: 'right', render: (r) => r.bookings, sortValue: (r) => r.bookings },
              { key: 'revenue', label: t('reports.col.revenue'), align: 'right', render: (r) => formatCurrency(r.revenue), sortValue: (r) => r.revenue },
              { key: 'share', label: t('reports.col.share'), align: 'right', render: (r) => `${branch.revenue ? Math.round((r.revenue / branch.revenue) * 100) : 0}%`, sortValue: (r) => r.revenue },
            ]}
            total={[t('reports.total'), branch.bookings, formatCurrency(branch.revenue), '100%']}
          />
        </div>
      );
    }

    if (active === 'status') {
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.kpi.completionRate'), value: `${status.rate}%`, icon: ListChecks, tone: 'success', sub: win, index: 0 })}
            {kpi({ label: t('reports.kpi.cancellations'), value: status.cancel, icon: Timer, tone: 'violet', sub: win, index: 1 })}
            {kpi({ label: t('reports.col.count'), value: status.total, icon: CalendarCheck, tone: 'primary', sub: win, index: 2 })}
          </KpiRow>
          {status.rows.length === 0 ? <Empty label={t('reports.empty')} /> : <StatusStackBar data={status.rows} />}
        </div>
      );
    }

    if (active === 'peak-hours') {
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.col.count'), value: hours.total, icon: CalendarCheck, tone: 'primary', sub: today, index: 0 })}
            {kpi({
              label: t('reports.std.peakHour'),
              value: hours.peak && hours.peak.count > 0 ? `${String(hours.peak.hour).padStart(2, '0')}:00` : '—',
              sub: hours.peak && hours.peak.count > 0 ? t('reports.countItems', { count: hours.peak.count }) : undefined,
              icon: Clock,
              tone: 'info',
              index: 1,
            })}
          </KpiRow>
          {hours.total === 0 ? (
            <Empty label={t('reports.empty')} />
          ) : (
            <>
              <HourHistogram data={hours.rows} />
              <LedgerTable
                rows={hours.rows.filter((h) => h.count > 0)}
                rowKey={(r) => String(r.hour)}
                columns={[
                  { key: 'hour', label: t('reports.col.hour'), render: (r) => `${String(r.hour).padStart(2, '0')}:00` },
                  { key: 'count', label: t('reports.col.count'), align: 'right', render: (r) => r.count, sortValue: (r) => r.count },
                  { key: 'share', label: t('reports.col.share'), align: 'right', render: (r) => `${hours.total ? Math.round((r.count / hours.total) * 100) : 0}%` },
                ]}
                total={[t('reports.total'), hours.total, '100%']}
              />
            </>
          )}
        </div>
      );
    }

    if (active === 'channel' && stats) {
      const booked = Math.max(0, stats.bookingsToday - stats.walkinsToday);
      const inStore = Math.max(0, stats.bookingsToday - stats.homeServiceToday);
      const rate = Math.round(stats.walkinRate14d * 100);
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.channel.walkInRate', { pct: rate }), value: `${rate}%`, icon: Split, tone: 'primary', sub: win, index: 0 })}
            {kpi({ label: t('reports.channel.walkIn'), value: stats.walkinsToday, icon: Users, tone: 'info', sub: today, index: 1 })}
            {kpi({ label: t('reports.channel.homeService'), value: stats.homeServiceToday, icon: Building2, tone: 'violet', sub: today, index: 2 })}
          </KpiRow>
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
                {t('reports.channel.bookingType')}
              </p>
              <SplitMeter
                ariaLabel={t('reports.channel.bookingType')}
                parts={[
                  { label: t('reports.channel.booked'), value: booked, color: 'hsl(var(--info))' },
                  { label: t('reports.channel.walkIn'), value: stats.walkinsToday, color: 'hsl(var(--chart-2))' },
                ]}
              />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
                {t('reports.channel.delivery')}
              </p>
              <SplitMeter
                ariaLabel={t('reports.channel.delivery')}
                parts={[
                  { label: t('reports.channel.inStore'), value: inStore, color: 'hsl(var(--primary))' },
                  { label: t('reports.channel.homeService'), value: stats.homeServiceToday, color: 'hsl(var(--chart-3))' },
                ]}
              />
            </div>
          </div>
        </div>
      );
    }

    if (active === 'queue' && stats) {
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.queue.waiting'), value: stats.queueWaiting, icon: Timer, tone: 'primary', sub: today, index: 0 })}
            {kpi({ label: t('reports.queue.longestWait'), value: t('reports.minutes', { count: stats.queueLongestWaitMin }), icon: Clock, tone: 'violet', sub: today, index: 1 })}
          </KpiRow>
          <LedgerTable
            rows={[
              { k: t('reports.queue.waiting'), v: String(stats.queueWaiting) },
              { k: t('reports.queue.inService'), v: String(stats.queueInService) },
              { k: t('reports.queue.called'), v: String(stats.queueCalled) },
              { k: t('reports.queue.longestWait'), v: t('reports.minutes', { count: stats.queueLongestWaitMin }) },
              { k: t('reports.queue.nextNumber'), v: stats.queueNextNumber ?? '—' },
            ]}
            rowKey={(r) => r.k}
            columns={[
              { key: 'k', label: t('reports.metric'), render: (r) => r.k },
              { key: 'v', label: t('reports.value'), align: 'right', render: (r) => r.v },
            ]}
          />
        </div>
      );
    }

    return <Empty label={t('reports.empty')} />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[248px_1fr]">
      {/* catalogue */}
      <nav
        aria-label={t('reports.std.pick')}
        className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-20 lg:flex-col lg:gap-4 lg:self-start lg:overflow-visible lg:pb-0"
      >
        {CATALOG.map((group) => (
          <div key={group.groupKey} className="lg:space-y-1.5">
            <p className="hidden px-1 text-[10px] font-semibold text-muted-foreground lg:block">
              {t(`reports.std.group.${group.groupKey}`)}
            </p>
            <div className="flex gap-2 lg:flex-col lg:gap-1">
              {group.items.map(({ id, icon: Icon }) => {
                const on = active === id;
                return (
                  <button
                    key={id}
                    ref={(el) => {
                      navRefs.current[id] = el;
                    }}
                    type="button"
                    aria-current={on ? 'true' : undefined}
                    tabIndex={on ? 0 : -1}
                    onClick={() => setActive(id)}
                    onKeyDown={(e) => onNavKey(e, id)}
                    className={cn(
                      'relative flex shrink-0 items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                      on
                        ? 'border-primary/40 bg-primary/[0.07]'
                        : 'border-border hover:border-primary/30 hover:bg-muted/50',
                    )}
                  >
                    {on ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary"
                      />
                    ) : null}
                    <Icon
                      className={cn('mt-0.5 h-4 w-4 shrink-0', on ? 'text-primary' : 'text-muted-foreground')}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className={cn('block text-sm font-medium', on ? 'text-primary' : 'text-foreground')}>
                        {t(`reports.std.${camel(id)}`)}
                      </span>
                      <span className="mt-0.5 hidden text-[11px] leading-snug text-muted-foreground lg:block">
                        {t(`reports.std.${camel(id)}Desc`)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* document */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="space-y-4 p-4 sm:p-5" aria-busy={busy}>
          <ReportDocHeader
            title={meta.label}
            desc={meta.desc}
            scope={scope}
            onPrint={() => window.print()}
            onExport={handleExport}
            control={
              active === 'end-of-day' ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t('reports.std.date')}
                  </label>
                  <DateField value={date} onChange={setDate} aria-label={t('reports.std.date')} />
                </div>
              ) : undefined
            }
          />

          {loadingStats ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
              <Skeleton className="h-56 w-full" />
            </div>
          ) : (
            renderBody()
          )}
        </div>
      </div>
    </div>
  );
}

function KpiRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

function TableWrap({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 font-display text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
      {label}
    </p>
  );
}
