import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ScrollText, Store } from 'lucide-react';
import type { StockMovementTypeValue, StockMovementView } from '@abcp/shared-types';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { DateField } from '@/components/shared/DateField';
import { DataTable, DateTimeText, FilterBar, Pagination, StatusPill } from '@/components/shared';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useBranches } from '@/features/branches/branches.api';

import { InventoryStatCard } from './InventoryStatCard';
import { InventoryTabs } from './InventoryTabs';
import { useStockMovements, useStockMovementStats } from './inventory.api';
import { MovementDetailDialog } from './MovementDetailDialog';
import {
  MOVEMENT_TYPE_ICON,
  MOVEMENT_TYPE_TONE,
  MOVEMENT_TYPE_VARIANT,
  MOVEMENT_TYPES,
  signedQty,
} from './movementTypes';

export function StockLedgerPage() {
  const { t } = useTranslation();
  const { data: branches } = useBranches();

  const [branchId, setBranchId] = useState('');
  const [type, setType] = useState<StockMovementTypeValue | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detail, setDetail] = useState<StockMovementView | null>(null);

  const { data, isLoading } = useStockMovements({
    branchId: branchId || undefined,
    type: type || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    pageSize,
  });
  const { data: stats, isLoading: statsLoading } = useStockMovementStats({
    branchId: branchId || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const hasActiveFilters = Boolean(branchId) || Boolean(type) || Boolean(from) || Boolean(to);

  function toggleType(v: StockMovementTypeValue | '') {
    setType((current) => (current === v ? '' : v));
    setPage(1);
  }

  const columns = useMemo<ColumnDef<StockMovementView, unknown>[]>(
    () => [
      {
        header: t('inventory.ledger.when'),
        accessorKey: 'createdAt',
        cell: ({ getValue }) => <DateTimeText value={getValue() as string} />,
      },
      {
        header: t('inventory.col.product'),
        accessorKey: 'productName',
        cell: ({ row }) => <span className="font-medium">{row.original.productName}</span>,
      },
      {
        header: t('inventory.col.branch'),
        accessorKey: 'branchName',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Store className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {row.original.branchName}
          </span>
        ),
      },
      {
        header: t('inventory.ledger.type'),
        accessorKey: 'type',
        cell: ({ getValue }) => {
          const v = getValue() as StockMovementTypeValue;
          const Icon = MOVEMENT_TYPE_ICON[v];
          return (
            <span className="inline-flex items-center gap-2">
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <StatusPill status={v} variant={MOVEMENT_TYPE_VARIANT[v]} label={t(`inventory.movement.${v}`)} />
            </span>
          );
        },
      },
      {
        header: t('inventory.ledger.qty'),
        accessorKey: 'qty',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const qty = signedQty(row.original);
          return (
            <span className={cn('tabular-nums font-medium', qty < 0 ? 'text-warning' : 'text-success')}>
              {qty < 0 ? '−' : '+'}
              {Math.abs(qty).toLocaleString()}
            </span>
          );
        },
      },
      {
        header: t('inventory.ledger.balance'),
        accessorKey: 'balanceAfter',
        meta: { align: 'right' },
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return (
            <span className={cn('tabular-nums', v < 0 && 'font-medium text-destructive')}>
              {v.toLocaleString()}
            </span>
          );
        },
      },
      { header: t('inventory.ledger.note'), accessorKey: 'notes', cell: ({ getValue }) => (getValue() as string) || '—' },
      {
        header: t('inventory.ledger.by'),
        accessorKey: 'createdByUserName',
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.createdByUserName ?? t('inventory.ledger.system')}
          </span>
        ),
      },
      {
        header: '',
        id: 'actions',
        cell: () => <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />,
      },
    ],
    [t],
  );

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
            {t('nav.inventory')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('inventory.ledger.subtitle')}</p>
        </div>
        <InventoryTabs active="ledger" />
      </StickyPageHeader>

      {statsLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[62px] w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          <InventoryStatCard
            index={0}
            icon={ScrollText}
            tone="primary"
            label={t('inventory.ledger.total')}
            value={stats?.total ?? 0}
            hint={t('inventory.ledger.totalHint')}
            onClick={() => toggleType('')}
            active={type === ''}
          />
          {MOVEMENT_TYPES.map((x, i) => (
            <InventoryStatCard
              key={x}
              index={i + 1}
              icon={MOVEMENT_TYPE_ICON[x]}
              tone={MOVEMENT_TYPE_TONE[x]}
              label={t(`inventory.movement.${x}`)}
              value={stats?.byType[x] ?? 0}
              onClick={() => toggleType(x)}
              active={type === x}
            />
          ))}
        </div>
      )}

      <FilterBar
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setBranchId('');
          setType('');
          setFrom('');
          setTo('');
          setPage(1);
        }}
      >
        <Select
          className="h-9 w-[170px]"
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            setPage(1);
          }}
          options={[
            { value: '', label: t('inventory.allBranches') },
            ...(branches ?? []).map((b) => ({ value: b.id, label: b.name })),
          ]}
          aria-label={t('inventory.col.branch')}
        />
        <Select
          className="h-9 w-[190px]"
          value={type}
          onChange={(e) => {
            setType(e.target.value as StockMovementTypeValue | '');
            setPage(1);
          }}
          options={[
            { value: '', label: t('inventory.ledger.allTypes') },
            ...MOVEMENT_TYPES.map((x) => ({ value: x, label: t(`inventory.movement.${x}`) })),
          ]}
          aria-label={t('inventory.ledger.type')}
        />
        <DateField
          value={from}
          max={to || undefined}
          onChange={(v) => {
            setFrom(v);
            setPage(1);
          }}
          onClear={() => {
            setFrom('');
            setPage(1);
          }}
          clearLabel={t('inventory.ledger.clearDate')}
          aria-label={t('inventory.ledger.from')}
          placeholder={t('inventory.ledger.from')}
        />
        <DateField
          value={to}
          min={from || undefined}
          onChange={(v) => {
            setTo(v);
            setPage(1);
          }}
          onClear={() => {
            setTo('');
            setPage(1);
          }}
          clearLabel={t('inventory.ledger.clearDate')}
          aria-label={t('inventory.ledger.to')}
          placeholder={t('inventory.ledger.to')}
        />
      </FilterBar>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <ScrollText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{t('inventory.tab.ledger')}</h2>
            <span className="text-xs text-muted-foreground">
              {t('inventory.showing', { shown: data?.items.length ?? 0, total: data?.total ?? 0 })}
            </span>
          </div>
        </div>
        <div className="p-2 sm:p-3">
          <DataTable
            columns={columns}
            data={data?.items ?? []}
            loading={isLoading}
            getRowId={(r) => r.id}
            onRowClick={(r) => setDetail(r)}
            emptyTitle={t('inventory.ledger.empty')}
          />
        </div>
        <div className="border-t border-border px-4 py-3">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </div>
      </div>

      <MovementDetailDialog movement={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
