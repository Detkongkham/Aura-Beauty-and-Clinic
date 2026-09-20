import { http } from 'msw';

import { api, delay, fail, ok } from '../helpers';
import { db } from '../fixtures/store';
import { publicUser } from '../fixtures/users';

const users = db.users;

interface LoginBody {
  phone?: string;
  password?: string;
}
interface RefreshBody {
  refreshToken?: string;
}

const TOKEN_PREFIX = 'mock-access.';
const REFRESH_PREFIX = 'mock-refresh.';

function issueTokens(userId: string) {
  return {
    accessToken: `${TOKEN_PREFIX}${userId}.${Date.now()}`,
    refreshToken: `${REFRESH_PREFIX}${userId}`,
    expiresIn: 900,
  };
}

function userIdFromAuthHeader(header: string | null): string | null {
  if (!header?.startsWith(`Bearer ${TOKEN_PREFIX}`)) return null;
  return header.slice(`Bearer ${TOKEN_PREFIX}`.length).split('.')[0] ?? null;
}

export const authHandlers = [
  http.post(api('/auth/login'), async ({ request }) => {
    await delay();
    const body = (await request.json().catch(() => ({}))) as LoginBody;
    const user = users.find((u) => u.phone === body.phone);
    if (!user || user.password !== body.password) {
      return fail(401, 'INVALID_CREDENTIALS', 'ເບີໂທ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ');
    }
    return ok({ user: publicUser(user, db.roles), tokens: issueTokens(user.id) });
  }),

  http.post(api('/auth/refresh'), async ({ request }) => {
    await delay(120);
    const body = (await request.json().catch(() => ({}))) as RefreshBody;
    const userId = body.refreshToken?.startsWith(REFRESH_PREFIX)
      ? body.refreshToken.slice(REFRESH_PREFIX.length)
      : null;
    const user = userId ? users.find((u) => u.id === userId) : null;
    if (!user) return fail(401, 'TOKEN_INVALID', 'Session expired');
    return ok({ user: publicUser(user, db.roles), tokens: issueTokens(user.id) });
  }),

  http.get(api('/auth/me'), async ({ request }) => {
    await delay(120);
    const userId = userIdFromAuthHeader(request.headers.get('Authorization'));
    const user = userId ? users.find((u) => u.id === userId) : null;
    if (!user) return fail(401, 'UNAUTHORIZED', 'ຕ້ອງເຂົ້າສູ່ລະບົບກ່ອນ');
    return ok(publicUser(user, db.roles));
  }),
];
