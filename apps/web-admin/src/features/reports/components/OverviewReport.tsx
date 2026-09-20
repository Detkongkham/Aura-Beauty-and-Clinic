import { CalendarClock, Coins, ReceiptText, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/components/ui/skeleton';
import { formatCompactNumber, formatCurrency, formatDate } from '@/lib/format';
import type { DashboardStats } from '@/types/models';

import { AttentionPanel } from './AttentionPanel';
import { HourHistogram } from './HourHistogram';
import { LabeledBars } from './LabeledBars';
import { CellBar, LedgerTable } from './LedgerTable';
import { ReportFootnotes } from './ReportFootnotes';
import { ReportRevenueBars } from './ReportRevenueBars';
import { ReportSection } from './ReportSection';
import { ReportStatCard } from './ReportStatCard';
import { SplitMeter } from './SplitMeter';
import { StatusStackBar } from './StatusStackBar';

type Day = DashboardStats['revenueSeries'][number];

function pct(ratio: number): { value: string; direction: 'up' | 'down' | 'flat' } {
  if (Math.abs(ratio) < 0.005) return { value: '0%', direction: 'flat' };
  return {
    value: `${ratio > 0 ? '+' : ''}${Math.round(ratio * 100)}%`,
    direction: ratio > 0 ? 'up' : 'down',
  };
}

interface Props {
  data?: DashboardStats;
  series: Day[];
  prevSeries: Day[];
  rangeDays: number;
}

export function OverviewReport({ data, series, prevSeries, rangeDays }: Props) {
  const { t } = useTranslation();

  if (!data) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <ReportSection key={i} index={i + 1} title="—">
            <Skeleton className="h-40 w-full" />
          </ReportSection>
        ))}
      </div>
    );
  }

  const rangeLabel = t('reports.rangeDays', { count: rangeDays });
  const win = t('dashboard.last14Window');
  const dow = (n: number) => t(`reports.dow.${((n % 7) + 7) % 7}`);

  const revenueSum = series.reduce((s, d) => s + d.revenue, 0);
  const bookingsSum = series.reduce((s, d) => s + d.bookings, 0);
  const prevRevenue = prevSeries.reduce((s, d) => s + d.revenue, 0);
  const prevBookings = prevSeries.reduce((s, d) => s + d.bookings, 0);
  const revRatio = prevRevenue > 0 ? (revenueSum - prevRevenue) / prevRevenue : 0;
  const bkRatio = prevBookings > 0 ? (bookingsSum - prevBookings) / prevBookings : 0;
  const avgDailyRevenue = series.length ? Math.round(revenueSum / series.length) : 0;

  const sb = new Map(data.statusBreakdown.map((d) => [d.status, d.count]));
  const completed = sb.get('COMPLETED') ?? 0;
  const cancelled = (sb.get('CANCELLED') ?? 0) + (sb.get('NO_SHOW') ?? 0);
  const closed = completed + cancelled;
  const completionRate = closed > 0 ? Math.round((completed / closed) * 100) : 0;
  const vipPct = data.totalCustomers
    ? Math.round((data.vipCustomers / data.totalCustomers) * 100)
    : 0;

  // 04 — daily ledger with a running total; best day for the insight
  let running = 0;
  const dailyRows = series.map((d) => {
    running += d.revenue;
    return { ...d, running };
  });
  const bestDay = series.reduce<Day | null>((a, b) => (!a || b.revenue > a.revenue ? b : a), null);

  // 05 — day-of-week rollup
  const dowAgg = Array.from({ length: 7 }, (_, i) => ({ i, revenue: 0, bookings: 0, days: 0 }));
  for (const d of series) {
    const idx = new Date(`${d.date}T00:00:00`).getDay();
    const cell = dowAgg[idx]!;
    cell.revenue += d.revenue;
    cell.bookings += d.bookings;
    cell.days += 1;
  }
  const dowOrder = [1, 2, 3, 4, 5, 6, 0];
  const dowRows = dowOrder.map((i) => {
    const c = dowAgg[i]!;
    return { i, label: dow(i), revenue: c.revenue, bookings: c.bookings, avg: c.days ? Math.round(c.revenue / c.days) : 0 };
  });
  const topDow = [...dowRows].sort((a, b) => b.revenue - a.revenue)[0];

  // 06 — channel & delivery
  const inStoreToday = Math.max(0, data.bookingsToday - data.homeServiceToday);
  const bookedToday = Math.max(0, data.bookingsToday - data.walkinsToday);
  const walkinRatePct = Math.round(data.walkinRate14d * 100);

  // 03 — pipeline
  const pipelineItems = data.upcoming7dSeries.map((count, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return { label: dow(d.getDay()), value: count, emphasis: false };
  });
  const pipelineMax = Math.max(...data.upcoming7dSeries, 0);
  const pipelineItemsHi = pipelineItems.map((it) => ({
    ...it,
    emphasis: pipelineMax > 0 && it.value === pipelineMax,
  }));

  // 07 — service ledger
  const svcTotal = data.serviceMix.reduce((s, d) => s + d.value, 0);
  const svcMax = Math.max(1, ...data.serviceMix.map((d) => d.value));
  const topSvc = data.serviceMix[0];

  // 08 — staff ledger
  const staffRevTotal = data.staffLeaderboard.reduce((s, d) => s + d.revenue, 0);
  const staffDoneTotal = data.staffLeaderboard.reduce((s, d) => s + d.completed, 0);
  const topStaff = [...data.staffLeaderboard].sort((a, b) => b.revenue - a.revenue)[0];

  // 09 — branch ledger
  const brRevTotal = data.branchPerformance.reduce((s, d) => s + d.revenue, 0);
  const brBkTotal = data.branchPerformance.reduce((s, d) => s + d.bookings, 0);

  return (
    <div className="space-y-4">
      {/* 01 — headline figures */}
      <ReportSection index={1} title={t('reports.section.summary')} desc={rangeLabel}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ReportStatCard
            label={t('reports.kpi.revenue')}
            value={formatCurrency(revenueSum)}
            valueTitle={String(revenueSum)}
            icon={<Coins className="h-4 w-4" aria-hidden="true" />}
            tone="primary"
            delta={prevSeries.length ? pct(revRatio) : pct(data.revenueTodayDelta)}
            spark={series.map((d) => d.revenue)}
            sub={rangeLabel}
            compare={
              prevSeries.length
                ? t('reports.kpi.vsPrev', { value: formatCurrency(prevRevenue) })
                : t('reports.kpi.perDay', { value: formatCurrency(avgDailyRevenue) })
            }
            index={0}
          />
          <ReportStatCard
            label={t('reports.kpi.bookings')}
            value={bookingsSum}
            icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
            tone="info"
            delta={prevSeries.length ? pct(bkRatio) : pct(data.bookingsTodayDelta)}
            spark={series.map((d) => d.bookings)}
            sub={rangeLabel}
            compare={
              prevSeries.length ? t('reports.kpi.vsPrev', { value: prevBookings }) : undefined
            }
            index={1}
          />
          <ReportStatCard
            label={t('reports.kpi.avgTicket')}
            value={formatCurrency(data.avgTicket14d)}
            icon={<ReceiptText className="h-4 w-4" aria-hidden="true" />}
            tone="violet"
            sub={win}
            index={2}
          />
          <ReportStatCard
            label={t('reports.kpi.completionRate')}
            value={`${completionRate}%`}
            icon={<Target className="h-4 w-4" aria-hidden="true" />}
            tone="success"
            progress={{ value: completed, max: Math.max(closed, 1) }}
            sub={win}
            index={3}
          />
        </div>

        <div className="mt-3 border-t border-border pt-3">
          <LedgerTable
            rows={[
              { k: t('reports.kpi.completed'), v: completed, n: win },
              { k: t('reports.kpi.cancellations'), v: cancelled, n: win },
              {
                k: t('reports.kpi.deposits'),
                v: formatCurrency(data.depositsToday),
                n: t('dashboard.today'),
              },
              {
                k: t('reports.kpi.vip'),
                v: data.vipCustomers,
                n: t('reports.kpi.vipHint', { pct: vipPct }),
              },
            ]}
            rowKey={(r) => r.k}
            columns={[
              { key: 'k', label: t('reports.metric'), render: (r) => r.k },
              { key: 'v', label: t('reports.value'), align: 'right', render: (r) => r.v },
              {
                key: 'n',
                label: t('reports.col.note'),
                align: 'right',
                render: (r) => <span className="text-[11px] text-muted-foreground">{r.n}</span>,
              },
            ]}
          />
        </div>
      </ReportSection>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 02 — today snapshot */}
        <ReportSection index={2} title={t('reports.section.todaySnapshot')} desc={t('dashboard.today')}>
          <LedgerTable
            rows={[
              { k: t('reports.kpi.bookings'), v: data.bookingsToday },
              { k: t('status.CONFIRMED'), v: data.confirmedToday },
              { k: t('status.PENDING'), v: data.pendingToday },
              { k: t('status.COMPLETED'), v: data.completedToday },
              { k: t('status.CANCELLED'), v: data.cancelledToday },
              { k: t('status.NO_SHOW'), v: data.noShowToday },
              { k: t('reports.revenue'), v: formatCurrency(data.revenueToday) },
              { k: t('reports.deposits'), v: formatCurrency(data.depositsToday) },
            ]}
            rowKey={(r) => r.k}
            columns={[
              { key: 'k', label: t('reports.metric'), render: (r) => r.k },
              { key: 'v', label: t('reports.value'), align: 'right', render: (r) => r.v },
            ]}
          />
        </ReportSection>

        {/* 03 — forward pipeline */}
        <ReportSection
          index={3}
          title={t('reports.section.pipeline')}
          desc={t('reports.pipeline.next7')}
          insight={t('reports.pipeline.awaiting', { count: data.pendingConfirmation })}
        >
          <p className="mb-2 text-2xl font-bold tabular-nums text-foreground">
            {data.upcoming7d}
            <span className="ml-2 align-middle text-xs font-medium text-muted-foreground">
              {t('reports.pipeline.appts')}
            </span>
          </p>
          <LabeledBars items={pipelineItemsHi} ariaLabel={t('reports.section.pipeline')} />
        </ReportSection>
      </div>

      {/* 04 — revenue by day */}
      <ReportSection
        index={4}
        title={t('reports.section.revenueByDay')}
        desc={rangeLabel}
        insight={
          bestDay
            ? t('reports.insight.bestDay', {
                date: formatDate(bestDay.date),
                value: formatCurrency(bestDay.revenue),
              })
            : undefined
        }
      >
        <ReportRevenueBars data={series} />
        <div className="mt-3 border-t border-border pt-3">
          <LedgerTable
            rows={dailyRows}
            rowKey={(r) => r.date}
            defaultSort={{ key: 'date', dir: 'asc' }}
            columns={[
              {
                key: 'date',
                label: t('reports.col.date'),
                render: (r) => formatDate(r.date),
                sortValue: (r) => r.date,
              },
              {
                key: 'bookings',
                label: t('reports.col.bookings'),
                align: 'right',
                render: (r) => r.bookings,
                sortValue: (r) => r.bookings,
              },
              {
                key: 'revenue',
                label: t('reports.col.revenue'),
                align: 'right',
                render: (r) => formatCurrency(r.revenue),
                sortValue: (r) => r.revenue,
              },
              {
                key: 'running',
                label: t('reports.col.runningTotal'),
                align: 'right',
                render: (r) => (
                  <span className="text-muted-foreground">{formatCurrency(r.running)}</span>
                ),
              },
            ]}
            total={[
              t('reports.total'),
              bookingsSum,
              formatCurrency(revenueSum),
              formatCurrency(revenueSum),
            ]}
          />
        </div>
      </ReportSection>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 05 — day-of-week */}
        <ReportSection
          index={5}
          title={t('reports.section.dayOfWeek')}
          desc={rangeLabel}
          insight={topDow ? t('reports.insight.dow', { day: topDow.label }) : undefined}
        >
          <LedgerTable
            rows={dowRows}
            rowKey={(r) => String(r.i)}
            columns={[
              { key: 'label', label: t('reports.col.day'), render: (r) => r.label },
              {
                key: 'bookings',
                label: t('reports.col.bookings'),
                align: 'right',
                render: (r) => r.bookings,
                sortValue: (r) => r.bookings,
              },
              {
                key: 'revenue',
                label: t('reports.col.revenue'),
                align: 'right',
                render: (r) => formatCurrency(r.revenue),
                sortValue: (r) => r.revenue,
              },
              {
                key: 'avg',
                label: t('reports.col.avgPerDay'),
                align: 'right',
                render: (r) => (
                  <span className="text-muted-foreground">{formatCurrency(r.avg)}</span>
                ),
                sortValue: (r) => r.avg,
              },
            ]}
            total={[t('reports.total'), bookingsSum, formatCurrency(revenueSum), '']}
          />
        </ReportSection>

        {/* 06 — channel & delivery */}
        <ReportSection
          index={6}
          title={t('reports.section.channelMix')}
          desc={t('dashboard.today')}
          insight={t('reports.insight.channel', { pct: walkinRatePct })}
        >
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
                {t('reports.channel.bookingType')}
              </p>
              <SplitMeter
                ariaLabel={t('reports.channel.bookingType')}
                parts={[
                  { label: t('reports.channel.booked'), value: bookedToday, color: 'hsl(var(--info))' },
                  {
                    label: t('reports.channel.walkIn'),
                    value: data.walkinsToday,
                    color: 'hsl(var(--chart-2))',
                  },
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
                  {
                    label: t('reports.channel.inStore'),
                    value: inStoreToday,
                    color: 'hsl(var(--primary))',
                  },
                  {
                    label: t('reports.channel.homeService'),
                    value: data.homeServiceToday,
                    color: 'hsl(var(--chart-3))',
                  },
                ]}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t('reports.channel.walkInRate', { pct: walkinRatePct })} · {win}
            </p>
          </div>
        </ReportSection>

        {/* 07 — service ledger */}
        <ReportSection
          index={7}
          title={t('reports.section.serviceLedger')}
          desc={win}
          insight={
            topSvc && svcTotal
              ? t('reports.insight.topService', {
                  name: topSvc.name,
                  pct: Math.round((topSvc.value / svcTotal) * 100),
                })
              : undefined
          }
        >
          <LedgerTable
            rows={data.serviceMix}
            rowKey={(r) => r.name}
            empty={t('reports.empty')}
            columns={[
              {
                key: 'name',
                label: t('reports.col.service'),
                render: (r) => <span className="font-medium">{r.name}</span>,
                sortValue: (r) => r.name,
              },
              {
                key: 'value',
                label: t('reports.col.count'),
                align: 'right',
                render: (r) => (
                  <span className="inline-flex items-center justify-end">
                    {r.value}
                    <CellBar value={r.value} max={svcMax} />
                  </span>
                ),
                sortValue: (r) => r.value,
              },
              {
                key: 'share',
                label: t('reports.col.share'),
                align: 'right',
                render: (r) => `${svcTotal ? Math.round((r.value / svcTotal) * 100) : 0}%`,
                sortValue: (r) => r.value,
              },
            ]}
            total={[t('reports.total'), svcTotal, '100%']}
          />
        </ReportSection>

        {/* 08 — staff ledger */}
        <ReportSection
          index={8}
          title={t('reports.section.staffLedger')}
          desc={win}
          insight={
            topStaff
              ? t('reports.insight.topStaff', {
                  name: topStaff.name,
                  value: formatCurrency(topStaff.revenue),
                })
              : undefined
          }
        >
          <LedgerTable
            rows={data.staffLeaderboard}
            rowKey={(r) => r.name}
            empty={t('reports.empty')}
            columns={[
              {
                key: 'name',
                label: t('reports.col.staff'),
                render: (r) => <span className="font-medium">{r.name}</span>,
                sortValue: (r) => r.name,
              },
              {
                key: 'completed',
                label: t('reports.col.completed'),
                align: 'right',
                render: (r) => r.completed,
                sortValue: (r) => r.completed,
              },
              {
                key: 'revenue',
                label: t('reports.col.revenue'),
                align: 'right',
                render: (r) => formatCurrency(r.revenue),
                sortValue: (r) => r.revenue,
              },
              {
                key: 'avg',
                label: t('reports.col.perVisit'),
                align: 'right',
                render: (r) => (
                  <span className="text-muted-foreground">
                    {formatCurrency(r.completed ? Math.round(r.revenue / r.completed) : 0)}
                  </span>
                ),
                sortValue: (r) => (r.completed ? r.revenue / r.completed : 0),
              },
            ]}
            total={[t('reports.total'), staffDoneTotal, formatCurrency(staffRevTotal), '']}
          />
        </ReportSection>

        {/* 09 — branch ledger */}
        <ReportSection index={9} title={t('reports.section.branchLedger')} desc={win}>
          <LedgerTable
            rows={data.branchPerformance}
            rowKey={(r) => r.name}
            empty={t('reports.empty')}
            columns={[
              {
                key: 'name',
                label: t('reports.col.branch'),
                render: (r) => <span className="font-medium">{r.name}</span>,
                sortValue: (r) => r.name,
              },
              {
                key: 'bookings',
                label: t('reports.col.bookings'),
                align: 'right',
                render: (r) => r.bookings,
                sortValue: (r) => r.bookings,
              },
              {
                key: 'revenue',
                label: t('reports.col.revenue'),
                align: 'right',
                render: (r) => formatCurrency(r.revenue),
                sortValue: (r) => r.revenue,
              },
              {
                key: 'share',
                label: t('reports.col.share'),
                align: 'right',
                render: (r) => `${brRevTotal ? Math.round((r.revenue / brRevTotal) * 100) : 0}%`,
                sortValue: (r) => r.revenue,
              },
            ]}
            total={[t('reports.total'), brBkTotal, formatCurrency(brRevTotal), '100%']}
          />
        </ReportSection>

        {/* 10 — status */}
        <ReportSection
          index={10}
          title={t('reports.section.status')}
          desc={win}
          insight={t('reports.insight.completion', { pct: completionRate, cancel: cancelled })}
        >
          <StatusStackBar data={data.statusBreakdown} />
        </ReportSection>

        {/* 11 — peak hours */}
        <ReportSection index={11} title={t('reports.section.peakHours')} desc={t('dashboard.today')}>
          <HourHistogram data={data.hoursToday} />
        </ReportSection>

        {/* 12 — queue health */}
        <ReportSection index={12} title={t('reports.section.queueHealth')} desc={t('dashboard.today')}>
          <LedgerTable
            rows={[
              { k: t('reports.queue.waiting'), v: data.queueWaiting },
              { k: t('reports.queue.inService'), v: data.queueInService },
              { k: t('reports.queue.called'), v: data.queueCalled },
              { k: t('reports.queue.longestWait'), v: t('reports.minutes', { count: data.queueLongestWaitMin }) },
              { k: t('reports.queue.nextNumber'), v: data.queueNextNumber ?? '—' },
            ]}
            rowKey={(r) => r.k}
            columns={[
              { key: 'k', label: t('reports.metric'), render: (r) => r.k },
              { key: 'v', label: t('reports.value'), align: 'right', render: (r) => r.v },
            ]}
          />
        </ReportSection>

        {/* 13 — attention */}
        <AttentionPanel data={data} index={13} />
      </div>

      <ReportFootnotes />

      <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">
        {t('reports.rangeNote', {
          from: formatDate(series[0]?.date ?? data.range.from),
          to: formatDate(series[series.length - 1]?.date ?? data.range.to),
          total: formatCompactNumber(bookingsSum),
        })}
      </p>
    </div>
  );
}
