import type { BranchAmenity, BranchDayHours, BranchHistoryEntry, BranchInsightsView } from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { http } from '@/services/http';
import { queryKeys } from '@/services/queryKeys';
import type { Branch } from '@/types/models';

interface Envelope<T> {
  data: T;
}

export type BranchInput = Partial<
  Pick<
    Branch,
    | 'name'
    | 'code'
    | 'address'
    | 'phone'
    | 'province'
    | 'latitude'
    | 'longitude'
    | 'openTime'
    | 'closeTime'
    | 'isActive'
    | 'allowNegativeStock'
  >
> & {
  email?: string;
  amenities?: BranchAmenity[];
  /** Confirms closing a branch that still has upcoming appointments (else 409). */
  force?: boolean;
  /** Wave 11 */
  weeklyHours?: BranchDayHours[] | null;
  managerUserId?: string | null;
  coverImageUrl?: string | null;
  photoUrls?: string[];
  monthlyRevenueTarget?: number | null;
  monthlyBookingTarget?: number | null;
};

export const branchesApi = {
  async list(): Promise<Branch[]> {
    const { data } = await http.get<Envelope<{ items: Branch[] }>>('/branches');
    return data.data.items;
  },
  async insights(days: number): Promise<BranchInsightsView> {
    const { data } = await http.get<Envelope<BranchInsightsView>>('/branches/insights', { params: { days } });
    return data.data;
  },
  async create(input: BranchInput): Promise<Branch> {
    const { data } = await http.post<Envelope<Branch>>('/branches', input);
    return data.data;
  },
  async update(id: string, input: BranchInput): Promise<Branch> {
    const { data } = await http.patch<Envelope<Branch>>(`/branches/${id}`, input);
    return data.data;
  },
};

export function useBranches() {
  return useQuery({
    queryKey: queryKeys.branches.list(),
    queryFn: branchesApi.list,
    staleTime: 5 * 60_000,
  });
}

/** Per-branch operating metrics (SUPER_ADMIN: all branches, BRANCH_ADMIN: own branch only). */
export function useBranchInsights(days: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.branches.insights(days),
    queryFn: () => branchesApi.insights(days),
    staleTime: 60_000,
    refetchInterval: 120_000,
    enabled,
  });
}

export function useSaveBranch(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BranchInput) =>
      id ? branchesApi.update(id, input) : branchesApi.create(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['branches'] }),
  });
}

/** Wave 11 — archived branches (SUPER_ADMIN), change history, archive / restore. */
export function useArchivedBranches(enabled: boolean) {
  return useQuery({
    queryKey: ['branches', 'archived'],
    queryFn: async () =>
      (await http.get<Envelope<{ items: Branch[] }>>('/branches', { params: { includeArchived: 'true' } })).data.data.items.filter(
        (b) => b.archivedAt,
      ),
    enabled,
  });
}

export function useBranchHistory(id: string | null) {
  return useQuery({
    queryKey: ['branches', 'history', id],
    queryFn: async () => (await http.get<Envelope<BranchHistoryEntry[]>>(`/branches/${id}/history`)).data.data,
    enabled: Boolean(id),
  });
}

export function useArchiveBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; force?: boolean; restore?: boolean }) =>
      v.restore
        ? (await http.post<Envelope<Branch>>(`/branches/${v.id}/restore`)).data.data
        : (await http.delete<Envelope<Branch>>(`/branches/${v.id}`, { params: v.force ? { force: 'true' } : undefined })).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['branches'] }),
  });
}
