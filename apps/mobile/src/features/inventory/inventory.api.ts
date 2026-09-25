import type {
  GoodsReceiptCreateInput,
  GoodsReceiptView,
  InventoryStatsView,
  Paginated,
  ProductLookupMatch,
  ProductView,
  PurchaseOrderView,
  StockAdjustInput,
  StockAdjustResult,
  StockCountCreateInput,
  StockCountLinesUpdateInput,
  StockCountStatusValue,
  StockCountView,
  StockLotView,
  StockMovementView,
} from '@abcp/shared-types';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { normalizeError } from '../../services/apiError';
import { http } from '../../services/http';
import { useAuthStore } from '../../store/auth.store';

/**
 * M14 — ໜ້າສະຕັອກໃນ Staff Portal (ນັບ / ຮັບເຄື່ອງ / ຄົ້ນຫາ / ສະແກນ).
 *
 * ສິດ: ເມນູສະຕັອກສະແດງສະເພາະຜູ້ມີ `inventory:view` (ຫຼື `inventory:manage`) — ຄືກັບກ່ອງສະລິບທີ່ໃຊ້
 * `payments:review`. ຫຼາຍ endpoint (ນັບ/lot/ຮັບເຄື່ອງ/ປັບ) ຍັງເປັນ roleGuard admin ຢູ່ backend → 403
 * ສຳລັບ STAFF; UI ຈັບ 403 ແລ້ວສະແດງ "ຍັງບໍ່ມີສິດ" ແທນ error ທົ່ວໄປ (ເບິ່ງ docs/inventory-audit.md §7 M14).
 */

export const invKeys = {
  all: ['inventory'] as const,
  stats: (branchId: string | null) => ['inventory', 'stats', branchId] as const,
  products: (params: { q?: string; lowStock?: boolean; branchId: string | null }) =>
    ['inventory', 'products', params] as const,
  product: (id: string) => ['inventory', 'product', id] as const,
  lots: (params: { productId?: string; branchId: string | null; expiringWithinDays?: number }) =>
    ['inventory', 'lots', params] as const,
  movements: (productId: string) => ['inventory', 'movements', productId] as const,
  counts: (params: { status?: StockCountStatusValue; branchId: string | null }) =>
    ['inventory', 'counts', params] as const,
  count: (id: string) => ['inventory', 'count', id] as const,
  pos: (branchId: string | null) => ['inventory', 'pos', branchId] as const,
  po: (id: string) => ['inventory', 'po', id] as const,
};

// ---- ສິດ ----------------------------------------------------------------

export type InventoryAccess = {
  /** ເຫັນເມນູສະຕັອກ (ຄົ້ນຫາ/ສະແກນ/ນັບ/ຮັບເຄື່ອງ). */
  canView: boolean;
  /** ຄຳສັ່ງ admin: ປັບສະຕັອກ, ເປີດ/ອະນຸມັດການນັບ, ເຫັນຕົ້ນທຶນ WAC. */
  canManage: boolean;
  branchId: string | null;
};

export function useInventoryAccess(): InventoryAccess {
  const user = useAuthStore((s) => s.user);
  const perms = user?.permissions ?? [];
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'BRANCH_ADMIN';
  const canManage = isAdmin || perms.includes('inventory:manage');
  return {
    canView: canManage || perms.includes('inventory:view'),
    canManage,
    branchId: user?.branchId ?? null,
  };
}

/** 403 = backend ຍັງບໍ່ເປີດສິດ endpoint ນີ້ໃຫ້ role ຂອງຜູ້ໃຊ້. */
export function isForbidden(err: unknown): boolean {
  return normalizeError(err).status === 403;
}

export function isNotFound(err: unknown): boolean {
  return normalizeError(err).status === 404;
}

/** ບໍ່ retry 403/404 — ຜົນບໍ່ປ່ຽນ, ສະແດງສະຖານະທັນທີ. */
function retryUnlessDenied(count: number, err: unknown): boolean {
  const s = normalizeError(err).status;
  if (s === 403 || s === 404) return false;
  return count < 2;
}

const branchParam = (branchId: string | null) => (branchId ? { branchId } : {});

// ---- ສິນຄ້າ ----------------------------------------------------------------

export function useInventoryStats() {
  const { branchId } = useInventoryAccess();
  return useQuery({
    queryKey: invKeys.stats(branchId),
    retry: retryUnlessDenied,
    queryFn: async () => {
      const { data } = await http.get<{ data: InventoryStatsView }>('/products/stats', {
        params: branchParam(branchId),
      });
      return data.data;
    },
  });
}

export function useProducts(params: { q?: string; lowStock?: boolean }, enabled = true) {
  const { branchId } = useInventoryAccess();
  return useQuery({
    queryKey: invKeys.products({ ...params, branchId }),
    enabled,
    retry: retryUnlessDenied,
    queryFn: async () => {
      const { data } = await http.get<{ data: Paginated<ProductView> }>('/products', {
        params: {
          ...branchParam(branchId),
          isActive: 'true',
          pageSize: 40,
          ...(params.q ? { q: params.q } : {}),
          ...(params.lowStock ? { lowStock: 'true' } : {}),
        },
      });
      return data.data;
    },
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: invKeys.product(id),
    retry: retryUnlessDenied,
    queryFn: async () => {
      const { data } = await http.get<{ data: ProductView }>(`/products/${id}`);
      return data.data;
    },
  });
}

/** ຫຼາຍສິນຄ້າພ້ອມກັນ (ອັດຕາແປງໜ່ວຍຂອງແຕ່ລະແຖວ PO) — ໃຊ້ cache ດຽວກັບ useProduct. */
export function useProductsByIds(ids: readonly string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: invKeys.product(id),
      retry: retryUnlessDenied,
      queryFn: async () => {
        const { data } = await http.get<{ data: ProductView }>(`/products/${id}`);
        return data.data;
      },
    })),
  });
}

