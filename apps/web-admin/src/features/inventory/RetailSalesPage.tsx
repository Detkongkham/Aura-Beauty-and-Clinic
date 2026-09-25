import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Ban, Printer, Receipt, RefreshCw, RotateCcw, ShoppingBag, ShoppingCart, Trash2, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ProductView, RetailSaleStatusValue, RetailSaleView } from '@abcp/shared-types';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { CurrencyText, DataTable, DateTimeText, FilterBar, Pagination, StatusPill } from '@/components/shared';
import type { BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { useCustomers } from '@/features/customers/customers.api';
import { usePayment } from '@/features/finance/finance.api';
import { ReceiptDialog } from '@/features/finance/ReceiptDialog';
import { RecordPaymentPanel } from '@/features/finance/RecordPaymentPanel';
import { RefundPanel } from '@/features/finance/RefundPanel';
import { useConfirm } from '@/hooks/useConfirm';
import { NormalizedApiError } from '@/services/apiError';

import { InventoryExportButton } from './InventoryExportButton';
import { InventoryStatCard } from './InventoryStatCard';
import { InventoryTabs } from './InventoryTabs';
import { ScanInput } from './ScanInput';
import {
  useCreateRetailSale,
  useProducts,
  useRetailReturn,
  useRetailSale,
  useRetailSaleAction,
  useRetailSales,
} from './inventory.api';

const STATUS_VARIANT: Record<RetailSaleStatusValue, NonNullable<BadgeProps['variant']>> = {
  PENDING_PAYMENT: 'warning',
  PAID: 'success',
  VOIDED: 'neutral',
};
const STATUSES: RetailSaleStatusValue[] = ['PENDING_PAYMENT', 'PAID', 'VOIDED'];
const errMsg = (err: unknown, fallback: string) => (err instanceof NormalizedApiError ? err.message : fallback);
const num = (v: string) => Number(String(v).replace(/[^0-9.]/g, '')) || 0;

type CartLine = { productId: string; qty: string; uomId: string; unitPrice: string; discount: string };

/** Unit price for a UoM: product retailPrice (per base unit) × factor. */
function defaultPrice(p: ProductView | undefined, uomId: string): string {
  if (!p || p.retailPrice == null) return '';
  const f = uomId ? (p.conversions.find((c) => c.uomId === uomId)?.factorToBase ?? 1) : 1;
  return String(Math.round(p.retailPrice * f * 100) / 100);
}

/** M13 — Inventory ▸ Retail sales: POS-lite cart → bill (Payment) → tender → receipt; list + detail (void / return). */
export function RetailSalesPage() {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const canSell = hasPermission('finance:manage');
  const { data: branches } = useBranches();

  const [status, setStatus] = useState<RetailSaleStatusValue | ''>('');
  const [q, setQ] = useState('');
  const [branchId, setBranchId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [detailId, setDetailId] = useState<string | null>(null);

  const filters = { branchId: branchId || undefined, status: status || undefined, q: q.trim() || undefined };
  const { data, isLoading } = useRetailSales({ ...filters, page, pageSize });
  const pending = useRetailSales({ ...filters, status: 'PENDING_PAYMENT', page: 1, pageSize: 1 });
  const paid = useRetailSales({ ...filters, status: 'PAID', page: 1, pageSize: 100 });
  const paidTotal = (paid.data?.items ?? []).reduce((s, r) => s + r.billTotal, 0);

  const columns = useMemo<ColumnDef<RetailSaleView, unknown>[]>(
    () => [
      {
        header: t('inventory.retail.number'),
        accessorKey: 'saleNumber',
        cell: ({ row }) => (
          <div>
            <span className="font-medium tabular-nums">{row.original.saleNumber}</span>
            {row.original.invoiceNo ? <p className="font-mono text-2xs text-muted-foreground">{row.original.invoiceNo}</p> : null}
          </div>
        ),
      },
      { header: t('inventory.col.branch'), accessorKey: 'branchName' },
      {
        header: t('inventory.retail.customer'),
        accessorKey: 'customerName',
        cell: ({ getValue }) => (getValue() as string | null) ?? <span className="text-muted-foreground">{t('inventory.retail.walkIn')}</span>,
      },
      {
        header: t('inventory.po.status'),
        accessorKey: 'status',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5">
            <StatusPill status={row.original.status} variant={STATUS_VARIANT[row.original.status]} label={t(`inventory.retail.st.${row.original.status}`)} />
            {row.original.stockError ? <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-label={t('inventory.retail.stockError')} /> : null}
          </span>
        ),
      },
      { header: t('inventory.po.items'), accessorKey: 'itemCount', meta: { align: 'right' } },
      {
        header: t('inventory.retail.billTotal'),
        accessorKey: 'billTotal',
        meta: { align: 'right' },
        cell: ({ getValue }) => <CurrencyText amount={getValue() as number} className="font-medium" />,
      },
      { header: t('inventory.transfer.createdAt'), accessorKey: 'createdAt', cell: ({ getValue }) => <DateTimeText value={getValue() as string} /> },
    ],
    [t],
  );

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">{t('nav.inventory')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('inventory.retail.subtitle')}</p>
        </div>
        <InventoryTabs active="sales" />
      </StickyPageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <InventoryStatCard index={0} icon={ShoppingBag} tone="primary" label={t('inventory.retail.stat.total')} value={data?.total ?? '—'} />
        <InventoryStatCard
          index={1}
          icon={Receipt}
          tone="warning"
          label={t('inventory.retail.st.PENDING_PAYMENT')}
          value={pending.data?.total ?? '—'}
          onClick={() => {
            setStatus((s) => (s === 'PENDING_PAYMENT' ? '' : 'PENDING_PAYMENT'));
            setPage(1);
          }}
          active={status === 'PENDING_PAYMENT'}
        />
        <InventoryStatCard index={2} icon={Wallet} tone="success" label={t('inventory.retail.stat.paid')} value={<CurrencyText amount={paidTotal} />} />
      </div>

      {canSell ? (
        <CartPanel
          branches={(branches ?? []).map((b) => ({ id: b.id, name: b.name }))}
          fixedBranchId={user?.branchId ?? null}
          onCreated={(id) => setDetailId(id)}
        />
      ) : null}

      <FilterBar
        hasActiveFilters={Boolean(status) || Boolean(branchId) || Boolean(q)}
        onClear={() => {
          setStatus('');
          setBranchId('');
          setQ('');
          setPage(1);
        }}
      >
        <Input
          className="h-9 w-[220px]"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder={t('inventory.retail.search')}
          aria-label={t('inventory.retail.search')}
        />
        <Select
          className="h-9 w-[170px]"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as RetailSaleStatusValue | '');
            setPage(1);
          }}
          options={[{ value: '', label: t('inventory.transfer.allStatus') }, ...STATUSES.map((x) => ({ value: x, label: t(`inventory.retail.st.${x}`) }))]}
          aria-label={t('inventory.po.status')}
        />
        {!user?.branchId ? (
          <Select
            className="h-9 w-[170px]"
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setPage(1);
            }}
            options={[{ value: '', label: t('inventory.allBranches') }, ...(branches ?? []).map((b) => ({ value: b.id, label: b.name }))]}
            aria-label={t('inventory.col.branch')}
          />
        ) : null}
      </FilterBar>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <ShoppingBag className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{t('inventory.tab.sales')}</h2>
            <span className="text-xs text-muted-foreground">{t('inventory.showing', { shown: data?.items.length ?? 0, total: data?.total ?? 0 })}</span>
          </div>
          <InventoryExportButton<RetailSaleView>
            base="/retail-sales"
            params={filters}
            filename="retail-sales"
            columns={[
              { header: t('inventory.retail.number'), value: (r) => r.saleNumber },
              { header: t('inventory.retail.invoiceNo'), value: (r) => r.invoiceNo ?? '' },
              { header: t('inventory.col.branch'), value: (r) => r.branchName },
              { header: t('inventory.retail.customer'), value: (r) => r.customerName ?? '' },
              { header: t('inventory.po.status'), value: (r) => t(`inventory.retail.st.${r.status}`) },
              { header: t('inventory.retail.subtotal'), value: (r) => r.subtotal },
              { header: t('inventory.retail.discount'), value: (r) => r.discountTotal },
              { header: t('inventory.retail.billTotal'), value: (r) => r.billTotal },
              { header: t('inventory.retail.refunded'), value: (r) => r.refundedAmount },
              { header: t('inventory.transfer.createdAt'), value: (r) => r.createdAt },
              { header: t('inventory.retail.paidAt'), value: (r) => r.paidAt ?? '' },
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
            emptyTitle={t('inventory.retail.empty')}
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

      <SaleDetailDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ cart

function CartPanel({
  branches,
  fixedBranchId,
  onCreated,
}: {
  branches: Array<{ id: string; name: string }>;
  fixedBranchId: string | null;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateRetailSale();
  const [branchPick, setBranchPick] = useState('');
  const branchId = fixedBranchId ?? (branchPick || branches[0]?.id || '');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerQ, setCustomerQ] = useState('');
  const [notes, setNotes] = useState('');
  const { data: products } = useProducts({ branchId: branchId || undefined, isActive: 'true', page: 1, pageSize: 200 });
  const sellable = (products?.items ?? []).filter((p) => p.isSellable);
  const byId = new Map(sellable.map((p) => [p.id, p]));
  const { data: customers } = useCustomers({ q: customerQ.trim() || undefined, page: 1, pageSize: 20 });

  function addProduct(p: ProductView) {
    if (!p.isSellable) {
      toast.error(t('inventory.retail.notSellable', { name: p.name }));
      return;
    }
    setLines((prev) => {
      const i = prev.findIndex((l) => l.productId === p.id && !l.uomId);
      if (i >= 0) return prev.map((l, j) => (j === i ? { ...l, qty: String(num(l.qty) + 1) } : l));
      return [...prev, { productId: p.id, qty: '1', uomId: '', unitPrice: defaultPrice(p, ''), discount: '' }];
    });
  }

  const lineTotal = (l: CartLine) => Math.max(0, Math.round((num(l.qty) * num(l.unitPrice) - num(l.discount)) * 100) / 100);
  const total = lines.reduce((s, l) => s + lineTotal(l), 0);

  function submit() {
    const payload = lines
      .filter((l) => l.productId && num(l.qty) > 0)
      .map((l) => ({
        productId: l.productId,
        qty: num(l.qty),
        uomId: l.uomId || null,
        ...(l.unitPrice !== '' ? { unitPrice: num(l.unitPrice) } : {}),
        discount: num(l.discount),
      }));
    if (!branchId || !payload.length) {
      toast.error(t('inventory.retail.emptyCart'));
      return;
    }
    create.mutate(
      { branchId, customerId: customerId || null, notes: notes.trim() || null, lines: payload },
      {
        onSuccess: (s) => {
          toast.success(t('inventory.retail.created', { number: s.saleNumber }));
          setLines([]);
          setCustomerId('');
          setNotes('');
          onCreated(s.id);
        },
        onError: (err) => toast.error(errMsg(err, t('common.saveError'))),
      },
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm" aria-labelledby="pos-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="pos-title" className="flex items-center gap-2 text-sm font-semibold">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('inventory.retail.newSale')}
        </h2>
        {!fixedBranchId ? (
          <Select
            className="h-9 w-[190px]"
            value={branchId}
            onChange={(e) => {
              setBranchPick(e.target.value);
              setLines([]);
            }}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
            aria-label={t('inventory.col.branch')}
          />
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <ScanInput branchId={branchId || undefined} onFound={(r) => addProduct(r.product)} placeholder={t('inventory.retail.scan')} />
        <Combobox
          className="h-9"
          value=""
          onChange={(v) => {
            const p = byId.get(v);
            if (p) addProduct(p);
          }}
          placeholder={t('inventory.retail.pickProduct')}
          options={sellable.map((p) => ({
            value: p.id,
            label: p.name,
            description: `${p.sku} · ${p.stockQty} ${p.unit}${p.retailPrice != null ? ` · ₭${p.retailPrice.toLocaleString()}` : ''}`,
          }))}
          searchPlaceholder={t('inventory.transfer.searchProduct')}
          emptyText={t('inventory.retail.noSellable')}
          aria-label={t('inventory.retail.pickProduct')}
        />
      </div>

      {lines.length ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">{t('inventory.col.product')}</th>
                <th className="p-2">{t('inventory.po.qty')}</th>
                <th className="p-2">{t('inventory.col.unit')}</th>
                <th className="p-2">{t('inventory.retail.unitPrice')}</th>
                <th className="p-2">{t('inventory.retail.discount')}</th>
                <th className="p-2 text-right">{t('inventory.po.lineTotal')}</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const p = byId.get(l.productId);
                const set = (patch: Partial<CartLine>) => setLines((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2">
                      {p?.name ?? '—'}
                      <div className="text-2xs text-muted-foreground">
                        {p?.sku} · {t('inventory.retail.inStock', { qty: p?.stockQty ?? 0, unit: p?.unit ?? '' })}
                      </div>
                    </td>
                    <td className="p-2">
                      <Input className="h-8 w-20 tabular-nums" type="number" min="0" step="0.001" value={l.qty} onChange={(e) => set({ qty: e.target.value })} aria-label={t('inventory.po.qty')} />
                    </td>
                    <td className="p-2">
                      <Select
                        className="h-8 w-[110px]"
                        value={l.uomId}
                        onChange={(e) => set({ uomId: e.target.value, unitPrice: defaultPrice(p, e.target.value) })}
                        options={[
                          { value: '', label: p?.unit ?? '—' },
                          ...(p?.conversions ?? []).map((c) => ({ value: c.uomId, label: `${c.nameLo ?? c.name} (×${c.factorToBase})` })),
                        ]}
                        aria-label={t('inventory.col.unit')}
                      />
                    </td>
                    <td className="p-2">
                      <Input className="h-8 w-28 tabular-nums" type="number" min="0" step="0.01" value={l.unitPrice} onChange={(e) => set({ unitPrice: e.target.value })} aria-label={t('inventory.retail.unitPrice')} />
                    </td>
                    <td className="p-2">
                      <Input className="h-8 w-24 tabular-nums" type="number" min="0" step="0.01" value={l.discount} onChange={(e) => set({ discount: e.target.value })} aria-label={t('inventory.retail.discount')} />
                    </td>
                    <td className="p-2 text-right">
                      <CurrencyText amount={lineTotal(l)} />
                    </td>
                    <td className="p-2">
                      <Button type="button" variant="ghost" size="icon" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))} aria-label={t('common.delete')}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">{t('inventory.retail.cartHint')}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="pos-cust-q">{t('inventory.retail.customer')}</Label>
          <Input id="pos-cust-q" className="h-9" value={customerQ} onChange={(e) => setCustomerQ(e.target.value)} placeholder={t('inventory.retail.customerSearch')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pos-cust">&nbsp;</Label>
          <Select
            id="pos-cust"
            className="h-9"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            options={[{ value: '', label: t('inventory.retail.walkIn') }, ...(customers?.items ?? []).map((c) => ({ value: c.id, label: `${c.name} · ${c.phone}` }))]}
            aria-label={t('inventory.retail.customer')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pos-notes">{t('inventory.grn.notes')}</Label>
          <Input id="pos-notes" className="h-9" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="text-sm text-muted-foreground">
          {t('inventory.retail.total')} <CurrencyText amount={total} className="text-base font-semibold text-foreground" />
          <span className="ml-2 text-2xs">{t('inventory.retail.vatHint')}</span>
        </p>
        <Button type="button" onClick={submit} disabled={create.isPending || !lines.length}>
          <Receipt className="mr-1 h-4 w-4" />
          {create.isPending ? t('common.saving') : t('inventory.retail.checkout')}
        </Button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ detail

function SaleDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canSell = hasPermission('finance:manage');
  const canRefund = hasPermission('payments:refund');
  const { data: s } = useRetailSale(id);
  const { data: payment } = usePayment(s?.paymentId ?? null);
  const act = useRetailSaleAction();
  const confirm = useConfirm();
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);

  async function voidSale() {
    if (!s) return;
    const ok = await confirm({ title: t('inventory.retail.voidConfirm') });
    if (!ok) return;
    act.mutate(
      { id: s.id, action: 'void', reason: t('inventory.retail.voidReason') },
      { onSuccess: () => toast.success(t('inventory.retail.voided')), onError: (e) => toast.error(errMsg(e, t('common.saveError'))) },
    );
  }

  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 py-4 pr-12">
          <DialogTitle>{s?.saleNumber ?? t('inventory.retail.detail')}</DialogTitle>
          <DialogDescription>{s ? `${s.branchName} · ${s.customerName ?? t('inventory.retail.walkIn')}${s.invoiceNo ? ` · ${s.invoiceNo}` : ''}` : ''}</DialogDescription>
        </DialogHeader>
        {!s ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="max-h-[calc(100vh-10rem)] space-y-4 overflow-y-auto px-6 py-5">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusPill status={s.status} variant={STATUS_VARIANT[s.status]} label={t(`inventory.retail.st.${s.status}`)} />
              {s.stockPostedAt ? <span className="text-xs text-muted-foreground">{t('inventory.retail.stockPosted')}</span> : null}
            </div>
            {s.stockError ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('inventory.retail.stockError')}: {s.stockError}
                </span>
                {canSell ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={act.isPending}
                    onClick={() =>
                      act.mutate(
                        { id: s.id, action: 'post-stock' },
                        { onSuccess: () => toast.success(t('inventory.retail.stockPosted')), onError: (e) => toast.error(errMsg(e, t('common.saveError'))) },
                      )
                    }
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    {t('inventory.retail.retryStock')}
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">{t('inventory.col.product')}</th>
                    <th className="p-2 text-right">{t('inventory.po.qty')}</th>
                    <th className="p-2 text-right">{t('inventory.retail.unitPrice')}</th>
                    <th className="p-2 text-right">{t('inventory.retail.discount')}</th>
                    <th className="p-2 text-right">{t('inventory.po.lineTotal')}</th>
                    <th className="p-2 text-right">{t('inventory.retail.cogs')}</th>
                    <th className="p-2 text-right">{t('inventory.retail.returned')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(s.lines ?? []).map((l) => (
                    <tr key={l.id} className="border-t border-border">
                      <td className="p-2">
                        {l.productName} <span className="text-xs text-muted-foreground">{l.sku}</span>
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {l.uomQty.toLocaleString()} {l.uomCode ?? l.unit}
                        {l.uomCode ? <div className="text-2xs text-muted-foreground">= {l.qty} {l.unit}</div> : null}
                      </td>
                      <td className="p-2 text-right"><CurrencyText amount={l.unitPrice} /></td>
                      <td className="p-2 text-right">{l.discount ? <CurrencyText amount={l.discount} /> : '—'}</td>
                      <td className="p-2 text-right"><CurrencyText amount={l.lineTotal} /></td>
                      <td className="p-2 text-right">{l.cogs != null ? <CurrencyText amount={l.cogs} /> : '—'}</td>
                      <td className="p-2 text-right tabular-nums">{l.qtyReturned ? `${l.qtyReturned} ${l.unit}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
              <span className="text-muted-foreground">{t('inventory.retail.subtotal')} <CurrencyText amount={s.subtotal} /></span>
              {s.discountTotal ? <span className="text-muted-foreground">{t('inventory.retail.discount')} −<CurrencyText amount={s.discountTotal} /></span> : null}
              {s.taxAmount != null ? <span className="text-muted-foreground">VAT <CurrencyText amount={s.taxAmount} /></span> : null}
              <span className="font-semibold">{t('inventory.retail.billTotal')} <CurrencyText amount={s.billTotal} /></span>
            </div>

            {payment && canSell && s.status === 'PENDING_PAYMENT' && payment.balanceAmount > 0 ? (
              <RecordPaymentPanel key={payment.id} payment={payment} />
            ) : null}
            {payment && s.status !== 'VOIDED' ? <RefundPanel key={`r-${payment.id}`} payment={payment} /> : null}

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              {canSell && s.status === 'PENDING_PAYMENT' && s.paidAmount === 0 ? (
                <Button variant="ghost" disabled={act.isPending} onClick={() => void voidSale()}>
                  <Ban className="mr-1 h-4 w-4" />
                  {t('inventory.retail.void')}
                </Button>
              ) : null}
              {canRefund && s.status === 'PAID' && (s.lines ?? []).some((l) => l.qtyReturnable > 0) ? (
                <Button variant="secondary" onClick={() => setReturning(true)}>
                  <RotateCcw className="mr-1 h-4 w-4" />
                  {t('inventory.retail.returnItems')}
                </Button>
              ) : null}
              <Button variant="secondary" disabled={!s.invoiceNo} onClick={() => setReceiptId(s.paymentId)}>
                <Printer className="mr-1 h-4 w-4" />
                {t('inventory.retail.receipt')}
              </Button>
            </div>
          </div>
        )}
        <ReceiptDialog paymentId={receiptId} onClose={() => setReceiptId(null)} />
        {s && returning ? <ReturnDialog sale={s} onClose={() => setReturning(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({ sale, onClose }: { sale: RetailSaleView; onClose: () => void }) {
  const { t } = useTranslation();
  const ret = useRetailReturn(sale.id);
  const lines = (sale.lines ?? []).filter((l) => l.qtyReturnable > 0);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<'ORIGINAL_TENDER' | 'CASH' | 'BANK_TRANSFER'>('ORIGINAL_TENDER');
  const estimate = lines.reduce((s, l) => s + (num(qty[l.id] ?? '') * l.lineTotal) / l.qty, 0);

  function submit() {
    const payload = lines
      .filter((l) => num(qty[l.id] ?? '') > 0)
      .map((l) => ({ saleLineId: l.id, qty: num(qty[l.id] ?? ''), restock: restock[l.id] ?? true }));
    if (!payload.length || reason.trim().length < 3) {
      toast.error(t('inventory.retail.returnIncomplete'));
      return;
    }
    ret.mutate(
      { reason: reason.trim(), method, lines: payload },
      {
        onSuccess: () => {
          toast.success(t('inventory.retail.returnRequested'));
          onClose();
        },
        onError: (e) => toast.error(errMsg(e, t('common.saveError'))),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('inventory.retail.returnItems')}</DialogTitle>
          <DialogDescription>{t('inventory.retail.returnHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {lines.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm">
              <span className="min-w-[160px] flex-1">
                {l.productName}
                <span className="block text-2xs text-muted-foreground">{t('inventory.retail.returnable', { qty: l.qtyReturnable, unit: l.unit })}</span>
              </span>
              <Input
                className="h-8 w-24 tabular-nums"
                type="number"
                min="0"
                max={l.qtyReturnable}
                step="0.001"
                value={qty[l.id] ?? ''}
                onChange={(e) => setQty((p) => ({ ...p, [l.id]: e.target.value }))}
                aria-label={t('inventory.po.qty')}
              />
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox checked={restock[l.id] ?? true} onChange={(e) => setRestock((p) => ({ ...p, [l.id]: e.target.checked }))} />
                {t('inventory.retail.restock')}
              </label>
            </div>
          ))}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ret-reason">{t('inventory.rts.reason')}</Label>
              <Input id="ret-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ret-method">{t('inventory.retail.refundMethod')}</Label>
              <Select
                id="ret-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
                options={(['ORIGINAL_TENDER', 'CASH', 'BANK_TRANSFER'] as const).map((m) => ({ value: m, label: t(`finance.refund.method.${m}`) }))}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('inventory.retail.returnEstimate')} <CurrencyText amount={estimate} className="font-semibold text-foreground" />
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} disabled={ret.isPending}>
            {ret.isPending ? t('common.saving') : t('inventory.retail.requestReturn')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
