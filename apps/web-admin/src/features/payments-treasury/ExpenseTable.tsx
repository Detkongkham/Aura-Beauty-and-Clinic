import type { ExpenseCategoryView, ExpenseView } from '@abcp/shared-types';
import type { ColumnDef } from '@tanstack/react-table';
import { Banknote, Check, Plus, ReceiptText, Send } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { CurrencyText, DataTable, Pagination } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Button } from '@/components/ui/button';
import { SectionCard } from '@/features/payroll/payroll.parts';
import { formatDate } from '@/lib/format';

import { CategoryGlyph, DueChip, ExpenseMarkers, ExpenseStatusPill, PoMatchChip, WaitingChip } from './expense.parts';
import { categoryColor, categoryName, isForeign, weekdayShort } from './expenses.lib';

interface Props {
  rows: ExpenseView[];
  total: number;
  loading: boolean;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
  categories: ExpenseCategoryView[];
  lang: 'lo' | 'en';
  showBranch: boolean;
  currentUserId: string | undefined;
  isSuper: boolean;
  canManage: boolean;
  canApprove: boolean;
  busy: boolean;
  onOpen: (e: ExpenseView) => void;
  onNew: () => void;
  onSubmit: (ids: string[], clear?: () => void) => void;
  onApprove: (ids: string[], clear?: () => void) => void;
  onPay: (ids: string[], clear?: () => void) => void;
}

/**
 * List view — the working surface for processing expenses.
 *
 * Reading order per row: *when* → *what* (category glyph, title, supplier, receipts) → *where / who*
 * → *where it is in the workflow and for how long* → *how much*. The next workflow action for each
 * row is a one-click icon button, and selection turns the same actions into a bulk bar, because an
 * approver's day is "approve these twelve", not twelve round trips through the drawer.
 */
