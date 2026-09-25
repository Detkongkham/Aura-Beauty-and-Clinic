import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { ADJUST_APPROVAL_THRESHOLD_KEY } from '../../src/modules/inventory/inventory.service.js';

/**
 * Integration — inventory audit wave 9B (docs/inventory-audit.md §7):
 *   H2 reason codes + maker-checker · lot backfill (assign-unlotted) · M5 sequential PO/TRF numbers ·
 *   M12-lite COGS/shrinkage in P&L + per-service gross margin.
 * ຕ້ອງມີ PostgreSQL (abcp_test) + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const HAIRCUT_ID = '33333333-0000-0000-0000-000000000001';
const SKU_PREFIX = 'SKU-W9B-';
const SUPPLIER_NAME = 'ຜູ້ສະໜອງທົດສອບ W9B';
const TEMP_BRANCH_NAME = 'W9B temp branch';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

async function wipe(): Promise<void> {
  const products = await prisma.product.findMany({ where: { sku: { startsWith: SKU_PREFIX } }, select: { id: true } });
  const pids = products.map((p) => p.id);
  const temp = await prisma.branch.findMany({ where: { name: TEMP_BRANCH_NAME }, select: { id: true } });
  const tids = temp.map((b) => b.id);
  if (tids.length) {
    const appts = await prisma.appointment.findMany({ where: { branchId: { in: tids } }, select: { id: true } });
    await prisma.stockMovement.deleteMany({ where: { branchId: { in: tids } } });
    await prisma.appointment.deleteMany({ where: { id: { in: appts.map((a) => a.id) } } });
  }
  if (pids.length) {
    await prisma.stockAdjustmentRequest.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockTransferItem.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockTransfer.deleteMany({ where: { items: { none: {} }, notes: 'W9B' } });
    await prisma.purchaseOrderItem.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockLot.deleteMany({ where: { productId: { in: pids } } });
  }
  await prisma.purchaseOrder.deleteMany({ where: { supplier: { name: SUPPLIER_NAME } } });
  await prisma.supplier.deleteMany({ where: { name: SUPPLIER_NAME } });
  if (pids.length) await prisma.product.deleteMany({ where: { id: { in: pids } } });
  if (tids.length) {
    await prisma.product.deleteMany({ where: { branchId: { in: tids } } });
    await prisma.auditLog.deleteMany({ where: { branchId: { in: tids } } });
    await prisma.branch.deleteMany({ where: { id: { in: tids } } });
  }
  await prisma.appSetting.deleteMany({ where: { key: ADJUST_APPROVAL_THRESHOLD_KEY } });
}

describe('Inventory wave 9B — reason codes, maker-checker, lot backfill, sequential numbers, COGS in P&L', () => {
  let app: Express;
  let adminToken: string;
  let managerToken: string;
  let adminId: string;

  const product = async (sku: string, extra: Record<string, unknown> = {}) =>
    prisma.product.create({
      data: { branchId: BRANCH_ID, name: `W9B ${sku}`, sku: `${SKU_PREFIX}${sku}`, unit: 'ຕຸກ', costPrice: 50_000, stockQty: 10, ...extra },
    });

  beforeAll(async () => {
    app = createApp();
    await wipe();
    const login = await request(app).post('/api/v1/auth/login').send({ phone: '02000000000', password: 'Admin@12345' });
    adminToken = login.body.data.tokens.accessToken;
    adminId = login.body.data.user.id;
    managerToken = (await request(app).post('/api/v1/auth/login').send({ phone: '02000000001', password: 'Manager@12345' }))
      .body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  // ------------------------------------------------------------------ H2 reason codes

  it('H2 — reason is required; LOST_OR_THEFT/COUNT_VARIANCE/OTHER require notes; ledger records the reason', async () => {
    const p = await product('REASON');
    const adjust = (body: object) =>
      request(app).post('/api/v1/stock-movements/adjust').set(...bearer(adminToken)).send({ productId: p.id, ...body });

    expect((await adjust({ delta: -1 })).status).toBe(400);
    expect((await adjust({ delta: -1, reason: 'NOT_A_REASON' })).status).toBe(400);
    for (const reason of ['LOST_OR_THEFT', 'COUNT_VARIANCE', 'OTHER']) {
      expect((await adjust({ delta: -1, reason })).status).toBe(400);
      expect((await adjust({ delta: -1, reason, notes: '   ' })).status).toBe(400);
    }

    const ok = await adjust({ delta: -1, reason: 'LOST_OR_THEFT', notes: 'ຫາຍຈາກຕູ້' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.outcome).toBe('POSTED');
    expect(ok.body.data.movement.reasonCode).toBe('LOST_OR_THEFT');

    const dmg = await adjust({ delta: -1, reason: 'DAMAGED' });
    expect(dmg.status).toBe(201);

    const ledger = await request(app).get(`/api/v1/stock-movements?productId=${p.id}`).set(...bearer(adminToken));
    expect(ledger.body.data.items.map((m: { reasonCode: string }) => m.reasonCode).sort()).toEqual(['DAMAGED', 'LOST_OR_THEFT']);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQty.toNumber()).toBe(8);
  });

  it('H2 — opening stock of a new product is tagged OPENING_BALANCE', async () => {
    const res = await request(app)
      .post('/api/v1/products')
      .set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, name: 'W9B opening', sku: `${SKU_PREFIX}OPEN`, unit: 'ອັນ', costPrice: 1000, openingStock: 3 });
    expect(res.status).toBe(201);
    const mv = await prisma.stockMovement.findFirstOrThrow({ where: { productId: res.body.data.id } });
    expect(mv.reasonCode).toBe('OPENING_BALANCE');
  });

  // ------------------------------------------------------------------ H2 maker-checker

  it('H2 — over-threshold adjust by BRANCH_ADMIN creates a PENDING request; SUPER_ADMIN approves (posts) or rejects (no-op)', async () => {
    // threshold 100,000 LAK; product WAC 50,000 → 3 units = 150,000 > threshold
    const setRes = await request(app)
      .put('/api/v1/stock-adjustments/settings')
      .set(...bearer(adminToken))
      .send({ approvalThresholdLak: 100_000 });
    expect(setRes.status).toBe(200);
    expect(setRes.body.data.approvalThresholdLak).toBe(100_000);
    expect(
      (await request(app).put('/api/v1/stock-adjustments/settings').set(...bearer(managerToken)).send({ approvalThresholdLak: 1 })).status,
    ).toBe(403);

    const p = await product('MC');

    // under threshold (2 × 50,000 = 100,000, not strictly greater) → posts directly
    const small = await request(app)
      .post('/api/v1/stock-movements/adjust')
      .set(...bearer(managerToken))
      .send({ productId: p.id, delta: -2, reason: 'DAMAGED' });
    expect(small.status).toBe(201);

    const big = await request(app)
      .post('/api/v1/stock-movements/adjust')
      .set(...bearer(managerToken))
      .send({ productId: p.id, delta: -3, reason: 'EXPIRED', notes: 'ໝົດອາຍຸ' });
    expect(big.status).toBe(202);
    expect(big.body.data.outcome).toBe('PENDING_APPROVAL');
    const reqId = big.body.data.request.id as string;
    expect(big.body.data.request.status).toBe('PENDING');
    expect(big.body.data.request.estimatedValue).toBe(150_000);
    // stock untouched until approved
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQty.toNumber()).toBe(8);

    // SUPER_ADMIN is notified
    const notif = await prisma.notificationLog.findFirst({ where: { type: 'STOCK_ADJUST_PENDING', userId: adminId, dedupeKey: { contains: reqId } } });
    // notification is fire-and-forget — give it a moment
    if (!notif) await new Promise((r) => setTimeout(r, 300));
    expect(
      await prisma.notificationLog.count({ where: { type: 'STOCK_ADJUST_PENDING', userId: adminId, dedupeKey: { contains: reqId } } }),
    ).toBe(1);

    const pending = await request(app).get('/api/v1/stock-adjustments?status=PENDING').set(...bearer(managerToken));
    expect(pending.status).toBe(200);
    expect(pending.body.data.items.some((r: { id: string }) => r.id === reqId)).toBe(true);

    // maker cannot approve
    expect((await request(app).post(`/api/v1/stock-adjustments/${reqId}/approve`).set(...bearer(managerToken))).status).toBe(403);

    const approved = await request(app).post(`/api/v1/stock-adjustments/${reqId}/approve`).set(...bearer(adminToken));
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('APPROVED');
    expect(approved.body.data.movementId).toBeTruthy();
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQty.toNumber()).toBe(5);
    const mv = await prisma.stockMovement.findUniqueOrThrow({ where: { id: approved.body.data.movementId } });
    expect(mv.reasonCode).toBe('EXPIRED');
    expect(mv.type).toBe('ADJUSTMENT_DEDUCT');
    const manager = await prisma.user.findFirstOrThrow({ where: { phone: '02000000001' } });
    expect(mv.createdByUserId).toBe(manager.id); // H1 — maker stays the author

    // double approve → 409
    expect((await request(app).post(`/api/v1/stock-adjustments/${reqId}/approve`).set(...bearer(adminToken))).status).toBe(409);

    // reject path
    const big2 = await request(app)
      .post('/api/v1/stock-movements/adjust')
      .set(...bearer(managerToken))
      .send({ productId: p.id, delta: -4, reason: 'COUNT_VARIANCE', notes: 'ນັບຂາດ' });
    expect(big2.status).toBe(202);
    const req2 = big2.body.data.request.id as string;
    expect((await request(app).post(`/api/v1/stock-adjustments/${req2}/reject`).set(...bearer(adminToken)).send({})).status).toBe(400);
    const rejected = await request(app)
      .post(`/api/v1/stock-adjustments/${req2}/reject`)
      .set(...bearer(adminToken))
      .send({ reason: 'ນັບໃໝ່ກ່ອນ' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe('REJECTED');
    expect(rejected.body.data.rejectReason).toBe('ນັບໃໝ່ກ່ອນ');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQty.toNumber()).toBe(5);
    expect((await request(app).post(`/api/v1/stock-adjustments/${req2}/approve`).set(...bearer(adminToken))).status).toBe(409);

    // over-threshold request that would go negative is refused up front
    expect(
      (
        await request(app)
          .post('/api/v1/stock-movements/adjust')
          .set(...bearer(managerToken))
          .send({ productId: p.id, delta: -6, reason: 'DAMAGED' })
      ).status,
    ).toBe(409);

    // SUPER_ADMIN is never gated
    const direct = await request(app)
      .post('/api/v1/stock-movements/adjust')
      .set(...bearer(adminToken))
      .send({ productId: p.id, delta: -4, reason: 'DAMAGED' });
    expect(direct.status).toBe(201);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQty.toNumber()).toBe(1);

    await prisma.appSetting.deleteMany({ where: { key: ADJUST_APPROVAL_THRESHOLD_KEY } });
    const def = await request(app).get('/api/v1/stock-adjustments/settings').set(...bearer(managerToken));
    expect(def.body.data.approvalThresholdLak).toBe(1_000_000);
  });

  // ------------------------------------------------------------------ lot backfill

  it('lot backfill — assigns the unlotted remainder at WAC without touching stockQty; refuses over-assign', async () => {
    const p = await product('LOTBF', { trackLot: true, stockQty: 10, costPrice: 12_345.6789 });
    await prisma.stockLot.create({
      data: { productId: p.id, branchId: BRANCH_ID, lotNumber: 'EXIST-1', qtyOnHand: 4, unitCost: 10_000 },
    });

    const view = await request(app).get(`/api/v1/products/${p.id}`).set(...bearer(adminToken));
    expect(view.body.data.unlottedQty).toBe(6);

    const assign = (body: object) =>
      request(app).post('/api/v1/stock-lots/assign-unlotted').set(...bearer(adminToken)).send({ productId: p.id, ...body });

    expect((await assign({ lotNumber: 'BF-1', qty: 7 })).status).toBe(409);
    const ok = await assign({ lotNumber: 'BF-1', qty: 6, expiryDate: '2030-01-31' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.unlottedQty).toBe(0);
    expect(ok.body.data.stockQty).toBe(10);

    const lot = await prisma.stockLot.findFirstOrThrow({ where: { productId: p.id, lotNumber: 'BF-1' } });
    expect(lot.qtyOnHand.toNumber()).toBe(6);
    expect(lot.unitCost.toNumber()).toBeCloseTo(12_345.6789, 4);
    expect(await prisma.stockMovement.count({ where: { productId: p.id } })).toBe(0);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQty.toNumber()).toBe(10);
    expect((await assign({ lotNumber: 'BF-2', qty: 1 })).status).toBe(409);

    const plain = await product('LOTBF-PLAIN');
    expect(
      (
        await request(app)
          .post('/api/v1/stock-lots/assign-unlotted')
          .set(...bearer(adminToken))
          .send({ productId: plain.id, lotNumber: 'X', qty: 1 })
      ).status,
    ).toBe(400);
  });

  // ------------------------------------------------------------------ M5 numbering

  it('M5 — PO numbers are sequential per branch/year and do not collide under concurrency; transfers get TRF numbers', async () => {
    const p = await product('PO');
    const supplier = await prisma.supplier.create({ data: { name: SUPPLIER_NAME, phone: '020' } });
    const createPo = () =>
      request(app)
        .post('/api/v1/purchase-orders')
        .set(...bearer(adminToken))
        .send({ branchId: BRANCH_ID, supplierId: supplier.id, items: [{ productId: p.id, quantity: 1, unitCost: 1000 }] });

    const first = await createPo();
    expect(first.status).toBe(201);
    const re = /^PO-(.+)-(\d{4})-(\d{6})$/;
    const m1 = re.exec(first.body.data.poNumber)!;
    expect(m1).toBeTruthy();

    const results = await Promise.all(Array.from({ length: 8 }, createPo));
    expect(results.every((r) => r.status === 201)).toBe(true);
    const seqs = results.map((r) => Number(re.exec(r.body.data.poNumber)![3])).sort((a, b) => a - b);
    const base = Number(m1[3]);
    expect(seqs).toEqual(Array.from({ length: 8 }, (_, i) => base + 1 + i));

    const other = await prisma.branch.create({
      data: { name: TEMP_BRANCH_NAME, address: '—', phone: '020', baseCurrency: 'LAK' },
    });
    const trf = await request(app)
      .post('/api/v1/stock-transfers')
      .set(...bearer(adminToken))
      .send({ fromBranchId: BRANCH_ID, toBranchId: other.id, notes: 'W9B', items: [{ productId: p.id, quantity: 1 }] });
    expect(trf.status).toBe(201);
    expect(trf.body.data.transferNumber).toMatch(/^TRF-.+-\d{4}-\d{6}$/);
    await prisma.stockTransfer.delete({ where: { id: trf.body.data.id } });
  });

  // ------------------------------------------------------------------ M12-lite

  it('M12-lite — P&L uses valued-ledger COGS + shrinkage; service margin joins COGS per appointment', async () => {
    const branch =
      (await prisma.branch.findFirst({ where: { name: TEMP_BRANCH_NAME } })) ??
      (await prisma.branch.create({ data: { name: TEMP_BRANCH_NAME, address: '—', phone: '020', baseCurrency: 'LAK' } }));
    // costPrice ຕັ້ງໃຫ້ຕ່າງຈາກ valueChange → ພິສູດວ່າ P&L ໃຊ້ valueChange (ບໍ່ແມ່ນ qty × costPrice ປັດຈຸບັນ)
    const p = await prisma.product.create({
      data: { branchId: branch.id, name: 'W9B cogs', sku: `${SKU_PREFIX}COGS`, unit: 'ຕຸກ', costPrice: 99_999, stockQty: 50 },
    });
    const staff = await prisma.staffProfile.findFirstOrThrow();
    const appt = await prisma.appointment.create({
      data: {
        branchId: branch.id,
        customerId: adminId,
        staffProfileId: staff.id,
        serviceId: HAIRCUT_ID,
        startAt: new Date(),
        endAt: new Date(Date.now() + 30 * 60_000),
        status: 'COMPLETED',
        totalAmount: 200_000,
      },
    });
    const base = { branchId: branch.id, productId: p.id, balanceAfter: 0, qty: 1 };
    await prisma.stockMovement.createMany({
      data: [
        { ...base, type: 'SERVICE_CONSUMED', unitCost: 30_000, valueChange: -30_000, refId: `appt:${appt.id}` },
        { ...base, type: 'ADJUSTMENT_DEDUCT', unitCost: 5_000, valueChange: -5_000, reasonCode: 'DAMAGED' },
        { ...base, type: 'ADJUSTMENT_DEDUCT', unitCost: 7_000, valueChange: -7_000, reasonCode: 'SUPPLIER_RETURN' },
        { ...base, type: 'ADJUSTMENT_ADD', unitCost: 9_000, valueChange: 9_000, reasonCode: 'COUNT_VARIANCE' },
      ],
    });

    const pl = await request(app).get(`/api/v1/expenses/profit-loss?branchId=${branch.id}`).set(...bearer(adminToken));
    expect(pl.status).toBe(200);
    expect(pl.body.data.cogs).toBe(30_000);
    expect(pl.body.data.shrinkage).toBe(5_000);
    expect(pl.body.data.grossProfit).toBe(pl.body.data.netRevenue - 30_000);
    expect(pl.body.data.netProfit).toBe(
      pl.body.data.grossProfit - 5_000 - pl.body.data.labour.total - pl.body.data.operating.total,
    );
    expect(pl.body.data.months[0].shrinkage).toBe(5_000);

    const sm = await request(app).get(`/api/v1/stock-movements/service-margin?branchId=${branch.id}`).set(...bearer(adminToken));
    expect(sm.status).toBe(200);
    expect(sm.body.data.rows).toHaveLength(1);
    expect(sm.body.data.rows[0]).toMatchObject({ serviceId: HAIRCUT_ID, completed: 1, revenue: 200_000, cogs: 30_000, grossMargin: 170_000, marginPct: 0.85 });
    expect(sm.body.data.totals.grossMargin).toBe(170_000);

    // BRANCH_ADMIN of the seed branch cannot look at another branch
    expect(
      (await request(app).get(`/api/v1/stock-movements/service-margin?branchId=${branch.id}`).set(...bearer(managerToken))).status,
    ).toBe(403);
  });
});
