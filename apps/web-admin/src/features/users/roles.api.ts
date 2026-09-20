import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateRoleInput, Role, UpdateRoleInput } from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

export const rolesApi = {
  async list(): Promise<Role[]> {
    const { data } = await http.get<Envelope<{ items: Role[] }>>('/roles');
    return data.data.items;
  },
  async create(input: CreateRoleInput): Promise<Role> {
    const { data } = await http.post<Envelope<Role>>('/roles', input);
    return data.data;
  },
  async update(id: string, input: UpdateRoleInput): Promise<Role> {
    const { data } = await http.patch<Envelope<Role>>(`/roles/${id}`, input);
    return data.data;
  },
  async remove(id: string): Promise<void> {
    await http.delete(`/roles/${id}`);
  },
};

const rolesKey = ['roles'] as const;
const usersKey = ['users'] as const;

export function useRoles() {
  return useQuery({ queryKey: rolesKey, queryFn: rolesApi.list });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: rolesApi.create,
    onSuccess: () => void qc.invalidateQueries({ queryKey: rolesKey }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRoleInput }) => rolesApi.update(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: rolesKey });
      // A role's own permissions changing affects every member's effective permissions.
      void qc.invalidateQueries({ queryKey: usersKey });
    },
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rolesApi.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: rolesKey }),
  });
}
