import type { ExpenseSummaryView } from '@abcp/shared-types';
import { ArrowRight, Banknote, CalendarClock, CircleCheck, Hourglass, Paperclip, Target, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { CurrencyText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TONE, deltaPct } from '@/features/payroll/payroll.lib';
import { SegmentBar, SegmentLegend, Sparkline, type Segment } from '@/features/payroll/payroll.parts';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { HOME_CURRENCY, ageDays, ageTone, budgetTone } from './expenses.lib';

interface Props {
  summary: ExpenseSummaryView | undefined;
  loading: boolean;
  canApprove: boolean;
  onReviewQueue: () => void;
  onPayQueue: () => void;
  onMissingReceipts: () => void;
  onOverdue: () => void;
  onBudget: () => void;
}

/**
 * The spend band — answers the two questions this page is opened for:
 * *how much have we spent this period (and is that more than usual)?* and
 * *what is waiting on me?* The figure is stated once, large; the bar under it says
 * how much of it has actually left the bank; the queue panel on the right turns the
 * two waiting states into one-click filters.
 */
export function SpendHero({ summary, loading, canApprove, onReviewQueue, onPayQueue, onMissingReceipts, onOverdue, onBudget }: Props) {
  const { t } = useTranslation();
  if (loading || !summary) return <Skeleton className="h-[188px] w-full rounded-xl" />;

  const s = summary;
  const amountOf = (st: string) => s.byStatus.find((x) => x.status === st)?.amount ?? 0;
  const delta = deltaPct(s.recognisedTotal, s.previous.recognisedTotal);
  const foreign = s.byCurrency.filter((c) => c.currency !== HOME_CURRENCY);
  const oldestDays = ageDays(s.oldestPendingAt);
  const oldestTone = TONE[ageTone(oldestDays)];
  const paidShare = s.recognisedTotal > 0 ? Math.round((amountOf('PAID') / s.recognisedTotal) * 100) : 0;
  const fixedShare = s.recognisedTotal > 0 ? Math.round((s.recurring.amount / s.recognisedTotal) * 100) : 0;
  const budgetActual = s.budget ? s.budget.byCategory.reduce((a, b) => a + b.actual, 0) : 0;
  const budgetPct = s.budget && s.budget.total > 0 ? Math.round((budgetActual / s.budget.total) * 100) : null;
  const overBudget = s.budget ? s.budget.byCategory.filter((c) => c.actual > c.budget).length : 0;

  const segments: Segment[] = [
    { key: 'paid', value: amountOf('PAID'), tone: 'success', label: t('payTreasury.exp.status.PAID') },
    { key: 'approved', value: amountOf('APPROVED'), tone: 'info', label: t('payTreasury.exp.hero.approvedUnpaid') },
    { key: 'submitted', value: amountOf('SUBMITTED'), tone: 'warning', label: t('payTreasury.exp.status.SUBMITTED') },
    { key: 'draft', value: amountOf('DRAFT'), tone: 'neutral', label: t('payTreasury.exp.status.DRAFT') },
  ];

  return (
    <section
      aria-labelledby="spend-heading"
      className={cn(
        'relative overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] via-card to-accent-soft/25 p-4 shadow-sm sm:p-5',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
      )}
    >
      <Wallet className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 -rotate-12 text-primary/[0.06]" aria-hidden="true" />

      <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <p id="spend-heading" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-primary">
            <Banknote className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('payTreasury.exp.hero.title')}
            <span className="rounded-full bg-card/80 px-2 py-0.5 text-2xs font-normal tabular-nums text-muted-foreground ring-1 ring-border">
              {formatDate(s.from)} – {formatDate(s.to)}
            </span>
          </p>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-bold leading-none tabular-nums text-foreground">
              <CurrencyText amount={s.recognisedTotal} />
            </span>
            <span
              className={cn(
                'text-xs font-semibold tabular-nums',
                delta == null ? 'text-muted-foreground' : delta > 0 ? 'text-warning' : 'text-success',
              )}
              title={t('payTreasury.exp.hero.prevRange', { from: formatDate(s.previous.from), to: formatDate(s.previous.to) })}
            >
              {delta == null
                ? t('payTreasury.exp.hero.noBaseline')
                : t('payTreasury.exp.hero.vsPrev', { delta: delta > 0 ? `+${delta}` : delta === 0 ? '0' : `−${Math.abs(delta)}` })}
            </span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              {t('payTreasury.exp.hero.prevWas')}{' '}
              <CurrencyText amount={s.previous.recognisedTotal} className="font-medium text-foreground" />
            </span>
            <span>
              {t('payTreasury.exp.hero.paidShare')} <span className="font-medium tabular-nums text-foreground">{paidShare}%</span>
            </span>
            {s.recurring.count > 0 ? (
              <span title={t('payTreasury.exp.hero.fixedTitle')}>
                {t('payTreasury.exp.hero.fixed')} <span className="font-medium tabular-nums text-foreground">{fixedShare}%</span>
              </span>
            ) : null}
          </p>

          <div className="mt-3 space-y-1.5">
            <SegmentBar segments={segments} ariaLabel={t('payTreasury.exp.hero.splitAria')} />
            <SegmentLegend segments={segments} render={(seg) => <CurrencyText amount={seg.value} />} />
          </div>

          {s.byDay.length > 1 ? (
            <div className="mt-3 max-w-[320px]">
              <Sparkline values={s.byDay.map((d) => d.amount)} ariaLabel={t('payTreasury.exp.hero.dailyAria')} />
              <p className="mt-0.5 text-2xs text-muted-foreground">{t('payTreasury.exp.hero.dailyCaption')}</p>
            </div>
          ) : null}

          {s.budget && budgetPct != null ? (
            <button
              type="button"
              onClick={onBudget}
              className="mt-3 block w-full max-w-[420px] rounded-md text-left transition-colors hover:bg-card/60"
            >
              <span className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Target className="h-3 w-3" aria-hidden="true" />
                  {t('payTreasury.exp.hero.budget', { count: s.budget.months.length, months: s.budget.months.length })}
                </span>
                <span className={cn('font-semibold tabular-nums', TONE[budgetTone(budgetActual, s.budget.total)].text)}>
                  {budgetPct}% · <CurrencyText amount={budgetActual} /> / <CurrencyText amount={s.budget.total} />
                </span>
              </span>
              <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className={cn('block h-full rounded-full transition-[width] duration-500', TONE[budgetTone(budgetActual, s.budget.total)].bar)}
                  style={{ width: `${Math.min(100, budgetPct)}%` }}
                />
              </span>
              {overBudget > 0 ? (
                <span className="mt-0.5 block text-2xs text-destructive">{t('payTreasury.exp.hero.overBudget', { count: overBudget })}</span>
              ) : null}
            </button>
          ) : null}

          {foreign.length > 0 ? (
            <p className="mt-2 text-2xs text-muted-foreground">
              {t('payTreasury.exp.hero.converted', { list: foreign.map((c) => `${c.count} × ${c.currency}`).join(', ') })}
            </p>
          ) : null}
        </div>

        {/* ── action queue ── */}
        <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card/75 p-3 backdrop-blur-sm">
          <p className="text-xs font-semibold text-foreground">{t('payTreasury.exp.hero.queue')}</p>

          <QueueRow
            icon={Hourglass}
            tone="warning"
            label={t('payTreasury.exp.status.SUBMITTED')}
            count={s.pendingApproval.count}
            amount={s.pendingApproval.amount}
            hint={
              oldestDays != null ? (
                <span className={oldestTone.text}>
                  {oldestDays === 0
                    ? t('payTreasury.exp.hero.oldestToday')
                    : t('payTreasury.exp.hero.oldest', { count: oldestDays })}
                </span>
              ) : null
            }
            action={canApprove ? t('payTreasury.exp.hero.review') : t('payTreasury.exp.hero.view')}
            onAction={onReviewQueue}
          />
          <QueueRow
            icon={Banknote}
            tone="info"
            label={t('payTreasury.exp.hero.approvedUnpaid')}
            count={s.awaitingPayment.count}
            amount={s.awaitingPayment.amount}
            action={canApprove ? t('payTreasury.exp.hero.pay') : t('payTreasury.exp.hero.view')}
            onAction={onPayQueue}
          />
          {s.overdue.count > 0 || s.dueSoon.count > 0 ? (
            <QueueRow
              icon={CalendarClock}
              tone={s.overdue.count > 0 ? 'danger' : 'warning'}
              label={s.overdue.count > 0 ? t('payTreasury.exp.flag.overdue') : t('payTreasury.exp.hero.dueSoon')}
              count={s.overdue.count > 0 ? s.overdue.count : s.dueSoon.count}
              amount={s.overdue.count > 0 ? s.overdue.amount : s.dueSoon.amount}
              hint={s.overdue.count > 0 && s.dueSoon.count > 0 ? t('payTreasury.exp.hero.plusDueSoon', { count: s.dueSoon.count }) : null}
              action={t('payTreasury.exp.hero.view')}
              onAction={s.overdue.count > 0 ? onOverdue : onPayQueue}
            />
          ) : null}
          <QueueRow
            icon={Paperclip}
            tone={s.missingReceipts.count > 0 ? 'danger' : 'success'}
            label={t('payTreasury.exp.flag.missingReceipt')}
            count={s.missingReceipts.count}
            amount={s.missingReceipts.amount}
            action={t('payTreasury.exp.hero.view')}
            onAction={onMissingReceipts}
          />
          {s.bankPaid.count > 0 || s.cashPaid.count > 0 ? (
            <div className="mt-1 space-y-1 border-t border-border pt-2 text-2xs text-muted-foreground">
              {s.bankPaid.count > 0 ? (
                <p className="flex items-center justify-between gap-2">
                  <span>{t('payTreasury.exp.hero.bankMatched')}</span>
                  <span className={cn('font-semibold tabular-nums', s.bankPaid.matched < s.bankPaid.count ? 'text-warning' : 'text-success')}>
                    {s.bankPaid.matched}/{s.bankPaid.count}
                  </span>
                </p>
              ) : null}
              {s.cashPaid.count > 0 ? (
                <p className="flex items-center justify-between gap-2">
                  <span>{t('payTreasury.exp.hero.cashPaid', { count: s.cashPaid.count })}</span>
                  <CurrencyText amount={s.cashPaid.amount} className="font-semibold text-foreground" />
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function QueueRow({
  icon: Icon,
  tone,
  label,
  count,
  amount,
  hint,
  action,
  onAction,
}: {
  icon: typeof Hourglass;
  tone: 'warning' | 'info' | 'danger' | 'success';
  label: string;
  count: number;
  amount: number;
  hint?: ReactNode;
  action: string;
  onAction: () => void;
}) {
  const { t } = useTranslation();
  const empty = count === 0;
  const c = TONE[tone];
  return (
    <div className="flex items-center gap-2.5 rounded-md px-1 py-1">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', empty ? TONE.neutral.chip : c.chip)}>
        {empty ? <CircleCheck className="h-4 w-4" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-2xs text-muted-foreground">{label}</p>
        <p className="flex items-baseline gap-1.5 text-sm">
          <span className="font-semibold tabular-nums">{count}</span>
          {!empty ? <CurrencyText amount={amount} className="truncate text-2xs text-muted-foreground" /> : <span className="text-2xs text-muted-foreground">{t('payTreasury.exp.hero.clear')}</span>}
        </p>
        {hint ? <p className="truncate text-2xs">{hint}</p> : null}
      </div>
      {!empty ? (
        <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1 px-2 text-2xs" onClick={onAction}>
          {action}
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
