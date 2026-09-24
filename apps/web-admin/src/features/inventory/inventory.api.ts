import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CogsSummaryView,
  InventoryStatsView,
  LotUsageView,
  Paginated,
  ProductCreateInput,
  ProductUpdateInput,
  ProductView,
  PurchaseOrderCreateInput,
  PurchaseOrderReceiveInput,
  PurchaseOrderUpdateInput,
  PurchaseOrderView,
  StockAdjustInput,
  StockLotView,
  StockMovementStatsView,
  StockMovementTypeValue,
  StockMovementView,
  StockTransferCreateInput,
  StockTransferStatusValue,
  StockTransferView,
  SupplierView,
  SupplierWriteInput,
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
}

export function useSuppliers(f: SupplierFilters) {
  return useQuery({
    queryKey: ['suppliers', f],
    queryFn: async () => {
      const { data } = await http.get<Envelope<Paginated<SupplierView>>>('/suppliers', {
        params: clean({ q: f.q, page: f.page, pageSize: f.pageSize, sort: f.sort }),
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

// ---- products -------------------------------------------------

export interface ProductFilters {
  q?: string;
  branchId?: string;
  isActive?: 'true' | 'false';
  lowStock?: 'true';
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
          page: f.page,
          pageSize: f.pageSize,
        }),
      });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useInventoryStats(branchId?: string) {
  return useQuery({
    queryKey: ['products', 'stats', branchId ?? 'all'],
    queryFn: async () => {
      const { data } = await http.get<Envelope<InventoryStatsView>>('/products/stats', {
        params: clean({ branchId }),
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
      const { data } = await http.post<Envelope<StockMovementView>>('/stock-movements/adjust', input);
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['stock-movements'] });
      void qc.invalidateQueries({ queryKey: ['stock-lots'] });
    },
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
