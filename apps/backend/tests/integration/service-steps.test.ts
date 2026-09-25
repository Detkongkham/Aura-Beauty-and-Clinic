import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/** Wave 11 — Service.steps editable from web-admin (was seed/manual only); shows on the public detail view. */
const NAME = 'W11 Steps Facial';
let app: Express;
let token = '';

beforeAll(async () => {
  app = createApp();
  await prisma.service.deleteMany({ where: { name: NAME } });
  token = (await request(app).post('/api/v1/auth/login').send({ phone: '02000000000', password: 'Admin@12345' })).body.data.tokens.accessToken;
});

afterAll(async () => {
  await prisma.service.deleteMany({ where: { name: NAME } });
  await prisma.$disconnect();
});

describe('Service.steps admin editor', () => {
  it('create/update/clear steps; catalog detail returns them', async () => {
    const categoryId = (await prisma.serviceCategory.findFirstOrThrow()).id;
    const auth = (): [string, string] => ['Authorization', `Bearer ${token}`];
    const created = await request(app)
      .post('/api/v1/services')
      .set(...auth())
      .send({ categoryId, name: NAME, price: 100_000, durationMinutes: 30, steps: [{ title: 'Cleanse', body: 'Gentle wash' }] });
    expect(created.status).toBe(201);
    expect(created.body.data.steps).toEqual([{ title: 'Cleanse', body: 'Gentle wash' }]);
    const id = created.body.data.id as string;

    const patched = await request(app)
      .patch(`/api/v1/services/${id}`)
      .set(...auth())
      .send({ steps: [{ title: 'Cleanse', body: '' }, { title: 'Mask', body: '15 minutes' }] });
    expect(patched.body.data.steps).toHaveLength(2);

    const detail = await request(app).get(`/api/v1/catalog/services/${id}`).set(...auth());
    expect(detail.status).toBe(200);
    expect(detail.body.data.steps.map((s: { title: string }) => s.title)).toEqual(['Cleanse', 'Mask']);

    const bad = await request(app).patch(`/api/v1/services/${id}`).set(...auth()).send({ steps: [{ title: '' }] });
    expect(bad.status).toBe(400);

    const cleared = await request(app).patch(`/api/v1/services/${id}`).set(...auth()).send({ steps: [] });
    expect(cleared.body.data.steps).toEqual([]);
  });
});
