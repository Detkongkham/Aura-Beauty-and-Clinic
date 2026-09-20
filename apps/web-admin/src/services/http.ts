import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

import { env } from '@/config/env';
import { authStore, useAuthStore } from '@/features/auth/auth.store';

import { NormalizedApiError, normalizeError } from './apiError';

/** Fired when the session is unrecoverable — the router listens and redirects to /login. */
export const AUTH_LOGOUT_EVENT = 'aura:auth-logout';

export function emitLogout(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT));
  }
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

// --- Single-flight refresh: concurrent 401s share one refresh call ---
let refreshPromise: Promise<string> | null = null;

async function runRefresh(): Promise<string> {
  const refreshToken = authStore.getRefreshToken();
  if (!refreshToken) throw new NormalizedApiError({ code: 'UNAUTHORIZED', message: 'No session', status: 401 });

  const { data } = await axios.post<{ data: { user: unknown; tokens: { accessToken: string; refreshToken: string; expiresIn: number } } }>(
    '/auth/refresh',
    { refreshToken },
    { baseURL: env.apiBaseUrl },
  );
  const tokens = data.data.tokens;
  useAuthStore.getState().setTokens(tokens);
  return tokens.accessToken;
}

http.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    const normalized = normalizeError(error);
    const original = (error as { config?: AxiosRequestConfig & { _retried?: boolean } }).config;

    const isAuthEndpoint = typeof original?.url === 'string' && original.url.includes('/auth/');
    const canRetry =
      normalized.status === 401 && original != null && !original._retried && !isAuthEndpoint;

    if (canRetry) {
      original._retried = true;
      try {
        refreshPromise ??= runRefresh().finally(() => {
          refreshPromise = null;
        });
        const newToken = await refreshPromise;
        original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` };
        return http(original);
      } catch {
        useAuthStore.getState().clear();
        emitLogout();
        throw normalized;
      }
    }

    if (normalized.status === 401 && !isAuthEndpoint) {
      useAuthStore.getState().clear();
      emitLogout();
    }

    throw normalized;
  },
);
