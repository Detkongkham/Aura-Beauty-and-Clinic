import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Banknote,
  Download,
  Pencil,
  Share2,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AffiliateView } from '@abcp/shared-types';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import {
  CurrencyText,
  DataTable,
  DateTimeText,
  FilterBar,
  Pagination,
} from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/useAuth';
import { downloadCsv } from '@/features/reports/lib/csv';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { CommissionFlowCard } from './CommissionFlowCard';
import { EnrollDialog, RateDialog, RemovePartnerDialog } from './ReferralDialogs';
import { PartnerLeaderboard } from './PartnerLeaderboard';
import { PayoutsSheet } from './PayoutsSheet';
import { ReferralStatCard } from './ReferralStatCard';
import { useAffiliates } from './referrals.api';

/**
 * Upper bound on the partner roster this page holds in memory. The affiliate list
 * endpoint has no sort/filter params beyond `q`, so rate banding, sorting and the
 * summary layer (stat tiles, commission split, leaderboard) are all derived from a
 * single fetch and paginated client-side — honest across the whole roster instead
 * of per server page. Same trade-off as the Appointments page; revisit with a
 * server-side sort once a clinic passes this many partners.
 */
const ROSTER_LIMIT = 200;

type SortKey = 'unpaid' | 'earnings' | 'referred' | 'rate' | 'name' | 'newest';
type RateBand = 'all' | 'low' | 'mid' | 'high';

const BAND_TEST: Record<RateBand, (rate: number) => boolean> = {
  all: () => true,
  low: (r) => r < 0.1,
  mid: (r) => r >= 0.1 && r < 0.2,
  high: (r) => r >= 0.2,
};

/** Rate badge tone — a visual band, never the only signal (the % is always spelled out). */
function rateVariant(rate: number): 'neutral' | 'primary' | 'accent' {
  if (rate >= 0.2) return 'accent';
  if (rate >= 0.1) return 'primary';
  return 'neutral';
}

