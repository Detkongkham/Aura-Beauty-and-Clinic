import { type ReactNode, useMemo, useState, type FormEvent } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  ArrowUpDown,
  Barcode,
  Boxes,
  FolderTree,
  Hash,
  type LucideIcon,
  MessageSquare,
  Minus,
  Package,
  PackagePlus,
  PackageX,
  Pencil,
  Plus,
  Receipt,
  Ruler,
  ShieldAlert,
  Store,
  Tag,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  productCreateSchema,
  STOCK_ADJUST_REASONS,
  STOCK_ADJUST_REASONS_REQUIRING_NOTES,
  type ProductCreateInput,
  type ProductView,
  type StockAdjustReasonValue,
  type StockLotView,
} from '@abcp/shared-types';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { CurrencyText, DataTable, FilterBar, Pagination, StatusPill } from '@/components/shared';
import { dayjs } from '@/lib/format';
import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches, useSaveBranch } from '@/features/branches/branches.api';
import { NormalizedApiError } from '@/services/apiError';

import { AdjustApprovalsCard } from './AdjustApprovalsCard';
import { AssignUnlottedDialog } from './AssignUnlottedDialog';
import { InventoryExportButton } from './InventoryExportButton';
import { InventoryStatCard } from './InventoryStatCard';
import { InventoryTabs } from './InventoryTabs';
import { ProductDetailSheet } from './ProductDetailSheet';
import { LotFields } from './LotFields';
import { EMPTY_LOT, lotPayload, type LotDraft } from './lotDraft';
import { LotExpiryWatchCard } from './LotExpiryWatchCard';
import { LotUsageDialog } from './LotUsageDialog';
import { StockHealthBar } from './StockHealthBar';
import { ProductCategoriesDialog } from './ProductCategoriesDialog';
import { ScanInput } from './ScanInput';
import { UomConversionsEditor } from './UomConversionsEditor';
import { conversionsPayload, type ConversionDraft } from './uom';
import { UomManagerDialog } from './UomManagerDialog';
import {
  useProductCategories,
  useUoms,
  useAdjustSettings,
  useAdjustStock,
  useCogsSummary,
  useInventoryStats,
  useProducts,
  useSaveProduct,
  useStockLots,
  type ProductFilters,
} from './inventory.api';

// C5 — ໜ້າຕ່າງ "ໃກ້ໝົດອາຍຸ" ຕ້ອງກົງກັບ LOT_EXPIRY_WARN_DAYS ຂອງ backend (job ແຈ້ງເຕືອນ).
const LOT_WATCH_DAYS = 60;

// C4 — ຄິດໄລ່ຂອບເຂດເດືອນນີ້ ໜຶ່ງຄັ້ງຕໍ່ mount (ບໍ່ໃຫ້ query key ປ່ຽນທຸກ render ຍ້ອນ `dayjs()` ໃໝ່).
const MONTH_START = dayjs().startOf('month').toISOString();
const MONTH_END = dayjs().endOf('month').toISOString();

