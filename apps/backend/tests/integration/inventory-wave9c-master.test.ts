import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { isValidGtin } from '@abcp/shared-types';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { ABC_A_KEY, ABC_B_KEY, reconcileStock } from '../../src/modules/inventory/inventory.service.js';
import { classifyAbc, computeAbcClasses } from '../../src/modules/inventory/inventory-reports.service.js';

/**
 * Integration — inventory audit wave 9C (docs/inventory-audit.md §4 M1/M2/M3, §7):
 *   M1 units of measure + conversion (PO/GRN/BOM/reservations/price list/reorder) · M2 GTIN/barcode + lookup ·
 *   M3 categories + groupBy + ABC · dashboard low-stock uses the effective reorder threshold.
 * ຕ້ອງມີ PostgreSQL (abcp_test) + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SVC_CATEGORY_ID = '22222222-0000-0000-0000-000000000001';
const SKU = 'SKU-W9C-';
const SUP = 'ຜູ້ສະໜອງ W9C';
const SVC = 'ບໍລິການ W9C';
const CAT = 'W9C cat';
const UOM = 'w9c-';
const BRANCH_NAME = 'W9C isolated branch';
const CUST_PHONE = '02077709903';
const DAY = 86_400_000;

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

async function wipe(): Promise<void> {
  const products = await prisma.product.findMany({ where: { sku: { startsWith: SKU } }, select: { id: true } });
  const pids = products.map((p) => p.id);
  const appts = await prisma.appointment.findMany({ where: { customer: { phone: CUST_PHONE } }, select: { id: true } });
  const aids = appts.map((a) => a.id);
  if (aids.length) {
    await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: aids } } });
    await prisma.stockMovement.deleteMany({ where: { refId: { in: aids.map((id) => `appt:${id}`) } } });
    await prisma.appointment.deleteMany({ where: { id: { in: aids } } });
  }
  await prisma.user.deleteMany({ where: { phone: CUST_PHONE } });
  if (pids.length) {
    await prisma.goodsReceiptLine.deleteMany({ where: { productId: { in: pids } } });
    await prisma.purchaseOrderItem.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockLot.deleteMany({ where: { productId: { in: pids } } });
    await prisma.serviceConsumable.deleteMany({ where: { productId: { in: pids } } });
  }
  await prisma.goodsReceipt.deleteMany({ where: { purchaseOrder: { supplier: { name: { startsWith: SUP } } } } });
  await prisma.purchaseOrder.deleteMany({ where: { supplier: { name: { startsWith: SUP } } } });
  await prisma.supplier.deleteMany({ where: { name: { startsWith: SUP } } });
  if (pids.length) await prisma.product.deleteMany({ where: { id: { in: pids } } });
  await prisma.service.deleteMany({ where: { name: { startsWith: SVC } } });
  await prisma.productCategory.deleteMany({ where: { name: { startsWith: CAT }, parentId: { not: null } } });
  await prisma.productCategory.deleteMany({ where: { name: { startsWith: CAT } } });
  await prisma.uom.deleteMany({ where: { code: { startsWith: UOM } } });
  await prisma.branch.deleteMany({ where: { name: BRANCH_NAME } });
  await prisma.appSetting.deleteMany({ where: { key: { in: [ABC_A_KEY, ABC_B_KEY] } } });
}

describe('Inventory wave 9C — UoM, barcode/GTIN, categories + ABC', () => {
  let app: Express;
  let adminToken: string;
  let managerToken: string;
  let staffProfileId: string;
  let customerId: string;
  let uom: Record<'piece' | 'bottle' | 'box' | 'ml' | 'tube', string>;

  const product = async (sku: string, extra: Record<string, unknown> = {}) =>
    prisma.product.create({
      data: {
        branchId: BRANCH_ID, name: `W9C ${sku}`, sku: `${SKU}${sku}`, unit: 'ຕຸກ', baseUomId: uom.bottle,
        costPrice: 100, stockQty: 0, ...extra,
      },
    });
  /** ສິນຄ້າທີ່ມີ ledger ເປີດ (reconcileStock ສະອາດ). */
  const stocked = async (sku: string, qty: number, cost = 100, extra: Record<string, unknown> = {}) => {
    const p = await product(sku, { stockQty: qty, costPrice: cost, ...extra });
    await prisma.stockMovement.create({
      data: {
        branchId: (extra.branchId as string | undefined) ?? BRANCH_ID, productId: p.id, type: 'ADJUSTMENT_ADD', qty, balanceAfter: qty,
        unitCost: cost, valueChange: qty * cost, reasonCode: 'OPENING_BALANCE',
      },
    });
    return p;
  };
  const conversions = (id: string, rows: { uomId: string; factorToBase: number; isPurchaseDefault?: boolean; isConsumeDefault?: boolean }[]) =>
    request(app).patch(`/api/v1/products/${id}`).set(...bearer(adminToken)).send({ conversions: rows });
  const getProduct = async (id: string) =>
    (await request(app).get(`/api/v1/products/${id}`).set(...bearer(adminToken))).body.data;

  beforeAll(async () => {
    app = createApp();
    await wipe();
    adminToken = (await request(app).post('/api/v1/auth/login').send({ phone: '02000000000', password: 'Admin@12345' })).body
      .data.tokens.accessToken;
    managerToken = (await request(app).post('/api/v1/auth/login').send({ phone: '02000000001', password: 'Manager@12345' }))
      .body.data.tokens.accessToken;
    staffProfileId = (await prisma.staffProfile.findFirstOrThrow({ where: { deletedAt: null }, select: { id: true } })).id;
    customerId = (await prisma.user.create({ data: { name: 'ລູກຄ້າ W9C', phone: CUST_PHONE, role: 'CUSTOMER' } })).id;
    const list = await request(app).get('/api/v1/uoms').set(...bearer(adminToken));
    expect(list.status).toBe(200);
    uom = Object.fromEntries((list.body.data as { code: string; id: string }[]).map((u) => [u.code, u.id])) as typeof uom;
    for (const code of ['piece', 'bottle', 'box', 'ml', 'tube'] as const) expect(uom[code], code).toBeDefined();
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  // ------------------------------------------------------------------ M1

  it('M1 — UoM CRUD: BRANCH_ADMIN may add, only SUPER_ADMIN may edit; duplicate code → 409', async () => {
    const created = await request(app).post('/api/v1/uoms').set(...bearer(managerToken)).send({ code: `${UOM}Sachet`, name: 'Sachet W9C' });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ code: `${UOM}sachet`, isActive: true, productCount: 0 });
    expect((await request(app).post('/api/v1/uoms').set(...bearer(adminToken)).send({ code: `${UOM}sachet`, name: 'x' })).status).toBe(409);
    expect((await request(app).patch(`/api/v1/uoms/${created.body.data.id}`).set(...bearer(managerToken)).send({ name: 'y' })).status).toBe(403);
    const off = await request(app).patch(`/api/v1/uoms/${created.body.data.id}`).set(...bearer(adminToken)).send({ isActive: false });
    expect(off.body.data.isActive).toBe(false);
    const active = await request(app).get('/api/v1/uoms').set(...bearer(adminToken));
    expect((active.body.data as { id: string }[]).some((u) => u.id === created.body.data.id)).toBe(false);
  });

  it('M1 — product create: baseUomId + conversions; legacy unit text resolves/creates a Uom', async () => {
    const res = await request(app).post('/api/v1/products').set(...bearer(adminToken)).send({
      branchId: BRANCH_ID, name: 'W9C conv', sku: `${SKU}CONV`, baseUomId: uom.bottle, costPrice: 1000,
      conversions: [{ uomId: uom.box, factorToBase: 12, isPurchaseDefault: true }, { uomId: uom.ml, factorToBase: 0.002, isConsumeDefault: true }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ baseUomId: uom.bottle, baseUomCode: 'bottle', unit: 'Bottle' });
    expect(res.body.data.conversions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'box', factorToBase: 12, isPurchaseDefault: true }),
        expect.objectContaining({ code: 'ml', factorToBase: 0.002, isConsumeDefault: true }),
      ]),
    );
    // base uom inside conversions → 400
    expect((await conversions(res.body.data.id, [{ uomId: uom.bottle, factorToBase: 1 }])).status).toBe(400);

    const legacy = await request(app).post('/api/v1/products').set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, name: 'W9C legacy', sku: `${SKU}LEG`, unit: 'ຫຼອດ', costPrice: 10 });
    expect(legacy.status).toBe(201);
    expect(legacy.body.data.baseUomId).toBe(uom.tube); // matched by nameLo
    const custom = await request(app).post('/api/v1/products').set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, name: 'W9C custom', sku: `${SKU}CUS`, unit: `${UOM}Drum`, costPrice: 10 });
    expect(custom.body.data.baseUomCode).toBe(`${UOM}drum`);
    expect((await request(app).post('/api/v1/products').set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, name: 'x', sku: `${SKU}NOU`, costPrice: 1 })).status).toBe(400);

    // base uom can only change before any stock movement
    expect((await request(app).patch(`/api/v1/products/${custom.body.data.id}`).set(...bearer(adminToken)).send({ baseUomId: uom.piece })).body.data)
      .toMatchObject({ baseUomId: uom.piece, unit: 'Piece' });
    const moved = await stocked('MOVED', 5);
    expect((await request(app).patch(`/api/v1/products/${moved.id}`).set(...bearer(adminToken)).send({ baseUomId: uom.piece })).status).toBe(409);
  });

  it('M1 — PO in box-of-12 with FX: stock + WAC per base unit, GRN in ordered/base/other units, over-receipt in boxes', async () => {
    const sup = await prisma.supplier.create({ data: { name: `${SUP} THB`, phone: '1', currency: 'THB' } });
    const p = await stocked('BOX', 12, 5000);
    expect((await conversions(p.id, [{ uomId: uom.box, factorToBase: 12, isPurchaseDefault: true }])).status).toBe(200);

    // 5 boxes × 120 THB/box @ 600 LAK/THB → 60 bottles × 10 THB
    const po = await request(app).post('/api/v1/purchase-orders').set(...bearer(adminToken)).send({
      branchId: BRANCH_ID, supplierId: sup.id, fxRate: 600, status: 'ORDERED',
      items: [{ productId: p.id, quantity: 5, unitCost: 120, uomId: uom.box }],
    });
    expect(po.status).toBe(201);
    expect(po.body.data).toMatchObject({ totalAmount: 600, totalAmountLak: 360000 });
    const item = po.body.data.items[0];
    expect(item).toMatchObject({ quantity: 60, unitCost: 10, uomId: uom.box, uomCode: 'box', factorToBase: 12, uomQty: 5, uomUnitCost: 120, lineTotal: 600 });

    // unit without a conversion → 400
    expect((await request(app).post(`/api/v1/purchase-orders/${po.body.data.id}/receipts`).set(...bearer(adminToken))
      .send({ lines: [{ poItemId: item.id, qtyReceived: 1, uomId: uom.ml }] })).status).toBe(400);

    // default = ordered unit: 2 boxes = 24 bottles at 10 THB × 600 = 6000 LAK / bottle
    const g1 = await request(app).post(`/api/v1/purchase-orders/${po.body.data.id}/receipts`).set(...bearer(adminToken))
      .send({ lines: [{ poItemId: item.id, qtyReceived: 2 }] });
    expect(g1.status).toBe(201);
    expect(g1.body.data.receipt.lines[0]).toMatchObject({ qtyReceived: 24, unitCost: 6000, unitCostForeign: 10, uomCode: 'box', factorToBase: 12, lineValue: 144000 });
    let fresh = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(fresh.stockQty.toNumber()).toBe(36);
    // WAC per bottle = (12×5000 + 24×6000) / 36
    expect(fresh.costPrice.toNumber()).toBeCloseTo((12 * 5000 + 24 * 6000) / 36, 3);
    const mv = await prisma.stockMovement.findFirstOrThrow({ where: { productId: p.id, type: 'PURCHASE_IN' } });
    expect(mv.qty.toNumber()).toBe(24);
    expect(mv.unitCost!.toNumber()).toBe(6000);

    // over-receipt measured in boxes: 36 bottles outstanding = 3 boxes; 4 boxes → 409
    expect((await request(app).post(`/api/v1/purchase-orders/${po.body.data.id}/receipts`).set(...bearer(adminToken))
      .send({ lines: [{ poItemId: item.id, qtyReceived: 4 }] })).status).toBe(409);

    // explicit base unit + price override per bottle (THB) → 12 bottles @ 11 THB
    const g2 = await request(app).post(`/api/v1/purchase-orders/${po.body.data.id}/receipts`).set(...bearer(adminToken))
      .send({ lines: [{ poItemId: item.id, qtyReceived: 12, uomId: null, unitCost: 11 }] });
    expect(g2.body.data.receipt.lines[0]).toMatchObject({ qtyReceived: 12, unitCost: 6600, factorToBase: 1 });
    // remaining 2 boxes via the legacy "receive all" path (base outstanding)
    const rest = await request(app).post(`/api/v1/purchase-orders/${po.body.data.id}/receive`).set(...bearer(adminToken)).send({});
    expect(rest.status).toBe(200);
    expect(rest.body.data.status).toBe('RECEIVED');
    fresh = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(fresh.stockQty.toNumber()).toBe(72);
    expect(fresh.costPrice.toNumber()).toBeCloseTo((12 * 5000 + 24 * 6000 + 12 * 6600 + 24 * 6000) / 72, 3);
    const match = await request(app).get(`/api/v1/purchase-orders/${po.body.data.id}/match`).set(...bearer(adminToken));
    expect(match.body.data.ordered).toBe(360000);
    expect((await reconcileStock()).mismatches.filter((m) => m.productId === p.id)).toEqual([]);

    // conversion used by an open PO/price list cannot be removed
    const po2 = await request(app).post('/api/v1/purchase-orders').set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, supplierId: sup.id, fxRate: 600, items: [{ productId: p.id, quantity: 1, unitCost: 120, uomId: uom.box }] });
    expect((await conversions(p.id, [])).status).toBe(409);
    await request(app).delete(`/api/v1/purchase-orders/${po2.body.data.id}`).set(...bearer(adminToken));
  });

  it('M1 — price list per purchase unit: PO default cost ÷ factor; reorder suggestion rounds in boxes × MOQ', async () => {
    const sup = await prisma.supplier.create({ data: { name: `${SUP} LAK`, phone: '2' } });
    const p = await product('SUGG', { minStockQty: 5 });
    await conversions(p.id, [{ uomId: uom.box, factorToBase: 12, isPurchaseDefault: true }]);
    const sp = await request(app).put(`/api/v1/suppliers/${sup.id}/products`).set(...bearer(adminToken))
      .send({ productId: p.id, unitCost: 60000, moq: 2, uomId: uom.box, isPreferred: true });
    expect(sp.status).toBe(200);
    expect(sp.body.data).toMatchObject({ uomId: uom.box, uomCode: 'box', factorToBase: 12, unitCost: 60000, moq: 2 });

    const po = await request(app).post('/api/v1/purchase-orders').set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, supplierId: sup.id, items: [{ productId: p.id, quantity: 1, uomId: uom.box }] });
    expect(po.body.data.items[0]).toMatchObject({ quantity: 12, unitCost: 5000, uomUnitCost: 60000, lineTotal: 60000 });
    await request(app).delete(`/api/v1/purchase-orders/${po.body.data.id}`).set(...bearer(adminToken));

    const sugg = await request(app).get(`/api/v1/purchase-orders/suggestions?branchId=${BRANCH_ID}`).set(...bearer(adminToken));
    const it = (sugg.body.data.groups as { items: { productId: string }[] }[]).flatMap((g) => g.items).find((i) => i.productId === p.id);
    // short 5 bottles → 0.42 box → 1 box → MOQ 2 boxes = 24 bottles
    expect(it).toMatchObject({ uomId: uom.box, factorToBase: 12, suggestedUomQty: 2, suggestedQty: 24, uomUnitCost: 60000, lineTotal: 120000 });
  });

  it('M1 — BOM written in ml against stock in bottles: consumes + reserves the base fraction; factor edits propagate', async () => {
    const p = await stocked('ML', 10, 50000);
    await conversions(p.id, [{ uomId: uom.ml, factorToBase: 0.002, isConsumeDefault: true }]); // 500 ml bottle
    const svc = await request(app).post('/api/v1/services').set(...bearer(adminToken)).send({
      categoryId: SVC_CATEGORY_ID, name: `${SVC} ml`, price: 100000, durationMinutes: 30,
      consumables: [{ productId: p.id, qtyPerUse: 30, uomId: uom.ml }],
    });
    expect(svc.status).toBe(201);
    expect(svc.body.data.consumables[0]).toMatchObject({ qtyPerUse: 30, uomCode: 'ml', factorToBase: 0.002, baseQtyPerUse: 0.06 });

    const start = new Date(Date.now() + 5 * DAY);
    const appt = await prisma.appointment.create({
      data: {
        branchId: BRANCH_ID, customerId, staffProfileId, serviceId: svc.body.data.id, status: 'PENDING',
        startAt: start, endAt: new Date(start.getTime() + 30 * 60_000), totalAmount: 100000, currency: 'LAK',
      },
    });
    const setStatus = (status: string) =>
      request(app).patch(`/api/v1/appointments/${appt.id}/status`).set(...bearer(adminToken)).send({ status });
    expect((await setStatus('CONFIRMED')).status).toBe(200);
    const [r] = await prisma.stockReservation.findMany({ where: { appointmentId: appt.id } });
    expect(r!.qty.toNumber()).toBe(0.06);
    expect(await getProduct(p.id)).toMatchObject({ reservedQty: 0.06, availableQty: 9.94 });

    // BOM unit in use → conversion cannot be removed; factor change updates the BOM snapshot
    expect((await conversions(p.id, [])).status).toBe(409);
    await conversions(p.id, [{ uomId: uom.ml, factorToBase: 0.001, isConsumeDefault: true }]); // 1 L bottle
    const bom = await prisma.serviceConsumable.findFirstOrThrow({ where: { productId: p.id } });
    expect(bom.factorToBase.toNumber()).toBe(0.001);
    await conversions(p.id, [{ uomId: uom.ml, factorToBase: 0.002, isConsumeDefault: true }]);

    expect((await setStatus('COMPLETED')).status).toBe(200);
    const fresh = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(fresh.stockQty.toNumber()).toBe(9.94);
    const mv = await prisma.stockMovement.findFirstOrThrow({ where: { productId: p.id, type: 'SERVICE_CONSUMED' } });
    expect(mv.qty.toNumber()).toBe(0.06);
    expect(mv.valueChange!.toNumber()).toBe(-3000);
    expect((await prisma.stockReservation.findFirstOrThrow({ where: { appointmentId: appt.id } })).status).toBe('CONSUMED');
    expect((await reconcileStock()).mismatches.filter((m) => m.productId === p.id)).toEqual([]);

    // legacy BOM rows (no uom) keep factor 1
    const legacy = await prisma.service.create({
      data: { categoryId: SVC_CATEGORY_ID, name: `${SVC} legacy`, price: 1, durationMinutes: 10, consumables: { create: [{ productId: p.id, qtyPerUse: 0.5 }] } },
    });
    const view = await request(app).get(`/api/v1/services/${legacy.id}`).set(...bearer(adminToken));
    expect(view.body.data.consumables[0]).toMatchObject({ qtyPerUse: 0.5, uomId: null, factorToBase: 1, baseQtyPerUse: 0.5 });
  });

  // ------------------------------------------------------------------ M2

  it('M2 — GTIN check digit + per-branch uniqueness; soft delete frees the codes', async () => {
    expect(isValidGtin('4006381333931')).toBe(true);
    expect(isValidGtin('96385074')).toBe(true);
    expect(isValidGtin('036000291452')).toBe(true);
    expect(isValidGtin('10614141000415')).toBe(true);
    expect(isValidGtin('4006381333932')).toBe(false);
    expect(isValidGtin('12345')).toBe(false);

    const body = (sku: string, extra: Record<string, unknown> = {}) => ({
      branchId: BRANCH_ID, name: `W9C ${sku}`, sku: `${SKU}${sku}`, baseUomId: uom.piece, costPrice: 1, ...extra,
    });
    const bad = await request(app).post('/api/v1/products').set(...bearer(adminToken)).send(body('G0', { gtin: '8850000123451' }));
    expect(bad.status).toBe(400);
    expect((await request(app).post('/api/v1/products').set(...bearer(adminToken)).send(body('G0', { gtin: '88500001234' }))).status).toBe(400);

    const a = await request(app).post('/api/v1/products').set(...bearer(adminToken)).send(body('G1', { gtin: '8850000123450', barcode: 'W9C-BC-1' }));
    expect(a.status).toBe(201);
    expect(a.body.data).toMatchObject({ gtin: '8850000123450', barcode: 'W9C-BC-1' });
    expect((await request(app).post('/api/v1/products').set(...bearer(adminToken)).send(body('G2', { gtin: '8850000123450' }))).status).toBe(409);
    expect((await request(app).post('/api/v1/products').set(...bearer(adminToken)).send(body('G2', { barcode: 'W9C-BC-1' }))).status).toBe(409);
    const b = await request(app).post('/api/v1/products').set(...bearer(adminToken)).send(body('G2', { gtin: '8850000543210' }));
    expect((await request(app).patch(`/api/v1/products/${b.body.data.id}`).set(...bearer(adminToken)).send({ gtin: '8850000123450' })).status).toBe(409);

    // another branch may reuse the same GTIN
    const other = await prisma.branch.create({ data: { name: BRANCH_NAME, address: '—', phone: '020', baseCurrency: 'LAK' } });
    expect((await request(app).post('/api/v1/products').set(...bearer(adminToken)).send(body('G3', { branchId: other.id, gtin: '8850000123450' }))).status).toBe(201);

    // soft delete (zero stock) frees sku + gtin + barcode
    expect((await request(app).delete(`/api/v1/products/${a.body.data.id}`).set(...bearer(adminToken))).status).toBe(204);
    const again = await request(app).post('/api/v1/products').set(...bearer(adminToken)).send(body('G1', { gtin: '8850000123450', barcode: 'W9C-BC-1' }));
    expect(again.status).toBe(201);
  });

  it('M2 — GET /products/lookup matches GTIN (incl. zero-padded), barcode, SKU; 404; branch-scoped', async () => {
    const p = await request(app).post('/api/v1/products').set(...bearer(adminToken)).send({
      branchId: BRANCH_ID, name: 'W9C scan', sku: `${SKU}SCAN`, baseUomId: uom.piece, costPrice: 1,
      gtin: '8850000111112', barcode: 'W9C-SCAN-01',
    });
    expect(p.status).toBe(201);
    const look = (code: string, token = adminToken, branchId = BRANCH_ID) =>
      request(app).get(`/api/v1/products/lookup?code=${encodeURIComponent(code)}&branchId=${branchId}`).set(...bearer(token));
    let r = await look('8850000111112');
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ matchedBy: 'gtin', product: { id: p.body.data.id } });
    expect((await look('08850000111112')).body.data.matchedBy).toBe('gtin'); // GTIN-14 form of the EAN-13
    r = await look('w9c-scan-01');
    expect(r.body.data).toMatchObject({ matchedBy: 'barcode', product: { id: p.body.data.id } });
    r = await look(`${SKU}scan`.toLowerCase());
    expect(r.body.data.matchedBy).toBe('sku');
    expect((await look('0000000000000')).status).toBe(404);
    // list search also finds by barcode
    const list = await request(app).get(`/api/v1/products?branchId=${BRANCH_ID}&q=W9C-SCAN-01`).set(...bearer(adminToken));
    expect(list.body.data.items.map((i: { id: string }) => i.id)).toContain(p.body.data.id);
    // BRANCH_ADMIN is forced to its own branch
    const other = await prisma.branch.findFirst({ where: { id: { not: BRANCH_ID } }, select: { id: true } });
    if (other) expect((await look('8850000111112', managerToken, other.id)).status).toBe(403);
  });

  // ------------------------------------------------------------------ M3

  it('M3 — categories: shared = SUPER_ADMIN only, one nesting level; filter (parent includes children), stats, export', async () => {
    expect((await request(app).post('/api/v1/product-categories').set(...bearer(managerToken)).send({ name: `${CAT} x`, branchId: null })).status).toBe(403);
    const parent = await request(app).post('/api/v1/product-categories').set(...bearer(adminToken)).send({ name: `${CAT} skin`, sortOrder: 1 });
    expect(parent.status).toBe(201);
    expect(parent.body.data.branchId).toBeNull();
    const child = await request(app).post('/api/v1/product-categories').set(...bearer(adminToken))
      .send({ name: `${CAT} serum`, parentId: parent.body.data.id });
    expect(child.body.data).toMatchObject({ parentId: parent.body.data.id, parentName: `${CAT} skin` });
    expect((await request(app).post('/api/v1/product-categories').set(...bearer(adminToken))
      .send({ name: `${CAT} deep`, parentId: child.body.data.id })).status).toBe(400);
    const own = await request(app).post('/api/v1/product-categories').set(...bearer(managerToken)).send({ name: `${CAT} own` });
    expect(own.body.data.branchId).toBe(BRANCH_ID);

    const inChild = await stocked('CAT1', 4, 1000, { categoryId: child.body.data.id });
    const inParent = await stocked('CAT2', 2, 500, { categoryId: parent.body.data.id });
    await stocked('CAT3', 1, 100, { categoryId: own.body.data.id });
    const got = await getProduct(inChild.id);
    expect(got).toMatchObject({ categoryId: child.body.data.id, categoryName: `${CAT} skin › ${CAT} serum` });

    const byParent = await request(app).get(`/api/v1/products?branchId=${BRANCH_ID}&categoryId=${parent.body.data.id}`).set(...bearer(adminToken));
    expect(byParent.body.data.items.map((i: { id: string }) => i.id).sort()).toEqual([inChild.id, inParent.id].sort());
    const byChild = await request(app).get(`/api/v1/products?branchId=${BRANCH_ID}&categoryId=${child.body.data.id}`).set(...bearer(adminToken));
    expect(byChild.body.data.total).toBe(1);
    const stats = await request(app).get(`/api/v1/products/stats?branchId=${BRANCH_ID}&categoryId=${parent.body.data.id}`).set(...bearer(adminToken));
    expect(stats.body.data).toMatchObject({ totalProducts: 2, totalStockValue: 5000 });
    const exp = await request(app).get(`/api/v1/products/export?branchId=${BRANCH_ID}&categoryId=${parent.body.data.id}`).set(...bearer(adminToken));
    expect(exp.body.data.total).toBe(2);

    // in-use category cannot be deleted
    expect((await request(app).delete(`/api/v1/product-categories/${child.body.data.id}`).set(...bearer(adminToken))).status).toBe(409);
  });

  it('M3 — valuation / turnover / aging groupBy=category', async () => {
    const other = (await prisma.branch.findFirst({ where: { name: BRANCH_NAME } })) ??
      (await prisma.branch.create({ data: { name: BRANCH_NAME, address: '—', phone: '020', baseCurrency: 'LAK' } }));
    const cat = await prisma.productCategory.create({ data: { name: `${CAT} report` } });
    await stocked('RPT1', 10, 100, { branchId: other.id, categoryId: cat.id });
    await stocked('RPT2', 5, 200, { branchId: other.id, categoryId: cat.id });
    await stocked('RPT3', 3, 100, { branchId: other.id });

    const val = await request(app).get(`/api/v1/stock-movements/valuation?branchId=${other.id}&groupBy=category`).set(...bearer(adminToken));
    expect(val.status).toBe(200);
    const groups = val.body.data.groups as { categoryId: string | null; products: number; qty: number; value: number }[];
    expect(groups.find((g) => g.categoryId === cat.id)).toMatchObject({ products: 2, qty: 15, value: 2000 });
    expect(groups.find((g) => g.categoryId === null)).toMatchObject({ products: 1, value: 300 });
    expect(groups[groups.length - 1]!.categoryId).toBeNull();
    expect((await request(app).get(`/api/v1/stock-movements/valuation?branchId=${other.id}`).set(...bearer(adminToken))).body.data.groups).toBeUndefined();

    const turn = await request(app).get(`/api/v1/stock-movements/turnover?branchId=${other.id}&groupBy=category`).set(...bearer(adminToken));
    expect(turn.body.data.groups.find((g: { categoryId: string | null }) => g.categoryId === cat.id)).toMatchObject({ products: 2, closingValue: 2000 });
    const aging = await request(app).get(`/api/v1/stock-movements/aging?branchId=${other.id}&groupBy=category`).set(...bearer(adminToken));
    const ag = aging.body.data.groups.find((g: { categoryId: string | null }) => g.categoryId === cat.id);
    expect(ag).toMatchObject({ qty: 15, value: 2000 });
    expect(ag.byBucket['0-30']).toBe(2000);
  });

  it('M3 — ABC classification math (cumulative share, crossing item stays in the upper class)', () => {
    const r = classifyAbc(
      [
        { id: 'e', value: 5 }, { id: 'a', value: 50 }, { id: 'c', value: 10 }, { id: 'b', value: 30 }, { id: 'd', value: 5 }, { id: 'z', value: 0 },
      ].map((x) => ({ ...x, name: x.id })), // ties broken by name
      80,
      95,
    );
    expect(r.map((x) => `${x.id}${x.abcClass}`)).toEqual(['aA', 'bA', 'cB', 'dB', 'eC', 'zC']);
    expect(r[1]).toMatchObject({ sharePct: 30, cumulativePct: 80 });
    // a single dominant item is A even though it alone exceeds 80 %
    expect(classifyAbc([{ id: 'x', value: 90 }, { id: 'y', value: 6 }, { id: 'w', value: 4 }], 80, 95).map((x) => x.abcClass)).toEqual(['A', 'B', 'C']);
    // nothing has value → all C
    expect(classifyAbc([{ value: 0 }, { value: 0 }], 80, 95).every((x) => x.abcClass === 'C')).toBe(true);
  });

  it('M3 — GET /stock-movements/abc (stockValue + consumptionValue), settings thresholds, nightly abcClass', async () => {
    const other = (await prisma.branch.findFirst({ where: { name: BRANCH_NAME } })) ??
      (await prisma.branch.create({ data: { name: BRANCH_NAME, address: '—', phone: '020', baseCurrency: 'LAK' } }));
    // isolated branch — only this test's products (plus earlier test rows) → use fresh products and filter rows
    const ps = await Promise.all(
      [['ABC1', 50], ['ABC2', 30], ['ABC3', 10], ['ABC4', 5], ['ABC5', 5]].map(([sku, v]) =>
        stocked(sku as string, 1, v as number, { branchId: other.id }),
      ),
    );
    await prisma.product.updateMany({ where: { branchId: other.id, id: { notIn: ps.map((p) => p.id) } }, data: { deletedAt: new Date() } });

    let abc = await request(app).get(`/api/v1/stock-movements/abc?branchId=${other.id}&basis=stockValue`).set(...bearer(adminToken));
    expect(abc.status).toBe(200);
    expect(abc.body.data.thresholds).toEqual({ a: 80, b: 95 });
    const cls = () => Object.fromEntries((abc.body.data.rows as { sku: string; abcClass: string }[]).map((r) => [r.sku.replace(SKU, ''), r.abcClass]));
    expect(cls()).toEqual({ ABC1: 'A', ABC2: 'A', ABC3: 'B', ABC4: 'B', ABC5: 'C' });
    expect(abc.body.data.classes).toEqual([
      { abcClass: 'A', products: 2, value: 80, sharePct: 80 },
      { abcClass: 'B', products: 2, value: 15, sharePct: 15 },
      { abcClass: 'C', products: 1, value: 5, sharePct: 5 },
    ]);

    // thresholds from settings (A=50 → only the top item)
    expect((await request(app).put('/api/v1/stock-adjustments/settings').set(...bearer(adminToken)).send({ abcA: 96 })).status).toBe(400);
    expect((await request(app).put('/api/v1/stock-adjustments/settings').set(...bearer(adminToken)).send({ abcA: 50 })).body.data).toMatchObject({ abcA: 50, abcB: 95 });
    abc = await request(app).get(`/api/v1/stock-movements/abc?branchId=${other.id}&basis=stockValue`).set(...bearer(adminToken));
    expect(cls()).toMatchObject({ ABC1: 'A', ABC2: 'B', ABC3: 'B', ABC4: 'B' });
    await prisma.appSetting.deleteMany({ where: { key: { in: [ABC_A_KEY, ABC_B_KEY] } } });

    // consumption basis: only ABC5 consumed → A; others C
    await prisma.stockMovement.create({
      data: { branchId: other.id, productId: ps[4]!.id, type: 'SERVICE_CONSUMED', qty: 1, balanceAfter: 0, unitCost: 5, valueChange: -5 },
    });
    await prisma.product.update({ where: { id: ps[4]!.id }, data: { stockQty: 0 } });
    abc = await request(app).get(`/api/v1/stock-movements/abc?branchId=${other.id}`).set(...bearer(adminToken));
    expect(abc.body.data.basis).toBe('consumptionValue');
    expect(cls()).toEqual({ ABC5: 'A', ABC1: 'C', ABC2: 'C', ABC3: 'C', ABC4: 'C' });

    await computeAbcClasses(new Date(Date.now() + 60_000));
    expect((await getProduct(ps[4]!.id)).abcClass).toBe('A');
    expect((await getProduct(ps[0]!.id)).abcClass).toBe('C');
  });

  // ------------------------------------------------------------------ dashboard follow-up

  it('dashboard low-stock uses max(minStockQty, reorderPoint)', async () => {
    const other = (await prisma.branch.findFirst({ where: { name: BRANCH_NAME } })) ??
      (await prisma.branch.create({ data: { name: BRANCH_NAME, address: '—', phone: '020', baseCurrency: 'LAK' } }));
    await prisma.product.updateMany({ where: { branchId: other.id }, data: { isActive: false } });
    const viaRp = await product('DASH1', { branchId: other.id, stockQty: 8, minStockQty: 5, reorderPoint: 10 });
    await product('DASH2', { branchId: other.id, stockQty: 8, minStockQty: 5, reorderPoint: null });
    const res = await request(app).get(`/api/v1/dashboard/stats?branchId=${other.id}`).set(...bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.lowStockItems).toEqual([expect.objectContaining({ id: viaRp.id, minStockQty: 5, threshold: 10 })]);
    expect(res.body.data.attention.lowStock).toBe(1);
  });
});
