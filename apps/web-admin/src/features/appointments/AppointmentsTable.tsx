import type { AppointmentSortField, AppointmentStatus } from '@abcp/shared-types';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, CalendarClock, Check, ChevronDown, Star } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { CurrencyText } from '@/components/shared/CurrencyText';
import { DataTable } from '@/components/shared/DataTable';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { Pagination } from '@/components/shared/Pagination';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AppointmentListItem } from '@/types/models';

import { NEXT_STATUS, SORT_FIELDS, balanceOf, formatDuration, isDead } from './appointments.lib';
import { ChannelChips, FlagChips, PaymentCell, RatingStars } from './appointments.parts';

interface Props {
  rows: AppointmentListItem[];
  loading: boolean;
  now: number;
  compact: boolean;
  sort: AppointmentSortField;
  order: 'asc' | 'desc';
  onSort: (field: AppointmentSortField) => void;
  onOpen: (id: string) => void;
  onStatus: (item: AppointmentListItem, next: AppointmentStatus) => void;
  onReschedule: (item: AppointmentListItem) => void;
  onBulkStatus: (ids: string[], next: AppointmentStatus, clear: () => void) => void;
  canManage: boolean;
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}

/** Server-side sort control — the header can't own it because paging is server-side too. */
function SortBar({
  sort,
  order,
  onSort,
}: {
  sort: AppointmentSortField;
  order: 'asc' | 'desc';
  onSort: (f: AppointmentSortField) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('table.sortBy')}>
      <span className="mr-0.5 text-2xs text-muted-foreground">{t('table.sortBy')}</span>
      {SORT_FIELDS.map((f) => {
        const active = sort === f;
        return (
          <button
            key={f}
            type="button"
            onClick={() => onSort(f)}
            aria-pressed={active}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-full border px-2 text-2xs font-medium',
              'transition-colors duration-150 ease-out motion-reduce:transition-none',
              active
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {t(`appointments.sort_${f}`)}
            {active ? (
              order === 'asc' ? (
                <ArrowUp className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ArrowDown className="h-3 w-3" aria-hidden="true" />
              )
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Row-level "move to status" menu — only offers transitions the flow allows. */
function RowActions({
  item,
  onStatus,
  onReschedule,
}: {
  item: AppointmentListItem;
  onStatus: (item: AppointmentListItem, next: AppointmentStatus) => void;
  onReschedule: (item: AppointmentListItem) => void;
}) {
  const { t } = useTranslation();
  const options = NEXT_STATUS[item.status];
  const canMove = item.status !== 'COMPLETED' && item.status !== 'CANCELLED';
  if (options.length === 0 && !canMove) {
    return <span className="text-2xs text-muted-foreground">–</span>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-2xs"
          onClick={(e) => e.stopPropagation()}
          aria-label={t('appointments.changeStatus')}
        >
          {t('appointments.changeStatus')}
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {canMove ? (
          <DropdownMenuItem onSelect={() => onReschedule(item)}>
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            {t('appointments.reschedule')}
          </DropdownMenuItem>
        ) : null}
        {options.map((s) => (
          <DropdownMenuItem
            key={s}
            onSelect={() => onStatus(item, s)}
            className={cn(
              (s === 'CANCELLED' || s === 'NO_SHOW') && 'text-destructive focus:text-destructive',
            )}
          >
            <StatusPill status={s} label={t(`status.${s}`)} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The list view. Selection drives a bulk status bar; each row also carries its
 * own transition menu, because the common case is one booking, not twenty.
 *
 * Sorting and paging are both server-side, so the sort control sits above the
 * table instead of on the headers — a header that sorted only the visible page
 * would quietly lie about the rest of the result set.
 */
export function AppointmentsTable({
  rows,
  loading,
  now,
  compact,
  sort,
  order,
  onSort,
  onOpen,
  onStatus,
  onReschedule,
  onBulkStatus,
  canManage,
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
}: Props) {
  const { t } = useTranslation();

  const pageTotals = useMemo(() => {
    let price = 0;
    let deposit = 0;
    let balance = 0;
    for (const a of rows) {
      if (isDead(a.status)) continue;
      price += a.price;
      deposit += a.depositPaid;
      balance += balanceOf(a);
    }
    return { price, deposit, balance };
  }, [rows]);

  const columns = useMemo<ColumnDef<AppointmentListItem, unknown>[]>(
    () => [
      {
        accessorKey: 'startAt',
        header: t('appointments.when'),
        enableSorting: false,
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div className="leading-tight">
              <DateTimeText value={a.startAt} mode="date" className="block text-xs tabular-nums" />
              <span className="block font-semibold tabular-nums">
                <DateTimeText value={a.startAt} mode="time" />
              </span>
              <span className="block text-2xs tabular-nums text-muted-foreground">
                {formatDuration(a.durationMin)}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'customerName',
        header: t('appointments.customer'),
        enableSorting: false,
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <PersonAvatar name={a.customerName} size={compact ? 26 : 32} />
              <div className="min-w-0">
                <p className="truncate font-medium">{a.customerName}</p>
                <p className="truncate text-2xs tabular-nums text-muted-foreground">
                  {a.customerPhone} · {a.code}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'serviceName',
        header: t('appointments.service'),
        enableSorting: false,
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div className="min-w-0">
              <p className="truncate font-medium">{a.serviceName}</p>
              <p className="truncate text-2xs text-muted-foreground">
                {a.staffName}
                {a.roomName ? ` · ${a.roomName}` : ''} · {a.branchName}
              </p>
            </div>
          );
        },
      },
      {
        id: 'signals',
        header: t('appointments.signals'),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <FlagChips item={row.original} now={now} />
            <ChannelChips item={row.original} />
          </div>
        ),
      },
      {
        accessorKey: 'price',
        header: t('appointments.price'),
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div
            className={cn(
              'text-right tabular-nums',
              isDead(row.original.status) && 'text-muted-foreground line-through',
            )}
          >
            <CurrencyText amount={row.original.price} />
          </div>
        ),
      },
      {
        id: 'payment',
        header: t('appointments.payment'),
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) =>
          isDead(row.original.status) ? (
            <div className="text-right text-2xs text-muted-foreground">–</div>
          ) : (
            <PaymentCell item={row.original} />
          ),
      },
      {
        accessorKey: 'status',
        header: t('appointments.status'),
        enableSorting: false,
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div className="flex flex-col items-start gap-1">
              <StatusPill status={a.status} label={t(`status.${a.status}`)} />
              {a.rating != null ? (
                <RatingStars value={a.rating} />
              ) : a.status === 'COMPLETED' ? (
                <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
                  <Star className="h-3 w-3" aria-hidden="true" />
                  {t('appointments.flagUnrated')}
                </span>
              ) : null}
            </div>
          );
        },
      },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: '',
              enableSorting: false,
              meta: { align: 'right' as const },
              cell: ({ row }) => (
                <div className="flex justify-end">
                  <RowActions item={row.original} onStatus={onStatus} onReschedule={onReschedule} />
                </div>
              ),
            } satisfies ColumnDef<AppointmentListItem, unknown>,
          ]
        : []),
    ],
    [t, compact, now, canManage, onStatus, onReschedule],
  );

  const bulkTargets: AppointmentStatus[] = ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW', 'CANCELLED'];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold">{t('nav.appointments')}</h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            {t('appointments.showing', { shown: rows.length, total })}
          </span>
        </div>
        <SortBar sort={sort} order={order} onSort={onSort} />
      </div>

      <div className="p-2 sm:p-3">
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
          compact={compact}
          getRowId={(r) => r.id}
          onRowClick={(r) => onOpen(r.id)}
          enableSelection={canManage}
          renderBulkActions={(ids, clear) => (
            <div className="flex flex-wrap items-center gap-1.5">
              {bulkTargets.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={s === 'CANCELLED' || s === 'NO_SHOW' ? 'ghost' : 'secondary'}
                  className={cn(
                    'h-7 px-2 text-2xs',
                    (s === 'CANCELLED' || s === 'NO_SHOW') && 'text-destructive hover:text-destructive',
                  )}
                  onClick={() => onBulkStatus(ids, s, clear)}
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                  {t(`status.${s}`)}
                </Button>
              ))}
              <Button size="sm" variant="ghost" className="h-7 px-2 text-2xs" onClick={clear}>
                {t('common.cancel')}
              </Button>
            </div>
          )}
          emptyTitle={t('appointments.empty')}
          emptyDescription={t('appointments.emptyHint')}
        />
      </div>

      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-muted/20 px-4 py-2.5 text-xs">
          <span className="font-semibold text-muted-foreground">{t('appointments.pageTotal')}</span>
          <span className="tabular-nums">
            {t('appointments.price')}: <span className="font-semibold">{formatCurrency(pageTotals.price)}</span>
          </span>
          <span className="tabular-nums">
            {t('appointments.deposit')}: <span className="font-semibold">{formatCurrency(pageTotals.deposit)}</span>
          </span>
          <span className="tabular-nums">
            {t('appointments.balance')}: <span className="font-semibold">{formatCurrency(pageTotals.balance)}</span>
          </span>
        </div>
      ) : null}

      <div className="border-t border-border px-4 py-3">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={onPage}
          onPageSizeChange={onPageSize}
        />
      </div>
    </div>
  );
}
