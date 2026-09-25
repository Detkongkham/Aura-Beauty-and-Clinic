import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import {
  ADJUST_APPROVAL_THRESHOLD_KEY,
  listStockMovements,
  reconcileStock,
} from '../../src/modules/inventory/inventory.service.js';
import { exportList } from '../../src/modules/inventory/inventory-reports.service.js';

/**
 * Integration — inventory audit wave 9B (docs/inventory-audit.md §7):
 *   H3 stock-take / cycle count (snapshot + delta, lots, approval routing, cancel rules) ·
 *   valuation as of a date · shrinkage report · M15 export row cap.
 * ຕ້ອງມີ PostgreSQL (abcp_test) + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SKU_PREFIX = 'SKU-SC-';
const NOTE = 'W9B-SC';
const TEMP_BRANCH_NAME = 'W9B-SC temp branch';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

async function wipe(): Promise<void> {
  const temp = await prisma.branch.findMany({ where: { name: TEMP_BRANCH_NAME }, select: { id: true } });
  const tids = temp.map((b) => b.id);
  const products = await prisma.product.findMany({
    where: { OR: [{ sku: { startsWith: SKU_PREFIX } }, { branchId: { in: tids } }] },
    select: { id: true },
  });
  const pids = products.map((p) => p.id);
  await prisma.stockCount.deleteMany({ where: { OR: [{ notes: NOTE }, { branchId: { in: tids } }] } });
  if (pids.length) {
    await prisma.stockCountLine.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockAdjustmentRequest.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockLot.deleteMany({ where: { productId: { in: pids } } });
    await prisma.product.deleteMany({ where: { id: { in: pids } } });
  }
  if (tids.length) {
    await prisma.documentSequence.deleteMany({ where: { branchId: { in: tids } } });
    await prisma.branch.deleteMany({ where: { id: { in: tids } } });
  }
  await prisma.appSetting.deleteMany({ where: { key: ADJUST_APPROVAL_THRESHOLD_KEY } });
}

describe('Inventory wave 9B — stock count, valuation, shrinkage, export', () => {
  let app: Express;
  let adminToken: string;
  let managerToken: string;

  /** ສິນຄ້າ + ແຖວຍອດເປີດໃນ ledger (ໃຫ້ reconcileStock ສະອາດ). */
  const product = async (sku: string, qty: number, cost: number, extra: Record<string, unknown> = {}) => {
    const p = await prisma.product.create({
      data: { branchId: BRANCH_ID, name: `SC ${sku}`, sku: `${SKU_PREFIX}${sku}`, unit: 'ຕຸກ', costPrice: cost, stockQty: qty, ...extra },
    });
    if (qty > 0) {
      await prisma.stockMovement.create({
        data: {
          branchId: p.branchId,
          productId: p.id,
          type: 'ADJUSTMENT_ADD',
          qty,
          balanceAfter: qty,
          unitCost: cost,
          valueChange: qty * cost,
          reasonCode: 'OPENING_BALANCE',
          createdAt: new Date(Date.now() - 60_000),
        },
      });
    }
    return p;
  };

  const tempBranch = async () =>
    (await prisma.branch.findFirst({ where: { name: TEMP_BRANCH_NAME } })) ??
    (await prisma.branch.create({ data: { name: TEMP_BRANCH_NAME, address: '—', phone: '020', baseCurrency: 'LAK' } }));

  const api = (token: string) => ({
    get: (url: string) => request(app).get(`/api/v1${url}`).set(...bearer(token)),
    post: (url: string, body: object = {}) => request(app).post(`/api/v1${url}`).set(...bearer(token)).send(body),
    patch: (url: string, body: object) => request(app).patch(`/api/v1${url}`).set(...bearer(token)).send(body),
  });

  beforeAll(async () => {
    app = createApp();
    await wipe();
    adminToken = (await request(app).post('/api/v1/auth/login').send({ phone: '02000000000', password: 'Admin@12345' }))
      .body.data.tokens.accessToken;
    managerToken = (await request(app).post('/api/v1/auth/login').send({ phone: '02000000001', password: 'Manager@12345' }))
      .body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('H3 — snapshot (lot + unlotted lines), delta-during-count variance, post as COUNT_VARIANCE, reconcile stays clean', async () => {
    const admin = api(adminToken);
    const plain = await product('PLAIN', 10, 1000);
    const lotted = await product('LOT', 12, 15_000, { trackLot: true });
    const lotA = await prisma.stockLot.create({
      data: { productId: lotted.id, branchId: BRANCH_ID, lotNumber: 'SC-A', qtyOnHand: 5, unitCost: 10_000, expiryDate: new Date('2027-01-01') },
    });
    const lotB = await prisma.stockLot.create({
      data: { productId: lotted.id, branchId: BRANCH_ID, lotNumber: 'SC-B', qtyOnHand: 4, unitCost: 20_000, expiryDate: new Date('2028-01-01') },
    });

    const created = await admin.post('/stock-counts', { branchId: BRANCH_ID, type: 'CYCLE', productIds: [plain.id, lotted.id], notes: NOTE });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('DRAFT');
    expect(created.body.data.countNumber).toMatch(/^SC-.+-\d{4}-\d{6}$/);
    expect(created.body.data.lines).toHaveLength(2);
    const id = created.body.data.id as string;

    // CYCLE without products → 400; count sheet can't be edited before start
    expect((await admin.post('/stock-counts', { branchId: BRANCH_ID, type: 'SPOT', notes: NOTE })).status).toBe(400);
    expect((await admin.post(`/stock-counts/${id}/submit`)).status).toBe(409);

    const started = await admin.post(`/stock-counts/${id}/start`);
    expect(started.status).toBe(200);
    expect(started.body.data.status).toBe('COUNTING');
    type L = { id: string; productId: string; lotId: string | null; systemQty: number; expectedQty: number; variance: number | null; movedSinceStart: number };
    const lines = started.body.data.lines as L[];
    expect(lines).toHaveLength(4);
    const find = (pid: string, lot: string | null) => lines.find((l) => l.productId === pid && l.lotId === lot)!;
    expect(find(plain.id, null).systemQty).toBe(10);
    expect(find(lotted.id, lotA.id).systemQty).toBe(5);
    expect(find(lotted.id, lotB.id).systemQty).toBe(4);
    expect(find(lotted.id, null).systemQty).toBe(3);
    expect((await admin.post(`/stock-counts/${id}/start`)).status).toBe(409);

    // stock keeps moving during the count: −2 on the plain product, −1 FEFO on the lotted one (hits lot A)
    expect((await admin.post('/stock-movements/adjust', { productId: plain.id, delta: -2, reason: 'DAMAGED' })).status).toBe(201);
    expect((await admin.post('/stock-movements/adjust', { productId: lotted.id, delta: -1, reason: 'DAMAGED' })).status).toBe(201);

    // partial save
    const saved = await admin.patch(`/stock-counts/${id}/lines`, {
      lines: [
        { lineId: find(plain.id, null).id, countedQty: 7 },
        { lineId: find(lotted.id, lotA.id).id, countedQty: 5 },
        { lineId: find(lotted.id, lotB.id).id, countedQty: 4, notes: 'ຕູ້ເຢັນ' },
      ],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.countedLineCount).toBe(3);
    expect(saved.body.data.movementsDuringCount).toBe(2);
    const plainLine = (saved.body.data.lines as L[]).find((l) => l.productId === plain.id)!;
    // snapshot 10, moved −2 → expected 8, counted 7 → −1 (not −3)
    expect(plainLine).toMatchObject({ movedSinceStart: -2, expectedQty: 8, variance: -1 });
    expect((saved.body.data.lines as L[]).find((l) => l.lotId === lotA.id)).toMatchObject({ expectedQty: 4, variance: 1 });

    // all lines must be counted before submit
    expect((await admin.post(`/stock-counts/${id}/submit`)).status).toBe(400);
    // a line from another count is refused
    expect(
      (await admin.patch(`/stock-counts/${id}/lines`, { lines: [{ lineId: '00000000-0000-4000-8000-000000000000', countedQty: 1 }] })).status,
    ).toBe(400);
    await admin.patch(`/stock-counts/${id}/lines`, { lines: [{ lineId: find(lotted.id, null).id, countedQty: 1 }] });

    const submitted = await admin.post(`/stock-counts/${id}/submit`);
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.status).toBe('PENDING_APPROVAL');
    // |−1×1000| + |+1×10,000| + |−2×15,000| = 41,000
    expect(submitted.body.data.absVarianceValue).toBe(41_000);
    expect(submitted.body.data.netVarianceValue).toBe(-21_000);
    // counting is closed while pending
    expect((await admin.patch(`/stock-counts/${id}/lines`, { lines: [{ lineId: find(plain.id, null).id, countedQty: 1 }] })).status).toBe(409);

    const posted = await admin.post(`/stock-counts/${id}/approve`);
    expect(posted.status).toBe(200);
    expect(posted.body.data.status).toBe('POSTED');
    expect(posted.body.data.postedAt).toBeTruthy();

    const p1 = await prisma.product.findUniqueOrThrow({ where: { id: plain.id } });
    const p2 = await prisma.product.findUniqueOrThrow({ where: { id: lotted.id } });
    expect(p1.stockQty.toNumber()).toBe(7);
    expect(p2.stockQty.toNumber()).toBe(10); // 12 − 1 (FEFO) + 1 (lot A) − 2 (unlotted)
    expect(p2.costPrice.toNumber()).toBe(15_000); // WAC untouched by count gains
    expect((await prisma.stockLot.findUniqueOrThrow({ where: { id: lotA.id } })).qtyOnHand.toNumber()).toBe(5);
    expect((await prisma.stockLot.findUniqueOrThrow({ where: { id: lotB.id } })).qtyOnHand.toNumber()).toBe(4);

    const moves = await prisma.stockMovement.findMany({ where: { refId: `count:${id}` } });
    expect(moves).toHaveLength(3);
    expect(moves.every((m) => m.reasonCode === 'COUNT_VARIANCE')).toBe(true);
    const lotGain = moves.find((m) => m.lotId === lotA.id)!;
    expect(lotGain).toMatchObject({ type: 'ADJUSTMENT_ADD' });
    expect(lotGain.unitCost!.toNumber()).toBe(10_000);
    expect(lotGain.valueChange!.toNumber()).toBe(10_000);
    const unlottedLoss = moves.find((m) => m.productId === lotted.id && m.lotId === null)!;
    expect(unlottedLoss.type).toBe('ADJUSTMENT_DEDUCT');
    expect(unlottedLoss.valueChange!.toNumber()).toBe(-30_000);
    expect(moves.find((m) => m.productId === plain.id)!.valueChange!.toNumber()).toBe(-1000);

    const rec = await reconcileStock();
    expect(rec.mismatches.filter((m) => m.productId === plain.id || m.productId === lotted.id)).toEqual([]);

    // POSTED detail keeps the posted figures; no more changes allowed
    const detail = await admin.get(`/stock-counts/${id}`);
    expect(detail.body.data.absVarianceValue).toBe(41_000);
    expect((detail.body.data.lines as L[]).find((l) => l.productId === plain.id)!.variance).toBe(-1);
    expect((await admin.post(`/stock-counts/${id}/approve`)).status).toBe(409);
  });

  it('H3 — approval routing: BRANCH_ADMIN may approve only up to the adjust threshold; reject returns to COUNTING', async () => {
    const admin = api(adminToken);
    const mgr = api(managerToken);
    await admin.get('/stock-adjustments/settings');
    expect((await request(app).put('/api/v1/stock-adjustments/settings').set(...bearer(adminToken)).send({ approvalThresholdLak: 100_000 })).status).toBe(200);
    const p = await product('THR', 10, 50_000);

    const run = async (counted: number) => {
      const c = await mgr.post('/stock-counts', { branchId: BRANCH_ID, type: 'SPOT', productIds: [p.id], notes: NOTE });
      expect(c.status).toBe(201);
      const s = await mgr.post(`/stock-counts/${c.body.data.id}/start`);
      await mgr.patch(`/stock-counts/${c.body.data.id}/lines`, { lines: [{ lineId: s.body.data.lines[0].id, countedQty: counted }] });
      expect((await mgr.post(`/stock-counts/${c.body.data.id}/submit`)).status).toBe(200);
      return { id: c.body.data.id as string, lineId: s.body.data.lines[0].id as string };
    };

    // −3 × 50,000 = 150,000 > 100,000 → manager blocked, SUPER_ADMIN approves
    const big = await run(7);
    expect((await mgr.post(`/stock-counts/${big.id}/approve`)).status).toBe(403);
    expect((await admin.post(`/stock-counts/${big.id}/approve`)).status).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQty.toNumber()).toBe(7);

    // reject → COUNTING with reason, recount, resubmit; −1 × 50,000 = 50,000 ≤ threshold → manager approves
    const small = await run(5);
    const rej = await mgr.post(`/stock-counts/${small.id}/reject`, { reason: 'ນັບຄືນ' });
    expect(rej.status).toBe(200);
    expect(rej.body.data.status).toBe('COUNTING');
    expect(rej.body.data.rejectReason).toBe('ນັບຄືນ');
    expect((await mgr.post(`/stock-counts/${small.id}/reject`, { reason: 'x' })).status).toBe(409);
    await mgr.patch(`/stock-counts/${small.id}/lines`, { lines: [{ lineId: small.lineId, countedQty: 6 }] });
    expect((await mgr.post(`/stock-counts/${small.id}/submit`)).status).toBe(200);
    const ok = await mgr.post(`/stock-counts/${small.id}/approve`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('POSTED');
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).stockQty.toNumber()).toBe(6);

    // BRANCH_ADMIN scope
    const other = await tempBranch();
    expect((await mgr.post('/stock-counts', { branchId: other.id, type: 'FULL', notes: NOTE })).status).toBe(403);
    const list = await mgr.get('/stock-counts?pageSize=100');
    expect(list.body.data.items.every((c: { branchId: string }) => c.branchId === BRANCH_ID)).toBe(true);
  });

  it('H3 — FULL takes every active product of the branch; cancel allowed only before POSTED', async () => {
    const admin = api(adminToken);
    const branch = await tempBranch();
    const mk = (sku: string, extra: Record<string, unknown> = {}) =>
      prisma.product.create({ data: { branchId: branch.id, name: `SC ${sku}`, sku: `${SKU_PREFIX}${sku}`, unit: 'ອັນ', costPrice: 100, ...extra } });
    await mk('F1');
    await mk('F2');
    await mk('F3-OFF', { isActive: false });
    await mk('F4-DEL', { deletedAt: new Date() });

    const full = await admin.post('/stock-counts', { branchId: branch.id, type: 'FULL' });
    expect(full.status).toBe(201);
    expect(full.body.data.lines).toHaveLength(2);

    const cancelled = await admin.post(`/stock-counts/${full.body.data.id}/cancel`, { reason: 'ຜິດວັນ' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(cancelled.body.data.cancelReason).toBe('ຜິດວັນ');
    expect((await admin.post(`/stock-counts/${full.body.data.id}/cancel`)).status).toBe(409);
    expect((await admin.post(`/stock-counts/${full.body.data.id}/start`)).status).toBe(409);

    // COUNTING can be cancelled; nothing is posted
    const c2 = await admin.post('/stock-counts', { branchId: branch.id, type: 'FULL' });
    const s2 = await admin.post(`/stock-counts/${c2.body.data.id}/start`);
    await admin.patch(`/stock-counts/${c2.body.data.id}/lines`, { lines: [{ lineId: s2.body.data.lines[0].id, countedQty: 99 }] });
    expect((await admin.post(`/stock-counts/${c2.body.data.id}/cancel`)).status).toBe(200);
    expect(await prisma.stockMovement.count({ where: { refId: `count:${c2.body.data.id}` } })).toBe(0);

    // POSTED cannot be cancelled
    const c3 = await admin.post('/stock-counts', { branchId: branch.id, type: 'FULL' });
    const s3 = await admin.post(`/stock-counts/${c3.body.data.id}/start`);
    await admin.patch(`/stock-counts/${c3.body.data.id}/lines`, {
      lines: s3.body.data.lines.map((l: { id: string }) => ({ lineId: l.id, countedQty: 0 })),
    });
    await admin.post(`/stock-counts/${c3.body.data.id}/submit`);
    expect((await admin.post(`/stock-counts/${c3.body.data.id}/approve`)).body.data.status).toBe('POSTED');
    expect((await admin.post(`/stock-counts/${c3.body.data.id}/cancel`)).status).toBe(409);
  });

  it('valuation asOf — ledger-based qty/value per Vientiane day, with fallback for rows lacking valueChange', async () => {
    const branch = await tempBranch();
    const p = await prisma.product.create({
      data: { branchId: branch.id, name: 'SC val', sku: `${SKU_PREFIX}VAL`, unit: 'ຕຸກ', costPrice: 9_999, stockQty: 8 },
    });
    const legacyOnly = await prisma.product.create({
      data: { branchId: branch.id, name: 'SC legacy', sku: `${SKU_PREFIX}LEG`, unit: 'ຕຸກ', costPrice: 300, stockQty: 4 },
    });
    const base = { branchId: branch.id, balanceAfter: 0 };
    await prisma.stockMovement.createMany({
      data: [
        // pre-C4 style: no unitCost / valueChange
        { ...base, productId: p.id, type: 'ADJUSTMENT_ADD', qty: 5, createdAt: new Date('2026-01-10T05:00:00Z') },
        { ...base, productId: p.id, type: 'PURCHASE_IN', qty: 5, unitCost: 2_000, valueChange: 10_000, createdAt: new Date('2026-01-11T05:00:00Z') },
        // 2026-01-12 18:00Z = 2026-01-13 01:00 Vientiane → belongs to the 13th
        { ...base, productId: p.id, type: 'SERVICE_CONSUMED', qty: 2, unitCost: 1_500, valueChange: -3_000, createdAt: new Date('2026-01-12T18:00:00Z') },
        { ...base, productId: legacyOnly.id, type: 'ADJUSTMENT_ADD', qty: 4, createdAt: new Date('2026-01-10T05:00:00Z') },
      ],
    });
    const get = (asOf: string) => api(adminToken).get(`/stock-movements/valuation?branchId=${branch.id}&asOf=${asOf}`);

    expect((await get('2026-01-09')).body.data.rows).toEqual([]);

    const d11 = (await get('2026-01-11')).body.data;
    const row = d11.rows.find((r: { productId: string }) => r.productId === p.id);
    // 10 on hand; value = 10,000 (valued) + 5 × 2,000 (first known unitCost, not current WAC 9,999)
    expect(row).toMatchObject({ qty: 10, value: 20_000, fallbackUsed: true, fallbackRows: 1, fallbackCost: 2_000, avgCost: 2_000 });
    const leg = d11.rows.find((r: { productId: string }) => r.productId === legacyOnly.id);
    // no unitCost anywhere in its ledger → current WAC
    expect(leg).toMatchObject({ qty: 4, value: 1_200, fallbackUsed: true, fallbackCost: 300 });
    expect(d11.totals).toMatchObject({ products: 2, value: 21_200, fallbackProducts: 2 });

    expect((await get('2026-01-12')).body.data.rows.find((r: { productId: string }) => r.productId === p.id).qty).toBe(10);
    const d13 = (await get('2026-01-13')).body.data.rows.find((r: { productId: string }) => r.productId === p.id);
    expect(d13).toMatchObject({ qty: 8, value: 17_000 });

    // BRANCH_ADMIN can't value another branch
    expect((await api(managerToken).get(`/stock-movements/valuation?branchId=${branch.id}`)).status).toBe(403);
  });

  it('shrinkage — loss by reason and product using the P&L shrinkage reason set', async () => {
    const branch = await tempBranch();
    const mk = (sku: string, cost: number) =>
      prisma.product.create({ data: { branchId: branch.id, name: `SC ${sku}`, sku: `${SKU_PREFIX}${sku}`, unit: 'ຕຸກ', costPrice: cost } });
    const a = await mk('SHR-A', 1_000);
    const b = await mk('SHR-B', 2_500);
    const base = { branchId: branch.id, balanceAfter: 0, type: 'ADJUSTMENT_DEDUCT' as const };
    await prisma.stockMovement.createMany({
      data: [
        { ...base, productId: a.id, qty: 1, valueChange: -5_000, reasonCode: 'DAMAGED' },
        { ...base, productId: a.id, qty: 1, valueChange: -7_000, reasonCode: 'LOST_OR_THEFT' },
        { ...base, productId: b.id, qty: 2, valueChange: -4_000, reasonCode: 'LOST_OR_THEFT' },
        // legacy row without valueChange → qty × current WAC (same as P&L)
        { ...base, productId: b.id, qty: 2, reasonCode: 'COUNT_VARIANCE' },
        // not shrinkage
        { ...base, productId: b.id, qty: 1, valueChange: -9_000, reasonCode: 'SUPPLIER_RETURN' },
        { ...base, productId: b.id, qty: 1, valueChange: 9_000, reasonCode: 'COUNT_VARIANCE', type: 'ADJUSTMENT_ADD' },
      ],
    });
    const res = await api(adminToken).get(`/stock-movements/shrinkage?branchId=${branch.id}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.totals).toEqual({ count: 4, value: 21_000 });
    expect(d.byReason).toEqual([
      { reason: 'LOST_OR_THEFT', count: 2, qty: 3, value: 11_000 },
      { reason: 'COUNT_VARIANCE', count: 1, qty: 2, value: 5_000 },
      { reason: 'DAMAGED', count: 1, qty: 1, value: 5_000 },
    ]);
    expect(d.byProduct.map((p: { productId: string; value: number }) => [p.productId, p.value])).toEqual([
      [a.id, 12_000],
      [b.id, 9_000],
    ]);
    expect((await api(adminToken).get(`/stock-movements/shrinkage?branchId=${branch.id}&from=2026-02-02&to=2026-02-01`)).status).toBe(400);
  });

  it('M15 export — returns every filtered row, capped with a truncated flag', async () => {
    const p = await product('EXP', 3, 100);
    const admin = api(adminToken);
    await admin.post('/stock-movements/adjust', { productId: p.id, delta: -1, reason: 'DAMAGED' });
    await admin.post('/stock-movements/adjust', { productId: p.id, delta: -1, reason: 'DAMAGED' });

    const all = await admin.get(`/stock-movements/export?productId=${p.id}&pageSize=1`);
    expect(all.status).toBe(200);
    expect(all.body.data).toMatchObject({ total: 3, truncated: false, maxRows: 10_000 });
    expect(all.body.data.items).toHaveLength(3); // pageSize is ignored by export

    const capped = await exportList(listStockMovements, { productId: p.id, page: 1, pageSize: 20 }, 2);
    expect(capped).toMatchObject({ total: 3, truncated: true, maxRows: 2 });
    expect(capped.items).toHaveLength(2);

    for (const url of ['/products/export', '/purchase-orders/export', '/stock-transfers/export', '/stock-lots/export', '/stock-counts/export']) {
      const r = await admin.get(url);
      expect(r.status, url).toBe(200);
      expect(Array.isArray(r.body.data.items), url).toBe(true);
    }
    const prod = await admin.get(`/products/export?q=${SKU_PREFIX}EXP`);
    expect(prod.body.data.items.map((x: { id: string }) => x.id)).toEqual([p.id]);
  });
});
