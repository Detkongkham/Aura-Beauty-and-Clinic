import type {
  LoyaltyAccountView,
  LoyaltyTransactionView,
  LoyaltyTxType,
  Paginated,
} from '@abcp/shared-types';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

export type LoyaltyTxTypeValue = LoyaltyTxType;

export function useMyLoyalty() {
  return useQuery({
    queryKey: qk.loyalty,
    queryFn: async () => {
      const { data } = await http.get<{ data: LoyaltyAccountView }>('/loyalty/me');
      return data.data;
    },
  });
}

/**
 * Ledger ຂອງຕົນເອງ. `type` = ຕົວກັ່ນຕອງປະເພດລາຍການ (EARN/REDEEM/ADJUST/EXPIRE) —
 * ສົ່ງຜ່ານ query param ທີ່ backend ຮອງຮັບຢູ່ແລ້ວ (loyaltyLedgerQuerySchema).
 */
export function useMyLoyaltyLedger(type?: LoyaltyTxTypeValue) {
  return useInfiniteQuery({
    queryKey: qk.loyaltyLedger(type),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await http.get<{ data: Paginated<LoyaltyTransactionView> }>(
        '/loyalty/me/ledger',
        { params: { page: pageParam, pageSize: 20, ...(type ? { type } : {}) } },
      );
      return data.data;
    },
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
}
