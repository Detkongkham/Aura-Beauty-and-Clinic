import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  LoyaltyAccountView,
  LoyaltyAdjustInput,
  LoyaltyTier,
  LoyaltyTransactionView,
  LoyaltyTxType,
  Paginated,
} from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

export interface LoyaltyFilters {
  tier?: LoyaltyTier;
  q?: string;
  page: number;
  pageSize: number;
}

export const loyaltyApi = {
  async list(f: LoyaltyFilters): Promise<Paginated<LoyaltyAccountView>> {
    const { data } = await http.get<Envelope<Paginated<LoyaltyAccountView>>>('/loyalty/accounts', {
      params: { tier: f.tier, q: f.q || undefined, page: f.page, pageSize: f.pageSize },
    });
    return data.data;
  },
  async ledger(
    userId: string,
    f: { type?: LoyaltyTxType; pageSize: number },
  ): Promise<Paginated<LoyaltyTransactionView>> {
    const { data } = await http.get<Envelope<Paginated<LoyaltyTransactionView>>>(
      `/loyalty/accounts/${userId}/ledger`,
      { params: { type: f.type, page: 1, pageSize: f.pageSize } },
    );
    return data.data;
  },
  async adjust(userId: string, input: LoyaltyAdjustInput): Promise<LoyaltyAccountView> {
    const { data } = await http.post<Envelope<LoyaltyAccountView>>(
      `/loyalty/accounts/${userId}/adjust`,
      input,
    );
    return data.data;
  },
};

export function useLoyaltyAccounts(f: LoyaltyFilters) {
  return useQuery({
    queryKey: ['loyalty', 'accounts', f],
    queryFn: () => loyaltyApi.list(f),
    placeholderData: (prev) => prev,
  });
}

export function useMemberLedger(userId: string | null, f: { type?: LoyaltyTxType; pageSize: number }) {
  return useQuery({
    queryKey: ['loyalty', 'ledger', userId, f],
    queryFn: () => loyaltyApi.ledger(userId!, f),
    enabled: Boolean(userId),
    placeholderData: (prev) => prev,
  });
}

export function useAdjustLoyalty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: LoyaltyAdjustInput }) =>
      loyaltyApi.adjust(userId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['loyalty'] });
    },
  });
}
