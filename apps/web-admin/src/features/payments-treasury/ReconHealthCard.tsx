import type { ReconciliationRow, ReconciliationStatus, ReconciliationView } from '@abcp/shared-types';
import { ArrowDownLeft, ArrowUpRight, CircleCheck, FileQuestion, Link2Off, PenLine, Percent, Scale, SearchCheck, ShieldCheck, Unlink } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { CurrencyText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TONE } from '@/features/payroll/payroll.lib';
import { SegmentBar, SegmentLegend, type Segment } from '@/features/payroll/payroll.parts';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { STATUS_TONE, ageInDays, enumerateDays, rowGap, type ReconSummary } from './reconciliation.lib';
import { SignedAmount } from './recon.parts';

interface Props {
  view: ReconciliationView | undefined;
  summary: ReconSummary;
  loading: boolean;
  canManage: boolean;
  onOpenRow: (r: ReconciliationRow) => void;
}

const SEVERITY: Record<ReconciliationStatus, number> = { MATCHED: 0, RESOLVED: 1, UNRECONCILED: 2, VARIANCE: 3 };

/**
 * The health band — the question this page exists to answer:
 * *does the bank agree with the books, and what is still left to do?*
 *
 * Left: how much of the range has been checked (a 3-part bar), then money in and
 * money out, system beside statement, with the signed difference under each.
 * A strip of one bar per day underneath shows *when* the problems are.
 * Right: what still has to be explained, the biggest gap, and the oldest day
 * with no statement, each one click from its drawer.
 */
