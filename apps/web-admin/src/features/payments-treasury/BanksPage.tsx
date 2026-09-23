import type { ColumnDef } from '@tanstack/react-table';
import type { BankAccountInsight, BankAccountView } from '@abcp/shared-types';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  LayoutGrid,
  Landmark,
  List,
  PlugZap,
  Plus,
  ScanLine,
  Star,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { DataTable, FilterBar } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { StatTile } from '@/features/payroll/payroll.parts';
import { useConfirm } from '@/hooks/useConfirm';
import { formatCurrency, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { AccountCard, type AccountActions } from './AccountCard';
import { BankAccountDialog } from './BankAccountDialog';
import { BankAccountSheet } from './BankAccountSheet';
import { BankChangesPanel } from './BankChangesPanel';
import { BankQrDialog } from './BankQrDialog';
import { AccountNumber, BankMonogram, TonePill } from './banks.parts';
import {
  accountIssues,
  asCur,
  healthLevel,
  HEALTH_TONE,
  ISSUE_TONE,
  parsePeriod,
  parseStatus,
  parseView,
  PERIODS,
  setupChecks,
  type AccountIssue,
  type HealthLevel,
  type StatusFilter,
} from './banks.lib';
import { ProviderCard } from './ProviderCard';
import { SlipSettingsCard } from './SlipSettingsCard';
import { InflowCard, SetupHealthCard } from './TreasuryHero';
import { UnassignedTransfersSheet } from './UnassignedTransfersSheet';
import {
  useBankAccountInsights,
  useBankAccounts,
  useBankChanges,
  useDeactivateBankAccount,
  useProviders,
  useUpdateBankAccount,
} from './treasury.api';

const HEALTH_RANK: Record<HealthLevel, number> = { critical: 0, attention: 1, ok: 2, off: 3 };

type Row = {
  account: BankAccountView;
  insight: BankAccountInsight | undefined;
  issues: AccountIssue[];
  health: HealthLevel;
};

/**
 * /payments/banks — "where the money lands". A command center in four bands:
 *  1. inflow for the period (with split by account + daily bars) beside the go-live checklist;
 *  2. a stat rail (one tile is the "needs attention" filter);
 *  3. receiving accounts — wallet cards grouped by branch, or a dense table — each opening a drawer;
 *  4. payment channels and the slip-verification policy.
 * Page state (period, branch, status, view, search, flag, open account) lives in the URL.
 */
export function BanksPage() {
  const { t, i18n } = useTranslation();
  const lang: 'lo' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'lo';
  const confirm = useConfirm();
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission('payments:manage');
  const isSuper = user?.role === 'SUPER_ADMIN';

  const [params, setParams] = useSearchParams();
  const days = parsePeriod(params.get('days'));
  const branchFilter = params.get('branch') ?? '';
  const status = parseStatus(params.get('status'));
  const view = parseView(params.get('view'));
  const flag = params.get('flag'); // 'attention' | 'noQr' | null
  const q = params.get('q') ?? '';
  const openId = params.get('a');

  const setParam = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const { data: branches = [] } = useBranches();
  const accountsQ = useBankAccounts();
  const insightsQ = useBankAccountInsights(days, branchFilter || undefined);
  const providersQ = useProviders();
  const changesQ = useBankChanges();
  const update = useUpdateBankAccount();
  const deactivate = useDeactivateBankAccount();

  const [editing, setEditing] = useState<BankAccountView | null>(null);
  const [creating, setCreating] = useState(false);
  const [createBranch, setCreateBranch] = useState<string | null>(null);
  const [qrFor, setQrFor] = useState<BankAccountView | null>(null);
  const [assigning, setAssigning] = useState(false);
  const accountsRef = useRef<HTMLElement>(null);
  const channelsRef = useRef<HTMLElement>(null);

  const accounts = useMemo(() => accountsQ.data ?? [], [accountsQ.data]);
  const providers = useMemo(() => providersQ.data ?? [], [providersQ.data]);
  const allChanges = useMemo(() => changesQ.data ?? [], [changesQ.data]);
  const pendingChanges = useMemo(
    () => allChanges.filter((c) => c.status === 'PENDING' && (!branchFilter || c.branchId === branchFilter)),
    [allChanges, branchFilter],
  );
  const insights = insightsQ.data;
  const insightById = useMemo(
    () => new Map((insights?.accounts ?? []).map((i) => [i.bankAccountId, i])),
    [insights],
  );
  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);
  const myBranches = useMemo(
    () => (isSuper ? branches : branches.filter((b) => b.id === user?.branchId)),
    [isSuper, branches, user?.branchId],
  );
  const scopedBranches = useMemo(
    () => (branchFilter ? myBranches.filter((b) => b.id === branchFilter) : myBranches),
    [myBranches, branchFilter],
  );
  const scopedAccounts = useMemo(
    () => (branchFilter ? accounts.filter((a) => a.branchId === branchFilter) : accounts),
    [accounts, branchFilter],
  );

  const allRows = useMemo<Row[]>(
    () =>
      scopedAccounts.map((account) => {
        const insight = insightById.get(account.id);
        const issues = accountIssues(account, insight, days);
        return { account, insight, issues, health: healthLevel(account, issues) };
      }),
    [scopedAccounts, insightById, days],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allRows
      .filter(({ account: a }) => (status === 'all' ? true : status === 'active' ? a.isActive : !a.isActive))
      .filter((r) => (flag === 'attention' ? r.health === 'attention' || r.health === 'critical' : true))
      .filter((r) => (flag === 'noQr' ? r.issues.includes('noQr') : true))
      .filter(({ account: a }) =>
        needle
          ? [a.accountName, a.accountNumber, a.bank.code, a.bank.nameEn, a.bank.nameLo, branchName.get(a.branchId) ?? '']
              .join(' ')
              .toLowerCase()
              .includes(needle)
          : true,
      )
      .sort(
        (x, y) =>
          Number(y.account.isDefault) - Number(x.account.isDefault) ||
          HEALTH_RANK[x.health] - HEALTH_RANK[y.health] ||
          (y.insight?.receivedPeriod ?? 0) - (x.insight?.receivedPeriod ?? 0),
      );
  }, [allRows, status, flag, q, branchName]);

  // ── derived counts ────────────────────────────────────────────────
  const active = scopedAccounts.filter((a) => a.isActive);
  const uncoveredBranches = scopedBranches.filter((b) => b.isActive && !active.some((a) => a.branchId === b.id));
  const attentionCount = allRows.filter((r) => r.health === 'attention' || r.health === 'critical').length;
  const channelIssues = providers.reduce((n, p) => n + (p.isActive ? p.recentIssues : 0), 0);
  const activeChannels = providers.filter((p) => p.isActive).length;
  const checks = useMemo(
    () => setupChecks({ branches: scopedBranches, accounts: scopedAccounts, providers, insights }),
    [scopedBranches, scopedAccounts, providers, insights],
  );
  const loadingTop = accountsQ.isLoading || insightsQ.isLoading || providersQ.isLoading;

  // ── actions ───────────────────────────────────────────────────────
  const onError = (err: unknown) =>
    toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));

  const actions: AccountActions = {
    onOpen: (a) => setParam({ a: a.id }),
    onEdit: (a) => setEditing(a),
    onQr: (a) => setQrFor(a),
    onSetDefault: (a) =>
      update.mutate(
        { id: a.id, input: { isDefault: true } },
        { onSuccess: () => toast.success(t('payTreasury.banks.defaultSet', { name: a.accountName })), onError },
      ),
    onToggleActive: async (a) => {
      if (!a.isActive) {
        update.mutate({ id: a.id, input: { isActive: true } }, { onSuccess: () => toast.success(t('common.saved')), onError });
        return;
      }
      if (a.isDefault) {
        toast.error(t('payTreasury.banks.cantDisableDefault'));
        return;
      }
      const ok = await confirm({
        title: t('payTreasury.banks.deactivateTitle', { name: a.accountName }),
        description: t('payTreasury.banks.deactivateBody'),
        confirmLabel: t('payTreasury.banks.deactivateAction'),
        destructive: true,
      });
      if (ok) deactivate.mutate(a.id, { onSuccess: () => toast.success(t('common.saved')), onError });
    },
  };
  const busy = update.isPending || deactivate.isPending;

  const scrollTo = (el: HTMLElement | null) => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  // ── grouping (cards view) ─────────────────────────────────────────
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const list = map.get(r.account.branchId) ?? [];
      list.push(r);
      map.set(r.account.branchId, list);
    }
    return [...map.entries()]
      .map(([id, list]) => ({ id, name: branchName.get(id) ?? '—', rows: list }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, branchName]);
  const showGroupHeads = isSuper && !branchFilter && groups.length > 1;
  const filtersOn = Boolean(q) || Boolean(branchFilter) || status !== 'active' || Boolean(flag);

  const open = openId ? accounts.find((a) => a.id === openId) ?? null : null;
  const openRow = open ? allRows.find((r) => r.account.id === open.id) : undefined;

  // ── table view ────────────────────────────────────────────────────
  const columns = useMemo<ColumnDef<Row, unknown>[]>(
    () => [
      {
        header: t('payTreasury.col.bank'),
        id: 'bank',
        cell: ({ row: { original: r } }) => (
          <div className="flex min-w-0 items-center gap-2.5">
            <BankMonogram code={r.account.bank.code} size="sm" />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">{r.account.accountName}</span>
                {r.account.isDefault ? (
                  <Star className="h-3 w-3 shrink-0 fill-accent text-accent" aria-label={t('payTreasury.banks.default')} />
                ) : null}
              </div>
              <AccountNumber code={r.account.bank.code} number={r.account.accountNumber} revealable={false} />
            </div>
          </div>
        ),
      },
      {
        header: t('payTreasury.col.branch'),
        id: 'branch',
        cell: ({ row: { original: r } }) => <span className="text-sm">{branchName.get(r.account.branchId) ?? '—'}</span>,
      },
      {
        header: t('payTreasury.banks.card.received', { days }),
        id: 'received',
        meta: { align: 'right' },
        cell: ({ row: { original: r } }) => (
          <div className="text-right tabular-nums">
            <div className="font-medium">{formatCurrency(r.insight?.receivedPeriod ?? 0, asCur(r.account.currency))}</div>
            <div className="text-2xs text-muted-foreground">
              {t('payTreasury.banks.hero.txns', { count: r.insight?.receivedPeriodCount ?? 0 })}
            </div>
          </div>
        ),
      },
      {
        header: t('payTreasury.banks.hero.today'),
        id: 'today',
        meta: { align: 'right' },
        cell: ({ row: { original: r } }) => (
          <span className="tabular-nums">{formatCurrency(r.insight?.receivedToday ?? 0, asCur(r.account.currency))}</span>
        ),
      },
      {
        header: t('payTreasury.banks.card.lastIn'),
        id: 'last',
        cell: ({ row: { original: r } }) => (
          <span className="text-xs text-muted-foreground">
            {r.insight?.lastReceivedAt ? formatRelative(r.insight.lastReceivedAt, lang) : t('payTreasury.banks.never')}
          </span>
        ),
      },
      {
        header: t('payTreasury.col.status'),
        id: 'health',
        cell: ({ row: { original: r } }) =>
          !r.account.isActive ? (
            <TonePill tone="neutral">{t('payTreasury.banks.inactive')}</TonePill>
          ) : r.issues[0] ? (
            <TonePill tone={ISSUE_TONE[r.issues[0]]}>
              {t(`payTreasury.banks.issue.${r.issues[0]}`, {
                count:
                  r.issues[0] === 'variance'
                    ? r.insight?.varianceDays
                    : r.issues[0] === 'unreconciled'
                      ? r.insight?.unreconciledDays
                      : r.insight?.openSlips,
              })}
            </TonePill>
          ) : (
            <TonePill tone={HEALTH_TONE.ok}>{t('payTreasury.banks.health.ok')}</TonePill>
          ),
      },
    ],
    [t, branchName, days, lang],
  );

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">{t('nav.paymentsBanks')}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('payTreasury.banks.subtitle')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Segmented label={t('payTreasury.banks.period')}>
              {PERIODS.map((d) => (
                <SegButton key={d} active={days === d} onClick={() => setParam({ days: d === 30 ? null : String(d) })}>
                  {t('payTreasury.banks.periodDays', { count: d })}
                </SegButton>
              ))}
            </Segmented>
            {canManage ? (
              <Button className="shrink-0" onClick={() => setCreating(true)}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('payTreasury.banks.addAccount')}
              </Button>
            ) : null}
          </div>
        </div>
      </StickyPageHeader>

      <div className="grid items-stretch gap-3 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <InflowCard
            insights={insights}
            accounts={scopedAccounts}
            loading={loadingTop}
            onAssign={canManage ? () => setAssigning(true) : undefined}
          />
        </div>
        <div className="lg:col-span-2">
          <SetupHealthCard
            checks={checks}
            loading={loadingTop}
            onAdd={canManage ? () => setCreating(true) : undefined}
            onFilterNoQr={() => {
              setParam({ flag: 'noQr', status: null });
              scrollTo(accountsRef.current);
            }}
            onChannels={() => scrollTo(channelsRef.current)}
          />
        </div>
      </div>

      <BankChangesPanel changes={pendingChanges} isOwner={isSuper} userId={user?.id} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
        <StatTile
          index={0}
          icon={Landmark}
          tone="primary"
          loading={loadingTop}
          label={t('payTreasury.banks.stat.accounts')}
          value={active.length}
          hint={t('payTreasury.banks.stat.accountsHint', { count: scopedAccounts.length - active.length })}
        />
        <StatTile
          index={1}
          icon={AlertTriangle}
          tone={attentionCount > 0 ? 'warning' : 'success'}
          loading={loadingTop}
          label={t('payTreasury.banks.stat.attention')}
          value={attentionCount}
          hint={t(flag === 'attention' ? 'payTreasury.banks.stat.filterOn' : 'payTreasury.banks.stat.filterHint')}
          active={flag === 'attention'}
          onClick={() => {
            setParam({ flag: flag === 'attention' ? null : 'attention' });
            scrollTo(accountsRef.current);
          }}
        />
        <StatTile
          index={2}
          icon={Building2}
          tone={uncoveredBranches.length > 0 ? 'warning' : 'success'}
          loading={loadingTop}
          label={t('payTreasury.banks.stat.uncovered')}
          value={uncoveredBranches.length}
          hint={
            uncoveredBranches.length > 0
              ? uncoveredBranches.map((b) => b.name).join(', ')
              : t('payTreasury.banks.stat.allCovered')
          }
          title={uncoveredBranches.map((b) => b.name).join(', ') || undefined}
        />
        <StatTile
          index={3}
          icon={ScanLine}
          tone={insights?.totals.openSlips ? 'info' : 'neutral'}
          loading={loadingTop}
          label={t('payTreasury.banks.stat.openSlips')}
          value={insights?.totals.openSlips ?? 0}
          hint={t('payTreasury.banks.stat.pendingQr', { count: insights?.totals.pendingIntents ?? 0 })}
        />
        <StatTile
          index={4}
          icon={CalendarClock}
          tone={insights?.totals.varianceDays ? 'danger' : insights?.totals.unreconciledDays ? 'warning' : 'success'}
          loading={loadingTop}
          label={t('payTreasury.banks.stat.unreconciled')}
          value={insights?.totals.unreconciledDays ?? 0}
          hint={t('payTreasury.banks.stat.variance', { count: insights?.totals.varianceDays ?? 0 })}
        />
        <StatTile
          index={5}
          icon={channelIssues > 0 ? Webhook : PlugZap}
          tone={channelIssues > 0 ? 'danger' : 'info'}
          loading={loadingTop}
          label={t(channelIssues > 0 ? 'payTreasury.banks.stat.issues' : 'payTreasury.banks.stat.providers')}
          value={channelIssues > 0 ? channelIssues : activeChannels}
          hint={
            channelIssues > 0
              ? t('payTreasury.banks.stat.issuesHint')
              : t('payTreasury.banks.stat.providersHint', { total: providers.length })
          }
        />
      </div>

      {/* ── Receiving accounts ─────────────────────────────────────── */}
      <section ref={accountsRef} aria-labelledby="accounts-title" className="scroll-mt-48 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h2 id="accounts-title" className="text-base font-semibold">
              {t('payTreasury.banks.tableTitle')}
            </h2>
            <span className="text-xs text-muted-foreground" aria-live="polite">
              {t('payTreasury.showing', { count: rows.length })}
            </span>
          </div>
          <Segmented label={t('payTreasury.banks.viewLabel')}>
            <SegButton active={view === 'cards'} onClick={() => setParam({ view: null })} icon={LayoutGrid}>
              {t('payTreasury.banks.view.cards')}
            </SegButton>
            <SegButton active={view === 'table'} onClick={() => setParam({ view: 'table' })} icon={List}>
              {t('payTreasury.banks.view.table')}
            </SegButton>
          </Segmented>
        </div>

        <FilterBar
          search={q}
          onSearchChange={(v) => setParam({ q: v })}
          searchPlaceholder={t('payTreasury.banks.searchPlaceholder')}
          hasActiveFilters={filtersOn}
          onClear={() => setParam({ q: null, branch: null, status: null, flag: null })}
        >
          {isSuper ? (
            <Select
              className="h-9 w-[180px]"
              value={branchFilter}
              onChange={(e) => setParam({ branch: e.target.value })}
              placeholder={t('payTreasury.allBranches')}
              aria-label={t('payTreasury.col.branch')}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          ) : null}
          <Segmented label={t('payTreasury.col.status')}>
            {(['active', 'inactive', 'all'] as StatusFilter[]).map((s) => (
              <SegButton key={s} active={status === s} onClick={() => setParam({ status: s === 'active' ? null : s })}>
                {t(`payTreasury.banks.statusFilter.${s}`)}
              </SegButton>
            ))}
          </Segmented>
          {flag ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background py-1 pl-2.5 pr-1 text-2xs">
              {t(`payTreasury.banks.flag.${flag === 'noQr' ? 'noQr' : 'attention'}`)}
              <button
                type="button"
                onClick={() => setParam({ flag: null })}
                aria-label={t('payTreasury.banks.flag.clear')}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                ×
              </button>
            </span>
          ) : null}
        </FilterBar>

        {accountsQ.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[252px] rounded-xl" />
            ))}
          </div>
        ) : view === 'table' ? (
          <div className="overflow-hidden rounded-xl border border-border bg-card p-2 shadow-sm sm:p-3">
            <DataTable
              columns={columns}
              data={rows}
              getRowId={(r) => r.account.id}
              onRowClick={(r) => actions.onOpen(r.account)}
              compact
              emptyTitle={t('payTreasury.banks.empty')}
              emptyDescription={filtersOn ? t('payTreasury.banks.emptyFiltered') : t('payTreasury.banks.emptyHint')}
            />
          </div>
        ) : rows.length === 0 ? (
          <EmptyAccounts
            filtered={filtersOn}
            onClear={() => setParam({ q: null, branch: null, status: null, flag: null })}
            action={
              canManage && !filtersOn ? (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t('payTreasury.banks.addFirst')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <div key={g.id} className="space-y-2">
                {showGroupHeads ? (
                  <h3 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {g.name}
                    <span className="font-normal">· {t('payTreasury.banks.accountCount', { count: g.rows.length })}</span>
                  </h3>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {g.rows.map((r, i) => (
                    <AccountCard
                      key={r.account.id}
                      account={r.account}
                      insight={r.insight}
                      days={days}
                      branchName={branchName.get(r.account.branchId) ?? '—'}
                      issues={r.issues}
                      health={r.health}
                      canManage={canManage}
                      index={i}
                      actions={actions}
                      busy={busy}
                    />
                  ))}
                </div>
              </div>
            ))}
            {canManage && !filtersOn && uncoveredBranches.length > 0 ? (
              <div className="rounded-xl border border-dashed border-warning/50 bg-warning-soft/30 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {t('payTreasury.banks.uncoveredTitle', { count: uncoveredBranches.length })}
                    </p>
                    <p className="text-2xs text-muted-foreground">{t('payTreasury.banks.uncoveredHint')}</p>
                  </div>
                </div>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {uncoveredBranches.map((b) => (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCreateBranch(b.id);
                          setCreating(true);
                        }}
                        aria-label={t('payTreasury.banks.uncoveredAdd', { branch: b.name })}
                        className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-medium shadow-xs transition-colors hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        {b.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* ── Channels + slip policy ─────────────────────────────────── */}
      <section ref={channelsRef} aria-labelledby="channels-title" className="scroll-mt-48 space-y-3">
        <div>
          <h2 id="channels-title" className="text-base font-semibold">
            {t('payTreasury.banks.channelsTitle')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('payTreasury.banks.channelsHint')}</p>
        </div>
        <div className="grid items-stretch gap-3 lg:grid-cols-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
            {providersQ.isLoading
              ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-[240px] rounded-xl" />)
              : providers.map((p, i) => <ProviderCard key={p.code} provider={p} canEdit={isSuper && canManage} index={i} />)}
          </div>
          <SlipSettingsCard canEdit={isSuper && canManage} openSlips={insights?.totals.openSlips} />
        </div>
      </section>

      <BankAccountDialog
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
          setCreateBranch(null);
        }}
        account={editing}
        branches={myBranches.map((b) => ({ id: b.id, name: b.name }))}
        defaultBranchId={createBranch || branchFilter || user?.branchId || undefined}
      />
      <BankQrDialog account={qrFor} onClose={() => setQrFor(null)} canManage={canManage} />
      <BankAccountSheet
        account={open}
        insight={openRow?.insight}
        days={days}
        fromKey={insights?.from}
        todayKey={insights?.to}
        branchName={open ? branchName.get(open.branchId) ?? '—' : ''}
        issues={openRow?.issues ?? []}
        health={openRow?.health ?? 'ok'}
        canManage={canManage}
        busy={busy}
        actions={actions}
        onClose={() => setParam({ a: null })}
        history={open ? allChanges.filter((c) => c.bankAccountId === open.id) : []}
      />
      <UnassignedTransfersSheet
        open={assigning}
        onClose={() => setAssigning(false)}
        accounts={accounts}
        branchId={branchFilter || undefined}
      />
    </div>
  );
}

function Segmented({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-xs">
      {children}
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium',
        'transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
        active ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

function EmptyAccounts({ filtered, onClear, action }: { filtered: boolean; onClear: () => void; action?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Landmark className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold">{t('payTreasury.banks.empty')}</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {filtered ? t('payTreasury.banks.emptyFiltered') : t('payTreasury.banks.emptyHint')}
      </p>
      {filtered ? (
        <Button size="sm" variant="secondary" onClick={onClear}>
          {t('payTreasury.banks.clearFilters')}
        </Button>
      ) : (
        action
      )}
    </div>
  );
}
