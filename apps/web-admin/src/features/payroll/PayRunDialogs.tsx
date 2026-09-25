import type { PayrollPayMethod, PayrollRunView, PayrollSettings, PayslipView } from '@abcp/shared-types';
import { PAYROLL_PAY_METHODS } from '@abcp/shared-types';
import { Plus, Printer, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CurrencyText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { monthLabel } from './payroll.lib';
import { useBankAccounts } from '@/features/payments-treasury/treasury.api';
import { useServices } from '@/features/services/services.api';

import {
  usePayrollSettings,
  usePayslip,
  useSavePayrollSettings,
  useBulkKpiTargets,
  usePayrollYtd,
  useServiceCommissionRules,
  useSetServiceCommissionRule,
} from './payrollRuns.api';

// ---- payslip detail + print ---------------------------------------------------

type SlipLine = { label: string; amount: number; sign?: '+' | '−'; strong?: boolean; muted?: boolean };

function slipLines(p: PayslipView, t: (k: string, o?: Record<string, unknown>) => string) {
  const earnings: SlipLine[] = [
    { label: t('payroll.slip.basePay'), amount: p.basePay },
    ...(p.absenceDeduction > 0
      ? [{ label: t('payroll.slip.absence', { days: p.daysAbsent }), amount: p.absenceDeduction, sign: '−' as const }]
      : []),
    ...(p.overtimePay > 0
      ? [{ label: t('payroll.slip.overtimeHours', { hours: p.overtimeHours }), amount: p.overtimePay }]
      : []),
    { label: t('payroll.slip.commission'), amount: p.commission },
    ...(p.bonus > 0 ? [{ label: t('payroll.slip.bonus'), amount: p.bonus }] : []),
    ...p.adjustments
      .filter((a) => a.type === 'ALLOWANCE')
      .map((a) => ({ label: a.label, amount: a.amount })),
    { label: t('payroll.slip.gross'), amount: p.grossPay, strong: true },
  ];
  const deductions: SlipLine[] = [
    { label: t('payroll.slip.ssoEmployee'), amount: p.ssoEmployee },
    { label: t('payroll.slip.tax'), amount: p.incomeTax },
    ...p.adjustments
      .filter((a) => a.type !== 'ALLOWANCE')
      .map((a) => ({ label: `${t(`payroll.adj.type_${a.type}`)} — ${a.label}`, amount: a.amount })),
    ...(p.clawback > 0 ? [{ label: t('payroll.slip.clawback'), amount: p.clawback }] : []),
    { label: t('payroll.slip.totalDeductions'), amount: p.totalDeductions, strong: true },
  ];
  return { earnings, deductions };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Opens a print-ready payslip in a new window (browser "Save as PDF" gives the PDF — audit G5.1). */
function printPayslip(p: PayslipView, run: PayrollRunView, lang: string, t: (k: string, o?: Record<string, unknown>) => string) {
  const { earnings, deductions } = slipLines(p, t);
  const row = (l: SlipLine) =>
    `<tr class="${l.strong ? 'strong' : ''}"><td>${escapeHtml(l.label)}</td><td class="num">${l.sign === '−' ? '−' : ''}${escapeHtml(formatCurrency(l.amount))}</td></tr>`;
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${escapeHtml(
    `${t('payroll.slip.title')} ${p.staffName} ${run.monthYear}`,
  )}</title><style>
    body{font-family:"Noto Sans Lao","Phetsarath OT",system-ui,sans-serif;color:#111;margin:32px;font-size:13px}
    h1{font-size:18px;margin:0 0 4px} .muted{color:#666} table{width:100%;border-collapse:collapse;margin-top:8px}
    td{padding:6px 4px;border-bottom:1px solid #e5e5e5} .num{text-align:right;font-variant-numeric:tabular-nums}
    .strong td{font-weight:600;border-top:1px solid #999} .cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:20px}
    h2{font-size:13px;margin:0} .net{margin-top:24px;padding:12px;border:2px solid #111;display:flex;justify-content:space-between;font-size:16px;font-weight:700}
    .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px} .sig{margin-top:56px;display:grid;grid-template-columns:1fr 1fr;gap:48px}
    .sig div{border-top:1px solid #999;padding-top:6px;text-align:center} @media print{body{margin:12mm}}
  </style></head><body>
  <h1>${escapeHtml(t('payroll.slip.title'))} — ${escapeHtml(monthLabel(run.monthYear, lang))}</h1>
  <div class="muted">${escapeHtml(run.branchName)} · ${escapeHtml(t(`payroll.runs.status_${run.status}`))}</div>
  <div class="meta"><div><div class="muted">${escapeHtml(t('payroll.slip.staff'))}</div><strong>${escapeHtml(p.staffName)}</strong></div>
  <div><div class="muted">${escapeHtml(t('payroll.slip.salaryType'))}</div>${escapeHtml(t(`payroll.salaryType_${p.salaryType}`))}</div>
  <div><div class="muted">${escapeHtml(t('payroll.slip.attendance'))}</div>${escapeHtml(t('payroll.slip.attendanceValue', { present: p.daysPresent, absent: p.daysAbsent, ot: p.overtimeHours }))}</div></div>
  <div class="cols"><div><h2>${escapeHtml(t('payroll.slip.earnings'))}</h2><table>${earnings.map(row).join('')}</table></div>
  <div><h2>${escapeHtml(t('payroll.slip.deductions'))}</h2><table>${deductions.map(row).join('')}</table></div></div>
  <div class="net"><span>${escapeHtml(t('payroll.slip.net'))}</span><span>${escapeHtml(formatCurrency(p.netPay))}</span></div>
  <p class="muted">${escapeHtml(t('payroll.slip.employerNote', { sso: formatCurrency(p.ssoEmployer) }))}</p>
  <div class="sig"><div>${escapeHtml(t('payroll.slip.signEmployer'))}</div><div>${escapeHtml(t('payroll.slip.signEmployee'))}</div></div>
  <script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open('', '_blank', 'noopener=no,width=820,height=960');
  if (!w) {
    toast.error(t('payroll.slip.popupBlocked'));
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

export function PayslipDialog({ payslipId, onClose }: { payslipId: string | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const q = usePayslip(payslipId);
  const p = q.data;
  const lines = p ? slipLines(p, t) : null;
  return (
    <Dialog open={Boolean(payslipId)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{p ? `${t('payroll.slip.title')} — ${p.staffName}` : t('payroll.slip.title')}</DialogTitle>
          {p ? (
            <DialogDescription>
              {monthLabel(p.run.monthYear, i18n.language)} · {p.run.branchName} ·{' '}
              {t(`payroll.salaryType_${p.salaryType}`)} ·{' '}
              {t('payroll.slip.attendanceValue', { present: p.daysPresent, absent: p.daysAbsent, ot: p.overtimeHours })}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {!p || !lines ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <LineList title={t('payroll.slip.earnings')} lines={lines.earnings} />
              <LineList title={t('payroll.slip.deductions')} lines={lines.deductions} negative />
            </div>
            <div className="flex items-center justify-between rounded-lg border-2 border-foreground/80 px-4 py-3">
              <span className="text-sm font-semibold">{t('payroll.slip.net')}</span>
              <span className={cn('text-xl font-bold tabular-nums', p.netPay < 0 && 'text-destructive')}>
                <CurrencyText amount={p.netPay} />
              </span>
            </div>
            {p.taxBreakdown.length > 0 ? (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">{t('payroll.slip.taxSteps')}</summary>
                <ul className="mt-1 space-y-0.5">
                  {p.taxBreakdown.map((s) => (
                    <li key={s.from} className="flex justify-between tabular-nums">
                      <span>
                        {formatCurrency(s.from)} – {s.to == null ? '∞' : formatCurrency(s.to)} · {Math.round(s.rate * 100)}%
                      </span>
                      <CurrencyText amount={s.tax} />
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {t('payroll.slip.employerNote', { sso: formatCurrency(p.ssoEmployer) })}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button disabled={!p} onClick={() => p && printPayslip(p, p.run, i18n.language, t)}>
            <Printer className="mr-1 h-4 w-4" aria-hidden="true" />
            {t('payroll.slip.print')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LineList({ title, lines, negative }: { title: string; lines: SlipLine[]; negative?: boolean }) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-muted-foreground">{title}</h4>
      <ul className="divide-y divide-border text-sm">
        {lines.map((l, i) => (
          <li key={`${l.label}-${i}`} className={cn('flex justify-between gap-3 py-1.5', l.strong && 'font-semibold')}>
            <span className="min-w-0 truncate">{l.label}</span>
            <span className={cn('shrink-0 tabular-nums', (negative || l.sign === '−') && !l.strong && 'text-destructive')}>
              {l.sign === '−' ? '−' : ''}
              <CurrencyText amount={l.amount} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- reopen / pay -----------------------------------------------------------

export function PayRunReopenDialog({
  open,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('payroll.runs.reopenTitle')}</DialogTitle>
          <DialogDescription>{t('payroll.runs.reopenBody')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason.trim().length < 3) return;
            onSubmit(reason.trim());
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="reopen-reason">{t('payroll.runs.reason')}</Label>
            <Textarea id="reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy || reason.trim().length < 3}>
              {t('payroll.runs.reopen')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PayRunPayDialog({
  open,
  busy,
  amount,
  branchId,
  onClose,
  onSubmit,
}: {
  open: boolean;
  busy: boolean;
  amount: number;
  branchId: string;
  onClose: () => void;
  onSubmit: (input: { method: PayrollPayMethod; reference?: string; bankAccountId?: string }) => void;
}) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<PayrollPayMethod>('TRANSFER');
  const [reference, setReference] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const accountsQ = useBankAccounts(branchId);
  const accounts = (accountsQ.data ?? []).filter((a) => a.isActive && a.currency === 'LAK' && a.branchId === branchId);
  useEffect(() => {
    if (!open) return;
    setReference('');
    setBankAccountId(accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, accountsQ.data]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('payroll.runs.payTitle')}</DialogTitle>
          <DialogDescription>{t('payroll.runs.payBody', { amount: formatCurrency(amount) })}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              method,
              reference: reference.trim() || undefined,
              ...(method === 'TRANSFER' && bankAccountId ? { bankAccountId } : {}),
            });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="pay-method">{t('payroll.runs.method')}</Label>
            <Select
              id="pay-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as PayrollPayMethod)}
              options={PAYROLL_PAY_METHODS.map((m) => ({ value: m, label: t(`payroll.runs.method_${m}`) }))}
            />
          </div>
          {method === 'TRANSFER' ? (
            <div className="space-y-1.5">
              <Label htmlFor="pay-account">{t('payroll.runs.fromAccount')}</Label>
              <Select
                id="pay-account"
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                placeholder={accounts.length ? t('payroll.runs.noAccount') : t('payroll.runs.noAccounts')}
                options={accounts.map((a) => ({
                  value: a.id,
                  label: `${a.bank.code} · ${a.accountName} · ****${a.accountNumber.slice(-4)}`,
                }))}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">{t('payroll.runs.reference')}</Label>
            <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
          </div>
          <p className="text-xs text-muted-foreground">{t('payroll.runs.payNote')}</p>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={busy}>
              {t('payroll.runs.pay')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- settings -----------------------------------------------------------------

export function PayrollSettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const q = usePayrollSettings();
  const save = useSavePayrollSettings();
  const [draft, setDraft] = useState<PayrollSettings | null>(null);
  useEffect(() => {
    if (open && q.data) setDraft(structuredClone(q.data));
  }, [open, q.data]);

  const pct = (v: number) => String(Math.round(v * 10000) / 100);
  const fromPct = (s: string) => Number(s) / 100;
  const set = (fn: (d: PayrollSettings) => void) =>
    setDraft((d) => {
      if (!d) return d;
      const c = structuredClone(d);
      fn(c);
      return c;
    });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('payroll.settings.title')}</DialogTitle>
          <DialogDescription>{t('payroll.settings.body')}</DialogDescription>
        </DialogHeader>
        {!draft ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(draft, {
                onSuccess: () => {
                  toast.success(t('common.saved'));
                  onClose();
                },
                onError: (err) =>
                  toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
              });
            }}
          >
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">{t('payroll.settings.pit')}</legend>
              {draft.pitBrackets.map((b, i) => {
                const last = i === draft.pitBrackets.length - 1;
                return (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_100px_auto] items-center gap-2">
                    <Input
                      aria-label={t('payroll.settings.upTo')}
                      type="number"
                      min="1"
                      disabled={last}
                      placeholder={last ? t('payroll.settings.noCeiling') : t('payroll.settings.upTo')}
                      value={b.upTo ?? ''}
                      onChange={(e) =>
                        set((d) => {
                          d.pitBrackets[i]!.upTo = e.target.value === '' ? null : Number(e.target.value);
                        })
                      }
                    />
                    <div className="relative">
                      <Input
                        aria-label={t('payroll.settings.rate')}
                        type="number"
                        min="0"
                        max="60"
                        step="0.5"
                        value={pct(b.rate)}
                        onChange={(e) => set((d) => void (d.pitBrackets[i]!.rate = fromPct(e.target.value)))}
                      />
                      <span className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      aria-label={t('common.delete')}
                      disabled={draft.pitBrackets.length <= 1 || last}
                      onClick={() => set((d) => void d.pitBrackets.splice(i, 1))}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  set((d) => {
                    const prev = d.pitBrackets.at(-2)?.upTo ?? 0;
                    d.pitBrackets.splice(d.pitBrackets.length - 1, 0, { upTo: prev + 1_000_000, rate: 0 });
                  })
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                {t('payroll.settings.addBand')}
              </Button>
            </fieldset>

            <fieldset className="grid gap-3 sm:grid-cols-3">
              <legend className="mb-2 text-sm font-semibold">{t('payroll.settings.sso')}</legend>
              <NumField label={t('payroll.settings.employeeRate')} suffix="%" value={pct(draft.sso.employeeRate)} onChange={(v) => set((d) => void (d.sso.employeeRate = fromPct(v)))} />
              <NumField label={t('payroll.settings.employerRate')} suffix="%" value={pct(draft.sso.employerRate)} onChange={(v) => set((d) => void (d.sso.employerRate = fromPct(v)))} />
              <NumField label={t('payroll.settings.wageCeiling')} value={String(draft.sso.wageCeiling)} onChange={(v) => set((d) => void (d.sso.wageCeiling = Number(v)))} />
              <ToggleField
                className="sm:col-span-3"
                label={t('payroll.settings.includeVariablePay')}
                checked={draft.sso.includeVariablePay}
                onChange={(v) => set((d) => void (d.sso.includeVariablePay = v))}
              />
            </fieldset>

            <fieldset className="grid gap-3 sm:grid-cols-3">
              <legend className="mb-2 text-sm font-semibold">{t('payroll.settings.time')}</legend>
              <NumField label={t('payroll.settings.workDays')} value={String(draft.time.workDaysPerMonth)} onChange={(v) => set((d) => void (d.time.workDaysPerMonth = Number(v)))} />
              <NumField label={t('payroll.settings.stdHours')} value={String(draft.time.standardHoursPerDay)} onChange={(v) => set((d) => void (d.time.standardHoursPerDay = Number(v)))} />
              <NumField label={t('payroll.settings.otMultiplier')} suffix="×" value={String(draft.time.overtimeMultiplier)} onChange={(v) => set((d) => void (d.time.overtimeMultiplier = Number(v)))} />
              <ToggleField
                className="sm:col-span-3"
                label={t('payroll.settings.deductAbsence')}
                checked={draft.time.deductAbsence}
                onChange={(v) => set((d) => void (d.time.deductAbsence = v))}
              />
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-3">
              <NumField
                label={t('payroll.settings.quickPayLimit')}
                value={String(draft.quickPayLimitLak)}
                onChange={(v) => set((d) => void (d.quickPayLimitLak = Number(v)))}
              />
              <p className="self-end text-xs text-muted-foreground sm:col-span-2">{t('payroll.settings.quickPayLimitHint')}</p>
            </div>

            <ServiceRulesSection />

            <ToggleField
              label={t('payroll.settings.requireCollection')}
              hint={t('payroll.heldHint')}
              checked={draft.commissionRequiresCollection}
              onChange={(v) => set((d) => void (d.commissionRequiresCollection = v))}
            />

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NumField({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string;
  value: string;
  suffix?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="relative">
        <Input type="number" min="0" step="any" value={value} onChange={(e) => onChange(e.target.value)} />
        {suffix ? (
          <span className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{suffix}</span>
        ) : null}
      </div>
    </label>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
  className,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div>
        <p className="text-sm">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

/** G1.8 — commission rate per service (overrides the staff rate for new jobs). Saved immediately. */
function ServiceRulesSection() {
  const { t } = useTranslation();
  const rules = useServiceCommissionRules();
  const setRule = useSetServiceCommissionRule();
  const { data: servicesPage } = useServices({ page: 1, pageSize: 100, isActive: 'true' });
  const [serviceId, setServiceId] = useState('');
  const [rate, setRate] = useState('');
  const onError = (err: unknown) =>
    toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));
  const list = rules.data ?? [];
  const taken = new Set(list.map((r) => r.serviceId));
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{t('payroll.settings.serviceRates')}</legend>
      <p className="text-xs text-muted-foreground">{t('payroll.settings.serviceRatesHint')}</p>
      {list.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {list.map((r) => (
            <li key={r.serviceId} className="flex items-center justify-between gap-3 px-3 py-1.5 text-sm">
              <span className="min-w-0 truncate">{r.serviceName}</span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">{Math.round(r.rate * 1000) / 10}%</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  aria-label={t('common.delete')}
                  disabled={setRule.isPending}
                  onClick={() => setRule.mutate({ serviceId: r.serviceId, rate: null }, { onError })}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)_100px_auto] gap-2">
        <Select
          aria-label={t('payroll.settings.service')}
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          placeholder={t('payroll.settings.service')}
          options={(servicesPage?.items ?? [])
            .filter((sv) => !taken.has(sv.id))
            .map((sv) => ({ value: sv.id, label: sv.name }))}
        />
        <Input
          aria-label={t('payroll.settings.rate')}
          type="number"
          min="0"
          max="100"
          step="0.5"
          placeholder="%"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-9"
          disabled={!serviceId || rate === '' || setRule.isPending}
          onClick={() => {
            const n = Number(rate);
            if (!Number.isFinite(n) || n < 0 || n > 100) return;
            setRule.mutate(
              { serviceId, rate: n / 100 },
              {
                onSuccess: () => {
                  setServiceId('');
                  setRate('');
                },
                onError,
              },
            );
          }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
        </Button>
      </div>
    </fieldset>
  );
}

// ---- G5.5 bulk targets -----------------------------------------------------------

export function BulkTargetsDialog({
  open,
  monthYear,
  branchId,
  onClose,
}: {
  open: boolean;
  monthYear: string;
  branchId?: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const bulk = useBulkKpiTargets();
  const [mode, setMode] = useState<'PREV_MONTH_PCT' | 'FIXED'>('PREV_MONTH_PCT');
  const [value, setValue] = useState('110');
  const [overwrite, setOverwrite] = useState(false);
  useEffect(() => {
    if (open) {
      setMode('PREV_MONTH_PCT');
      setValue('110');
      setOverwrite(false);
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('payroll.bulkTargets.title')}</DialogTitle>
          <DialogDescription>
            {t('payroll.bulkTargets.body', { month: monthLabel(monthYear, i18n.language) })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(value);
            if (!Number.isFinite(n) || n <= 0) return;
            bulk.mutate(
              { monthYear, branchId, mode, value: n, overwrite },
              {
                onSuccess: (res) => {
                  toast.success(t('payroll.bulkTargets.done', { updated: res.updated, skipped: res.skipped }));
                  onClose();
                },
                onError: (err) =>
                  toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
              },
            );
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="bt-mode">{t('payroll.bulkTargets.mode')}</Label>
            <Select
              id="bt-mode"
              value={mode}
              onChange={(e) => {
                const m = e.target.value as 'PREV_MONTH_PCT' | 'FIXED';
                setMode(m);
                setValue(m === 'FIXED' ? '' : '110');
              }}
              options={[
                { value: 'PREV_MONTH_PCT', label: t('payroll.bulkTargets.mode_PREV_MONTH_PCT') },
                { value: 'FIXED', label: t('payroll.bulkTargets.mode_FIXED') },
              ]}
            />
          </div>
          <NumField
            label={mode === 'FIXED' ? t('payroll.bulkTargets.amount') : t('payroll.bulkTargets.pct')}
            suffix={mode === 'FIXED' ? undefined : '%'}
            value={value}
            onChange={setValue}
          />
          <ToggleField
            label={t('payroll.bulkTargets.overwrite')}
            checked={overwrite}
            onChange={setOverwrite}
          />
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={bulk.isPending || !value}>
              {t('payroll.bulkTargets.apply')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- G5.3 year-to-date -------------------------------------------------------------

export function YtdCard({ year, branchId }: { year: number; branchId?: string }) {
  const { t } = useTranslation();
  const q = usePayrollYtd(year, branchId);
  const d = q.data;
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-foreground">{t('payroll.ytd.title', { year })}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{t('payroll.ytd.hint')}</p>
      {!d || d.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">
          {q.isLoading ? t('common.loading') : t('payroll.ytd.empty')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">{t('payroll.slip.staff')}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t('payroll.ytd.months')}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t('payroll.slip.gross')}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t('payroll.slip.sso')}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t('payroll.runs.employerSso')}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t('payroll.slip.tax')}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t('payroll.slip.net')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {d.rows.map((r) => (
                <tr key={r.staffProfileId}>
                  <td className="px-2 py-1.5 font-medium">{r.staffName}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.months}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums"><CurrencyText amount={r.grossPay} /></td>
                  <td className="px-2 py-1.5 text-right tabular-nums"><CurrencyText amount={r.ssoEmployee} /></td>
                  <td className="px-2 py-1.5 text-right tabular-nums"><CurrencyText amount={r.ssoEmployer} /></td>
                  <td className="px-2 py-1.5 text-right tabular-nums"><CurrencyText amount={r.incomeTax} /></td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums"><CurrencyText amount={r.netPay} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border font-semibold">
              <tr>
                <td className="px-2 py-1.5">{t('payroll.ytd.total', { runs: d.totals.runs })}</td>
                <td />
                <td className="px-2 py-1.5 text-right tabular-nums"><CurrencyText amount={d.totals.grossPay} /></td>
                <td className="px-2 py-1.5 text-right tabular-nums"><CurrencyText amount={d.totals.ssoEmployee} /></td>
                <td className="px-2 py-1.5 text-right tabular-nums"><CurrencyText amount={d.totals.ssoEmployer} /></td>
                <td className="px-2 py-1.5 text-right tabular-nums"><CurrencyText amount={d.totals.incomeTax} /></td>
                <td className="px-2 py-1.5 text-right tabular-nums"><CurrencyText amount={d.totals.netPay} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

