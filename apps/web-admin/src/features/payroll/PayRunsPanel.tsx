import type {
  PayrollAdjustmentType,
  PayrollRow,
  PayrollRunStatus,
  PayrollRunView,
  PayslipView,
} from '@abcp/shared-types';
import { PAYROLL_ADJUSTMENT_TYPES } from '@abcp/shared-types';
import {
  BadgeCheck,
  Banknote,
  Calculator,
  CircleDot,
  FileText,
  Lock,
  RotateCcw,
  Settings2,
  Target,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CurrencyText, DateTimeText } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useConfirm } from '@/hooks/useConfirm';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import {
  BulkTargetsDialog,
  PayRunPayDialog,
  PayRunReopenDialog,
  PayrollSettingsDialog,
  PayslipDialog,
  YtdCard,
} from './PayRunDialogs';
import { monthLabel } from './payroll.lib';
import {
  useCreateAdjustment,
  useDeleteAdjustment,
  usePayrollAdjustments,
  usePayrollRuns,
  usePrepareRun,
  useRunAction,
  usePayrollRun,
} from './payrollRuns.api';

const STATUS_VARIANT: Record<PayrollRunStatus, 'neutral' | 'warning' | 'success'> = {
  DRAFT: 'neutral',
  APPROVED: 'warning',
  PAID: 'success',
};
const STEPS: PayrollRunStatus[] = ['DRAFT', 'APPROVED', 'PAID'];

/**
 * Payroll P2 — pay runs for one month. One run per branch: prepare (DRAFT, recomputable) →
 * approve (owner; freezes the month) → pay (owner; settles commission/bonus, posts the salary expense).
 */
export function PayRunsPanel({
  monthYear,
  branchId,
  branches,
  rows,
  canManage,
  isOwner,
  onBranch,
}: {
  monthYear: string;
  branchId: string;
  branches: Array<{ id: string; name: string }>;
  rows: PayrollRow[];
  canManage: boolean;
  isOwner: boolean;
  onBranch: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const runsQ = usePayrollRuns(monthYear, branchId || undefined);
  const runs = useMemo(() => runsQ.data ?? [], [runsQ.data]);
  const current = branchId ? runs.find((r) => r.branchId === branchId) : undefined;
  const detail = usePayrollRun(current?.id ?? null);
  const run = detail.data ?? current;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [targetsOpen, setTargetsOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {t('payroll.runs.title', { month: monthLabel(monthYear, i18n.language) })}
        </h2>
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <Button variant="secondary" size="sm" onClick={() => setTargetsOpen(true)}>
              <Target className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('payroll.bulkTargets.open')}
            </Button>
          ) : null}
          {isOwner ? (
            <Button variant="secondary" size="sm" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('payroll.runs.settings')}
            </Button>
          ) : null}
        </div>
      </div>

      {!branchId ? (
        <RunsByBranch runs={runs} branches={branches} loading={runsQ.isLoading} onPick={onBranch} />
      ) : (
        <RunCard
          run={run}
          loading={runsQ.isLoading || detail.isLoading}
          branchId={branchId}
          monthYear={monthYear}
          canManage={canManage}
          isOwner={isOwner}
        />
      )}

      {branchId && run?.payslips ? <PayslipTable run={run} /> : null}

      {branchId ? (
        <AdjustmentsCard monthYear={monthYear} branchId={branchId} rows={rows} canManage={canManage} />
      ) : null}

      <YtdCard year={Number(monthYear.slice(0, 4))} branchId={branchId || undefined} />

      <PayrollSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <BulkTargetsDialog
        open={targetsOpen}
        monthYear={monthYear}
        branchId={branchId || undefined}
        onClose={() => setTargetsOpen(false)}
      />
    </div>
  );
}

