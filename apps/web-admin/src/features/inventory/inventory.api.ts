import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AssignUnlottedInput,
  CogsSummaryView,
  GoodsReceiptCreateInput,
  GoodsReceiptView,
  InventoryExportView,
  InventoryStatsView,
  InventoryTurnoverView,
  ReorderSuggestionView,
  ServiceUsageView,
  StockAgingView,
  SupplierProductView,
  SupplierProductWriteInput,
  LotUsageView,
  Paginated,
  ProductCreateInput,
  ProductUpdateInput,
  ProductView,
  PurchaseOrderCreateInput,
  PurchaseOrderMatchView,
  PurchaseOrderReceiveInput,
  PurchaseOrderUpdateInput,
  PurchaseOrderView,
  ServiceMarginView,
  StockAdjustInput,
  StockAdjustRequestStatusValue,
  StockAdjustRequestView,
  StockAdjustResult,
  StockAdjustSettingsInput,
  StockAdjustSettingsView,
  StockCountCreateInput,
  StockCountLinesUpdateInput,
  StockCountStatusValue,
  StockCountTypeValue,
  StockCountView,
  StockLotView,
  StockMovementStatsView,
  StockMovementTypeValue,
  StockMovementView,
  StockShrinkageView,
  StockTransferCreateInput,
  StockTransferStatusValue,
  StockTransferView,
  StockValuationView,
  SupplierBalanceView,
  SupplierReturnCreateInput,
  SupplierReturnStatusValue,
  SupplierReturnView,
  SupplierView,
  SupplierWriteInput,
  AbcBasis,
  AbcView,
  InventoryReportGroupBy,
  ProductCategoryUpdateInput,
  ProductCategoryView,
  ProductCategoryWriteInput,
  ProductLookupMatch,
  UomUpdateInput,
  UomView,
  UomWriteInput,
  RefundView,
  RetailMarginView,
  RetailSaleCreateInput,
  RetailSaleReturnInput,
  RetailSaleStatusValue,
  RetailSaleView,
} from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

const clean = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T;

// ---- suppliers --------------------------------------------------

export interface SupplierFilters {
  q?: string;
  page: number;
  pageSize: number;
  sort?: 'name' | 'purchaseOrders';
  /** M20 — dropdown ສ້າງ PO ໃຊ້ 'true' (ເຊື່ອງຜູ້ສະໜອງທີ່ປິດໃຊ້). */
  activeOnly?: 'true';
  branchId?: string;
}

