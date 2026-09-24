import {
  isMfaChallenge,
  type AuthResponse,
  type LoginInput,
  type MfaChallenge,
  type RegisterInput,
} from '@abcp/shared-types';
import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import i18n from '../../i18n';
import { registerPushToken, unregisterPushToken } from '../../lib/push';
import { normalizeError } from '../../services/apiError';
import { useAuthStore } from '../../store/auth.store';
import { apiLogin, apiLogout, apiRegister } from './auth.api';

/** ແອັບນີ້ຮອງຮັບ 2 ບົດບາດ: ລູກຄ້າ (ຈອງ) ແລະ ພະນັກງານ (Staff Portal — Phase 4). */
const APP_ROLES = ['CUSTOMER', 'STAFF'] as const;

function assertAppUser(res: AuthResponse): AuthResponse {
  if (!(APP_ROLES as readonly string[]).includes(res.user.role)) {
    // Tokens were already issued — close that session on the server too.
    void apiLogout(res.tokens.refreshToken).catch(() => {});
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

  /** Last step of any sign-in (password, 2FA, enrolment): role gate, persist, push token. */
  const completeLogin = useCallback(
    (res: AuthResponse) => {
      assertAppUser(res);
      setSession({ tokens: res.tokens, user: res.user });
      void registerPushToken();
    },
    [setSession],
  );

  /** Resolves with the challenge when a second step (2FA) is needed; otherwise signs in. */
  const loginMutation = useMutation({
    mutationFn: async (input: LoginInput): Promise<MfaChallenge | null> => {
      const res = await apiLogin(input);
      if (isMfaChallenge(res)) return res;
      completeLogin(res);
      return null;
    },
  });

  const registerMutation = useMutation({
    mutationFn: (input: RegisterInput) => apiRegister(input),
    onSuccess: (res) => {
      setSession({ tokens: res.tokens, user: res.user });
      void registerPushToken();
    },
  });

  /** Signs out locally at once; the server session + push token are revoked in the background. */
  const logout = useCallback(() => {
    const { accessToken, refreshToken } = useAuthStore.getState();
    void unregisterPushToken(accessToken);
    if (refreshToken) void apiLogout(refreshToken).catch(() => {});
    clear();
  }, [clear]);

  return {
    user,
    logout,
    updateUser,
    completeLogin,
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