function RunsByBranch({
  runs,
  branches,
  loading,
  onPick,
}: {
  runs: PayrollRunView[];
  branches: Array<{ id: string; name: string }>;
  loading: boolean;
  onPick: (id: string) => void;
}) {
  const { t } = useTranslation();
  const byBranch = new Map(runs.map((r) => [r.branchId, r]));
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="mb-3 text-xs text-muted-foreground">{t('payroll.runs.pickBranch')}</p>
      {loading ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {branches.map((b) => {
            const r = byBranch.get(b.id);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => onPick(b.id)}
                  className="flex w-full items-center justify-between gap-3 px-1 py-2.5 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0 truncate text-sm font-medium">{b.name}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    {r ? (
                      <>
                        <CurrencyText amount={r.totalNet} className="text-sm tabular-nums" />
                        <Badge variant={STATUS_VARIANT[r.status]}>{t(`payroll.runs.status_${r.status}`)}</Badge>
                      </>
                    ) : (
                      <Badge variant="neutral">{t('payroll.runs.none')}</Badge>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RunCard({
  run,
  loading,
  branchId,
  monthYear,
  canManage,
  isOwner,
}: {
  run: PayrollRunView | undefined;
  loading: boolean;
  branchId: string;
  monthYear: string;
  canManage: boolean;
  isOwner: boolean;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const prepare = usePrepareRun();
  const action = useRunAction();
  const [reopenOpen, setReopenOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const busy = prepare.isPending || action.isPending;
  const onError = (err: unknown) =>
    toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));

  const doPrepare = () =>
    prepare.mutate(
      { branchId, monthYear },
      { onSuccess: () => toast.success(t('payroll.runs.prepared')), onError },
    );

  const doApprove = async () => {
    if (!run) return;
    const ok = await confirm({
      title: t('payroll.runs.confirmApproveTitle'),
      description: t('payroll.runs.confirmApproveBody', {
        count: run.staffCount,
        amount: formatCurrency(run.totalNet),
      }),
      confirmLabel: t('payroll.runs.approve'),
    });
    if (!ok) return;
    action.mutate({ id: run.id, action: 'approve' }, { onSuccess: () => toast.success(t('payroll.runs.approved')), onError });
  };

  if (loading && !run) {
    return <div className="h-40 animate-pulse rounded-xl border border-border bg-muted/40" aria-busy="true" />;
  }

  if (!run) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-4 py-8 text-center">
        <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="max-w-md text-sm text-muted-foreground">{t('payroll.runs.emptyBody')}</p>
        {canManage ? (
          <Button disabled={busy} onClick={doPrepare}>
            <Calculator className="mr-1 h-4 w-4" aria-hidden="true" />
            {t('payroll.runs.prepare')}
          </Button>
        ) : null}
      </section>
    );
  }

  const stepIdx = STEPS.indexOf(run.status);
  return (
    <section className="rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] via-card to-card p-4 shadow-sm sm:p-5">
      {/* status stepper */}
      <ol className="mb-4 flex flex-wrap items-center gap-2" aria-label={t('payroll.runs.statusLabel')}>
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-semibold',
                i < stepIdx && 'bg-success-soft text-success',
                i === stepIdx && 'bg-primary text-primary-foreground',
                i > stepIdx && 'bg-muted text-muted-foreground',
              )}
              aria-current={i === stepIdx ? 'step' : undefined}
            >
              {i < stepIdx ? <BadgeCheck className="h-3 w-3" aria-hidden="true" /> : <CircleDot className="h-3 w-3" aria-hidden="true" />}
              {t(`payroll.runs.status_${s}`)}
            </span>
            {i < STEPS.length - 1 ? <span className="h-px w-5 bg-border" aria-hidden="true" /> : null}
          </li>
        ))}
      </ol>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground">{t('payroll.runs.totalNet')}</p>
            <p className="text-3xl font-bold leading-tight tabular-nums">
              <CurrencyText amount={run.totalNet} />
            </p>
            <p className="text-xs text-muted-foreground">
              {t('payroll.runs.staffCount', { count: run.staffCount })}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
            <Figure label={t('payroll.runs.gross')} value={run.totalGross} />
            <Figure label={t('payroll.runs.deductions')} value={run.totalDeductions} />
            <Figure label={t('payroll.runs.commissionBonus')} value={run.totalCommission + run.totalBonus} />
            <Figure label={t('payroll.runs.incomeTax')} value={run.totalIncomeTax} />
            <Figure label={t('payroll.runs.employerSso')} value={run.totalEmployerSso} />
            <Figure label={t('payroll.runs.employerCost')} value={run.employerCost} strong />
          </dl>
          {run.negativeNetCount > 0 ? (
            <p className="flex items-center gap-1.5 rounded-md bg-warning-soft px-2.5 py-1.5 text-xs text-warning">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t('payroll.runs.negativeNet', { count: run.negativeNetCount })}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-[220px] flex-col gap-2 text-xs">
          <Trail label={t('payroll.runs.preparedBy')} who={run.preparedBy} at={run.preparedAt} />
          {run.approvedAt ? <Trail label={t('payroll.runs.approvedBy')} who={run.approvedBy} at={run.approvedAt} /> : null}
          {run.paidAt ? (
            <Trail
              label={t('payroll.runs.paidBy')}
              who={`${run.paidBy ?? '—'} · ${t(`payroll.runs.method_${run.paymentMethod ?? 'CASH'}`)}${run.bankAccountLabel ? ` · ${run.bankAccountLabel}` : ''}${run.paymentReference ? ` · ${run.paymentReference}` : ''}`}
              at={run.paidAt}
            />
          ) : null}
          {run.lastReopenReason ? (
            <p className="text-muted-foreground">
              {t('payroll.runs.reopenedNote', { count: run.reopenCount, reason: run.lastReopenReason })}
            </p>
          ) : null}

          <div className="mt-1 flex flex-wrap gap-2">
            {run.status === 'DRAFT' && canManage ? (
              <Button variant="secondary" size="sm" disabled={busy} onClick={doPrepare}>
                <Calculator className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('payroll.runs.recompute')}
              </Button>
            ) : null}
            {run.status === 'DRAFT' && isOwner ? (
              <Button size="sm" disabled={busy || run.staffCount === 0} onClick={() => void doApprove()}>
                <BadgeCheck className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('payroll.runs.approve')}
              </Button>
            ) : null}
            {run.status === 'APPROVED' && isOwner ? (
              <>
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => setReopenOpen(true)}>
                  <RotateCcw className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t('payroll.runs.reopen')}
                </Button>
                <Button size="sm" disabled={busy} onClick={() => setPayOpen(true)}>
                  <Banknote className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t('payroll.runs.pay')}
                </Button>
              </>
            ) : null}
            {run.status !== 'DRAFT' && !isOwner ? (
              <p className="flex items-center gap-1 text-muted-foreground">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                {t('payroll.runs.ownerOnly')}
              </p>
            ) : null}
          </div>
          {run.status === 'DRAFT' && !isOwner ? (
            <p className="text-muted-foreground">{t('payroll.runs.awaitingOwner')}</p>
          ) : null}
        </div>
      </div>

      <PayRunReopenDialog
        open={reopenOpen}
        busy={busy}
        onClose={() => setReopenOpen(false)}
        onSubmit={(reason) =>
          action.mutate(
            { id: run.id, action: 'reopen', reason },
            {
              onSuccess: () => {
                toast.success(t('payroll.runs.reopened'));
                setReopenOpen(false);
              },
              onError,
            },
          )
        }
      />
      <PayRunPayDialog
        open={payOpen}
        busy={busy}
        amount={run.totalNet}
        branchId={run.branchId}
        onClose={() => setPayOpen(false)}
        onSubmit={(input) =>
          action.mutate(
            { id: run.id, action: 'pay', ...input },
            {
              onSuccess: () => {
                toast.success(t('payroll.runs.paid'));
                setPayOpen(false);
              },
              onError,
            },
          )
        }
      />
    </section>
  );
}

