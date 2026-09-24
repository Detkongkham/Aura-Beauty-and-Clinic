import { type ReactNode, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  CheckCircle2,
  FileText,
  type LucideIcon,
  MessageSquare,
  Minus,
  Package,
  Plus,
  Send,
  Store,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { StockTransferCreateInput, StockTransferStatusValue, StockTransferView } from '@abcp/shared-types';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { CurrencyText, DataTable, DateTimeText, FilterBar, Pagination, StatusPill } from '@/components/shared';
import type { BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { useConfirm } from '@/hooks/useConfirm';
import { NormalizedApiError } from '@/services/apiError';

import { InventoryStatCard } from './InventoryStatCard';
import { InventoryTabs } from './InventoryTabs';
import {
  useCreateStockTransfer,
  useDeleteStockTransfer,
  useProducts,
  useStockLots,
  useReceiveStockTransfer,
  useSendStockTransfer,
  useStockTransfer,
  useStockTransfers,
} from './inventory.api';

const STATUS_VARIANT: Record<StockTransferStatusValue, NonNullable<BadgeProps['variant']>> = {
  DRAFT: 'neutral',
  IN_TRANSIT: 'info',
  COMPLETED: 'success',
  CANCELLED: 'warning',
};
const STATUSES: StockTransferStatusValue[] = ['DRAFT', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'];

export function StockTransfersPage() {
  const { t } = useTranslation();
  const { hasPermission, user } = useAuth();
  const canManage = hasPermission('inventory:manage');
  const { data: branches } = useBranches();
  const confirm = useConfirm();
  const del = useDeleteStockTransfer();

  const [status, setStatus] = useState<StockTransferStatusValue | ''>('');
  const [branchId, setBranchId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading } = useStockTransfers({
    status: status || undefined,
    branchId: branchId || undefined,
    page,
    pageSize,
  });

  // No dedicated /stock-transfers/stats endpoint — these counts summarize the
  // currently loaded (filtered) page rather than every transfer on file.
  const items = data?.items ?? [];
  const draftCount = items.filter((tr) => tr.status === 'DRAFT').length;
  const inTransitCount = items.filter((tr) => tr.status === 'IN_TRANSIT').length;
  const completedCount = items.filter((tr) => tr.status === 'COMPLETED').length;

  const columns = useMemo<ColumnDef<StockTransferView, unknown>[]>(
    () => [
      {
        header: t('inventory.transfer.number'),
        accessorKey: 'transferNumber',
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.transferNumber}</span>,
      },
      {
        header: t('inventory.transfer.from'),
        id: 'route',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 text-sm">
            {row.original.fromBranchName}
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {row.original.toBranchName}
          </span>
        ),
      },
      {
        header: t('inventory.transfer.status'),
        accessorKey: 'status',
        cell: ({ getValue }) => {
          const v = getValue() as StockTransferStatusValue;
          return <StatusPill status={v} variant={STATUS_VARIANT[v]} label={t(`inventory.transfer.st.${v}`)} />;
        },
      },
      {
        header: t('inventory.transfer.items'),
        accessorKey: 'itemCount',
        meta: { align: 'right' },
        cell: ({ getValue }) => <span className="tabular-nums">{getValue() as number}</span>,
      },
      {
        header: t('inventory.transfer.value'),
        accessorKey: 'totalValue',
        meta: { align: 'right' },
        cell: ({ getValue }) => <CurrencyText amount={getValue() as number} className="font-medium" />,
      },
      {
        header: t('inventory.transfer.createdAt'),
        accessorKey: 'createdAt',
        cell: ({ getValue }) => <DateTimeText value={getValue() as string} />,
      },
    ],
    [t],
  );

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
              {t('nav.inventory')}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('inventory.transfer.subtitle')}</p>
          </div>
          {canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t('inventory.transfer.new')}
            </Button>
          ) : null}
        </div>
        <InventoryTabs active="transfers" />
      </StickyPageHeader>

      {isLoading && !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[62px] w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <InventoryStatCard
            index={0}
            icon={ArrowLeftRight}
            tone="primary"
            label={t('inventory.transfer.stat.total')}
            value={data?.total ?? '—'}
          />
          <InventoryStatCard
            index={1}
            icon={FileText}
            tone="neutral"
            label={t('inventory.transfer.st.DRAFT')}
            value={draftCount}
          />
          <InventoryStatCard
            index={2}
            icon={Send}
            tone="warning"
            label={t('inventory.transfer.st.IN_TRANSIT')}
            value={inTransitCount}
          />
          <InventoryStatCard
            index={3}
            icon={CheckCircle2}
            tone="success"
            label={t('inventory.transfer.st.COMPLETED')}
            value={completedCount}
          />
        </div>
      )}

      <FilterBar
        hasActiveFilters={Boolean(status) || Boolean(branchId)}
        onClear={() => {
          setStatus('');
          setBranchId('');
          setPage(1);
        }}
      >
        <Select
          className="h-9 w-[160px]"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as StockTransferStatusValue | '');
            setPage(1);
          }}
          options={[
            { value: '', label: t('inventory.transfer.allStatus') },
            ...STATUSES.map((x) => ({ value: x, label: t(`inventory.transfer.st.${x}`) })),
          ]}
          aria-label={t('inventory.transfer.status')}
        />
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
      </FilterBar>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <ArrowLeftRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{t('inventory.tab.transfers')}</h2>
            <span className="text-xs text-muted-foreground">
              {t('inventory.showing', { shown: data?.items.length ?? 0, total: data?.total ?? 0 })}
            </span>
          </div>
        </div>
        <div className="p-2 sm:p-3">
          <DataTable
            columns={columns}
            data={items}
            loading={isLoading}
            getRowId={(r) => r.id}
            onRowClick={(r) => setDetailId(r.id)}
            emptyTitle={t('inventory.transfer.empty')}
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

      <CreateTransferDialog
        open={creating}
        branches={(branches ?? []).map((b) => ({ id: b.id, name: b.name }))}
        defaultFromBranchId={user?.branchId ?? ''}
        onClose={() => setCreating(false)}
      />
      <TransferDetailDialog
        id={detailId}
        canManage={canManage}
        authBranchId={user?.branchId ?? null}
        onClose={() => setDetailId(null)}
        onDelete={async (tr) => {
          if (!(await confirm({ title: t('inventory.transfer.deleteConfirm') }))) return;
          del.mutate(tr.id, {
            onSuccess: () => {
              toast.success(t('common.deleted'));
              setDetailId(null);
            },
            onError: (err) =>
              toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
          });
        }}
      />
    </div>
  );
}

