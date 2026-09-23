import type { ColumnDef } from '@tanstack/react-table';
import type { ReconciliationRow } from '@abcp/shared-types';
import { Lock, MessageSquareText, PenLine, Rows3, Unlink } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { CurrencyText, DataTable } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/features/payroll/payroll.parts';
import { formatDate, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

import { ageInDays, hasBalanceBreak, rowKey, weekdayShort } from './reconciliation.lib';
import { InOutCell, ReconStatusPill, SignedAmount } from './recon.parts';
import { maskAccount } from './treasury.lib';

interface Props {
  rows: ReconciliationRow[];
  loading: boolean;
  isError: boolean;
  canManage: boolean;
  onOpen: (r: ReconciliationRow) => void;
  filtered: boolean;
}

/** Oldest-first attention threshold: an unchecked day older than this gets an age chip. */
const STALE_DAYS = 3;

export function ReconLedger({ rows, loading, isError, canManage, onOpen, filtered }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith('en') ? 'en' : 'lo';

  const columns = useMemo<ColumnDef<ReconciliationRow, unknown>[]>(
    () => [
      {
        header: t('payTreasury.recon.date'),
        accessorKey: 'date',
        cell: ({ row: { original: r } }) => {
          const age = ageInDays(r.date);
          return (
            <div className="min-w-[92px]">
              <div className="font-medium tabular-nums">{formatDate(r.date)}</div>
              <div className="flex items-center gap-1 text-2xs text-muted-foreground">
                {weekdayShort(r.date, lang)}
                {r.status === 'UNRECONCILED' && age > STALE_DAYS ? (
                  <span className="rounded bg-warning-soft px-1 font-semibold text-warning" title={t('payTreasury.recon.daysAgo', { count: age })}>
                    {t('payTreasury.recon.ageShort', { count: age })}
                  </span>
                ) : null}
              </div>
            </div>
          );
        },
      },
      {
        header: t('payTreasury.recon.account'),
        id: 'account',
        cell: ({ row: { original: r } }) => (
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 min-w-[38px] shrink-0 items-center justify-center rounded-md bg-primary/10 px-1 text-[10px] font-bold text-primary">
              {r.bankCode}
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium">{r.accountName}</div>
              <div className="truncate text-2xs text-muted-foreground">
                <span className="font-mono">{maskAccount(r.accountNumber)}</span> · {r.branchName}
              </div>
            </div>
          </div>
        ),
      },
      {
        header: t('payTreasury.recon.system'),
        id: 'system',
        meta: { align: 'right' },
        cell: ({ row: { original: r } }) => (
          <div title={`${t('payTreasury.recon.txCount', { count: r.systemCreditCount })} / ${t('payTreasury.recon.txCount', { count: r.systemDebitCount })}`}>
            <InOutCell credit={r.systemCredit} debit={r.systemDebit} currency={r.currency} />
            {r.systemFee > 0 ? (
              <div className="mt-0.5 whitespace-nowrap text-right text-2xs text-info" title={t('payTreasury.recon.health.feeTitle')}>
                {t('payTreasury.recon.netOf')} <CurrencyText amount={r.expectedCredit} currency={r.currency as 'LAK'} />
              </div>
            ) : null}
          </div>
        ),
      },
      {
        header: t('payTreasury.recon.statement'),
        id: 'statement',
        meta: { align: 'right' },
        cell: ({ row: { original: r } }) => <InOutCell credit={r.statementCredit} debit={r.statementDebit} currency={r.currency} />,
      },
      {
        header: t('payTreasury.recon.variance'),
        id: 'variance',
        meta: { align: 'right' },
        cell: ({ row: { original: r } }) => (
          <InOutCell
            credit={r.creditVariance}
            debit={r.debitVariance}
            currency={r.currency}
            render={(v) => <SignedAmount value={v} currency={r.currency} />}
          />
        ),
      },
      {
        header: t('payTreasury.col.status'),
        accessorKey: 'status',
        cell: ({ row: { original: r } }) => (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <ReconStatusPill status={r.status} />
              {r.locked ? (
                <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label={t('payTreasury.recon.locked')} role="img">
                  <title>{t('payTreasury.recon.locked')}</title>
                </Lock>
              ) : null}
              {r.note ? (
                <MessageSquareText className="h-3.5 w-3.5 text-muted-foreground" aria-label={r.note} role="img">
                  <title>{r.note}</title>
                </MessageSquareText>
              ) : null}
              {hasBalanceBreak(r) ? (
                <Unlink className="h-3.5 w-3.5 text-destructive" aria-label={t('payTreasury.recon.balanceBreak')} role="img">
                  <title>{t('payTreasury.recon.balanceBreak')}</title>
                </Unlink>
              ) : null}
            </div>
            {r.resolution ? (
              <div className="truncate text-2xs text-info">{t(`payTreasury.recon.resolution.${r.resolution}`)}</div>
            ) : null}
            {r.lineCount > 0 ? (
              <div className={cn('whitespace-nowrap text-2xs', r.unmatchedLines > 0 ? 'text-warning' : 'text-muted-foreground')}>
                {r.unmatchedLines > 0
                  ? t('payTreasury.recon.linesUnmatched', { count: r.lineCount, unmatched: r.unmatchedLines })
                  : t('payTreasury.recon.linesAllMatched', { count: r.lineCount })}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        header: t('payTreasury.recon.checkedBy'),
        id: 'checkedBy',
        cell: ({ row: { original: r } }) =>
          r.enteredByName ? (
            <div className="min-w-0 text-xs">
              <div className="truncate">{r.enteredByName}</div>
              {r.enteredAt ? <div className="whitespace-nowrap text-2xs text-muted-foreground">{formatRelative(r.enteredAt, lang)}</div> : null}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row: { original: r } }) => (
          <div className="flex justify-end">
            <Button
              variant={r.status === 'UNRECONCILED' && canManage ? 'primary' : 'secondary'}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(r);
              }}
            >
              {r.status === 'UNRECONCILED' && canManage ? (
                <>
                  <PenLine className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden xl:inline">{t('payTreasury.recon.enter')}</span>
                  <span className="sr-only xl:hidden">{t('payTreasury.recon.enter')}</span>
                </>
              ) : (
                t('payTreasury.recon.open')
              )}
            </Button>
          </div>
        ),
      },
    ],
    [t, lang, canManage, onOpen],
  );

  const foot = useMemo(
    () =>
      rows.reduce(
        (a, r) => {
          a.sc += r.systemCredit;
          a.sd += r.systemDebit;
          a.stc += r.statementCredit ?? 0;
          a.std += r.statementDebit ?? 0;
          a.vc += r.creditVariance ?? 0;
          a.vd += r.debitVariance ?? 0;
          return a;
        },
        { sc: 0, sd: 0, stc: 0, std: 0, vc: 0, vd: 0 },
      ),
    [rows],
  );

  return (
    <SectionCard
      icon={Rows3}
      title={t('payTreasury.recon.tableTitle')}
      meta={t('payTreasury.showing', { count: rows.length })}
      bodyClassName="p-2 sm:p-3"
    >
      {isError ? (
        <p className="p-6 text-center text-sm text-destructive">{t('payTreasury.loadError')}</p>
      ) : (
        <>
          <DataTable
            compact
            columns={columns}
            data={rows}
            loading={loading}
            getRowId={rowKey}
            onRowClick={onOpen}
            emptyTitle={filtered ? t('payTreasury.recon.emptyFiltered') : t('payTreasury.recon.empty')}
            emptyDescription={filtered ? t('payTreasury.recon.emptyFilteredHint') : t('payTreasury.recon.emptyHint')}
          />
          {rows.length > 1 ? (
            <dl
              className={cn(
                'mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg bg-muted/50 px-3 py-2 text-xs sm:grid-cols-3',
              )}
              aria-label={t('payTreasury.recon.footTitle')}
            >
              <FootCell label={t('payTreasury.recon.footSystem')} a={<CurrencyText amount={foot.sc} />} b={<CurrencyText amount={foot.sd} />} />
              <FootCell label={t('payTreasury.recon.footStatement')} a={<CurrencyText amount={foot.stc} />} b={<CurrencyText amount={foot.std} />} />
              <FootCell label={t('payTreasury.recon.footVariance')} a={<SignedAmount value={foot.vc} />} b={<SignedAmount value={foot.vd} />} />
            </dl>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

function FootCell({ label, a, b }: { label: string; a: React.ReactNode; b: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0">
      <dt className="text-2xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap gap-x-3 tabular-nums">
        <span>
          <span className="text-2xs text-muted-foreground">{t('payTreasury.recon.in')} </span>
          <span className="font-semibold">{a}</span>
        </span>
        <span>
          <span className="text-2xs text-muted-foreground">{t('payTreasury.recon.out')} </span>
          <span className="font-semibold">{b}</span>
        </span>
      </dd>
    </div>
  );
}
