import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Banknote,
  CalendarRange,
  Download,
  PiggyBank,
  Receipt,
  RotateCcw,
  Wallet,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PaymentStatus, PaymentView } from '@abcp/shared-types';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { CurrencyText, DataTable, DateTimeText, FilterBar, Pagination } from '@/components/shared';
import { DateField } from '@/components/shared/DateField';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useBranches } from '@/features/branches/branches.api';
import { downloadCsv } from '@/features/reports/lib/csv';
import { formatCompactNumber, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui.store';

import { financeApi, useFinanceSummary, usePayments, type FinanceFilters } from './finance.api';
import { FinanceStatCard } from './FinanceStatCard';
import { CollectionHealthCard } from './CollectionHealthCard';
import {
  PAYMENT_STATUSES,
  PAYMENT_STATUS_VARIANT,
  buildLedgerInsights,
  paymentMethodKey,
  paymentMethodsOf,
  paymentStatusKey,
} from './finance.lib';
import { PaymentDetailSheet } from './PaymentDetailSheet';
import { METHOD_COLOR, METHOD_ICON } from './finance.methods';
import { PaymentMethodBreakdown } from './PaymentMethodBreakdown';
import { RecentPaymentsFeed } from './RecentPaymentsFeed';
import { RevenueTrendCard } from './RevenueTrendCard';

/**
 * Upper bound on bills the overview (trend chart, status split, aging) derives
 * from in one fetch — the summary endpoint only returns totals. The table below
 * stays server-paginated; when a range exceeds this the trend card says so.
 */
const LEDGER_LIMIT = 1000;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const TODAY = isoDaysAgo(0);

type RangeKey = '7d' | '30d' | '90d' | 'today';

const RANGE_PRESETS: Record<RangeKey, () => string> = {
  today: () => TODAY,
  '7d': () => isoDaysAgo(7),
  '30d': () => isoDaysAgo(30),
  '90d': () => isoDaysAgo(90),
};

export function FinancePage() {
  const { t } = useTranslation();
  const { data: branches = [] } = useBranches();
  const activeBranch = useUiStore((s) => s.activeBranchId);

  const [branchId, setBranchId] = useState<string | 'all'>(activeBranch);
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(TODAY);
  const [activeRange, setActiveRange] = useState<RangeKey | null>('30d');
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detailId, setDetailId] = useState<string | null>(null);

  const filters: FinanceFilters = {
    branchId,
    from,
    to,
    status: status || undefined,
    q,
    page,
    pageSize,
  };

  const summaryQ = useFinanceSummary({ branchId, from, to });
  const listQ = usePayments(filters);
  const ledgerQ = usePayments({ branchId, from, to, page: 1, pageSize: LEDGER_LIMIT });
  const ledger = ledgerQ.data;
  const insights = useMemo(() => buildLedgerInsights(ledger?.items ?? [], from, to), [ledger, from, to]);
  const ledgerTruncated = (ledger?.total ?? 0) > LEDGER_LIMIT;
  const summary = summaryQ.data;
  const avgTicket = summary && summary.paymentCount > 0 ? summary.grossRevenue / summary.paymentCount : 0;
  const owingBills = (insights.statusCounts.PENDING ?? 0) + (insights.statusCounts.DEPOSIT_PAID ?? 0);
  const maxTotal = (listQ.data?.items ?? []).reduce((m, p) => Math.max(m, p.totalAmount), 0);
  const currency = 'LAK' as const;

  function applyRange(key: RangeKey) {
    setFrom(RANGE_PRESETS[key]());
    setTo(TODAY);
    setActiveRange(key);
    setPage(1);
  }

  const columns = useMemo<ColumnDef<PaymentView, unknown>[]>(
    () => [
      {
        header: t('finance.col.customer'),
        accessorKey: 'customerName',
        cell: ({ row }) => {
          const name = row.original.customerName ?? t('finance.recent.walkIn');
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <PersonAvatar name={name} size={32} />
              <div className="min-w-0">
                <p className="truncate font-medium">{name}</p>
                <p className="truncate text-xs text-muted-foreground">{row.original.branchName}</p>
              </div>
            </div>
          );
        },
      },
      {
        header: t('finance.col.total'),
        accessorKey: 'totalAmount',
        meta: { align: 'right' },
        cell: ({ getValue }) => {
          const amount = getValue() as number;
          const ratio = maxTotal > 0 ? amount / maxTotal : 0;
          return (
            <div className="inline-flex w-full flex-col items-end gap-1">
              <CurrencyText amount={amount} className="font-medium" />
              <span className="h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span
                  className="block h-full rounded-full bg-primary/60 transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </span>
            </div>
          );
        },
      },
      {
        header: t('finance.col.paid'),
        accessorKey: 'paidAmount',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const { paidAmount, totalAmount } = row.original;
          const pct = totalAmount > 0 ? Math.min(100, Math.round((paidAmount / totalAmount) * 100)) : 0;
          return (
            <div className="inline-flex w-full flex-col items-end gap-1">
              <span className="inline-flex items-baseline gap-1.5">
                <CurrencyText amount={paidAmount} />
                <span
                  className={cn(
                    'text-2xs tabular-nums',
                    pct >= 100 ? 'text-success' : pct > 0 ? 'text-info' : 'text-muted-foreground',
                  )}
                >
                  {pct}%
                </span>
              </span>
              <span className="h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span
                  className={cn(
                    'block h-full rounded-full transition-[width] duration-500 ease-out',
                    pct >= 100 ? 'bg-success' : 'bg-info',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </span>
            </div>
          );
        },
      },
      {
        header: t('finance.col.methods'),
        id: 'methods',
        cell: ({ row }) => {
          const methods = paymentMethodsOf(row.original);
          if (methods.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <div className="flex items-center gap-1">
              {methods.map((m) => {
                const Icon = METHOD_ICON[m];
                return (
                  <Tooltip key={m}>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-md bg-muted',
                          METHOD_COLOR[m].text,
                        )}
                        aria-label={t(paymentMethodKey(m))}
                        role="img"
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{t(paymentMethodKey(m))}</TooltipContent>
                  </Tooltip>
                );
              })}
              {methods.length > 1 ? (
                <span className="ml-0.5 text-2xs text-muted-foreground">{t('finance.split')}</span>
              ) : null}
            </div>
          );
        },
      },
      {
        header: t('finance.col.balance'),
        accessorKey: 'balanceAmount',
        meta: { align: 'right' },
        cell: ({ getValue }) => {
          const amount = getValue() as number;
          return amount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-soft px-2 py-0.5 text-warning">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />
              <CurrencyText amount={amount} className="font-semibold" />
            </span>
          ) : (
            <span className="text-muted-foreground">
              <CurrencyText amount={0} />
            </span>
          );
        },
      },
      {
        header: t('finance.col.status'),
        accessorKey: 'paymentStatus',
        cell: ({ getValue }) => {
          const s = getValue() as PaymentStatus;
          return <Badge variant={PAYMENT_STATUS_VARIANT[s]}>{t(paymentStatusKey(s))}</Badge>;
        },
      },
      {
        header: t('finance.col.date'),
        accessorKey: 'createdAt',
        cell: ({ getValue }) => (
          <DateTimeText value={getValue() as string} className="text-xs text-muted-foreground" />
        ),
      },
    ],
    [t, maxTotal],
  );

  async function handleExport() {
    const all = await financeApi.list({ ...filters, page: 1, pageSize: 1000 });
    downloadCsv(`payments-${from}_${to}`, [
      [t('finance.title')],
      [t('finance.filter.period'), `${formatDate(from)} – ${formatDate(to)}`],
      [],
      [
        t('finance.col.customer'),
        t('finance.col.branch'),
        t('finance.col.total'),
        t('finance.col.paid'),
        t('finance.col.balance'),
        t('finance.col.methods'),
        t('finance.col.status'),
        t('finance.col.date'),
      ],
      ...all.items.map((p) => [
        p.customerName ?? '',
        p.branchName,
        p.totalAmount,
        p.paidAmount,
        p.balanceAmount,
        paymentMethodsOf(p).map((m) => t(paymentMethodKey(m))).join(' + '),
        t(paymentStatusKey(p.paymentStatus)),
        formatDate(p.createdAt),
      ]),
    ]);
  }

  const branchOptions = [
    { value: 'all', label: t('branch.all') },
    ...branches.map((b) => ({ value: b.id, label: b.name })),
  ];
  const statusOptions = [
    { value: '', label: t('finance.filter.allStatuses') },
    ...PAYMENT_STATUSES.map((s) => ({ value: s, label: t(paymentStatusKey(s)) })),
  ];
  const hasActiveFilters = branchId !== 'all' || Boolean(status) || Boolean(q);
  const selectStatus = (next: PaymentStatus | '') => {
    setStatus(next);
    setPage(1);
  };
  const periodLabel = `${formatDate(from)} – ${formatDate(to)}`;
  const clearFilters = () => {
    setBranchId('all');
    setStatus('');
    setQ('');
    setPage(1);
  };

  return (
    <TooltipProvider delayDuration={150}>
    <div className="space-y-4">
      <StickyPageHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
              {t('finance.title')}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('finance.subtitle')}</p>
          </div>
          <Button variant="secondary" onClick={handleExport} disabled={(listQ.data?.total ?? 0) === 0}>
            <Download className="mr-1 h-4 w-4" aria-hidden="true" />
            {t('common.export')}
          </Button>
        </div>
      </StickyPageHeader>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
              <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            {t('finance.filter.period')}
          </span>
          <div role="group" aria-label={t('finance.filter.period')} className="inline-flex rounded-full bg-muted p-0.5">
            {(Object.keys(RANGE_PRESETS) as RangeKey[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={activeRange === key}
                onClick={() => applyRange(key)}
                className={cn(
                  'min-h-7 rounded-full px-3 text-xs font-medium transition-[background-color,color,box-shadow] duration-150 ease-out',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  activeRange === key
                    ? 'bg-card text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`finance.range.${key}`)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <DateField
              value={from}
              onChange={(v) => {
                setFrom(v);
                setActiveRange(null);
                setPage(1);
              }}
              aria-label={t('finance.filter.from')}
            />
            <span className="text-xs text-muted-foreground">–</span>
            <DateField
              value={to}
              onChange={(v) => {
                setTo(v);
                setActiveRange(null);
                setPage(1);
              }}
              aria-label={t('finance.filter.to')}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            className="h-8 w-[160px]"
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setPage(1);
            }}
            options={branchOptions}
            aria-label={t('finance.col.branch')}
          />
          <span className="hidden text-2xs tabular-nums text-muted-foreground md:inline">{periodLabel}</span>
        </div>
      </div>

      {summaryQ.isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[62px] w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <FinanceStatCard
            index={0}
            icon={Banknote}
            tone="primary"
            label={t('finance.kpi.gross')}
            value={<CurrencyText amount={summary?.grossRevenue ?? 0} currency={currency} />}
            hint={t('finance.kpi.grossRate', { rate: insights.collectionRate })}
          />
          <FinanceStatCard
            index={1}
            icon={PiggyBank}
            tone="success"
            label={t('finance.kpi.deposits')}
            value={<CurrencyText amount={summary?.depositsCollected ?? 0} currency={currency} />}
            hint={t('finance.kpi.depositsCount', { count: insights.statusCounts.DEPOSIT_PAID })}
            onClick={() => selectStatus(status === 'DEPOSIT_PAID' ? '' : 'DEPOSIT_PAID')}
            active={status === 'DEPOSIT_PAID'}
          />
          <FinanceStatCard
            index={2}
            icon={Wallet}
            tone="warning"
            label={t('finance.kpi.outstanding')}
            value={<CurrencyText amount={summary?.outstandingBalance ?? 0} currency={currency} />}
            hint={t('finance.kpi.outstandingCount', { count: owingBills })}
            pulse={(summary?.outstandingBalance ?? 0) > 0}
            onClick={() => selectStatus(status === 'PENDING' ? '' : 'PENDING')}
            active={status === 'PENDING'}
          />
          <FinanceStatCard
            index={3}
            icon={RotateCcw}
            tone="danger"
            label={t('finance.kpi.refunded')}
            value={<CurrencyText amount={summary?.refunded ?? 0} currency={currency} />}
            hint={t('finance.kpi.refundedCount', { count: insights.statusCounts.REFUNDED })}
            onClick={() => selectStatus(status === 'REFUNDED' ? '' : 'REFUNDED')}
            active={status === 'REFUNDED'}
          />
          <FinanceStatCard
            index={4}
            icon={Receipt}
            tone="neutral"
            label={t('finance.kpi.payments')}
            value={summary?.paymentCount ?? 0}
            hint={t('finance.kpi.avgTicket', { amount: formatCompactNumber(avgTicket) })}
          />
        </div>
      )}

      <div className="grid items-stretch gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RevenueTrendCard insights={insights} loading={ledgerQ.isLoading} truncated={ledgerTruncated} />
        </div>
        <CollectionHealthCard
          insights={insights}
          loading={ledgerQ.isLoading}
          activeStatus={status}
          onStatusSelect={selectStatus}
        />
      </div>

      <div className="grid items-stretch gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PaymentMethodBreakdown rows={summary?.byMethod ?? []} loading={summaryQ.isLoading} />
        </div>
        <RecentPaymentsFeed
          payments={ledger?.items.slice(0, 5) ?? []}
          loading={ledgerQ.isLoading}
          onSelect={(p) => setDetailId(p.id)}
        />
      </div>

      <FilterBar
        search={q}
        onSearchChange={(v) => {
          setQ(v);
          setPage(1);
        }}
        searchPlaceholder={t('finance.searchPlaceholder')}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
      >
        <Select
          className="h-9 w-[160px]"
          value={status}
          onChange={(e) => selectStatus(e.target.value as PaymentStatus | '')}
          options={statusOptions}
          aria-label={t('finance.col.status')}
        />
      </FilterBar>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Receipt className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{t('finance.tableTitle')}</h2>
            <span className="text-xs text-muted-foreground">
              {t('finance.showing', { shown: listQ.data?.items.length ?? 0, total: listQ.data?.total ?? 0 })}
            </span>
          </div>
          {status ? (
            <button
              type="button"
              onClick={() => selectStatus('')}
              aria-label={t('finance.clearStatusAria', { status: t(paymentStatusKey(status)) })}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Badge variant={PAYMENT_STATUS_VARIANT[status]} className="gap-1">
                {t(paymentStatusKey(status))}
                <X className="h-3 w-3" aria-hidden="true" />
              </Badge>
            </button>
          ) : null}
        </div>
        <div className="p-2 sm:p-3">
          <DataTable
            columns={columns}
            data={listQ.data?.items ?? []}
            loading={listQ.isLoading}
            getRowId={(r) => r.id}
            onRowClick={(r) => setDetailId(r.id)}
            emptyTitle={hasActiveFilters ? t('finance.emptyFiltered') : t('finance.empty')}
            emptyDescription={hasActiveFilters ? undefined : t('finance.emptyHint')}
            emptyAction={
              hasActiveFilters ? (
                <Button size="sm" variant="secondary" onClick={clearFilters}>
                  {t('finance.clearFilters')}
                </Button>
              ) : null
            }
          />
        </div>
        <div className="border-t border-border px-4 py-3">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={listQ.data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </div>
      </div>

      <PaymentDetailSheet paymentId={detailId} onClose={() => setDetailId(null)} />
    </div>
    </TooltipProvider>
  );
}