export function InventoryPage() {
  const { t } = useTranslation();
  const { hasPermission, role } = useAuth();
  const canManage = hasPermission('inventory:manage');
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const { data: branches } = useBranches();

  const [branchId, setBranchId] = useState('');
  const [q, setQ] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editing, setEditing] = useState<ProductView | null>(null);
  const [creating, setCreating] = useState(false);
  const [adjustFor, setAdjustFor] = useState<ProductView | null>(null);
  const [lotUsageId, setLotUsageId] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<ProductView | null>(null);
  const [detailFor, setDetailFor] = useState<ProductView | null>(null);
  // 9C — M3 ໝວດ + M1 ໜ່ວຍ (dialog ຈັດການ)
  const [categoryId, setCategoryId] = useState('');
  const [uomOpen, setUomOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const { data: categories } = useProductCategories(branchId || undefined);

  const filters: ProductFilters = {
    q: q || undefined,
    branchId: branchId || undefined,
    lowStock: lowOnly ? 'true' : undefined,
    categoryId: categoryId || undefined,
    page,
    pageSize,
  };
  const { data, isLoading } = useProducts(filters);
  const { data: stats, isLoading: statsLoading } = useInventoryStats(branchId || undefined, categoryId || undefined);
  // C5 — lot ທີ່ໃກ້/ໝົດອາຍຸແລ້ວ (ຮວມ lot ທີ່ໝົດອາຍຸແລ້ວແຕ່ຍັງມີສະຕັອກ).
  const { data: expiring, isLoading: expiringLoading } = useStockLots({
    branchId: branchId || undefined,
    expiringWithinDays: LOT_WATCH_DAYS,
    page: 1,
    pageSize: 12,
  });
  // C4 — ຕົ້ນທຶນສິນຄ້າທີ່ໃຊ້ໄປ (COGS) ຂອງເດືອນນີ້, ຕໍ່ສາຂາທີ່ເລືອກ.
  const { data: cogs, isLoading: cogsLoading } = useCogsSummary({
    branchId: branchId || undefined,
    from: MONTH_START,
    to: MONTH_END,
  });

  // Inventory audit C2 — ອະນຸຍາດໃຫ້ BOM ຕັດສະຕັອກຕິດລົບໄດ້ (backflush exception) ຕໍ່ສາຂາ.
  const selectedBranch = branches?.find((b) => b.id === branchId) ?? null;
  const saveBranch = useSaveBranch(branchId || undefined);

  const columns = useMemo<ColumnDef<ProductView, unknown>[]>(
    () => [
      {
        header: t('inventory.col.product'),
        accessorKey: 'name',
        cell: ({ row }) => (
          <div>
            <div className="flex items-center gap-1.5 font-medium">
              {row.original.name}
              {!row.original.isActive ? (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                  {t('inventory.inactiveTag')}
                </span>
              ) : null}
              {row.original.trackLot ? (
                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-2xs font-medium text-primary">
                  {t('inventory.lot.tag')}
                </span>
              ) : null}
              {row.original.trackLot && row.original.unlottedQty > 0 ? (
                canManage ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssignFor(row.original);
                    }}
                    title={t('inventory.unlotted.assignHint')}
                    className="rounded-full bg-warning-soft px-1.5 py-0.5 text-2xs font-medium tabular-nums text-warning transition-colors hover:bg-warning/20"
                  >
                    {t('inventory.unlotted.chip', { qty: row.original.unlottedQty.toLocaleString() })}
                  </button>
                ) : (
                  <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-2xs font-medium tabular-nums text-warning">
                    {t('inventory.unlotted.chip', { qty: row.original.unlottedQty.toLocaleString() })}
                  </span>
                )
              ) : null}
              {row.original.abcClass ? (
                <StatusPill
                  status={`abc-${row.original.abcClass}`}
                  variant={row.original.abcClass === 'A' ? 'primary' : row.original.abcClass === 'B' ? 'info' : 'neutral'}
                  label={t('inventory.abc.pill', { cls: row.original.abcClass })}
                />
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground tabular-nums">
              <span>{row.original.sku}</span>
              {row.original.gtin || row.original.barcode ? (
                <span className="inline-flex items-center gap-1 font-mono">
                  <Barcode className="h-3 w-3" aria-hidden="true" />
                  {row.original.gtin ?? row.original.barcode}
                </span>
              ) : null}
              {row.original.categoryName ? (
                <span className="inline-flex items-center gap-1">
                  <FolderTree className="h-3 w-3" aria-hidden="true" />
                  {row.original.categoryName}
                </span>
              ) : null}
            </div>
          </div>
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
        header: t('inventory.col.stock'),
        accessorKey: 'stockQty',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const p = row.original;
          const tone: 'danger' | 'warning' | 'success' =
            p.stockQty < 0 || p.outOfStock ? 'danger' : p.lowStock ? 'warning' : 'success';
          // Bar fills relative to 2x the reorder point so "healthy" stock reads as roughly half-full,
          // not maxed out — min itself lands at the halfway mark, matching the low-stock threshold.
          const ratioBase = p.minStockQty > 0 ? p.minStockQty * 2 : Math.max(p.stockQty, 1);
          const ratio = Math.max(0, Math.min(1, p.stockQty / ratioBase));
          return (
            <div className="inline-flex w-full flex-col items-end gap-1">
              <span className="inline-flex items-center gap-2 tabular-nums">
                {p.stockQty.toLocaleString()} {p.unit}
                {p.stockQty < 0 ? (
                  <StatusPill status="negative" variant="danger" label={t('inventory.badge.negative')} />
                ) : p.outOfStock ? (
                  <StatusPill status="out" variant="danger" label={t('inventory.badge.out')} />
                ) : p.lowStock ? (
                  <StatusPill status="low" variant="warning" label={t('inventory.badge.low')} />
                ) : null}
              </span>
              <span className="h-1 w-20 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span
                  className={cn(
                    'block h-full rounded-full transition-[width] duration-500 ease-out',
                    tone === 'danger' && 'bg-destructive',
                    tone === 'warning' && 'bg-warning',
                    tone === 'success' && 'bg-success',
                  )}
                  style={{ width: `${ratio * 100}%` }}
                />
              </span>
              {p.reservedQty > 0 || p.onOrderQty > 0 ? (
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {t('inventory.reserve.inline', { reserved: p.reservedQty, available: p.availableQty, onOrder: p.onOrderQty })}
                </span>
              ) : null}
              {p.shortForUpcoming ? (
                <StatusPill status="short" variant="danger" label={t('inventory.reserve.short')} />
              ) : null}
            </div>
          );
        },
      },
      {
        header: t('inventory.col.min'),
        accessorKey: 'minStockQty',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="inline-flex flex-col items-end tabular-nums text-muted-foreground">
            {row.original.minStockQty.toLocaleString()}
            {row.original.reorderThreshold > row.original.minStockQty ? (
              <span className="text-[11px]" title={t('inventory.reorder.ropHint')}>
                {t('inventory.reorder.rop', { value: row.original.reorderThreshold })}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        header: t('inventory.col.cost'),
        accessorKey: 'costPrice',
        meta: { align: 'right' },
        cell: ({ getValue }) => <CurrencyText amount={getValue() as number} />,
      },
      {
        header: t('inventory.col.value'),
        accessorKey: 'stockValue',
        meta: { align: 'right' },
        cell: ({ getValue }) => <CurrencyText amount={getValue() as number} className="font-medium" />,
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) =>
          canManage ? (
            <div className="flex justify-end gap-1">
              <Button
                variant="secondary"
                size="sm"
                className="h-7 gap-1 px-2 text-xs border-primary/25 bg-primary/5 text-primary hover:border-primary/40 hover:bg-primary/10"
                onClick={(e) => {
                  e.stopPropagation();
                  setAdjustFor(row.original);
                }}
              >
                <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                {t('inventory.adjust')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(row.original);
                }}
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
                {t('common.edit')}
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, canManage],
  );

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
              {t('nav.inventory')}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('inventory.subtitle')}</p>
          </div>
          {canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t('inventory.newProduct')}
            </Button>
          ) : null}
        </div>
        <InventoryTabs active="products" />
      </StickyPageHeader>

      {statsLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[62px] w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <InventoryStatCard
            index={0}
            icon={Boxes}
            tone="primary"
            label={t('inventory.stat.products')}
            value={stats?.totalProducts ?? '—'}
            hint={t('inventory.stat.activeHint', { count: stats?.activeProducts ?? 0 })}
          />
          <InventoryStatCard
            index={1}
            icon={AlertTriangle}
            tone="warning"
            label={t('inventory.stat.low')}
            value={stats?.lowStockCount ?? '—'}
            hint={t('inventory.stat.lowHint')}
            onClick={() => {
              setLowOnly((v) => !v);
              setPage(1);
            }}
            active={lowOnly}
          />
          <InventoryStatCard
            index={2}
            icon={PackageX}
            tone="danger"
            label={t('inventory.stat.out')}
            value={stats?.outOfStockCount ?? '—'}
            hint={
              stats?.shortForUpcomingCount
                ? t('inventory.reserve.shortHint', { count: stats.shortForUpcomingCount })
                : t('inventory.stat.outHint')
            }
          />
          <InventoryStatCard
            index={3}
            icon={Wallet}
            tone="success"
            label={t('inventory.stat.value')}
            value={<CurrencyText amount={stats?.totalStockValue ?? 0} />}
            hint={t('inventory.stat.openPoHint', { count: stats?.openPurchaseOrders ?? 0 })}
          />
          <InventoryStatCard
            index={4}
            icon={Receipt}
            tone="neutral"
            label={t('inventory.stat.cogs')}
            value={cogsLoading ? '—' : <CurrencyText amount={cogs?.totalCogs ?? 0} />}
            hint={t('inventory.stat.cogsHint')}
          />
        </div>
      )}

      <StockHealthBar
        loading={statsLoading}
        healthy={Math.max(
          0,
          (stats?.totalProducts ?? 0) - (stats?.lowStockCount ?? 0) - (stats?.outOfStockCount ?? 0),
        )}
        low={stats?.lowStockCount ?? 0}
        out={stats?.outOfStockCount ?? 0}
      />

      <LotExpiryWatchCard
        loading={expiringLoading}
        lots={expiring?.items ?? []}
        total={expiring?.total ?? 0}
        days={LOT_WATCH_DAYS}
        onSelect={(l) => setLotUsageId(l.id)}
      />

      {canManage ? <AdjustApprovalsCard branchId={branchId || undefined} canApprove={isSuperAdmin} /> : null}

      {selectedBranch ? (
        <div
          className={cn(
            'flex items-center justify-between gap-3 rounded-lg border px-4 py-3 shadow-sm transition-colors duration-200',
            'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
            selectedBranch.allowNegativeStock
              ? 'border-warning/40 bg-warning-soft/60'
              : 'border-border bg-card',
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                selectedBranch.allowNegativeStock
                  ? 'bg-warning-soft text-warning'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium text-foreground">{t('inventory.allowNegative.title')}</p>
              <p className="text-xs text-muted-foreground">{t('inventory.allowNegative.hint')}</p>
            </div>
          </div>
          <Switch
            checked={selectedBranch.allowNegativeStock}
            disabled={!canManage || saveBranch.isPending}
            onCheckedChange={(v) =>
              saveBranch.mutate(
                { allowNegativeStock: v },
                {
                  onSuccess: () => toast.success(t('common.saved')),
                  onError: (err) =>
                    toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
                },
              )
            }
            aria-label={t('inventory.allowNegative.title')}
            className="shrink-0"
          />
        </div>
      ) : null}

      <FilterBar
        search={q}
        onSearchChange={(v) => {
          setQ(v);
          setPage(1);
        }}
        searchPlaceholder={t('inventory.searchPlaceholder')}
        hasActiveFilters={Boolean(branchId) || lowOnly || Boolean(categoryId)}
        onClear={() => {
          setBranchId('');
          setQ('');
          setLowOnly(false);
          setCategoryId('');
          setPage(1);
        }}
      >
        <ScanInput
          className="w-[190px]"
          branchId={branchId || undefined}
          onFound={(r) => setDetailFor(r.product)}
        />
        <Select
          className="h-9 w-[170px]"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(1);
          }}
          options={[
            { value: '', label: t('inventory.category.all') },
            ...(categories ?? []).map((c) => ({ value: c.id, label: c.parentId ? `↳ ${c.name}` : c.name })),
          ]}
          aria-label={t('inventory.category.label')}
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
        <label className="flex h-9 items-center gap-2 rounded-sm border border-input px-3 text-sm">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => {
              setLowOnly(e.target.checked);
              setPage(1);
            }}
          />
          {t('inventory.lowStockOnly')}
        </label>
      </FilterBar>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Boxes className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{t('inventory.tab.products')}</h2>
            <span className="text-xs text-muted-foreground">
              {t('inventory.showing', { shown: data?.items.length ?? 0, total: data?.total ?? 0 })}
            </span>
          </div>
          {canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" className="h-8 gap-1" onClick={() => setUomOpen(true)}>
                <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
                {t('inventory.uom.manage')}
              </Button>
              <Button variant="secondary" size="sm" className="h-8 gap-1" onClick={() => setCatOpen(true)}>
                <FolderTree className="h-3.5 w-3.5" aria-hidden="true" />
                {t('inventory.category.manage')}
              </Button>
              <InventoryExportButton<StockLotView>
                base="/stock-lots"
                params={{ branchId: branchId || undefined }}
                filename="stock-lots"
                label={t('inventory.export.lots')}
                columns={[
                  { header: t('inventory.col.product'), value: (l) => l.productName },
                  { header: t('inventory.col.sku'), value: (l) => l.sku },
                  { header: t('inventory.col.branch'), value: (l) => l.branchName },
                  { header: t('inventory.lot.number'), value: (l) => l.lotNumber },
                  { header: t('inventory.lot.expiry'), value: (l) => l.expiryDate ?? '' },
                  { header: t('inventory.lot.mfg'), value: (l) => l.mfgDate ?? '' },
                  { header: t('inventory.lot.qtyOnHand'), value: (l) => l.qtyOnHand },
                  { header: t('inventory.col.unit'), value: (l) => l.unit },
                  { header: t('inventory.ledger.unitCost'), value: (l) => l.unitCost },
                  { header: t('inventory.lot.daysLeft'), value: (l) => l.daysLeft ?? '' },
                  { header: t('inventory.export.status'), value: (l) => t(`inventory.lotStatus.${l.status}`) },
                ]}
              />
              <InventoryExportButton<ProductView>
                base="/products"
                params={{
                  q: q || undefined,
                  branchId: branchId || undefined,
                  lowStock: lowOnly ? 'true' : undefined,
                  categoryId: categoryId || undefined,
                }}
                filename="products"
                columns={[
                  { header: t('inventory.col.product'), value: (p) => p.name },
                  { header: t('inventory.col.sku'), value: (p) => p.sku },
                  { header: 'GTIN', value: (p) => p.gtin ?? '' },
                  { header: 'Barcode', value: (p) => p.barcode ?? '' },
                  { header: t('inventory.category.label'), value: (p) => p.categoryName ?? '' },
                  { header: 'ABC', value: (p) => p.abcClass ?? '' },
                  { header: t('inventory.col.branch'), value: (p) => p.branchName },
                  { header: t('inventory.col.unit'), value: (p) => p.unit },
                  { header: t('inventory.col.stock'), value: (p) => p.stockQty },
                  { header: t('inventory.col.min'), value: (p) => p.minStockQty },
                  { header: t('inventory.reserve.reserved'), value: (p) => p.reservedQty },
                  { header: t('inventory.reserve.available'), value: (p) => p.availableQty },
                  { header: t('inventory.reserve.onOrder'), value: (p) => p.onOrderQty },
                  { header: t('inventory.reorder.threshold'), value: (p) => p.reorderThreshold },
                  { header: t('inventory.col.cost'), value: (p) => p.costPrice },
                  { header: t('inventory.col.value'), value: (p) => p.stockValue },
                  { header: t('inventory.lot.tag'), value: (p) => (p.trackLot ? 'Y' : '') },
                  { header: t('inventory.detail.unlotted'), value: (p) => (p.trackLot ? p.unlottedQty : '') },
                  { header: t('inventory.export.active'), value: (p) => (p.isActive ? 'Y' : 'N') },
                ]}
              />
            </div>
          ) : null}
        </div>
        <div className="p-2 sm:p-3">
          <DataTable
            columns={columns}
            data={data?.items ?? []}
            loading={isLoading}
            getRowId={(r) => r.id}
            onRowClick={(r) => setDetailFor(r)}
            emptyTitle={t('inventory.empty')}
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

      <ProductDialog
        open={creating || Boolean(editing)}
        product={editing}
        branches={(branches ?? []).map((b) => ({ id: b.id, name: b.name }))}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
      <AdjustDialog
        product={adjustFor}
        branches={branches ?? []}
        isSuperAdmin={isSuperAdmin}
        onClose={() => setAdjustFor(null)}
      />
      <AssignUnlottedDialog product={assignFor} onClose={() => setAssignFor(null)} />
      <UomManagerDialog open={uomOpen} onClose={() => setUomOpen(false)} canEdit={isSuperAdmin} />
      <ProductCategoriesDialog
        open={catOpen}
        onClose={() => setCatOpen(false)}
        isSuperAdmin={isSuperAdmin}
        branchId={branchId || undefined}
      />
      <LotUsageDialog lotId={lotUsageId} onClose={() => setLotUsageId(null)} />
      <ProductDetailSheet
        product={detailFor}
        onClose={() => setDetailFor(null)}
        onLotUsage={(id) => setLotUsageId(id)}
      />
    </div>
  );
}

