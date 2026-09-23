import { CalendarCheck2, CircleCheck, CircleX, Lock, LockOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/hooks/useConfirm';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { useClosePeriod, usePeriodReadiness, usePeriods, useReopenPeriod } from './reconciliation.api';
import { todayKey } from './treasury.lib';

interface Props {
  open: boolean;
  onClose: () => void;
  isSuper: boolean;
  branches: { id: string; name: string }[];
  /** Branch admins are fixed to their own branch. */
  defaultBranchId: string;
  canReconcile: boolean;
  /** Jump the page to a month so the open items can be worked. */
  onReview: (month: string, branchId: string) => void;
}

function lastMonths(n: number): string[] {
  const [y, m] = todayKey().slice(0, 7).split('-').map(Number) as [number, number];
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function monthName(month: string, lang: string): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  try {
    return d.toLocaleDateString(lang.startsWith('en') ? 'en-GB' : 'lo-LA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return month;
  }
}

/**
 * G5 — month-end close. A month can be closed per branch only once every account-day has a
 * statement, every difference is explained, every imported line is matched or ignored and the
 * balances roll forward. Closing freezes statements, explanations and line matches for that
 * month; only a super admin can reopen it, with a reason that goes to the audit log.
 */
export function ReconPeriodDialog({ open, onClose, isSuper, branches, defaultBranchId, canReconcile, onReview }: Props) {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const months = lastMonths(12);
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [month, setMonth] = useState(months[0]!);
  const [note, setNote] = useState('');
  const readiness = usePeriodReadiness(open && branchId ? branchId : null, open ? month : null);
  const periods = usePeriods(isSuper ? undefined : branchId || undefined);
  const close = useClosePeriod();
  const reopen = useReopenPeriod();

  useEffect(() => {
    if (open) {
      setBranchId(defaultBranchId || branches[0]?.id || '');
      setNote('');
    }
  }, [open, defaultBranchId, branches]);

  const onError = (e: unknown) => toast.error(e instanceof NormalizedApiError ? e.message : t('common.saveError'));
  const r = readiness.data;
  const checks = r
    ? [
        { key: 'unreconciled', n: r.unreconciled },
        { key: 'unresolvedVariance', n: r.unresolvedVariance },
        { key: 'unmatchedLines', n: r.unmatchedLines },
        { key: 'balanceBreaks', n: r.balanceBreaks },
      ]
    : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck2 className="h-5 w-5 text-primary" aria-hidden="true" />
            {t('payTreasury.recon.period.title')}
          </DialogTitle>
          <DialogDescription>{t('payTreasury.recon.period.subtitle')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          {isSuper ? (
            <div className="grid gap-1.5">
              <Label htmlFor="per-branch">{t('payTreasury.col.branch')}</Label>
              <Select id="per-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="per-month">{t('payTreasury.recon.period.month')}</Label>
            <Select
              id="per-month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              options={months.map((m) => ({ value: m, label: monthName(m, i18n.language) }))}
            />
          </div>
        </div>

        {readiness.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : r ? (
          r.closed ? (
            <p className="flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm">
              <Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {t('payTreasury.recon.period.alreadyClosed')}
            </p>
          ) : (
            <section aria-label={t('payTreasury.recon.period.checklist')} className="rounded-lg border border-border">
              <ul className="divide-y divide-border text-sm">
                {checks.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="flex items-center gap-2">
                      {c.n === 0 ? (
                        <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" />
                      ) : (
                        <CircleX className="h-4 w-4 text-destructive" aria-hidden="true" />
                      )}
                      {t(`payTreasury.recon.period.check.${c.key}`)}
                    </span>
                    <span className={cn('text-xs font-semibold tabular-nums', c.n === 0 ? 'text-success' : 'text-destructive')}>
                      {c.n === 0 ? t('payTreasury.recon.period.ok') : c.n}
                    </span>
                  </li>
                ))}
              </ul>
              {!r.canClose ? (
                <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-3 py-2 text-2xs text-muted-foreground">
                  <span>{r.monthOpen ? t('payTreasury.recon.period.monthOpen') : t('payTreasury.recon.period.notReady')}</span>
                  {!r.monthOpen ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs"
                      onClick={() => {
                        onReview(month, r.branchId);
                        onClose();
                      }}
                    >
                      {t('payTreasury.recon.period.review')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>
          )
        ) : null}

        {r && r.canClose && canReconcile ? (
          <div className="grid gap-1.5">
            <Label htmlFor="per-note">{t('payTreasury.recon.note')}</Label>
            <Input id="per-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        ) : null}

        {(periods.data?.length ?? 0) > 0 ? (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground">{t('payTreasury.recon.period.closedList')}</h3>
            <ul className="mt-1 divide-y divide-border rounded-lg border border-border text-xs">
              {periods.data!.slice(0, 12).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 font-medium">
                      <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      {monthName(p.month, i18n.language)} · {p.branchName}
                    </span>
                    <span className="text-2xs text-muted-foreground">
                      {p.closedByName ?? '—'} · {formatDateTime(p.closedAt)}
                    </span>
                  </span>
                  {isSuper ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-2xs"
                      disabled={reopen.isPending}
                      onClick={async () => {
                        const ok = await confirm({
                          title: t('payTreasury.recon.period.reopenTitle'),
                          description: t('payTreasury.recon.period.reopenBody', { month: monthName(p.month, i18n.language), branch: p.branchName }),
                          confirmLabel: t('payTreasury.recon.period.reopen'),
                          destructive: true,
                        });
                        if (ok) reopen.mutate({ id: p.id }, { onSuccess: () => toast.success(t('payTreasury.recon.period.reopened')), onError });
                      }}
                    >
                      <LockOpen className="mr-1 h-3 w-3" aria-hidden="true" />
                      {t('payTreasury.recon.period.reopen')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          {canReconcile ? (
            <Button
              type="button"
              disabled={!r?.canClose || close.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: t('payTreasury.recon.period.confirmTitle', { month: monthName(month, i18n.language) }),
                  description: t('payTreasury.recon.period.confirmBody'),
                  confirmLabel: t('payTreasury.recon.period.close'),
                });
                if (ok)
                  close.mutate(
                    { branchId, month, note: note.trim() || undefined },
                    { onSuccess: () => toast.success(t('payTreasury.recon.period.closed')), onError },
                  );
              }}
            >
              <Lock className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('payTreasury.recon.period.close')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
