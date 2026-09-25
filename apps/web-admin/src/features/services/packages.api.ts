import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePackageInput, PackageView, UpdatePackageInput } from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

const KEY = ['packages', 'admin'] as const;

/** Admin package catalogue — GET /packages/admin includes packages that are off sale. */
export function useAdminPackages(branchId?: string) {
  return useQuery({
    queryKey: [...KEY, branchId ?? 'all'],
    queryFn: async () =>
      (await http.get<Envelope<PackageView[]>>('/packages/admin', { params: branchId ? { branchId } : undefined })).data.data,
  });
}

export function useSavePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id?: string; create?: CreatePackageInput; update?: UpdatePackageInput }) =>
      v.id
        ? (await http.patch<Envelope<PackageView>>(`/packages/${v.id}`, v.update)).data.data
        : (await http.post<Envelope<PackageView>>('/packages', v.create)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['packages'] }),
  });
}
