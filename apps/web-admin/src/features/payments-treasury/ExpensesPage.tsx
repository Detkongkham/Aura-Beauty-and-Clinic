import type { ExpenseStatus, ExpenseView } from '@abcp/shared-types';
import { CalendarDays, FilePen, Layers, Receipt, Repeat, Trophy } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { CurrencyText } from '@/components/shared';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { StatTile } from '@/features/payroll/payroll.parts';
import { downloadCsv } from '@/features/reports/lib/csv';
import { useConfirm } from '@/hooks/useConfirm';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrency } from '@/lib/format';
import { NormalizedApiError } from '@/services/apiError';

import { ExpenseAdminSheet } from './ExpenseAdminSheet';
import { ExpenseBoard } from './ExpenseBoard';
import { ExpenseDialog } from './ExpenseDialog';
import { ExpenseInsights } from './ExpenseInsights';
import { ExpenseSheet } from './ExpenseSheet';
import { ExpenseTable } from './ExpenseTable';
import { ExpensesCommandBar } from './ExpensesCommandBar';
import { PayExpenseDialog } from './PayExpenseDialog';
import { SpendHero } from './SpendHero';
import {
  fetchAllExpenses,
  useBulkExpenseAction,
  useExpenseCategories,
  useExpenseStatusCounts,
  useExpenseSummary,
  useExpenses,
  useProfitLoss,
} from './expenses.api';
import {
  EXPENSE_LIST_FLAGS,
  EXPENSE_LIST_SORTS,
  EXPENSE_STATUSES,
  EXPENSE_VIEWS,
  categoryName,
  isDateKey,
  oneOf,
  presetRange,
  spanDays,
} from './expenses.lib';

type PayTarget = { ids: string[]; branchId: string | null; currency: string | null; amount: number; clear?: () => void };

/**
 * /payments/expenses — the spend command center.
 *
 * Same skeleton as the other consoles (payroll, appointments, queue): a sticky command bar owns every
 * control that narrows the page; the spend band answers "how much, vs usual, and what is waiting on
 * me"; a tile rail surfaces the handful of figures worth a glance; then one of three views renders
 * the same filtered set — list (process), board (pipeline), insights (analyse). Opening an expense
 * is a drawer, never a navigation.
 *
 * All state lives in the URL, so a filtered view — "last month, Rent, awaiting approval" — is
 * shareable and survives a reload; `?id=` deep-links straight to one expense.
 */
