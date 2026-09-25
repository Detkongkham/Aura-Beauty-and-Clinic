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

/**
 * 401 codes that mean the *session* is gone. Other 401s (wrong 2FA code, wrong current
 * password…) are about the input — they must not refresh, and never sign anyone out.
 */
const SESSION_CODES = new Set(['UNAUTHORIZED', 'TOKEN_EXPIRED', 'TOKEN_INVALID', 'SESSION_IDLE', 'MFA_REQUIRED']);

function isSessionError(error: AxiosError): boolean {
  const code = (error.response?.data as { error?: { code?: string } } | undefined)?.error?.code;
  return error.response?.status === 401 && (!code || SESSION_CODES.has(code));
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;
  try {
    const { data } = await authHttp.post<{ data: AuthResponse }>('/auth/refresh', { refreshToken });
    useAuthStore.getState().setSession({ tokens: data.data.tokens, user: data.data.user });
    return data.data.tokens.accessToken;
  } catch (e) {
    // ອອກຈາກລະບົບສະເພາະເມື່ອ server ປະຕິເສດ session ແທ້ (401/403). ເນັດຫຼຸດ / timeout / 5xx
    // ບໍ່ເຕະຜູ້ໃຊ້ອອກ — request ຕໍ່ໄປຈະລອງໃໝ່ເອງ.
    const status = (e as AxiosError).response?.status;
    if (status === 401 || status === 403) useAuthStore.getState().clear();
    return null;
  }
}

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (!original || !isSessionError(error)) return Promise.reject(error);
    if (!original._retry) {
      original._retry = true;
      refreshInFlight ??= refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
      const newToken = await refreshInFlight;
      if (newToken) {
        original.headers.set('Authorization', `Bearer ${newToken}`);
        return http(original);
      }
    } else {
      // ຍັງຖືກປະຕິເສດທັງທີ່ token ຫາກໍ່ຕໍ່ອາຍຸ — session ໝົດແທ້.
      useAuthStore.getState().clear();
    }
    return Promise.reject(error);
  },
);
