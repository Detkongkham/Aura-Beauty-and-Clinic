import type { BankAccountInsightsView, BankAccountView } from '@abcp/shared-types';
import { ArrowDownRight, ArrowUpRight, CircleCheck, CircleAlert, Minus, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Skeleton } from '@/components/ui/skeleton';
import { SegmentBar, SegmentLegend, type Segment } from '@/features/payroll/payroll.parts';
import { formatDelta, type Tone } from '@/features/payroll/payroll.lib';
import { ROUTES } from '@/router/paths';
import { formatCompactNumber, formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { DailyBars, Figure } from './banks.parts';
import { deltaPct, topShares, type SetupCheck } from './banks.lib';

const SHARE_TONES: Tone[] = ['primary', 'info', 'accent', 'success'];

/**
 * Band 1 — "how much landed, and where". The period total with its delta against the previous
 * equal-length window, today's take, paid-out and net, the split by receiving account and the
 * daily bars. Totals are summed in LAK; a note appears if any account holds another currency.
 */
export function InflowCard({
  insights,
  accounts,
  loading,
  onAssign,
}: {
  insights: BankAccountInsightsView | undefined;
  accounts: BankAccountView[];
  loading: boolean;
  /** Opens the assignment sheet for transfers booked without an account. */
  onAssign?: () => void;
}) {
  const { t } = useTranslation();
  if (loading || !insights) return <Skeleton className="h-[340px] w-full rounded-xl" />;

  const { totals, days } = insights;
  const delta = deltaPct(totals.receivedPeriod, totals.receivedPrevPeriod);
  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  const net = totals.receivedPeriod - totals.paidOutPeriod;
  const avg = totals.receivedPeriodCount > 0 ? totals.receivedPeriod / totals.receivedPeriodCount : 0;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const { top, other } = topShares(
    insights.accounts.map((a) => ({ id: a.bankAccountId, value: a.receivedPeriod })),
    4,
  );
  const segments: Segment[] = [
    ...top.map((s, i) => {
      const a = byId.get(s.id);
      return {
        key: s.id,
        value: s.value,
        tone: SHARE_TONES[i % SHARE_TONES.length]!,
        label: a ? `${a.bank.code} · ${a.accountName}` : '—',
      };
    }),
    ...(other > 0 ? [{ key: 'other', value: other, tone: 'neutral' as Tone, label: t('payTreasury.banks.hero.other') }] : []),
  ];
  const mixedCurrency = accounts.some((a) => a.currency !== 'LAK');

  return (
    <section
      aria-labelledby="inflow-title"
      className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 motion-reduce:animate-none sm:p-5"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="inflow-title" className="text-sm font-semibold">
            {t('payTreasury.banks.hero.title', { days })}
          </h2>
          <p className="text-2xs text-muted-foreground">
            {formatDate(insights.from)} – {formatDate(insights.to)} · {t('payTreasury.banks.hero.tenders')}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums',
            delta == null ? 'bg-muted text-muted-foreground' : delta >= 0 ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive',
          )}
          title={t('payTreasury.banks.hero.prev', { amount: formatCurrency(totals.receivedPrevPeriod) })}
        >
          <DeltaIcon className="h-3 w-3" aria-hidden="true" />
          {delta == null ? t('payTreasury.banks.hero.noBaseline') : t('payTreasury.banks.hero.vsPrev', { delta: formatDelta(delta), days })}
        </span>
      </div>

      <p className="relative mt-3 text-3xl font-semibold leading-none tabular-nums sm:text-4xl" title={formatCurrency(totals.receivedPeriod)}>
        {formatCurrency(totals.receivedPeriod)}
      </p>
      <p className="relative mt-1 text-xs text-muted-foreground">
        {t('payTreasury.banks.hero.txns', { count: totals.receivedPeriodCount })}
      </p>

      <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Figure
          label={t('payTreasury.banks.hero.today')}
          value={formatCurrency(totals.receivedToday)}
          hint={t('payTreasury.banks.hero.txns', { count: totals.receivedTodayCount })}
        />
        <Figure label={t('payTreasury.banks.hero.avg')} value={formatCurrency(avg)} hint={t('payTreasury.banks.hero.perTxn')} />
        <Figure label={t('payTreasury.banks.hero.paidOut')} value={formatCurrency(totals.paidOutPeriod)} hint={t('payTreasury.banks.hero.expenses')} />
        <Figure
          label={t('payTreasury.banks.hero.net')}
          value={formatCurrency(net)}
          tone={net < 0 ? 'danger' : undefined}
          hint={t('payTreasury.banks.hero.netHint')}
        />
      </div>

      <div className="relative mt-4 space-y-2">
        <p className="text-2xs font-medium text-muted-foreground">{t('payTreasury.banks.hero.split')}</p>
        <SegmentBar segments={segments} ariaLabel={t('payTreasury.banks.hero.split')} height="h-2.5" />
        {segments.length > 0 ? (
          <SegmentLegend segments={segments} render={(s) => formatCompactNumber(s.value)} />
        ) : (
          <p className="text-2xs text-muted-foreground">{t('payTreasury.banks.hero.nothing')}</p>
        )}
      </div>

      <div className="relative mt-4">
        <DailyBars values={totals.daily} fromKey={insights.from} height={64} />
      </div>

      {insights.unassigned.count > 0 || mixedCurrency ? (
        <div className="relative mt-3 space-y-1">
          {insights.unassigned.count > 0 ? (
            <p className="flex items-start gap-1.5 rounded-md bg-warning-soft px-2.5 py-1.5 text-2xs text-warning">
              <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="flex-1">
                {t('payTreasury.banks.hero.unassigned', {
                  count: insights.unassigned.count,
                  amount: formatCurrency(insights.unassigned.amount),
                })}
              </span>
              {onAssign ? (
                <button
                  type="button"
                  onClick={onAssign}
                  className="shrink-0 rounded px-1.5 font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('payTreasury.banks.unassigned.open')}
                </button>
              ) : null}
            </p>
          ) : null}
          {mixedCurrency ? <p className="text-2xs text-muted-foreground">{t('payTreasury.banks.hero.mixed')}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Band 1 (right) — the go-live checklist. Eight yes/no questions an owner should be able to answer
 * before trusting bank payments; each failed one links to where it's fixed.
 */
export function SetupHealthCard({
  checks,
  loading,
  onAdd,
  onFilterNoQr,
  onChannels,
}: {
  checks: SetupCheck[];
  loading: boolean;
  onAdd?: () => void;
  onFilterNoQr: () => void;
  onChannels: () => void;
}) {
  const { t } = useTranslation();
  if (loading) return <Skeleton className="h-[340px] w-full rounded-xl" />;
  const passed = checks.filter((c) => c.ok).length;
  const allOk = passed === checks.length;
  // failures first, keeping the canonical order within each group
  const ordered = [...checks.filter((c) => !c.ok), ...checks.filter((c) => c.ok)];

  const fixAction = (c: SetupCheck) => {
    const cls = 'shrink-0 rounded-md px-2 py-1 text-2xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
    if (c.fix === 'recon')
      return (
        <Link to={ROUTES.paymentsReconciliation} className={cls}>
          {t('payTreasury.banks.setup.fixRecon')}
        </Link>
      );
    const handler = c.fix === 'add' ? onAdd : c.fix === 'filter' ? onFilterNoQr : c.fix === 'channels' ? onChannels : undefined;
    if (!handler) return null;
    return (
      <button type="button" onClick={handler} className={cls}>
        {t(`payTreasury.banks.setup.fix.${c.fix}`)}
      </button>
    );
  };

  return (
    <section
      aria-labelledby="setup-title"
      className="flex h-full flex-col rounded-xl border border-border bg-card p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 motion-reduce:animate-none sm:p-5"
      style={{ animationDelay: '60ms' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', allOk ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning')}>
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id="setup-title" className="text-sm font-semibold">
              {t('payTreasury.banks.setup.title')}
            </h2>
            <p className="text-2xs text-muted-foreground">{t('payTreasury.banks.setup.hint')}</p>
          </div>
        </div>
        <p className="shrink-0 text-right">
          <span className="text-xl font-semibold tabular-nums">{passed}</span>
          <span className="text-xs text-muted-foreground">/{checks.length}</span>
        </p>
      </div>

      <div className="mt-3 flex gap-1" role="img" aria-label={t('payTreasury.banks.setup.score', { passed, total: checks.length })}>
        {checks.map((c) => (
          <span key={c.key} className={cn('h-1.5 flex-1 rounded-full', c.ok ? 'bg-success' : 'bg-warning')} />
        ))}
      </div>

      <ul className="mt-3 flex-1 divide-y divide-border">
        {ordered.map((c) => (
          <li key={c.key} className="flex items-center gap-2.5 py-2">
            {c.ok ? (
              <CircleCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <CircleAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p className={cn('text-xs', c.ok ? 'text-muted-foreground' : 'font-medium text-foreground')}>
                {t(`payTreasury.banks.setup.check.${c.key}.${c.ok ? 'ok' : 'bad'}`, { count: c.count })}
              </p>
            </div>
            <span className="sr-only">{t(c.ok ? 'payTreasury.banks.setup.passed' : 'payTreasury.banks.setup.failed')}</span>
            {!c.ok ? fixAction(c) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