/** GTIN → barcode → SKU (branch-scoped); 404 = ບໍ່ພົບ. */
export function useProductLookup() {
  const qc = useQueryClient();
  const { branchId } = useInventoryAccess();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data } = await http.get<{ data: { matchedBy: ProductLookupMatch; product: ProductView } }>(
        '/products/lookup',
        { params: { code, ...branchParam(branchId) } },
      );
      return data.data;
    },
    onSuccess: (res) => qc.setQueryData(invKeys.product(res.product.id), res.product),
  });
}

export function useStockLots(
  params: { productId?: string; expiringWithinDays?: number },
  enabled = true,
) {
  const { branchId } = useInventoryAccess();
  return useQuery({
    queryKey: invKeys.lots({ ...params, branchId }),
    enabled,
    retry: retryUnlessDenied,
    queryFn: async () => {
      const { data } = await http.get<{ data: Paginated<StockLotView> }>('/stock-lots', {
        params: { ...branchParam(branchId), ...params, pageSize: 50 },
      });
      return data.data;
    },
  });
}

export function useProductMovements(productId: string) {
  return useQuery({
    queryKey: invKeys.movements(productId),
    retry: retryUnlessDenied,
    queryFn: async () => {
      const { data } = await http.get<{ data: Paginated<StockMovementView> }>('/stock-movements', {
        params: { productId, pageSize: 15 },
      });
      return data.data;
    },
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: StockAdjustInput) => {
      const { data } = await http.post<{ data: StockAdjustResult }>('/stock-movements/adjust', body);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: invKeys.all }),
  });
}

// ---- ນັບສະຕັອກ -----------------------------------------------------------

export function useStockCounts(status?: StockCountStatusValue, enabled = true) {
  const { branchId } = useInventoryAccess();
  return useQuery({
    queryKey: invKeys.counts({ status, branchId }),
    enabled,
    retry: retryUnlessDenied,
    queryFn: async () => {
      const { data } = await http.get<{ data: Paginated<StockCountView> }>('/stock-counts', {
        params: { ...branchParam(branchId), ...(status ? { status } : {}), pageSize: 30 },
      });
      return data.data;
    },
  });
}

export function useStockCount(id: string) {
  return useQuery({
    queryKey: invKeys.count(id),
    retry: retryUnlessDenied,
    queryFn: async () => {
      const { data } = await http.get<{ data: StockCountView }>(`/stock-counts/${id}`);
      return data.data;
    },
  });
}

/** ບັນທຶກຜົນນັບບາງແຖວ — ອັບເດດ cache ດ້ວຍຜົນຈາກ server (ບໍ່ refetch ທັງໃບທຸກຄັ້ງທີ່ພິມ). */
export function useSaveCountLines(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: StockCountLinesUpdateInput) => {
      const { data } = await http.patch<{ data: StockCountView }>(`/stock-counts/${id}/lines`, body);
      return data.data;
    },
    onSuccess: (view) => {
      if (view?.lines) qc.setQueryData(invKeys.count(id), view);
      else void qc.invalidateQueries({ queryKey: invKeys.count(id) });
    },
  });
}

type CountAction = 'start' | 'submit' | 'approve' | 'reject' | 'cancel';

export function useCountAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, reason }: { action: CountAction; reason?: string }) => {
      const body = action === 'reject' || action === 'cancel' ? { reason } : undefined;
      const { data } = await http.post<{ data: StockCountView }>(`/stock-counts/${id}/${action}`, body);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: invKeys.all }),
  });
}

/** admin: ສ້າງໃບນັບ (SPOT ສຳລັບສິນຄ້າດຽວ ຫຼື FULL ທັງສາຂາ) ແລ້ວເລີ່ມນັບທັນທີ. */
export function useCreateAndStartCount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: StockCountCreateInput) => {
      const created = await http.post<{ data: StockCountView }>('/stock-counts', body);
      const started = await http.post<{ data: StockCountView }>(`/stock-counts/${created.data.data.id}/start`);
      return started.data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: invKeys.all }),
  });
}

// ---- ຮັບສິນຄ້າ (PO) --------------------------------------------------------

/** PO ທີ່ລໍຮັບ = ORDERED + PARTIALLY_RECEIVED (backend ກອງໄດ້ເທື່ອລະ status → ດຶງຂະໜານ). */
export function usePosToReceive() {
  const { branchId } = useInventoryAccess();
  return useQuery({
    queryKey: invKeys.pos(branchId),
    retry: retryUnlessDenied,
    queryFn: async () => {
      const pages = await Promise.all(
        (['ORDERED', 'PARTIALLY_RECEIVED'] as const).map((status) =>
          http
            .get<{ data: Paginated<PurchaseOrderView> }>('/purchase-orders', {
              params: { ...branchParam(branchId), status, pageSize: 50 },
            })
            .then((r) => r.data.data.items),
        ),
      );
      return pages.flat().sort((a, b) => a.orderDate.localeCompare(b.orderDate));
    },
  });
}

export function usePurchaseOrder(id: string) {
  return useQuery({
    queryKey: invKeys.po(id),
    retry: retryUnlessDenied,
    queryFn: async () => {
      const { data } = await http.get<{ data: PurchaseOrderView }>(`/purchase-orders/${id}`);
      return data.data;
    },
  });
}

export function useReceiveGoods(poId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: GoodsReceiptCreateInput) => {
      const { data } = await http.post<{
        data: { receipt: GoodsReceiptView; purchaseOrder: PurchaseOrderView };
      }>(`/purchase-orders/${poId}/receipts`, body);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: invKeys.all }),
  });
}