export function useSuppliers(f: SupplierFilters) {
  return useQuery({
    queryKey: ['suppliers', f],
    queryFn: async () => {
      const { data } = await http.get<Envelope<Paginated<SupplierView>>>('/suppliers', {
        params: clean({ q: f.q, page: f.page, pageSize: f.pageSize, sort: f.sort, activeOnly: f.activeOnly, branchId: f.branchId }),
      });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useSaveSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: SupplierWriteInput }) => {
      const { data } = id
        ? await http.patch<Envelope<SupplierView>>(`/suppliers/${id}`, input)
        : await http.post<Envelope<SupplierView>>('/suppliers', input);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.delete(`/suppliers/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

/** M8 — ລາຍການລາຄາຂອງຜູ້ສະໜອງ. */
export function useSupplierProducts(supplierId: string | null) {
  return useQuery({
    queryKey: ['suppliers', 'products', supplierId],
    queryFn: async () => (await http.get<Envelope<SupplierProductView[]>>(`/suppliers/${supplierId}/products`)).data.data,
    enabled: Boolean(supplierId),
  });
}

export function useSaveSupplierProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ supplierId, input }: { supplierId: string; input: SupplierProductWriteInput }) =>
      (await http.put<Envelope<SupplierProductView>>(`/suppliers/${supplierId}/products`, input)).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useDeleteSupplierProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ supplierId, productId }: { supplierId: string; productId: string }) =>
      http.delete(`/suppliers/${supplierId}/products/${productId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

// ---- products -------------------------------------------------

export interface ProductFilters {
  q?: string;
  branchId?: string;
  isActive?: 'true' | 'false';
  lowStock?: 'true';
  /** M3 */
  categoryId?: string;
  page: number;
  pageSize: number;
}

export function useProducts(f: ProductFilters) {
  return useQuery({
    queryKey: ['products', f],
    queryFn: async () => {
      const { data } = await http.get<Envelope<Paginated<ProductView>>>('/products', {
        params: clean({
          q: f.q,
          branchId: f.branchId,
          isActive: f.isActive,
          lowStock: f.lowStock,
          categoryId: f.categoryId,
          page: f.page,
          pageSize: f.pageSize,
        }),
      });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useInventoryStats(branchId?: string, categoryId?: string) {
  return useQuery({
    queryKey: ['products', 'stats', branchId ?? 'all', categoryId ?? 'all'],
    queryFn: async () => {
      const { data } = await http.get<Envelope<InventoryStatsView>>('/products/stats', {
        params: clean({ branchId, categoryId }),
      });
      return data.data;
    },
  });
}

export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id?: string;
      input: ProductCreateInput | ProductUpdateInput;
    }) => {
      const { data } = id
        ? await http.patch<Envelope<ProductView>>(`/products/${id}`, input)
        : await http.post<Envelope<ProductView>>('/products', input);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['stock-movements'] });
      void qc.invalidateQueries({ queryKey: ['stock-lots'] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.delete(`/products/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StockAdjustInput) => {
      // 201 = POSTED, 202 = PENDING_APPROVAL (H2 maker-checker)
      const { data } = await http.post<Envelope<StockAdjustResult>>('/stock-movements/adjust', input);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['stock-movements'] });
      void qc.invalidateQueries({ queryKey: ['stock-lots'] });
      void qc.invalidateQueries({ queryKey: ['stock-adjustments'] });
    },
  });
}

// ---- H2 adjustment approvals ------------------------------------

export function useAdjustRequests(f: { status?: StockAdjustRequestStatusValue; branchId?: string; page: number; pageSize: number }) {
  return useQuery({
    queryKey: ['stock-adjustments', f],
    queryFn: async () => {
      const { data } = await http.get<Envelope<Paginated<StockAdjustRequestView>>>('/stock-adjustments', {
        params: clean({ status: f.status, branchId: f.branchId, page: f.page, pageSize: f.pageSize }),
      });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useAdjustSettings() {
  return useQuery({
    queryKey: ['stock-adjustments', 'settings'],
    queryFn: async () => (await http.get<Envelope<StockAdjustSettingsView>>('/stock-adjustments/settings')).data.data,
  });
}

export function useSaveAdjustSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StockAdjustSettingsInput) =>
      (await http.put<Envelope<StockAdjustSettingsView>>('/stock-adjustments/settings', input)).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stock-adjustments'] });
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    },
  });
}

export function useReviewAdjustRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: 'approve' | 'reject'; reason?: string }) =>
      (
        await http.post<Envelope<StockAdjustRequestView>>(
          `/stock-adjustments/${id}/${action}`,
          action === 'reject' ? { reason } : {},
        )
      ).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stock-adjustments'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['stock-movements'] });
      void qc.invalidateQueries({ queryKey: ['stock-lots'] });
    },
  });
}

// ---- lot backfill -----------------------------------------------

export function useAssignUnlotted() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AssignUnlottedInput) =>
      (await http.post<Envelope<ProductView>>('/stock-lots/assign-unlotted', input)).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['stock-lots'] });
    },
  });
}

// ---- M12-lite service margin --------------------------------------

export function useServiceMargin(f: { branchId?: string; from?: string; to?: string }, enabled = true) {
  return useQuery({
    queryKey: ['stock-movements', 'service-margin', f],
    queryFn: async () =>
      (await http.get<Envelope<ServiceMarginView>>('/stock-movements/service-margin', { params: clean(f) })).data.data,
    enabled,
  });
}

// ---- stock movements ------------------------------------------

export interface MovementFilters {
  productId?: string;
  branchId?: string;
  type?: StockMovementTypeValue;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface MovementStatsFilters {
  productId?: string;
  branchId?: string;
  from?: string;
  to?: string;
}

export function useStockMovementStats(f: MovementStatsFilters) {
  return useQuery({
    queryKey: ['stock-movements', 'stats', f],
    queryFn: async () => {
      const { data } = await http.get<Envelope<StockMovementStatsView>>('/stock-movements/stats', {
        params: clean({ productId: f.productId, branchId: f.branchId, from: f.from, to: f.to }),
      });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

/** C4 — total COGS (positive LAK) for a branch/date range, sourced from valued SERVICE_CONSUMED rows. */
export function useCogsSummary(f: MovementStatsFilters) {
  return useQuery({
    queryKey: ['stock-movements', 'cogs-summary', f],
    queryFn: async () => {
      const { data } = await http.get<Envelope<CogsSummaryView>>('/stock-movements/cogs-summary', {
        params: clean({ branchId: f.branchId, from: f.from, to: f.to }),
      });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useStockMovements(f: MovementFilters) {
  return useQuery({
    queryKey: ['stock-movements', f],
    queryFn: async () => {
      const { data } = await http.get<Envelope<Paginated<StockMovementView>>>('/stock-movements', {
        params: clean({
          productId: f.productId,
          branchId: f.branchId,
          type: f.type,
          from: f.from,
          to: f.to,
          page: f.page,
          pageSize: f.pageSize,
        }),
      });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

// ---- lots (C5) ------------------------------------------------

export interface LotFilters {
  productId?: string;
  branchId?: string;
  expiringWithinDays?: number;
  includeEmpty?: boolean;
  page: number;
  pageSize: number;
}

export function useStockLots(f: LotFilters, enabled = true) {
  return useQuery({
    queryKey: ['stock-lots', f],
    queryFn: async () => {
      const { data } = await http.get<Envelope<Paginated<StockLotView>>>('/stock-lots', {
        params: clean({
          productId: f.productId,
          branchId: f.branchId,
          expiringWithinDays: f.expiringWithinDays,
          includeEmpty: f.includeEmpty ? 'true' : undefined,
          page: f.page,
          pageSize: f.pageSize,
        }),
      });
      return data.data;
    },
    enabled,
    placeholderData: (prev) => prev,
  });
}

/** Recall report — which appointments/customers a lot was used on. */
export function useLotUsage(lotId: string | null) {
  return useQuery({
    queryKey: ['stock-lots', 'usage', lotId],
    queryFn: async () => {
      const { data } = await http.get<Envelope<LotUsageView>>(`/stock-lots/${lotId}/usage`);
      return data.data;
    },
    enabled: Boolean(lotId),
  });
}

// ---- purchase orders ----------------------------------------

export interface PoFilters {
  q?: string;
  branchId?: string;
  supplierId?: string;
  status?: PurchaseOrderView['status'];
  page: number;
  pageSize: number;
}

export function usePurchaseOrders(f: PoFilters) {
  return useQuery({
    queryKey: ['purchase-orders', f],
    queryFn: async () => {
      const { data } = await http.get<Envelope<Paginated<PurchaseOrderView>>>('/purchase-orders', {
        params: clean({
          q: f.q,
          branchId: f.branchId,
          supplierId: f.supplierId,
          status: f.status,
          page: f.page,
          pageSize: f.pageSize,
        }),
      });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function usePurchaseOrder(id: string | null) {
  return useQuery({
    queryKey: ['purchase-orders', 'detail', id],
    queryFn: async () => {
      const { data } = await http.get<Envelope<PurchaseOrderView>>(`/purchase-orders/${id}`);
      return data.data;
    },
    enabled: Boolean(id),
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PurchaseOrderCreateInput) => {
      const { data } = await http.post<Envelope<PurchaseOrderView>>('/purchase-orders', input);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });
}

export function useUpdatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: PurchaseOrderUpdateInput }) => {
      const { data } = await http.patch<Envelope<PurchaseOrderView>>(`/purchase-orders/${id}`, input);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });
}

export function useReceivePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input?: PurchaseOrderReceiveInput }) => {
      const { data } = await http.post<Envelope<PurchaseOrderView>>(`/purchase-orders/${id}/receive`, input ?? {});
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['stock-movements'] });
      void qc.invalidateQueries({ queryKey: ['stock-lots'] });
    },
  });
}

function useInvalidateReceiving() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    void qc.invalidateQueries({ queryKey: ['products'] });
    void qc.invalidateQueries({ queryKey: ['stock-movements'] });
    void qc.invalidateQueries({ queryKey: ['stock-lots'] });
    void qc.invalidateQueries({ queryKey: ['supplier-returns'] });
  };
}

/** H4 — POST /purchase-orders/:id/receipts (partial GRN). */
export function useReceiveGoods() {
  const invalidate = useInvalidateReceiving();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: GoodsReceiptCreateInput }) =>
      (
        await http.post<Envelope<{ receipt: GoodsReceiptView; purchaseOrder: PurchaseOrderView }>>(
          `/purchase-orders/${id}/receipts`,
          input,
        )
      ).data.data,
    onSuccess: invalidate,
  });
}

export type PoAction = 'approve' | 'reject' | 'close-short';

/** M6 approve/reject (SUPER_ADMIN) + H4 close short. */
export function usePoAction() {
  const invalidate = useInvalidateReceiving();
  return useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: PoAction; reason?: string }) =>
      (
        await http.post<Envelope<PurchaseOrderView>>(
          `/purchase-orders/${id}/${action}`,
          action === 'approve' ? {} : { reason },
        )
      ).data.data,
    onSuccess: invalidate,
  });
}

/** H4 — 3-way match PO ↔ GRN ↔ supplier invoice (PO-linked expenses). */
export function usePoMatch(id: string | null, enabled = true) {
  return useQuery({
    queryKey: ['purchase-orders', 'match', id],
    queryFn: async () => (await http.get<Envelope<PurchaseOrderMatchView>>(`/purchase-orders/${id}/match`)).data.data,
    enabled: Boolean(id) && enabled,
  });
}

export function useDeletePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.delete(`/purchase-orders/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['purchase-orders'] }),
  });
}

// ---- stock transfers (cross-branch) --------------------------

export interface TransferFilters {
  branchId?: string;
  fromBranchId?: string;
  toBranchId?: string;
  status?: StockTransferStatusValue;
  page: number;
  pageSize: number;
}

export function useStockTransfers(f: TransferFilters) {
  return useQuery({
    queryKey: ['stock-transfers', f],
    queryFn: async () => {
      const { data } = await http.get<Envelope<Paginated<StockTransferView>>>('/stock-transfers', {
        params: clean({
          branchId: f.branchId,
          fromBranchId: f.fromBranchId,
          toBranchId: f.toBranchId,
          status: f.status,
          page: f.page,
          pageSize: f.pageSize,
        }),
      });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useStockTransfer(id: string | null) {
  return useQuery({
    queryKey: ['stock-transfers', 'detail', id],
    queryFn: async () => {
      const { data } = await http.get<Envelope<StockTransferView>>(`/stock-transfers/${id}`);
      return data.data;
    },
    enabled: Boolean(id),
  });
}

export function useCreateStockTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StockTransferCreateInput) => {
      const { data } = await http.post<Envelope<StockTransferView>>('/stock-transfers', input);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stock-transfers'] }),
  });
}

export function useSendStockTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await http.post<Envelope<StockTransferView>>(`/stock-transfers/${id}/send`);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stock-transfers'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
}

export function useReceiveStockTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await http.post<Envelope<StockTransferView>>(`/stock-transfers/${id}/receive`);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stock-transfers'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['stock-movements'] });
    },
  });
}

