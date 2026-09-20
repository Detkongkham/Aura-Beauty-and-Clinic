import { type ReactNode, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Building2,
  ClipboardList,
  FileText,
  Minus,
  Package,
  PackageCheck,
  Plus,
  Printer,
  Store,
  Trash2,
  Truck,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type {
  PoStatusValue,
  PurchaseOrderCreateInput,
  PurchaseOrderView,
} from '@abcp/shared-types';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { CurrencyText, DataTable, DateTimeText, FilterBar, Pagination, StatusPill } from '@/components/shared';
import type { BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { useSettings } from '@/features/settings/settings.api';
import { useConfirm } from '@/hooks/useConfirm';
import { NormalizedApiError } from '@/services/apiError';

import { InventoryStatCard } from './InventoryStatCard';
import { InventoryTabs } from './InventoryTabs';
import { PoStatusChart } from './PoStatusChart';
import {
  useCreatePurchaseOrder,
  useDeletePurchaseOrder,
  useProducts,
  usePurchaseOrder,
  usePurchaseOrders,
  useReceivePurchaseOrder,
  useSuppliers,
} from './inventory.api';

const STATUS_VARIANT: Record<PoStatusValue, NonNullable<BadgeProps['variant']>> = {
  DRAFT: 'neutral',
  ORDERED: 'info',
  RECEIVED: 'success',
  CANCELLED: 'warning',
};
const STATUSES: PoStatusValue[] = ['DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED'];

export function PurchaseOrdersPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('inventory:manage');
  const { data: branches } = useBranches();
  const { data: suppliers } = useSuppliers({ page: 1, pageSize: 100 });
  const confirm = useConfirm();
  const del = useDeletePurchaseOrder();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<PoStatusValue | ''>('');
  const [branchId, setBranchId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data, isLoading } = usePurchaseOrders({
    q: q || undefined,
    status: status || undefined,
    branchId: branchId || undefined,
    supplierId: supplierId || undefined,
    page,
    pageSize,
  });

  // No dedicated /purchase-orders/stats endpoint — draft/ordered/value figures
  // summarize the currently loaded (filtered) page, not every PO on file.
  const items = data?.items ?? [];
  const draftCount = items.filter((po) => po.status === 'DRAFT').length;
  const orderedCount = items.filter((po) => po.status === 'ORDERED').length;
  const pageValue = items.reduce((sum, po) => sum + po.totalAmount, 0);

  const columns = useMemo<ColumnDef<PurchaseOrderView, unknown>[]>(
    () => [
      {
        header: t('inventory.po.number'),
        accessorKey: 'poNumber',
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <ClipboardList className="h-4 w-4" />
            </span>
            <span className="font-medium tabular-nums">{row.original.poNumber}</span>
          </div>
        ),
      },
      {
        header: t('inventory.po.supplier'),
        accessorKey: 'supplierName',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {row.original.supplierName}
          </span>
        ),
      },
      {
        header: t('inventory.col.branch'),
        accessorKey: 'branchName',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <Store className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {row.original.branchName}
          </span>
        ),
      },
      {
        header: t('inventory.po.status'),
        accessorKey: 'status',
        cell: ({ getValue }) => {
          const v = getValue() as PoStatusValue;
          return <StatusPill status={v} variant={STATUS_VARIANT[v]} label={t(`inventory.po.st.${v}`)} />;
        },
      },
      {
        header: t('inventory.po.items'),
        accessorKey: 'itemCount',
        meta: { align: 'right' },
        cell: ({ getValue }) => <span className="tabular-nums">{getValue() as number}</span>,
      },
      {
        header: t('inventory.po.total'),
        accessorKey: 'totalAmount',
        meta: { align: 'right' },
        cell: ({ getValue }) => <CurrencyText amount={getValue() as number} className="font-medium" />,
      },
      {
        header: t('inventory.po.ordered'),
        accessorKey: 'orderDate',
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
            <p className="mt-0.5 text-sm text-muted-foreground">{t('inventory.po.subtitle')}</p>
          </div>
          {canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t('inventory.po.new')}
            </Button>
          ) : null}
        </div>
        <InventoryTabs active="purchaseOrders" />
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
            icon={ClipboardList}
            tone="primary"
            label={t('inventory.po.stat.total')}
            value={data?.total ?? '—'}
          />
          <InventoryStatCard
            index={1}
            icon={FileText}
            tone="neutral"
            label={t('inventory.po.stat.draft')}
            value={draftCount}
          />
          <InventoryStatCard
            index={2}
            icon={Truck}
            tone="warning"
            label={t('inventory.po.stat.ordered')}
            value={orderedCount}
          />
          <InventoryStatCard
            index={3}
            icon={Wallet}
            tone="success"
            label={t('inventory.po.stat.value')}
            value={<CurrencyText amount={pageValue} />}
          />
        </div>
      )}

      <PoStatusChart branchId={branchId || undefined} />

      <FilterBar
        search={q}
        onSearchChange={(v) => {
          setQ(v);
          setPage(1);
        }}
        searchPlaceholder={t('inventory.po.searchPlaceholder')}
        hasActiveFilters={Boolean(q) || Boolean(status) || Boolean(branchId) || Boolean(supplierId)}
        onClear={() => {
          setQ('');
          setStatus('');
          setBranchId('');
          setSupplierId('');
          setPage(1);
        }}
      >
        <Select
          className="h-9 w-[160px]"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as PoStatusValue | '');
            setPage(1);
          }}
          options={[
            { value: '', label: t('inventory.po.allStatus') },
            ...STATUSES.map((x) => ({ value: x, label: t(`inventory.po.st.${x}`) })),
          ]}
          aria-label={t('inventory.po.status')}
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
        <Select
          className="h-9 w-[170px]"
          value={supplierId}
          onChange={(e) => {
            setSupplierId(e.target.value);
            setPage(1);
          }}
          options={[
            { value: '', label: t('inventory.po.allSuppliers') },
            ...(suppliers?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
          ]}
          aria-label={t('inventory.po.supplier')}
        />
      </FilterBar>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{t('inventory.tab.purchaseOrders')}</h2>
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
            emptyTitle={t('inventory.po.empty')}
            emptyDescription={t('inventory.po.emptyDescription')}
            emptyAction={
              canManage ? (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t('inventory.po.new')}
                </Button>
              ) : undefined
            }
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

      <CreatePoDialog
        open={creating}
        branches={(branches ?? []).map((b) => ({ id: b.id, name: b.name }))}
        onClose={() => setCreating(false)}
      />
      <PoDetailDialog
        id={detailId}
        canManage={canManage}
        onClose={() => setDetailId(null)}
        onDelete={async (po) => {
          if (!(await confirm({ title: t('inventory.po.deleteConfirm') }))) return;
          del.mutate(po.id, {
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

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-sm font-semibold text-foreground">{children}</p>;
}

type DraftItem = { productId: string; quantity: string; unitCost: string };

function CreatePoDialog({
  open,
  branches,
  onClose,
}: {
  open: boolean;
  branches: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreatePurchaseOrder();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [supplierId, setSupplierId] = useState('');
  const [items, setItems] = useState<DraftItem[]>([{ productId: '', quantity: '1', unitCost: '0' }]);

  const { data: suppliers } = useSuppliers({ page: 1, pageSize: 100 });
  const { data: products } = useProducts({ branchId: branchId || undefined, page: 1, pageSize: 200 });

  const cleanItems = items.filter((it) => it.productId && Number(it.quantity) > 0);
  const lineCount = cleanItems.length;
  const total = cleanItems.reduce(
    (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitCost) || 0),
    0,
  );

  function reset() {
    setSupplierId('');
    setItems([{ productId: '', quantity: '1', unitCost: '0' }]);
  }

  function updateItem(i: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  function submit() {
    const clean: PurchaseOrderCreateInput['items'] = cleanItems.map((it) => ({
      productId: it.productId,
      quantity: Number(it.quantity),
      unitCost: Number(it.unitCost) || 0,
    }));
    if (!branchId || !supplierId || clean.length === 0) {
      toast.error(t('inventory.po.incomplete'));
      return;
    }
    create.mutate(
      { branchId, supplierId, items: clean, status: 'DRAFT' },
      {
        onSuccess: () => {
          toast.success(t('inventory.po.created'));
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
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-start gap-4 border-b border-border bg-gradient-to-br from-primary/[0.06] to-transparent px-7 py-5 pr-14">
          <span
            className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <ClipboardList className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <DialogTitle className="text-xl">{t('inventory.po.new')}</DialogTitle>
            <DialogDescription className="text-[13px]">{t('inventory.po.form.subtitleNew')}</DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex max-h-[calc(100vh-9rem)] flex-col">
          <div className="flex-1 space-y-8 overflow-y-auto px-7 py-6">
            <section className="space-y-3">
              <SectionLabel>{t('inventory.po.form.sectionOrder')}</SectionLabel>
              <div className="grid gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Store className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {t('inventory.col.branch')}
                  </p>
                  <Combobox
                    className="h-10 bg-card text-[15px]"
                    value={branchId}
                    onChange={(v) => {
                      setBranchId(v);
                      setItems([{ productId: '', quantity: '1', unitCost: '0' }]);
                    }}
                    options={branches.map((b) => ({ value: b.id, label: b.name }))}
                    searchPlaceholder={t('inventory.transfer.searchBranch')}
                    emptyText={t('inventory.transfer.noBranchMatch')}
                    aria-label={t('inventory.col.branch')}
                  />
                </div>
                <div className="space-y-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {t('inventory.po.supplier')}
                  </p>
                  <Combobox
                    className="h-10 bg-card text-[15px]"
                    value={supplierId}
                    onChange={setSupplierId}
                    placeholder={t('inventory.po.pickSupplier')}
                    options={(suppliers?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
                    searchPlaceholder={t('inventory.po.pickSupplier')}
                    aria-label={t('inventory.po.supplier')}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionLabel>{t('inventory.po.lines')}</SectionLabel>
                {lineCount > 0 ? (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                    {t('inventory.po.items')}: {lineCount}
                  </span>
                ) : null}
              </div>

              <div className="space-y-3">
                {items.map((it, i) => {
                  const usedElsewhere = new Set(items.filter((_, j) => j !== i).map((x) => x.productId));
                  const product = products?.items.find((p) => p.id === it.productId);
                  const qtyNum = Number(it.quantity) || 0;
                  const lineTotal = qtyNum * (Number(it.unitCost) || 0);

                  return (
                    <div key={i} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
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
                          onChange={(v) => {
                            const p = products?.items.find((x) => x.id === v);
                            updateItem(i, {
                              productId: v,
                              unitCost: p && (it.unitCost === '0' || !it.unitCost) ? String(p.costPrice) : it.unitCost,
                            });
                          }}
                          placeholder={t('inventory.po.pickProduct')}
                          options={(products?.items ?? []).map((p) => ({
                            value: p.id,
                            label: p.name,
                            description: p.sku,
                            disabled: usedElsewhere.has(p.id),
                          }))}
                          searchPlaceholder={t('inventory.transfer.searchProduct')}
                          emptyText={t('inventory.transfer.noProductMatch')}
                          aria-label={t('inventory.po.pickProduct')}
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

                      <div className="mt-3 flex flex-wrap items-center gap-3 pl-[3.25rem]">
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
                            className="h-9 w-20 text-center text-base font-medium tabular-nums"
                            type="number"
                            step="0.001"
                            min="0"
                            value={it.quantity}
                            onChange={(e) => updateItem(i, { quantity: e.target.value })}
                            aria-label={t('inventory.po.qty')}
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

                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-muted-foreground">{t('inventory.po.unitCost')}</span>
                          <Input
                            className="h-9 w-28 tabular-nums"
                            type="number"
                            step="0.01"
                            min="0"
                            value={it.unitCost}
                            onChange={(e) => updateItem(i, { unitCost: e.target.value })}
                            aria-label={t('inventory.po.unitCost')}
                          />
                        </div>

                        <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                          {t('inventory.po.lineTotal')}
                          <CurrencyText amount={lineTotal} className="text-sm font-medium text-foreground" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!branchId}
                onClick={() => setItems((prev) => [...prev, { productId: '', quantity: '1', unitCost: '0' }])}
              >
                <Plus className="mr-1 h-4 w-4" />
                {t('inventory.po.addLine')}
              </Button>
            </section>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-7 py-4">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />
              {lineCount > 0 ? (
                <span>
                  {t('inventory.po.total')}:&nbsp;
                  <CurrencyText amount={total} className="font-medium text-foreground" />
                </span>
              ) : (
                <span>{t('inventory.po.incomplete')}</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="button" onClick={submit} disabled={create.isPending}>
                {create.isPending ? t('common.saving') : t('inventory.po.saveDraft')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PoDetailDialog({
  id,
  canManage,
  onClose,
  onDelete,
}: {
  id: string | null;
  canManage: boolean;
  onClose: () => void;
  onDelete: (po: PurchaseOrderView) => void;
}) {
  const { t } = useTranslation();
  const { data: po, isLoading } = usePurchaseOrder(id);
  const { data: settings } = useSettings();
  const receive = useReceivePurchaseOrder();

  function handlePrint() {
    document.body.classList.add('printing-po');
    const cleanup = () => {
      document.body.classList.remove('printing-po');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-start gap-3 border-b border-border px-6 py-4 pr-12">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <ClipboardList className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <DialogTitle>{po ? po.poNumber : t('inventory.po.detail')}</DialogTitle>
            <DialogDescription>{t('inventory.po.detailSubtitle')}</DialogDescription>
          </div>
          {po ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-0.5 h-8 shrink-0 gap-1.5 px-2.5 text-xs"
              onClick={handlePrint}
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              {t('reports.print')}
            </Button>
          ) : null}
        </DialogHeader>

        {isLoading || !po ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="max-h-[calc(100vh-13rem)] space-y-4 overflow-y-auto px-6 py-5">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 px-3.5 py-3">
              <span className="inline-flex items-center gap-1.5 text-sm">
                <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                {po.supplierName}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="inline-flex items-center gap-1.5 text-sm">
                <Store className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                {po.branchName}
              </span>
              <StatusPill
                status={po.status}
                variant={STATUS_VARIANT[po.status]}
                label={t(`inventory.po.st.${po.status}`)}
                className="ml-auto"
              />
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>
                {t('inventory.po.ordered')}: <DateTimeText value={po.orderDate} className="text-foreground" />
              </span>
              {po.receivedDate ? (
                <span>
                  {t('inventory.po.receivedOn')}:{' '}
                  <DateTimeText value={po.receivedDate} className="text-foreground" />
                </span>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">{t('inventory.col.product')}</th>
                    <th className="p-2 text-right">{t('inventory.po.qty')}</th>
                    <th className="p-2 text-right">{t('inventory.po.unitCost')}</th>
                    <th className="p-2 text-right">{t('inventory.po.lineTotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(po.items ?? []).map((it) => (
                    <tr key={it.id} className="border-t border-border">
                      <td className="p-2">
                        {it.productName} <span className="text-xs text-muted-foreground">{it.sku}</span>
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {it.quantity.toLocaleString()} {it.unit}
                      </td>
                      <td className="p-2 text-right">
                        <CurrencyText amount={it.unitCost} />
                      </td>
                      <td className="p-2 text-right">
                        <CurrencyText amount={it.lineTotal} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-2 text-sm">
              <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-muted-foreground">{t('inventory.po.total')}:</span>
              <CurrencyText amount={po.totalAmount} className="text-base font-semibold text-foreground" />
            </div>

            {canManage ? (
              <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                {po.status === 'DRAFT' ? (
                  <Button variant="ghost" onClick={() => onDelete(po)}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    {t('common.delete')}
                  </Button>
                ) : null}
                {po.status === 'DRAFT' || po.status === 'ORDERED' ? (
                  <Button
                    disabled={receive.isPending}
                    onClick={() =>
                      receive.mutate(po.id, {
                        onSuccess: () => toast.success(t('inventory.po.received')),
                        onError: (err) =>
                          toast.error(
                            err instanceof NormalizedApiError ? err.message : t('common.saveError'),
                          ),
                      })
                    }
                  >
                    <PackageCheck className="mr-1 h-4 w-4" />
                    {t('inventory.po.receive')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {po ? (
          <div className="po-print-area hidden print:block">
            <div className="p-8 text-black">
              <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-4">
                <div>
                  <p className="text-lg font-bold">{settings?.businessName}</p>
                  <p className="text-sm">{po.branchName}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold uppercase tracking-wide">{t('inventory.po.detail')}</p>
                  <p className="text-sm">{po.poNumber}</p>
                </div>
              </div>

              <div className="mt-4 flex justify-between gap-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase text-neutral-600">
                    {t('inventory.po.supplier')}
                  </p>
                  <p>{po.supplierName}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase text-neutral-600">
                    {t('inventory.po.status')}
                  </p>
                  <p>{t(`inventory.po.st.${po.status}`)}</p>
                </div>
              </div>

              <div className="mt-3 flex justify-between gap-4 text-sm">
                <div>
                  <p className="text-xs font-semibold uppercase text-neutral-600">
                    {t('inventory.po.ordered')}
                  </p>
                  <DateTimeText value={po.orderDate} />
                </div>
                {po.receivedDate ? (
                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase text-neutral-600">
                      {t('inventory.po.receivedOn')}
                    </p>
                    <DateTimeText value={po.receivedDate} />
                  </div>
                ) : null}
              </div>

              <table className="mt-6 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-black text-left">
                    <th className="py-1.5">{t('inventory.col.product')}</th>
                    <th className="py-1.5 text-right">{t('inventory.po.qty')}</th>
                    <th className="py-1.5 text-right">{t('inventory.po.unitCost')}</th>
                    <th className="py-1.5 text-right">{t('inventory.po.lineTotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(po.items ?? []).map((it) => (
                    <tr key={it.id} className="border-b border-neutral-300">
                      <td className="py-1.5">
                        {it.productName} <span className="text-xs text-neutral-600">{it.sku}</span>
                      </td>
                      <td className="py-1.5 text-right">
                        {it.quantity.toLocaleString()} {it.unit}
                      </td>
                      <td className="py-1.5 text-right">
                        <CurrencyText amount={it.unitCost} />
                      </td>
                      <td className="py-1.5 text-right">
                        <CurrencyText amount={it.lineTotal} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-3 flex justify-end gap-2 border-t-2 border-black pt-2 text-base font-bold">
                <span>{t('inventory.po.total')}:</span>
                <CurrencyText amount={po.totalAmount} />
              </div>

              <div className="mt-16 grid grid-cols-2 gap-8 text-sm">
                <div className="border-t border-black pt-1">{t('inventory.po.preparedBy')}</div>
                <div className="border-t border-black pt-1">{t('inventory.po.receivedBy')}</div>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
