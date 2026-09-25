import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — inventory route access (M14 follow-up): customers never read stock/cost data;
 * STAFF need an explicit inventory:view / inventory:manage grant; approvals stay admin-only.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const PASSWORD = 'Access@12345';
const CUSTOMER_PHONE = '02077700001';
const STAFF_NONE_PHONE = '02077700002';
const STAFF_VIEW_PHONE = '02077700003';
const STAFF_MANAGE_PHONE = '02077700004';
const PHONES = [CUSTOMER_PHONE, STAFF_NONE_PHONE, STAFF_VIEW_PHONE, STAFF_MANAGE_PHONE];
const SKU = 'SKU-ACCESS-1';
const NOTE = 'INV-ACCESS';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

async function wipe(): Promise<void> {
  const products = await prisma.product.findMany({ where: { sku: { startsWith: 'SKU-ACCESS-' } }, select: { id: true } });
  const pids = products.map((p) => p.id);
  const countIds = (await prisma.stockCount.findMany({ where: { notes: NOTE }, select: { id: true } })).map((c) => c.id);
  await prisma.stockCountLine.deleteMany({ where: { countId: { in: countIds } } });
  await prisma.stockCount.deleteMany({ where: { id: { in: countIds } } });
  if (pids.length) {
    await prisma.stockAdjustmentRequest.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: pids } } });
    await prisma.product.deleteMany({ where: { id: { in: pids } } });
  }
  await prisma.user.deleteMany({ where: { phone: { in: PHONES } } });
}

describe('Inventory route access — customers blocked, STAFF by permission', () => {
  let app: Express;
  let adminToken: string;
  let customerToken: string;
  let staffNoneToken: string;
  let staffViewToken: string;
  let staffManageToken: string;
  let productId: string;

  const login = async (phone: string, password: string) =>
    (await request(app).post('/api/v1/auth/login').send({ phone, password })).body.data.tokens.accessToken as string;
  const api = (token: string) => ({
    get: (url: string) => request(app).get(`/api/v1${url}`).set(...bearer(token)),
    post: (url: string, body: object = {}) => request(app).post(`/api/v1${url}`).set(...bearer(token)).send(body),
    patch: (url: string, body: object) => request(app).patch(`/api/v1${url}`).set(...bearer(token)).send(body),
  });

  beforeAll(async () => {
    app = createApp();
    await wipe();
    const hash = bcrypt.hashSync(PASSWORD, 10);
    await prisma.user.create({ data: { name: 'Access customer', phone: CUSTOMER_PHONE, password: hash, role: 'CUSTOMER' } });
    await prisma.user.create({
      data: { name: 'Access staff none', phone: STAFF_NONE_PHONE, password: hash, role: 'STAFF', branchId: BRANCH_ID },
    });
    await prisma.user.create({
      data: {
        name: 'Access staff view',
        phone: STAFF_VIEW_PHONE,
        password: hash,
        role: 'STAFF',
        branchId: BRANCH_ID,
        permissionOverrides: { create: [{ permission: 'inventory:view', granted: true }] },
      },
    });
    await prisma.user.create({
      data: {
        name: 'Access staff manage',
        phone: STAFF_MANAGE_PHONE,
        password: hash,
        role: 'STAFF',
        branchId: BRANCH_ID,
        permissionOverrides: {
          create: [
            { permission: 'inventory:view', granted: true },
            { permission: 'inventory:manage', granted: true },
          ],
        },
      },
    });
    const p = await prisma.product.create({
      data: { branchId: BRANCH_ID, name: 'Access product', sku: SKU, unit: 'ຕຸກ', costPrice: 1000, stockQty: 10 },
    });
    await prisma.stockMovement.create({
      data: {
        branchId: BRANCH_ID,
        productId: p.id,
        type: 'ADJUSTMENT_ADD',
        qty: 10,
        balanceAfter: 10,
        unitCost: 1000,
        valueChange: 10_000,
        reasonCode: 'OPENING_BALANCE',
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    productId = p.id;
    adminToken = await login('02000000000', 'Admin@12345');
    customerToken = await login(CUSTOMER_PHONE, PASSWORD);
    staffNoneToken = await login(STAFF_NONE_PHONE, PASSWORD);
    staffViewToken = await login(STAFF_VIEW_PHONE, PASSWORD);
    staffManageToken = await login(STAFF_MANAGE_PHONE, PASSWORD);
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('customers and ungranted STAFF cannot read stock or cost data', async () => {
    for (const token of [customerToken, staffNoneToken]) {
      const c = api(token);
      expect((await c.get('/products')).status).toBe(403);
      expect((await c.get(`/products/${productId}`)).status).toBe(403);
      expect((await c.get('/stock-movements')).status).toBe(403);
      expect((await c.get('/suppliers')).status).toBe(403);
      expect((await c.get('/purchase-orders')).status).toBe(403);
      expect((await c.get('/stock-lots')).status).toBe(403);
      expect((await c.get('/stock-counts')).status).toBe(403);
    }
  });

  it('STAFF with inventory:view reads and counts but cannot create, adjust or approve', async () => {
    const staff = api(staffViewToken);
    expect((await staff.get('/products')).status).toBe(200);
    expect((await staff.get('/stock-lots')).status).toBe(200);
    expect((await staff.get('/stock-counts')).status).toBe(200);
    expect((await staff.post('/stock-counts', { branchId: BRANCH_ID, type: 'SPOT', productIds: [productId], notes: NOTE })).status).toBe(403);
    expect((await staff.post('/stock-movements/adjust', { productId, delta: 1, reason: 'DAMAGED' })).status).toBe(403);

    const admin = api(adminToken);
    const created = await admin.post('/stock-counts', { branchId: BRANCH_ID, type: 'SPOT', productIds: [productId], notes: NOTE });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;
    expect((await admin.post(`/stock-counts/${id}/start`)).status).toBe(200);
    const count = (await staff.get(`/stock-counts/${id}`)).body.data;
    const lineId = count.lines[0].id as string;
    expect((await staff.patch(`/stock-counts/${id}/lines`, { lines: [{ lineId, countedQty: 10 }] })).status).toBe(200);
    expect((await staff.post(`/stock-counts/${id}/submit`)).status).toBe(200);
    expect((await staff.post(`/stock-counts/${id}/approve`)).status).toBe(403);
    expect((await api(staffManageToken).post(`/stock-counts/${id}/approve`)).status).toBe(403);
    expect((await admin.post(`/stock-counts/${id}/approve`)).status).toBe(200);
  });

  it('STAFF with inventory:manage can create/start counts and adjust stock; lot usage stays admin-only', async () => {
    const staff = api(staffManageToken);
    const created = await staff.post('/stock-counts', { branchId: BRANCH_ID, type: 'SPOT', productIds: [productId], notes: NOTE });
    expect(created.status).toBe(201);
    expect((await staff.post(`/stock-counts/${created.body.data.id}/start`)).status).toBe(200);
    expect((await staff.post(`/stock-counts/${created.body.data.id}/cancel`, { reason: 'test' })).status).toBe(200);

    const adj = await staff.post('/stock-movements/adjust', { productId, delta: -1, reason: 'DAMAGED' });
    expect([201, 202]).toContain(adj.status);

    const lot = await prisma.stockLot.create({
      data: { productId, branchId: BRANCH_ID, lotNumber: 'ACCESS-1', qtyOnHand: 0, unitCost: 1000 },
    });
    expect((await staff.get(`/stock-lots/${lot.id}/usage`)).status).toBe(403);
    await prisma.stockLot.delete({ where: { id: lot.id } });
  });
});
