import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, Building2, CheckCircle2, FileMinus, Plus, Printer, Store, Trash2, Undo2, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { SupplierReturnStatusValue, SupplierReturnView } from '@abcp/shared-types';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { CurrencyText, DataTable, DateTimeText, FilterBar, Pagination, StatusPill } from '@/components/shared';
import type { BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { useConfirm } from '@/hooks/useConfirm';
import { useSettings } from '@/features/settings/settings.api';
import { NormalizedApiError } from '@/services/apiError';

import { InventoryExportButton } from './InventoryExportButton';
import { InventoryStatCard } from './InventoryStatCard';
import { InventoryTabs } from './InventoryTabs';
import { ScanInput } from './ScanInput';
import { printSupplierReturn } from './printDocs';
import {
  useCreateSupplierReturn,
  useProducts,
  usePurchaseOrder,
  usePurchaseOrders,
  useStockLots,
  useSupplierBalance,
  useSupplierReturn,
  useSupplierReturnAction,
  useSupplierReturns,
  useSuppliers,
} from './inventory.api';

const STATUS_VARIANT: Record<SupplierReturnStatusValue, NonNullable<BadgeProps['variant']>> = {
  DRAFT: 'neutral',
  POSTED: 'success',
  CANCELLED: 'warning',
};
const STATUSES: SupplierReturnStatusValue[] = ['DRAFT', 'POSTED', 'CANCELLED'];
const errMsg = (err: unknown, fallback: string) => (err instanceof NormalizedApiError ? err.message : fallback);

/** H5 — Inventory ▸ Supplier returns: return goods (RETURN_TO_SUPPLIER) and issue a debit note. */
export function SupplierReturnsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: branches } = useBranches();
  const { data: suppliers } = useSuppliers({ page: 1, pageSize: 100 });

  const [status, setStatus] = useState<SupplierReturnStatusValue | ''>('');
  const [supplierId, setSupplierId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const filters = { branchId: branchId || undefined, supplierId: supplierId || undefined, status: status || undefined };
  const { data, isLoading } = useSupplierReturns({ ...filters, page, pageSize });
  const drafts = useSupplierReturns({ ...filters, status: 'DRAFT', page: 1, pageSize: 1 });
  const posted = useSupplierReturns({ ...filters, status: 'POSTED', page: 1, pageSize: 100 });
  const debitTotal = (posted.data?.items ?? []).reduce((s, r) => s + r.totalValue, 0);

  const columns = useMemo<ColumnDef<SupplierReturnView, unknown>[]>(
    () => [
      {
        header: t('inventory.rts.number'),
        accessorKey: 'returnNumber',
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.returnNumber}</span>,
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
        header: t('inventory.rts.reference'),
        id: 'ref',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {[row.original.poNumber, row.original.grnNumber].filter(Boolean).join(' · ') || '—'}
          </span>
        ),
      },
      {
        header: t('inventory.po.status'),
        accessorKey: 'status',
        cell: ({ getValue }) => {
          const v = getValue() as SupplierReturnStatusValue;
          return <StatusPill status={v} variant={STATUS_VARIANT[v]} label={t(`inventory.rts.st.${v}`)} />;
        },
      },
      {
        header: t('inventory.rts.value'),
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
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">{t('nav.inventory')}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('inventory.rts.subtitle')}</p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('inventory.rts.new')}
          </Button>
        </div>
        <InventoryTabs active="returns" />
      </StickyPageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <InventoryStatCard index={0} icon={Undo2} tone="primary" label={t('inventory.rts.stat.total')} value={data?.total ?? '—'} />
        <InventoryStatCard
          index={1}
          icon={FileMinus}
          tone="neutral"
          label={t('inventory.rts.st.DRAFT')}
          value={drafts.data?.total ?? '—'}
          onClick={() => {
            setStatus((s) => (s === 'DRAFT' ? '' : 'DRAFT'));
            setPage(1);
          }}
          active={status === 'DRAFT'}
        />
        <InventoryStatCard
          index={2}
          icon={Wallet}
          tone="success"
          label={t('inventory.rts.stat.debitNotes')}
          value={<CurrencyText amount={debitTotal} />}
        />
      </div>

      <FilterBar
        hasActiveFilters={Boolean(status) || Boolean(branchId) || Boolean(supplierId)}
        onClear={() => {
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
            setStatus(e.target.value as SupplierReturnStatusValue | '');
            setPage(1);
          }}
          options={[
            { value: '', label: t('inventory.transfer.allStatus') },
            ...STATUSES.map((x) => ({ value: x, label: t(`inventory.rts.st.${x}`) })),
          ]}
          aria-label={t('inventory.po.status')}
        />
        <Select
          className="h-9 w-[180px]"
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
        {!user?.branchId ? (
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
        ) : null}
      </FilterBar>

      {supplierId ? <SupplierBalanceStrip supplierId={supplierId} /> : null}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Undo2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{t('inventory.tab.returns')}</h2>
            <span className="text-xs text-muted-foreground">
              {t('inventory.showing', { shown: data?.items.length ?? 0, total: data?.total ?? 0 })}
            </span>
          </div>
          <InventoryExportButton<SupplierReturnView>
            base="/supplier-returns"
            params={filters}
            filename="supplier-returns"
            columns={[
              { header: t('inventory.rts.number'), value: (r) => r.returnNumber },
              { header: t('inventory.col.branch'), value: (r) => r.branchName },
              { header: t('inventory.po.supplier'), value: (r) => r.supplierName },
              { header: t('inventory.po.number'), value: (r) => r.poNumber ?? '' },
              { header: 'GRN', value: (r) => r.grnNumber ?? '' },
              { header: t('inventory.po.status'), value: (r) => t(`inventory.rts.st.${r.status}`) },
              { header: t('inventory.rts.reason'), value: (r) => r.reason },
              { header: t('inventory.rts.value'), value: (r) => r.totalValue },
              { header: t('inventory.transfer.createdAt'), value: (r) => r.createdAt },
              { header: t('inventory.rts.postedAt'), value: (r) => r.postedAt ?? '' },
            ]}
          />
        </div>
        <div className="p-2 sm:p-3">
          <DataTable
            columns={columns}
            data={data?.items ?? []}
            loading={isLoading}
            getRowId={(r) => r.id}
            onRowClick={(r) => setDetailId(r.id)}
            emptyTitle={t('inventory.rts.empty')}
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

      <CreateReturnDialog
        open={creating}
        branches={(branches ?? []).map((b) => ({ id: b.id, name: b.name }))}
        defaultBranchId={user?.branchId ?? (branches ?? [])[0]?.id ?? ''}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          setDetailId(id);
        }}
      />
      <ReturnDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function SupplierBalanceStrip({ supplierId }: { supplierId: string }) {
  const { t } = useTranslation();
  const { data } = useSupplierBalance(supplierId);
  if (!data) return null;
  const cells = [
    { label: t('inventory.rts.balance.invoiced'), value: data.invoiced },
    { label: t('inventory.rts.balance.paid'), value: data.paid },
    { label: t('inventory.rts.balance.debitNotes'), value: data.debitNotes },
    { label: t('inventory.rts.balance.outstanding'), value: data.outstanding },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label}>
          <p className="text-2xs text-muted-foreground">{c.label}</p>
          <CurrencyText amount={c.value} className="text-sm font-semibold" />
        </div>
      ))}
    </div>
  );
}

