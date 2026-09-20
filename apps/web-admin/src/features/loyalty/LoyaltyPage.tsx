import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpCircle, Coins, Download, Gem, Gift, History, Sparkles, TrendingUp, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LoyaltyAccountView, LoyaltyTier } from '@abcp/shared-types';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { CurrencyText, DataTable, DateTimeText, FilterBar, Pagination } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/useAuth';
import { ReferralStatCard } from '@/features/referrals/ReferralStatCard';
import { downloadCsv } from '@/features/reports/lib/csv';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { MemberLeaderboard } from './MemberLeaderboard';
import { MemberLoyaltySheet } from './MemberLoyaltySheet';
import { TierMixCard } from './TierMixCard';
import { useLoyaltyAccounts } from './loyalty.api';
import {
  DORMANT_DAYS,
  NEAR_UPGRADE_POINTS,
  TIER_STYLE,
  TIERS,
  isDormant,
  isNearUpgrade,
  tierProgress,
} from './tiers';

/**
 * Upper bound on the member roster held in memory. Same trade-off as the Referrals
 * page (this page's template): the list endpoint only filters by `q`/tier, so sorting,
 * activity banding and the whole overview layer (stat tiles, tier mix, leaderboard)
 * are derived from one fetch and paginated client-side — honest across every member
 * rather than per server page. The backend batches ledger stats (4 queries total), and a
 * 2,000-member fetch measured ~30 ms locally. Past the cap the table header says so.
 */
const ROSTER_LIMIT = 2000;

type SortKey = 'points' | 'lifetime' | 'redeemed' | 'nearest' | 'recent' | 'name' | 'newest';
type Activity = 'all' | 'active' | 'dormant';

