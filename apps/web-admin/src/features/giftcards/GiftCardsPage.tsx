import { type FormEvent, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  Gift,
  HandCoins,
  Hourglass,
  ScanSearch,
  ShoppingBag,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GiftCardView } from '@abcp/shared-types';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { CurrencyText, DataTable, DateTimeText, FilterBar, Pagination } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { ReferralStatCard } from '@/features/referrals/ReferralStatCard';
import { downloadCsv } from '@/features/reports/lib/csv';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui.store';

import { ExpiryWatchCard } from './ExpiryWatchCard';
import { GiftCardDetailSheet } from './GiftCardDetailSheet';
import {
  CARD_STATES,
  EXPIRING_WINDOW_DAYS,
  STATE_BADGE,
  STATE_DOT,
  cardCurrency,
  cardSource,
  cardState,
  daysUntil,
  isExpiringSoon,
  valueSplit,
  type CardSource,
  type CardState,
} from './giftCardModel';
import { useGiftCards } from './giftcards.api';
import { GiftCardValueCard } from './GiftCardValueCard';
import { IssueGiftCardDialog } from './IssueGiftCardDialog';
import { useCopyCode } from './useCopyCode';

/**
 * Upper bound on cards held in memory. The list endpoint only filters by branch,
 * redeemed flag and `q`, so status/source/expiry filtering, sorting and the whole
 * summary layer (tiles, value split, expiry watch) are derived client-side from one
 * fetch — honest across the whole book instead of per server page. Same trade-off
 * as Referrals / Appointments; move to server-side aggregates past this size.
 */
const CARD_LIMIT = 500;

type SortKey = 'newest' | 'balance' | 'expiring' | 'face' | 'usage';

const ROLES_CAN_ISSUE = new Set(['SUPER_ADMIN', 'BRANCH_ADMIN']);

