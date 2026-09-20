import type { AuthResponse } from '@abcp/shared-types';
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { env } from '../config/env';
import { useAuthStore } from '../store/auth.store';

export const http = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 15_000,
});

/** bare client — ໃຊ້ສຳລັບ /auth/* ເພື່ອຫຼີກ interceptor recursion. */
export const authHttp = axios.create({ baseURL: env.apiBaseUrl, timeout: 15_000 });

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;
  try {
    const { data } = await authHttp.post<{ data: AuthResponse }>('/auth/refresh', { refreshToken });
    useAuthStore.getState().setSession({ tokens: data.data.tokens, user: data.data.user });
    return data.data.tokens.accessToken;
  } catch {
    useAuthStore.getState().clear();
    return null;
  }
}

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      refreshInFlight ??= refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
      const newToken = await refreshInFlight;
      if (newToken) {
        original.headers.set('Authorization', `Bearer ${newToken}`);
        return http(original);
      }
    }
    return Promise.reject(error);
  },
);