export function ExpenseTable(p: Props) {
  const { t } = useTranslation();
  const pageTotal = p.rows.reduce((s, e) => s + (e.status === 'VOIDED' ? 0 : e.amountBase), 0);

  const columns = useMemo<ColumnDef<ExpenseView, unknown>[]>(
    () => [
      {
        header: t('payTreasury.exp.date'),
        accessorKey: 'expenseDate',
        cell: ({ row: { original: e } }) => (
          <div className="whitespace-nowrap leading-tight">
            <div className="text-sm tabular-nums">{formatDate(e.expenseDate)}</div>
            <div className="text-2xs text-muted-foreground">{weekdayShort(e.expenseDate, p.lang)}</div>
          </div>
        ),
      },
      {
        header: t('payTreasury.exp.expense'),
        id: 'title',
        cell: ({ row: { original: e } }) => (
          <div className="flex min-w-0 max-w-[420px] items-center gap-2.5">
            <CategoryGlyph code={e.category.code} color={categoryColor(e.category.id, p.categories)} size="sm" />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5 text-xs">
                <span className="truncate text-sm font-medium">{e.title}</span>
                <ExpenseMarkers expense={e} />
                {e.purchaseOrder ? <PoMatchChip match={e.poMatch} /> : null}
              </div>
              <div className="truncate text-2xs text-muted-foreground">
                {categoryName(e.category, p.lang)}
                {e.supplier ? ` · ${e.supplier.name}` : ''}
                {e.purchaseOrder ? ` · ${e.purchaseOrder.poNumber}` : ''}
                {!e.supplier && e.notes ? ` · ${e.notes}` : ''}
              </div>
            </div>
          </div>
        ),
      },
      ...(p.showBranch
        ? [{ header: t('payTreasury.col.branch'), accessorKey: 'branchName', cell: ({ getValue }) => <span className="whitespace-nowrap text-sm">{getValue() as string}</span> } as ColumnDef<ExpenseView, unknown>]
        : []),
      {
        header: t('payTreasury.exp.createdBy'),
        id: 'by',
        cell: ({ row: { original: e } }) => (
          <div className="flex min-w-0 items-center gap-1.5">
            <PersonAvatar name={e.createdBy.name} size={22} />
            <span className="truncate text-sm">{e.createdBy.id === p.currentUserId ? t('payTreasury.exp.you') : e.createdBy.name}</span>
          </div>
        ),
      },
      {
        header: t('payTreasury.col.status'),
        accessorKey: 'status',
        cell: ({ row: { original: e } }) => (
          <div className="flex flex-col items-start gap-0.5">
            <ExpenseStatusPill status={e.status} />
            <WaitingChip expense={e} />
            <DueChip expense={e} />
          </div>
        ),
      },
      {
        header: t('payTreasury.exp.amount'),
        accessorKey: 'amount',
        meta: { align: 'right' },
        cell: ({ row: { original: e } }) => (
          <div className="flex flex-col items-end">
            <CurrencyText
              amount={e.amount}
              currency={e.currency as 'LAK'}
              className={`text-sm font-semibold ${e.status === 'VOIDED' ? 'text-muted-foreground line-through' : ''}`}
            />
            {isForeign(e.currency) ? (
              <span className="text-2xs text-muted-foreground">
                ≈ <CurrencyText amount={e.amountBase} /> · {e.currency}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        header: '',
        id: 'next',
        cell: ({ row: { original: e } }) => {
          const own = e.createdBy.id === p.currentUserId && !p.isSuper;
          const overLimit = e.needsOwnerApproval && !p.isSuper;
          if (p.canManage && (e.status === 'DRAFT' || e.status === 'REJECTED')) {
            return (
              <RowAction icon={Send} label={t('payTreasury.exp.submit')} disabled={p.busy} onClick={() => p.onSubmit([e.id])} tone="neutral" />
            );
          }
          if (p.canApprove && e.status === 'SUBMITTED') {
            return (
              <RowAction
                icon={Check}
                label={own ? t('payTreasury.exp.ownClaim') : overLimit ? t('payTreasury.exp.overLimitTitle') : t('payTreasury.exp.approve')}
                disabled={p.busy || own || overLimit}
                onClick={() => p.onApprove([e.id])}
                tone="warning"
              />
            );
          }
          if (p.canApprove && e.status === 'APPROVED') {
            return <RowAction icon={Banknote} label={t('payTreasury.exp.markPaid')} disabled={p.busy} onClick={() => p.onPay([e.id])} tone="info" />;
          }
          return null;
        },
      },
    ],
    // `p` fields listed individually so the column defs don't rebuild on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, p.lang, p.categories, p.showBranch, p.currentUserId, p.isSuper, p.canManage, p.canApprove, p.busy, p.onSubmit, p.onApprove, p.onPay],
  );

  const selectedOf = (ids: string[]) => p.rows.filter((e) => ids.includes(e.id));

  return (
    <SectionCard
      icon={ReceiptText}
      title={t('payTreasury.exp.tableTitle')}
      meta={t('payTreasury.exp.matching', { count: p.total })}
      bodyClassName="p-2 sm:p-3"
      action={
        p.rows.length > 0 ? (
          <span className="text-2xs text-muted-foreground">
            {t('payTreasury.exp.pageTotal')} <CurrencyText amount={pageTotal} className="font-semibold text-foreground" />
          </span>
        ) : null
      }
    >
      <DataTable
        columns={columns}
        data={p.rows}
        loading={p.loading}
        getRowId={(r) => r.id}
        onRowClick={p.onOpen}
        enableSelection={p.canManage || p.canApprove}
        renderBulkActions={(ids, clear) => {
          const sel = selectedOf(ids);
          const sum = sel.reduce((s, e) => s + e.amountBase, 0);
          const drafts = sel.filter((e) => e.status === 'DRAFT' || e.status === 'REJECTED').length;
          const submitted = sel.filter((e) => e.status === 'SUBMITTED').length;
          const approved = sel.filter((e) => e.status === 'APPROVED').length;
          return (
            <>
              <span className="hidden text-2xs text-muted-foreground sm:inline">
                Σ <CurrencyText amount={sum} className="font-semibold text-foreground" />
              </span>
              {p.canManage && drafts > 0 ? (
                <Button size="sm" variant="secondary" disabled={p.busy} onClick={() => p.onSubmit(ids, clear)}>
                  <Send className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  {t('payTreasury.exp.bulkSubmit', { count: drafts })}
                </Button>
              ) : null}
              {p.canApprove && submitted > 0 ? (
                <Button size="sm" disabled={p.busy} onClick={() => p.onApprove(ids, clear)}>
                  <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  {t('payTreasury.exp.bulkApprove', { count: submitted })}
                </Button>
              ) : null}
              {p.canApprove && approved > 0 ? (
                <Button size="sm" variant="secondary" disabled={p.busy} onClick={() => p.onPay(ids, clear)}>
                  <Banknote className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  {t('payTreasury.exp.bulkPay', { count: approved })}
                </Button>
              ) : null}
            </>
          );
        }}
        emptyTitle={t('payTreasury.exp.empty')}
        emptyDescription={t('payTreasury.exp.emptyHint')}
        emptyAction={
          p.canManage ? (
            <Button size="sm" onClick={p.onNew}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('payTreasury.exp.new')}
            </Button>
          ) : undefined
        }
        compact
      />
      <div className="mt-2 border-t border-border px-2 pt-2.5">
        <Pagination page={p.page} pageSize={p.pageSize} total={p.total} onPageChange={p.onPage} onPageSizeChange={p.onPageSize} />
      </div>
    </SectionCard>
  );
}

const ROW_TONE = {
  neutral: 'border-border bg-card text-foreground hover:bg-muted',
  warning: 'border-warning/30 bg-warning-soft text-warning hover:bg-warning/15',
  info: 'border-info/30 bg-info-soft text-info hover:bg-info/15',
} as const;

function RowAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: typeof Send;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone: keyof typeof ROW_TONE;
}) {
  return (
    <div className="flex justify-end">
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        title={label}
        aria-label={label}
        className={`h-7 gap-1 border px-2 text-xs font-semibold ${ROW_TONE[tone]}`}
        onClick={(ev) => {
          ev.stopPropagation();
          onClick();
        }}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden 2xl:inline">{label}</span>
      </Button>
    </div>
  );
}
