import type {
  AuthResponse,
  AuthUser,
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from '@abcp/shared-types';
import { authHttp, http } from '../../services/http';

export async function apiLogin(input: LoginInput): Promise<AuthResponse> {
  const { data } = await authHttp.post<{ data: AuthResponse }>('/auth/login', input);
  return data.data;
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