export function ExpensesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'lo';
  const { user, hasPermission } = useAuth();
  const canManage = hasPermission('expenses:manage');
  const canApprove = hasPermission('expenses:approve');
  const isSuper = user?.role === 'SUPER_ADMIN';
  const confirm = useConfirm();
  const searchRef = useRef<HTMLInputElement>(null);

  // ── URL-backed state ─────────────────────────────────────────────
  const [params, setParams] = useSearchParams();
  const read = useCallback((k: string) => params.get(k) ?? undefined, [params]);
  const patch = useCallback(
    (next: Record<string, string | undefined>, opts: { resetPage?: boolean } = {}) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(next)) {
            if (v == null || v === '') p.delete(k);
            else p.set(k, v);
          }
          if (opts.resetPage !== false) p.delete('page');
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const month = presetRange('month');
  const rawFrom = read('from');
  const rawTo = read('to');
  const from = isDateKey(rawFrom) ? rawFrom : month.from;
  const to = isDateKey(rawTo) && rawTo >= from ? rawTo : isDateKey(rawTo) ? from : month.to;
  const branchId = isSuper ? (read('branch') ?? '') : '';
  const status = oneOf(EXPENSE_STATUSES, read('status')) ?? '';
  const flag = oneOf(EXPENSE_LIST_FLAGS, read('flag')) ?? '';
  const sort = oneOf(EXPENSE_LIST_SORTS, read('sort')) ?? 'newest';
  const view = oneOf(EXPENSE_VIEWS, read('view')) ?? 'list';
  const categoryId = read('cat') ?? '';
  const page = Math.max(1, Number(read('page') ?? 1) || 1);
  const pageSize = Math.max(1, Number(read('size') ?? 25) || 25);
  const openId = read('id') ?? null;

  const [search, setSearch] = useState(() => read('q') ?? '');
  const q = useDebounce(search.trim(), 250);
  useEffect(() => {
    if ((params.get('q') ?? '') !== q) patch({ q });
    // Only mirror the settled query into the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, patch]);

  const [formFor, setFormFor] = useState<ExpenseView | 'new' | null>(null);
  const [template, setTemplate] = useState<ExpenseView | null>(null);
  const [adminOpen, setAdminOpen] = useState<false | 'recurring' | 'budgets'>(false);
  const [payTarget, setPayTarget] = useState<PayTarget | null>(null);
  const [exporting, setExporting] = useState(false);

  // `/` focuses search, `n` opens a new expense — matching the other consoles.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[role="dialog"]')) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if ((e.key === 'n' || e.key === 'N') && canManage) {
        e.preventDefault();
        setTemplate(null);
        setFormFor('new');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canManage]);

  // ── data ─────────────────────────────────────────────────────────
  const { data: branches = [] } = useBranches();
  const { data: categories = [] } = useExpenseCategories();
  const myBranches = useMemo(
    () => (isSuper ? branches : branches.filter((b) => b.id === user?.branchId)).map((b) => ({ id: b.id, name: b.name })),
    [isSuper, branches, user?.branchId],
  );
  const scope = { ...(branchId ? { branchId } : {}), from, to };
  const filters = {
    ...scope,
    ...(categoryId ? { categoryId } : {}),
    ...(flag ? { flag } : {}),
    ...(q ? { q } : {}),
  };
  const summaryQ = useExpenseSummary(scope);
  const countsQ = useExpenseStatusCounts(filters);
  const pnlQ = useProfitLoss({ ...(branchId ? { branchId } : {}), from: from.slice(0, 7), to: to.slice(0, 7) });
  const listQ = useExpenses({ ...filters, ...(status ? { status } : {}), sort, page, pageSize });
  const boardQ = useExpenses({ ...filters, sort: 'oldest', page: 1, pageSize: 200 }, { enabled: view === 'board' });
  const bulk = useBulkExpenseAction();

  const summary = summaryQ.data;
  // Tab counts follow the same category/flag/search filters as the list (E12); tiles use the period summary.
  const statusCounts = useMemo(
    () => (countsQ.data ?? Object.fromEntries((summary?.byStatus ?? []).map((s) => [s.status, s.count]))) as Partial<Record<ExpenseStatus, number>>,
    [countsQ.data, summary],
  );
  const periodCounts = useMemo(
    () => Object.fromEntries((summary?.byStatus ?? []).map((s) => [s.status, s.count])) as Partial<Record<ExpenseStatus, number>>,
    [summary],
  );
  const rows = useMemo(() => listQ.data?.items ?? [], [listQ.data]);
  const boardRows = useMemo(() => boardQ.data?.items ?? [], [boardQ.data]);
  const known = useMemo(() => new Map([...rows, ...boardRows].map((e) => [e.id, e])), [rows, boardRows]);

  // ── actions ──────────────────────────────────────────────────────
  const reportBulk = useCallback(
    (res: { succeeded: string[]; failed: { message: string }[] }, okKey: string, clear?: () => void) => {
      if (res.succeeded.length) toast.success(t(okKey, { count: res.succeeded.length }));
      if (res.failed.length) toast.error(t('payTreasury.exp.toast.someFailed', { count: res.failed.length, reason: res.failed[0]!.message }));
      if (res.succeeded.length) clear?.();
    },
    [t],
  );
  const onBulkError = useCallback((err: unknown) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')), [t]);

  const pick = useCallback((ids: string[], ok: (e: ExpenseView) => boolean) => ids.map((id) => known.get(id)).filter((e): e is ExpenseView => Boolean(e && ok(e))), [known]);

  const onSubmit = useCallback(
    (ids: string[], clear?: () => void) => {
      const targets = pick(ids, (e) => e.status === 'DRAFT' || e.status === 'REJECTED');
      if (!targets.length) return;
      bulk.mutate({ action: 'submit', ids: targets.map((e) => e.id) }, { onSuccess: (r) => reportBulk(r, 'payTreasury.exp.toast.submitted', clear), onError: onBulkError });
    },
    [pick, bulk, reportBulk, onBulkError],
  );

  const onApprove = useCallback(
    async (ids: string[], clear?: () => void) => {
      // Over-limit items need the owner — leave them out rather than letting the server reject them one by one.
      const targets = pick(ids, (e) => e.status === 'SUBMITTED' && (isSuper || !e.needsOwnerApproval));
      if (!targets.length) return;
      if (targets.length > 1) {
        const ok = await confirm({
          title: t('payTreasury.exp.confirmApprove.title', { count: targets.length }),
          description: t('payTreasury.exp.confirmApprove.body', {
            count: targets.length,
            amount: formatCurrency(targets.reduce((s, e) => s + e.amountBase, 0)),
          }),
          confirmLabel: t('payTreasury.exp.approve'),
        });
        if (!ok) return;
      }
      bulk.mutate({ action: 'approve', ids: targets.map((e) => e.id) }, { onSuccess: (r) => reportBulk(r, 'payTreasury.exp.toast.approved', clear), onError: onBulkError });
    },
    [pick, confirm, t, bulk, reportBulk, onBulkError, isSuper],
  );

  const onPay = useCallback(
    (ids: string[], clear?: () => void) => {
      const targets = pick(ids, (e) => e.status === 'APPROVED');
      if (!targets.length) return;
      const branches = new Set(targets.map((e) => e.branchId));
      const currencies = new Set(targets.map((e) => e.currency));
      setPayTarget({
        ids: targets.map((e) => e.id),
        branchId: branches.size === 1 ? targets[0]!.branchId : null,
        currency: currencies.size === 1 ? targets[0]!.currency : null,
        amount: targets.reduce((s, e) => s + e.amount, 0),
        clear,
      });
    },
    [pick],
  );

  const exportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const { items, truncated } = await fetchAllExpenses({ ...filters, ...(status ? { status } : {}), sort });
      downloadCsv(`expenses-${from}_${to}`, [
        [
          t('payTreasury.exp.date'),
          t('payTreasury.exp.title'),
          t('payTreasury.exp.category'),
          t('payTreasury.exp.kindLabel'),
          t('payTreasury.col.branch'),
          t('payTreasury.exp.supplier'),
          t('payTreasury.exp.po'),
          t('payTreasury.exp.amount'),
          t('payTreasury.col.currency'),
          t('payTreasury.col.status'),
          t('payTreasury.exp.createdBy'),
          t('payTreasury.exp.approvedBy'),
          t('payTreasury.exp.paidAt'),
          t('payTreasury.exp.paidFrom'),
          t('payTreasury.exp.reference'),
          t('payTreasury.exp.attachments'),
          t('payTreasury.exp.notes'),
        ],
        ...items.map((e) => [
          e.expenseDate,
          e.title,
          categoryName(e.category, lang),
          t(`payTreasury.exp.kind.${e.category.kind}`),
          e.branchName,
          e.supplier?.name,
          e.purchaseOrder?.poNumber,
          e.amount,
          e.currency,
          t(`payTreasury.exp.status.${e.status}`),
          e.createdBy.name,
          e.approvedBy?.name,
          e.paidAt,
          e.paidFromAccount ? `${e.paidFromAccount.bankCode} ${e.paidFromAccount.accountNumber}` : e.status === 'PAID' ? t('payTreasury.exp.cash') : '',
          e.paidReference,
          e.attachments.length,
          e.notes,
        ]),
      ]);
      if (truncated) toast.info(t('payTreasury.exp.exportTruncated', { count: items.length }));
    } catch {
      toast.error(t('common.saveError'));
    } finally {
      setExporting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters), status, sort, from, to, lang, t]);

  // ── tiles ────────────────────────────────────────────────────────
  const loadingTiles = summaryQ.isLoading && !summary;
  const recognisedCount = (periodCounts.APPROVED ?? 0) + (periodCounts.PAID ?? 0);
  const days = spanDays(from, to);
  const topCat = summary?.byCategory[0];
  const biggest = summary?.largest[0];
  const countDelta = summary && summary.previous.count > 0 ? Math.round(((recognisedCount - summary.previous.count) / summary.previous.count) * 100) : null;

  const setStatus = (s: ExpenseStatus | '') => patch({ status: s, ...(view === 'insights' ? { view: 'list' } : {}) });

  return (
    <div className="space-y-4">
      <ExpensesCommandBar
        from={from}
        to={to}
        onPeriod={(f, tt) => patch({ from: f, to: tt })}
        onPreset={(p) => {
          const r = presetRange(p);
          patch({ from: p === 'month' ? undefined : r.from, to: p === 'month' ? undefined : r.to });
        }}
        branchId={branchId}
        onBranch={(id) => patch({ branch: id })}
        branches={myBranches}
        showBranch={isSuper}
        view={view}
        onView={(v) => patch({ view: v === 'list' ? undefined : v }, { resetPage: false })}
        search={search}
        onSearch={setSearch}
        searchRef={searchRef}
        sort={sort}
        onSort={(s) => patch({ sort: s === 'newest' ? undefined : s })}
        status={status}
        onStatus={(s) => patch({ status: s })}
        statusCounts={statusCounts}
        flag={flag}
        onFlag={(f) => patch({ flag: f })}
        categoryId={categoryId}
        onCategory={(id) => patch({ cat: id })}
        categories={categories}
        lang={lang}
        onClearFilters={() => {
          setSearch('');
          patch({ q: undefined, branch: undefined, status: undefined, flag: undefined, cat: undefined, from: undefined, to: undefined });
        }}
        total={listQ.data?.total}
        canManage={canManage}
        onNew={() => {
          setTemplate(null);
          setFormFor('new');
        }}
        onSettings={() => setAdminOpen('recurring')}
        onExport={() => void exportCsv()}
        exporting={exporting}
      />

      <SpendHero
        summary={summary}
        loading={summaryQ.isLoading && !summary}
        canApprove={canApprove}
        onReviewQueue={() => patch({ status: 'SUBMITTED', flag: undefined, view: undefined, sort: 'oldest' })}
        onPayQueue={() => patch({ status: 'APPROVED', flag: undefined, view: undefined, sort: 'oldest' })}
        onMissingReceipts={() => patch({ flag: 'missingReceipt', status: undefined, view: undefined })}
        onOverdue={() => patch({ flag: 'overdue', status: undefined, view: undefined, sort: 'oldest' })}
        onBudget={() => patch({ view: 'insights' }, { resetPage: false })}
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile
          index={0}
          icon={Receipt}
          tone="primary"
          label={t('payTreasury.exp.tile.recognised')}
          value={recognisedCount}
          delta={countDelta == null ? null : { pct: countDelta, good: null }}
          hint={
            <>
              {t('payTreasury.exp.tile.avgEach')} <CurrencyText amount={recognisedCount ? (summary?.recognisedTotal ?? 0) / recognisedCount : 0} />
            </>
          }
          loading={loadingTiles}
        />
        <StatTile
          index={1}
          icon={CalendarDays}
          tone="info"
          label={t('payTreasury.exp.tile.perDay')}
          value={<CurrencyText amount={(summary?.recognisedTotal ?? 0) / days} />}
          hint={t('payTreasury.exp.tile.overDays', { count: days })}
          loading={loadingTiles}
        />
        <StatTile
          index={2}
          icon={Layers}
          tone="accent"
          label={t('payTreasury.exp.tile.topCategory')}
          value={topCat ? categoryName(topCat, lang) : '—'}
          hint={
            topCat && summary ? (
              <>
                <CurrencyText amount={topCat.amount} /> · {summary.recognisedTotal > 0 ? Math.round((topCat.amount / summary.recognisedTotal) * 100) : 0}%
              </>
            ) : (
              t('payTreasury.exp.noSpend')
            )
          }
          onClick={topCat ? () => patch({ cat: categoryId === topCat.categoryId ? undefined : topCat.categoryId }) : undefined}
          active={Boolean(topCat && categoryId === topCat.categoryId)}
          loading={loadingTiles}
        />
        <StatTile
          index={3}
          icon={Trophy}
          tone="warning"
          label={t('payTreasury.exp.tile.largest')}
          value={biggest ? <CurrencyText amount={biggest.amount} currency={biggest.currency as 'LAK'} /> : '—'}
          hint={biggest?.title ?? t('payTreasury.exp.noSpend')}
          onClick={biggest ? () => patch({ id: biggest.id }, { resetPage: false }) : undefined}
          loading={loadingTiles}
        />
        <StatTile
          index={4}
          icon={Repeat}
          tone="success"
          label={t('payTreasury.exp.tile.fixed')}
          value={<CurrencyText amount={summary?.recurring.amount ?? 0} />}
          hint={t('payTreasury.exp.tile.fixedHint', { count: summary?.recurring.count ?? 0 })}
          onClick={() => patch({ flag: flag === 'recurring' ? undefined : 'recurring' })}
          active={flag === 'recurring'}
          loading={loadingTiles}
        />
        <StatTile
          index={5}
          icon={FilePen}
          tone="neutral"
          label={t('payTreasury.exp.tile.drafts')}
          value={(periodCounts.DRAFT ?? 0) + (periodCounts.REJECTED ?? 0)}
          hint={t('payTreasury.exp.tile.draftsHint', { count: periodCounts.REJECTED ?? 0 })}
          onClick={() => setStatus(status === 'DRAFT' ? '' : 'DRAFT')}
          active={status === 'DRAFT'}
          loading={loadingTiles}
        />
      </div>

      {view === 'list' ? (
        <ExpenseTable
          rows={rows}
          total={listQ.data?.total ?? 0}
          loading={listQ.isLoading}
          page={page}
          pageSize={pageSize}
          onPage={(p) => patch({ page: String(p) }, { resetPage: false })}
          onPageSize={(s) => patch({ size: String(s) })}
          categories={categories}
          lang={lang}
          showBranch={isSuper && !branchId}
          currentUserId={user?.id}
          isSuper={isSuper}
          canManage={canManage}
          canApprove={canApprove}
          busy={bulk.isPending}
          onOpen={(e) => patch({ id: e.id }, { resetPage: false })}
          onNew={() => {
            setTemplate(null);
            setFormFor('new');
          }}
          onSubmit={onSubmit}
          onApprove={(ids, clear) => void onApprove(ids, clear)}
          onPay={onPay}
        />
      ) : view === 'board' ? (
        <ExpenseBoard
          rows={boardRows}
          total={boardQ.data?.total ?? 0}
          loading={boardQ.isLoading}
          categories={categories}
          lang={lang}
          currentUserId={user?.id}
          isSuper={isSuper}
          canManage={canManage}
          canApprove={canApprove}
          busy={bulk.isPending}
          onOpen={(e) => patch({ id: e.id }, { resetPage: false })}
          onSubmit={onSubmit}
          onApprove={(ids) => void onApprove(ids)}
          onPay={onPay}
        />
      ) : (
        <ExpenseInsights
          summary={summary}
          pnl={pnlQ.data}
          loading={summaryQ.isLoading && !summary}
          pnlLoading={pnlQ.isLoading}
          categories={categories}
          lang={lang}
          showBranches={isSuper && !branchId}
          activeCategoryId={categoryId}
          onCategory={(id) => patch({ cat: id })}
          onOpenExpense={(id) => patch({ id }, { resetPage: false })}
          onSetBudgets={canApprove ? () => setAdminOpen('budgets') : undefined}
        />
      )}

      <ExpenseSheet
        expenseId={openId}
        categories={categories}
        onClose={() => patch({ id: undefined }, { resetPage: false })}
        onEdit={(e) => {
          setTemplate(null);
          setFormFor(e);
        }}
        onDuplicate={(e) => {
          patch({ id: undefined }, { resetPage: false });
          setTemplate(e);
          setFormFor('new');
        }}
      />
      <ExpenseDialog
        open={formFor !== null}
        onClose={() => {
          setFormFor(null);
          setTemplate(null);
        }}
        expense={formFor && formFor !== 'new' ? formFor : null}
        template={template}
        branches={myBranches}
        defaultBranchId={branchId || user?.branchId || undefined}
        onSaved={(e) => patch({ id: e.id }, { resetPage: false })}
        canAllocate={isSuper}
      />
      <ExpenseAdminSheet
        open={adminOpen !== false}
        initialTab={adminOpen || 'recurring'}
        onClose={() => setAdminOpen(false)}
        branches={myBranches}
        defaultBranchId={user?.branchId ?? undefined}
        canManage={canManage}
        canApprove={canApprove}
        isSuper={isSuper}
      />
      <PayExpenseDialog
        open={payTarget !== null}
        onClose={() => setPayTarget(null)}
        branchId={payTarget?.branchId ?? null}
        currency={payTarget?.currency ?? null}
        count={payTarget?.ids.length ?? 0}
        amount={payTarget?.amount ?? 0}
        busy={bulk.isPending}
        onConfirm={(input) => {
          if (!payTarget) return;
          const target = payTarget;
          bulk.mutate(
            { action: 'pay', ids: target.ids, ...input },
            {
              onSuccess: (r) => {
                reportBulk(r, 'payTreasury.exp.toast.paid', target.clear);
                setPayTarget(null);
              },
              onError: onBulkError,
            },
          );
        }}
      />
    </div>
  );
}
