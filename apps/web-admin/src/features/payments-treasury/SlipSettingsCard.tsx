import type { SlipSettings } from '@abcp/shared-types';
import {
  AlarmClock,
  ArrowRight,
  Banknote,
  ChevronDown,
  Clock,
  Landmark,
  ShieldAlert,
  ScanLine,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { formatCurrency } from '@/lib/format';
import { useConfirm } from '@/hooks/useConfirm';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import { NormalizedApiError } from '@/services/apiError';

import { useBranches } from '@/features/branches/branches.api';

import { useSlipSettings, useUpdateSlipSettings } from './treasury.api';

/**
 * Slip-verification policy. Auto-approve is off by default on purpose: OCR can't tell a real slip from a
 * doctored one (no bank API yet), so enabling it is an explicit, confirmed risk decision by the owner.
 */
export function SlipSettingsCard({ canEdit, openSlips }: { canEdit: boolean; openSlips?: number }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { data, isLoading } = useSlipSettings();
  const save = useUpdateSlipSettings();
  const [tolerance, setTolerance] = useState('0');

  useEffect(() => {
    if (data) setTolerance(String(data.amountTolerance));
  }, [data]);

  const onError = (err: unknown) =>
    toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));

  async function toggleAuto(next: boolean) {
    if (next) {
      const ok = await confirm({
        title: t('payTreasury.banks.autoConfirmTitle'),
        description: t('payTreasury.banks.autoConfirmBody'),
        confirmLabel: t('payTreasury.banks.autoConfirmAction'),
        destructive: true,
      });
      if (!ok) return;
    }
    save.mutate(
      { autoApprove: next },
      { onSuccess: () => toast.success(t('common.saved')), onError },
    );
  }

  if (isLoading || !data) return <Skeleton className="h-[300px] w-full rounded-xl" />;

  const tolNum = Number(tolerance);
  const tolDirty = Number.isFinite(tolNum) && tolNum !== data.amountTolerance;

  return (
    <div className="flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-info-soft text-info">
          <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-semibold">{t('payTreasury.banks.slipPolicy')}</p>
          <p className="text-2xs text-muted-foreground">{t('payTreasury.banks.slipPolicyHint')}</p>
        </div>
      </div>

      <ol className="grid gap-1.5" aria-label={t('payTreasury.banks.checks.title')}>
        {(
          [
            {
              key: data.amountTolerance > 0 ? 'amount' : 'amountExact',
              icon: Banknote,
              extra: { amount: formatCurrency(data.amountTolerance) },
            },
            { key: 'account', icon: Landmark, extra: {} },
            { key: 'time', icon: Clock, extra: {} },
          ] as const
        ).map((c, i) => (
          <li
            key={c.key}
            className="flex items-center gap-2.5 rounded-md bg-muted/50 px-2.5 py-1.5"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-card text-[10px] font-semibold tabular-nums text-muted-foreground ring-1 ring-border">
              {i + 1}
            </span>
            <c.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 truncate text-xs">
              {t(`payTreasury.banks.checks.${c.key}`, c.extra)}
            </span>
          </li>
        ))}
      </ol>

      <div
        className={cn(
          'flex items-start justify-between gap-3 rounded-md border px-3 py-2.5',
          data.autoApprove ? 'border-warning/50 bg-warning-soft' : 'border-border',
        )}
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            {data.autoApprove ? (
              <ShieldAlert className="h-4 w-4 text-warning" aria-hidden="true" />
            ) : null}
            {t('payTreasury.banks.autoApprove')}
          </p>
          <p className="text-2xs text-muted-foreground">
            {t(data.autoApprove ? 'payTreasury.banks.autoOnHint' : 'payTreasury.banks.autoOffHint')}
          </p>
        </div>
        <Switch
          checked={data.autoApprove}
          disabled={!canEdit || save.isPending}
          aria-label={t('payTreasury.banks.autoApprove')}
          onCheckedChange={(v) => void toggleAuto(v)}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="grid gap-1">
          <label htmlFor="slip-tolerance" className="text-xs font-medium">
            {t('payTreasury.banks.tolerance')}
          </label>
          <p className="text-2xs text-muted-foreground">
            {t('payTreasury.banks.toleranceHint', { amount: formatCurrency(data.amountTolerance) })}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            id="slip-tolerance"
            type="number"
            inputMode="numeric"
            min={0}
            max={100000}
            step={100}
            disabled={!canEdit}
            className="h-8 w-28 text-right text-sm tabular-nums"
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8"
            disabled={!canEdit || !tolDirty || tolNum < 0 || tolNum > 100_000 || save.isPending}
            onClick={() =>
              save.mutate(
                { amountTolerance: tolNum },
                { onSuccess: () => toast.success(t('common.saved')), onError },
              )
            }
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
      <SlaSettings data={data} canEdit={canEdit} />
      {!canEdit ? (
        <p className="text-2xs text-muted-foreground">{t('payTreasury.banks.superOnly')}</p>
      ) : null}
      <Link
        to={ROUTES.paymentsSlips}
        className="mt-auto inline-flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span>{t('payTreasury.banks.checks.queue', { count: openSlips ?? 0 })}</span>
        <ArrowRight className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * S4 — how fast slips should be reviewed, per branch, and whether managers get a nudge when one waits
 * longer. Empty branch fields fall back to the default.
 */
function SlaSettings({ data, canEdit }: { data: SlipSettings; canEdit: boolean }) {
  const { t } = useTranslation();
  const save = useUpdateSlipSettings();
  const { data: branches = [] } = useBranches();
  const [sla, setSla] = useState(String(data.reviewSlaMinutes));
  const [perBranch, setPerBranch] = useState<Record<string, string>>({});

  useEffect(() => {
    setSla(String(data.reviewSlaMinutes));
    setPerBranch(
      Object.fromEntries(Object.entries(data.branchSlaMinutes).map(([k, v]) => [k, String(v)])),
    );
  }, [data]);

  const valid = (v: string) => /^\d+$/.test(v) && Number(v) >= 5 && Number(v) <= 1440;
  const cleaned = Object.fromEntries(
    Object.entries(perBranch)
      .filter(([, v]) => v.trim() !== '')
      .map(([k, v]) => [k, Number(v)]),
  );
  const branchesValid = Object.values(perBranch).every((v) => v.trim() === '' || valid(v));
  const dirty =
    Number(sla) !== data.reviewSlaMinutes ||
    JSON.stringify(cleaned) !== JSON.stringify(data.branchSlaMinutes);
  const onError = (err: unknown) =>
    toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));

  return (
    <div className="grid gap-2 rounded-md border border-border px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <AlarmClock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t('payTreasury.banks.sla.title')}
          </p>
          <p className="text-2xs text-muted-foreground">{t('payTreasury.banks.sla.hint')}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            id="slip-sla"
            type="number"
            inputMode="numeric"
            min={5}
            max={1440}
            disabled={!canEdit}
            aria-label={t('payTreasury.banks.sla.title')}
            className="h-8 w-20 text-right text-sm tabular-nums"
            value={sla}
            onChange={(e) => setSla(e.target.value)}
          />
          <span className="text-2xs text-muted-foreground">
            {t('payTreasury.banks.sla.minutes')}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs">{t('payTreasury.banks.sla.alert')}</p>
        <Switch
          checked={data.slaAlertEnabled}
          disabled={!canEdit || save.isPending}
          aria-label={t('payTreasury.banks.sla.alert')}
          onCheckedChange={(v) =>
            save.mutate(
              { slaAlertEnabled: v },
              { onSuccess: () => toast.success(t('common.saved')), onError },
            )
          }
        />
      </div>

      {branches.length > 1 ? (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-2xs font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronDown
              className="h-3 w-3 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
            {t('payTreasury.banks.sla.perBranch', {
              count: Object.keys(data.branchSlaMinutes).length,
            })}
          </summary>
          <ul className="mt-2 grid gap-1.5">
            {branches.map((b) => {
              const v = perBranch[b.id] ?? '';
              return (
                <li key={b.id} className="flex items-center justify-between gap-2 text-xs">
                  <label htmlFor={`sla-${b.id}`} className="min-w-0 truncate">
                    {b.name}
                  </label>
                  <Input
                    id={`sla-${b.id}`}
                    type="number"
                    inputMode="numeric"
                    min={5}
                    max={1440}
                    disabled={!canEdit}
                    placeholder={sla}
                    aria-invalid={v !== '' && !valid(v)}
                    className="h-7 w-20 text-right text-xs tabular-nums"
                    value={v}
                    onChange={(e) => setPerBranch((p) => ({ ...p, [b.id]: e.target.value }))}
                  />
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-8"
          disabled={!canEdit || !dirty || !valid(sla) || !branchesValid || save.isPending}
          onClick={() =>
            save.mutate(
              { reviewSlaMinutes: Number(sla), branchSlaMinutes: cleaned },
              { onSuccess: () => toast.success(t('common.saved')), onError },
            )
          }
        >
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
