import type { PayrollRow, SalaryType, StaffSalaryInput } from '@abcp/shared-types';
import { SALARY_TYPES } from '@abcp/shared-types';
import {
  Banknote,
  CalendarCheck2,
  CalendarX2,
  Clock3,
  Gift,
  ReceiptText,
  Sparkles,
  Star,
  Target,
  Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CurrencyText, DateTimeText } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/features/auth/useAuth';
import { NormalizedApiError } from '@/services/apiError';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompactNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

import { useStaffBreakdown } from './payroll.api';
import { useSetStaffSalary, useStaffSalary } from './payrollRuns.api';
import { attainmentTone, commissionPayableNow, monthLabel, monthShort, TONE } from './payroll.lib';
import { AttainmentMeter, DetailRow, PayoutStatePill, Sparkline } from './payroll.parts';

interface Props {
  row: PayrollRow | null;
  monthYear: string;
  canManage: boolean;
  onClose: () => void;
  onPayCommission: (row: PayrollRow) => void;
  onPayBonus: (row: PayrollRow) => void;
  onSaveTarget: (row: PayrollRow, target: number) => void;
  savingTarget: boolean;
  busy: boolean;
}

/**
 * Per-staff payslip drawer.
 *
 * The old page could only tell you a commission total; the one question it
 * always raised — *which jobs is that made of?* — had no answer anywhere in
 * the product. This drawer answers it: the same figure, then the appointment
 * lines behind it, the month shape, the services that produced it, and six
 * months of context, with the target editable in place rather than in a
 * separate dialog that loses the record you were looking at.
 */
/** Salary type, base amount and social-security enrolment. Only SUPER_ADMIN can change them. */
function SalarySection({ staffProfileId }: { staffProfileId: string }) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const isOwner = role === 'SUPER_ADMIN';
  const { data } = useStaffSalary(staffProfileId);
  const save = useSetStaffSalary();
  const [draft, setDraft] = useState<StaffSalaryInput | null>(null);

  useEffect(() => {
    if (data) setDraft({ salaryType: data.salaryType, baseSalary: data.baseSalary, ssoEnrolled: data.ssoEnrolled });
  }, [data]);

  if (!draft) return null;
  const dirty =
    data != null &&
    (draft.salaryType !== data.salaryType || draft.baseSalary !== data.baseSalary || draft.ssoEnrolled !== data.ssoEnrolled);

  return (
    <section className="rounded-lg border border-border p-3.5">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
        {t('payroll.salary.title')}
      </h3>
      <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Select
          aria-label={t('payroll.slip.salaryType')}
          disabled={!isOwner}
          value={draft.salaryType}
          onChange={(e) => {
            const salaryType = e.target.value as SalaryType;
            setDraft({ ...draft, salaryType, baseSalary: salaryType === 'NONE' ? 0 : draft.baseSalary });
          }}
          options={SALARY_TYPES.map((x) => ({ value: x, label: t(`payroll.salaryType_${x}`) }))}
        />
        <Input
          aria-label={t('payroll.salary.amount')}
          type="number"
          min="0"
          step="1000"
          inputMode="numeric"
          disabled={!isOwner || draft.salaryType === 'NONE'}
          value={draft.baseSalary}
          onChange={(e) => setDraft({ ...draft, baseSalary: Number(e.target.value) || 0 })}
        />
      </div>
      <label className="mt-2 flex items-center justify-between gap-3 text-sm">
        <span>{t('payroll.salary.sso')}</span>
        <Switch
          checked={draft.ssoEnrolled}
          disabled={!isOwner}
          onCheckedChange={(v) => setDraft({ ...draft, ssoEnrolled: v })}
          aria-label={t('payroll.salary.sso')}
        />
      </label>
      {isOwner ? (
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() =>
              save.mutate(
                { staffProfileId, input: draft },
                {
                  onSuccess: () => toast.success(t('common.saved')),
                  onError: (err) =>
                    toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
                },
              )
            }
          >
            {t('common.save')}
          </Button>
        </div>
      ) : (
        <p className="mt-1 text-2xs text-muted-foreground">{t('payroll.salary.ownerOnly')}</p>
      )}
    </section>
  );
}

