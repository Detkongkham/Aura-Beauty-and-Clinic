import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { useBranches } from '@/features/branches/branches.api';
import { useDashboardStats } from '@/features/dashboard/dashboard.api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui.store';

import { CustomReportTab } from './components/CustomReportTab';
import { OverviewReport } from './components/OverviewReport';
import { PrintHeader } from './components/PrintHeader';
import { ReportMetaBar } from './components/ReportMetaBar';
import { ReportsToolbar, type RangeDays } from './components/ReportsToolbar';
import { StandardReportsTab } from './components/StandardReportsTab';
import { downloadCsv } from './lib/csv';

type TabId = 'overview' | 'standard' | 'custom';

/** Reports hub — executive overview, canned reports, and a custom builder.
 *  (Kept the `EndOfDayPage` export name; the router lazy-loads it by that key.) */
export function EndOfDayPage() {
  const { t } = useTranslation();
  const { data: branches = [] } = useBranches();
  const activeBranch = useUiStore((s) => s.activeBranchId);

  const [tab, setTab] = useState<TabId>('overview');
  const [range, setRange] = useState<RangeDays>(14);
  const [branchId, setBranchId] = useState(activeBranch);

  const { data, isError, refetch } = useDashboardStats(branchId);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'overview', label: t('reports.tab.overview') },
    { id: 'standard', label: t('reports.tab.standard') },
    { id: 'custom', label: t('reports.tab.custom') },
  ];
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onTabKey = (e: KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = e.key === 'ArrowRight' ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
    setTab(tabs[next]!.id);
    tabRefs.current[next]?.focus();
  };

  const branchName =
    branchId === 'all'
      ? t('branch.all')
      : (branches.find((b) => b.id === branchId)?.name ?? t('branch.all'));

  const series = useMemo(() => (data ? data.revenueSeries.slice(-range) : []), [data, range]);
  const prevSeries = useMemo(
    () =>
      data && range * 2 <= data.revenueSeries.length
        ? data.revenueSeries.slice(-range * 2, -range)
        : [],
    [data, range],
  );

  const rangeFrom = series[0]?.date ?? data?.range.from ?? '';
  const rangeTo = series[series.length - 1]?.date ?? data?.range.to ?? '';
  const reportNo = `RPT-${(rangeTo || '').replace(/-/g, '')}-${
    branchId === 'all' ? 'ALL' : branchId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase()
  }`;

  function handleExport() {
    if (!data) return;
    const revenueSum = series.reduce((s, d) => s + d.revenue, 0);
    const bookingsSum = series.reduce((s, d) => s + d.bookings, 0);
    const sb = new Map(data.statusBreakdown.map((d) => [d.status, d.count]));
    const completed = sb.get('COMPLETED') ?? 0;
    const cancelled = (sb.get('CANCELLED') ?? 0) + (sb.get('NO_SHOW') ?? 0);
    const completionRate =
      completed + cancelled > 0 ? Math.round((completed / (completed + cancelled)) * 100) : 0;

    downloadCsv(`${reportNo}`, [
      [t('reports.businessName'), t('reports.title')],
      [t('reports.meta.no'), reportNo],
      [t('reports.meta.period'), `${formatDate(rangeFrom)} – ${formatDate(rangeTo)}`],
      [t('reports.branch'), branchName],
      [],
      [t('reports.metric'), t('reports.value')],
      [t('reports.kpi.revenue'), revenueSum],
      [t('reports.kpi.bookings'), bookingsSum],
      [t('reports.kpi.avgTicket'), data.avgTicket14d],
      [t('reports.kpi.completed'), completed],
      [t('reports.kpi.cancellations'), cancelled],
      [t('reports.kpi.completionRate'), `${completionRate}%`],
      [t('reports.kpi.deposits'), data.depositsToday],
      [t('reports.kpi.vip'), data.vipCustomers],
      [],
      [t('reports.col.date'), t('reports.col.bookings'), t('reports.col.revenue')],
      ...series.map((d) => [d.date, d.bookings, d.revenue]),
      [],
      [t('reports.col.service'), t('reports.col.count')],
      ...data.serviceMix.map((s) => [s.name, s.value]),
      [],
      [t('reports.col.staff'), t('reports.col.completed'), t('reports.col.revenue')],
      ...data.staffLeaderboard.map((s) => [s.name, s.completed, s.revenue]),
      [],
      [t('reports.col.branch'), t('reports.col.bookings'), t('reports.col.revenue')],
      ...data.branchPerformance.map((b) => [b.name, b.bookings, b.revenue]),
    ]);
  }

  if (isError) {
    return (
      <div className="space-y-5">
        <StickyPageHeader>
          <div>
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
              {t('reports.title')}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('reports.subtitle')}</p>
          </div>
        </StickyPageHeader>
        <EmptyState
          title={t('reports.loadError')}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              {t('reports.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
            {t('reports.title')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('reports.subtitle')}</p>
        </div>

        {/* Tab rail — segmented pills, hidden on paper */}
        <div
          role="tablist"
          aria-label={t('reports.title')}
          className="mt-4 inline-flex rounded-xl border border-border bg-card p-0.5 print:hidden"
        >
          {tabs.map((tb, i) => (
            <button
              key={tb.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              role="tab"
              type="button"
              id={`report-tab-${tb.id}`}
              aria-controls={`report-panel-${tb.id}`}
              aria-selected={tab === tb.id}
              tabIndex={tab === tb.id ? 0 : -1}
              onClick={() => setTab(tb.id)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                tab === tb.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tb.label}
            </button>
          ))}
        </div>
      </StickyPageHeader>

      <ReportsToolbar
        range={range}
        onRangeChange={setRange}
        branchId={branchId}
        onBranchChange={setBranchId}
        branches={branches}
        onPrint={() => window.print()}
        onExport={handleExport}
      />

      <ReportMetaBar reportNo={reportNo} branchName={branchName} from={rangeFrom} to={rangeTo} />
      <PrintHeader branchName={branchName} from={rangeFrom} to={rangeTo} />

      {tab === 'overview' ? (
        <div role="tabpanel" id="report-panel-overview" aria-labelledby="report-tab-overview">
          <OverviewReport data={data} series={series} prevSeries={prevSeries} rangeDays={range} />
        </div>
      ) : null}

      {tab === 'standard' ? (
        <div role="tabpanel" id="report-panel-standard" aria-labelledby="report-tab-standard">
          <StandardReportsTab branchId={branchId} branchName={branchName} stats={data} />
        </div>
      ) : null}

      {tab === 'custom' ? (
        <div role="tabpanel" id="report-panel-custom" aria-labelledby="report-tab-custom">
          <CustomReportTab stats={data} branchName={branchName} />
        </div>
      ) : null}
    </div>
  );
}
