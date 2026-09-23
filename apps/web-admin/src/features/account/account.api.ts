import type {
  AccountActivityItem,
  AccountOverview,
  AccountSession,
  AuthUser,
  ChangePasswordInput,
  SetOwnQuickLoginPinInput,
  UpdateProfileInput,
} from '@abcp/shared-types';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/features/auth/auth.store';
import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

const KEYS = {
  all: ['account'] as const,
  overview: ['account', 'overview'] as const,
  sessions: ['account', 'sessions'] as const,
  activity: ['account', 'activity'] as const,
};

export function useAccountOverview() {
  return useQuery({
    queryKey: KEYS.overview,
    queryFn: async () => (await http.get<Envelope<AccountOverview>>('/auth/me/overview')).data.data,
  });
}

export function useAccountSessions() {
  return useQuery({
    queryKey: KEYS.sessions,
    queryFn: async () =>
      (await http.get<Envelope<{ items: AccountSession[] }>>('/auth/me/sessions')).data.data.items,
    refetchInterval: 60_000,
  });
}

export function useAccountActivity() {
  return useInfiniteQuery({
    queryKey: KEYS.activity,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await http.get<Envelope<{ items: AccountActivityItem[]; nextBefore: string | null }>>(
          '/auth/me/activity',
          {
            params: { limit: 15, ...(pageParam ? { before: pageParam } : {}) },
          },
        )
      ).data.data,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
}

/** Every account write refreshes the whole account cache — overview counts depend on all of them. */
function useInvalidateAccount() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEYS.all });
}

export function useUpdateProfile() {
  const invalidate = useInvalidateAccount();
  const setUser = useAuthStore((s) => s.setUser);
  return useMutation({
    mutationFn: async (input: UpdateProfileInput) =>
      (await http.patch<Envelope<AuthUser>>('/auth/me', input)).data.data,
    onSuccess: (user) => {
      // Topbar/UserMenu read the persisted session user — keep it in step.
      setUser(user);
      void invalidate();
    },
  });
}

export function useChangePassword() {
  const invalidate = useInvalidateAccount();
  return useMutation({
    mutationFn: async (input: ChangePasswordInput) =>
      (
        await http.post<Envelope<{ success: true; revokedSessions: number }>>(
          '/auth/change-password',
          input,
        )
      ).data.data,
    onSuccess: () => void invalidate(),
  });
}

export function useRevokeSession() {
  const invalidate = useInvalidateAccount();
  return useMutation({
    mutationFn: async (id: string) => (await http.delete(`/auth/me/sessions/${id}`)).data,
    onSuccess: () => void invalidate(),
  });
}

export function useRevokeOtherSessions() {
  const invalidate = useInvalidateAccount();
  return useMutation({
    mutationFn: async () =>
      (await http.post<Envelope<{ revoked: number }>>('/auth/me/sessions/revoke-others')).data.data,
    onSuccess: () => void invalidate(),
  });
}

export function useSetQuickLoginPin() {
  const invalidate = useInvalidateAccount();
  return useMutation({
    mutationFn: async (input: SetOwnQuickLoginPinInput) =>
      (await http.put('/auth/me/quick-login-pin', input)).data,
    onSuccess: () => void invalidate(),
  });
}

export function useDisableQuickLoginPin() {
  const invalidate = useInvalidateAccount();
  return useMutation({
    mutationFn: async () => (await http.delete('/auth/me/quick-login-pin')).data,
    onSuccess: () => void invalidate(),
  });
}