export function GiftCardsPage() {
  const { t } = useTranslation();
  const { role } = useAuth();
  const canIssue = role != null && ROLES_CAN_ISSUE.has(role);
  const { data: branches = [] } = useBranches();
  const activeBranch = useUiStore((s) => s.activeBranchId);

  const [branchId, setBranchId] = useState<string | 'all'>(activeBranch);
  const [q, setQ] = useState('');
  const [stateFilter, setStateFilter] = useState<CardState | 'all'>('all');
  const [source, setSource] = useState<CardSource | 'all'>('all');
  const [expiringOnly, setExpiringOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [issueOpen, setIssueOpen] = useState(false);
  const [lookupCode, setLookupCode] = useState('');
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [seed, setSeed] = useState<GiftCardView | null>(null);
  const { copied, copy } = useCopyCode();

  const { data, isLoading } = useGiftCards({
    branchId,
    scope: 'all',
    q: q || undefined,
    page: 1,
    pageSize: CARD_LIMIT,
  });
  const book = useMemo(() => data?.items ?? [], [data]);

  /** Everything except the status/expiring chips — feeds the overview so its chips keep their counts. */
  const scoped = useMemo(
    () => book.filter((c) => source === 'all' || cardSource(c) === source),
    [book, source],
  );

  const filtered = useMemo(() => {
    const now = Date.now();
    const rows = scoped.filter(
      (c) =>
        (stateFilter === 'all' || cardState(c) === stateFilter) && (!expiringOnly || isExpiringSoon(c, now)),
    );
    const sorters: Record<SortKey, (a: GiftCardView, b: GiftCardView) => number> = {
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      balance: (a, b) => b.currentBalance - a.currentBalance,
      expiring: (a, b) => a.expireDate.localeCompare(b.expireDate),
      face: (a, b) => b.initialBalance - a.initialBalance,
      usage: (a, b) =>
        (b.initialBalance - b.currentBalance) / (b.initialBalance || 1) -
        (a.initialBalance - a.currentBalance) / (a.initialBalance || 1),
    };
    return [...rows].sort(sorters[sort]);
  }, [scoped, stateFilter, expiringOnly, sort]);

  const stats = useMemo(() => {
    const now = Date.now();
    const split = valueSplit(scoped);
    const expiring = scoped.filter((c) => isExpiringSoon(c, now));
    const pending = scoped.filter((c) => cardState(c) === 'pendingPayment');
    const issued = scoped.filter((c) => cardState(c) !== 'pendingPayment');
    return {
      split,
      issuedCount: issued.length,
      faceValue: issued.reduce((s, c) => s + c.initialBalance, 0),
      expiringCount: expiring.length,
      expiringValue: expiring.reduce((s, c) => s + c.currentBalance, 0),
      pendingCount: pending.length,
      pendingValue: pending.reduce((s, c) => s + c.initialBalance, 0),
    };
  }, [scoped]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const hasActiveFilters =
    Boolean(q) ||
    branchId !== 'all' ||
    stateFilter !== 'all' ||
    source !== 'all' ||
    expiringOnly ||
    sort !== 'newest';

  function openCard(card: GiftCardView) {
    setSeed(card);
    setOpenCode(card.code);
  }

  function runLookup(e: FormEvent) {
    e.preventDefault();
    const code = lookupCode.trim().toUpperCase();
    if (code.length < 4) return;
    setSeed(book.find((c) => c.code === code) ?? null);
    setOpenCode(code);
  }

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  function exportCsv() {
    downloadCsv(`gift-cards-${formatDate(new Date()).replace(/\//g, '-')}`, [
      [
        t('giftCards.col.code'),
        t('giftCards.col.status'),
        t('giftCards.col.source'),
        t('giftCards.col.recipient'),
        t('giftCards.col.buyer'),
        t('giftCards.col.branch'),
        t('giftCards.col.faceValue'),
        t('giftCards.col.balance'),
        t('giftCards.value.redeemed'),
        t('giftCards.col.currency'),
        t('giftCards.col.issued'),
        t('giftCards.col.expires'),
        t('giftCards.detail.reason'),
      ],
      ...filtered.map((c) => [
        c.code,
        t(`giftCards.status.${cardState(c)}`),
        t(`giftCards.source.${cardSource(c)}`),
        c.recipientEmail,
        c.buyerName ?? '',
        c.branchName,
        c.initialBalance,
        c.currentBalance,
        Math.max(0, c.initialBalance - c.currentBalance),
        c.currency,
        formatDate(c.createdAt),
        formatDate(c.expireDate),
        c.issueReason ?? '',
      ]),
    ]);
  }

  const columns = useMemo<ColumnDef<GiftCardView, unknown>[]>(
    () => [
      {
        header: t('giftCards.col.card'),
        accessorKey: 'code',
        cell: ({ row }) => {
          const c = row.original;
          const muted = cardState(c) !== 'active';
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  'flex h-8 w-12 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary to-accent text-white shadow-sm',
                  muted && 'opacity-50 grayscale',
                )}
                aria-hidden="true"
              >
                <Gift className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="truncate font-mono text-xs font-medium text-foreground">{c.code}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      copy(c.code);
                    }}
                    aria-label={t('giftCards.copyAria', { code: c.code })}
                    className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {copied === c.code ? (
                      <Check className="h-3 w-3 text-success" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3 w-3" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <div className="truncate text-2xs text-muted-foreground">{c.branchName}</div>
              </div>
            </div>
          );
        },
      },
      {
        header: t('giftCards.col.recipient'),
        accessorKey: 'recipientEmail',
        cell: ({ row }) => {
          const c = row.original;
          const src = cardSource(c);
          const SrcIcon = src === 'purchased' ? ShoppingBag : HandCoins;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <PersonAvatar name={c.recipientEmail} size={30} />
              <div className="min-w-0">
                <div className="max-w-[220px] truncate text-sm">{c.recipientEmail}</div>
                <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                  <SrcIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {src === 'purchased'
                      ? c.buyerName
                        ? t('giftCards.source.purchasedBy', { name: c.buyerName })
                        : t('giftCards.source.purchased')
                      : t('giftCards.source.complimentary')}
                  </span>
                </div>
              </div>
            </div>
          );
        },
      },
      {
        header: t('giftCards.col.balance'),
        accessorKey: 'currentBalance',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const c = row.original;
          const currency = cardCurrency(c);
          const ratio = c.initialBalance > 0 ? c.currentBalance / c.initialBalance : 0;
          return (
            <div className="inline-flex w-full flex-col items-end gap-1">
              <CurrencyText amount={c.currentBalance} currency={currency} className="font-semibold" />
              <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                <span className="h-1 w-14 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span
                    className={cn(
                      'block h-full rounded-full transition-[width] duration-500 ease-out',
                      ratio > 0.5 ? 'bg-primary' : ratio > 0 ? 'bg-primary/60' : 'bg-transparent',
                    )}
                    style={{ width: `${Math.round(ratio * 100)}%` }}
                  />
                </span>
                {t('giftCards.visual.of')} <CurrencyText amount={c.initialBalance} currency={currency} />
              </span>
            </div>
          );
        },
      },
      {
        header: t('giftCards.col.status'),
        id: 'status',
        cell: ({ row }) => {
          const s = cardState(row.original);
          return (
            <Badge variant={STATE_BADGE[s]}>
              <span className={cn('h-1.5 w-1.5 rounded-full', STATE_DOT[s])} aria-hidden="true" />
              {t(`giftCards.status.${s}`)}
            </Badge>
          );
        },
      },
      {
        header: t('giftCards.col.expires'),
        accessorKey: 'expireDate',
        cell: ({ row }) => {
          const c = row.original;
          const s = cardState(c);
          const days = daysUntil(c.expireDate);
          const live = s === 'active';
          const soon = live && isExpiringSoon(c);
          return (
            <div className="whitespace-nowrap">
              <div className="text-sm tabular-nums">{formatDate(c.expireDate)}</div>
              {live ? (
                <div
                  className={cn(
                    'flex items-center gap-1 text-2xs',
                    soon ? (days <= 7 ? 'text-destructive' : 'text-warning') : 'text-muted-foreground',
                  )}
                >
                  {soon ? <Hourglass className="h-3 w-3" aria-hidden="true" /> : null}
                  {t('giftCards.expiresIn.days', { count: days })}
                </div>
              ) : s === 'expired' ? (
                <div className="text-2xs text-destructive">
                  {t('giftCards.expiresIn.ago', { count: Math.abs(days) })}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        header: t('giftCards.col.issued'),
        accessorKey: 'createdAt',
        cell: ({ getValue }) => (
          <DateTimeText value={getValue() as string} className="whitespace-nowrap text-xs text-muted-foreground" />
        ),
      },
    ],
    [t, copied, copy],
  );

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
              {t('giftCards.title')}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('giftCards.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={runLookup} className="flex items-center gap-1.5" role="search">
              <div className="relative">
                <ScanSearch
                  className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={lookupCode}
                  onChange={(e) => setLookupCode(e.target.value)}
                  placeholder="GC-XXXX-XXXX"
                  aria-label={t('giftCards.lookupLabel')}
                  className="h-9 w-[170px] pl-8 font-mono text-xs uppercase sm:w-[190px]"
                />
              </div>
              <Button type="submit" variant="secondary" disabled={lookupCode.trim().length < 4}>
                {t('giftCards.check')}
              </Button>
            </form>
            <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('common.export')}
            </Button>
            {canIssue ? (
              <Button onClick={() => setIssueOpen(true)}>
                <Gift className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('giftCards.issue')}
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
            icon={Gift}
            tone="primary"
            label={t('giftCards.stat.issued')}
            value={stats.issuedCount}
            hint={
              <>
                {t('giftCards.stat.faceValue')} <CurrencyText amount={stats.faceValue} />
              </>
            }
          />
          <ReferralStatCard
            index={1}
            icon={Wallet}
            tone="accent"
            label={t('giftCards.stat.outstanding')}
            value={<CurrencyText amount={stats.split.outstanding} />}
            hint={t('giftCards.stat.outstandingHint', { count: stats.split.activeCount })}
            onClick={() => {
              setStateFilter((s) => (s === 'active' ? 'all' : 'active'));
              setPage(1);
            }}
            active={stateFilter === 'active'}
          />
          <ReferralStatCard
            index={2}
            icon={CheckCircle2}
            tone="success"
            label={t('giftCards.stat.redeemed')}
            value={<CurrencyText amount={stats.split.redeemed} />}
            hint={t('giftCards.stat.redeemedHint', { rate: Math.round(stats.split.redemptionRate * 100) })}
          />
          <ReferralStatCard
            index={3}
            icon={Hourglass}
            tone="warning"
            label={t('giftCards.stat.expiring', { days: EXPIRING_WINDOW_DAYS })}
            value={stats.expiringCount}
            hint={
              <>
                {t('giftCards.stat.atRisk')} <CurrencyText amount={stats.expiringValue} />
              </>
            }
            onClick={() => {
              setExpiringOnly((v) => !v);
              setPage(1);
            }}
            active={expiringOnly}
          />
          <ReferralStatCard
            index={4}
            icon={Clock3}
            tone="info"
            label={t('giftCards.stat.pending')}
            value={stats.pendingCount}
            hint={
              <>
                {t('giftCards.stat.pendingHint')} <CurrencyText amount={stats.pendingValue} />
              </>
            }
            onClick={() => {
              setStateFilter((s) => (s === 'pendingPayment' ? 'all' : 'pendingPayment'));
              setPage(1);
            }}
            active={stateFilter === 'pendingPayment'}
          />
        </div>
      )}

      <div className="grid items-stretch gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <GiftCardValueCard
            loading={isLoading}
            cards={scoped}
            activeState={stateFilter}
            onStateSelect={resetPage(setStateFilter)}
          />
        </div>
        <ExpiryWatchCard loading={isLoading} cards={scoped} onSelect={openCard} />
      </div>

      <FilterBar
        search={q}
        onSearchChange={resetPage(setQ)}
        searchPlaceholder={t('giftCards.searchPlaceholder')}
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setQ('');
          setBranchId('all');
          setStateFilter('all');
          setSource('all');
          setExpiringOnly(false);
          setSort('newest');
          setPage(1);
        }}
      >
        <Select
          className="h-9 w-[150px]"
          value={branchId}
          onChange={(e) => resetPage(setBranchId)(e.target.value)}
          options={[{ value: 'all', label: t('branch.all') }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
          aria-label={t('giftCards.col.branch')}
        />
        <Select
          className="h-9 w-[160px]"
          value={stateFilter}
          onChange={(e) => resetPage(setStateFilter)(e.target.value as CardState | 'all')}
          options={[
            { value: 'all', label: t('giftCards.scope.all') },
            ...CARD_STATES.map((s) => ({ value: s, label: t(`giftCards.status.${s}`) })),
          ]}
          aria-label={t('giftCards.col.status')}
        />
        <Select
          className="h-9 w-[160px]"
          value={source}
          onChange={(e) => resetPage(setSource)(e.target.value as CardSource | 'all')}
          options={[
            { value: 'all', label: t('giftCards.source.all') },
            { value: 'purchased', label: t('giftCards.source.purchased') },
            { value: 'complimentary', label: t('giftCards.source.complimentary') },
          ]}
          aria-label={t('giftCards.col.source')}
        />
        <Select
          className="h-9 w-[180px]"
          value={sort}
          onChange={(e) => resetPage(setSort)(e.target.value as SortKey)}
          options={[
            { value: 'newest', label: t('giftCards.sort.newest') },
            { value: 'balance', label: t('giftCards.sort.balance') },
            { value: 'expiring', label: t('giftCards.sort.expiring') },
            { value: 'face', label: t('giftCards.sort.face') },
            { value: 'usage', label: t('giftCards.sort.usage') },
          ]}
          aria-label={t('giftCards.sort.label')}
        />
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-sm border border-input px-3 text-sm">
          <input
            type="checkbox"
            checked={expiringOnly}
            onChange={(e) => resetPage(setExpiringOnly)(e.target.checked)}
          />
          {t('giftCards.filter.expiringOnly', { days: EXPIRING_WINDOW_DAYS })}
        </label>
      </FilterBar>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Gift className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{t('giftCards.tableTitle')}</h2>
            <span className="text-xs text-muted-foreground" role="status" aria-atomic="true">
              {t('giftCards.showing', { shown: pageRows.length, total: filtered.length })}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {stateFilter !== 'all' ? (
              <Badge variant={STATE_BADGE[stateFilter]}>{t(`giftCards.status.${stateFilter}`)}</Badge>
            ) : null}
            {expiringOnly ? (
              <Badge variant="warning">{t('giftCards.filter.expiringOnly', { days: EXPIRING_WINDOW_DAYS })}</Badge>
            ) : null}
            {source !== 'all' ? <Badge variant="accent">{t(`giftCards.source.${source}`)}</Badge> : null}
          </div>
        </div>
        <div className="overflow-x-auto p-2 sm:p-3">
          <DataTable
            columns={columns}
            data={pageRows}
            loading={isLoading}
            getRowId={(r) => r.id}
            onRowClick={openCard}
            emptyTitle={hasActiveFilters ? t('giftCards.emptyFiltered') : t('giftCards.empty')}
            emptyDescription={hasActiveFilters ? t('giftCards.emptyFilteredHint') : t('giftCards.emptyHint')}
            emptyAction={
              canIssue && !hasActiveFilters ? (
                <Button size="sm" onClick={() => setIssueOpen(true)}>
                  <Gift className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t('giftCards.issue')}
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

      <IssueGiftCardDialog
        open={issueOpen}
        defaultBranchId={branchId}
        onClose={() => setIssueOpen(false)}
        onIssued={openCard}
      />
      <GiftCardDetailSheet
        code={openCode}
        seed={seed}
        onClose={() => {
          setOpenCode(null);
          setSeed(null);
        }}
      />
    </div>
  );
}