export function LoyaltyPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('finance:manage');

  const [q, setQ] = useState('');
  const [tier, setTier] = useState<LoyaltyTier | ''>('');
  const [activity, setActivity] = useState<Activity>('all');
  const [nearOnly, setNearOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('points');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const { data, isLoading } = useLoyaltyAccounts({ q: q || undefined, page: 1, pageSize: ROSTER_LIMIT });
  const roster = useMemo(() => data?.items ?? [], [data]);
  const truncated = (data?.total ?? 0) > roster.length;
  // Derived from the live roster so the sheet reflects an adjustment as soon as the list refetches.
  const openMember = openUserId ? (roster.find((m) => m.userId === openUserId) ?? null) : null;

  // Everything except the tier filter — feeds the tier mix so its proportions stay meaningful.
  const scoped = useMemo(() => {
    const now = Date.now();
    return roster.filter(
      (m) =>
        (activity === 'all' || (activity === 'dormant') === isDormant(m, now)) && (!nearOnly || isNearUpgrade(m)),
    );
  }, [roster, activity, nearOnly]);

  const filtered = useMemo(() => {
    const rows = tier ? scoped.filter((m) => m.tierLevel === tier) : scoped;
    const sorters: Record<SortKey, (a: LoyaltyAccountView, b: LoyaltyAccountView) => number> = {
      points: (a, b) => b.points - a.points,
      lifetime: (a, b) => b.lifetimePoints - a.lifetimePoints,
      redeemed: (a, b) => b.redeemedPoints - a.redeemedPoints,
      nearest: (a, b) => (a.pointsToNextTier ?? Infinity) - (b.pointsToNextTier ?? Infinity),
      recent: (a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''),
      name: (a, b) => a.userName.localeCompare(b.userName),
      newest: (a, b) => b.memberSince.localeCompare(a.memberSince),
    };
    return [...rows].sort(sorters[sort]);
  }, [scoped, tier, sort]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (acc, m) => {
          acc.points += m.points;
          acc.lifetime += m.lifetimePoints;
          acc.redeemed += m.redeemedPoints;
          if (isNearUpgrade(m)) acc.near += 1;
          if (m.tierLevel !== 'SILVER') acc.vip += 1;
          return acc;
        },
        { points: 0, lifetime: 0, redeemed: 0, near: 0, vip: 0 },
      ),
    [filtered],
  );
  const pointValue = roster[0]?.pointValueLak ?? 1000;
  const redemptionRate = totals.lifetime > 0 ? Math.round((totals.redeemed / totals.lifetime) * 100) : 0;
  const avgLifetime = filtered.length > 0 ? Math.round(totals.lifetime / filtered.length) : 0;

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const hasActiveFilters = Boolean(q) || Boolean(tier) || activity !== 'all' || nearOnly || sort !== 'points';

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  function exportCsv() {
    downloadCsv(`loyalty-${formatDate(new Date()).replace(/\//g, '-')}`, [
      [
        t('loyalty.col.member'),
        t('loyalty.col.phone'),
        t('loyalty.col.tier'),
        t('loyalty.col.points'),
        t('loyalty.col.value'),
        t('loyalty.col.lifetime'),
        t('loyalty.col.redeemed'),
        t('loyalty.col.next'),
        t('loyalty.col.lastActivity'),
        t('loyalty.col.memberSince'),
      ],
      ...filtered.map((m) => [
        m.userName,
        m.userPhone,
        t(`loyalty.tier.${m.tierLevel}`),
        m.points,
        m.points * m.pointValueLak,
        m.lifetimePoints,
        m.redeemedPoints,
        m.nextTier ? `${m.pointsToNextTier} → ${t(`loyalty.tier.${m.nextTier}`)}` : t('loyalty.topTier'),
        m.lastActivityAt ? formatDate(m.lastActivityAt) : '',
        formatDate(m.memberSince),
      ]),
    ]);
  }

  const columns = useMemo<ColumnDef<LoyaltyAccountView, unknown>[]>(
    () => [
      {
        header: t('loyalty.col.member'),
        accessorKey: 'userName',
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <PersonAvatar name={row.original.userName} size={32} />
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.userName}</div>
              <div className="truncate text-xs tabular-nums text-muted-foreground">{row.original.userPhone}</div>
            </div>
          </div>
        ),
      },
      {
        header: t('loyalty.col.tier'),
        accessorKey: 'tierLevel',
        cell: ({ getValue }) => {
          const v = getValue() as LoyaltyTier;
          const s = TIER_STYLE[v];
          return (
            <span
              className={cn(
                'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1',
                s.chip,
                s.ring,
              )}
            >
              <Gem className="h-3 w-3" aria-hidden="true" />
              {t(`loyalty.tier.${v}`)}
            </span>
          );
        },
      },
      {
        header: t('loyalty.col.points'),
        accessorKey: 'points',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="text-right">
            <span className="block font-semibold tabular-nums">{row.original.points.toLocaleString()}</span>
            <CurrencyText
              amount={row.original.points * row.original.pointValueLak}
              className="block text-2xs text-muted-foreground"
            />
          </div>
        ),
      },
      {
        header: t('loyalty.col.lifetime'),
        accessorKey: 'lifetimePoints',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="text-right">
            <span className="block tabular-nums">{row.original.lifetimePoints.toLocaleString()}</span>
            {row.original.redeemedPoints > 0 ? (
              <span className="block text-2xs tabular-nums text-info">
                {t('loyalty.redeemedShort', { points: row.original.redeemedPoints.toLocaleString() })}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        header: t('loyalty.col.progress'),
        id: 'progress',
        cell: ({ row }) => {
          const m = row.original;
          const pct = Math.round(tierProgress(m) * 100);
          const near = isNearUpgrade(m);
          return (
            <div className="w-40 space-y-1">
              <span className="block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span
                  className={cn(
                    'block h-full rounded-full transition-[width] duration-500 ease-out',
                    m.nextTier ? TIER_STYLE[m.nextTier].bar : TIER_STYLE[m.tierLevel].bar,
                  )}
                  style={{ width: `${Math.max(pct, 3)}%` }}
                />
              </span>
              <span className={cn('flex items-center gap-1 text-2xs', near ? 'text-warning' : 'text-muted-foreground')}>
                {near ? <ArrowUpCircle className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
                <span className="truncate">
                  {m.nextTier
                    ? t('loyalty.toNext', {
                        points: m.pointsToNextTier?.toLocaleString(),
                        tier: t(`loyalty.tier.${m.nextTier}`),
                      })
                    : t('loyalty.topTier')}
                </span>
              </span>
            </div>
          );
        },
      },
      {
        header: t('loyalty.col.lastActivity'),
        accessorKey: 'lastActivityAt',
        cell: ({ row }) => {
          const m = row.original;
          if (!m.lastActivityAt) return <span className="text-xs text-muted-foreground">{t('loyalty.never')}</span>;
          return (
            <div className="space-y-0.5">
              <DateTimeText value={m.lastActivityAt} className="block text-xs text-muted-foreground" />
              {isDormant(m) ? <Badge variant="neutral">{t('loyalty.activity.dormantBadge')}</Badge> : null}
            </div>
          );
        },
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <Button
              variant="secondary"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setOpenUserId(row.original.userId);
              }}
            >
              <History className="h-3 w-3" aria-hidden="true" />
              {t('loyalty.history')}
            </Button>
            {canManage ? (
              <Button
                variant="secondary"
                size="sm"
                className="h-7 gap-1 border-primary/25 bg-primary/5 px-2 text-xs text-primary hover:border-primary/40 hover:bg-primary/10"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenUserId(row.original.userId);
                }}
              >
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                {t('loyalty.adjust')}
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [t, canManage],
  );

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">{t('loyalty.title')}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('loyalty.subtitle')}</p>
          </div>
          <Button variant="secondary" className="shrink-0" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download className="mr-1 h-4 w-4" aria-hidden="true" />
            {t('common.export')}
          </Button>
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
            label={t('loyalty.stat.members')}
            value={filtered.length}
            hint={t('loyalty.stat.membersHint', { count: totals.vip })}
          />
          <ReferralStatCard
            index={1}
            icon={Coins}
            tone="accent"
            label={t('loyalty.stat.outstanding')}
            value={totals.points}
            hint={t('loyalty.stat.outstandingHint', { amount: formatCurrency(totals.points * pointValue) })}
          />
          <ReferralStatCard
            index={2}
            icon={TrendingUp}
            tone="success"
            label={t('loyalty.stat.lifetime')}
            value={totals.lifetime}
            hint={t('loyalty.stat.lifetimeHint', { points: avgLifetime.toLocaleString() })}
          />
          <ReferralStatCard
            index={3}
            icon={Gift}
            tone="info"
            label={t('loyalty.stat.redeemed')}
            value={totals.redeemed}
            hint={t('loyalty.stat.redeemedHint', { rate: redemptionRate })}
          />
          <ReferralStatCard
            index={4}
            icon={ArrowUpCircle}
            tone="warning"
            label={t('loyalty.stat.near')}
            value={totals.near}
            hint={t('loyalty.stat.nearHint', { points: NEAR_UPGRADE_POINTS })}
            onClick={() => resetPage(setNearOnly)(!nearOnly)}
            active={nearOnly}
          />
        </div>
      )}

      <div className="grid items-stretch gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TierMixCard loading={isLoading} members={scoped} selected={tier} onSelect={resetPage(setTier)} />
        </div>
        <MemberLeaderboard loading={isLoading} members={filtered} onSelect={(m) => setOpenUserId(m.userId)} />
      </div>

      <FilterBar
        search={q}
        onSearchChange={resetPage(setQ)}
        searchPlaceholder={t('loyalty.searchPlaceholder')}
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setQ('');
          setTier('');
          setActivity('all');
          setNearOnly(false);
          setSort('points');
          setPage(1);
        }}
      >
        <Select
          className="h-9 w-[150px]"
          value={tier}
          onChange={(e) => resetPage(setTier)(e.target.value as LoyaltyTier | '')}
          options={[
            { value: '', label: t('loyalty.allTiers') },
            ...TIERS.map((x) => ({ value: x, label: t(`loyalty.tier.${x}`) })),
          ]}
          aria-label={t('loyalty.col.tier')}
        />
        <Select
          className="h-9 w-[170px]"
          value={activity}
          onChange={(e) => resetPage(setActivity)(e.target.value as Activity)}
          options={[
            { value: 'all', label: t('loyalty.activity.all') },
            { value: 'active', label: t('loyalty.activity.active', { days: DORMANT_DAYS }) },
            { value: 'dormant', label: t('loyalty.activity.dormant', { days: DORMANT_DAYS }) },
          ]}
          aria-label={t('loyalty.activity.label')}
        />
        <Select
          className="h-9 w-[190px]"
          value={sort}
          onChange={(e) => resetPage(setSort)(e.target.value as SortKey)}
          options={[
            { value: 'points', label: t('loyalty.sort.points') },
            { value: 'lifetime', label: t('loyalty.sort.lifetime') },
            { value: 'redeemed', label: t('loyalty.sort.redeemed') },
            { value: 'nearest', label: t('loyalty.sort.nearest') },
            { value: 'recent', label: t('loyalty.sort.recent') },
            { value: 'name', label: t('loyalty.sort.name') },
            { value: 'newest', label: t('loyalty.sort.newest') },
          ]}
          aria-label={t('loyalty.sort.label')}
        />
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-sm border border-input px-3 text-sm">
          <input type="checkbox" checked={nearOnly} onChange={(e) => resetPage(setNearOnly)(e.target.checked)} />
          {t('loyalty.filter.nearOnly')}
        </label>
      </FilterBar>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{t('loyalty.tableTitle')}</h2>
            <span className="text-xs text-muted-foreground">
              {t('loyalty.showing', { shown: pageRows.length, total: filtered.length })}
            </span>
            {truncated ? (
              <Badge variant="warning">{t('loyalty.truncated', { limit: ROSTER_LIMIT.toLocaleString() })}</Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {tier ? (
              <span
                className={cn('rounded-full px-2 py-0.5 text-xs font-medium ring-1', TIER_STYLE[tier].chip, TIER_STYLE[tier].ring)}
              >
                {t(`loyalty.tier.${tier}`)}
              </span>
            ) : null}
            {activity !== 'all' ? (
              <Badge variant="neutral">{t(`loyalty.activity.${activity}`, { days: DORMANT_DAYS })}</Badge>
            ) : null}
            {nearOnly ? <Badge variant="warning">{t('loyalty.filter.nearOnly')}</Badge> : null}
          </div>
        </div>
        <div className="p-2 sm:p-3">
          <DataTable
            columns={columns}
            data={pageRows}
            loading={isLoading}
            getRowId={(r) => r.id}
            onRowClick={(r) => setOpenUserId(r.userId)}
            emptyTitle={t('loyalty.empty')}
            emptyDescription={t('loyalty.emptyHint')}
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

      <MemberLoyaltySheet member={openMember} onClose={() => setOpenUserId(null)} canManage={canManage} />
    </div>
  );
}
