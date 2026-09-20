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
>;

export const branchesApi = {
  async list(): Promise<Branch[]> {
    const { data } = await http.get<Envelope<{ items: Branch[] }>>('/branches');
    return data.data.items;
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

export function useSaveBranch(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BranchInput) =>
      id ? branchesApi.update(id, input) : branchesApi.create(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['branches'] }),
  });
}
