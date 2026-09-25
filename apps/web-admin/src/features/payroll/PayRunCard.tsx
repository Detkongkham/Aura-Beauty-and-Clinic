import type { PayrollReport } from '@abcp/shared-types';
import { Banknote, CircleAlert, Clock3, Gift, HandCoins, Percent } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CurrencyText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import { formatCurrency } from '@/lib/format';
import { commissionPayableNow, deltaPct, monthLabel } from './payroll.lib';
import { SegmentBar, SegmentLegend, Sparkline, type Segment } from './payroll.parts';

interface Props {
  report: PayrollReport | undefined;
  loading: boolean;
  canManage: boolean;
  /** Pays every staff member who still has unpaid commission this month. */
  onPayAll: () => void;
  paying: boolean;
}

/**
 * The pay-run band — the one thing an owner opens this page to answer:
 * *how much is this month's labour, and how much of it is still owed?*
 *
 * Money comes first and is stated once, large; the composition bar underneath
 * says what that figure is made of (already paid · commission still owed ·
 * bonus still owed) before any table is read. The settle action lives here
 * rather than in the toolbar because it belongs to the figure it clears.
 */
export function PayRunCard({ report, loading, canManage, onPayAll, paying }: Props) {
  const { t, i18n } = useTranslation();

  if (loading || !report) {
    return <Skeleton className="h-[164px] w-full rounded-xl" />;
  }

  const { totals, previous, daily } = report;
  const paidCommission = totals.commissionPaid;
  const paidBonus = totals.bonusTotal - totals.bonusUnpaid;
  const payableDelta = deltaPct(totals.payable, previous.payable);

  const segments: Segment[] = [
    {
      key: 'paid',
      value: paidCommission + paidBonus,
      tone: 'success',
      label: t('payroll.split.paid'),
    },
    {
      key: 'commissionDue',
      value: totals.commissionUnpaid,
      tone: 'warning',
      label: t('payroll.split.commissionDue'),
    },
    { key: 'bonusDue', value: totals.bonusUnpaid, tone: 'info', label: t('payroll.split.bonusDue') },
  ];

  const settled = totals.payable > 0 ? Math.round(((totals.payable - totals.outstanding) / totals.payable) * 100) : 100;
  const monthProgress = report.daysInMonth > 0 ? Math.round((report.daysElapsed / report.daysInMonth) * 100) : 0;

  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] via-card to-accent-soft/25 p-4 shadow-sm sm:p-5',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
      )}
      aria-labelledby="payrun-heading"
    >
      <HandCoins
        className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rotate-12 text-primary/[0.06]"
        aria-hidden="true"
      />

      <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        {/* ── the figure + what it is made of ── */}
        <div className="min-w-0">
          <p id="payrun-heading" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-primary">
            <Banknote className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('payroll.payRun.title', { month: monthLabel(report.monthYear, i18n.language) })}
            {report.isCurrentMonth ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-2xs font-medium text-info">
                <Clock3 className="h-3 w-3" aria-hidden="true" />
                {t('payroll.payRun.inProgress', {
                  day: report.daysElapsed,
                  total: report.daysInMonth,
                })}
              </span>
            ) : null}
          </p>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-bold leading-none tabular-nums text-foreground">
              <CurrencyText amount={totals.payable} />
            </span>
            <span
              className={cn(
                'text-xs font-semibold tabular-nums',
                payableDelta == null
                  ? 'text-muted-foreground'
                  : payableDelta > 0
                    ? 'text-warning'
                    : 'text-success',
              )}
              title={t('payroll.payRun.vsPrevTitle', {
                month: monthLabel(previous.monthYear, i18n.language),
              })}
            >
              {payableDelta == null
                ? t('payroll.noBaseline')
                : t('payroll.payRun.vsPrev', {
                    delta: payableDelta > 0 ? `+${payableDelta}` : `−${Math.abs(payableDelta)}`,
                  })}
            </span>
          </div>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Banknote className="h-3 w-3" aria-hidden="true" />
              {t('payroll.col.commission')} <CurrencyText amount={totals.commissionTotal} className="font-medium text-foreground" />
            </span>
            <span className="inline-flex items-center gap-1">
              <Gift className="h-3 w-3" aria-hidden="true" />
              {t('payroll.col.bonus')} <CurrencyText amount={totals.bonusTotal} className="font-medium text-foreground" />
            </span>
            <span
              className="inline-flex items-center gap-1"
              title={t('payroll.payRun.labourRatioTitle')}
            >
              <Percent className="h-3 w-3" aria-hidden="true" />
              {t('payroll.payRun.labourRatio')}{' '}
              <span className="font-medium text-foreground tabular-nums">
                {Math.round(totals.labourCostRatio * 100)}%
              </span>
            </span>
          </p>

          <div className="mt-3 space-y-1.5">
            <SegmentBar segments={segments} ariaLabel={t('payroll.payRun.splitAria')} />
            <SegmentLegend
              segments={segments}
              render={(s) => <CurrencyText amount={s.value} />}
            />
          </div>

          {daily.length > 1 ? (
            <div className="mt-3 max-w-[280px]">
              <Sparkline
                values={daily.map((d) => d.revenue)}
                ariaLabel={t('payroll.payRun.dailyAria')}
              />
              <p className="mt-0.5 text-2xs text-muted-foreground">
                {t('payroll.payRun.dailyCaption')}
              </p>
            </div>
          ) : null}
        </div>

        {/* ── what is still owed + the one action that clears it ── */}
        <div className="flex min-w-0 flex-col justify-between gap-3 rounded-lg border border-border bg-card/70 p-3.5 lg:w-[268px]">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CircleAlert
                className={cn('h-3.5 w-3.5', totals.outstanding > 0 ? 'text-warning' : 'text-success')}
                aria-hidden="true"
              />
              {t('payroll.stat.outstanding')}
            </p>
            <p
              className={cn(
                'mt-0.5 text-2xl font-bold leading-tight tabular-nums',
                totals.outstanding > 0 ? 'text-warning' : 'text-success',
              )}
            >
              <CurrencyText amount={totals.outstanding} />
            </p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {totals.outstanding > 0
                ? t('payroll.stat.staffOwed', { count: totals.staffOwed, total: totals.staff })
                : t('payroll.payRun.allSettled')}
            </p>

            <div className="mt-2.5">
              <div className="flex items-center justify-between text-2xs text-muted-foreground">
                <span>{t('payroll.payRun.settled')}</span>
                <span className="font-semibold tabular-nums text-foreground">{settled}%</span>
              </div>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-success transition-[width] duration-500 ease-out motion-reduce:transition-none"
                  style={{ width: `${settled}%` }}
                />
              </span>
            </div>

            {report.isCurrentMonth ? (
              <div className="mt-2">
                <div className="flex items-center justify-between text-2xs text-muted-foreground">
                  <span>{t('payroll.payRun.monthProgress')}</span>
                  <span className="tabular-nums">{monthProgress}%</span>
                </div>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-info/70"
                    style={{ width: `${monthProgress}%` }}
                  />
                </span>
              </div>
            ) : null}
          </div>

          {canManage ? (
            <Button
              className="w-full"
              disabled={paying || commissionPayableNow(totals) <= 0}
              onClick={onPayAll}
            >
              <Banknote className="mr-1 h-4 w-4" aria-hidden="true" />
              {commissionPayableNow(totals) > 0
                ? t('payroll.payAllOutstanding', { count: totals.staffOwed })
                : totals.commissionHeld > 0
                  ? t('payroll.nothingCollected')
                  : t('payroll.allPaid')}
            </Button>
          ) : null}
          {totals.commissionHeld > 0 ? (
            <p className="text-center text-2xs text-muted-foreground" title={t('payroll.heldHint')}>
              {t('payroll.heldTotal', { amount: formatCurrency(totals.commissionHeld) })}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
