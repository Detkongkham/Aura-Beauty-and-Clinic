import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — ຕ້ອງມີ PostgreSQL (DATABASE_URL) + `prisma migrate deploy` ແລ້ວ.
 * CI ຕັ້ງ service postgres ໃຫ້ແລ້ວ; local ໃຫ້ `pnpm docker:up` ກ່ອນ.
 */
const PHONE = '02088800001';

describe('auth flow', () => {
  let app: Express;

  beforeAll(async () => {
    app = createApp();
    await prisma.user.deleteMany({ where: { phone: PHONE } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { phone: PHONE } });
    await prisma.$disconnect();
  });

  it('register → login → me → refresh', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Test QA', phone: PHONE, password: 'Passw0rd!' });
    expect(reg.status).toBe(201);
    expect(reg.body.data.user.role).toBe('CUSTOMER');
    expect(reg.body.data.tokens.accessToken).toBeTruthy();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: PHONE, password: 'Passw0rd!' });
    expect(login.status).toBe(200);
    const { accessToken, refreshToken } = login.body.data.tokens;

    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.phone).toBe(PHONE);

    const bad = await request(app).get('/api/v1/auth/me');
    expect(bad.status).toBe(401);

    const refreshed = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.tokens.accessToken).toBeTruthy();
  });

  it('ປະຕິເສດ login ດ້ວຍລະຫັດຜິດ', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: PHONE, password: 'wrong-pass' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('ແກ້ໄຂໂປຣໄຟລ໌ + ປ່ຽນລະຫັດຜ່ານ', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: PHONE, password: 'Passw0rd!' });
    const token = login.body.data.tokens.accessToken as string;
    const auth = (): [string, string] => ['Authorization', `Bearer ${token}`];

    // PATCH /auth/me — ຊື່ + ອີເມວ
    const patch = await request(app)
      .patch('/api/v1/auth/me')
      .set(...auth())
      .send({ name: 'QA Renamed', email: 'qa-renamed@aura.la' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.name).toBe('QA Renamed');
    expect(patch.body.data.email).toBe('qa-renamed@aura.la');

    // ລະຫັດປັດຈຸບັນຜິດ → 401
    const wrong = await request(app)
      .post('/api/v1/auth/change-password')
      .set(...auth())
      .send({ currentPassword: 'nope-nope', newPassword: 'Fresh0rd!' });
    expect(wrong.status).toBe(401);

    // ປ່ຽນສຳເລັດ → login ດ້ວຍລະຫັດໃໝ່ໄດ້
    const ok = await request(app)
      .post('/api/v1/auth/change-password')
      .set(...auth())
      .send({ currentPassword: 'Passw0rd!', newPassword: 'Fresh0rd!' });
    expect(ok.status).toBe(200);

    const relogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: PHONE, password: 'Fresh0rd!' });
    expect(relogin.status).toBe(200);
  });
});
