import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChannelStatusView,
  ConsentSummaryView,
  CreateSuppressionInput,
  MarketingPolicy,
  SuppressionListQuery,
  SuppressionView,
  CampaignRecipientView,
  CampaignRunView,
  CampaignType,
  CampaignView,
  CreateCampaignInput,
  Paginated,
  UpdateCampaignInput,
} from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

export interface CampaignFilters {
  branchId: string | 'all';
  type?: CampaignType;
  page: number;
  pageSize: number;
}

export const marketingApi = {
  async list(f: CampaignFilters): Promise<Paginated<CampaignView>> {
    const { data } = await http.get<Envelope<Paginated<CampaignView>>>('/marketing/campaigns', {
      params: { branchId: f.branchId, type: f.type, page: f.page, pageSize: f.pageSize },
    });
    return data.data;
  },
  async create(input: CreateCampaignInput): Promise<CampaignView> {
    const { data } = await http.post<Envelope<CampaignView>>('/marketing/campaigns', input);
    return data.data;
  },
  async update(id: string, input: UpdateCampaignInput): Promise<CampaignView> {
    const { data } = await http.patch<Envelope<CampaignView>>(`/marketing/campaigns/${id}`, input);
    return data.data;
  },
  async remove(id: string): Promise<void> {
    await http.delete(`/marketing/campaigns/${id}`);
  },
  async run(id: string): Promise<CampaignRunView> {
    const { data } = await http.post<Envelope<CampaignRunView>>(`/marketing/campaigns/${id}/run`, {});
    return data.data;
  },
  async recipients(id: string): Promise<CampaignRecipientView[]> {
    const { data } = await http.get<Envelope<{ items: CampaignRecipientView[] }>>(
      `/marketing/campaigns/${id}/recipients`,
    );
    return data.data.items;
  },
};

export function useCampaigns(f: CampaignFilters) {
  return useQuery({
    queryKey: ['campaigns', f],
    queryFn: () => marketingApi.list(f),
    placeholderData: (prev) => prev,
  });
}

export function useCampaignRecipients(id: string | null) {
  return useQuery({
    queryKey: ['campaigns', 'recipients', id],
    queryFn: () => marketingApi.recipients(id!),
    enabled: Boolean(id),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['campaigns'] });
}

export function useCreateCampaign() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: marketingApi.create, onSuccess: invalidate });
}
export function useUpdateCampaign() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCampaignInput }) =>
      marketingApi.update(id, input),
    onSuccess: invalidate,
  });
}
export function useDeleteCampaign() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: marketingApi.remove, onSuccess: invalidate });
}
export function useRunCampaign() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: marketingApi.run, onSuccess: invalidate });
}

// ---- Wave 10G: consent / suppression / policy ----------------------

/** ຊ່ອງທາງໃດຕັ້ງຄ່າຜູ້ໃຫ້ບໍລິການແລ້ວ (SMS/ອີເມວ/LINE ສົ່ງຈິງໄດ້ບໍ່). */
export function useChannelStatus(enabled = true) {
  return useQuery({
    queryKey: ['marketing', 'channels'],
    queryFn: async () => (await http.get<Envelope<ChannelStatusView>>('/marketing/channels')).data.data,
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useConsentSummary(enabled = true) {
  return useQuery({
    queryKey: ['marketing', 'consent-summary'],
    queryFn: async () => (await http.get<Envelope<ConsentSummaryView>>('/marketing/consent-summary')).data.data,
    enabled,
  });
}

export function useMarketingPolicy(enabled = true) {
  return useQuery({
    queryKey: ['marketing', 'policy'],
    queryFn: async () => (await http.get<Envelope<MarketingPolicy>>('/marketing/policy')).data.data,
    enabled,
  });
}

export function useSaveMarketingPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MarketingPolicy) =>
      (await http.put<Envelope<MarketingPolicy>>('/marketing/policy', input)).data.data,
    onSuccess: (data) => qc.setQueryData(['marketing', 'policy'], data),
  });
}

export function useSuppressions(q: Partial<SuppressionListQuery>, enabled = true) {
  return useQuery({
    queryKey: ['marketing', 'suppressions', q],
    queryFn: async () =>
      (await http.get<Envelope<Paginated<SuppressionView>>>('/marketing/suppressions', { params: q })).data.data,
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useAddSuppression() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CreateSuppressionInput> & Pick<CreateSuppressionInput, 'identifier' | 'channel'>) =>
      (await http.post<Envelope<SuppressionView>>('/marketing/suppressions', input)).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['marketing'] }),
  });
}

export function useRemoveSuppression() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => void (await http.delete(`/marketing/suppressions/${id}`)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['marketing'] }),
  });
}
