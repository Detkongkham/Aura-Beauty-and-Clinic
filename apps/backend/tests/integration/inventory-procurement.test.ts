import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import {
  INVOICE_MATCH_TOLERANCE_KEY,
  OVER_RECEIPT_TOLERANCE_KEY,
  PO_APPROVAL_THRESHOLD_KEY,
  SHRINKAGE_MOVEMENT_WHERE,
  reconcileStock,
} from '../../src/modules/inventory/inventory.service.js';

/**
 * Integration — inventory audit wave 9D (docs/inventory-audit.md §7):
 *   H4 GRN / partial receipts / over-receipt tolerance / close short · legacy /receive · M7 item upsert ·
 *   M6 PO approval · 3-way match + expense approval block/override · H5 supplier return + debit note.
 * ຕ້ອງມີ PostgreSQL (abcp_test) + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SKU_PREFIX = 'SKU-W9D-';
const SUPPLIER_NAME = 'ຜູ້ສະໜອງທົດສອບ W9D';
const TITLE_TAG = '[w9d-test]';
const SETTING_KEYS = [PO_APPROVAL_THRESHOLD_KEY, OVER_RECEIPT_TOLERANCE_KEY, INVOICE_MATCH_TOLERANCE_KEY];

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];
const idem = (): [string, string] => ['Idempotency-Key', randomUUID()];

async function wipe(): Promise<void> {
  const products = await prisma.product.findMany({ where: { sku: { startsWith: SKU_PREFIX } }, select: { id: true } });
  const pids = products.map((p) => p.id);
  await prisma.expense.deleteMany({ where: { title: { startsWith: TITLE_TAG } } });
  await prisma.supplierReturn.deleteMany({ where: { supplier: { name: SUPPLIER_NAME } } });
  if (pids.length) {
    await prisma.purchaseOrderItem.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockLot.deleteMany({ where: { productId: { in: pids } } });
  }
  await prisma.purchaseOrder.deleteMany({ where: { supplier: { name: SUPPLIER_NAME } } });
  await prisma.supplier.deleteMany({ where: { name: SUPPLIER_NAME } });
  if (pids.length) await prisma.product.deleteMany({ where: { id: { in: pids } } });
  await prisma.appSetting.deleteMany({ where: { key: { in: SETTING_KEYS } } });
  await prisma.notificationLog.deleteMany({ where: { type: { startsWith: 'PO_' } } });
}

describe('Inventory wave 9D — GRN, PO approval, 3-way match, supplier returns', () => {
  let app: Express;
  let adminToken: string;
  let managerToken: string;
  let supplierId: string;

  const product = async (sku: string, extra: Record<string, unknown> = {}) =>
    prisma.product.create({
      data: { branchId: BRANCH_ID, name: `W9D ${sku}`, sku: `${SKU_PREFIX}${sku}`, unit: 'ຕຸກ', costPrice: 100, stockQty: 0, ...extra },
    });
  const createPo = (token: string, items: object[], status = 'DRAFT') =>
    request(app).post('/api/v1/purchase-orders').set(...bearer(token)).send({ branchId: BRANCH_ID, supplierId, items, status });
  const receipt = (poId: string, lines: object[], token = adminToken) =>
    request(app).post(`/api/v1/purchase-orders/${poId}/receipts`).set(...bearer(token)).send({ lines, supplierDeliveryNote: 'DN-1' });
  const getPo = async (id: string) => (await request(app).get(`/api/v1/purchase-orders/${id}`).set(...bearer(adminToken))).body.data;
  const stockOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stockQty.toNumber();
  const wacOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).costPrice.toNumber();

  beforeAll(async () => {
    app = createApp();
    await wipe();
    adminToken = (await request(app).post('/api/v1/auth/login').send({ phone: '02000000000', password: 'Admin@12345' })).body.data.tokens
      .accessToken;
    managerToken = (await request(app).post('/api/v1/auth/login').send({ phone: '02000000001', password: 'Manager@12345' })).body.data
      .tokens.accessToken;
    supplierId = (await prisma.supplier.create({ data: { name: SUPPLIER_NAME, phone: '020 0000 9999' } })).id;
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('H4 — two partial GRNs blend WAC and move ORDERED → PARTIALLY_RECEIVED → RECEIVED', async () => {
    const p = await product('PART', { stockQty: 10, costPrice: 100 });
    // ledger ເປີດໃຫ້ reconcileStock ສະອາດ
    await prisma.stockMovement.create({
      data: { branchId: BRANCH_ID, productId: p.id, type: 'ADJUSTMENT_ADD', qty: 10, balanceAfter: 10, reasonCode: 'OPENING_BALANCE' },
    });
    const po = await createPo(adminToken, [{ productId: p.id, quantity: 10, unitCost: 200 }], 'ORDERED');
    expect(po.status).toBe(201);
    expect(po.body.data.status).toBe('ORDERED');
    const item = po.body.data.items[0];

    const g1 = await receipt(po.body.data.id, [{ poItemId: item.id, qtyReceived: 4, qtyRejected: 1, rejectReason: 'ແຕກ' }]);
    expect(g1.status).toBe(201);
    expect(g1.body.data.receipt.grnNumber).toMatch(/^GRN-[A-Z0-9]+-\d{4}-\d{6}$/);
    expect(g1.body.data.purchaseOrder.status).toBe('PARTIALLY_RECEIVED');
    expect(g1.body.data.purchaseOrder.items[0]).toMatchObject({ qtyReceived: 4, qtyRejected: 1, qtyOutstanding: 6 });
    expect(await stockOf(p.id)).toBe(14);
    // (10×100 + 4×200) / 14
    expect(await wacOf(p.id)).toBeCloseTo(1800 / 14, 3);

    const g2 = await receipt(po.body.data.id, [{ poItemId: item.id, qtyReceived: 6, unitCost: 250 }]);
    expect(g2.status).toBe(201);
    expect(g2.body.data.purchaseOrder.status).toBe('RECEIVED');
    expect(await stockOf(p.id)).toBe(20);
    expect(await wacOf(p.id)).toBeCloseTo((1800 + 6 * 250) / 20, 3);

    const moves = await prisma.stockMovement.findMany({ where: { productId: p.id, type: 'PURCHASE_IN' }, orderBy: { createdAt: 'asc' } });
    expect(moves.map((m) => m.qty.toNumber())).toEqual([4, 6]);
    expect(moves[0]!.refId).toBe(`grn:${g1.body.data.receipt.id}`);
    const detail = await getPo(po.body.data.id);
    expect(detail.receipts).toHaveLength(2);
    expect((await receipt(po.body.data.id, [{ poItemId: item.id, qtyReceived: 1 }])).status).toBe(409);
    expect((await reconcileStock()).mismatches.filter((m) => m.productId === p.id)).toEqual([]);
  });

  it('H4 — over-receipt beyond tolerance returns 409; within tolerance passes', async () => {
    const p = await product('TOL');
    const po = await createPo(adminToken, [{ productId: p.id, quantity: 10, unitCost: 100 }], 'ORDERED');
    const itemId = po.body.data.items[0].id;
    expect((await receipt(po.body.data.id, [{ poItemId: itemId, qtyReceived: 10.5 }])).status).toBe(409);
    await request(app).put('/api/v1/stock-adjustments/settings').set(...bearer(adminToken)).send({ overReceiptTolerancePct: 10 });
    const settings = await request(app).get('/api/v1/stock-adjustments/settings').set(...bearer(adminToken));
    expect(settings.body.data).toMatchObject({ overReceiptTolerancePct: 10, poApprovalThresholdLak: 5_000_000, invoiceMatchTolerancePct: 1 });
    expect((await receipt(po.body.data.id, [{ poItemId: itemId, qtyReceived: 11.5 }])).status).toBe(409);
    const ok = await receipt(po.body.data.id, [{ poItemId: itemId, qtyReceived: 11 }]);
    expect(ok.status).toBe(201);
    expect(ok.body.data.purchaseOrder.status).toBe('RECEIVED');
    await prisma.appSetting.deleteMany({ where: { key: OVER_RECEIPT_TOLERANCE_KEY } });
  });

  it('H4 — each GRN line carries its own lot for trackLot products; missing lot → 400', async () => {
    const p = await product('LOT', { trackLot: true });
    const po = await createPo(adminToken, [{ productId: p.id, quantity: 10, unitCost: 100 }], 'ORDERED');
    const itemId = po.body.data.items[0].id;
    expect((await receipt(po.body.data.id, [{ poItemId: itemId, qtyReceived: 3 }])).status).toBe(400);
    expect(
      (await receipt(po.body.data.id, [{ poItemId: itemId, qtyReceived: 3, lotNumber: 'W9D-A', expiryDate: '2030-01-31' }])).status,
    ).toBe(201);
    expect(
      (await receipt(po.body.data.id, [{ poItemId: itemId, qtyReceived: 7, lotNumber: 'W9D-B', expiryDate: '2030-06-30' }])).status,
    ).toBe(201);
    const lots = await prisma.stockLot.findMany({ where: { productId: p.id }, orderBy: { lotNumber: 'asc' } });
    expect(lots.map((l) => [l.lotNumber, l.qtyOnHand.toNumber()])).toEqual([
      ['W9D-A', 3],
      ['W9D-B', 7],
    ]);
    const grnLines = await prisma.goodsReceiptLine.findMany({ where: { poItemId: itemId }, orderBy: { lotNumber: 'asc' } });
    expect(grnLines.map((l) => l.lotId)).toEqual(lots.map((l) => l.id));
  });

  it('legacy POST /receive still receives everything outstanding (via a GRN)', async () => {
    const p = await product('LEGACY');
    const q = await product('LEGACY2');
    const po = await createPo(adminToken, [
      { productId: p.id, quantity: 5, unitCost: 100 },
      { productId: q.id, quantity: 2, unitCost: 300 },
    ]);
    const pItem = po.body.data.items.find((i: { productId: string }) => i.productId === p.id);
    expect((await receipt(po.body.data.id, [{ poItemId: pItem.id, qtyReceived: 2 }])).status).toBe(201);
    const res = await request(app).post(`/api/v1/purchase-orders/${po.body.data.id}/receive`).set(...bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RECEIVED');
    expect(await stockOf(p.id)).toBe(5);
    expect(await stockOf(q.id)).toBe(2);
    expect(res.body.data.receipts).toHaveLength(2);
    expect((await request(app).post(`/api/v1/purchase-orders/${po.body.data.id}/receive`).set(...bearer(adminToken))).status).toBe(409);
  });

  it('H4 — close short: remaining qty stops being outstanding, no further receipts; unreceived PO cannot close short', async () => {
    const p = await product('SHORT');
    const po = await createPo(adminToken, [{ productId: p.id, quantity: 10, unitCost: 100 }], 'ORDERED');
    const id = po.body.data.id;
    const close = (reason = 'ຜູ້ສະໜອງໝົດ') =>
      request(app).post(`/api/v1/purchase-orders/${id}/close-short`).set(...bearer(adminToken)).send({ reason });
    expect((await close()).status).toBe(409);
    await receipt(id, [{ poItemId: po.body.data.items[0].id, qtyReceived: 6 }]);
    const res = await close();
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('RECEIVED');
    expect(res.body.data.closedShortAt).not.toBeNull();
    expect(res.body.data.items[0]).toMatchObject({ qtyReceived: 6, qtyOutstanding: 0 });
    expect((await receipt(id, [{ poItemId: po.body.data.items[0].id, qtyReceived: 1 }])).status).toBe(409);
  });

  it('M7 — editing items upserts by productId (ids kept), blocks removing/reducing received lines', async () => {
    const a = await product('M7A');
    const b = await product('M7B');
    const c = await product('M7C');
    const po = await createPo(adminToken, [
      { productId: a.id, quantity: 10, unitCost: 100 },
      { productId: b.id, quantity: 5, unitCost: 100 },
    ], 'ORDERED');
    const id = po.body.data.id;
    const idOf = (items: { productId: string; id: string }[], pid: string) => items.find((i) => i.productId === pid)!.id;
    const aItemId = idOf(po.body.data.items, a.id);
    await receipt(id, [{ poItemId: aItemId, qtyReceived: 4 }]);

    const patch = (items: object[]) => request(app).patch(`/api/v1/purchase-orders/${id}`).set(...bearer(adminToken)).send({ items });
    expect((await patch([{ productId: b.id, quantity: 5, unitCost: 100 }])).status).toBe(409); // removes received A
    expect((await patch([{ productId: a.id, quantity: 3, unitCost: 100 }, { productId: b.id, quantity: 5, unitCost: 100 }])).status).toBe(409);

    const ok = await patch([
      { productId: a.id, quantity: 8, unitCost: 110 },
      { productId: c.id, quantity: 2, unitCost: 50 },
    ]);
    expect(ok.status).toBe(200);
    expect(ok.body.data.items).toHaveLength(2);
    expect(idOf(ok.body.data.items, a.id)).toBe(aItemId);
    expect(ok.body.data.items.find((i: { productId: string }) => i.productId === a.id)).toMatchObject({ quantity: 8, qtyReceived: 4 });
    expect(ok.body.data.totalAmount).toBe(8 * 110 + 2 * 50);
    expect(ok.body.data.status).toBe('PARTIALLY_RECEIVED');
    // ຄືນ = ຍົກເລີກບໍ່ໄດ້ (ມີການຮັບ)
    expect((await request(app).patch(`/api/v1/purchase-orders/${id}`).set(...bearer(adminToken)).send({ status: 'CANCELLED' })).status).toBe(409);
  });

  it('M6 — BRANCH_ADMIN ordering above threshold → PENDING_APPROVAL; SUPER_ADMIN approves/rejects', async () => {
    await request(app).put('/api/v1/stock-adjustments/settings').set(...bearer(adminToken)).send({ poApprovalThresholdLak: 1_000 });
    const p = await product('APPR');
    const small = await createPo(managerToken, [{ productId: p.id, quantity: 1, unitCost: 500 }], 'ORDERED');
    expect(small.body.data.status).toBe('ORDERED');
    const big = await createPo(managerToken, [{ productId: p.id, quantity: 20, unitCost: 100 }], 'ORDERED');
    expect(big.status).toBe(201);
    expect(big.body.data.status).toBe('PENDING_APPROVAL');
    const id = big.body.data.id;
    expect((await receipt(id, [{ poItemId: big.body.data.items[0].id, qtyReceived: 1 }], managerToken)).status).toBe(409);
    expect((await request(app).post(`/api/v1/purchase-orders/${id}/approve`).set(...bearer(managerToken))).status).toBe(403);

    const rej = await request(app).post(`/api/v1/purchase-orders/${id}/reject`).set(...bearer(adminToken)).send({ reason: 'ແພງໄປ' });
    expect(rej.body.data).toMatchObject({ status: 'DRAFT', rejectedReason: 'ແພງໄປ' });
    const reorder = await request(app).patch(`/api/v1/purchase-orders/${id}`).set(...bearer(managerToken)).send({ status: 'ORDERED' });
    expect(reorder.body.data.status).toBe('PENDING_APPROVAL');
    const appr = await request(app).post(`/api/v1/purchase-orders/${id}/approve`).set(...bearer(adminToken));
    expect(appr.status).toBe(200);
    expect(appr.body.data.status).toBe('ORDERED');
    expect(appr.body.data.approvedByUserName).toBeTruthy();
    // SUPER_ADMIN ບໍ່ຕ້ອງລໍອະນຸມັດ
    expect((await createPo(adminToken, [{ productId: p.id, quantity: 20, unitCost: 100 }], 'ORDERED')).body.data.status).toBe('ORDERED');
    expect(await prisma.notificationLog.count({ where: { type: 'PO_APPROVAL_PENDING', data: { path: ['purchaseOrderId'], equals: id } } })).toBeGreaterThan(0);
    await prisma.appSetting.deleteMany({ where: { key: PO_APPROVAL_THRESHOLD_KEY } });
  });

  it('3-way match statuses + expense approval block / SUPER_ADMIN override', async () => {
    const p = await product('MATCH');
    const po = await createPo(adminToken, [{ productId: p.id, quantity: 10, unitCost: 1_000 }], 'ORDERED');
    const id = po.body.data.id;
    const match = async () => (await request(app).get(`/api/v1/purchase-orders/${id}/match`).set(...bearer(adminToken))).body.data;
    expect((await match()).status).toBe('NO_INVOICE');

    const cat = await prisma.expenseCategory.findFirstOrThrow({ where: { isActive: true } });
    const invoice = async (amount: number, taxAmount?: number) => {
      const res = await request(app)
        .post('/api/v1/expenses')
        .set(...bearer(adminToken))
        .set(...idem())
        .send({
          branchId: BRANCH_ID,
          categoryId: cat.id,
          title: `${TITLE_TAG} invoice`,
          amount,
          taxAmount,
          invoiceNumber: `INV-${randomUUID().slice(0, 6)}`,
          supplierId,
          purchaseOrderId: id,
          expenseDate: '2026-09-25',
        });
      expect(res.status).toBe(201);
      await request(app).post(`/api/v1/expenses/${res.body.data.id}/submit`).set(...bearer(adminToken)).send({});
      return res.body.data.id as string;
    };
    const approve = (eid: string, body: object = {}, token = adminToken) =>
      request(app).post(`/api/v1/expenses/${eid}/approve`).set(...bearer(token)).set(...idem()).send(body);

    // ຮັບ 4 × 1000 = 4000; ໃບເກັບເງິນ 10,000 (ເທົ່າມູນຄ່າສັ່ງ) → UNDER_RECEIVED
    await receipt(id, [{ poItemId: po.body.data.items[0].id, qtyReceived: 4 }]);
    const e1 = await invoice(10_000);
    expect((await match()).status).toBe('UNDER_RECEIVED');
    const blocked = await approve(e1);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details.poMatch.status).toBe('UNDER_RECEIVED');
    const list = await request(app).get(`/api/v1/expenses?branchId=${BRANCH_ID}&q=${encodeURIComponent(TITLE_TAG)}`).set(...bearer(adminToken));
    expect(list.body.data.items.find((e: { id: string }) => e.id === e1).poMatch.status).toBe('UNDER_RECEIVED');

    // ປິດຮັບບໍ່ຄົບ → ຈະບໍ່ມີເຄື່ອງມາອີກ → OVER_INVOICED
    await request(app).post(`/api/v1/purchase-orders/${id}/close-short`).set(...bearer(adminToken)).send({ reason: 'ໝົດ' });
    expect((await match()).status).toBe('OVER_INVOICED');
    expect((await approve(e1, { overrideMatch: true })).status).toBe(400); // ຕ້ອງມີເຫດຜົນ
    expect((await approve(e1, { overrideMatch: true, overrideReason: 'x' }, managerToken)).status).toBe(403);
    const over = await approve(e1, { overrideMatch: true, overrideReason: 'ຕົກລົງກັບຜູ້ສະໜອງແລ້ວ' });
    expect(over.status).toBe(200);
    expect(over.body.data.status).toBe('APPROVED');
    const audit = await prisma.auditLog.findFirst({ where: { entityId: e1, action: 'APPROVE_MATCH_OVERRIDE' } });
    expect(audit).not.toBeNull();

    // PO ໃໝ່: ໃບເກັບເງິນ 4,400 ລວມ VAT 400 ທຽບຮັບ 4,000 → MATCHED → ອະນຸມັດໄດ້ປົກກະຕິ
    const po2 = await createPo(adminToken, [{ productId: p.id, quantity: 4, unitCost: 1_000 }], 'ORDERED');
    await receipt(po2.body.data.id, [{ poItemId: po2.body.data.items[0].id, qtyReceived: 4 }]);
    const res2 = await request(app)
      .post('/api/v1/expenses')
      .set(...bearer(adminToken))
      .set(...idem())
      .send({
        branchId: BRANCH_ID,
        categoryId: cat.id,
        title: `${TITLE_TAG} invoice 2`,
        amount: 4_400,
        taxAmount: 400,
        supplierId,
        purchaseOrderId: po2.body.data.id,
        expenseDate: '2026-09-25',
      });
    await request(app).post(`/api/v1/expenses/${res2.body.data.id}/submit`).set(...bearer(adminToken)).send({});
    const m2 = (await request(app).get(`/api/v1/purchase-orders/${po2.body.data.id}/match`).set(...bearer(adminToken))).body.data;
    expect(m2).toMatchObject({ status: 'MATCHED', received: 4_000, invoiced: 4_400, invoicedTax: 400, expected: 4_400 });
    expect((await approve(res2.body.data.id)).status).toBe(200);
  });

  it('H5 — supplier return: explicit lot + FEFO, valued at lot/GRN cost, WAC unchanged, debit note, not shrinkage, reconcile clean', async () => {
    const lotP = await product('RTSLOT', { trackLot: true });
    const plain = await product('RTSPLAIN', { stockQty: 0, costPrice: 0 });
    const po = await createPo(adminToken, [
      { productId: lotP.id, quantity: 10, unitCost: 100 },
      { productId: plain.id, quantity: 10, unitCost: 300 },
    ], 'ORDERED');
    const itemOf = (pid: string) => po.body.data.items.find((i: { productId: string }) => i.productId === pid).id;
    const g1 = await receipt(po.body.data.id, [
      { poItemId: itemOf(lotP.id), qtyReceived: 4, lotNumber: 'RTS-A', expiryDate: '2030-01-01' },
      { poItemId: itemOf(plain.id), qtyReceived: 10 },
    ]);
    expect(g1.status).toBe(201);
    await receipt(po.body.data.id, [{ poItemId: itemOf(lotP.id), qtyReceived: 6, lotNumber: 'RTS-B', expiryDate: '2031-01-01', unitCost: 120 }]);
    const lotB = await prisma.stockLot.findFirstOrThrow({ where: { productId: lotP.id, lotNumber: 'RTS-B' } });
    const wacLot = await wacOf(lotP.id);
    const wacPlain = await wacOf(plain.id);

    const create = (body: object) =>
      request(app).post('/api/v1/supplier-returns').set(...bearer(adminToken)).send({ branchId: BRANCH_ID, supplierId, reason: 'ສິນຄ້າມີຕຳໜິ', ...body });
    const ret = await create({
      purchaseOrderId: po.body.data.id,
      lines: [
        { productId: lotP.id, lotId: lotB.id, qty: 2 }, // explicit lot → 2 × 120
        { productId: lotP.id, qty: 3 }, // FEFO → lot A (3 × 100)
        { productId: plain.id, qty: 4 }, // GRN cost 300
      ],
    });
    expect(ret.status).toBe(201);
    expect(ret.body.data.returnNumber).toMatch(/^RTS-[A-Z0-9]+-\d{4}-\d{6}$/);
    expect(ret.body.data.status).toBe('DRAFT');
    expect(await stockOf(plain.id)).toBe(10); // ຮ່າງ = ຍັງບໍ່ຕັດ

    const posted = await request(app).post(`/api/v1/supplier-returns/${ret.body.data.id}/post`).set(...bearer(adminToken));
    expect(posted.status).toBe(200);
    expect(posted.body.data.status).toBe('POSTED');
    expect(posted.body.data.totalValue).toBe(2 * 120 + 3 * 100 + 4 * 300);
    expect(await stockOf(lotP.id)).toBe(5);
    expect(await stockOf(plain.id)).toBe(6);
    expect(await wacOf(lotP.id)).toBeCloseTo(wacLot, 4);
    expect(await wacOf(plain.id)).toBeCloseTo(wacPlain, 4);
    const lots = await prisma.stockLot.findMany({ where: { productId: lotP.id }, orderBy: { lotNumber: 'asc' } });
    expect(lots.map((l) => l.qtyOnHand.toNumber())).toEqual([1, 4]);

    const moves = await prisma.stockMovement.findMany({ where: { refId: `rts:${ret.body.data.id}` } });
    expect(moves.length).toBe(3);
    expect(moves.every((m) => m.type === 'RETURN_TO_SUPPLIER' && m.reasonCode === 'SUPPLIER_RETURN')).toBe(true);
    expect(moves.reduce((s, m) => s + m.valueChange!.toNumber(), 0)).toBe(-(240 + 300 + 1200));

    // ບໍ່ນັບເປັນ shrinkage (P&L + ລາຍງານ shrinkage ໃຊ້ SHRINKAGE_MOVEMENT_WHERE ດຽວກັນ)
    expect(await prisma.stockMovement.count({ where: { ...SHRINKAGE_MOVEMENT_WHERE, refId: `rts:${ret.body.data.id}` } })).toBe(0);
    const shrink = await request(app).get(`/api/v1/stock-movements/shrinkage?branchId=${BRANCH_ID}`).set(...bearer(adminToken));
    expect(shrink.body.data.byProduct.some((r: { productId: string }) => [lotP.id, plain.id].includes(r.productId))).toBe(false);

    // debit note ຫັກໃນ 3-way match ແລະ ຍອດຄົງຄ້າງ
    const m = (await request(app).get(`/api/v1/purchase-orders/${po.body.data.id}/match`).set(...bearer(adminToken))).body.data;
    expect(m.returned).toBe(1740);
    expect(m.debitNotes).toHaveLength(1);
    const bal = await request(app).get(`/api/v1/suppliers/${supplierId}/balance`).set(...bearer(adminToken));
    expect(bal.body.data.debitNotes).toBeGreaterThanOrEqual(1740);

    // ຄືນເກີນຈຳນວນທີ່ຮັບ → 409; ຍົກເລີກຮ່າງໄດ້, post ແລ້ວຍົກເລີກບໍ່ໄດ້
    const tooMuch = await create({ purchaseOrderId: po.body.data.id, lines: [{ productId: plain.id, qty: 7 }] });
    expect((await request(app).post(`/api/v1/supplier-returns/${tooMuch.body.data.id}/post`).set(...bearer(adminToken))).status).toBe(409);
    expect((await request(app).post(`/api/v1/supplier-returns/${tooMuch.body.data.id}/cancel`).set(...bearer(adminToken)).send({})).body.data.status).toBe(
      'CANCELLED',
    );
    expect((await request(app).post(`/api/v1/supplier-returns/${ret.body.data.id}/cancel`).set(...bearer(adminToken)).send({})).status).toBe(409);

    const exp = await request(app).get(`/api/v1/supplier-returns/export?supplierId=${supplierId}`).set(...bearer(adminToken));
    expect(exp.body.data.items.length).toBe(2);
    expect((await reconcileStock()).mismatches.filter((x) => [lotP.id, plain.id].includes(x.productId))).toEqual([]);
  });

  it('H5 — allowNegativeStock respected: return larger than on-hand is blocked', async () => {
    const p = await product('RTSNEG', { stockQty: 2, costPrice: 100 });
    const ret = await request(app)
      .post('/api/v1/supplier-returns')
      .set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, supplierId, reason: 'x', lines: [{ productId: p.id, qty: 3 }] });
    expect(ret.status).toBe(201);
    expect((await request(app).post(`/api/v1/supplier-returns/${ret.body.data.id}/post`).set(...bearer(adminToken))).status).toBe(409);
    expect(await stockOf(p.id)).toBe(2);
  });
});