function ProductDialog({
  open,
  product,
  branches,
  onClose,
}: {
  open: boolean;
  product: ProductView | null;
  branches: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveProduct();
  const isEdit = Boolean(product);
  // C5 — ເລກ lot ຂອງຍອດເປີດ (ໃຊ້ສະເພາະຕອນສ້າງໃໝ່ + trackLot + openingStock > 0)
  const [openingLot, setOpeningLot] = useState<LotDraft>(EMPTY_LOT);
  // 9C — M1 ອັດຕາແປງ (state ແຍກຈາກ form ຄື openingLot) + ລາຍການໜ່ວຍ/ໝວດ
  const { data: uoms } = useUoms();
  const { data: categories } = useProductCategories();
  const [convs, setConvs] = useState<ConversionDraft[]>([]);
  const [convsFor, setConvsFor] = useState<string | null | undefined>(undefined);
  const key = open ? (product?.id ?? 'new') : null;
  if (key !== convsFor) {
    setConvsFor(key);
    setConvs(
      (product?.conversions ?? []).map((c) => ({
        uomId: c.uomId,
        factorToBase: String(c.factorToBase),
        isPurchaseDefault: c.isPurchaseDefault,
        isConsumeDefault: c.isConsumeDefault,
      })),
    );
  }
  const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

  const form = useForm<ProductCreateInput>({
    resolver: zodResolver(productCreateSchema),
    values: {
      branchId: product?.branchId ?? branches[0]?.id ?? '',
      name: product?.name ?? '',
      sku: product?.sku ?? '',
      unit: product?.unit ?? '',
      baseUomId: product?.baseUomId ?? null,
      gtin: product?.gtin ?? null,
      barcode: product?.barcode ?? null,
      categoryId: product?.categoryId ?? null,
      costPrice: product?.costPrice ?? 0,
      openingStock: 0,
      minStockQty: product?.minStockQty ?? 5,
      isActive: product?.isActive ?? true,
      trackLot: product?.trackLot ?? false,
      isSellable: product?.isSellable ?? false,
      retailPrice: product?.retailPrice ?? null,
    },
  });

  function submit(values: ProductCreateInput) {
    const needsOpeningLot = !isEdit && values.trackLot && values.openingStock > 0;
    if (needsOpeningLot && !openingLot.lotNumber.trim()) {
      toast.error(t('inventory.lot.openingRequired'));
      return;
    }
    if (!values.unit && !values.baseUomId) {
      toast.error(t('inventory.uom.baseRequired'));
      return;
    }
    const conversions = conversionsPayload(convs);
    const unit = values.unit || undefined;
    const payload = isEdit
      ? {
          name: values.name,
          sku: values.sku,
          unit,
          ...(values.baseUomId && values.baseUomId !== product?.baseUomId ? { baseUomId: values.baseUomId } : {}),
          gtin: values.gtin ?? null,
          barcode: values.barcode ?? null,
          categoryId: values.categoryId ?? null,
          conversions,
          costPrice: values.costPrice,
          minStockQty: values.minStockQty,
          isActive: values.isActive,
          trackLot: values.trackLot,
          isSellable: values.isSellable,
          retailPrice: values.retailPrice ?? null,
        }
      : { ...values, unit, conversions, openingLot: needsOpeningLot ? lotPayload(openingLot) : undefined };
    save.mutate(
      { id: product?.id, input: payload },
      {
        onSuccess: () => {
          toast.success(t('common.saved'));
          onClose();
        },
        onError: (err) =>
          toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
      },
    );
  }

  const isActive = form.watch('isActive');
  const trackLot = form.watch('trackLot');
  const isSellable = form.watch('isSellable');
  const baseUomId = form.watch('baseUomId') ?? '';
  const unitText = form.watch('unit');
  const baseUom = (uoms ?? []).find((u) => u.id === baseUomId);
  const baseLabel = unitText || baseUom?.nameLo || baseUom?.name || '';
  const openingStock = form.watch('openingStock');
  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-start gap-3 border-b border-border px-6 py-4 pr-12">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <Package className="h-[18px] w-[18px]" />
          </span>
          <div className="space-y-0.5">
            <DialogTitle>{isEdit ? t('inventory.editProduct') : t('inventory.newProduct')}</DialogTitle>
            <DialogDescription>
              {isEdit ? t('inventory.form.subtitleEdit') : t('inventory.form.subtitleNew')}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(submit)}
          noValidate
          className="flex max-h-[calc(100vh-13rem)] flex-col"
        >
          <div className="flex-1 space-y-7 overflow-y-auto px-6 py-5">
            {/* Basic details */}
            <section className="space-y-4">
              <SectionLabel>{t('inventory.form.sectionBasic')}</SectionLabel>

              <Field htmlFor="p-name" label={t('inventory.col.product')} icon={Tag} error={errors.name?.message}>
                <Input id="p-name" {...form.register('name')} aria-invalid={Boolean(errors.name)} />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field htmlFor="p-sku" label="SKU" icon={Hash} error={errors.sku?.message}>
                  <Input id="p-sku" {...form.register('sku')} aria-invalid={Boolean(errors.sku)} />
                </Field>
                <Field htmlFor="p-cat" label={t('inventory.category.label')} icon={FolderTree}>
                  <Select
                    id="p-cat"
                    {...form.register('categoryId', { setValueAs: emptyToNull })}
                    options={[
                      { value: '', label: t('inventory.category.none') },
                      ...(categories ?? []).map((c) => ({ value: c.id, label: c.parentId ? `↳ ${c.name}` : c.name })),
                    ]}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field htmlFor="p-gtin" label={t('inventory.barcode.gtin')} icon={Barcode} hint={t('inventory.barcode.gtinHint')} error={errors.gtin?.message}>
                  <Input
                    id="p-gtin"
                    inputMode="numeric"
                    className="font-mono tabular-nums"
                    {...form.register('gtin', { setValueAs: emptyToNull })}
                    aria-invalid={Boolean(errors.gtin)}
                  />
                </Field>
                <Field htmlFor="p-barcode" label={t('inventory.barcode.internal')} icon={Barcode} error={errors.barcode?.message}>
                  <Input
                    id="p-barcode"
                    className="font-mono"
                    {...form.register('barcode', { setValueAs: emptyToNull })}
                    aria-invalid={Boolean(errors.barcode)}
                  />
                </Field>
              </div>
            </section>

            {/* M1 — units of measure */}
            <section className="space-y-4">
              <SectionLabel>{t('inventory.uom.section')}</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field htmlFor="p-base-uom" label={t('inventory.uom.base')} icon={Ruler} hint={t('inventory.uom.baseHint')}>
                  <Select
                    id="p-base-uom"
                    {...form.register('baseUomId', { setValueAs: emptyToNull })}
                    options={[
                      { value: '', label: t('inventory.uom.pick') },
                      ...(uoms ?? []).map((u) => ({ value: u.id, label: u.nameLo ? `${u.name} · ${u.nameLo}` : u.name })),
                    ]}
                  />
                </Field>
                <Field htmlFor="p-unit" label={t('inventory.unit')} icon={Ruler} error={errors.unit?.message}>
                  <Input
                    id="p-unit"
                    {...form.register('unit', { setValueAs: (v: string) => (v?.trim() ? v : undefined) })}
                    placeholder={baseUom ? baseUom.nameLo || baseUom.name : t('inventory.unitHint')}
                    aria-invalid={Boolean(errors.unit)}
                  />
                </Field>
              </div>
              <UomConversionsEditor
                rows={convs}
                onChange={setConvs}
                uoms={uoms ?? []}
                baseUomId={baseUomId}
                baseLabel={baseLabel}
              />
            </section>

            {/* Branch & cost */}
            <section className="space-y-4">
              <SectionLabel>{t('inventory.form.sectionBranchCost')}</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field htmlFor="p-branch" label={t('inventory.col.branch')} icon={Store}>
                  <Select
                    id="p-branch"
                    disabled={isEdit}
                    {...form.register('branchId')}
                    options={branches.map((b) => ({ value: b.id, label: b.name }))}
                  />
                </Field>
                <Field htmlFor="p-cost" label={t('inventory.col.cost')} icon={Wallet} error={errors.costPrice?.message}>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      ₭
                    </span>
                    <Input
                      id="p-cost"
                      type="number"
                      step="0.01"
                      className="pl-7 tabular-nums"
                      {...form.register('costPrice', { valueAsNumber: true })}
                      aria-invalid={Boolean(errors.costPrice)}
                    />
                  </div>
                </Field>
              </div>
            </section>

            {/* Stock & reorder point */}
            <section className="space-y-4">
              <SectionLabel>{t('inventory.form.sectionStock')}</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                {!isEdit ? (
                  <Field
                    htmlFor="p-open"
                    label={t('inventory.openingStock')}
                    icon={PackagePlus}
                    error={errors.openingStock?.message}
                  >
                    <Input
                      id="p-open"
                      type="number"
                      step="0.001"
                      className="tabular-nums"
                      {...form.register('openingStock', { valueAsNumber: true })}
                      aria-invalid={Boolean(errors.openingStock)}
                    />
                  </Field>
                ) : null}
                <Field
                  htmlFor="p-min"
                  label={t('inventory.col.min')}
                  icon={AlertTriangle}
                  hint={t('inventory.form.minHint')}
                  error={errors.minStockQty?.message}
                >
                  <Input
                    id="p-min"
                    type="number"
                    step="0.001"
                    className="tabular-nums"
                    {...form.register('minStockQty', { valueAsNumber: true })}
                    aria-invalid={Boolean(errors.minStockQty)}
                  />
                </Field>
              </div>
              {!isEdit && trackLot && openingStock > 0 ? (
                <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-foreground">{t('inventory.lot.openingLot')}</p>
                  <LotFields value={openingLot} onChange={setOpeningLot} idPrefix="p-open" />
                </div>
              ) : null}
            </section>

            {/* Settings */}
            <section className="space-y-3">
              <SectionLabel>{t('inventory.form.sectionSettings')}</SectionLabel>
              <div className="overflow-hidden rounded-xl border border-border">
                <label className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-3">
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium text-foreground">
                      {t('inventory.active')}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t('inventory.activeHint')}
                    </span>
                  </span>
                  <Switch
                    checked={isActive}
                    onCheckedChange={(v) => form.setValue('isActive', v, { shouldDirty: true })}
                    aria-label={t('inventory.active')}
                  />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-border px-3.5 py-3">
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium text-foreground">
                      {t('inventory.lot.trackLot')}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t('inventory.lot.trackLotHint')}
                    </span>
                  </span>
                  <Switch
                    checked={trackLot}
                    onCheckedChange={(v) => form.setValue('trackLot', v, { shouldDirty: true })}
                    aria-label={t('inventory.lot.trackLot')}
                  />
                </label>
                {/* M13 — ຂາຍໜ້າຮ້ານ (retail/OTC) */}
                <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-border px-3.5 py-3">
                  <span className="space-y-0.5">
                    <span className="block text-sm font-medium text-foreground">{t('inventory.retail.sellable')}</span>
                    <span className="block text-xs text-muted-foreground">{t('inventory.retail.sellableHint')}</span>
                  </span>
                  <Switch
                    checked={isSellable}
                    onCheckedChange={(v) => form.setValue('isSellable', v, { shouldDirty: true })}
                    aria-label={t('inventory.retail.sellable')}
                  />
                </label>
                {isSellable ? (
                  <div className="border-t border-border px-3.5 py-3">
                    <Field
                      htmlFor="p-retail"
                      label={t('inventory.retail.price', { unit: baseLabel || t('inventory.unit') })}
                      icon={Wallet}
                      hint={t('inventory.retail.priceHint')}
                      error={errors.retailPrice?.message}
                    >
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                          ₭
                        </span>
                        <Input
                          id="p-retail"
                          type="number"
                          step="0.01"
                          min="0"
                          className="pl-7 tabular-nums"
                          {...form.register('retailPrice', {
                            setValueAs: (v: unknown) => (v === '' || v == null ? null : Number(v)),
                          })}
                          aria-invalid={Boolean(errors.retailPrice)}
                        />
                      </div>
                    </Field>
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border bg-card px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
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
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  icon?: LucideIcon;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
        {label}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function AdjustDialog({
  product,
  branches,
  isSuperAdmin,
  onClose,
}: {
  product: ProductView | null;
  branches: Array<{ id: string; allowNegativeStock: boolean }>;
  isSuperAdmin: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const adjust = useAdjustStock();
  const { data: adjustSettings } = useAdjustSettings();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState<StockAdjustReasonValue | ''>('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<{ contentType: (typeof PHOTO_TYPES)[number]; dataBase64: string; name: string } | null>(null);
  const [deltaError, setDeltaError] = useState<string | null>(null);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [lot, setLot] = useState<LotDraft>(EMPTY_LOT);

  const branch = branches.find((b) => b.id === product?.branchId);
  const deltaNum = Number(delta);
  const hasValidDelta = delta !== '' && Number.isFinite(deltaNum) && deltaNum !== 0;
  const resultingStock = product ? product.stockQty + (hasValidDelta ? deltaNum : 0) : 0;
  const willGoNegative = hasValidDelta && resultingStock < 0 && !branch?.allowNegativeStock;

  const DirectionIcon = deltaNum > 0 ? TrendingUp : deltaNum < 0 ? TrendingDown : ArrowUpDown;
  const notesRequired = reason !== '' && STOCK_ADJUST_REASONS_REQUIRING_NOTES.includes(reason);
  // H2 — ມູນຄ່າປະມານ (|delta| × WAC); ເກີນເກນ + ບໍ່ແມ່ນ SUPER_ADMIN → ຈະເປັນຄຳຂໍລໍອະນຸມັດ.
  const estValue = product && hasValidDelta ? Math.abs(deltaNum) * product.costPrice : 0;
  const needsApproval =
    !isSuperAdmin && adjustSettings != null && estValue > adjustSettings.approvalThresholdLak;
  const reasonOptions = STOCK_ADJUST_REASONS.filter((r) => r !== 'OPENING_BALANCE' || deltaNum >= 0);

  function reset() {
    setDelta('');
    setReason('');
    setNotes('');
    setPhoto(null);
    setDeltaError(null);
    setReasonError(null);
    setLot(EMPTY_LOT);
  }

  function pickPhoto(file: File | undefined) {
    if (!file) return setPhoto(null);
    if (!PHOTO_TYPES.includes(file.type as (typeof PHOTO_TYPES)[number]) || file.size > MAX_PHOTO_BYTES) {
      toast.error(t('inventory.adjustPhotoInvalid'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      setPhoto({
        contentType: file.type as (typeof PHOTO_TYPES)[number],
        dataBase64: url.slice(url.indexOf(',') + 1),
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  }

  function step(amount: number) {
    const current = Number(delta) || 0;
    const next = Math.round((current + amount) * 1000) / 1000;
    setDelta(next === 0 ? '' : String(next));
    setDeltaError(null);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!product) return;
    if (!hasValidDelta) {
      setDeltaError(t('inventory.deltaInvalid'));
      return;
    }
    // C5 — ເພີ່ມສະຕັອກສິນຄ້າ trackLot ຕ້ອງບອກ lot; ຫັກອອກ backend ໃຊ້ FEFO ໃຫ້ເອງ.
    const needsLot = product.trackLot && deltaNum > 0;
    if (needsLot && !lot.lotNumber.trim()) {
      setDeltaError(t('inventory.lot.adjustRequired'));
      return;
    }
    if (!reason) {
      setReasonError(t('inventory.adjustReasonRequired'));
      return;
    }
    if (notesRequired && !notes.trim()) {
      setReasonError(t('inventory.adjustNotesRequired'));
      return;
    }
    adjust.mutate(
      {
        productId: product.id,
        delta: deltaNum,
        reason,
        notes: notes.trim() || undefined,
        ...(needsLot ? { lot: lotPayload(lot) } : {}),
        ...(photo ? { photo: { contentType: photo.contentType, dataBase64: photo.dataBase64 } } : {}),
      },
      {
        onSuccess: (res) => {
          if (res.outcome === 'PENDING_APPROVAL') toast.info(t('inventory.adjustPending'));
          else toast.success(t('inventory.adjusted'));
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
      open={Boolean(product)}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-start gap-3 border-b border-border px-6 py-4 pr-12">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <ArrowUpDown className="h-[18px] w-[18px]" />
          </span>
          <div className="space-y-0.5">
            <DialogTitle>{t('inventory.adjustTitle')}</DialogTitle>
            <DialogDescription>{t('inventory.adjustSubtitle')}</DialogDescription>
          </div>
        </DialogHeader>

        {product ? (
          <form className="space-y-5 px-6 py-5" onSubmit={submit}>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card text-muted-foreground"
                aria-hidden="true"
              >
                <Package className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{product.name}</p>
                <p className="text-xs text-muted-foreground">{t('inventory.currentStock')}</p>
              </div>
              <p className="shrink-0 tabular-nums text-base font-semibold text-foreground">
                {product.stockQty.toLocaleString()}{' '}
                <span className="text-xs font-normal text-muted-foreground">{product.unit}</span>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="a-delta" className="flex items-center gap-1.5">
                <DirectionIcon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    deltaNum > 0 && 'text-success',
                    deltaNum < 0 && 'text-destructive',
                    deltaNum === 0 && 'text-muted-foreground',
                  )}
                  aria-hidden="true"
                />
                {t('inventory.delta')}
              </Label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-input bg-card text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground"
                  aria-label={t('inventory.decrease')}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <Input
                  id="a-delta"
                  type="number"
                  step="0.001"
                  inputMode="decimal"
                  className="text-center tabular-nums"
                  value={delta}
                  onChange={(e) => {
                    setDelta(e.target.value);
                    setDeltaError(null);
                  }}
                  placeholder={t('inventory.deltaHint')}
                  aria-invalid={Boolean(deltaError)}
                />
                <button
                  type="button"
                  onClick={() => step(1)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-input bg-card text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground"
                  aria-label={t('inventory.increase')}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {deltaError ? (
                <p role="alert" className="text-xs text-destructive">
                  {deltaError}
                </p>
              ) : hasValidDelta ? (
                <p
                  className={cn(
                    'flex items-center gap-1 text-xs',
                    willGoNegative ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {willGoNegative ? (
                    <ShieldAlert className="h-3 w-3 shrink-0" aria-hidden="true" />
                  ) : null}
                  {t(willGoNegative ? 'inventory.resultingStockNegative' : 'inventory.resultingStock', {
                    qty: resultingStock.toLocaleString(),
                    unit: product.unit,
                  })}
                </p>
              ) : null}
            </div>

            {product.trackLot && hasValidDelta ? (
              deltaNum > 0 ? (
                <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                  <p className="text-xs font-medium text-foreground">{t('inventory.lot.adjustAddInto')}</p>
                  <LotFields value={lot} onChange={setLot} idPrefix="a" />
                </div>
              ) : (
                <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {t('inventory.lot.fefoNote')}
                </p>
              )
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="a-reason" className="flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                {t('inventory.adjustReason')}
              </Label>
              <Select
                id="a-reason"
                className="h-10 w-full"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value as StockAdjustReasonValue | '');
                  setReasonError(null);
                }}
                options={[
                  { value: '', label: t('inventory.adjustReasonPick') },
                  ...reasonOptions.map((r) => ({ value: r, label: t(`inventory.adjReason.${r}`) })),
                ]}
                aria-invalid={Boolean(reasonError) && !reason}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="a-notes" className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                {t('inventory.reason')}
                {notesRequired ? <span className="text-destructive">*</span> : null}
              </Label>
              <Input
                id="a-notes"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setReasonError(null);
                }}
                placeholder={notesRequired ? t('inventory.adjustNotesRequired') : t('inventory.reasonHint')}
                aria-invalid={Boolean(reasonError) && notesRequired}
              />
              {reasonError ? (
                <p role="alert" className="text-xs text-destructive">
                  {reasonError}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="a-photo" className="flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                {t('inventory.adjustPhoto')}
              </Label>
              <input
                id="a-photo"
                type="file"
                accept={PHOTO_TYPES.join(',')}
                onChange={(e) => pickPhoto(e.target.files?.[0])}
                className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-sm file:border file:border-input file:bg-card file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-foreground"
              />
            </div>

            {needsApproval ? (
              <p className="flex items-start gap-1.5 rounded-lg border border-warning/40 bg-warning-soft/60 px-3 py-2 text-xs text-warning">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  {t('inventory.adjustNeedsApproval', {
                    value: Math.round(estValue).toLocaleString(),
                    threshold: adjustSettings?.approvalThresholdLak.toLocaleString(),
                  })}
                </span>
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={adjust.isPending}>
                {adjust.isPending ? t('common.saving') : t('inventory.applyAdjust')}
              </Button>
            </div>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
