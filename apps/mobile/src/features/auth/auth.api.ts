import type {
  AuthResponse,
  AuthUser,
  ChangePasswordInput,
  ForgotPasswordResult,
  LoginInput,
  LoginResult,
  MfaActivateResult,
  RegisterInput,
  ResetPasswordInput,
  TwoFactorSetup,
  UpdateProfileInput,
  UserPreferences,
  UserPreferencesResponse,
} from '@abcp/shared-types';
import { authHttp, http } from '../../services/http';

/** Either a session or an MFA challenge (`isMfaChallenge`) for staff with 2FA. */
export async function apiLogin(input: LoginInput): Promise<LoginResult> {
  const { data } = await authHttp.post<{ data: LoginResult }>('/auth/login', input);
  return data.data;
}

export async function apiMfaVerify(mfaToken: string, code: string): Promise<AuthResponse> {
  const { data } = await authHttp.post<{ data: AuthResponse }>('/auth/2fa/verify', { mfaToken, code });
  return data.data;
}

export async function apiMfaSetup(mfaToken: string): Promise<TwoFactorSetup> {
  const { data } = await authHttp.post<{ data: TwoFactorSetup }>('/auth/2fa/setup', { mfaToken });
  return data.data;
}

export async function apiMfaActivate(mfaToken: string, code: string): Promise<MfaActivateResult> {
  const { data } = await authHttp.post<{ data: MfaActivateResult }>('/auth/2fa/activate', { mfaToken, code });
  return data.data;
}

export async function apiForgotPassword(phone: string): Promise<ForgotPasswordResult> {
  const { data } = await authHttp.post<{ data: ForgotPasswordResult }>('/auth/password/forgot', { phone });
  return data.data;
}

export async function apiResetPassword(input: ResetPasswordInput): Promise<void> {
  await authHttp.post('/auth/password/reset', input);
}

/** Revokes this device's session server-side (refresh token in the body, no access token needed). */
export async function apiLogout(refreshToken: string): Promise<void> {
  await authHttp.post('/auth/logout', { refreshToken });
}

export async function apiRegister(input: RegisterInput): Promise<AuthResponse> {
  const { data } = await authHttp.post<{ data: AuthResponse }>('/auth/register', input);
  return data.data;
}

export async function apiMe(): Promise<AuthUser> {
  const { data } = await http.get<{ data: AuthUser }>('/auth/me');
  return data.data;
}

export async function apiUpdateProfile(input: UpdateProfileInput): Promise<AuthUser> {
  const { data } = await http.patch<{ data: AuthUser }>('/auth/me', input);
  return data.data;
}

export async function apiChangePassword(input: ChangePasswordInput): Promise<void> {
  await http.post('/auth/change-password', input);
}

export async function apiGetPreferences(): Promise<UserPreferencesResponse> {
  const { data } = await http.get<{ data: UserPreferencesResponse }>('/auth/me/preferences');
  return data.data;
}

export async function apiUpdatePreferences(patch: UserPreferences): Promise<UserPreferencesResponse> {
  const { data } = await http.patch<{ data: UserPreferencesResponse }>('/auth/me/preferences', patch);
  return data.data;
}
