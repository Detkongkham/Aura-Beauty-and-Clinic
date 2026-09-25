import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

import { env } from '@/config/env';
import { authStore, useAuthStore } from '@/features/auth/auth.store';
import { signOut, type LogoutReason } from '@/features/auth/signOut';

import { NormalizedApiError, normalizeError } from './apiError';

export type { LogoutReason } from '@/features/auth/signOut';

/**
 * 401 codes that mean the *session* is gone. Other 401s (wrong 2FA code, wrong current
 * password…) are about the input and must never sign anyone out.
 */
const SESSION_CODES = new Set(['UNAUTHORIZED', 'TOKEN_EXPIRED', 'TOKEN_INVALID', 'SESSION_IDLE', 'MFA_REQUIRED']);

function isSessionError(e: NormalizedApiError): boolean {
  return e.status === 401 && SESSION_CODES.has(e.code);
}

function logoutReason(code: string): LogoutReason {
  if (code === 'SESSION_IDLE') return 'idle';
  if (code === 'MFA_REQUIRED') return 'mfa';
  return 'revoked';
}

export const http: AxiosInstance = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 20_000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = authStore.getAccessToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

const PUBLIC_AUTH_PATH = /\/auth\/(login|register|refresh|quick-login|logout|2fa|password)\b/;

// --- Single-flight refresh: concurrent 401s share one refresh call ---
let refreshPromise: Promise<string> | null = null;

async function runRefresh(): Promise<string> {
  const refreshToken = authStore.getRefreshToken();
  if (!refreshToken)
    throw new NormalizedApiError({ code: 'UNAUTHORIZED', message: 'No session', status: 401 });

  const { data } = await axios.post<{
    data: {
      user: unknown;
      tokens: { accessToken: string; refreshToken: string; expiresIn: number };
    };
  }>('/auth/refresh', { refreshToken }, { baseURL: env.apiBaseUrl });
  const tokens = data.data.tokens;
  useAuthStore.getState().setTokens(tokens);
  return tokens.accessToken;
}

http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const normalized = normalizeError(error);
    const original = (error as { config?: AxiosRequestConfig & { _retried?: boolean } }).config;

    // Only the credential-exchange endpoints are exempt; /auth/me/* are ordinary authed calls.
    const isAuthEndpoint = typeof original?.url === 'string' && PUBLIC_AUTH_PATH.test(original.url);
    if (isAuthEndpoint || !isSessionError(normalized)) throw normalized;

    if (original != null && !original._retried) {
      original._retried = true;
      let newToken: string;
      try {
        refreshPromise ??= runRefresh().finally(() => {
          refreshPromise = null;
        });
        newToken = await refreshPromise;
      } catch (refreshErr) {
        const e = normalizeError(refreshErr);
        // Only a definitive "no" from the server ends the session. Offline, timeouts, 5xx or a
        // restarting backend keep the user signed in — the next request simply tries again.
        if (e.status === 401 || e.status === 403) signOut(logoutReason(e.code));
        throw normalized;
      }
      original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` };
      return http(original);
    }

    // Still refused with a freshly minted token: the session really is over.
    signOut(logoutReason(normalized.code));
    throw normalized;
  },
);