export function ReconHealthCard({ view, summary: s, loading, canManage, onOpenRow }: Props) {
  const { t } = useTranslation();

  const strip = useMemo(() => {
    if (!view) return [];
    const byDate = new Map<string, { status: ReconciliationStatus; credit: number; n: number }>();
    for (const r of view.rows) {
      const cur = byDate.get(r.date);
      if (!cur) byDate.set(r.date, { status: r.status, credit: r.systemCredit, n: 1 });
      else {
        cur.credit += r.systemCredit;
        cur.n += 1;
        if (SEVERITY[r.status] > SEVERITY[cur.status]) cur.status = r.status;
      }
    }
    return enumerateDays(view.from, view.to)
      .reverse()
      .map((d) => ({ date: d, ...(byDate.get(d) ?? { status: null as ReconciliationStatus | null, credit: 0, n: 0 }) }));
  }, [view]);

  if (loading || !view) return <Skeleton className="h-[212px] w-full rounded-xl" />;

  const totals = view.totals;
  const checked = s.matched + s.variance + s.resolved;
  const segments: Segment[] = [
    { key: 'matched', value: s.matched, tone: 'success', label: t('payTreasury.recon.status.MATCHED') },
    { key: 'resolved', value: s.resolved, tone: 'info', label: t('payTreasury.recon.status.RESOLVED') },
    { key: 'variance', value: s.variance, tone: 'danger', label: t('payTreasury.recon.status.VARIANCE') },
    { key: 'unreconciled', value: s.unreconciled, tone: 'warning', label: t('payTreasury.recon.status.UNRECONCILED') },
  ];
  const maxCredit = Math.max(1, ...strip.map((d) => d.credit));
  const clean = s.rows > 0 && s.variance === 0 && s.unreconciled === 0;

  return (
    <section
      aria-labelledby="recon-health-heading"
      className={cn(
        'relative overflow-hidden rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.07] via-card to-accent-soft/25 p-4 shadow-sm sm:p-5',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
      )}
    >
      <Scale className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 -rotate-12 text-primary/[0.06]" aria-hidden="true" />

      <div className="relative grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <p id="recon-health-heading" className="flex items-center gap-1.5 text-[13px] font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            {t('payTreasury.recon.health.title')}
          </p>

          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-bold leading-none tabular-nums text-foreground">
              {checked}
              <span className="text-lg font-semibold text-muted-foreground"> / {s.rows}</span>
            </span>
            <span className="text-sm text-muted-foreground">{t('payTreasury.recon.health.checkedLabel')}</span>
            {s.accuracyPct != null ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums',
                  s.accuracyPct === 100 ? TONE.success.chip : s.accuracyPct >= 80 ? TONE.warning.chip : TONE.danger.chip,
                )}
                title={t('payTreasury.recon.health.accuracyTitle')}
              >
                <CircleCheck className="h-3 w-3" aria-hidden="true" />
                {t('payTreasury.recon.health.accuracy', { pct: s.accuracyPct })}
              </span>
            ) : null}
          </div>

          <div className="mt-3 space-y-1.5">
            <SegmentBar segments={segments} ariaLabel={t('payTreasury.recon.health.splitAria')} />
            <SegmentLegend segments={segments} render={(seg) => <span className="tabular-nums">{seg.value}</span>} />
          </div>

          {s.systemFee > 0 || s.balanceBreaks > 0 || s.unmatchedLines > 0 ? (
            <ul className="mt-2.5 flex flex-wrap gap-1.5 text-2xs">
              {s.systemFee > 0 ? (
                <li className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5', TONE.info.chip)} title={t('payTreasury.recon.health.feeTitle')}>
                  <Percent className="h-3 w-3" aria-hidden="true" />
                  {t('payTreasury.recon.health.fee')} <CurrencyText amount={s.systemFee} className="font-semibold" />
                </li>
              ) : null}
              {s.unmatchedLines > 0 ? (
                <li className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5', TONE.warning.chip)}>
                  <Link2Off className="h-3 w-3" aria-hidden="true" />
                  {t('payTreasury.recon.health.unmatchedLines', { count: s.unmatchedLines })}
                </li>
              ) : null}
              {s.balanceBreaks > 0 ? (
                <li className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5', TONE.danger.chip)}>
                  <Unlink className="h-3 w-3" aria-hidden="true" />
                  {t('payTreasury.recon.health.balanceBreaks', { count: s.balanceBreaks })}
                </li>
              ) : null}
            </ul>
          ) : null}

          {/* money in / out, system beside statement */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <FlowBlock
              icon={ArrowDownLeft}
              label={t('payTreasury.recon.health.moneyIn')}
              system={totals.systemCredit}
              statement={totals.statementCredit}
              variance={s.netCreditVariance}
            />
            <FlowBlock
              icon={ArrowUpRight}
              label={t('payTreasury.recon.health.moneyOut')}
              system={totals.systemDebit}
              statement={totals.statementDebit}
              variance={s.netDebitVariance}
            />
          </div>

          {strip.length > 1 ? (
            <div className="mt-4">
              <div
                className="flex h-10 items-end gap-[2px]"
                role="img"
                aria-label={t('payTreasury.recon.health.stripAria', {
                  variance: s.variance,
                  missing: s.unreconciled,
                })}
              >
                {strip.map((d) => (
                  <span
                    key={d.date}
                    className={cn(
                      'min-w-[3px] flex-1 rounded-t-[2px]',
                      d.status ? TONE[STATUS_TONE[d.status]].bar : 'bg-muted',
                      d.status === 'MATCHED' && 'opacity-70',
                    )}
                    style={{ height: d.status ? `${Math.max(14, (d.credit / maxCredit) * 100)}%` : '8%' }}
                    title={`${formatDate(d.date)} · ${d.status ? t(`payTreasury.recon.status.${d.status}`) : t('payTreasury.recon.noActivity')}`}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-2xs text-muted-foreground tabular-nums">
                <span>{formatDate(strip[0]!.date)}</span>
                <span>{t('payTreasury.recon.health.stripCaption')}</span>
                <span>{formatDate(strip[strip.length - 1]!.date)}</span>
              </div>
            </div>
          ) : null}
        </div>

        {/* ── what is left to do ── */}
        <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card/70 p-3.5">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <SearchCheck className={cn('h-3.5 w-3.5', s.absVariance > 0 ? 'text-destructive' : 'text-success')} aria-hidden="true" />
              {t('payTreasury.recon.health.toExplain')}
            </p>
            <p className={cn('mt-0.5 text-2xl font-bold leading-tight tabular-nums', s.absVariance > 0 ? 'text-destructive' : 'text-success')}>
              <CurrencyText amount={s.absVariance} />
            </p>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {clean
                ? t('payTreasury.recon.health.allClear')
                : s.variance > 0
                  ? t('payTreasury.recon.health.varianceDays', { count: s.variance })
                  : t('payTreasury.recon.health.noVariance')}
            </p>
            {s.resolvedVariance > 0 ? (
              <p className="mt-0.5 text-2xs text-info">
                {t('payTreasury.recon.health.resolvedAmount')} <CurrencyText amount={s.resolvedVariance} className="font-semibold" />
              </p>
            ) : null}
          </div>

          {s.largestVariance ? (
            <ActionRow
              tone="danger"
              icon={Scale}
              title={t('payTreasury.recon.health.largest')}
              body={
                <>
                  {formatDate(s.largestVariance.date)} · {s.largestVariance.bankCode} {s.largestVariance.accountName}
                </>
              }
              figure={<CurrencyText amount={rowGap(s.largestVariance)} />}
              action={t('payTreasury.recon.investigate')}
              onClick={() => onOpenRow(s.largestVariance!)}
            />
          ) : null}

          {s.oldestUnreconciled ? (
            <ActionRow
              tone="warning"
              icon={FileQuestion}
              title={t('payTreasury.recon.health.oldestMissing')}
              body={
                <>
                  {formatDate(s.oldestUnreconciled.date)} ·{' '}
                  {t('payTreasury.recon.daysAgo', { count: ageInDays(s.oldestUnreconciled.date) })}
                </>
              }
              figure={
                <span title={t('payTreasury.recon.health.unverifiedTitle')}>
                  <CurrencyText amount={s.unverifiedCredit} />
                </span>
              }
              action={canManage ? t('payTreasury.recon.enter') : t('payTreasury.recon.open')}
              actionIcon={canManage ? PenLine : undefined}
              onClick={() => onOpenRow(s.oldestUnreconciled!)}
            />
          ) : null}

          {!s.largestVariance && !s.oldestUnreconciled ? (
            <p className="rounded-md bg-success-soft/60 px-3 py-2 text-xs text-success">
              {s.rows === 0 ? t('payTreasury.recon.health.nothing') : t('payTreasury.recon.health.allClearLong')}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function FlowBlock({
  icon: Icon,
  label,
  system,
  statement,
  variance,
}: {
  icon: typeof ArrowDownLeft;
  label: string;
  system: number;
  statement: number;
  variance: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border/70 bg-card/60 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      <dl className="mt-1.5 grid grid-cols-3 gap-2 text-sm">
        <div className="min-w-0">
          <dt className="text-2xs text-muted-foreground">{t('payTreasury.recon.system')}</dt>
          <dd className="truncate font-semibold tabular-nums">
            <CurrencyText amount={system} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-2xs text-muted-foreground">{t('payTreasury.recon.statementShort')}</dt>
          <dd className="truncate font-semibold tabular-nums">
            <CurrencyText amount={statement} />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-2xs text-muted-foreground">{t('payTreasury.recon.variance')}</dt>
          <dd className="truncate tabular-nums">
            <SignedAmount value={variance} />
          </dd>
        </div>
      </dl>
    </div>
  );
}

function ActionRow({
  tone,
  icon: Icon,
  title,
  body,
  figure,
  action,
  actionIcon: ActionIcon,
  onClick,
}: {
  tone: 'danger' | 'warning';
  icon: typeof Scale;
  title: string;
  body: React.ReactNode;
  figure: React.ReactNode;
  action: string;
  actionIcon?: typeof Scale;
  onClick: () => void;
}) {
  return (
    <div className={cn('rounded-md border px-3 py-2', tone === 'danger' ? 'border-destructive/25 bg-destructive-soft/40' : 'border-warning/30 bg-warning-soft/40')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cn('flex items-center gap-1 text-2xs font-semibold', TONE[tone].text)}>
            <Icon className="h-3 w-3" aria-hidden="true" />
            {title}
          </p>
          <p className="mt-0.5 truncate text-xs">{body}</p>
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{figure}</span>
      </div>
      <Button variant="secondary" size="sm" className="mt-1.5 h-7 w-full text-xs" onClick={onClick}>
        {ActionIcon ? <ActionIcon className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> : null}
        {action}
      </Button>
    </div>
  );
}
