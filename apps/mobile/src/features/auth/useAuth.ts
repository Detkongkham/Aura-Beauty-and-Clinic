import type { AuthResponse, LoginInput, RegisterInput } from '@abcp/shared-types';
import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import i18n from '../../i18n';
import { registerPushToken, unregisterPushToken } from '../../lib/push';
import { normalizeError } from '../../services/apiError';
import { useAuthStore } from '../../store/auth.store';
import { apiLogin, apiRegister } from './auth.api';

/** ແອັບນີ້ຮອງຮັບ 2 ບົດບາດ: ລູກຄ້າ (ຈອງ) ແລະ ພະນັກງານ (Staff Portal — Phase 4). */
const APP_ROLES = ['CUSTOMER', 'STAFF'] as const;

function assertAppUser(res: AuthResponse): AuthResponse {
  if (!(APP_ROLES as readonly string[]).includes(res.user.role)) {
    const err = new Error(i18n.t('errors.notAppUser'));
    err.name = 'NotCustomerError';
    throw err;
  }
  return res;
}

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const updateUser = useAuthStore((s) => s.updateUser);
  const clear = useAuthStore((s) => s.clear);

  const loginMutation = useMutation({
    mutationFn: async (input: LoginInput) => assertAppUser(await apiLogin(input)),
    onSuccess: (res) => {
      setSession({ tokens: res.tokens, user: res.user });
      void registerPushToken();
    },
  });

  const registerMutation = useMutation({
    mutationFn: (input: RegisterInput) => apiRegister(input),
    onSuccess: (res) => {
      setSession({ tokens: res.tokens, user: res.user });
      void registerPushToken();
    },
  });

  const logout = useCallback(() => {
    void unregisterPushToken();
    clear();
  }, [clear]);

  return {
    user,
    logout,
    updateUser,
    login: loginMutation.mutateAsync,
    register: registerMutation.mutateAsync,
    loginPending: loginMutation.isPending,
    registerPending: registerMutation.isPending,
    loginError: loginMutation.error
      ? loginMutation.error instanceof Error && loginMutation.error.name === 'NotCustomerError'
        ? loginMutation.error.message
        : normalizeError(loginMutation.error).message
      : null,
    registerError: registerMutation.error ? normalizeError(registerMutation.error).message : null,
  };
}