export function StaffPayslipSheet({
  row,
  monthYear,
  canManage,
  onClose,
  onPayCommission,
  onPayBonus,
  onSaveTarget,
  savingTarget,
  busy,
}: Props) {
  const { t, i18n } = useTranslation();
  const { data, isLoading } = useStaffBreakdown(row?.staffProfileId ?? null, monthYear);
  const [target, setTarget] = useState('');

  // Reset the draft whenever a different person (or month) is opened, so an
  // untouched field never carries the previous record's number into a save.
  useEffect(() => {
    setTarget(row && row.targetRevenue > 0 ? String(row.targetRevenue) : '');
  }, [row, monthYear]);

  if (!row) return null;

  // The fresh row from the breakdown wins once it lands — figures then match
  // the lines shown beneath them even if the list behind the drawer is stale.
  const r = data?.row ?? row;
  const tone = attainmentTone(r.attainmentPct, r.targetRevenue > 0);
  const maxHistory = Math.max(...(data?.history ?? []).map((h) => h.grossRevenue), 1);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-[640px]">
        <SheetHeader>
          <div className="flex items-start gap-3 pr-8">
            <PersonAvatar name={r.staffName} size={48} />
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-lg">{r.staffName}</SheetTitle>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="truncate">{r.branchName}</span>
                <span aria-hidden="true">·</span>
                <span>{monthLabel(monthYear, i18n.language)}</span>
                {r.totalReviews > 0 ? (
                  <span className="inline-flex items-center gap-0.5">
                    <Star className="h-3 w-3 fill-current text-accent" aria-hidden="true" />
                    <span className="tabular-nums">{r.rating.toFixed(1)}</span>
                    <span>({r.totalReviews})</span>
                  </span>
                ) : null}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <PayoutStatePill state={r.payoutState} />
                <Badge variant="neutral" className="px-1.5 py-0 text-2xs">
                  {t('payroll.rankNo', { rank: r.rank })}
                </Badge>
                {!r.isActive ? (
                  <Badge variant="danger" className="px-1.5 py-0 text-2xs">
                    {t('payroll.flag.inactive')}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        </SheetHeader>

        <SheetBody className="space-y-4 py-4">
          {/* ── the payslip ── */}
          <section className="rounded-lg border border-border bg-background/50 p-3.5">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
              {t('payroll.payslip.title')}
            </h3>
            <div className="mt-2 divide-y divide-border">
              <DetailRow
                label={t('payroll.col.gross')}
                value={<CurrencyText amount={r.grossRevenue} />}
              />
              <DetailRow
                label={t('payroll.payslip.jobsAndAvg')}
                value={
                  <>
                    {r.completedJobs} · <CurrencyText amount={r.avgTicket} />
                  </>
                }
              />
              <DetailRow
                label={t('payroll.payslip.commissionAt', {
                  rate: Math.round(r.commissionRate * 100),
                })}
                value={<CurrencyText amount={r.commissionTotal} />}
              />
              <DetailRow
                label={t('payroll.payslip.commissionPaid')}
                value={<CurrencyText amount={r.commissionPaid} />}
                tone="success"
              />
              {commissionPayableNow(r) > 0 ? (
                <DetailRow
                  label={t('payroll.payslip.commissionUnpaid')}
                  value={<CurrencyText amount={commissionPayableNow(r)} />}
                  tone="warning"
                />
              ) : null}
              {r.commissionHeld > 0 ? (
                <DetailRow
                  label={t('payroll.payslip.commissionHeld')}
                  value={<CurrencyText amount={r.commissionHeld} />}
                />
              ) : null}
              <DetailRow
                label={
                  r.bonusAmount > 0
                    ? t('payroll.payslip.bonusWithState', {
                        state: r.bonusPaid ? t('payroll.paid') : t('payroll.due'),
                      })
                    : t('payroll.col.bonus')
                }
                value={<CurrencyText amount={r.bonusAmount} />}
                tone={r.bonusAmount > 0 && !r.bonusPaid ? 'info' : undefined}
              />
              {r.clawbackTotal > 0 ? (
                <DetailRow
                  label={t('payroll.payslip.clawback', {
                    state: r.clawbackUnsettled > 0 ? t('payroll.due') : t('payroll.paid'),
                  })}
                  value={<CurrencyText amount={-r.clawbackTotal} />}
                  tone="warning"
                />
              ) : null}
              <DetailRow
                label={t('payroll.col.payable')}
                value={<CurrencyText amount={r.payable} />}
                strong
              />
              <DetailRow
                label={t('payroll.stat.outstanding')}
                value={<CurrencyText amount={r.outstanding} />}
                strong
                tone={r.outstanding > 0 ? 'warning' : 'success'}
              />
            </div>
          </section>

          {/* ── salary structure (P3) — owner edits, admins read ── */}
          <SalarySection staffProfileId={r.staffProfileId} />

          {/* ── target, editable in place ── */}
          <section className="rounded-lg border border-border p-3.5">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Target className="h-3.5 w-3.5" aria-hidden="true" />
              {t('payroll.targetTitle')}
            </h3>

            {r.targetRevenue > 0 ? (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="tabular-nums">
                    <CurrencyText amount={r.actualRevenue} /> /{' '}
                    <span className="text-muted-foreground">
                      <CurrencyText amount={r.targetRevenue} />
                    </span>
                  </span>
                  <span className={cn('font-semibold tabular-nums', TONE[tone].text)}>
                    {r.attainmentPct}%
                  </span>
                </div>
                <AttainmentMeter pct={r.attainmentPct} tone={tone} />
                <p className="text-2xs text-muted-foreground">
                  {r.targetMet
                    ? t('payroll.payslip.targetMet')
                    : t('payroll.payslip.targetGap', {
                        amount: formatCompactNumber(r.targetRevenue - r.actualRevenue),
                      })}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">{t('payroll.payslip.noTargetHint')}</p>
            )}

            {canManage ? (
              <form
                className="mt-3 flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Number(target);
                  if (Number.isFinite(n) && n >= 0) onSaveTarget(r, n);
                }}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <Label htmlFor="payslip-target" className="text-2xs">
                    {t('payroll.targetRevenue')}
                  </Label>
                  <Input
                    id="payslip-target"
                    type="number"
                    step="1000"
                    min="0"
                    inputMode="numeric"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <Button type="submit" variant="secondary" disabled={savingTarget || target === ''}>
                  {t('common.save')}
                </Button>
              </form>
            ) : null}
          </section>

          {/* ── shape of the month + attendance ── */}
          <section className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3.5">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                {t('payroll.payslip.monthShape')}
              </h3>
              {isLoading ? (
                <Skeleton className="mt-2 h-10 w-full rounded-sm" />
              ) : (
                <div className="mt-2">
                  <Sparkline
                    values={(data?.daily ?? []).map((d) => d.revenue)}
                    ariaLabel={t('payroll.payRun.dailyAria')}
                    className="h-10"
                  />
                  <p className="mt-1 text-2xs text-muted-foreground">
                    {t('payroll.payslip.busiestDay', {
                      count: Math.max(...(data?.daily ?? [{ jobs: 0 }]).map((d) => d.jobs), 0),
                    })}
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border p-3.5">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <CalendarCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('payroll.payslip.attendance')}
              </h3>
              <ul className="mt-2 space-y-1 text-xs">
                <li className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <CalendarCheck2 className="h-3 w-3 text-success" aria-hidden="true" />
                    {t('payroll.attendance.present')}
                  </span>
                  <span className="font-semibold tabular-nums">{r.attendance.present}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Clock3 className="h-3 w-3 text-warning" aria-hidden="true" />
                    {t('payroll.attendance.late')}
                  </span>
                  <span className="font-semibold tabular-nums">{r.attendance.late}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <CalendarX2 className="h-3 w-3 text-destructive" aria-hidden="true" />
                    {t('payroll.attendance.absent')}
                  </span>
                  <span className="font-semibold tabular-nums">{r.attendance.absent}</span>
                </li>
              </ul>
            </div>
          </section>

          {/* ── six months of context ── */}
          {data && data.history.length > 0 ? (
            <section className="rounded-lg border border-border p-3.5">
              <h3 className="text-xs font-semibold text-muted-foreground">
                {t('payroll.payslip.history')}
              </h3>
              <ul className="mt-2 flex items-end gap-2">
                {data.history.map((h) => {
                  const pct = Math.round((h.grossRevenue / maxHistory) * 100);
                  const current = h.monthYear === monthYear;
                  return (
                    <li key={h.monthYear} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                      <span
                        className="flex h-16 w-full items-end justify-center rounded-sm bg-muted/60"
                        title={`${h.monthYear} · ${formatCompactNumber(h.grossRevenue)}`}
                      >
                        <span
                          className={cn(
                            'block w-full rounded-sm transition-[height] duration-500 ease-out motion-reduce:transition-none',
                            current ? 'bg-primary' : 'bg-primary/35',
                          )}
                          style={{ height: `${Math.max(pct, 2)}%` }}
                        />
                      </span>
                      <span
                        className={cn(
                          'truncate text-2xs',
                          current ? 'font-semibold text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {monthShort(h.monthYear, i18n.language)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {/* ── top services ── */}
          {data && data.topServices.length > 0 ? (
            <section className="rounded-lg border border-border p-3.5">
              <h3 className="text-xs font-semibold text-muted-foreground">
                {t('payroll.payslip.topServices')}
              </h3>
              <ul className="mt-2 space-y-1.5">
                {data.topServices.map((s) => (
                  <li key={s.serviceName} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate">{s.serviceName}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {t('payroll.jobsCount', { count: s.jobs })} ·{' '}
                      <span className="font-semibold text-foreground">
                        <CurrencyText amount={s.revenue} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* ── the lines behind the commission figure ── */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
              {t('payroll.payslip.lines')}
              {data ? (
                <span className="font-normal">({data.lines.length})</span>
              ) : null}
            </h3>

            {isLoading ? (
              <div className="space-y-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-11 w-full rounded-sm" />
                ))}
              </div>
            ) : data && data.lines.length > 0 ? (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {data.lines.map((l) => (
                  <li
                    key={l.commissionId}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.serviceName}</p>
                      <p className="truncate text-2xs text-muted-foreground">
                        {l.customerName} ·{' '}
                        <DateTimeText value={l.startAt} mode="datetime" />
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular-nums">
                        <CurrencyText amount={l.payoutAmount} className="font-semibold" />
                      </p>
                      <p className="text-2xs text-muted-foreground">
                        <CurrencyText amount={l.serviceAmount} /> ·{' '}
                        {Math.round(l.commissionRate * 100)}%
                      </p>
                    </div>
                    <Badge
                      variant={l.isPaid ? 'success' : l.collected ? 'warning' : 'neutral'}
                      className="shrink-0 px-1.5 py-0 text-2xs"
                      title={
                        l.isPaid && l.paidAt
                          ? new Date(l.paidAt).toLocaleString(i18n.language)
                          : l.collected
                            ? undefined
                            : t('payroll.heldHint')
                      }
                    >
                      {l.isPaid ? t('payroll.paid') : l.collected ? t('payroll.due') : t('payroll.heldShort')}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                {t('payroll.payslip.noLines')}
              </p>
            )}
          </section>
        </SheetBody>

        {canManage && (commissionPayableNow(r) > 0 || (r.bonusAmount > 0 && !r.bonusPaid)) ? (
          <SheetFooter>
            {r.bonusAmount > 0 && !r.bonusPaid ? (
              <Button variant="secondary" disabled={busy} onClick={() => onPayBonus(r)}>
                <Gift className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('payroll.markBonusPaid')}
              </Button>
            ) : null}
            {commissionPayableNow(r) > 0 ? (
              <Button disabled={busy} onClick={() => onPayCommission(r)}>
                <Banknote className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('payroll.payCommission')}
              </Button>
            ) : null}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