export function useDeleteStockTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.delete(`/stock-transfers/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['stock-transfers'] }),
  });
}

// ---- M15 — CSV export (all filtered rows, server-capped) ------------

/**
 * `GET <base>/export` — every row matching the page's current filters (not just the visible page),
 * capped server-side at INVENTORY_EXPORT_MAX_ROWS (`truncated` tells the caller it was cut).
 */
export async function fetchInventoryExport<T>(
  base:
    | '/products'
    | '/stock-movements'
    | '/purchase-orders'
    | '/stock-transfers'
    | '/stock-lots'
    | '/stock-counts'
    | '/supplier-returns'
    | '/retail-sales',
  params: Record<string, unknown>,
): Promise<InventoryExportView<T>> {
  const { data } = await http.get<Envelope<InventoryExportView<T>>>(`${base}/export`, { params: clean(params) });
  return data.data;
}

// ---- H3 — stock counts ------------------------------------------------

export interface StockCountFilters {
  branchId?: string;
  status?: StockCountStatusValue;
  type?: StockCountTypeValue;
  page: number;
  pageSize: number;
}

export function useStockCounts(f: StockCountFilters) {
  return useQuery({
    queryKey: ['stock-counts', f],
    queryFn: async () =>
      (await http.get<Envelope<Paginated<StockCountView>>>('/stock-counts', { params: clean({ ...f }) })).data.data,
    placeholderData: (prev) => prev,
  });
}

export function useStockCount(id: string | null) {
  return useQuery({
    queryKey: ['stock-counts', 'detail', id],
    queryFn: async () => (await http.get<Envelope<StockCountView>>(`/stock-counts/${id}`)).data.data,
    enabled: Boolean(id),
  });
}

function useInvalidateCounts() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['stock-counts'] });
    void qc.invalidateQueries({ queryKey: ['products'] });
    void qc.invalidateQueries({ queryKey: ['stock-movements'] });
    void qc.invalidateQueries({ queryKey: ['stock-lots'] });
  };
}

export function useCreateStockCount() {
  const invalidate = useInvalidateCounts();
  return useMutation({
    mutationFn: async (input: StockCountCreateInput) =>
      (await http.post<Envelope<StockCountView>>('/stock-counts', input)).data.data,
    onSuccess: invalidate,
  });
}

export function useSaveStockCountLines() {
  const invalidate = useInvalidateCounts();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: StockCountLinesUpdateInput }) =>
      (await http.patch<Envelope<StockCountView>>(`/stock-counts/${id}/lines`, input)).data.data,
    onSuccess: invalidate,
  });
}

export type StockCountAction = 'start' | 'submit' | 'approve' | 'reject' | 'cancel';

export function useStockCountAction() {
  const invalidate = useInvalidateCounts();
  return useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: StockCountAction; reason?: string }) =>
      (
        await http.post<Envelope<StockCountView>>(
          `/stock-counts/${id}/${action}`,
          action === 'reject' || action === 'cancel' ? { reason } : {},
        )
      ).data.data,
    onSuccess: invalidate,
  });
}

// ---- Reports — valuation as of a date + shrinkage --------------------

export function useStockValuation(f: { asOf?: string; branchId?: string; groupBy?: InventoryReportGroupBy }, enabled = true) {
  return useQuery({
    queryKey: ['stock-movements', 'valuation', f],
    queryFn: async () =>
      (await http.get<Envelope<StockValuationView>>('/stock-movements/valuation', { params: clean(f) })).data.data,
    enabled,
  });
}

export function useStockShrinkage(f: { branchId?: string; from?: string; to?: string }, enabled = true) {
  return useQuery({
    queryKey: ['stock-movements', 'shrinkage', f],
    queryFn: async () =>
      (await http.get<Envelope<StockShrinkageView>>('/stock-movements/shrinkage', { params: clean(f) })).data.data,
    enabled,
  });
}

export function useProduct(id: string | null) {
  return useQuery({
    queryKey: ['products', 'detail', id],
    queryFn: async () => (await http.get<Envelope<ProductView>>(`/products/${id}`)).data.data,
    enabled: Boolean(id),
  });
}

// ---- H5 — supplier returns + debit notes ------------------------------

export interface SupplierReturnFilters {
  branchId?: string;
  supplierId?: string;
  purchaseOrderId?: string;
  status?: SupplierReturnStatusValue;
  page: number;
  pageSize: number;
}

export function useSupplierReturns(f: SupplierReturnFilters) {
  return useQuery({
    queryKey: ['supplier-returns', f],
    queryFn: async () =>
      (await http.get<Envelope<Paginated<SupplierReturnView>>>('/supplier-returns', { params: clean({ ...f }) })).data.data,
    placeholderData: (prev) => prev,
  });
}

export function useSupplierReturn(id: string | null) {
  return useQuery({
    queryKey: ['supplier-returns', 'detail', id],
    queryFn: async () => (await http.get<Envelope<SupplierReturnView>>(`/supplier-returns/${id}`)).data.data,
    enabled: Boolean(id),
  });
}

function useInvalidateReturns() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['supplier-returns'] });
    void qc.invalidateQueries({ queryKey: ['suppliers'] });
    void qc.invalidateQueries({ queryKey: ['purchase-orders'] });
    void qc.invalidateQueries({ queryKey: ['products'] });
    void qc.invalidateQueries({ queryKey: ['stock-movements'] });
    void qc.invalidateQueries({ queryKey: ['stock-lots'] });
  };
}

export function useCreateSupplierReturn() {
  const invalidate = useInvalidateReturns();
  return useMutation({
    mutationFn: async (input: SupplierReturnCreateInput) =>
      (await http.post<Envelope<SupplierReturnView>>('/supplier-returns', input)).data.data,
    onSuccess: invalidate,
  });
}

export function useSupplierReturnAction() {
  const invalidate = useInvalidateReturns();
  return useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: 'post' | 'cancel'; reason?: string }) =>
      (await http.post<Envelope<SupplierReturnView>>(`/supplier-returns/${id}/${action}`, action === 'cancel' ? { reason } : {}))
        .data.data,
    onSuccess: invalidate,
  });
}

/** Supplier payable after debit notes (invoices − paid − posted returns). */
export function useSupplierBalance(supplierId: string | null) {
  return useQuery({
    queryKey: ['suppliers', 'balance', supplierId],
    queryFn: async () => (await http.get<Envelope<SupplierBalanceView>>(`/suppliers/${supplierId}/balance`)).data.data,
    enabled: Boolean(supplierId),
  });
}

// ---- M11 — suggested orders -----------------------------------------------

export function useReorderSuggestions(branchId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['purchase-orders', 'suggestions', branchId ?? 'all'],
    queryFn: async () =>
      (await http.get<Envelope<ReorderSuggestionView>>('/purchase-orders/suggestions', { params: clean({ branchId }) })).data.data,
    enabled,
  });
}

// ---- 9D reports — turnover / aging / usage per service ---------------------

export function useInventoryTurnover(
  f: { branchId?: string; from?: string; to?: string; groupBy?: InventoryReportGroupBy },
  enabled = true,
) {
  return useQuery({
    queryKey: ['stock-movements', 'turnover', f],
    queryFn: async () =>
      (await http.get<Envelope<InventoryTurnoverView>>('/stock-movements/turnover', { params: clean(f) })).data.data,
    enabled,
  });
}

export function useStockAging(f: { branchId?: string; groupBy?: InventoryReportGroupBy }, enabled = true) {
  return useQuery({
    queryKey: ['stock-movements', 'aging', f],
    queryFn: async () => (await http.get<Envelope<StockAgingView>>('/stock-movements/aging', { params: clean(f) })).data.data,
    enabled,
  });
}

export function useServiceUsage(f: { branchId?: string; from?: string; to?: string }, enabled = true) {
  return useQuery({
    queryKey: ['stock-movements', 'service-usage', f],
    queryFn: async () =>
      (await http.get<Envelope<ServiceUsageView>>('/stock-movements/service-usage', { params: clean(f) })).data.data,
    enabled,
  });
}

// ---- 9C — M1 units of measure -------------------------------------------------

export function useUoms(includeInactive = false) {
  return useQuery({
    queryKey: ['uoms', includeInactive],
    queryFn: async () =>
      (await http.get<Envelope<UomView[]>>('/uoms', { params: clean({ includeInactive: includeInactive ? 'true' : undefined }) }))
        .data.data,
    staleTime: 60_000,
  });
}

export function useSaveUom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: UomWriteInput | UomUpdateInput }) =>
      (id
        ? await http.patch<Envelope<UomView>>(`/uoms/${id}`, input)
        : await http.post<Envelope<UomView>>('/uoms', input)
      ).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['uoms'] }),
  });
}

// ---- 9C — M3 product categories ----------------------------------------------

export function useProductCategories(branchId?: string, includeInactive = false) {
  return useQuery({
    queryKey: ['product-categories', branchId ?? 'all', includeInactive],
    queryFn: async () =>
      (
        await http.get<Envelope<ProductCategoryView[]>>('/product-categories', {
          params: clean({ branchId, includeInactive: includeInactive ? 'true' : undefined }),
        })
      ).data.data,
    staleTime: 60_000,
  });
}

export function useSaveProductCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: string; input: ProductCategoryWriteInput | ProductCategoryUpdateInput }) =>
      (id
        ? await http.patch<Envelope<ProductCategoryView>>(`/product-categories/${id}`, input)
        : await http.post<Envelope<ProductCategoryView>>('/product-categories', input)
      ).data.data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['product-categories'] });
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeleteProductCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.delete(`/product-categories/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['product-categories'] }),
  });
}

