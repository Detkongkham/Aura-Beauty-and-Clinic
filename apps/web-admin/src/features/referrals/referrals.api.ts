import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AffiliatePayoutView,
  AffiliateView,
  CreateAffiliatePayoutInput,
  EnrollAffiliateInput,
  Paginated,
  UpdateAffiliateInput,
  UpdateAffiliatePayoutStatusInput,
} from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

const KEY = ['affiliates'];

export function useAffiliates(params: { q?: string; page: number; pageSize: number }) {
  return useQuery({
    queryKey: [...KEY, params],
    queryFn: async () => {
      const { data } = await http.get<Envelope<Paginated<AffiliateView>>>('/affiliates', {
        params: {
          page: params.page,
          pageSize: params.pageSize,
          ...(params.q ? { q: params.q } : {}),
        },
      });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useAffiliatePayouts(affiliateId: string | null) {
  return useQuery({
    queryKey: [...KEY, affiliateId, 'payouts'],
    enabled: Boolean(affiliateId),
    queryFn: async () => {
      const { data } = await http.get<Envelope<AffiliatePayoutView[]>>(
        `/affiliates/${affiliateId}/payouts`,
      );
      return data.data;
    },
  });
}

export function useEnrollAffiliate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EnrollAffiliateInput) => {
      const { data } = await http.post<Envelope<AffiliateView>>('/affiliates', input);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateAffiliate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateAffiliateInput }) => {
      const { data } = await http.patch<Envelope<AffiliateView>>(`/affiliates/${id}`, input);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveAffiliate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/affiliates/${id}`);
      return id;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCreatePayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: CreateAffiliatePayoutInput }) => {
      const { data } = await http.post<Envelope<AffiliatePayoutView>>(
        `/affiliates/${id}/payouts`,
        input,
      );
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSetPayoutStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      payoutId,
      input,
    }: {
      payoutId: string;
      input: UpdateAffiliatePayoutStatusInput;
    }) => {
      const { data } = await http.patch<Envelope<AffiliatePayoutView>>(
        `/affiliates/payouts/${payoutId}`,
        input,
      );
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