type DraftItem = { productId: string; quantity: string; lotId?: string };

/** C5 — ເລືອກ lot ຕົ້ນທາງຂອງສິນຄ້າ trackLot (ຕັດຈາກ lot ນີ້ຕອນສົ່ງ, ເລກ lot/ວັນໝົດອາຍຸຕິດໄປປາຍທາງ). */
function TransferLotSelect({
  productId,
  branchId,
  value,
  onChange,
}: {
  productId: string;
  branchId: string;
  value: string | undefined;
  onChange: (lotId: string) => void;
}) {
  const { t } = useTranslation();
  const { data } = useStockLots({ productId, branchId, page: 1, pageSize: 100 });
  return (
    <Select
      className="h-9 min-w-[220px]"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      aria-label={t('inventory.lot.pickLot')}
      options={[
        { value: '', label: t('inventory.lot.pickLot') },
        ...(data?.items ?? []).map((l) => ({
          value: l.id,
          label: `${l.lotNumber} · ${l.expiryDate ?? '—'} · ${l.qtyOnHand.toLocaleString()} ${l.unit}`,
        })),
      ]}
    />
  );
}

function CreateTransferDialog({
  open,
  branches,
  defaultFromBranchId,
  onClose,
}: {
  open: boolean;
  branches: Array<{ id: string; name: string }>;
  defaultFromBranchId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateStockTransfer();
  const [fromBranchId, setFromBranchId] = useState(defaultFromBranchId || branches[0]?.id || '');
  const [toBranchId, setToBranchId] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ productId: '', quantity: '1' }]);

  const { data: products } = useProducts({ branchId: fromBranchId || undefined, page: 1, pageSize: 200 });

  const cleanItems = items.filter((it) => it.productId && Number(it.quantity) > 0);
  const lineCount = cleanItems.length;
  const totalQty = cleanItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const totalValue = cleanItems.reduce((s, it) => {
    const p = products?.items.find((x) => x.id === it.productId);
    return s + (Number(it.quantity) || 0) * (p?.costPrice ?? 0);
  }, 0);
  const hasBlockingIssue = items.some((it) => {
    const p = products?.items.find((x) => x.id === it.productId);
    const q = Number(it.quantity) || 0;
    return p && q > p.stockQty;
  });

  function reset() {
    setToBranchId('');
    setNotes('');
    setItems([{ productId: '', quantity: '1' }]);
  }

  function updateItem(i: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  function submit() {
    const clean: StockTransferCreateInput['items'] = cleanItems.map((it) => ({
      productId: it.productId,
      quantity: Number(it.quantity),
      ...(it.lotId ? { lotId: it.lotId } : {}),
    }));
    if (cleanItems.some((it) => products?.items.find((p) => p.id === it.productId)?.trackLot && !it.lotId)) {
      toast.error(t('inventory.lot.transferPickLot'));
      return;
    }
    if (!fromBranchId || !toBranchId || clean.length === 0) {
      toast.error(t('inventory.transfer.incomplete'));
      return;
    }
    if (fromBranchId === toBranchId) {
      toast.error(t('inventory.transfer.sameBranch'));
      return;
    }
    create.mutate(
      { fromBranchId, toBranchId, items: clean, notes: notes || undefined },
      {
        onSuccess: () => {
          toast.success(t('inventory.transfer.created'));
          reset();
          onClose();
        },
        onError: (err) =>
          toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-start gap-4 border-b border-border bg-gradient-to-br from-primary/[0.06] to-transparent px-7 py-5 pr-14">
          <span
            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <ArrowLeftRight className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <DialogTitle className="text-xl">{t('inventory.transfer.new')}</DialogTitle>
            <DialogDescription className="text-[13px]">{t('inventory.transfer.formSubtitle')}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex max-h-[calc(100vh-9rem)] flex-col">
          <div className="flex-1 space-y-8 overflow-y-auto px-7 py-6">
            {/* Route */}
            <section className="space-y-3">
              <SectionLabel>{t('inventory.transfer.sectionRoute')}</SectionLabel>
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Store className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {t('inventory.transfer.from')}
                  </p>
                  <Combobox
                    id="tr-from"
                    className="h-10 bg-card text-[15px]"
                    value={fromBranchId}
                    onChange={(v) => {
                      setFromBranchId(v);
                      setItems([{ productId: '', quantity: '1' }]);
                      if (v === toBranchId) setToBranchId('');
                    }}
                    options={branches.map((b) => ({ value: b.id, label: b.name }))}
                    searchPlaceholder={t('inventory.transfer.searchBranch')}
                    emptyText={t('inventory.transfer.noBranchMatch')}
                  />
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="mt-5 h-10 w-10 shrink-0 rounded-full border-2 border-card bg-card shadow-sm"
                  disabled={!fromBranchId || !toBranchId}
                  aria-label={t('inventory.transfer.swap')}
                  onClick={() => {
                    setFromBranchId(toBranchId);
                    setToBranchId(fromBranchId);
                    setItems([{ productId: '', quantity: '1' }]);
                  }}
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </Button>

                <div className="min-w-0 flex-1 space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Store className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {t('inventory.transfer.to')}
                  </p>
                  <Combobox
                    id="tr-to"
                    className="h-10 bg-card text-[15px]"
                    value={toBranchId}
                    onChange={setToBranchId}
                    placeholder={t('inventory.transfer.pickToBranch')}
                    options={branches
                      .filter((b) => b.id !== fromBranchId)
                      .map((b) => ({ value: b.id, label: b.name }))}
                    searchPlaceholder={t('inventory.transfer.searchBranch')}
                    emptyText={t('inventory.transfer.noBranchMatch')}
                  />
                </div>
              </div>
            </section>

            {/* Line items */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionLabel>{t('inventory.transfer.sectionLines')}</SectionLabel>
                {lineCount > 0 ? (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {t('inventory.transfer.lineSummary', { count: lineCount, qty: totalQty.toLocaleString() })}
                  </span>
                ) : null}
              </div>

              <div className="space-y-3">
                {items.map((it, i) => {
                  const usedElsewhere = new Set(items.filter((_, j) => j !== i).map((x) => x.productId));
                  const product = products?.items.find((p) => p.id === it.productId);
                  const qtyNum = Number(it.quantity) || 0;
                  const exceeds = product ? qtyNum > product.stockQty : false;

                  return (
                    <div
                      key={i}
                      className={cn(
                        'rounded-2xl border p-4 shadow-sm transition-colors duration-150',
                        exceeds ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
                          aria-hidden="true"
                        >
                          <Package className="h-[18px] w-[18px]" />
                        </span>
                        <Combobox
                          className="h-10 min-w-0 flex-1 text-[15px]"
                          value={it.productId}
                          onChange={(v) => updateItem(i, { productId: v, lotId: undefined })}
                          placeholder={t('inventory.transfer.pickProduct')}
                          options={(products?.items ?? []).map((p) => ({
                            value: p.id,
                            label: p.name,
                            description: `${p.sku} — ${p.stockQty.toLocaleString()} ${p.unit}`,
                            disabled: usedElsewhere.has(p.id),
                          }))}
                          searchPlaceholder={t('inventory.transfer.searchProduct')}
                          emptyText={t('inventory.transfer.noProductMatch')}
                          aria-label={t('inventory.transfer.pickProduct')}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          disabled={items.length === 1}
                          onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
                          aria-label={t('common.delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {product?.trackLot ? (
                        <div className="mt-3 flex items-center gap-2 pl-[3.25rem]">
                          <TransferLotSelect
                            productId={product.id}
                            branchId={fromBranchId}
                            value={it.lotId}
                            onChange={(lotId) => updateItem(i, { lotId })}
                          />
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pl-[3.25rem]">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateItem(i, { quantity: String(Math.max(0, qtyNum - 1)) })}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-input bg-card text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground"
                            aria-label={t('inventory.decrease')}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <Input
                            className="h-9 w-24 text-center text-base font-medium tabular-nums"
                            type="number"
                            step="0.001"
                            min="0"
                            value={it.quantity}
                            onChange={(e) => updateItem(i, { quantity: e.target.value })}
                            aria-label={t('inventory.transfer.qty')}
                            aria-invalid={exceeds}
                          />
                          <button
                            type="button"
                            onClick={() => updateItem(i, { quantity: String(qtyNum + 1) })}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-input bg-card text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground"
                            aria-label={t('inventory.increase')}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          {product ? <span className="text-sm text-muted-foreground">{product.unit}</span> : null}
                        </div>

                        {product ? (
                          <p
                            className={cn(
                              'flex items-center gap-1 text-xs',
                              exceeds ? 'font-medium text-destructive' : 'text-muted-foreground',
                            )}
                          >
                            {exceeds
                              ? t('inventory.transfer.lineExceeds', { stock: product.stockQty.toLocaleString() })
                              : t('inventory.transfer.lineRemaining', {
                                  qty: (product.stockQty - qtyNum).toLocaleString(),
                                  unit: product.unit,
                                })}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!fromBranchId}
                onClick={() => setItems((prev) => [...prev, { productId: '', quantity: '1' }])}
              >
                <Plus className="mr-1 h-4 w-4" />
                {t('inventory.transfer.addLine')}
              </Button>
            </section>

            {/* Notes */}
            <section className="space-y-3">
              <SectionLabel>{t('inventory.transfer.notes')}</SectionLabel>
              <Field htmlFor="tr-notes" label={t('inventory.transfer.notes')} icon={MessageSquare} hint={t('inventory.transfer.notesHint')}>
                <Input id="tr-notes" className="h-10" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </section>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-7 py-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Boxes className="h-4 w-4 shrink-0" aria-hidden="true" />
              {lineCount > 0 ? (
                <span>
                  {t('inventory.transfer.total')}:&nbsp;
                  <CurrencyText amount={totalValue} className="font-medium text-foreground" />
                </span>
              ) : (
                <span>{t('inventory.transfer.incomplete')}</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="button" onClick={submit} disabled={create.isPending || hasBlockingIssue}>
                {create.isPending ? t('common.saving') : t('inventory.transfer.saveDraft')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-sm font-semibold text-foreground">{children}</p>;
}

function Field({
  label,
  htmlFor,
  icon: Icon,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  icon?: LucideIcon;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function TransferDetailDialog({
  id,
  canManage,
  authBranchId,
  onClose,
  onDelete,
}: {
  id: string | null;
  canManage: boolean;
  authBranchId: string | null;
  onClose: () => void;
  onDelete: (tr: StockTransferView) => void;
}) {
  const { t } = useTranslation();
  const { data: tr, isLoading } = useStockTransfer(id);
  const send = useSendStockTransfer();
  const receive = useReceiveStockTransfer();

  // BRANCH_ADMIN (authBranchId set) sends from their own branch, receives into their own branch.
  // SUPER_ADMIN (authBranchId null) can do either.
  const canSend = tr && (!authBranchId || authBranchId === tr.fromBranchId);
  const canReceive = tr && (!authBranchId || authBranchId === tr.toBranchId);

  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-start gap-4 border-b border-border bg-gradient-to-br from-primary/[0.06] to-transparent px-7 py-5 pr-14">
          <span
            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <ArrowLeftRight className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <DialogTitle className="text-xl tabular-nums">
              {tr ? tr.transferNumber : t('inventory.transfer.detail')}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              {tr ? (
                <span className="inline-flex items-center gap-1.5">
                  {tr.fromBranchName}
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {tr.toBranchName}
                </span>
              ) : (
                t('inventory.transfer.detail')
              )}
            </DialogDescription>
          </div>
        </DialogHeader>

        {isLoading || !tr ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="max-h-[calc(100vh-9rem)] overflow-y-auto px-7 py-6">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={tr.status} variant={STATUS_VARIANT[tr.status]} label={t(`inventory.transfer.st.${tr.status}`)} />
                {tr.sentAt ? (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    {t('inventory.transfer.sent')}: <DateTimeText value={tr.sentAt} />
                  </span>
                ) : null}
                {tr.receivedAt ? (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    {t('inventory.transfer.received')}: <DateTimeText value={tr.receivedAt} />
                  </span>
                ) : null}
              </div>
              {tr.notes ? (
                <p className="rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-muted-foreground">
                  {tr.notes}
                </p>
              ) : null}

              <div className="overflow-hidden rounded-2xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3">{t('inventory.col.product')}</th>
                      <th className="p-3 text-right">{t('inventory.transfer.qty')}</th>
                      <th className="p-3 text-right">{t('inventory.transfer.unitCost')}</th>
                      <th className="p-3 text-right">{t('inventory.transfer.lineValue')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tr.items ?? []).map((it) => (
                      <tr key={it.id} className="border-t border-border">
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                              aria-hidden="true"
                            >
                              <Package className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{it.productName}</p>
                              <p className="text-xs text-muted-foreground">{it.sku}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 text-right tabular-nums">
                          {it.quantity.toLocaleString()} {it.unit}
                        </td>
                        <td className="p-3 text-right">
                          <CurrencyText amount={it.unitCost} />
                        </td>
                        <td className="p-3 text-right font-medium">
                          <CurrencyText amount={it.lineValue} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end gap-1.5 text-sm">
                <Boxes className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-muted-foreground">{t('inventory.transfer.value')}:&nbsp;</span>
                <CurrencyText amount={tr.totalValue} className="text-base font-semibold" />
              </div>
            </div>
          </div>
        )}

        {!isLoading && tr && canManage ? (
          <div className="flex justify-end gap-2 border-t border-border bg-card px-7 py-4">
            {tr.status === 'DRAFT' ? (
              <Button variant="ghost" onClick={() => onDelete(tr)}>
                <Trash2 className="mr-1 h-4 w-4" />
                {t('common.delete')}
              </Button>
            ) : null}
            {tr.status === 'DRAFT' && canSend ? (
              <Button
                disabled={send.isPending}
                onClick={() =>
                  send.mutate(tr.id, {
                    onSuccess: () => toast.success(t('inventory.transfer.sentToast')),
                    onError: (err) =>
                      toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
                  })
                }
              >
                <Send className="mr-1 h-4 w-4" />
                {t('inventory.transfer.send')}
              </Button>
            ) : null}
            {tr.status === 'IN_TRANSIT' && canReceive ? (
              <Button
                disabled={receive.isPending}
                onClick={() =>
                  receive.mutate(tr.id, {
                    onSuccess: () => toast.success(t('inventory.transfer.receivedToast')),
                    onError: (err) =>
                      toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
                  })
                }
              >
                {t('inventory.transfer.receive')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