// ---- 9C — M2 barcode / GTIN lookup -------------------------------------------

export type ProductLookupResult = { matchedBy: ProductLookupMatch; product: ProductView };

/** ສະແກນ/ພິມລະຫັດ → ສິນຄ້າ (null = ບໍ່ພົບ 404). ໃຊ້ແບບ imperative ໃນ ScanInput. */
export async function lookupProductByCode(code: string, branchId?: string): Promise<ProductLookupResult | null> {
  try {
    return (await http.get<Envelope<ProductLookupResult>>('/products/lookup', { params: clean({ code, branchId }) })).data.data;
  } catch (err) {
    const e = err as { status?: number; response?: { status?: number } };
    if (e.status === 404 || e.response?.status === 404) return null;
    throw err;
  }
}

// ---- 9C — M3 ABC analysis ---------------------------------------------------

export function useAbcAnalysis(f: { branchId?: string; from?: string; to?: string; basis: AbcBasis }, enabled = true) {
  return useQuery({
    queryKey: ['stock-movements', 'abc', f],
    queryFn: async () => (await http.get<Envelope<AbcView>>('/stock-movements/abc', { params: clean(f) })).data.data,
    enabled,
  });
}

// ---- M13 — retail / OTC sales -------------------------------------------

export interface RetailSaleFilters {
  branchId?: string;
  status?: RetailSaleStatusValue;
  q?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export function useRetailSales(f: RetailSaleFilters) {
  return useQuery({
    queryKey: ['retail-sales', f],
    queryFn: async () =>
      (await http.get<Envelope<Paginated<RetailSaleView>>>('/retail-sales', { params: clean({ ...f }) })).data.data,
    placeholderData: (prev) => prev,
  });
}

export function useRetailSale(id: string | null) {
  return useQuery({
    queryKey: ['retail-sales', 'detail', id],
    queryFn: async () => (await http.get<Envelope<RetailSaleView>>(`/retail-sales/${id}`)).data.data,
    enabled: Boolean(id),
  });
}

function useInvalidateRetail() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['retail-sales'] });
    void qc.invalidateQueries({ queryKey: ['payments'] });
    void qc.invalidateQueries({ queryKey: ['refunds'] });
    void qc.invalidateQueries({ queryKey: ['products'] });
    void qc.invalidateQueries({ queryKey: ['stock-movements'] });
    void qc.invalidateQueries({ queryKey: ['stock-lots'] });
  };
}