export function ReferralsPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('finance:manage');

  const [q, setQ] = useState('');
  const [owingOnly, setOwingOnly] = useState(false);
  const [band, setBand] = useState<RateBand>('all');
  const [sort, setSort] = useState<SortKey>('unpaid');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [enrolling, setEnrolling] = useState(false);
  const [editing, setEditing] = useState<AffiliateView | null>(null);
  const [payoutsFor, setPayoutsFor] = useState<AffiliateView | null>(null);
  const [deleting, setDeleting] = useState<AffiliateView | null>(null);

  const { data, isLoading } = useAffiliates({ q: q || undefined, page: 1, pageSize: ROSTER_LIMIT });
  const roster = useMemo(() => data?.items ?? [], [data]);

  const filtered = useMemo(() => {
    const rows = roster.filter(
      (a) => BAND_TEST[band](a.commissionRate) && (!owingOnly || a.unpaidBalance > 0),
    );
    const sorters: Record<SortKey, (a: AffiliateView, b: AffiliateView) => number> = {
      unpaid: (a, b) => b.unpaidBalance - a.unpaidBalance,
      earnings: (a, b) => b.totalEarnings - a.totalEarnings,
      referred: (a, b) => b.referredCount - a.referredCount,
      rate: (a, b) => b.commissionRate - a.commissionRate,
      name: (a, b) => a.userName.localeCompare(b.userName),
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    };
    return [...rows].sort(sorters[sort]);
  }, [roster, band, owingOnly, sort]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, a) => {
          acc.earnings += a.totalEarnings;
          acc.unpaid += a.unpaidBalance;
          acc.referred += a.referredCount;
          acc.rateSum += a.commissionRate;
          if (a.unpaidBalance > 0) acc.owingPartners += 1;
          return acc;
        },
        { earnings: 0, unpaid: 0, referred: 0, rateSum: 0, owingPartners: 0 },
      ),
    [filtered],
  );
  const paidOut = Math.max(0, totals.earnings - totals.unpaid);
  const avgRate = filtered.length > 0 ? Math.round((totals.rateSum / filtered.length) * 100) : 0;
  const maxReferred = filtered.reduce((m, a) => Math.max(m, a.referredCount), 0);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const hasActiveFilters = Boolean(q) || owingOnly || band !== 'all' || sort !== 'unpaid';

  function exportCsv() {
    downloadCsv(`referrals-${formatDate(new Date()).replace(/\//g, '-')}`, [
      [
        t('referrals.col.partner'),
        t('referrals.col.phone'),
        t('referrals.col.rate'),
        t('referrals.col.referred'),
        t('referrals.col.earnings'),
        t('referrals.col.paidOut'),
        t('referrals.col.unpaid'),
        t('referrals.col.joined'),
      ],
      ...filtered.map((a) => [
        a.userName,
        a.userPhone,
        `${Math.round(a.commissionRate * 100)}%`,
        a.referredCount,
        a.totalEarnings,
        Math.max(0, a.totalEarnings - a.unpaidBalance),
        a.unpaidBalance,
        formatDate(a.createdAt),
      ]),
    ]);
  }

  const columns = useMemo<ColumnDef<AffiliateView, unknown>[]>(
    () => [
      {
        header: t('referrals.col.partner'),
        accessorKey: 'userName',
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <PersonAvatar name={row.original.userName} size={32} />
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.userName}</div>
              <div className="truncate text-xs tabular-nums text-muted-foreground">
                {row.original.userPhone}
              </div>
            </div>
          </div>
        ),
      },
      {
        header: t('referrals.col.rate'),
        accessorKey: 'commissionRate',
        cell: ({ getValue }) => {
          const rate = getValue() as number;
          return (
            <Badge variant={rateVariant(rate)}>{t('referrals.ratePct', { rate: Math.round(rate * 100) })}</Badge>
          );
        },
      },
      {
        header: t('referrals.col.referred'),
        accessorKey: 'referredCount',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const n = row.original.referredCount;
          const ratio = maxReferred > 0 ? n / maxReferred : 0;
          return (
            <div className="inline-flex w-full flex-col items-end gap-1">
              <span className="tabular-nums">{n.toLocaleString()}</span>
              <span className="h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span
                  className={cn(
                    'block h-full rounded-full transition-[width] duration-500 ease-out',
                    n > 0 ? 'bg-primary' : 'bg-transparent',
                  )}
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </span>
            </div>
          );
        },
      },
      {
        header: t('referrals.col.earnings'),
        accessorKey: 'totalEarnings',
        meta: { align: 'right' },
        cell: ({ getValue }) => <CurrencyText amount={getValue() as number} />,
      },
      {
        header: t('referrals.col.paidOut'),
        id: 'paidOut',
        accessorFn: (a) => Math.max(0, a.totalEarnings - a.unpaidBalance),
        meta: { align: 'right' },
        cell: ({ getValue }) => (
          <CurrencyText amount={getValue() as number} className="text-muted-foreground" />
        ),
      },
      {
        header: t('referrals.col.unpaid'),
        accessorKey: 'unpaidBalance',
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
        header: t('referrals.col.joined'),
        accessorKey: 'createdAt',
        cell: ({ getValue }) => (
          <DateTimeText value={getValue() as string} className="text-xs text-muted-foreground" />
        ),
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) => {
          if (!canManage) return null;
          return (
            <div className="flex justify-end gap-1">
              <Button
                variant="secondary"
                size="sm"
                className="h-7 gap-1 px-2 text-xs border-primary/25 bg-primary/5 text-primary hover:border-primary/40 hover:bg-primary/10"
                onClick={(e) => {
                  e.stopPropagation();
                  setPayoutsFor(row.original);
                }}
              >
                <Wallet className="h-3 w-3" aria-hidden="true" />
                {t('referrals.payouts')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(row.original);
                }}
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
                {t('common.edit')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:bg-destructive-soft"
                aria-label={t('referrals.removeAria', { name: row.original.userName })}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleting(row.original);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          );
        },
      },
    ],
    [t, canManage, maxReferred],
  );

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
              {t('nav.referrals')}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('referrals.subtitle')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('common.export')}
            </Button>
            {canManage ? (
              <Button onClick={() => setEnrolling(true)}>
                <UserPlus className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('referrals.enroll')}
              </Button>
            ) : null}
          </div>
        </div>
      </StickyPageHeader>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[62px] w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <ReferralStatCard
            index={0}
            icon={Users}
            tone="primary"
            label={t('referrals.stat.partners')}
            value={filtered.length}
            hint={t('referrals.stat.avgRate', { rate: avgRate })}
          />
          <ReferralStatCard
            index={1}
            icon={Share2}
            tone="info"
            label={t('referrals.stat.referred')}
            value={totals.referred}
            hint={t('referrals.stat.referredHint')}
          />
          <ReferralStatCard
            index={2}
            icon={TrendingUp}
            tone="accent"
            label={t('referrals.stat.earnings')}
            value={<CurrencyText amount={totals.earnings} />}
            hint={t('referrals.stat.earningsHint')}
          />
          <ReferralStatCard
            index={3}
            icon={Banknote}
            tone="success"
            label={t('referrals.stat.paidOut')}
            value={<CurrencyText amount={paidOut} />}
            hint={t('referrals.stat.paidOutHint')}
          />
          <ReferralStatCard
            index={4}
            icon={Wallet}
            tone="warning"
            label={t('referrals.stat.unpaid')}
            value={<CurrencyText amount={totals.unpaid} />}
            hint={t('referrals.stat.unpaidHint', { count: totals.owingPartners })}
            onClick={() => {
              setOwingOnly((v) => !v);
              setPage(1);
            }}
            active={owingOnly}
          />
        </div>
      )}

      <div className="grid items-stretch gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CommissionFlowCard
            loading={isLoading}
            paidOut={paidOut}
            owing={totals.unpaid}
            owingPartners={totals.owingPartners}
            partners={filtered}
          />
        </div>
        <PartnerLeaderboard
          loading={isLoading}
          partners={filtered}
          onSelect={canManage ? (p) => setPayoutsFor(p) : undefined}
        />
      </div>

      <FilterBar
        search={q}
        onSearchChange={(v) => {
          setQ(v);
          setPage(1);
        }}
        searchPlaceholder={t('referrals.searchPlaceholder')}
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setQ('');
          setOwingOnly(false);
          setBand('all');
          setSort('unpaid');
          setPage(1);
        }}
      >
        <Select
          className="h-9 w-[150px]"
          value={band}
          onChange={(e) => {
            setBand(e.target.value as RateBand);
            setPage(1);
          }}
          options={[
            { value: 'all', label: t('referrals.band.all') },
            { value: 'low', label: t('referrals.band.low') },
            { value: 'mid', label: t('referrals.band.mid') },
            { value: 'high', label: t('referrals.band.high') },
          ]}
          aria-label={t('referrals.col.rate')}
        />
        <Select
          className="h-9 w-[180px]"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as SortKey);
            setPage(1);
          }}
          options={[
            { value: 'unpaid', label: t('referrals.sort.unpaid') },
            { value: 'earnings', label: t('referrals.sort.earnings') },
            { value: 'referred', label: t('referrals.sort.referred') },
            { value: 'rate', label: t('referrals.sort.rate') },
            { value: 'name', label: t('referrals.sort.name') },
            { value: 'newest', label: t('referrals.sort.newest') },
          ]}
          aria-label={t('referrals.sort.label')}
        />
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-sm border border-input px-3 text-sm">
          <input
            type="checkbox"
            checked={owingOnly}
            onChange={(e) => {
              setOwingOnly(e.target.checked);
              setPage(1);
            }}
          />
          {t('referrals.filter.owingOnly')}
        </label>
      </FilterBar>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{t('referrals.tableTitle')}</h2>
            <span className="text-xs text-muted-foreground">
              {t('referrals.showing', { shown: pageRows.length, total: filtered.length })}
            </span>
          </div>
          {owingOnly ? (
            <Badge variant="warning">{t('referrals.filter.owingOnly')}</Badge>
          ) : null}
        </div>
        <div className="p-2 sm:p-3">
          <DataTable
            columns={columns}
            data={pageRows}
            loading={isLoading}
            getRowId={(r) => r.id}
            onRowClick={canManage ? (r) => setPayoutsFor(r) : undefined}
            emptyTitle={t('referrals.empty')}
            emptyDescription={t('referrals.emptyHint')}
            emptyAction={
              canManage ? (
                <Button size="sm" onClick={() => setEnrolling(true)}>
                  <UserPlus className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t('referrals.enroll')}
                </Button>
              ) : undefined
            }
          />
        </div>
        <div className="border-t border-border px-4 py-3">
          <Pagination
            page={safePage}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </div>
      </div>

      <EnrollDialog open={enrolling} onClose={() => setEnrolling(false)} />
      <RateDialog affiliate={editing} onClose={() => setEditing(null)} />
      <RemovePartnerDialog affiliate={deleting} onClose={() => setDeleting(null)} />
      <PayoutsSheet
        affiliate={payoutsFor}
        onClose={() => setPayoutsFor(null)}
        canManage={canManage}
      />
    </div>
  );
}
