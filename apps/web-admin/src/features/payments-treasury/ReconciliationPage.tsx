import type { ReconciliationRow, ReconciliationStatus } from '@abcp/shared-types';
import {
  ArrowDownLeft,
  ArrowUpRight,
  BadgeCheck,
  CircleAlert,
  FileQuestion,
  Scale,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { CurrencyText } from '@/components/shared';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { StatTile } from '@/features/payroll/payroll.parts';

import { ReconAccounts } from './ReconAccounts';
import { ReconCalendar } from './ReconCalendar';
import { ReconCashDrawer } from './ReconCashDrawer';
import { ReconCausesPanel } from './ReconCausesPanel';
import { ReconCommandBar } from './ReconCommandBar';
import { ReconDaySheet } from './ReconDaySheet';
import { ReconHealthCard } from './ReconHealthCard';
import { ReconImportDialog } from './ReconImportDialog';
import { ReconPeriodDialog } from './ReconPeriodDialog';
import { ReconSettingsDialog } from './ReconSettingsDialog';
import { ReconLedger } from './ReconLedger';
import {
  MAX_RANGE_DAYS,
  RECON_STATUSES,
  RECON_VIEWS,
  accountStats,
  daysBetween,
  downloadCsv,
  findTimingPairs,
  isDateKey,
  presetRange,
  reconciliationCsv,
  rowKey,
  shiftRange,
  sortAccountsByAttention,
  summarize,
  viewCurrencies,
  viewForCurrency,
  type ReconView,
} from './reconciliation.lib';
import { shiftDays, todayKey } from './treasury.lib';
import { useBankAccounts, useReconciliation } from './treasury.api';

/**
 * /payments/reconciliation — the bank reconciliation console.
 *
 * Checks, day by day and account by account, the system's bank tenders and
 * paid expenses against the bank's own statement totals (typed in until a bank
 * statement API exists). Same layout as the other consoles:
 *
 * 1. sticky command bar: period, scope, view, status chips
 * 2. health band: how much is checked, in/out side by side, what is left
 * 3. stat rail: filterable counts and the money figures
 * 4. likely causes: open slips and unbooked webhooks
 * 5. one of three views: ledger · calendar matrix · accounts
 * 6. day drawer: compare, enter the statement, the lines behind the totals
 *
 * All state lives in the URL (`from`, `to`, `branch`, `account`, `status`,
 * `view`, `day`), so a filtered range or an open day can be shared and survives a reload.
 */
export function ReconciliationPage() {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const isSuper = user?.role === 'SUPER_ADMIN';
  const canManage = hasPermission('payments:manage');
  const canReviewSlips = hasPermission('payments:review');
  const canReconcile = hasPermission('payments:reconcile');
  const [dialog, setDialog] = useState<'import' | 'period' | 'settings' | null>(null);
  const today = todayKey();

  // ── URL-backed state ─────────────────────────────────────────────
  const [params, setParams] = useSearchParams();
  const patch = useCallback(
    (p: Record<string, string | undefined>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(p)) {
            if (v == null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const def = presetRange('month', today);
  let to = isDateKey(params.get('to')) ? params.get('to')! : def.to;
  if (to > today) to = today;
  let from = isDateKey(params.get('from')) ? params.get('from')! : def.from;
  if (from > to) from = to;
  if (daysBetween(from, to) > MAX_RANGE_DAYS) from = shiftDays(to, -(MAX_RANGE_DAYS - 1));
  const branchId = params.get('branch') ?? '';
  const bankAccountId = params.get('account') ?? '';
  const rawStatus = params.get('status') ?? '';
  const status = (RECON_STATUSES as string[]).includes(rawStatus)
    ? (rawStatus as ReconciliationStatus)
    : '';
  const rawView = params.get('view') ?? '';
  const viewMode: ReconView = (RECON_VIEWS as readonly string[]).includes(rawView)
    ? (rawView as ReconView)
    : 'ledger';
  const dayParam = params.get('day');
  const [dayDate, dayAccount] = dayParam?.split('|') ?? [];
  const openTarget =
    isDateKey(dayDate) && dayAccount ? { date: dayDate, bankAccountId: dayAccount } : null;

  // ── data ─────────────────────────────────────────────────────────
  const { data: branches = [] } = useBranches();
  const accountsQ = useBankAccounts(isSuper ? branchId || undefined : undefined);
  const { data, isLoading, isError } = useReconciliation({
    from,
    to,
    ...(branchId ? { branchId } : {}),
    ...(bankAccountId ? { bankAccountId } : {}),
  });

  // G6 — never add LAK to USD: with more than one currency the page shows one at a time.
  const currencies = useMemo(() => viewCurrencies(data), [data]);
  const rawCur = params.get('cur');
  const currency =
    currencies.length > 1
      ? rawCur && currencies.includes(rawCur)
        ? rawCur
        : currencies[0]!
      : null;
  const view = useMemo(() => viewForCurrency(data, currency), [data, currency]);

  const summary = useMemo(() => summarize(view), [view]);
  const accounts = useMemo(() => sortAccountsByAttention(accountStats(view)), [view]);
  const allRows = useMemo(() => view?.rows ?? [], [view]);
  const timingPairs = useMemo(() => findTimingPairs(allRows), [allRows]);
  const rows = useMemo(
    () => allRows.filter((r) => !status || r.status === status),
    [allRows, status],
  );
  const counts = {
    all: summary.rows,
    MATCHED: summary.matched,
    VARIANCE: summary.variance,
    RESOLVED: summary.resolved,
    UNRECONCILED: summary.unreconciled,
  };

  const openRow = useCallback(
    (r: Pick<ReconciliationRow, 'date' | 'bankAccountId'>) => patch({ day: rowKey(r) }),
    [patch],
  );
  const openCell = useCallback(
    (acct: string, date: string) => patch({ day: `${date}|${acct}` }),
    [patch],
  );
  const fallback = openTarget
    ? (allRows.find((r) => rowKey(r) === `${openTarget.date}|${openTarget.bankAccountId}`) ?? null)
    : null;

  const enterNext = summary.oldestUnreconciled ? () => openRow(summary.oldestUnreconciled!) : null;
  const toggleStatus = (s: ReconciliationStatus) => patch({ status: status === s ? undefined : s });

  const onExport = () => downloadCsv(`reconciliation_${from}_${to}.csv`, reconciliationCsv(rows));

  return (
    <div className="space-y-4">
      <ReconCommandBar
        from={from}
        to={to}
        onRange={(f, tt) => patch({ from: f, to: tt })}
        onShift={(dir) => {
          const r = shiftRange(from, to, dir, today);
          patch({ from: r.from, to: r.to });
        }}
        isSuper={isSuper}
        branchId={branchId}
        onBranch={(id) => patch({ branch: id, account: undefined })}
        branches={branches}
        bankAccountId={bankAccountId}
        onAccount={(id) => patch({ account: id })}
        accounts={(accountsQ.data ?? []).map((a) => ({
          id: a.id,
          label: `${a.bank.code} · ${a.accountName}`,
        }))}
        view={viewMode}
        onView={(v) => patch({ view: v === 'ledger' ? undefined : v })}
        status={status}
        onStatus={(s) => patch({ status: s || undefined })}
        counts={counts}
        onClearFilters={() => patch({ branch: undefined, account: undefined, status: undefined })}
        canManage={canManage}
        onEnterNext={enterNext}
        onExport={onExport}
        exportDisabled={rows.length === 0}
        onImport={canReconcile ? () => setDialog('import') : null}
        onPeriods={() => setDialog('period')}
        onSettings={() => setDialog('settings')}
        currencies={currencies}
        currency={currency}
        onCurrency={(c) => patch({ cur: c, account: undefined })}
      />

      {viewMode === 'cash' ? (
        <ReconCashDrawer
          branchId={isSuper ? branchId : (user?.branchId ?? '')}
          branches={branches}
          onBranch={isSuper ? (id) => patch({ branch: id || undefined, account: undefined }) : null}
          canOperate={canManage || canReconcile}
        />
      ) : (
        <>
          <ReconHealthCard
            view={view}
            summary={summary}
            loading={isLoading}
            canManage={canManage}
            onOpenRow={openRow}
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
            <StatTile
              index={0}
              icon={CircleAlert}
              tone="danger"
              label={t('payTreasury.recon.stat.variance')}
              value={summary.variance}
              hint={t('payTreasury.recon.stat.varianceHint')}
              onClick={() => toggleStatus('VARIANCE')}
              active={status === 'VARIANCE'}
              loading={isLoading}
            />
            <StatTile
              index={1}
              icon={FileQuestion}
              tone="warning"
              label={t('payTreasury.recon.stat.unreconciled')}
              value={summary.unreconciled}
              hint={t('payTreasury.recon.stat.unreconciledHint')}
              onClick={() => toggleStatus('UNRECONCILED')}
              active={status === 'UNRECONCILED'}
              loading={isLoading}
            />
            <StatTile
              index={2}
              icon={Scale}
              tone="success"
              label={t('payTreasury.recon.stat.matched')}
              value={summary.matched}
              hint={t('payTreasury.recon.stat.matchedHint')}
              onClick={() => toggleStatus('MATCHED')}
              active={status === 'MATCHED'}
              loading={isLoading}
            />
            <StatTile
              index={3}
              icon={ArrowDownLeft}
              tone="primary"
              label={t('payTreasury.recon.stat.systemIn')}
              value={
                <CurrencyText
                  amount={view?.totals.systemCredit ?? 0}
                  currency={(currency ?? 'LAK') as 'LAK'}
                />
              }
              hint={t('payTreasury.recon.stat.systemInHint')}
              loading={isLoading}
            />
            <StatTile
              index={4}
              icon={ArrowUpRight}
              tone="accent"
              label={t('payTreasury.recon.stat.systemOut')}
              value={
                <CurrencyText
                  amount={view?.totals.systemDebit ?? 0}
                  currency={(currency ?? 'LAK') as 'LAK'}
                />
              }
              hint={t('payTreasury.recon.stat.systemOutHint')}
              loading={isLoading}
            />
            <StatTile
              index={5}
              icon={BadgeCheck}
              tone="info"
              label={t('payTreasury.recon.stat.resolved')}
              value={summary.resolved}
              hint={t('payTreasury.recon.stat.resolvedHint')}
              onClick={() => toggleStatus('RESOLVED')}
              active={status === 'RESOLVED'}
              loading={isLoading}
            />
          </div>

          {view ? (
            <ReconCausesPanel
              view={view}
              canReviewSlips={canReviewSlips}
              timingPairs={timingPairs}
              canReconcile={canReconcile}
            />
          ) : null}

          {viewMode === 'ledger' ? (
            <ReconLedger
              rows={rows}
              loading={isLoading}
              isError={isError}
              canManage={canManage}
              onOpen={openRow}
              filtered={Boolean(status)}
            />
          ) : viewMode === 'calendar' ? (
            <ReconCalendar
              from={from}
              to={to}
              accounts={accounts}
              statusFilter={status}
              canManage={canManage}
              onOpen={openCell}
            />
          ) : (
            <ReconAccounts
              from={from}
              to={to}
              accounts={accounts}
              loading={isLoading}
              canManage={canManage}
              onLedger={(id) => patch({ account: id, view: undefined })}
              onOpen={openCell}
            />
          )}
        </>
      )}

      <ReconDaySheet
        target={openTarget}
        fallback={fallback}
        canManage={canManage}
        canReconcile={canReconcile}
        currentUserName={user?.name ?? null}
        isSuper={isSuper}
        onClose={() => patch({ day: undefined })}
        onNavigate={(date) => openTarget && patch({ day: `${date}|${openTarget.bankAccountId}` })}
      />

      <ReconImportDialog
        open={dialog === 'import'}
        onClose={() => setDialog(null)}
        accounts={(accountsQ.data ?? []).map((a) => ({
          id: a.id,
          label: `${a.bank.code} · ${a.accountName}`,
        }))}
        defaultAccountId={bankAccountId}
        onImported={(f, tt) => {
          const end = tt > today ? today : tt;
          const start =
            daysBetween(f, end) > MAX_RANGE_DAYS ? shiftDays(end, -(MAX_RANGE_DAYS - 1)) : f;
          patch({ from: start < from ? start : from, to: end > to ? end : to });
        }}
      />
      <ReconPeriodDialog
        open={dialog === 'period'}
        onClose={() => setDialog(null)}
        isSuper={isSuper}
        branches={branches}
        defaultBranchId={branchId || user?.branchId || branches[0]?.id || ''}
        canReconcile={canReconcile}
        onReview={(month, b) => {
          const last = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate();
          patch({
            from: `${month}-01`,
            to: `${month}-${String(last).padStart(2, '0')}`,
            ...(isSuper ? { branch: b } : {}),
            status: undefined,
          });
        }}
      />
      <ReconSettingsDialog
        open={dialog === 'settings'}
        onClose={() => setDialog(null)}
        canEdit={isSuper}
      />
    </div>
  );
}
