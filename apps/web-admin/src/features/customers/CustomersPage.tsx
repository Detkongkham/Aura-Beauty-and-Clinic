import type { ColumnDef } from '@tanstack/react-table';
import {
  CircleDollarSign,
  Gem,
  RefreshCw,
  Repeat,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { DataTable } from '@/components/shared/DataTable';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { Pagination } from '@/components/shared/Pagination';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { dayjs, EN_DASH, formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import type { Customer } from '@/types/models';

import { CustomerGrowthChart } from './CustomerGrowthChart';
import { CustomerStatCard } from './CustomerStatCard';
import { CustomerTierChart, type TierCounts } from './CustomerTierChart';
import { CustomerValueChart } from './CustomerValueChart';
import { useCustomers } from './customers.api';
import { TIER_COLOR, TIER_ORDER } from './tierMeta';

const TIER_VARIANT: Record<string, 'neutral' | 'accent' | 'warning' | 'info'> = {
  SILVER: 'neutral',
  GOLD: 'accent',
  PLATINUM: 'info',
};

const TIERS = ['SILVER', 'GOLD', 'PLATINUM'] as const;

export function CustomersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const pagination = usePagination();

  const { data, isLoading, isError, refetch, isFetching } = useCustomers({
    q: debouncedSearch || undefined,
    tier: tier || undefined,
    page: pagination.page,
    pageSize: pagination.pageSize,
  });

  // Overview figures are aggregated client-side over a wide, unfiltered page for
  // now — move to a server-side count/group-by when the admin `/customers`
  // summary endpoint lands (same debt as StaffPage / the appointments money layer).
  const { data: summary, isLoading: summaryLoading } = useCustomers({
    page: 1,
    pageSize: 500,
  });

  const stats = useMemo(() => {
    const items = summary?.items ?? [];
    const total = summary?.total ?? items.length;
    const startOfMonth = dayjs().startOf('month');
    const newThisMonth = items.filter((c) => dayjs(c.createdAt).isAfter(startOfMonth)).length;
    const vip = items.filter((c) => c.loyaltyTier === 'GOLD' || c.loyaltyTier === 'PLATINUM').length;
    const returning = items.filter((c) => c.totalVisits >= 2).length;
    const spendSum = items.reduce((n, c) => n + c.totalSpent, 0);
    const topSpend = items.reduce((n, c) => Math.max(n, c.totalSpent), 0);
    const counts = Object.fromEntries(
      TIER_ORDER.map((key) => [
        key,
        items.filter((c) => (c.loyaltyTier ?? 'NONE') === key).length,
      ]),
    ) as TierCounts;

    // Lifetime spend + headcount booked by each tier (drives CustomerValueChart).
    const tierValue = TIER_ORDER.map((key) => {
      const group = items.filter((c) => (c.loyaltyTier ?? 'NONE') === key);
      return {
        key,
        label: key === 'NONE' ? t('customers.noTier') : t(`customers.${key}`),
        color: TIER_COLOR[key],
        revenue: group.reduce((n, c) => n + c.totalSpent, 0),
        count: group.length,
      };
    });

    // New sign-ups per month across the trailing 12-month window.
    const growth = Array.from({ length: 12 }, (_, i) => {
      const m = dayjs().startOf('month').subtract(11 - i, 'month');
      return {
        month: m.toISOString(),
        label: m.format('MM/YY'),
        count: items.filter((c) => dayjs(c.createdAt).isSame(m, 'month')).length,
      };
    });

    return {
      total,
      newThisMonth,
      vip,
      vipPct: total ? Math.round((vip / total) * 100) : 0,
      returning,
      repeatPct: items.length ? Math.round((returning / items.length) * 100) : 0,
      avgSpend: items.length ? Math.round(spendSum / items.length) : 0,
      topSpend,
      counts,
      tierValue,
      growth,
    };
  }, [summary, t]);

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const maxSpent = useMemo(() => Math.max(1, ...items.map((c) => c.totalSpent)), [items]);
  const rowOffset = (pagination.page - 1) * pagination.pageSize;
  const hasFilters = Boolean(search || tier);

  const clearFilters = () => {
    setSearch('');
    setTier('');
  };

  const columns = useMemo<ColumnDef<Customer, unknown>[]>(
    () => [
      {
        id: 'index',
        header: t('customers.row'),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums text-xs text-muted-foreground">
            {rowOffset + row.index + 1}
          </span>
        ),
      },
      {
        accessorKey: 'name',
        header: t('customers.name'),
        cell: ({ row }) => (
          <div className="flex min-w-[180px] items-center gap-3">
            <PersonAvatar name={row.original.name} size={32} />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold leading-tight text-foreground">
                {row.original.name}
              </p>
              <p className="truncate text-[11px] leading-tight tabular-nums text-muted-foreground">
                {row.original.phone}
              </p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'loyaltyTier',
        header: t('customers.tier'),
        cell: (c) => {
          const v = c.getValue<string | null>();
          return v ? (
            <Badge variant={TIER_VARIANT[v] ?? 'neutral'} className="whitespace-nowrap">
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden="true" />
              {t(`customers.${v}`)}
            </Badge>
          ) : (
            <span className="text-muted-foreground/60">{EN_DASH}</span>
          );
        },
      },
      {
        accessorKey: 'totalVisits',
        header: t('customers.visits'),
        meta: { align: 'right' },
        cell: (c) => (
          <div className="text-right text-[13px] font-medium tabular-nums">
            {c.getValue<number>()}
          </div>
        ),
      },
      {
        accessorKey: 'totalSpent',
        header: t('customers.spent'),
        meta: { align: 'right' },
        cell: (c) => {
          const amount = c.getValue<number>();
          return (
            <div className="flex flex-col items-end gap-1">
              <CurrencyText amount={amount} className="text-[13px] font-medium" />
              <span className="h-1 w-24 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-primary/70"
                  style={{ width: `${Math.round((amount / maxSpent) * 100)}%` }}
                />
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'lastVisitAt',
        header: t('customers.lastVisit'),
        cell: (c) => {
          const v = c.getValue<string | null>();
          return v ? (
            <DateTimeText
              value={v}
              mode="relative"
              className="whitespace-nowrap text-[13px] text-muted-foreground"
            />
          ) : (
            <span className="text-[13px] text-muted-foreground/60">{t('customers.noHistory')}</span>
          );
        },
      },
    ],
    [t, rowOffset, maxSpent],
  );

  return (
    <div className="space-y-5">
      <StickyPageHeader>
        <div>
          <h1
            className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]"
            data-testid="text-page-title"
          >
            {t('nav.customers')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('customers.subtitle')}</p>
        </div>
      </StickyPageHeader>

      {/* Overview — summary tiles (full-width 4-up row) */}
      {summaryLoading ? (
        <div className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[74px] w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-4">
          <CustomerStatCard
            icon={Users}
            tone="primary"
            label={t('customers.total')}
            value={stats.total}
            hint={t('customers.newThisMonth', { count: stats.newThisMonth })}
            index={0}
          />
          <CustomerStatCard
            icon={Gem}
            tone="info"
            label={t('customers.vip')}
            value={stats.vip}
            hint={t('customers.pctOfAll', { pct: stats.vipPct })}
            index={1}
          />
          <CustomerStatCard
            icon={CircleDollarSign}
            tone="success"
            label={t('customers.avgSpend')}
            value={formatCurrency(stats.avgSpend)}
            hint={t('customers.topSpender', { value: formatCurrency(stats.topSpend) })}
            index={2}
          />
          <CustomerStatCard
            icon={Repeat}
            tone="neutral"
            label={t('customers.repeatRate')}
            value={`${stats.repeatPct}%`}
            hint={t('customers.returningCount', { count: stats.returning })}
            index={3}
          />
        </div>
      )}

      {/* Insights — tier mix (also the tier filter) · acquisition trend · revenue by tier */}
      <div className="grid gap-4 lg:grid-cols-3">
        <CustomerTierChart
          counts={stats.counts}
          loading={summaryLoading}
          activeTier={tier}
          onSelectTier={(next) => {
            setTier(next);
            pagination.setPage(1);
          }}
        />
        <CustomerGrowthChart data={stats.growth} loading={summaryLoading} />
        <CustomerValueChart data={stats.tierValue} loading={summaryLoading} />
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out motion-reduce:animate-none">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('customers.searchPlaceholder')}
                aria-label={t('customers.searchPlaceholder')}
                data-testid="input-search-customers"
                className="h-10 w-full rounded-lg border border-input bg-muted/40 pl-10 pr-3 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
            {tier ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary animate-in fade-in slide-in-from-left-1 duration-200 motion-reduce:animate-none">
                {t(`customers.${tier}`)}
                <button
                  type="button"
                  onClick={() => setTier('')}
                  aria-label={t('customers.clear')}
                  className="-mr-1 rounded-full p-0.5 hover:bg-primary/20"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ) : null}
            {!isLoading && !isError ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {t('customers.count', { count: data?.total ?? 0 })}
              </span>
            ) : null}
            {hasFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground animate-in fade-in slide-in-from-left-1 duration-200 motion-reduce:animate-none"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                {t('customers.clear')}
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Select
              className="h-10 w-40 rounded-lg"
              value={tier}
              onChange={(e) => {
                setTier(e.target.value);
                pagination.setPage(1);
              }}
              placeholder={t('customers.allTiers')}
              aria-label={t('customers.tier')}
              options={TIERS.map((v) => ({ value: v, label: t(`customers.${v}`) }))}
            />
            <Button
              variant="secondary"
              size="sm"
              className="h-10 gap-2 rounded-lg"
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

        {isError ? (
          <div className="flex flex-col items-center gap-3 px-4 py-16 text-center" role="alert">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive-soft text-destructive">
              <RefreshCw className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm text-muted-foreground">{t('dashboard.loadError')}</p>
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              {t('common.reload')}
            </Button>
          </div>
        ) : (
          <>
            <DataTable
              columns={columns}
              data={items}
              loading={isLoading}
              getRowId={(r) => r.id}
              onRowClick={(r) => navigate(ROUTES.customerDetail(r.id))}
              emptyTitle={hasFilters ? t('customers.noMatch') : t('customers.empty')}
              emptyDescription={
                hasFilters ? t('customers.noMatchHint') : t('customers.emptyHint')
              }
              emptyAction={
                hasFilters ? (
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    {t('customers.clear')}
                  </Button>
                ) : undefined
              }
            />
            <div className="border-t border-border px-4 py-3">
              <Pagination
                page={pagination.page}
                pageSize={pagination.pageSize}
                total={data?.total ?? 0}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
