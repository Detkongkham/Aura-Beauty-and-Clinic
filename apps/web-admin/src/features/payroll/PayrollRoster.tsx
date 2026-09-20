import type { PayrollReport, PayrollRow } from '@abcp/shared-types';
import type { ColumnDef } from '@tanstack/react-table';
import { Banknote, CheckCircle2, Gift, Star, Target, TriangleAlert, Users } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { CurrencyText, DataTable, Pagination } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { attainmentTone, formatDelta, paceRatio, TONE } from './payroll.lib';
import { AttainmentMeter, PayoutStatePill, RankBadge, SectionCard } from './payroll.parts';

interface Props {
  rows: PayrollRow[];
  pageRows: PayrollRow[];
  report: PayrollReport | undefined;
  loading: boolean;
  canManage: boolean;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
  onOpen: (row: PayrollRow) => void;
  onSetTarget: (row: PayrollRow) => void;
  onPayCommission: (row: PayrollRow) => void;
  onPayBonus: (row: PayrollRow) => void;
  onBulkPay: (ids: string[], clear: () => void) => void;
  onBulkBonus: (ids: string[], clear: () => void) => void;
  busy: boolean;
}

/**
 * Roster view — the full month as a table.
 *
 * Column order follows the reading order of a payroll question: *who* →
 * *what they produced* → *against what they promised* → *what we owe them*.
 * Every money column is right-aligned and `tabular-nums`; every state is a
 * pill with a dot, so nothing is carried by colour alone.
 *
 * Selection is on: settling ten people one row at a time was the single
 * biggest complaint the old page invited (UX guidance: bulk actions).
 */
