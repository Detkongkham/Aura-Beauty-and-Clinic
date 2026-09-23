import { ArrowDownLeft, ArrowUpRight, History, Landmark, PenLine, Rows3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CurrencyText } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TONE } from '@/features/payroll/payroll.lib';
import { SegmentBar, type Segment } from '@/features/payroll/payroll.parts';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { STATUS_TONE, ageInDays, enumerateDays, type AccountStats } from './reconciliation.lib';
import { maskAccount } from './treasury.lib';

interface Props {
  from: string;
  to: string;
  accounts: AccountStats[];
  loading: boolean;
  canManage: boolean;
  onLedger: (bankAccountId: string) => void;
  onOpen: (bankAccountId: string, date: string) => void;
}

/** A statement older than this many days marks the account as falling behind. */
const BEHIND_DAYS = 3;

/**
 * One card per bank account, worst first. Answers "which account is falling
 * behind?": how much of it has been checked, when it was last checked, and how
 * much of its money is still unexplained.
 */
export function ReconAccounts({ from, to, accounts, loading, canManage, onLedger, onOpen }: Props) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[260px] w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center">
        <Landmark className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium">{t('payTreasury.recon.noAccounts')}</p>
      </div>
    );
  }

  const days = enumerateDays(from, to).reverse().slice(-31);

  return (
    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {accounts.map((a, idx) => {
        const checked = a.matched + a.variance + a.resolved;
        const total = a.rows.length;
        const pct = total > 0 ? Math.round((checked / total) * 100) : null;
        const lastAge = a.lastStatementDate ? ageInDays(a.lastStatementDate) : null;
        const behind = lastAge == null ? total > 0 : lastAge > BEHIND_DAYS;
        const oldestOpen = [...a.rows].filter((r) => r.status === 'UNRECONCILED').sort((x, y) => x.date.localeCompare(y.date))[0];
        const segments: Segment[] = [
          { key: 'm', value: a.matched, tone: 'success', label: t('payTreasury.recon.status.MATCHED') },
          { key: 'r', value: a.resolved, tone: 'info', label: t('payTreasury.recon.status.RESOLVED') },
          { key: 'v', value: a.variance, tone: 'danger', label: t('payTreasury.recon.status.VARIANCE') },
          { key: 'u', value: a.unreconciled, tone: 'warning', label: t('payTreasury.recon.status.UNRECONCILED') },
        ];
        return (
          <article
            key={a.bankAccountId}
            className={cn(
              'flex flex-col rounded-xl border bg-card p-4 shadow-sm',
              'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
              'transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0',
              a.variance > 0 ? 'border-destructive/30' : 'border-border',
            )}
            style={idx > 0 ? { animationDelay: `${Math.min(idx, 8) * 45}ms` } : undefined}
          >
            <header className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">
                {a.bankCode}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-semibold">{a.accountName}</h3>
                <p className="truncate text-2xs text-muted-foreground">
                  <span className="font-mono">{maskAccount(a.accountNumber)}</span> · {a.branchName} · {a.currency}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {a.isDefault ? <Badge variant="info" className="px-1.5 py-0 text-2xs">{t('payTreasury.recon.defaultAccount')}</Badge> : null}
                  {!a.isActive ? <Badge variant="neutral" className="px-1.5 py-0 text-2xs">{t('payTreasury.recon.inactiveAccount')}</Badge> : null}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className={cn('text-xl font-bold leading-none tabular-nums', pct == null ? 'text-muted-foreground' : pct === 100 ? 'text-success' : 'text-foreground')}>
                  {pct == null ? '—' : `${pct}%`}
                </p>
                <p className="mt-0.5 text-2xs text-muted-foreground">{t('payTreasury.recon.checkedShort', { checked, total })}</p>
              </div>
            </header>

            <SegmentBar className="mt-3" segments={segments} ariaLabel={t('payTreasury.recon.health.splitAria')} />
            <p className="mt-1 flex flex-wrap gap-x-3 text-2xs text-muted-foreground">
              {segments.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1">
                  <span className={cn('h-1.5 w-1.5 rounded-full', TONE[s.tone].bar)} aria-hidden="true" />
                  {s.label} <span className="font-semibold text-foreground tabular-nums">{s.value}</span>
                </span>
              ))}
            </p>

            {/* day strip */}
            <div className="mt-3 flex gap-[2px]" role="img" aria-label={t('payTreasury.recon.accountStripAria', { count: days.length })}>
              {days.map((d) => {
                const r = a.byDate.get(d);
                return (
                  <span
                    key={d}
                    title={`${formatDate(d)} · ${r ? t(`payTreasury.recon.status.${r.status}`) : t('payTreasury.recon.noActivity')}`}
                    className={cn('h-4 min-w-[3px] flex-1 rounded-[2px]', r ? TONE[STATUS_TONE[r.status]].bar : 'bg-muted', r?.status === 'MATCHED' && 'opacity-70')}
                  />
                );
              })}
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-muted/50 px-2.5 py-1.5">
                <dt className="flex items-center gap-1 text-2xs text-muted-foreground">
                  <ArrowDownLeft className="h-3 w-3" aria-hidden="true" />
                  {t('payTreasury.recon.health.moneyIn')}
                </dt>
                <dd className="font-semibold tabular-nums">
                  <CurrencyText amount={a.systemCredit} currency={a.currency as 'LAK'} />
                </dd>
              </div>
              <div className="rounded-md bg-muted/50 px-2.5 py-1.5">
                <dt className="flex items-center gap-1 text-2xs text-muted-foreground">
                  <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  {t('payTreasury.recon.health.moneyOut')}
                </dt>
                <dd className="font-semibold tabular-nums">
                  <CurrencyText amount={a.systemDebit} currency={a.currency as 'LAK'} />
                </dd>
              </div>
              <div className="col-span-2 flex items-center justify-between rounded-md border border-border px-2.5 py-1.5">
                <dt className="text-2xs text-muted-foreground">{t('payTreasury.recon.health.toExplain')}</dt>
                <dd className="tabular-nums">
                  {a.absVariance > 0 ? (
                    <CurrencyText amount={a.absVariance} currency={a.currency as 'LAK'} className="font-semibold text-destructive" />
                  ) : (
                    <span className="text-muted-foreground">{t('payTreasury.recon.none')}</span>
                  )}
                </dd>
              </div>
            </dl>

            <p className={cn('mt-3 flex items-center gap-1.5 text-2xs', behind ? 'text-warning' : 'text-muted-foreground')}>
              <History className="h-3 w-3" aria-hidden="true" />
              {a.lastStatementDate
                ? t('payTreasury.recon.lastStatement', { date: formatDate(a.lastStatementDate), count: lastAge ?? 0 })
                : t('payTreasury.recon.neverReconciled')}
            </p>

            <div className="mt-auto flex gap-2 pt-3">
              <Button variant="secondary" size="sm" className="h-8 flex-1 text-xs" onClick={() => onLedger(a.bankAccountId)}>
                <Rows3 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                {t('payTreasury.recon.viewLedger')}
              </Button>
              {canManage && oldestOpen ? (
                <Button size="sm" className="h-8 flex-1 text-xs" onClick={() => onOpen(a.bankAccountId, oldestOpen.date)}>
                  <PenLine className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  {t('payTreasury.recon.enterOldest', { date: formatDate(oldestOpen.date) })}
                </Button>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
