import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePricingRuleInput,
  PricingRuleView,
  UpdatePricingRuleInput,
} from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

export interface PricingRuleFilters {
  branchId?: string;
  serviceId?: string;
  isActive?: 'true' | 'false';
}

const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

const KEY = ['pricing-rules'];

export function usePricingRules(f: PricingRuleFilters) {
  return useQuery({
    queryKey: [...KEY, f],
    queryFn: async () => {
      const { data } = await http.get<Envelope<PricingRuleView[]>>('/pricing-rules', {
        params: clean({ branchId: f.branchId ?? 'all', serviceId: f.serviceId, isActive: f.isActive }),
      });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useCreatePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePricingRuleInput) => {
      const { data } = await http.post<Envelope<PricingRuleView>>('/pricing-rules', input);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdatePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdatePricingRuleInput }) => {
      const { data } = await http.patch<Envelope<PricingRuleView>>(`/pricing-rules/${id}`, input);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeletePricingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/pricing-rules/${id}`);
      return id;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
