import type { AuthResponse, AuthUser, LoginInput } from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

export const authApi = {
  async login(input: LoginInput): Promise<AuthResponse> {
    const { data } = await http.post<Envelope<AuthResponse>>('/auth/login', input);
    return data.data;
  },

  /** Revokes this device's session server-side. Best-effort — local sign-out never waits on it. */
  async logout(refreshToken: string): Promise<void> {
    await http.post('/auth/logout', { refreshToken });
  },

  async me(): Promise<AuthUser> {
    const { data } = await http.get<Envelope<AuthUser>>('/auth/me');
    return data.data;
  },
};
