import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GiftCardView, IssueGiftCardInput, Paginated } from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

export interface GiftCardFilters {
  branchId: string | 'all';
  scope: 'all' | 'active' | 'redeemed';
  q?: string;
  page: number;
  pageSize: number;
}

export const giftCardsApi = {
  async list(f: GiftCardFilters): Promise<Paginated<GiftCardView>> {
    const { data } = await http.get<Envelope<Paginated<GiftCardView>>>('/gift-cards', {
      params: {
        branchId: f.branchId,
        scope: f.scope,
        q: f.q || undefined,
        page: f.page,
        pageSize: f.pageSize,
      },
    });
    return data.data;
  },
  async issue(input: IssueGiftCardInput): Promise<GiftCardView> {
    const { data } = await http.post<Envelope<GiftCardView>>('/gift-cards/issue', input);
    return data.data;
  },
  async lookup(code: string): Promise<GiftCardView> {
    const { data } = await http.get<Envelope<GiftCardView>>('/gift-cards/lookup', {
      params: { code },
    });
    return data.data;
  },
};

export function useGiftCards(f: GiftCardFilters) {
  return useQuery({
    queryKey: ['giftCards', f],
    queryFn: () => giftCardsApi.list(f),
    placeholderData: (prev) => prev,
  });
}

/** Full card incl. the latest 20 ledger rows — powers the detail sheet and the quick balance check. */
export function useGiftCardLookup(code: string | null) {
  return useQuery({
    queryKey: ['giftCards', 'lookup', code],
    queryFn: () => giftCardsApi.lookup(code as string),
    enabled: Boolean(code),
    retry: false,
  });
}

export function useIssueGiftCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: giftCardsApi.issue,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['giftCards'] }),
  });
}