export function PayrollRoster({
  rows,
  pageRows,
  report,
  loading,
  canManage,
  page,
  pageSize,
  onPage,
  onPageSize,
  onOpen,
  onSetTarget,
  onPayCommission,
  onPayBonus,
  onBulkPay,
  onBulkBonus,
  busy,
}: Props) {
  const { t } = useTranslation();
  const daysElapsed = report?.daysElapsed ?? 0;
  const daysInMonth = report?.daysInMonth ?? 0;
  const isCurrentMonth = report?.isCurrentMonth ?? false;
  const maxRevenue = rows.reduce((m, r) => Math.max(m, r.grossRevenue), 0);

  const columns = useMemo<ColumnDef<PayrollRow, unknown>[]>(
    () => [
      {
        header: '#',
        accessorKey: 'rank',
        cell: ({ getValue }) => <RankBadge rank={getValue() as number} />,
      },
      {
        header: t('payroll.col.staff'),
        accessorKey: 'staffName',
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <PersonAvatar name={r.staffName} size={30} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{r.staffName}</span>
                  {!r.isActive ? (
                    <Badge variant="neutral" className="px-1.5 py-0 text-2xs">
                      {t('payroll.flag.inactive')}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
                  <span className="truncate">{r.branchName}</span>
                  {r.totalReviews > 0 ? (
                    <span
                      className="inline-flex shrink-0 items-center gap-0.5"
                      title={t('payroll.ratingTitle', { count: r.totalReviews })}
                    >
                      <Star className="h-2.5 w-2.5 fill-current text-accent" aria-hidden="true" />
                      <span className="tabular-nums">{r.rating.toFixed(1)}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        header: t('payroll.col.jobs'),
        accessorKey: 'completedJobs',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="text-right">
              <div className="text-sm tabular-nums">{r.completedJobs}</div>
              {r.attendance.present > 0 || r.attendance.absent > 0 ? (
                <div
                  className="text-2xs text-muted-foreground"
                  title={t('payroll.attendanceTitle', {
                    present: r.attendance.present,
                    late: r.attendance.late,
                    absent: r.attendance.absent,
                  })}
                >
                  {t('payroll.daysWorked', { count: r.attendance.present })}
                  {r.attendance.late > 0 ? ` · ${t('payroll.lateShort', { count: r.attendance.late })}` : ''}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        header: t('payroll.col.gross'),
        accessorKey: 'grossRevenue',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const r = row.original;
          const share = maxRevenue > 0 ? r.grossRevenue / maxRevenue : 0;
          return (
            <div className="flex flex-col items-end gap-1">
              <span className="flex items-baseline gap-1.5">
                <CurrencyText amount={r.grossRevenue} className="text-sm font-medium" />
                <span
                  className={cn(
                    'text-2xs font-semibold tabular-nums',
                    r.revenueDeltaPct == null
                      ? 'text-muted-foreground'
                      : r.revenueDeltaPct >= 0
                        ? 'text-success'
                        : 'text-destructive',
                  )}
                  title={t('payroll.vsPrevMonth')}
                >
                  {formatDelta(r.revenueDeltaPct)}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-2xs text-muted-foreground">
                  {t('payroll.avgTicketShort')} <CurrencyText amount={r.avgTicket} />
                </span>
                <span className="block h-1 w-14 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
                    style={{ width: `${Math.round(share * 100)}%` }}
                  />
                </span>
              </span>
            </div>
          );
        },
      },
      {
        header: t('payroll.col.target'),
        id: 'target',
        cell: ({ row }) => {
          const r = row.original;
          if (r.targetRevenue <= 0) {
            return canManage ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                onClick={(e) => {
                  e.stopPropagation();
                  onSetTarget(r);
                }}
              >
                <Target className="h-3 w-3" aria-hidden="true" />
                {t('payroll.setTarget')}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">{t('payroll.noTarget')}</span>
            );
          }
          const tone = attainmentTone(r.attainmentPct, true);
          const pace = isCurrentMonth ? paceRatio(r.attainmentPct, daysElapsed, daysInMonth) : null;
          return (
            <button
              type="button"
              className="w-32 rounded-sm px-1 py-1 text-left transition-colors hover:bg-muted disabled:cursor-default"
              disabled={!canManage}
              onClick={(e) => {
                e.stopPropagation();
                onSetTarget(r);
              }}
            >
              <span className="flex items-center justify-between gap-1.5">
                <CurrencyText amount={r.targetRevenue} className="text-xs text-muted-foreground" />
                <span className={cn('text-xs font-semibold tabular-nums', TONE[tone].text)}>
                  {r.attainmentPct}%
                </span>
              </span>
              <span className="mt-1 block">
                <AttainmentMeter
                  pct={r.attainmentPct}
                  tone={tone}
                  paceMarkPct={
                    isCurrentMonth && daysInMonth > 0 ? (daysElapsed / daysInMonth) * 100 : null
                  }
                  paceLabel={t('payroll.paceMark')}
                />
              </span>
              {pace != null ? (
                <span
                  className={cn(
                    'mt-0.5 block text-2xs',
                    pace >= 1 ? 'text-success' : 'text-muted-foreground',
                  )}
                >
                  {pace >= 1 ? t('payroll.onPace') : t('payroll.behindPace')}
                </span>
              ) : null}
            </button>
          );
        },
      },
      {
        header: t('payroll.col.commission'),
        id: 'commission',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="text-right">
              <CurrencyText amount={r.commissionTotal} className="text-sm" />
              <div className="text-2xs text-muted-foreground">
                {t('payroll.ratePct', { rate: Math.round(r.commissionRate * 100) })} ·{' '}
                {t('payroll.linesCount', { count: r.commissionLines })}
              </div>
              {r.commissionUnpaid > 0 ? (
                <div className="mt-0.5 inline-flex items-center gap-1 text-2xs font-medium text-warning">
                  <TriangleAlert className="h-2.5 w-2.5" aria-hidden="true" />
                  <CurrencyText amount={r.commissionUnpaid} />
                </div>
              ) : r.commissionTotal > 0 ? (
                <div className="mt-0.5 inline-flex items-center gap-1 text-2xs text-success">
                  <CheckCircle2 className="h-2.5 w-2.5" aria-hidden="true" />
                  {t('payroll.allPaid')}
                </div>
              ) : null}
            </div>
          );
        },
      },
      {
        header: t('payroll.col.bonus'),
        id: 'bonus',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const r = row.original;
          if (r.bonusAmount <= 0) {
            return <span className="block text-right text-xs text-muted-foreground">–</span>;
          }
          return (
            <div className="flex flex-col items-end gap-0.5">
              <CurrencyText amount={r.bonusAmount} className="text-sm" />
              <Badge variant={r.bonusPaid ? 'success' : 'warning'} className="px-1.5 py-0 text-2xs">
                {r.bonusPaid ? t('payroll.paid') : t('payroll.due')}
              </Badge>
            </div>
          );
        },
      },
      {
        header: t('payroll.col.payable'),
        accessorKey: 'payable',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-col items-end gap-0.5">
              <CurrencyText amount={r.payable} className="text-sm font-semibold" />
              {r.outstanding > 0 ? (
                <span className="text-2xs text-warning">
                  {t('payroll.outstandingShort')} <CurrencyText amount={r.outstanding} />
                </span>
              ) : null}
              <PayoutStatePill state={r.payoutState} />
            </div>
          );
        },
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) => {
          const r = row.original;
          if (!canManage) return null;
          const hasAction = r.commissionUnpaid > 0 || (r.bonusAmount > 0 && !r.bonusPaid);
          if (!hasAction) return null;
          return (
            <div className="flex justify-end gap-1">
              {r.commissionUnpaid > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  className="h-7 gap-1 border border-warning/30 bg-warning-soft px-2 text-xs font-semibold text-warning hover:bg-warning/15 hover:text-warning"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPayCommission(r);
                  }}
                >
                  <Banknote className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden xl:inline">{t('payroll.payCommission')}</span>
                </Button>
              ) : null}
              {r.bonusAmount > 0 && !r.bonusPaid ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  className="h-7 gap-1 border border-info/30 bg-info-soft px-2 text-xs font-semibold text-info hover:bg-info/15 hover:text-info"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPayBonus(r);
                  }}
                >
                  <Gift className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden xl:inline">{t('payroll.markBonusPaid')}</span>
                </Button>
              ) : null}
            </div>
          );
        },
      },
    ],
    [
      t,
      canManage,
      busy,
      maxRevenue,
      isCurrentMonth,
      daysElapsed,
      daysInMonth,
      onSetTarget,
      onPayCommission,
      onPayBonus,
    ],
  );

  return (
    <SectionCard
      icon={Users}
      title={t('payroll.rosterTitle')}
      meta={t('payroll.showing', { shown: pageRows.length, total: rows.length })}
      bodyClassName="p-2 sm:p-3"
      action={
        report ? (
          <span className="text-2xs text-muted-foreground">
            {t('payroll.bonusRateNote', { rate: Math.round(report.bonusRate * 100) })}
          </span>
        ) : null
      }
    >
      <DataTable
        columns={columns}
        data={pageRows}
        loading={loading}
        getRowId={(r) => r.staffProfileId}
        onRowClick={onOpen}
        enableSelection={canManage}
        renderBulkActions={(ids, clear) => (
          <>
            <span className="hidden text-2xs text-muted-foreground sm:inline">
              <CurrencyText
                amount={rows
                  .filter((r) => ids.includes(r.staffProfileId))
                  .reduce((s, r) => s + r.outstanding, 0)}
              />{' '}
              {t('payroll.outstandingShort')}
            </span>
            <Button size="sm" disabled={busy} onClick={() => onBulkPay(ids, clear)}>
              <Banknote className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {t('payroll.payCommission')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => onBulkBonus(ids, clear)}
            >
              <Gift className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {t('payroll.markBonusPaid')}
            </Button>
          </>
        )}
        emptyTitle={t('payroll.empty')}
        emptyDescription={t('payroll.emptyHint')}
        compact
      />

      <div className="mt-2 border-t border-border px-2 pt-2.5">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={rows.length}
          onPageChange={onPage}
          onPageSizeChange={onPageSize}
        />
      </div>
    </SectionCard>
  );
}