function Figure({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('tabular-nums', strong ? 'font-semibold text-foreground' : 'text-foreground')}>
        <CurrencyText amount={value} />
      </dd>
    </div>
  );
}

function Trail({ label, who, at }: { label: string; who: string | null; at: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium text-foreground">
        {who ?? '—'} · <DateTimeText value={at} mode="datetime" />
      </p>
    </div>
  );
}

function PayslipTable({ run }: { run: PayrollRunView }) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  const slips = run.payslips ?? [];
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-xs">
          <thead className="border-b border-border bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t('payroll.slip.staff')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('payroll.slip.basePay')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('payroll.slip.overtime')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('payroll.slip.commissionBonus')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('payroll.slip.gross')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('payroll.slip.sso')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('payroll.slip.tax')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('payroll.slip.otherDeductions')}</th>
              <th className="px-3 py-2 text-right font-medium">{t('payroll.slip.net')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {slips.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  {t('payroll.runs.noSlips')}
                </td>
              </tr>
            ) : (
              slips.map((p: PayslipView) => (
                <tr
                  key={p.id}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                  onClick={() => setOpenId(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setOpenId(p.id);
                  }}
                  tabIndex={0}
                >
                  <td className="px-3 py-2">
                    <p className="font-medium text-foreground">{p.staffName}</p>
                    <p className="text-2xs text-muted-foreground">{t(`payroll.salaryType_${p.salaryType}`)}</p>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <CurrencyText amount={p.basePay - p.absenceDeduction} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <CurrencyText amount={p.overtimePay} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <CurrencyText amount={p.commission + p.bonus} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <CurrencyText amount={p.grossPay} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    <CurrencyText amount={p.ssoEmployee} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    <CurrencyText amount={p.incomeTax} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    <CurrencyText amount={p.advances + p.otherDeductions + p.clawback} />
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right font-semibold tabular-nums',
                      p.netPay < 0 ? 'text-destructive' : 'text-foreground',
                    )}
                  >
                    <CurrencyText amount={p.netPay} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <PayslipDialog payslipId={openId} onClose={() => setOpenId(null)} />
    </section>
  );
}

