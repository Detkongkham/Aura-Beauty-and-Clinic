import type { PayrollRow } from '@abcp/shared-types';
import { Banknote, Gift, Receipt, Target, TriangleAlert, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { CurrencyText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { useConfirm } from '@/hooks/useConfirm';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrency } from '@/lib/format';
import { NormalizedApiError } from '@/services/apiError';

import { PayRunCard } from './PayRunCard';
import { PayRunsPanel } from './PayRunsPanel';
import { PayrollCommandBar } from './PayrollCommandBar';
import { PayrollInsights } from './PayrollInsights';
import { PayrollLeaderboard } from './PayrollLeaderboard';
import { PayrollRoster } from './PayrollRoster';
import { StaffPayslipSheet } from './StaffPayslipSheet';
import {
  downloadPayrollCsv,
  usePayCommissions,
  usePayCommissionsBulk,
  usePayrollReport,
  useRecomputeKpi,
  useSetBonusPaid,
  useSetBonusPaidBulk,
  useSetKpiGoal,
} from './payroll.api';
import {
  FLAG_TEST,
  PAYROLL_FLAGS,
  SORTERS,
  SORT_KEYS,
  VIEW_MODES,
  commissionPayableNow,
  currentMonthYear,
  deltaPct,
  monthLabel,
  type PayrollFlag,
  type SortKey,
  type ViewMode,
} from './payroll.lib';
import { StatTile } from './payroll.parts';

/** `YYYY-MM`, and nothing else — a malformed URL param must not reach the API. */
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * /staff/payroll — the pay-run command center.
 *
 * Structure mirrors the other consoles in this app: a sticky command bar owns
 * every control that narrows the page; the pay-run band answers the money
 * question for the *whole* filtered month; a tile row exposes the handful of
 * states worth filtering by; and one of three views (roster · leaderboard ·
 * insights) renders the same set of people. Opening someone is a drawer, not a
 * navigation, so the month you were reading survives.
 *
 * Filter state lives in the URL, so a filtered month is shareable and survives
 * a reload — the previous version kept it in component state and lost it on
 * every refresh.
 */
export function PayrollPage() {
  const { t, i18n } = useTranslation();
  const { hasPermission, role } = useAuth();
  const canManage = hasPermission('staff:manage');
  const confirm = useConfirm();
  const { data: branches } = useBranches();
  const searchRef = useRef<HTMLInputElement>(null);

  // ── URL-backed state ─────────────────────────────────────────────
  const [params, setParams] = useSearchParams();
  const read = useCallback((key: string) => params.get(key) ?? undefined, [params]);

  const patchParams = useCallback(
    (patch: Record<string, string | undefined>, opts: { resetPage?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === '') next.delete(k);
            else next.set(k, v);
          }
          if (opts.resetPage !== false) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const rawMonth = read('month');
  const monthYear = rawMonth && MONTH_RE.test(rawMonth) ? rawMonth : currentMonthYear();
  const branchId = read('branch') ?? '';
  const view = (VIEW_MODES as readonly string[]).includes(read('view') ?? '')
    ? (read('view') as ViewMode)
    : 'roster';
  const sort = (SORT_KEYS as readonly string[]).includes(read('sort') ?? '')
    ? (read('sort') as SortKey)
    : 'revenue';
  const flags = (read('flags') ?? '')
    .split(',')
    .filter((f): f is PayrollFlag => (PAYROLL_FLAGS as readonly string[]).includes(f));
  const page = Math.max(1, Number(read('page') ?? 1) || 1);
  const pageSize = Math.max(1, Number(read('size') ?? 25) || 25);
  const openId = read('id') ?? null;

  const [search, setSearch] = useState(() => read('q') ?? '');
  const debouncedSearch = useDebounce(search, 250);

  // Search is typed locally and mirrored into the URL once it settles, so the
  // address bar doesn't churn on every keystroke.
  useEffect(() => {
    if ((params.get('q') ?? '') !== debouncedSearch) {
      patchParams({ q: debouncedSearch });
    }
    // `params` intentionally omitted: this effect only reacts to the settled query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, patchParams]);

  // `/` focuses search, matching the other consoles.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── data ─────────────────────────────────────────────────────────
  const { data, isLoading } = usePayrollReport({
    monthYear,
    branchId: branchId || undefined,
  });
  const recompute = useRecomputeKpi();
  const payComm = usePayCommissions();
  const payCommBulk = usePayCommissionsBulk();
  const setBonusPaid = useSetBonusPaid();
  const setBonusPaidBulk = useSetBonusPaidBulk();
  const saveTarget = useSetKpiGoal();
  const [downloading, setDownloading] = useState(false);
  const [targetFor, setTargetFor] = useState<PayrollRow | null>(null);

  const busy =
    payComm.isPending || payCommBulk.isPending || setBonusPaid.isPending || setBonusPaidBulk.isPending;

  const allRows = useMemo(() => data?.rows ?? [], [data]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const rows = allRows.filter((r) => {
      if (q && !r.staffName.toLowerCase().includes(q) && !r.branchName.toLowerCase().includes(q)) {
        return false;
      }
      return flags.every((f) => FLAG_TEST[f](r));
    });
    return [...rows].sort(SORTERS[sort]);
    // `flags` is derived from the URL string each render; join it so the memo
    // doesn't re-run on every identical array instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allRows, debouncedSearch, flags.join(','), sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const openRow = openId ? (allRows.find((r) => r.staffProfileId === openId) ?? null) : null;

  const totals = data?.totals;
  const avgPerStaff = totals && totals.staff > 0 ? totals.grossRevenue / totals.staff : 0;
  const avgTicket =
    totals && totals.completedJobs > 0 ? totals.grossRevenue / totals.completedJobs : 0;

  // `good` stays null without a baseline, so "no comparison" renders muted rather
  // than as a green win.
  const revenueDelta = useMemo(() => {
    if (!data) return null;
    const pct = deltaPct(data.totals.grossRevenue, data.previous.grossRevenue);
    return { pct, good: pct == null ? null : pct >= 0 };
  }, [data]);

  // ── actions ──────────────────────────────────────────────────────
  const onError = useCallback(
    (err: unknown) =>
      toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
    [t],
  );

  /** Success toast + a follow-up note when some commission stayed held (bill not collected). */
  const announcePaid = useCallback(
    (message: string, held: number) => {
      toast.success(message);
      if (held > 0) toast.info(t('payroll.heldAfterPay', { amount: formatCurrency(held) }));
    },
    [t],
  );

  const payOne = useCallback(
    async (row: PayrollRow) => {
      const ok = await confirm({
        title: t('payroll.confirmPay.title'),
        description: t('payroll.confirmPay.body', {
          name: row.staffName,
          amount: formatCurrency(commissionPayableNow(row)),
          month: monthLabel(monthYear, i18n.language),
        }),
        confirmLabel: t('payroll.payCommission'),
      });
      if (!ok) return;
      payComm.mutate(
        {
          staffProfileId: row.staffProfileId,
          monthYear,
          isPaid: true,
          branchId: branchId || undefined,
        },
        { onSuccess: (res) => announcePaid(t('payroll.commissionsPaid'), res.held), onError },
      );
    },
    [confirm, t, i18n.language, monthYear, branchId, payComm, onError, announcePaid],
  );

  const payBonusOne = useCallback(
    (row: PayrollRow) =>
      setBonusPaid.mutate(
        { staffProfileId: row.staffProfileId, input: { monthYear, isBonusPaid: true } },
        { onSuccess: () => toast.success(t('payroll.bonusMarkedPaid')), onError },
      ),
    [setBonusPaid, monthYear, t, onError],
  );

  const payMany = useCallback(
    async (ids: string[], clear?: () => void) => {
      const targets = allRows.filter(
        (r) => ids.includes(r.staffProfileId) && commissionPayableNow(r) > 0,
      );
      if (targets.length === 0) {
        toast.info(t('payroll.nothingToPay'));
        return;
      }
      const amount = targets.reduce((s, r) => s + commissionPayableNow(r), 0);
      const ok = await confirm({
        title: t('payroll.confirmPayBulk.title', { count: targets.length }),
        description: t('payroll.confirmPayBulk.body', {
          count: targets.length,
          amount: formatCurrency(amount),
          month: monthLabel(monthYear, i18n.language),
        }),
        confirmLabel: t('payroll.payCommission'),
      });
      if (!ok) return;
      payCommBulk.mutate(
        {
          staffProfileIds: targets.map((r) => r.staffProfileId),
          monthYear,
          isPaid: true,
          branchId: branchId || undefined,
        },
        {
          onSuccess: (res) => {
            announcePaid(t('payroll.commissionsPaidBulk', { count: res.staff }), res.held);
            clear?.();
          },
          onError,
        },
      );
    },
    [allRows, confirm, t, i18n.language, monthYear, branchId, payCommBulk, onError, announcePaid],
  );

  const bonusMany = useCallback(
    (ids: string[], clear?: () => void) => {
      const targets = allRows.filter(
        (r) => ids.includes(r.staffProfileId) && r.bonusAmount > 0 && !r.bonusPaid,
      );
      if (targets.length === 0) {
        toast.info(t('payroll.nothingToPay'));
        return;
      }
      setBonusPaidBulk.mutate(
        { staffProfileIds: targets.map((r) => r.staffProfileId), monthYear, isBonusPaid: true },
        {
          onSuccess: () => {
            toast.success(t('payroll.bonusMarkedPaid'));
            clear?.();
          },
          onError,
        },
      );
    },
    [allRows, setBonusPaidBulk, monthYear, t, onError],
  );

  const toggleFlag = useCallback(
    (f: PayrollFlag) => {
      const next = flags.includes(f) ? flags.filter((x) => x !== f) : [...flags, f];
      patchParams({ flags: next.join(',') });
    },
    [flags, patchParams],
  );

  const exportCsv = useCallback(async () => {
    setDownloading(true);
    try {
      await downloadPayrollCsv({ monthYear, branchId: branchId || undefined });
    } catch {
      toast.error(t('common.saveError'));
    } finally {
      setDownloading(false);
    }
  }, [monthYear, branchId, t]);

  return (
    <div className="space-y-4">
      <PayrollCommandBar
        monthYear={monthYear}
        onMonth={(m) => patchParams({ month: m })}
        branchId={branchId}
        onBranch={(id) => patchParams({ branch: id })}
        branches={branches ?? []}
        search={search}
        onSearch={setSearch}
        searchRef={searchRef}
        view={view}
        onView={(v) => patchParams({ view: v }, { resetPage: false })}
        sort={sort}
        onSort={(s) => patchParams({ sort: s })}
        flags={flags}
        onToggleFlag={toggleFlag}
        onClearFilters={() => {
          setSearch('');
          patchParams({ q: undefined, branch: undefined, flags: undefined });
        }}
        matched={filtered.length}
        total={allRows.length}
        canManage={canManage}
        onRecompute={() =>
          recompute.mutate(
            { monthYear, branchId: branchId || undefined },
            {
              onSuccess: (d) => toast.success(t('payroll.recomputed', { count: d.updated })),
              onError,
            },
          )
        }
        recomputing={recompute.isPending}
        onExport={exportCsv}
        exporting={downloading}
      />

      <PayRunCard
        report={data}
        loading={isLoading && !data}
        canManage={canManage}
        paying={busy}
        onPayAll={() =>
          void payMany(
            allRows.filter((r) => commissionPayableNow(r) > 0).map((r) => r.staffProfileId),
          )
        }
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile
          index={0}
          icon={Users}
          tone="primary"
          label={t('payroll.stat.staff')}
          value={totals?.staff ?? '—'}
          hint={t('payroll.stat.jobsCompleted', { count: totals?.completedJobs ?? 0 })}
          loading={isLoading && !data}
        />
        <StatTile
          index={1}
          icon={Receipt}
          tone="success"
          label={t('payroll.stat.gross')}
          value={<CurrencyText amount={totals?.grossRevenue ?? 0} />}
          delta={revenueDelta}
          hint={
            <>
              {t('payroll.stat.avgPerStaff')} <CurrencyText amount={avgPerStaff} />
            </>
          }
          loading={isLoading && !data}
        />
        <StatTile
          index={2}
          icon={Banknote}
          tone="info"
          label={t('payroll.stat.avgTicket')}
          value={<CurrencyText amount={avgTicket} />}
          hint={t('payroll.stat.avgTicketHint')}
          loading={isLoading && !data}
        />
        <StatTile
          index={3}
          icon={TriangleAlert}
          tone="warning"
          label={t('payroll.stat.commissionUnpaid')}
          value={<CurrencyText amount={totals?.commissionUnpaid ?? 0} />}
          hint={t('payroll.stat.staffOwed', {
            count: totals?.staffOwed ?? 0,
            total: totals?.staff ?? 0,
          })}
          onClick={() => toggleFlag('owing')}
          active={flags.includes('owing')}
          loading={isLoading && !data}
        />
        <StatTile
          index={4}
          icon={Gift}
          tone="accent"
          label={t('payroll.stat.bonusDue')}
          value={<CurrencyText amount={totals?.bonusUnpaid ?? 0} />}
          hint={t('payroll.bonusRateNote', { rate: Math.round((data?.bonusRate ?? 0) * 100) })}
          onClick={() => toggleFlag('bonusDue')}
          active={flags.includes('bonusDue')}
          loading={isLoading && !data}
        />
        <StatTile
          index={5}
          icon={Target}
          tone="primary"
          label={t('payroll.stat.targetsMet')}
          value={`${totals?.targetMetCount ?? 0}/${totals?.staffWithTarget ?? 0}`}
          hint={
            totals && totals.staff - totals.staffWithTarget > 0
              ? t('payroll.stat.noTargetCount', { count: totals.staff - totals.staffWithTarget })
              : t('payroll.stat.allTargetsSet')
          }
          onClick={() => toggleFlag('targetMet')}
          active={flags.includes('targetMet')}
          loading={isLoading && !data}
        />
      </div>

      {view === 'roster' ? (
        <PayrollRoster
          rows={filtered}
          pageRows={pageRows}
          report={data}
          loading={isLoading && !data}
          canManage={canManage}
          page={safePage}
          pageSize={pageSize}
          onPage={(p) => patchParams({ page: String(p) }, { resetPage: false })}
          onPageSize={(s) => patchParams({ size: String(s) })}
          onOpen={(r) => patchParams({ id: r.staffProfileId }, { resetPage: false })}
          onSetTarget={setTargetFor}
          onPayCommission={(r) => void payOne(r)}
          onPayBonus={payBonusOne}
          onBulkPay={(ids, clear) => void payMany(ids, clear)}
          onBulkBonus={bonusMany}
          busy={busy}
        />
      ) : view === 'leaderboard' ? (
        <PayrollLeaderboard
          rows={filtered}
          report={data}
          loading={isLoading && !data}
          onOpen={(r) => patchParams({ id: r.staffProfileId }, { resetPage: false })}
        />
      ) : view === 'runs' ? (
        <PayRunsPanel
          monthYear={monthYear}
          branchId={branchId}
          branches={(branches ?? []).map((b) => ({ id: b.id, name: b.name }))}
          rows={allRows}
          canManage={canManage}
          isOwner={role === 'SUPER_ADMIN'}
          onBranch={(id) => patchParams({ branch: id })}
        />
      ) : (
        <PayrollInsights rows={filtered} report={data} loading={isLoading && !data} />
      )}

      <StaffPayslipSheet
        row={openRow}
        monthYear={monthYear}
        canManage={canManage}
        onClose={() => patchParams({ id: undefined }, { resetPage: false })}
        onPayCommission={(r) => void payOne(r)}
        onPayBonus={payBonusOne}
        onSaveTarget={(r, target) =>
          saveTarget.mutate(
            { staffProfileId: r.staffProfileId, input: { monthYear, targetRevenue: target } },
            { onSuccess: () => toast.success(t('common.saved')), onError },
          )
        }
        savingTarget={saveTarget.isPending}
        busy={busy}
      />

      <TargetDialog row={targetFor} monthYear={monthYear} onClose={() => setTargetFor(null)} />
    </div>
  );
}

/** Quick target edit from the roster — the full editor lives in the payslip drawer. */
function TargetDialog({
  row,
  monthYear,
  onClose,
}: {
  row: PayrollRow | null;
  monthYear: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const save = useSetKpiGoal();
  const [target, setTarget] = useState('');

  useEffect(() => {
    setTarget(row && row.targetRevenue > 0 ? String(row.targetRevenue) : '');
  }, [row]);

  return (
    <Dialog
      open={Boolean(row)}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('payroll.targetTitle')}</DialogTitle>
        </DialogHeader>
        {row ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(target);
              if (!Number.isFinite(n) || n < 0) {
                toast.error(t('payroll.targetInvalid'));
                return;
              }
              save.mutate(
                { staffProfileId: row.staffProfileId, input: { monthYear, targetRevenue: n } },
                {
                  onSuccess: () => {
                    toast.success(t('common.saved'));
                    onClose();
                  },
                  onError: (err) =>
                    toast.error(
                      err instanceof NormalizedApiError ? err.message : t('common.saveError'),
                    ),
                },
              );
            }}
          >
            <p className="text-sm text-muted-foreground">
              {row.staffName} · {monthLabel(monthYear, i18n.language)}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="tgt">{t('payroll.targetRevenue')}</Label>
              <Input
                id="tgt"
                type="number"
                step="1000"
                min="0"
                inputMode="numeric"
                autoFocus
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={row.targetRevenue > 0 ? String(row.targetRevenue) : '0'}
              />
              <p className="text-2xs text-muted-foreground">
                {t('payroll.targetHint', {
                  actual: formatCurrency(row.actualRevenue),
                })}
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
