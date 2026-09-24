import type {
  AuthResponse,
  AuthUser,
  ForgotPasswordResult,
  LoginInput,
  LoginResult,
  MfaActivateResult,
  ResetPasswordInput,
  TwoFactorSetup,
} from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

export const authApi = {
  /** Either a full session or an MFA challenge (`isMfaChallenge`) — 2FA / forced enrolment. */
  async login(input: LoginInput): Promise<LoginResult> {
    const { data } = await http.post<Envelope<LoginResult>>('/auth/login', input);
    return data.data;
  },

  async mfaVerify(mfaToken: string, code: string): Promise<AuthResponse> {
    const { data } = await http.post<Envelope<AuthResponse>>('/auth/2fa/verify', { mfaToken, code });
    return data.data;
  },

  async mfaSetup(mfaToken: string): Promise<TwoFactorSetup> {
    const { data } = await http.post<Envelope<TwoFactorSetup>>('/auth/2fa/setup', { mfaToken });
    return data.data;
  },

  async mfaActivate(mfaToken: string, code: string): Promise<MfaActivateResult> {
    const { data } = await http.post<Envelope<MfaActivateResult>>('/auth/2fa/activate', { mfaToken, code });
    return data.data;
  },

  async forgotPassword(phone: string): Promise<ForgotPasswordResult> {
    const { data } = await http.post<Envelope<ForgotPasswordResult>>('/auth/password/forgot', { phone });
    return data.data;
  },

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    await http.post('/auth/password/reset', input);
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