export function useCreateRetailSale() {
  const invalidate = useInvalidateRetail();
  return useMutation({
    mutationFn: async (input: RetailSaleCreateInput) =>
      (await http.post<Envelope<RetailSaleView>>('/retail-sales', input)).data.data,
    onSuccess: invalidate,
  });
}

export function useRetailSaleAction() {
  const invalidate = useInvalidateRetail();
  return useMutation({
    mutationFn: async (a: { id: string; action: 'void'; reason: string } | { id: string; action: 'post-stock' }) =>
      (
        await http.post<Envelope<RetailSaleView>>(
          `/retail-sales/${a.id}/${a.action}`,
          a.action === 'void' ? { reason: a.reason } : {},
        )
      ).data.data,
    onSuccess: invalidate,
  });
}

export function useRetailReturn(id: string) {
  const invalidate = useInvalidateRetail();
  return useMutation({
    mutationFn: async (input: RetailSaleReturnInput) =>
      (await http.post<Envelope<RefundView>>(`/retail-sales/${id}/returns`, input)).data.data,
    onSuccess: invalidate,
  });
}

export function useRetailMargin(f: { branchId?: string; from?: string; to?: string }, enabled = true) {
  return useQuery({
    queryKey: ['retail-sales', 'margin', f],
    queryFn: async () => (await http.get<Envelope<RetailMarginView>>('/retail-sales/margin', { params: clean(f) })).data.data,
    enabled,
  });
}