function AdjustmentsCard({
  monthYear,
  branchId,
  rows,
  canManage,
}: {
  monthYear: string;
  branchId: string;
  rows: PayrollRow[];
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const list = usePayrollAdjustments(monthYear, branchId);
  const create = useCreateAdjustment();
  const remove = useDeleteAdjustment();
  const [staffProfileId, setStaff] = useState('');
  const [type, setType] = useState<PayrollAdjustmentType>('ALLOWANCE');
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const onError = (err: unknown) =>
    toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount);
    if (!staffProfileId || !Number.isFinite(n) || n <= 0 || label.trim().length < 2) {
      toast.error(t('payroll.adj.invalid'));
      return;
    }
    create.mutate(
      { staffProfileId, monthYear, type, amount: n, label: label.trim() },
      {
        onSuccess: () => {
          toast.success(t('common.saved'));
          setAmount('');
          setLabel('');
        },
        onError,
      },
    );
  };

  const items = list.data ?? [];
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">{t('payroll.adj.title')}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{t('payroll.adj.hint')}</p>

      {canManage ? (
        <form onSubmit={submit} className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_120px_minmax(0,1.3fr)_auto]">
          <Select
            aria-label={t('payroll.slip.staff')}
            value={staffProfileId}
            onChange={(e) => setStaff(e.target.value)}
            placeholder={t('payroll.adj.pickStaff')}
            options={rows.map((r) => ({ value: r.staffProfileId, label: r.staffName }))}
          />
          <Select
            aria-label={t('payroll.adj.type')}
            value={type}
            onChange={(e) => setType(e.target.value as PayrollAdjustmentType)}
            options={PAYROLL_ADJUSTMENT_TYPES.map((x) => ({ value: x, label: t(`payroll.adj.type_${x}`) }))}
          />
          <Input
            aria-label={t('payroll.adj.amount')}
            type="number"
            min="1"
            step="1000"
            inputMode="numeric"
            placeholder={t('payroll.adj.amount')}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Input
            aria-label={t('payroll.adj.label')}
            placeholder={t('payroll.adj.label')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={120}
          />
          <Button type="submit" disabled={create.isPending}>
            {t('payroll.adj.add')}
          </Button>
        </form>
      ) : null}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
          {t('payroll.adj.empty')}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((a) => {
            const earning = a.type === 'ALLOWANCE';
            return (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.staffName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t(`payroll.adj.type_${a.type}`)} · {a.label}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn('tabular-nums', earning ? 'text-success' : 'text-destructive')}>
                    {earning ? '+' : '−'}
                    <CurrencyText amount={a.amount} />
                  </span>
                  {canManage && !a.locked ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      aria-label={t('common.delete')}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(a.id, { onError })}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  ) : a.locked ? (
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label={t('payroll.adj.locked')} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
