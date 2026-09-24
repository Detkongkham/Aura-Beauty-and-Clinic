import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminUser,
  CreateUserInput,
  PermissionOverride,
  IssuedResetCode,
  UpdateUserInput,
  UserPermissionsResponse,
  UserSecurityView,
} from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

export const usersApi = {
  async list(): Promise<AdminUser[]> {
    const { data } = await http.get<Envelope<{ items: AdminUser[] }>>('/users');
    return data.data.items;
  },
  async create(input: CreateUserInput): Promise<AdminUser> {
    const { data } = await http.post<Envelope<AdminUser>>('/users', input);
    return data.data;
  },
  async update(id: string, input: UpdateUserInput): Promise<AdminUser> {
    const { data } = await http.patch<Envelope<AdminUser>>(`/users/${id}`, input);
    return data.data;
  },
  async getPermissions(id: string): Promise<UserPermissionsResponse> {
    const { data } = await http.get<Envelope<UserPermissionsResponse>>(`/users/${id}/permissions`);
    return data.data;
  },
  async setPermissions(id: string, overrides: PermissionOverride[]): Promise<UserPermissionsResponse> {
    const { data } = await http.put<Envelope<UserPermissionsResponse>>(`/users/${id}/permissions`, {
      overrides,
    });
    return data.data;
  },
  async setQuickLoginPin(id: string, pin: string): Promise<AdminUser> {
    const { data } = await http.post<Envelope<AdminUser>>(`/users/${id}/quick-login`, { pin });
    return data.data;
  },
  async disableQuickLogin(id: string): Promise<AdminUser> {
    const { data } = await http.delete<Envelope<AdminUser>>(`/users/${id}/quick-login`);
    return data.data;
  },
};

const usersKey = ['users'] as const;

export function useUsers() {
  return useQuery({ queryKey: usersKey, queryFn: usersApi.list });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => void qc.invalidateQueries({ queryKey: usersKey }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) => usersApi.update(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: usersKey });
      // A role reassignment shifts member counts on the Permissions page's role rail.
      void qc.invalidateQueries({ queryKey: ['roles'] });
    },
  });
}

export function useUserPermissions(userId: string | null) {
  return useQuery({
    queryKey: [...usersKey, userId, 'permissions'],
    queryFn: () => usersApi.getPermissions(userId!),
    enabled: Boolean(userId),
  });
}

export function useSetUserPermissions(userId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (overrides: PermissionOverride[]) => usersApi.setPermissions(userId!, overrides),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...usersKey, userId, 'permissions'] }),
  });
}

export function useSetQuickLoginPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pin }: { id: string; pin: string }) => usersApi.setQuickLoginPin(id, pin),
    onSuccess: () => void qc.invalidateQueries({ queryKey: usersKey }),
  });
}

export function useDisableQuickLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.disableQuickLogin(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: usersKey }),
  });
}

// --- Another user's account security (sessions, lockout, 2FA, reset code) ---

const securityKey = (id: string | null) => ['users', 'security', id] as const;

export function useUserSecurity(userId: string | null) {
  return useQuery({
    queryKey: securityKey(userId),
    enabled: Boolean(userId),
    queryFn: async () =>
      (await http.get<Envelope<UserSecurityView>>(`/users/${userId}/security`)).data.data,
  });
}

function useSecurityAction<TVars, TResult = unknown>(
  userId: string | null,
  fn: (id: string, vars: TVars) => Promise<TResult>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: TVars) => fn(userId!, vars),
    onSuccess: () => void qc.invalidateQueries({ queryKey: securityKey(userId) }),
  });
}

export const useRevokeUserSession = (userId: string | null) =>
  useSecurityAction<string>(userId, async (id, sid) => (await http.delete(`/users/${id}/sessions/${sid}`)).data);

export const useRevokeAllUserSessions = (userId: string | null) =>
  useSecurityAction<void, { revoked: number }>(
    userId,
    async (id) => (await http.post<Envelope<{ revoked: number }>>(`/users/${id}/sessions/revoke-all`)).data.data,
  );

export const useUnlockUser = (userId: string | null) =>
  useSecurityAction<void>(userId, async (id) => (await http.post(`/users/${id}/unlock`)).data);

export const useResetUserTwoFactor = (userId: string | null) =>
  useSecurityAction<void>(userId, async (id) => (await http.delete(`/users/${id}/2fa`)).data);

export const useIssueResetCode = (userId: string | null) =>
  useSecurityAction<void, IssuedResetCode>(
    userId,
    async (id) => (await http.post<Envelope<IssuedResetCode>>(`/users/${id}/password-reset`)).data.data,
  );
