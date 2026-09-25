import { type ReactNode, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Ban,
  Building2,
  ClipboardList,
  PackageX,
  Send,
  Undo2,
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
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { useSettings } from '@/features/settings/settings.api';
import { useConfirm } from '@/hooks/useConfirm';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { InventoryExportButton } from './InventoryExportButton';
import { InventoryStatCard } from './InventoryStatCard';
import { InventoryTabs } from './InventoryTabs';
import { PoApprovalsCard } from './PoApprovalsCard';
import { ReorderSuggestionsCard } from './ReorderSuggestionsCard';
import { PoMatchPanel } from './PoMatchPanel';
import { PoHistory } from './PoHistory';
import { printGoodsReceipt, printPurchaseOrder } from './printDocs';
import { PoStatusChart } from './PoStatusChart';
import { ReceiveGoodsDialog } from './ReceiveGoodsDialog';
import { baseEquivalent, defaultUomId, factorOf, unitChoices } from './uom';
import {
  useCreatePurchaseOrder,
  useDeletePurchaseOrder,
  usePoAction,
  useProducts,
  usePurchaseOrder,
  usePurchaseOrders,
  useSupplierProducts,
  useSuppliers,
  useUpdatePurchaseOrder,
} from './inventory.api';

const STATUS_VARIANT: Record<PoStatusValue, NonNullable<BadgeProps['variant']>> = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warning',
  ORDERED: 'info',
  PARTIALLY_RECEIVED: 'primary',
  RECEIVED: 'success',
  CANCELLED: 'warning',
};
const STATUSES: PoStatusValue[] = ['DRAFT', 'PENDING_APPROVAL', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'];

export function PurchaseOrdersPage() {
  const { t } = useTranslation();
  const { hasPermission, role } = useAuth();
  const canManage = hasPermission('inventory:manage');
  const isSuperAdmin = role === 'SUPER_ADMIN';
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
  const orderedCount = items.filter((po) => po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED').length;
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
        cell: ({ getValue, row }) => {
          const v = getValue() as PoStatusValue;
          return (
            <StatusPill
              status={v}
              variant={STATUS_VARIANT[v]}
              label={row.original.closedShortAt ? t('inventory.po.closedShort') : t(`inventory.po.st.${v}`)}
            />
          );
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

      {canManage ? (
        <PoApprovalsCard branchId={branchId || undefined} canApprove={isSuperAdmin} onOpen={setDetailId} />
      ) : null}

      {canManage ? <ReorderSuggestionsCard branchId={branchId || undefined} /> : null}

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
          {canManage ? (
            <InventoryExportButton<PurchaseOrderView>
              base="/purchase-orders"
              params={{
                q: q || undefined,
                status: status || undefined,
                branchId: branchId || undefined,
                supplierId: supplierId || undefined,
              }}
              filename="purchase-orders"
              columns={[
                { header: t('inventory.po.number'), value: (po) => po.poNumber },
                { header: t('inventory.col.branch'), value: (po) => po.branchName },
                { header: t('inventory.po.supplier'), value: (po) => po.supplierName },
                { header: t('inventory.po.status'), value: (po) => t(`inventory.po.st.${po.status}`) },
                { header: t('inventory.po.items'), value: (po) => po.itemCount },
                { header: t('inventory.po.total'), value: (po) => po.totalAmount },
                { header: t('inventory.po.ordered'), value: (po) => po.orderDate },
                { header: t('inventory.po.receivedOn'), value: (po) => po.receivedDate ?? '' },
              ]}
            />
          ) : null}
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
        isSuperAdmin={isSuperAdmin}
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

/** M1 — uomId '' = ໜ່ວຍພື້ນຖານ; quantity/unitCost ເປັນຕໍ່ໜ່ວຍທີ່ເລືອກ (backend ແປງເປັນພື້ນຖານ). */
type DraftItem = { productId: string; quantity: string; unitCost: string; uomId: string };
const EMPTY_ITEM: DraftItem = { productId: '', quantity: '1', unitCost: '0', uomId: '' };

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
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }]);
  // M10 — ສະກຸນ (default = ຂອງຜູ້ສະໜອງ) + ອັດຕາ (ວ່າງ = ອັດຕາບັນທຶກບັນຊີ ຝັ່ງ backend).
  const [currency, setCurrency] = useState<'LAK' | 'THB' | 'USD'>('LAK');
  const [fxRate, setFxRate] = useState('');

  // M20 — ສະເພາະຜູ້ສະໜອງທີ່ active ຂອງສາຂານີ້ ຫຼື ໃຊ້ຮ່ວມ.
  const { data: suppliers } = useSuppliers({ page: 1, pageSize: 100, activeOnly: 'true', branchId: branchId || undefined });
  const { data: products } = useProducts({ branchId: branchId || undefined, page: 1, pageSize: 200 });
  // M8 — ລາຍການລາຄາຂອງຜູ້ສະໜອງ → prefill ລາຄາ/ໜ່ວຍ.
  const { data: priceList } = useSupplierProducts(supplierId || null);
  // M1 — ລາຄາໃນລາຍການລາຄາເປັນຕໍ່ໜ່ວຍຊື້ຂອງມັນ → ແປງເປັນຕໍ່ໜ່ວຍທີ່ເລືອກ (÷ factor ລາຍການລາຄາ × factor ແຖວ).
  const priceFor = (productId: string, cur: string, uomId: string): string | null => {
    const p = products?.items.find((x) => x.id === productId);
    const f = factorOf(p, uomId);
    const sp = priceList?.find((r) => r.productId === productId && r.currency === cur);
    if (sp) {
      if ((sp.uomId ?? '') === uomId) return String(sp.unitCost);
      return String(Number(((sp.unitCost / (sp.factorToBase || 1)) * f).toFixed(4)));
    }
    return p && cur === 'LAK' ? String(Number((p.costPrice * f).toFixed(4))) : null;
  };
  const purchaseUomFor = (productId: string): string => {
    const sp = priceList?.find((r) => r.productId === productId && r.currency === currency);
    if (sp) return sp.uomId ?? '';
    return defaultUomId(products?.items.find((x) => x.id === productId), 'purchase');
  };

  const cleanItems = items.filter((it) => it.productId && Number(it.quantity) > 0);
  const lineCount = cleanItems.length;
  const total = cleanItems.reduce(
    (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitCost) || 0),
    0,
  );

  function reset() {
    setSupplierId('');
    setCurrency('LAK');
    setFxRate('');
    setItems([{ ...EMPTY_ITEM }]);
  }

  function updateItem(i: number, patch: Partial<DraftItem>) {
    setItems((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }

  function submit(status: 'DRAFT' | 'ORDERED' = 'DRAFT') {
    const clean: PurchaseOrderCreateInput['items'] = cleanItems.map((it) => ({
      productId: it.productId,
      quantity: Number(it.quantity),
      unitCost: Number(it.unitCost) || 0,
      uomId: it.uomId || null,
    }));
    if (!branchId || !supplierId || clean.length === 0) {
      toast.error(t('inventory.po.incomplete'));
      return;
    }
    create.mutate(
      {
        branchId,
        supplierId,
        items: clean,
        status,
        currency,
        ...(currency !== 'LAK' && Number(fxRate) > 0 ? { fxRate: Number(fxRate) } : {}),
      },
      {
        onSuccess: (po) => {
          toast.success(po.status === 'PENDING_APPROVAL' ? t('inventory.po.sentForApproval') : t('inventory.po.created'));
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
                      setItems([{ ...EMPTY_ITEM }]);
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
                    onChange={(v) => {
                      setSupplierId(v);
                      const sup = suppliers?.items.find((x) => x.id === v);
                      if (sup) setCurrency(sup.currency as 'LAK' | 'THB' | 'USD');
                    }}
                    placeholder={t('inventory.po.pickSupplier')}
                    options={(suppliers?.items ?? []).map((s) => ({
                      value: s.id,
                      label: s.name,
                      description: s.branchName ?? t('inventory.supplier.shared'),
                    }))}
                    searchPlaceholder={t('inventory.po.pickSupplier')}
                    aria-label={t('inventory.po.supplier')}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">{t('inventory.supplier.currency')}</p>
                  <Select
                    className="h-10 bg-card"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as 'LAK' | 'THB' | 'USD')}
                    options={['LAK', 'THB', 'USD'].map((c) => ({ value: c, label: c }))}
                    aria-label={t('inventory.supplier.currency')}
                  />
                </div>
                {currency !== 'LAK' ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">{t('inventory.po.fxRate', { currency })}</p>
                    <Input
                      className="h-10 bg-card"
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      value={fxRate}
                      placeholder={t('inventory.po.fxRateAuto')}
                      onChange={(e) => setFxRate(e.target.value)}
                      aria-label={t('inventory.po.fxRate', { currency })}
                    />
                  </div>
                ) : null}
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
                            const uomId = purchaseUomFor(v);
                            const prefill = priceFor(v, currency, uomId);
                            updateItem(i, {
                              productId: v,
                              uomId,
                              unitCost: prefill != null && (it.unitCost === '0' || !it.unitCost) ? prefill : it.unitCost,
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
                          {product ? (
                            unitChoices(product).length > 1 ? (
                              <div className="flex flex-col">
                                <Select
                                  className="h-9 min-w-[110px]"
                                  value={it.uomId}
                                  onChange={(e) => {
                                    const prefill = priceFor(it.productId, currency, e.target.value);
                                    updateItem(i, { uomId: e.target.value, ...(prefill != null ? { unitCost: prefill } : {}) });
                                  }}
                                  options={unitChoices(product).map((u) => ({ value: u.value, label: u.label }))}
                                  aria-label={t('inventory.uom.unit')}
                                />
                                {it.uomId ? (
                                  <span className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                                    {baseEquivalent(qtyNum, factorOf(product, it.uomId), product.unit)}
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">{product.unit}</span>
                            )
                          ) : null}
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
                onClick={() => setItems((prev) => [...prev, { ...EMPTY_ITEM }])}
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
                  {currency === 'LAK' ? (
                    <CurrencyText amount={total} className="font-medium text-foreground" />
                  ) : (
                    <span className="font-medium tabular-nums text-foreground">
                      {total.toLocaleString(undefined, { maximumFractionDigits: 2 })} {currency}
                    </span>
                  )}
                </span>
              ) : (
                <span>{t('inventory.po.incomplete')}</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => submit('DRAFT')} disabled={create.isPending}>
                {create.isPending ? t('common.saving') : t('inventory.po.saveDraft')}
              </Button>
              <Button type="button" onClick={() => submit('ORDERED')} disabled={create.isPending}>
                <Send className="mr-1 h-4 w-4" />
                {t('inventory.po.saveAndOrder')}
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
  isSuperAdmin,
  onClose,
  onDelete,
}: {
  id: string | null;
  canManage: boolean;
  isSuperAdmin: boolean;
  onClose: () => void;
  onDelete: (po: PurchaseOrderView) => void;
}) {
  const { t } = useTranslation();
  const { data: po, isLoading } = usePurchaseOrder(id);
  const { data: settings } = useSettings();
  const update = useUpdatePurchaseOrder();
  const action = usePoAction();
  const confirm = useConfirm();
  const [receiving, setReceiving] = useState(false);
  const [reasonFor, setReasonFor] = useState<'reject' | 'close-short' | null>(null);
  const [reason, setReason] = useState('');
  // H4 — ຮັບເຄື່ອງໄດ້ຫຼາຍຮອບ (GRN) ຈົນກວ່າຈະຄົບ ຫຼື ປິດຮັບບໍ່ຄົບ; PENDING_APPROVAL ຕ້ອງອະນຸມັດກ່ອນ.
  const canReceive = po?.status === 'DRAFT' || po?.status === 'ORDERED' || po?.status === 'PARTIALLY_RECEIVED';
  const hasReceipts = (po?.items ?? []).some((it) => it.qtyReceived > 0 || it.qtyRejected > 0);
  const showMatch = po && po.status !== 'DRAFT' && po.status !== 'PENDING_APPROVAL' && po.status !== 'CANCELLED';

  const onError = (err: unknown) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));

  function setStatus(status: 'ORDERED' | 'CANCELLED' | 'DRAFT', okKey: string) {
    if (!po) return;
    update.mutate(
      { id: po.id, input: { status } },
      {
        onSuccess: (next) =>
          toast.success(next.status === 'PENDING_APPROVAL' ? t('inventory.po.sentForApproval') : t(okKey)),
        onError,
      },
    );
  }

  function submitReason() {
    if (!po || !reasonFor || !reason.trim()) return;
    action.mutate(
      { id: po.id, action: reasonFor, reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(reasonFor === 'reject' ? t('inventory.poApprovals.rejected') : t('inventory.po.closedShortDone'));
          setReasonFor(null);
          setReason('');
        },
        onError,
      },
    );
  }

  function handlePrint() {
    if (po) printPurchaseOrder(po, t, settings?.businessName);
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

            {po.rejectedReason && po.status === 'DRAFT' ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive-soft px-3 py-2 text-xs text-destructive">
                {t('inventory.po.rejectedNote', { reason: po.rejectedReason })}
              </p>
            ) : null}
            {po.status === 'PENDING_APPROVAL' ? (
              <p className="rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning">
                {t('inventory.po.pendingNote', { name: po.orderedByUserName ?? '—' })}
              </p>
            ) : null}
            {po.closedShortAt ? (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                {t('inventory.po.closedShortNote', { reason: po.closedShortReason ?? '' })}
              </p>
            ) : null}
            {po.approvedByUserName && po.status !== 'DRAFT' ? (
              <p className="text-xs text-muted-foreground">
                {t('inventory.po.approvedBy', { name: po.approvedByUserName })}
              </p>
            ) : null}

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">{t('inventory.col.product')}</th>
                    <th className="p-2 text-right">{t('inventory.po.qty')}</th>
                    <th className="p-2">{t('inventory.grn.receivedCol')}</th>
                    <th className="p-2 text-right">{t('inventory.po.unitCost')}</th>
                    <th className="p-2 text-right">{t('inventory.po.lineTotal')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(po.items ?? []).map((it) => {
                    const pct = it.quantity > 0 ? Math.min(100, (it.qtyReceived / it.quantity) * 100) : 0;
                    return (
                      <tr key={it.id} className="border-t border-border">
                        <td className="p-2">
                          {it.productName} <span className="text-xs text-muted-foreground">{it.sku}</span>
                          {it.qtyReceived > 0 && it.lotNumber ? (
                            <div className="text-xs text-muted-foreground">
                              {t('inventory.lot.title')}: <span className="font-mono">{it.lotNumber}</span>
                              {it.expiryDate ? ` · ${t('inventory.lot.expiry')} ${it.expiryDate}` : ''}
                            </div>
                          ) : null}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {it.uomCode && it.factorToBase !== 1 ? (
                            <>
                              {it.uomQty.toLocaleString()} {it.uomCode}
                              <div className="text-[11px] text-muted-foreground">
                                = {it.quantity.toLocaleString()} {it.unit}
                              </div>
                            </>
                          ) : (
                            <>
                              {it.quantity.toLocaleString()} {it.unit}
                            </>
                          )}
                        </td>
                        <td className="min-w-[120px] p-2">
                          <div className="text-xs tabular-nums text-muted-foreground">
                            {it.qtyReceived.toLocaleString()} / {it.quantity.toLocaleString()}
                            {it.qtyRejected > 0 ? (
                              <span className="ml-1 text-destructive">
                                ({t('inventory.grn.rejectedShort', { qty: it.qtyRejected.toLocaleString() })})
                              </span>
                            ) : null}
                          </div>
                          <div
                            className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                            role="progressbar"
                            aria-valuenow={Math.round(pct)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={t('inventory.grn.receivedCol')}
                          >
                            <div
                              className={cn('h-full rounded-full', pct >= 100 ? 'bg-success' : 'bg-primary')}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                        <td className="p-2 text-right">
                          <CurrencyText amount={it.uomCode && it.factorToBase !== 1 ? it.uomUnitCost : it.unitCost} />
                          {it.uomCode && it.factorToBase !== 1 ? (
                            <div className="text-[11px] text-muted-foreground">/ {it.uomCode}</div>
                          ) : null}
                        </td>
                        <td className="p-2 text-right">
                          <CurrencyText amount={it.lineTotal} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end gap-2 text-sm">
              <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-muted-foreground">{t('inventory.po.total')}:</span>
              {po.currency === 'LAK' ? (
                <CurrencyText amount={po.totalAmount} className="text-base font-semibold text-foreground" />
              ) : (
                <>
                  <span className="text-base font-semibold tabular-nums text-foreground">
                    {po.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {po.currency}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    × {po.fxRate.toLocaleString()} = <CurrencyText amount={po.totalAmountLak} />
                  </span>
                </>
              )}
            </div>
            {po.supplierInactive ? (
              <p className="text-right text-xs text-warning">{t('inventory.po.supplierInactive')}</p>
            ) : null}

            {(po.receipts ?? []).length ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">{t('inventory.grn.section')}</p>
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {(po.receipts ?? []).map((g) => (
                    <li key={g.id} className="space-y-1 px-3 py-2 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium tabular-nums text-foreground">{g.grnNumber}</span>
                        <span className="flex items-center gap-2">
                          <CurrencyText amount={g.totalValue} className="font-medium" />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => printGoodsReceipt(g, po, t, settings?.businessName)}
                            aria-label={t('inventory.print.grnAction', { number: g.grnNumber })}
                          >
                            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('reports.print')}
                          </Button>
                        </span>
                      </div>
                      <p className="text-muted-foreground">
                        <DateTimeText value={g.receivedAt} />
                        {g.receivedByUserName ? ` · ${g.receivedByUserName}` : ''}
                        {g.supplierDeliveryNote ? ` · ${t('inventory.grn.deliveryNote')} ${g.supplierDeliveryNote}` : ''}
                      </p>
                      <p className="text-muted-foreground">
                        {g.lines
                          .map(
                            (l) =>
                              `${l.productName} +${l.qtyReceived.toLocaleString()}${
                                l.qtyRejected > 0 ? ` / −${l.qtyRejected.toLocaleString()} (${l.rejectReason ?? ''})` : ''
                              }${l.lotNumber ? ` · ${l.lotNumber}` : ''}`,
                          )
                          .join(' · ')}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {showMatch ? <PoMatchPanel poId={po.id} /> : null}

            <PoHistory revisions={po.revisions ?? []} />

            {canManage ? (
              <div className="flex flex-col-reverse flex-wrap gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                {po.status === 'DRAFT' ? (
                  <Button variant="ghost" onClick={() => onDelete(po)}>
                    <Trash2 className="mr-1 h-4 w-4" />
                    {t('common.delete')}
                  </Button>
                ) : null}
                {(po.status === 'ORDERED' || po.status === 'PENDING_APPROVAL') && !hasReceipts ? (
                  <Button
                    variant="ghost"
                    disabled={update.isPending}
                    onClick={async () => {
                      if (await confirm({ title: t('inventory.po.cancelConfirm') })) setStatus('CANCELLED', 'inventory.po.cancelled');
                    }}
                  >
                    <Ban className="mr-1 h-4 w-4" />
                    {t('inventory.po.cancelPo')}
                  </Button>
                ) : null}
                {po.status === 'PENDING_APPROVAL' ? (
                  <Button variant="secondary" disabled={update.isPending} onClick={() => setStatus('DRAFT', 'inventory.po.withdrawn')}>
                    <Undo2 className="mr-1 h-4 w-4" />
                    {t('inventory.po.withdraw')}
                  </Button>
                ) : null}
                {po.status === 'PENDING_APPROVAL' && isSuperAdmin ? (
                  <>
                    <Button variant="secondary" disabled={action.isPending} onClick={() => setReasonFor('reject')}>
                      {t('inventory.approvals.reject')}
                    </Button>
                    <Button
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate(
                          { id: po.id, action: 'approve' },
                          { onSuccess: () => toast.success(t('inventory.poApprovals.approved')), onError },
                        )
                      }
                    >
                      {t('inventory.approvals.approve')}
                    </Button>
                  </>
                ) : null}
                {po.status === 'PARTIALLY_RECEIVED' ? (
                  <Button variant="secondary" disabled={action.isPending} onClick={() => setReasonFor('close-short')}>
                    <PackageX className="mr-1 h-4 w-4" />
                    {t('inventory.po.closeShort')}
                  </Button>
                ) : null}
                {po.status === 'DRAFT' ? (
                  <Button variant="secondary" disabled={update.isPending} onClick={() => setStatus('ORDERED', 'inventory.po.orderedToast')}>
                    <Send className="mr-1 h-4 w-4" />
                    {t('inventory.po.placeOrder')}
                  </Button>
                ) : null}
                {canReceive ? (
                  <Button onClick={() => setReceiving(true)}>
                    <PackageCheck className="mr-1 h-4 w-4" />
                    {t('inventory.po.receive')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {po ? <ReceiveGoodsDialog po={po} open={receiving} onClose={() => setReceiving(false)} /> : null}

        <Dialog
          open={Boolean(reasonFor)}
          onOpenChange={(o) => {
            if (!o) {
              setReasonFor(null);
              setReason('');
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {reasonFor === 'reject' ? t('inventory.poApprovals.rejectTitle') : t('inventory.po.closeShortTitle')}
              </DialogTitle>
              <DialogDescription>
                {reasonFor === 'close-short' ? t('inventory.po.closeShortHint') : po?.poNumber}
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                submitReason();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="po-reason">{t('inventory.po.reason')}</Label>
                <Input id="po-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setReasonFor(null)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={action.isPending || !reason.trim()}>
                  {t('common.save')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

      </DialogContent>
    </Dialog>
  );
}
