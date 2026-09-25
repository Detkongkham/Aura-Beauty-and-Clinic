import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { reconcileStock, SHRINKAGE_MOVEMENT_WHERE } from '../../src/modules/inventory/inventory.service.js';
import { computeReorderPoints } from '../../src/modules/inventory/reorder.service.js';

/**
 * Integration — inventory M13 (retail/OTC sale → SOLD / SALE_RETURN) + M7 PO revision history.
 * ຕ້ອງມີ PostgreSQL (abcp_test) + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SKU_PREFIX = 'SKU-RTL-';
const UOM_CODE = 'rtl-test-box';
const SUPPLIER_NAME = 'ຜູ້ສະໜອງທົດສອບ RTL';
const CASH_KEY = 'finance-cash';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];
const idem = (): [string, string] => ['Idempotency-Key', randomUUID()];

async function wipe(): Promise<void> {
  const products = await prisma.product.findMany({ where: { sku: { startsWith: SKU_PREFIX } }, select: { id: true } });
  const pids = products.map((p) => p.id);
  if (pids.length) {
    const sales = await prisma.retailSale.findMany({
      where: { lines: { some: { productId: { in: pids } } } },
      select: { id: true, paymentId: true },
    });
    await prisma.loyaltyTransaction.deleteMany({ where: { refId: { in: sales.map((s) => `sale:${s.id}`) } } });
    await prisma.loyaltyTransaction.deleteMany({ where: { refId: { in: sales.map((s) => `clawback:${s.paymentId}`) } } });
    await prisma.retailSale.deleteMany({ where: { id: { in: sales.map((s) => s.id) } } });
    await prisma.refund.deleteMany({ where: { paymentId: { in: sales.map((s) => s.paymentId) } } });
    await prisma.payment.deleteMany({ where: { id: { in: sales.map((s) => s.paymentId) } } });
    await prisma.stockCountLine.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockCount.deleteMany({ where: { notes: 'rtl-test' } });
    await prisma.purchaseOrderItem.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockLot.deleteMany({ where: { productId: { in: pids } } });
    await prisma.productUomConversion.deleteMany({ where: { productId: { in: pids } } });
  }
  await prisma.purchaseOrder.deleteMany({ where: { supplier: { name: SUPPLIER_NAME } } });
  await prisma.supplier.deleteMany({ where: { name: SUPPLIER_NAME } });
  if (pids.length) await prisma.product.deleteMany({ where: { id: { in: pids } } });
  await prisma.uom.deleteMany({ where: { code: UOM_CODE } });
}

describe('Inventory M13 — retail sales, SOLD/SALE_RETURN; M7 PO revisions', () => {
  let app: Express;
  let adminToken: string;
  let managerToken: string;
  let customerId: string;
  let boxUomId: string;
  let cashSetting: unknown = undefined;

  const api = (token: string) => ({
    get: (url: string) => request(app).get(`/api/v1${url}`).set(...bearer(token)),
    post: (url: string, body: object = {}) => request(app).post(`/api/v1${url}`).set(...bearer(token)).set(...idem()).send(body),
    patch: (url: string, body: object) => request(app).patch(`/api/v1${url}`).set(...bearer(token)).send(body),
  });

  /** ສິນຄ້າ + ຍອດເປີດໃນ ledger (reconcile ສະອາດ). */
  const product = async (sku: string, qty: number, cost: number, extra: Record<string, unknown> = {}) => {
    const p = await prisma.product.create({
      data: {
        branchId: BRANCH_ID,
        name: `RTL ${sku}`,
        sku: `${SKU_PREFIX}${sku}`,
        unit: 'ຕຸກ',
        costPrice: cost,
        stockQty: qty,
        isSellable: true,
        retailPrice: 50_000,
        ...extra,
      },
    });
    if (qty > 0) {
      await prisma.stockMovement.create({
        data: {
          branchId: BRANCH_ID,
          productId: p.id,
          type: 'ADJUSTMENT_ADD',
          qty,
          balanceAfter: qty,
          unitCost: cost,
          valueChange: qty * cost,
          reasonCode: 'OPENING_BALANCE',
          createdAt: new Date(Date.now() - 120_000),
        },
      });
    }
    return p;
  };
  const stockOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stockQty.toNumber();
  const wacOf = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).costPrice.toNumber();
  const lotQty = async (id: string) => (await prisma.stockLot.findUniqueOrThrow({ where: { id } })).qtyOnHand.toNumber();
  const payInFull = async (sale: { paymentId: string; billTotal: number }) =>
    api(adminToken).post(`/payments/${sale.paymentId}/tenders`, {
      tenders: [{ method: 'BCEL_ONE_QR', amount: sale.billTotal, qrReference: `RTL-${randomUUID().slice(0, 8)}` }],
    });

  beforeAll(async () => {
    app = createApp();
    await wipe();
    adminToken = (await request(app).post('/api/v1/auth/login').send({ phone: '02000000000', password: 'Admin@12345' })).body.data
      .tokens.accessToken;
    managerToken = (await request(app).post('/api/v1/auth/login').send({ phone: '02000000001', password: 'Manager@12345' })).body
      .data.tokens.accessToken;
    customerId = (await prisma.user.findUniqueOrThrow({ where: { phone: '02099900001' } })).id;
    boxUomId = (await prisma.uom.create({ data: { code: UOM_CODE, name: 'RTL box' } })).id;
    // ຄືນເງິນສົດບໍ່ຕ້ອງເປີດລິ້ນຊັກ ໃນ test ນີ້ (ຄືນຄ່າເດີມຕອນຈົບ).
    cashSetting = (await prisma.appSetting.findUnique({ where: { key: CASH_KEY } }))?.value;
    await prisma.appSetting.upsert({
      where: { key: CASH_KEY },
      create: { key: CASH_KEY, value: { requireOpenDrawer: false } },
      update: { value: { requireOpenDrawer: false } },
    });
  });

  afterAll(async () => {
    await wipe();
    if (cashSetting === undefined) await prisma.appSetting.deleteMany({ where: { key: CASH_KEY } });
    else await prisma.appSetting.update({ where: { key: CASH_KEY }, data: { value: cashSetting as object } });
    await prisma.$disconnect();
  });

  it('sale → payment → SOLD via FEFO lots with UoM conversion + COGS; idempotent; receipt lines; loyalty', async () => {
    const admin = api(adminToken);
    const p = await product('LOT', 10, 12_000, { trackLot: true });
    await prisma.productUomConversion.create({ data: { productId: p.id, uomId: boxUomId, factorToBase: 3 } });
    const lotA = await prisma.stockLot.create({
      data: { productId: p.id, branchId: BRANCH_ID, lotNumber: 'RTL-A', qtyOnHand: 4, unitCost: 10_000, expiryDate: new Date('2027-01-01') },
    });
    const lotB = await prisma.stockLot.create({
      data: { productId: p.id, branchId: BRANCH_ID, lotNumber: 'RTL-B', qtyOnHand: 6, unitCost: 14_000, expiryDate: new Date('2028-01-01') },
    });

    // 2 ກ່ອງ × 3 = 6 ຕຸກ; ລາຄາ/ກ່ອງ default = 50,000 × 3.
    const created = await admin.post('/retail-sales', {
      branchId: BRANCH_ID,
      customerId,
      lines: [{ productId: p.id, qty: 2, uomId: boxUomId, discount: 10_000 }],
    });
    expect(created.status).toBe(201);
    const sale = created.body.data;
    expect(sale.saleNumber).toMatch(/^RS-[A-Z0-9]+-\d{4}-\d{6}$/);
    expect(sale.status).toBe('PENDING_PAYMENT');
    expect(sale.total).toBe(290_000);
    expect(sale.lines[0]).toMatchObject({ qty: 6, uomQty: 2, unitPrice: 150_000, lineTotal: 290_000 });
    // ຍັງບໍ່ຈ່າຍ → ຍັງບໍ່ຕັດ.
    expect(await stockOf(p.id)).toBe(10);

    const paid = await payInFull(sale);
    expect(paid.status).toBe(200);
    expect(paid.body.data.paymentStatus).toBe('FULLY_PAID');
    expect(paid.body.data.invoiceNo).toMatch(/^INV-/);

    const detail = (await admin.get(`/retail-sales/${sale.id}`)).body.data;
    expect(detail.status).toBe('PAID');
    expect(detail.stockPostedAt).not.toBeNull();
    expect(await stockOf(p.id)).toBe(4);
    // FEFO: lot A (4 @10k) ໝົດ, lot B 2 @14k
    expect(await lotQty(lotA.id)).toBe(0);
    expect(await lotQty(lotB.id)).toBe(4);
    const sold = await prisma.stockMovement.findMany({ where: { productId: p.id, type: 'SOLD' }, orderBy: { createdAt: 'asc' } });
    expect(sold.map((m) => [m.lotId, m.qty.toNumber(), m.valueChange?.toNumber()])).toEqual([
      [lotA.id, 4, -40_000],
      [lotB.id, 2, -28_000],
    ]);
    expect(sold.every((m) => m.refId === `sale:${sale.id}`)).toBe(true);
    expect(detail.lines[0].cogs).toBe(68_000);
    // WAC ບໍ່ປ່ຽນຕອນຂາຍ
    expect(await wacOf(p.id)).toBe(12_000);

    // idempotent: settle ຊ້ຳ + retry post-stock ບໍ່ຕັດຊ້ຳ
    const { recomputeAndSettle } = await import('../../src/modules/payments/payments.service.js');
    await recomputeAndSettle(sale.paymentId);
    expect((await admin.post(`/retail-sales/${sale.id}/post-stock`)).status).toBe(200);
    expect(await prisma.stockMovement.count({ where: { productId: p.id, type: 'SOLD' } })).toBe(2);
    expect(await stockOf(p.id)).toBe(4);

    // ໃບຮັບເງິນມີແຖວສິນຄ້າ + ລູກຄ້າ
    const receipt = (await admin.get(`/payments/${sale.paymentId}/receipt`)).body.data;
    expect(receipt.lines[0]).toMatchObject({ qty: 2, amount: 290_000 });
    expect(receipt.customerName).toBeTruthy();
    // ຄະແນນສະສົມ refId sale:<id>
    expect(await prisma.loyaltyTransaction.count({ where: { refId: `sale:${sale.id}`, type: 'EARN' } })).toBe(1);

    // ບໍ່ນັບເປັນ shrinkage
    expect(await prisma.stockMovement.count({ where: { productId: p.id, ...SHRINKAGE_MOVEMENT_WHERE } })).toBe(0);
    expect((await reconcileStock()).mismatches.filter((m) => m.productId === p.id)).toEqual([]);
  });

  it('negative-stock rule: create 409 when short; branch allowNegativeStock lets SOLD go negative', async () => {
    const admin = api(adminToken);
    const p = await product('NEG', 2, 5_000);
    expect((await admin.post('/retail-sales', { branchId: BRANCH_ID, lines: [{ productId: p.id, qty: 3 }] })).status).toBe(409);
    // ບໍ່ເປີດຂາຍ → 400
    const hidden = await product('HIDDEN', 5, 5_000, { isSellable: false });
    expect((await admin.post('/retail-sales', { branchId: BRANCH_ID, lines: [{ productId: hidden.id, qty: 1 }] })).status).toBe(400);

    // ສ້າງຕອນຍັງພໍ ແລ້ວສະຕັອກຫາຍກ່ອນຈ່າຍ → ຈ່າຍໄດ້ແຕ່ຕັດບໍ່ໄດ້ → stockError; ເປີດ allowNegativeStock ແລ້ວ retry ຜ່ານ.
    const s = (await admin.post('/retail-sales', { branchId: BRANCH_ID, lines: [{ productId: p.id, qty: 2, unitPrice: 9_000 }] })).body.data;
    await prisma.product.update({ where: { id: p.id }, data: { stockQty: 1 } });
    await prisma.stockMovement.create({
      data: { branchId: BRANCH_ID, productId: p.id, type: 'ADJUSTMENT_DEDUCT', qty: 1, balanceAfter: 1, unitCost: 5_000, valueChange: -5_000, reasonCode: 'DAMAGED' },
    });
    expect((await payInFull(s)).status).toBe(200);
    const afterPay = (await admin.get(`/retail-sales/${s.id}`)).body.data;
    expect(afterPay.status).toBe('PAID');
    expect(afterPay.stockPostedAt).toBeNull();
    expect(afterPay.stockError).toBeTruthy();
    expect(await stockOf(p.id)).toBe(1);
    expect((await admin.post(`/retail-sales/${s.id}/post-stock`)).status).toBe(409);

    const branch = await prisma.branch.findUniqueOrThrow({ where: { id: BRANCH_ID }, select: { allowNegativeStock: true } });
    await prisma.branch.update({ where: { id: BRANCH_ID }, data: { allowNegativeStock: true } });
    try {
      const retried = await admin.post(`/retail-sales/${s.id}/post-stock`);
      expect(retried.status).toBe(200);
      expect(retried.body.data.stockError).toBeNull();
      expect(await stockOf(p.id)).toBe(-1);
    } finally {
      await prisma.branch.update({ where: { id: BRANCH_ID }, data: { allowNegativeStock: branch.allowNegativeStock } });
    }
    expect((await reconcileStock()).mismatches.filter((m) => m.productId === p.id)).toEqual([]);
  });

  it('void before payment; return → refund PAID → SALE_RETURN into the same lot at original cost, WAC unchanged', async () => {
    const admin = api(adminToken);
    const p = await product('RET', 0, 20_000, { trackLot: true });
    const lot = await prisma.stockLot.create({
      data: { productId: p.id, branchId: BRANCH_ID, lotNumber: 'RTL-R', qtyOnHand: 5, unitCost: 16_000, expiryDate: new Date('2027-06-01') },
    });
    await prisma.product.update({ where: { id: p.id }, data: { stockQty: 5 } });
    await prisma.stockMovement.create({
      data: { branchId: BRANCH_ID, productId: p.id, type: 'PURCHASE_IN', qty: 5, balanceAfter: 5, unitCost: 16_000, valueChange: 80_000, lotId: lot.id },
    });

    // void (ຍັງບໍ່ຈ່າຍ)
    const v = (await admin.post('/retail-sales', { branchId: BRANCH_ID, lines: [{ productId: p.id, qty: 1 }] })).body.data;
    const voided = await admin.post(`/retail-sales/${v.id}/void`, { reason: 'ລູກຄ້າປ່ຽນໃຈ' });
    expect(voided.status).toBe(200);
    expect(voided.body.data.status).toBe('VOIDED');
    expect(voided.body.data.paymentStatus).toBe('VOIDED');

    const s = (await admin.post('/retail-sales', { branchId: BRANCH_ID, customerId, lines: [{ productId: p.id, qty: 3, unitPrice: 40_000 }] })).body.data;
    await payInFull(s);
    expect(await lotQty(lot.id)).toBe(2);
    const wacBefore = await wacOf(p.id);
    const lineId = (await admin.get(`/retail-sales/${s.id}`)).body.data.lines[0].id;

    // ເກີນຈຳນວນ → 400
    expect((await admin.post(`/retail-sales/${s.id}/returns`, { reason: 'ເກີນ', method: 'CASH', lines: [{ saleLineId: lineId, qty: 4 }] })).status).toBe(400);
    const rf = await admin.post(`/retail-sales/${s.id}/returns`, { reason: 'ແພ້ຄຣີມ', method: 'CASH', lines: [{ saleLineId: lineId, qty: 2 }] });
    expect(rf.status).toBe(201);
    expect(rf.body.data.billKind).toBe('RETAIL_SALE');
    const rate = s.billTotal / s.total; // VAT EXCLUSIVE (ຖ້າເປີດ) ບວກເທິງ
    expect(rf.body.data.totalAmount).toBeCloseTo(80_000 * rate, 0);
    // ຄຳຮ້ອງຍັງເປີດ → ຈອງຈຳນວນແລ້ວ (ຄືນໄດ້ອີກ 1)
    expect((await admin.get(`/retail-sales/${s.id}`)).body.data.lines[0].qtyReturnable).toBe(1);
    // ຍັງບໍ່ PAID → ສະຕັອກຍັງບໍ່ເຂົ້າ
    expect(await stockOf(p.id)).toBe(2);

    await request(app).post(`/api/v1/payments/refunds/${rf.body.data.id}/approve`).set(...bearer(adminToken)).expect(200);
    const payRes = await request(app).post(`/api/v1/payments/refunds/${rf.body.data.id}/pay`).set(...bearer(adminToken)).send({});
    expect(payRes.status).toBe(200);
    expect(payRes.body.data.creditNoteNo).toMatch(/^CN-/);

    expect(await stockOf(p.id)).toBe(4);
    expect(await lotQty(lot.id)).toBe(4);
    expect(await wacOf(p.id)).toBe(wacBefore);
    const back = await prisma.stockMovement.findMany({ where: { productId: p.id, type: 'SALE_RETURN' } });
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ lotId: lot.id, refId: `saleret:${rf.body.data.id}` });
    expect(back[0]!.unitCost?.toNumber()).toBe(16_000);
    expect(back[0]!.valueChange?.toNumber()).toBe(32_000);
    const after = (await admin.get(`/retail-sales/${s.id}`)).body.data;
    expect(after.lines[0]).toMatchObject({ qtyReturned: 2, qtyReturnable: 1 });
    expect(after.lines[0].returns[0]).toMatchObject({ refundStatus: 'PAID', restock: true });
    // ຈ່າຍຊ້ຳບໍ່ post ຊ້ຳ
    expect((await request(app).post(`/api/v1/payments/refunds/${rf.body.data.id}/pay`).set(...bearer(adminToken)).send({})).status).toBe(409);
    expect(await prisma.stockMovement.count({ where: { productId: p.id, type: 'SALE_RETURN' } })).toBe(1);
    expect((await reconcileStock()).mismatches.filter((m) => m.productId === p.id)).toEqual([]);
  });

  it('P&L carries retail revenue + retail COGS; margin report; reorder usage includes SOLD − SALE_RETURN', async () => {
    const admin = api(adminToken);
    const pnl = async () => (await admin.get(`/expenses/profit-loss?branchId=${BRANCH_ID}`)).body.data;
    const before = await pnl();
    expect(before).toHaveProperty('retailRevenue');
    const p = await product('PNL', 20, 7_000);
    const s = (await admin.post('/retail-sales', { branchId: BRANCH_ID, lines: [{ productId: p.id, qty: 5, unitPrice: 20_000 }] })).body.data;
    await payInFull(s);
    const after = await pnl();
    expect(after.retailRevenue - before.retailRevenue).toBeCloseTo(s.billTotal, 0);
    expect(after.retailCogs - before.retailCogs).toBe(35_000);
    expect(after.cogs - before.cogs).toBe(35_000);
    expect(after.shrinkage).toBe(before.shrinkage);

    const margin = (await admin.get(`/retail-sales/margin?branchId=${BRANCH_ID}`)).body.data;
    const row = margin.rows.find((r: { productId: string }) => r.productId === p.id);
    expect(row).toMatchObject({ qtySold: 5, cogs: 35_000 });
    expect(row.revenue).toBeGreaterThan(0);

    // reorder: (5 ຂາຍ − 1 ຄືນ) / 90
    const lineId = (await admin.get(`/retail-sales/${s.id}`)).body.data.lines[0].id;
    const rf = await admin.post(`/retail-sales/${s.id}/returns`, { reason: 'ຄືນ 1', method: 'CASH', lines: [{ saleLineId: lineId, qty: 1 }] });
    await request(app).post(`/api/v1/payments/refunds/${rf.body.data.id}/approve`).set(...bearer(adminToken)).expect(200);
    await request(app).post(`/api/v1/payments/refunds/${rf.body.data.id}/pay`).set(...bearer(adminToken)).send({}).expect(200);
    await computeReorderPoints(new Date(), { productIds: [p.id] });
    const fresh = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(fresh.avgDailyUsage?.toNumber()).toBeCloseTo(4 / 90, 4);
    expect((await pnl()).retailCogs - before.retailCogs).toBe(28_000);
  });

  it('stock-count delta picks up SOLD made during counting', async () => {
    const admin = api(adminToken);
    const p = await product('CNT', 8, 3_000);
    const count = (await admin.post('/stock-counts', { branchId: BRANCH_ID, type: 'SPOT', productIds: [p.id], notes: 'rtl-test' })).body.data;
    expect((await admin.post(`/stock-counts/${count.id}/start`)).status).toBe(200);
    const s = (await admin.post('/retail-sales', { branchId: BRANCH_ID, lines: [{ productId: p.id, qty: 3, unitPrice: 10_000 }] })).body.data;
    await payInFull(s);
    const detail = (await admin.get(`/stock-counts/${count.id}`)).body.data;
    expect(detail.lines[0]).toMatchObject({ systemQty: 8, movedSinceStart: -3, expectedQty: 5 });
    await admin.post(`/stock-counts/${count.id}/cancel`, {});
  });

  it('BRANCH_ADMIN is scoped; product form fields round-trip', async () => {
    const mgr = api(managerToken);
    const other = await prisma.branch.findFirst({ where: { id: { not: BRANCH_ID } }, select: { id: true } });
    if (other) {
      expect((await mgr.get(`/retail-sales?branchId=${other.id}`)).status).toBe(403);
    }
    const created = await api(adminToken).post('/products', {
      branchId: BRANCH_ID,
      name: 'RTL form',
      sku: `${SKU_PREFIX}FORM`,
      unit: 'ຕຸກ',
      costPrice: 1_000,
      isSellable: true,
      retailPrice: 2_500,
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ isSellable: true, retailPrice: 2_500 });
    const upd = await api(adminToken).patch(`/products/${created.body.data.id}`, { retailPrice: null, isSellable: false });
    expect(upd.body.data).toMatchObject({ isSellable: false, retailPrice: null });
  });

  it('M7 — PO revision rows on edit, order/approval, reject, approve', async () => {
    const admin = api(adminToken);
    const mgr = api(managerToken);
    const p1 = await product('PO1', 0, 1_000);
    const p2 = await product('PO2', 0, 2_000);
    const supplierId = (await prisma.supplier.create({ data: { name: SUPPLIER_NAME, phone: '020 0000 7777' } })).id;
    const po = (await admin.post('/purchase-orders', { branchId: BRANCH_ID, supplierId, items: [{ productId: p1.id, quantity: 10, unitCost: 1_000 }] })).body.data;
    expect(po.revisions).toEqual([]);

    const edited = await admin.patch(`/purchase-orders/${po.id}`, {
      items: [
        { productId: p1.id, quantity: 12, unitCost: 1_000 },
        { productId: p2.id, quantity: 5, unitCost: 2_000 },
      ],
    });
    expect(edited.status).toBe(200);
    const r1 = edited.body.data.revisions[0];
    expect(r1).toMatchObject({ revisionNo: 1, action: 'UPDATE', fromStatus: 'DRAFT', toStatus: 'DRAFT' });
    expect(r1.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'item.quantity', from: 10, to: 12 }),
        expect.objectContaining({ field: 'item.added', to: 5 }),
        expect.objectContaining({ field: 'total', from: 10_000, to: 22_000 }),
      ]),
    );
    const snap = await prisma.purchaseOrderRevision.findFirstOrThrow({ where: { purchaseOrderId: po.id, revisionNo: 1 } });
    expect((snap.snapshot as { items: unknown[] }).items).toHaveLength(1);

    // manager ສັ່ງເກີນເກນ → PENDING_APPROVAL → reject → ສັ່ງໃໝ່ → approve
    await prisma.appSetting.upsert({
      where: { key: 'inventory.poApprovalThresholdLak' },
      create: { key: 'inventory.poApprovalThresholdLak', value: 1_000 },
      update: { value: 1_000 },
    });
    try {
      const ordered = (await mgr.patch(`/purchase-orders/${po.id}`, { status: 'ORDERED' })).body.data;
      expect(ordered.status).toBe('PENDING_APPROVAL');
      expect(ordered.revisions[0]).toMatchObject({ revisionNo: 2, action: 'SUBMIT_APPROVAL', toStatus: 'PENDING_APPROVAL' });
      const rejected = (await admin.post(`/purchase-orders/${po.id}/reject`, { reason: 'ລາຄາສູງ' })).body.data;
      expect(rejected.revisions[0]).toMatchObject({ revisionNo: 3, action: 'REJECT', fromStatus: 'PENDING_APPROVAL', toStatus: 'DRAFT', note: 'ລາຄາສູງ' });
      await mgr.patch(`/purchase-orders/${po.id}`, { status: 'ORDERED' });
      const approved = (await admin.post(`/purchase-orders/${po.id}/approve`)).body.data;
      expect(approved.revisions[0]).toMatchObject({ revisionNo: 5, action: 'APPROVE', toStatus: 'ORDERED' });
      expect(approved.revisions[0].changedByUserName).toBeTruthy();
      expect(approved.revisions.map((r: { revisionNo: number }) => r.revisionNo)).toEqual([5, 4, 3, 2, 1]);
    } finally {
      await prisma.appSetting.deleteMany({ where: { key: 'inventory.poApprovalThresholdLak' } });
    }
  });
});
