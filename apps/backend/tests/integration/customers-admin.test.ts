import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — Web Admin ▸ CRM / Customers.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed` (seeded admin 02000000000 / Admin@12345).
 */
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const NEW_CUSTOMER_PHONE = '02099911777';

describe('customers admin API', () => {
  let app: Express;
  let adminToken: string;
  let createdId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.user.deleteMany({ where: { phone: NEW_CUSTOMER_PHONE } });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    adminToken = login.body.data.tokens.accessToken as string;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { phone: NEW_CUSTOMER_PHONE } });
    await prisma.$disconnect();
  });

  const bearer = (): [string, string] => ['Authorization', `Bearer ${adminToken}`];

  it('ດຶງລາຍຊື່ລູກຄ້າ ແບບແບ່ງໜ້າ + KPI fields', async () => {
    const res = await request(app).get('/api/v1/customers?pageSize=5').set(...bearer());
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ page: 1, pageSize: 5 });
    expect(Array.isArray(res.body.data.items)).toBe(true);
    if (res.body.data.items.length > 0) {
      const c = res.body.data.items[0];
      expect(typeof c.totalVisits).toBe('number');
      expect(typeof c.totalSpent).toBe('number');
      expect(c).toHaveProperty('loyaltyTier');
      expect(c).toHaveProperty('lastVisitAt');
    }
  });

  it('ສ້າງ → ດຶງລາຍລະອຽດ (ມີ history) → ແກ້ notes', async () => {
    const create = await request(app)
      .post('/api/v1/customers')
      .set(...bearer())
      .send({ name: 'CRM QA', phone: NEW_CUSTOMER_PHONE, gender: 'FEMALE', birthDate: '1996-03-04' });
    expect(create.status).toBe(201);
    expect(create.body.data).toMatchObject({ gender: 'FEMALE', birthDate: '1996-03-04', totalVisits: 0 });
    createdId = create.body.data.id as string;

    const detail = await request(app).get(`/api/v1/customers/${createdId}`).set(...bearer());
    expect(detail.status).toBe(200);
    expect(Array.isArray(detail.body.data.history)).toBe(true);

    const patch = await request(app)
      .patch(`/api/v1/customers/${createdId}`)
      .set(...bearer())
      .send({ notes: 'ແພ້ນ້ຳຫອມ' });
    expect(patch.status).toBe(200);
    expect(patch.body.data.notes).toBe('ແພ້ນ້ຳຫອມ');
  });

  it('409 ເມື່ອເບີໂທຊ້ຳ, 404 ສຳລັບ id ທີ່ບໍ່ມີ', async () => {
    const dup = await request(app)
      .post('/api/v1/customers')
      .set(...bearer())
      .send({ name: 'Dup', phone: NEW_CUSTOMER_PHONE });
    expect(dup.status).toBe(409);
    const missing = await request(app)
      .get('/api/v1/customers/00000000-0000-0000-0000-0000000000ff')
      .set(...bearer());
    expect(missing.status).toBe(404);
  });
});