type DraftLine = { productId: string; lotId: string; qty: string };

function LineRow({
  index,
  line,
  branchId,
  products,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  line: DraftLine;
  branchId: string;
  products: Array<{ id: string; name: string; sku: string; trackLot: boolean; unit: string; stockQty: number }>;
  onChange: (p: Partial<DraftLine>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { t } = useTranslation();
  const product = products.find((p) => p.id === line.productId);
  const { data: lots } = useStockLots({ productId: line.productId, branchId, page: 1, pageSize: 100 }, Boolean(product?.trackLot));
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
      <Combobox
        className="h-9 min-w-[200px] flex-1"
        value={line.productId}
        onChange={(v) => onChange({ productId: v, lotId: '' })}
        placeholder={t('inventory.po.pickProduct')}
        options={products.map((p) => ({ value: p.id, label: p.name, description: `${p.sku} · ${p.stockQty} ${p.unit}` }))}
        searchPlaceholder={t('inventory.transfer.searchProduct')}
        emptyText={t('inventory.transfer.noProductMatch')}
        aria-label={t('inventory.po.pickProduct')}
      />
      {product?.trackLot ? (
        <Select
          className="h-9 w-[180px]"
          value={line.lotId}
          onChange={(e) => onChange({ lotId: e.target.value })}
          options={[
            { value: '', label: t('inventory.rts.fefo') },
            ...(lots?.items ?? []).map((l) => ({ value: l.id, label: `${l.lotNumber} · ${l.qtyOnHand}` })),
          ]}
          aria-label={t('inventory.lot.pickLot')}
        />
      ) : null}
      <Input
        id={`rts-qty-${index}`}
        className="h-9 w-24 tabular-nums"
        type="number"
        min="0"
        step="0.001"
        value={line.qty}
        onChange={(e) => onChange({ qty: e.target.value })}
        aria-label={t('inventory.po.qty')}
      />
      <Button type="button" variant="ghost" size="icon" disabled={!canRemove} onClick={onRemove} aria-label={t('common.delete')}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function CreateReturnDialog({
  open,
  branches,
  defaultBranchId,
  onClose,
  onCreated,
}: {
  open: boolean;
  branches: Array<{ id: string; name: string }>;
  defaultBranchId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateSupplierReturn();
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [supplierId, setSupplierId] = useState('');
  const [poId, setPoId] = useState('');
  const [grnId, setGrnId] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ productId: '', lotId: '', qty: '1' }]);
  const effBranch = branchId || defaultBranchId;

  const { data: suppliers } = useSuppliers({ page: 1, pageSize: 100 });
  const { data: products } = useProducts({ branchId: effBranch || undefined, page: 1, pageSize: 200 });
  const { data: pos } = usePurchaseOrders({ branchId: effBranch || undefined, supplierId: supplierId || undefined, page: 1, pageSize: 100 });
  const { data: po } = usePurchaseOrder(poId || null);
  const receivedPos = (pos?.items ?? []).filter((p) => p.status === 'PARTIALLY_RECEIVED' || p.status === 'RECEIVED');
  // ຜູກ PO → ເລືອກໄດ້ສະເພາະສິນຄ້າໃນ PO (ຫຼື ໃນ GRN ທີ່ເລືອກ).
  const allowed = grnId
    ? new Set((po?.receipts ?? []).find((g) => g.id === grnId)?.lines.map((l) => l.productId) ?? [])
    : poId
      ? new Set((po?.items ?? []).map((i) => i.productId))
      : null;
  const productOptions = (products?.items ?? []).filter((p) => !allowed || allowed.has(p.id));

  function reset() {
    setSupplierId('');
    setPoId('');
    setGrnId('');
    setReason('');
    setNotes('');
    setLines([{ productId: '', lotId: '', qty: '1' }]);
  }

  function submit() {
    const clean = lines
      .filter((l) => l.productId && Number(l.qty) > 0)
      .map((l) => ({ productId: l.productId, qty: Number(l.qty), ...(l.lotId ? { lotId: l.lotId } : {}) }));
    if (!effBranch || !supplierId || !reason.trim() || !clean.length) {
      toast.error(t('inventory.rts.incomplete'));
      return;
    }
    create.mutate(
      {
        branchId: effBranch,
        supplierId,
        reason: reason.trim(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(poId ? { purchaseOrderId: poId } : {}),
        ...(grnId ? { goodsReceiptId: grnId } : {}),
        lines: clean,
      },
      {
        onSuccess: (r) => {
          toast.success(t('inventory.rts.created'));
          reset();
          onCreated(r.id);
        },
        onError: (err) => toast.error(errMsg(err, t('common.saveError'))),
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
        <DialogHeader className="border-b border-border px-6 py-4 pr-12">
          <DialogTitle>{t('inventory.rts.new')}</DialogTitle>
          <DialogDescription>{t('inventory.rts.createHint')}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[calc(100vh-14rem)] space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('inventory.col.branch')}</Label>
              <Combobox
                className="h-9"
                value={effBranch}
                onChange={(v) => {
                  setBranchId(v);
                  setPoId('');
                  setGrnId('');
                  setLines([{ productId: '', lotId: '', qty: '1' }]);
                }}
                options={branches.map((b) => ({ value: b.id, label: b.name }))}
                searchPlaceholder={t('inventory.transfer.searchBranch')}
                aria-label={t('inventory.col.branch')}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('inventory.po.supplier')}</Label>
              <Combobox
                className="h-9"
                value={supplierId}
                onChange={(v) => {
                  setSupplierId(v);
                  setPoId('');
                  setGrnId('');
                }}
                placeholder={t('inventory.po.pickSupplier')}
                options={(suppliers?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
                searchPlaceholder={t('inventory.po.pickSupplier')}
                aria-label={t('inventory.po.supplier')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rts-po">{t('inventory.rts.linkPo')}</Label>
              <Select
                id="rts-po"
                className="h-9"
                value={poId}
                onChange={(e) => {
                  setPoId(e.target.value);
                  setGrnId('');
                }}
                disabled={!supplierId}
                options={[
                  { value: '', label: t('inventory.rts.none') },
                  ...receivedPos.map((p) => ({ value: p.id, label: p.poNumber })),
                ]}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rts-grn">{t('inventory.rts.linkGrn')}</Label>
              <Select
                id="rts-grn"
                className="h-9"
                value={grnId}
                onChange={(e) => setGrnId(e.target.value)}
                disabled={!poId}
                options={[
                  { value: '', label: t('inventory.rts.none') },
                  ...(po?.receipts ?? []).map((g) => ({ value: g.id, label: g.grnNumber })),
                ]}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rts-reason">{t('inventory.rts.reason')}</Label>
              <Input id="rts-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="rts-notes">{t('inventory.grn.notes')}</Label>
              <Input id="rts-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground">{t('inventory.po.lines')}</p>
            {/* M2 — ສະແກນ → ໃສ່ສິນຄ້າໃນແຖວວ່າງ (ຫຼື ແຖວທີ່ມີແລ້ວ) ແລະ focus ຈຳນວນ */}
            <ScanInput
              className="max-w-xs"
              branchId={effBranch || undefined}
              accept={(r) =>
                productOptions.some((p) => p.id === r.product.id) ? true : t('inventory.scan.notInDocument', { name: r.product.name })
              }
              onFound={(r) => {
                let idx = lines.findIndex((l) => l.productId === r.product.id);
                if (idx < 0) {
                  idx = lines.findIndex((l) => !l.productId);
                  if (idx < 0) idx = lines.length;
                  const at = idx;
                  setLines((prev) => {
                    const next = [...prev];
                    next[at] = { productId: r.product.id, lotId: '', qty: '1' };
                    return next;
                  });
                }
                const at = idx;
                requestAnimationFrame(() => {
                  const el = document.getElementById(`rts-qty-${at}`) as HTMLInputElement | null;
                  el?.focus();
                  el?.select();
                });
              }}
            />
            {lines.map((l, i) => (
              <LineRow
                key={i}
                index={i}
                line={l}
                branchId={effBranch}
                products={productOptions}
                canRemove={lines.length > 1}
                onChange={(p) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, ...p } : x)))}
                onRemove={() => setLines((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setLines((prev) => [...prev, { productId: '', lotId: '', qty: '1' }])}
            >
              <Plus className="mr-1 h-4 w-4" />
              {t('inventory.po.addLine')}
            </Button>
            <p className="text-2xs text-muted-foreground">{t('inventory.rts.valueHint')}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t('common.saving') : t('inventory.rts.saveDraft')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: r } = useSupplierReturn(id);
  const { data: settings } = useSettings();
  const act = useSupplierReturnAction();
  const confirm = useConfirm();

  const run = (action: 'post' | 'cancel', ok: string) =>
    r &&
    act.mutate(
      { id: r.id, action },
      { onSuccess: () => toast.success(ok), onError: (err) => toast.error(errMsg(err, t('common.saveError'))) },
    );

  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{r?.returnNumber ?? t('inventory.rts.detail')}</DialogTitle>
          <DialogDescription>
            {r ? `${r.supplierName} · ${r.branchName}${r.poNumber ? ` · ${r.poNumber}` : ''}${r.grnNumber ? ` · ${r.grnNumber}` : ''}` : ''}
          </DialogDescription>
        </DialogHeader>
        {!r ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusPill status={r.status} variant={STATUS_VARIANT[r.status]} label={t(`inventory.rts.st.${r.status}`)} />
              <span className="text-muted-foreground">{r.reason}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="ml-auto h-8 gap-1.5 px-2.5 text-xs"
                onClick={() => printSupplierReturn(r, t, settings?.businessName)}
              >
                <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                {t('reports.print')}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">{t('inventory.col.product')}</th>
                    <th className="p-2">{t('inventory.lot.title')}</th>
                    <th className="p-2 text-right">{t('inventory.po.qty')}</th>
                    <th className="p-2 text-right">{t('inventory.po.unitCost')}</th>
                    <th className="p-2 text-right">{t('inventory.rts.value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(r.lines ?? []).map((l) => (
                    <tr key={l.id} className="border-t border-border">
                      <td className="p-2">
                        {l.productName} <span className="text-xs text-muted-foreground">{l.sku}</span>
                      </td>
                      <td className="p-2 font-mono text-xs">{l.lotNumber ?? (r.status === 'POSTED' ? '—' : t('inventory.rts.fefo'))}</td>
                      <td className="p-2 text-right tabular-nums">
                        {l.qty.toLocaleString()} {l.unit}
                      </td>
                      <td className="p-2 text-right">{l.unitCost != null ? <CurrencyText amount={l.unitCost} /> : '—'}</td>
                      <td className="p-2 text-right">{l.value != null ? <CurrencyText amount={l.value} /> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.status === 'POSTED' ? (
              <p className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('inventory.rts.debitNoteIssued')} <CurrencyText amount={r.totalValue} className="font-semibold" />
              </p>
            ) : null}
            {r.status === 'DRAFT' ? (
              <div className="flex justify-end gap-2 border-t border-border pt-4">
                <Button
                  variant="ghost"
                  disabled={act.isPending}
                  onClick={async () => {
                    if (await confirm({ title: t('inventory.rts.cancelConfirm') })) run('cancel', t('inventory.rts.cancelled'));
                  }}
                >
                  <Ban className="mr-1 h-4 w-4" />
                  {t('inventory.rts.cancel')}
                </Button>
                <Button
                  disabled={act.isPending}
                  onClick={async () => {
                    if (await confirm({ title: t('inventory.rts.postConfirm') })) run('post', t('inventory.rts.posted'));
                  }}
                >
                  <Undo2 className="mr-1 h-4 w-4" />
                  {t('inventory.rts.post')}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
