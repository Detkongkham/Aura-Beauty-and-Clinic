import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — Phase 7C M30 AI Skin & Hair Camera (rule-based heuristic, no ML vendor).
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const CUST_PHONE = '02088830077';
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

async function wipe(): Promise<void> {
  const user = await prisma.user.findUnique({ where: { phone: CUST_PHONE }, select: { id: true } });
  if (user) await prisma.skinHairAnalysis.deleteMany({ where: { userId: user.id } });
  await prisma.user.deleteMany({ where: { phone: CUST_PHONE } });
}

describe('Phase 7C — M30 AI Skin & Hair Camera', () => {
  let app: Express;
  let custToken: string;

  beforeAll(async () => {
    app = createApp();
    await wipe();
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Skin QA', phone: CUST_PHONE, password: 'Passw0rd!' });
    custToken = reg.body.data.tokens.accessToken as string;
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('ບໍ່ login → 401', async () => {
    const res = await request(app).get('/api/v1/skin-analysis/me');
    expect(res.status).toBe(401);
  });

  it('POST SKIN → 201, ຄືນ labels+recommendationText+ບໍ່ແມ່ນ ML ແທ້ (heuristic ຄົງທີ່)', async () => {
    const res = await request(app)
      .post('/api/v1/skin-analysis')
      .set(...bearer(custToken))
      .send({ kind: 'SKIN', contentType: 'image/png', dataBase64: TINY_PNG });

    expect(res.status).toBe(201);
    expect(res.body.data.kind).toBe('SKIN');
    expect(res.body.data.photoUrl).toMatch(/^http/);
    expect(Array.isArray(res.body.data.labels)).toBe(true);
    expect(res.body.data.labels.length).toBeGreaterThan(0);
    expect(typeof res.body.data.recommendationText).toBe('string');
    expect(res.body.data.recommendationText.length).toBeGreaterThan(0);
  });

  it('POST HAIR → 201, labels ມາຈາກຊຸດຄຳສັບຂອງຜົມ', async () => {
    const res = await request(app)
      .post('/api/v1/skin-analysis')
      .set(...bearer(custToken))
      .send({ kind: 'HAIR', contentType: 'image/png', dataBase64: TINY_PNG });

    expect(res.status).toBe(201);
    expect(res.body.data.kind).toBe('HAIR');
    const HAIR_LABELS = ['DRY_LOW_SHINE_HAIR', 'HIGH_SHINE_HAIR', 'HEALTHY_HAIR'];
    expect(HAIR_LABELS).toContain(res.body.data.labels[0]);
  });

  it('GET /me → ຄືນລາຍການຂອງຕົນເອງ, ໃໝ່ສຸດກ່ອນ', async () => {
    const res = await request(app).get('/api/v1/skin-analysis/me').set(...bearer(custToken));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data[0].kind).toBe('HAIR');
    expect(res.body.data[1].kind).toBe('SKIN');
  });

  it('dataBase64 ຫວ່າງ → 400 validation error', async () => {
    const res = await request(app)
      .post('/api/v1/skin-analysis')
      .set(...bearer(custToken))
      .send({ kind: 'SKIN', contentType: 'image/png', dataBase64: '' });
    expect(res.status).toBe(400);
  });
});
