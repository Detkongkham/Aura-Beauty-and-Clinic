import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — ຕ້ອງມີ PostgreSQL + `prisma migrate deploy` + `pnpm db:seed` ແລ້ວ.
 * ກວດ read-only catalog endpoints ທີ່ Customer Mobile App (Phase 3) ໃຊ້.
 */
const PHONE = '02088810001';

describe('catalog + staff (customer app read APIs)', () => {
  let app: Express;
  let token: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.user.deleteMany({ where: { phone: PHONE } });
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Catalog QA', phone: PHONE, password: 'Passw0rd!' });
    token = reg.body.data.tokens.accessToken as string;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { phone: PHONE } });
    await prisma.$disconnect();
  });

  it('ຕ້ອງ login ກ່ອນຈຶ່ງເອີ້ນ catalog ໄດ້', async () => {
    const res = await request(app).get('/api/v1/catalog/categories');
    expect(res.status).toBe(401);
  });

  it('ດຶງໝວດໝູ່ບໍລິການ ພ້ອມຈຳນວນບໍລິການ', async () => {
    const res = await request(app)
      .get('/api/v1/catalog/categories')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    const cat = res.body.data[0];
    expect(cat).toHaveProperty('id');
    expect(cat).toHaveProperty('serviceCount');
  });

  it('ດຶງລາຍການບໍລິການ ແບບແບ່ງໜ້າ + ຄົ້ນຫາ', async () => {
    const list = await request(app)
      .get('/api/v1/catalog/services?pageSize=5')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data.items.length).toBeGreaterThan(0);
    expect(list.body.data).toMatchObject({ page: 1, pageSize: 5 });
    const svc = list.body.data.items[0];
    expect(typeof svc.price).toBe('number');
    expect(typeof svc.durationMinutes).toBe('number');
    expect(svc).toHaveProperty('categoryName');

    const search = await request(app)
      .get(`/api/v1/catalog/services?q=${encodeURIComponent('ຕັດ')}`)
      .set('Authorization', `Bearer ${token}`);
    expect(search.status).toBe(200);
    expect(search.body.data.items.every((s: { name: string }) => s.name.includes('ຕັດ'))).toBe(true);
  });

  it('ລາຍການບໍລິການ ຕ້ອງມີ rating / reviewCount / popular', async () => {
    const res = await request(app)
      .get('/api/v1/catalog/services?pageSize=3')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const svc = res.body.data.items[0];
    expect(typeof svc.rating).toBe('number');
    expect(typeof svc.reviewCount).toBe('number');
    expect(typeof svc.popular).toBe('boolean');
  });

  it('filter ຕາມ priceMax + sort=priceDesc', async () => {
    const res = await request(app)
      .get('/api/v1/catalog/services?priceMax=300000&sort=priceDesc&pageSize=20')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const prices = res.body.data.items.map((s: { price: number }) => s.price);
    expect(prices.every((p: number) => p <= 300000)).toBe(true);
    expect([...prices].sort((a, b) => b - a)).toEqual(prices);
  });

  it('filter ຕາມ durationMax', async () => {
    const res = await request(app)
      .get('/api/v1/catalog/services?durationMax=60&pageSize=20')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(
      res.body.data.items.every((s: { durationMinutes: number }) => s.durationMinutes <= 60),
    ).toBe(true);
  });

  it('ດຶງລາຍລະອຽດບໍລິການ + ຊ່າງທີ່ໃຫ້ບໍລິການໄດ້', async () => {
    const id = '33333333-0000-0000-0000-000000000001';
    const res = await request(app)
      .get(`/api/v1/catalog/services/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
    expect(Array.isArray(res.body.data.staff)).toBe(true);
    expect(res.body.data.staff.length).toBeGreaterThan(0);
  });

  it('ລາຍລະອຽດບໍລິການ ມີ breakdown / completedCount / branch / packages / related', async () => {
    const id = '33333333-0000-0000-0000-000000000001';
    const branchId = '11111111-1111-1111-1111-111111111111';
    const res = await request(app)
      .get(`/api/v1/catalog/services/${id}?branchId=${branchId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.ratingBreakdown).toHaveLength(5);
    expect(d.ratingBreakdown.reduce((a: number, b: number) => a + b, 0)).toBe(d.reviewCount);
    expect(typeof d.completedCount).toBe('number');
    expect(d.branch).not.toBeNull();
    expect(typeof d.branch.openTime).toBe('string');
    expect(Array.isArray(d.packages)).toBe(true);
    expect(Array.isArray(d.related)).toBe(true);
    expect(d.related.every((r: { id: string; categoryId: string }) => r.id !== id && r.categoryId === d.categoryId)).toBe(true);
  });

  it('404 ສຳລັບບໍລິການທີ່ບໍ່ມີ', async () => {
    const res = await request(app)
      .get('/api/v1/catalog/services/00000000-0000-0000-0000-0000000000ff')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('ດຶງລາຍຊື່ຊ່າງ ຕາມບໍລິການ', async () => {
    const res = await request(app)
      .get('/api/v1/staff?serviceId=33333333-0000-0000-0000-000000000001')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0].serviceIds).toContain('33333333-0000-0000-0000-000000000001');
  });
});
