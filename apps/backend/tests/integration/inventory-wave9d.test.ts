import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { cancelAppointment } from '../../src/modules/booking/booking.service.js';
import {
  REORDER_REVIEW_DAYS_KEY,
  SAFETY_STOCK_DAYS_KEY,
  DEFAULT_LEAD_TIME_DAYS_KEY,
  reconcileStock,
} from '../../src/modules/inventory/inventory.service.js';
import { computeReorderPoints, roundOrderQty } from '../../src/modules/inventory/reorder.service.js';
import { backfillReservations, syncAppointmentReservations } from '../../src/modules/inventory/reservation.service.js';

/**
 * Integration — inventory audit wave 9D part 2 (docs/inventory-audit.md §7):
 *   M8/M9/M10/M20 supplier upgrade · H7 reservations · M11 reorder point + suggestions · M4/L8 SQL low-stock ·
 *   L7 delete guards · turnover / aging / usage-per-service reports.
 * ຕ້ອງມີ PostgreSQL (abcp_test) + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const CATEGORY_ID = '22222222-0000-0000-0000-000000000001';
const SKU = 'SKU-W9D2-';
const SUP = 'ຜູ້ສະໜອງ W9D2';
const SVC = 'ບໍລິການ W9D2';
const CUST_PHONE = '02077709902';
const SETTING_KEYS = [SAFETY_STOCK_DAYS_KEY, REORDER_REVIEW_DAYS_KEY, DEFAULT_LEAD_TIME_DAYS_KEY];
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
  await prisma.supplierReturn.deleteMany({ where: { supplier: { name: { startsWith: SUP } } } });
  if (pids.length) {
    await prisma.purchaseOrderItem.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockLot.deleteMany({ where: { productId: { in: pids } } });
    await prisma.serviceConsumable.deleteMany({ where: { productId: { in: pids } } });
  }
  await prisma.purchaseOrder.deleteMany({ where: { supplier: { name: { startsWith: SUP } } } });
  await prisma.supplier.deleteMany({ where: { name: { startsWith: SUP } } });
  if (pids.length) await prisma.product.deleteMany({ where: { id: { in: pids } } });
  await prisma.service.deleteMany({ where: { name: { startsWith: SVC } } });
  await prisma.branch.deleteMany({ where: { name: 'W9D2 other branch' } });
  await prisma.appSetting.deleteMany({ where: { key: { in: SETTING_KEYS } } });
  await prisma.exchangeRate.deleteMany({ where: { baseCurrency: 'THB', targetCurrency: 'LAK', rate: 599 } });
}

describe('Inventory wave 9D part 2 — suppliers, reservations, reorder, reports', () => {
  let app: Express;
  let adminToken: string;
  let managerToken: string;
  let staffProfileId: string;
  let customerId: string;

  const product = async (sku: string, extra: Record<string, unknown> = {}) =>
    prisma.product.create({
      data: { branchId: BRANCH_ID, name: `W9D2 ${sku}`, sku: `${SKU}${sku}`, unit: 'ຕຸກ', costPrice: 100, stockQty: 0, ...extra },
    });
  /** ສິນຄ້າທີ່ມີ ledger ເປີດ (reconcileStock ສະອາດ). */
  const stocked = async (sku: string, qty: number, cost = 100, extra: Record<string, unknown> = {}) => {
    const p = await product(sku, { stockQty: qty, costPrice: cost, ...extra });
    await prisma.stockMovement.create({
      data: {
        branchId: BRANCH_ID, productId: p.id, type: 'ADJUSTMENT_ADD', qty, balanceAfter: qty,
        unitCost: cost, valueChange: qty * cost, reasonCode: 'OPENING_BALANCE',
      },
    });
    return p;
  };
  const service = async (name: string, bom: { productId: string; qtyPerUse: number }[]) =>
    prisma.service.create({
      data: {
        categoryId: CATEGORY_ID, name: `${SVC} ${name}`, price: 100000, durationMinutes: 30,
        consumables: { create: bom },
      },
    });
  const appointment = async (serviceId: string, status: 'PENDING' | 'CONFIRMED' = 'PENDING') => {
    const start = new Date(Date.now() + 7 * DAY + Math.floor(Math.random() * 1000) * 60_000);
    return prisma.appointment.create({
      data: {
        branchId: BRANCH_ID, customerId, staffProfileId, serviceId, status,
        startAt: start, endAt: new Date(start.getTime() + 30 * 60_000), totalAmount: 100000, currency: 'LAK',
      },
    });
  };
  const setStatus = (id: string, status: string) =>
    request(app).patch(`/api/v1/appointments/${id}/status`).set(...bearer(adminToken)).send({ status });
  const reservations = (appointmentId: string) =>
    prisma.stockReservation.findMany({ where: { appointmentId }, orderBy: { productId: 'asc' } });
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
    customerId = (await prisma.user.create({ data: { name: 'ລູກຄ້າ W9D2', phone: CUST_PHONE, role: 'CUSTOMER' } })).id;
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  // ------------------------------------------------------------------ M8/M9/M20

  it('M9 — supplier branch scope: BRANCH_ADMIN owns its branch suppliers; shared suppliers are SUPER_ADMIN-only', async () => {
    const other = await prisma.branch.create({ data: { name: 'W9D2 other branch', address: '—', phone: '020', baseCurrency: 'LAK' } });
    const own = await request(app).post('/api/v1/suppliers').set(...bearer(managerToken))
      .send({ name: `${SUP} own`, phone: '020 1', taxId: 'TAX-1', paymentTermsDays: 30, leadTimeDays: 5, currency: 'THB' });
    expect(own.status).toBe(201);
    expect(own.body.data).toMatchObject({ branchId: BRANCH_ID, taxId: 'TAX-1', paymentTermsDays: 30, leadTimeDays: 5, currency: 'THB', isActive: true });
    expect((await request(app).post('/api/v1/suppliers').set(...bearer(managerToken)).send({ name: `${SUP} x`, phone: '1', branchId: null })).status).toBe(403);
    expect((await request(app).post('/api/v1/suppliers').set(...bearer(managerToken)).send({ name: `${SUP} x`, phone: '1', branchId: other.id })).status).toBe(403);

    const shared = await request(app).post('/api/v1/suppliers').set(...bearer(adminToken)).send({ name: `${SUP} shared`, phone: '020 2' });
    expect(shared.body.data.branchId).toBeNull();
    const foreign = await request(app).post('/api/v1/suppliers').set(...bearer(adminToken)).send({ name: `${SUP} foreign`, phone: '020 3', branchId: other.id });
    expect(foreign.body.data.branchId).toBe(other.id);

    expect((await request(app).patch(`/api/v1/suppliers/${shared.body.data.id}`).set(...bearer(managerToken)).send({ name: `${SUP} shared`, phone: '9' })).status).toBe(403);
    expect((await request(app).patch(`/api/v1/suppliers/${foreign.body.data.id}`).set(...bearer(managerToken)).send({ name: `${SUP} foreign`, phone: '9' })).status).toBe(403);
    expect((await request(app).delete(`/api/v1/suppliers/${foreign.body.data.id}`).set(...bearer(managerToken))).status).toBe(403);
    const edited = await request(app).patch(`/api/v1/suppliers/${own.body.data.id}`).set(...bearer(managerToken))
      .send({ name: `${SUP} own`, phone: '020 1', bankName: 'BCEL', bankAccountNo: '010-123' });
    expect(edited.status).toBe(200);
    const bankAudit = await prisma.auditLog.findFirst({ where: { entityId: own.body.data.id, action: 'SUPPLIER_BANK_CHANGE' } });
    expect(bankAudit).not.toBeNull();

    const mList = await request(app).get(`/api/v1/suppliers?q=${encodeURIComponent(SUP)}&pageSize=50`).set(...bearer(managerToken));
    const names = (mList.body.data.items as { name: string }[]).map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining([`${SUP} own`, `${SUP} shared`]));
    expect(names).not.toContain(`${SUP} foreign`);
    expect((await request(app).get(`/api/v1/suppliers/${foreign.body.data.id}`).set(...bearer(managerToken))).status).toBe(403);
  });

  it('M20 — inactive suppliers hidden with activeOnly; delete with PO = soft delete, historical PO still shows it', async () => {
    const sup = await prisma.supplier.create({ data: { name: `${SUP} soft`, phone: '1' } });
    const p = await product('SOFT');
    const po = await request(app).post('/api/v1/purchase-orders').set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, supplierId: sup.id, items: [{ productId: p.id, quantity: 1, unitCost: 10 }] });
    expect(po.status).toBe(201);

    await request(app).patch(`/api/v1/suppliers/${sup.id}`).set(...bearer(adminToken)).send({ name: sup.name, phone: '1', isActive: false });
    const active = await request(app).get(`/api/v1/suppliers?q=${encodeURIComponent(`${SUP} soft`)}&activeOnly=true`).set(...bearer(adminToken));
    expect(active.body.data.total).toBe(0);
    const all = await request(app).get(`/api/v1/suppliers?q=${encodeURIComponent(`${SUP} soft`)}`).set(...bearer(adminToken));
    expect(all.body.data.total).toBe(1);
    // inactive → can't be used on a new PO
    expect((await request(app).post('/api/v1/purchase-orders').set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, supplierId: sup.id, items: [{ productId: p.id, quantity: 1, unitCost: 10 }] })).status).toBe(400);

    expect((await request(app).delete(`/api/v1/suppliers/${sup.id}`).set(...bearer(adminToken))).status).toBe(204);
    const row = await prisma.supplier.findUniqueOrThrow({ where: { id: sup.id } });
    expect(row.deletedAt).not.toBeNull();
    expect((await request(app).get(`/api/v1/suppliers?q=${encodeURIComponent(`${SUP} soft`)}`).set(...bearer(adminToken))).body.data.total).toBe(0);
    const detail = await request(app).get(`/api/v1/purchase-orders/${po.body.data.id}`).set(...bearer(adminToken));
    expect(detail.body.data).toMatchObject({ supplierName: `${SUP} soft`, supplierInactive: true });

    // no documents → hard delete
    const bare = await prisma.supplier.create({ data: { name: `${SUP} bare`, phone: '1' } });
    expect((await request(app).delete(`/api/v1/suppliers/${bare.id}`).set(...bearer(adminToken))).status).toBe(204);
    expect(await prisma.supplier.findUnique({ where: { id: bare.id } })).toBeNull();
  });

  it('M8 — price list prefills PO unit cost; isPreferred is exclusive per product', async () => {
    const supA = await prisma.supplier.create({ data: { name: `${SUP} A`, phone: '1' } });
    const supB = await prisma.supplier.create({ data: { name: `${SUP} B`, phone: '1' } });
    const priced = await product('PRICED', { costPrice: 999 });
    const unpriced = await product('UNPRICED', { costPrice: 250 });
    const put = await request(app).put(`/api/v1/suppliers/${supA.id}/products`).set(...bearer(managerToken))
      .send({ productId: priced.id, unitCost: 123.5, moq: 6, leadTimeDays: 4, isPreferred: true });
    expect(put.status).toBe(200);
    expect(put.body.data).toMatchObject({ unitCost: 123.5, currency: 'LAK', moq: 6, isPreferred: true });
    await request(app).put(`/api/v1/suppliers/${supB.id}/products`).set(...bearer(adminToken))
      .send({ productId: priced.id, unitCost: 130, isPreferred: true });
    const links = await prisma.supplierProduct.findMany({ where: { productId: priced.id } });
    expect(links.filter((l) => l.isPreferred).map((l) => l.supplierId)).toEqual([supB.id]);

    const list = await request(app).get(`/api/v1/suppliers/${supA.id}/products`).set(...bearer(adminToken));
    expect(list.body.data).toHaveLength(1);

    const po = await request(app).post('/api/v1/purchase-orders').set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, supplierId: supA.id, items: [{ productId: priced.id, quantity: 2 }, { productId: unpriced.id, quantity: 1 }] });
    expect(po.status).toBe(201);
    const byProduct = new Map((po.body.data.items as { productId: string; unitCost: number }[]).map((i) => [i.productId, i.unitCost]));
    expect(byProduct.get(priced.id)).toBe(123.5);
    expect(byProduct.get(unpriced.id)).toBe(250); // fallback = WAC
    expect(po.body.data.totalAmount).toBe(497);

    expect((await request(app).delete(`/api/v1/suppliers/${supA.id}/products/${priced.id}`).set(...bearer(adminToken))).status).toBe(204);
  });

  it('M10 — foreign-currency PO: GRN locks fxRate, WAC and 3-way match are in LAK', async () => {
    const sup = await prisma.supplier.create({ data: { name: `${SUP} THB`, phone: '1', currency: 'THB' } });
    const p = await stocked('FX', 10, 5000);
    const po = await request(app).post('/api/v1/purchase-orders').set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, supplierId: sup.id, fxRate: 600, status: 'ORDERED', items: [{ productId: p.id, quantity: 10, unitCost: 10 }] });
    expect(po.status).toBe(201);
    expect(po.body.data).toMatchObject({ currency: 'THB', fxRate: 600, totalAmount: 100, totalAmountLak: 60000 });

    const grn = await request(app).post(`/api/v1/purchase-orders/${po.body.data.id}/receipts`).set(...bearer(adminToken))
      .send({ lines: [{ poItemId: po.body.data.items[0].id, qtyReceived: 10 }] });
    expect(grn.status).toBe(201);
    expect(grn.body.data.receipt).toMatchObject({ currency: 'THB', fxRate: 600 });
    expect(grn.body.data.receipt.lines[0]).toMatchObject({ unitCost: 6000, unitCostForeign: 10, lineValue: 60000 });
    const fresh = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    // (10×5000 + 10×6000) / 20
    expect(fresh.costPrice.toNumber()).toBeCloseTo(5500, 3);
    const move = await prisma.stockMovement.findFirstOrThrow({ where: { productId: p.id, type: 'PURCHASE_IN' } });
    expect(move.valueChange!.toNumber()).toBe(60000);

    const match = await request(app).get(`/api/v1/purchase-orders/${po.body.data.id}/match`).set(...bearer(adminToken));
    expect(match.body.data).toMatchObject({ ordered: 60000, received: 60000 });
    expect(match.body.data.lines[0].poUnitCost).toBe(6000);

    // missing rate + no ExchangeRate row → 400; with ExchangeRate row → used
    const saved = await prisma.exchangeRate.findUnique({ where: { baseCurrency_targetCurrency: { baseCurrency: 'THB', targetCurrency: 'LAK' } } });
    await prisma.exchangeRate.deleteMany({ where: { baseCurrency: 'THB', targetCurrency: 'LAK' } });
    const noRate = await request(app).post('/api/v1/purchase-orders').set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, supplierId: sup.id, items: [{ productId: p.id, quantity: 1, unitCost: 1 }] });
    expect(noRate.status).toBe(400);
    await prisma.exchangeRate.create({ data: { baseCurrency: 'THB', targetCurrency: 'LAK', rate: 599 } });
    const withRate = await request(app).post('/api/v1/purchase-orders').set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, supplierId: sup.id, items: [{ productId: p.id, quantity: 1, unitCost: 1 }] });
    expect(withRate.body.data.fxRate).toBe(599);
    await prisma.exchangeRate.deleteMany({ where: { baseCurrency: 'THB', targetCurrency: 'LAK' } });
    if (saved) await prisma.exchangeRate.create({ data: saved });
    expect((await reconcileStock()).mismatches.filter((m) => m.productId === p.id)).toEqual([]);
  });

  it('M10 — fxRate cannot change after a receipt', async () => {
    const sup = await prisma.supplier.create({ data: { name: `${SUP} THB2`, phone: '1', currency: 'THB' } });
    const p = await product('FX2');
    const po = await request(app).post('/api/v1/purchase-orders').set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, supplierId: sup.id, fxRate: 600, status: 'ORDERED', items: [{ productId: p.id, quantity: 10, unitCost: 10 }] });
    await request(app).post(`/api/v1/purchase-orders/${po.body.data.id}/receipts`).set(...bearer(adminToken))
      .send({ lines: [{ poItemId: po.body.data.items[0].id, qtyReceived: 2 }] });
    expect((await request(app).patch(`/api/v1/purchase-orders/${po.body.data.id}`).set(...bearer(adminToken)).send({ fxRate: 650 })).status).toBe(409);
  });

  // ------------------------------------------------------------------ H7

  it('H7 — confirm reserves the BOM, cancel releases, idempotent, stock untouched', async () => {
    const a = await stocked('RES-A', 10);
    const b = await stocked('RES-B', 1);
    const svc = await service('res1', [{ productId: a.id, qtyPerUse: 2 }, { productId: b.id, qtyPerUse: 0.5 }]);
    const appt = await appointment(svc.id);
    expect(await reservations(appt.id)).toHaveLength(0);

    expect((await setStatus(appt.id, 'CONFIRMED')).status).toBe(200);
    let rs = await reservations(appt.id);
    expect(rs.map((r) => [r.productId, r.qty.toNumber(), r.status]).sort()).toEqual(
      [[a.id, 2, 'ACTIVE'], [b.id, 0.5, 'ACTIVE']].sort(),
    );
    // idempotent — confirm again + explicit sync keeps one row per product
    await setStatus(appt.id, 'CONFIRMED');
    await prisma.$transaction((tx) => syncAppointmentReservations(tx, appt.id));
    expect(await prisma.stockReservation.count({ where: { appointmentId: appt.id } })).toBe(2);

    const pa = await getProduct(a.id);
    expect(pa).toMatchObject({ stockQty: 10, reservedQty: 2, availableQty: 8, shortForUpcoming: false });

    // second confirmed appointment pushes B negative (soft: booking/confirm never blocked)
    const appt2 = await appointment(svc.id);
    expect((await setStatus(appt2.id, 'CONFIRMED')).status).toBe(200);
    const pb = await getProduct(b.id);
    expect(pb).toMatchObject({ stockQty: 1, reservedQty: 1, availableQty: 0 });
    const appt3 = await appointment(svc.id, 'PENDING');
    await setStatus(appt3.id, 'IN_PROGRESS');
    expect(await getProduct(b.id)).toMatchObject({ reservedQty: 1.5, availableQty: -0.5, shortForUpcoming: true });
    const stats = await request(app).get(`/api/v1/products/stats?branchId=${BRANCH_ID}`).set(...bearer(adminToken));
    expect(stats.body.data.shortForUpcomingCount).toBeGreaterThanOrEqual(1);

    expect((await setStatus(appt.id, 'CANCELLED')).status).toBe(200);
    rs = await reservations(appt.id);
    expect(rs.every((r) => r.status === 'RELEASED' && r.releasedAt)).toBe(true);
    expect((await setStatus(appt2.id, 'NO_SHOW')).status).toBe(200);
    expect((await reservations(appt2.id)).every((r) => r.status === 'RELEASED')).toBe(true);
    expect(await getProduct(b.id)).toMatchObject({ reservedQty: 0.5 });
    await setStatus(appt3.id, 'CANCELLED');

    // reservations never touch stockQty / the ledger
    expect((await prisma.product.findUniqueOrThrow({ where: { id: a.id } })).stockQty.toNumber()).toBe(10);
    expect((await reconcileStock()).mismatches.filter((m) => [a.id, b.id].includes(m.productId))).toEqual([]);
  });

  it('H7 — complete converts to CONSUMED (stock deducted once); customer cancel + reschedule-to-PENDING release', async () => {
    const a = await stocked('RES-C', 10);
    const svc = await service('res2', [{ productId: a.id, qtyPerUse: 3 }]);
    const appt = await appointment(svc.id);
    await setStatus(appt.id, 'CONFIRMED');
    expect((await setStatus(appt.id, 'COMPLETED')).status).toBe(200);
    const [r] = await reservations(appt.id);
    expect(r).toMatchObject({ status: 'CONSUMED' });
    expect(r!.consumedAt).not.toBeNull();
    expect(await getProduct(a.id)).toMatchObject({ stockQty: 7, reservedQty: 0, availableQty: 7 });
    // re-sync after completion never re-reserves
    await prisma.$transaction((tx) => syncAppointmentReservations(tx, appt.id));
    expect((await reservations(appt.id))[0]!.status).toBe('CONSUMED');

    // customer cancel (booking flow)
    const c = await appointment(svc.id);
    await setStatus(c.id, 'CONFIRMED');
    await cancelAppointment(c.id, customerId, {});
    expect((await reservations(c.id))[0]!.status).toBe('RELEASED');

    // reschedule by the customer drops the appointment back to PENDING → released; re-confirm re-activates the same row
    const d = await appointment(svc.id);
    await setStatus(d.id, 'CONFIRMED');
    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({ where: { id: d.id }, data: { status: 'PENDING' } });
      await syncAppointmentReservations(tx, d.id);
    });
    expect((await reservations(d.id))[0]!.status).toBe('RELEASED');
    await setStatus(d.id, 'CONFIRMED');
    const again = await reservations(d.id);
    expect(again).toHaveLength(1);
    expect(again[0]!.status).toBe('ACTIVE');
    await setStatus(d.id, 'CANCELLED');
    expect((await reconcileStock()).mismatches.filter((m) => m.productId === a.id)).toEqual([]);
  });

  it('H7 — service change re-reserves; backfill picks up confirmed appointments without reservations', async () => {
    const x = await stocked('RES-X', 5);
    const y = await stocked('RES-Y', 5);
    const s1 = await service('res3a', [{ productId: x.id, qtyPerUse: 1 }]);
    const s2 = await service('res3b', [{ productId: y.id, qtyPerUse: 2 }]);
    const appt = await appointment(s1.id);
    await setStatus(appt.id, 'CONFIRMED');
    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({ where: { id: appt.id }, data: { serviceId: s2.id } });
      await syncAppointmentReservations(tx, appt.id);
    });
    const rs = await reservations(appt.id);
    const byP = new Map(rs.map((r) => [r.productId, r]));
    expect(byP.get(x.id)!.status).toBe('RELEASED');
    expect(byP.get(y.id)).toMatchObject({ status: 'ACTIVE' });
    expect(byP.get(y.id)!.qty.toNumber()).toBe(2);

    // an appointment confirmed "outside" the hooked paths → backfill reserves it (idempotent on rerun)
    const legacy = await appointment(s1.id, 'CONFIRMED');
    expect(await reservations(legacy.id)).toHaveLength(0);
    await backfillReservations();
    expect((await reservations(legacy.id)).map((r) => r.status)).toEqual(['ACTIVE']);
    await backfillReservations();
    expect(await prisma.stockReservation.count({ where: { appointmentId: legacy.id } })).toBe(1);
    await setStatus(legacy.id, 'CANCELLED');
    await setStatus(appt.id, 'CANCELLED');
  });

  it('H7 — onOrder counts outstanding qty of PENDING_APPROVAL/ORDERED/PARTIALLY_RECEIVED POs only', async () => {
    const sup = await prisma.supplier.create({ data: { name: `${SUP} OO`, phone: '1' } });
    const p = await product('ONORDER');
    const mk = (status: string, qty: number) =>
      request(app).post('/api/v1/purchase-orders').set(...bearer(adminToken))
        .send({ branchId: BRANCH_ID, supplierId: sup.id, status, items: [{ productId: p.id, quantity: qty, unitCost: 1 }] });
    await mk('DRAFT', 100); // not counted
    const ordered = await mk('ORDERED', 10);
    await request(app).post(`/api/v1/purchase-orders/${ordered.body.data.id}/receipts`).set(...bearer(adminToken))
      .send({ lines: [{ poItemId: ordered.body.data.items[0].id, qtyReceived: 4 }] });
    const closed = await mk('ORDERED', 5);
    await request(app).post(`/api/v1/purchase-orders/${closed.body.data.id}/receipts`).set(...bearer(adminToken))
      .send({ lines: [{ poItemId: closed.body.data.items[0].id, qtyReceived: 1 }] });
    await request(app).post(`/api/v1/purchase-orders/${closed.body.data.id}/close-short`).set(...bearer(adminToken)).send({ reason: 'x' });
    const pending = await prisma.purchaseOrder.create({
      data: {
        branchId: BRANCH_ID, supplierId: sup.id, poNumber: `PO-W9D2-${randomUUID().slice(0, 8)}`, totalAmount: 3, status: 'PENDING_APPROVAL',
        items: { create: [{ productId: p.id, quantity: 3, unitCost: 1 }] },
      },
    });
    expect(pending.status).toBe('PENDING_APPROVAL');
    expect(await getProduct(p.id)).toMatchObject({ stockQty: 5, onOrderQty: 9 }); // (10−4) + 3
  });

  // ------------------------------------------------------------------ M11

  it('M11 — reorder point from 90-day usage, lead time from preferred supplier, suggestions rounded to MOQ', async () => {
    await request(app).put('/api/v1/stock-adjustments/settings').set(...bearer(adminToken))
      .send({ safetyStockDays: 2, reorderReviewDays: 10, defaultLeadTimeDays: 7 });
    const sup = await prisma.supplier.create({ data: { name: `${SUP} RP`, phone: '1', leadTimeDays: 9 } });
    const p = await stocked('RP', 30, 1000, { minStockQty: 1 });
    const q = await stocked('RP-NOSUP', 0, 500, { minStockQty: 2 });
    await prisma.supplierProduct.create({ data: { supplierId: sup.id, productId: p.id, unitCost: 900, moq: 12, leadTimeDays: 5, isPreferred: true } });
    // 180 used in the last 90 days → 2/day; an older consumption is ignored
    for (const [qty, daysAgo] of [[100, 10], [80, 50], [500, 120]] as const) {
      await prisma.stockMovement.create({
        data: {
          branchId: BRANCH_ID, productId: p.id, type: 'SERVICE_CONSUMED', qty, balanceAfter: 0,
          createdAt: new Date(Date.now() - daysAgo * DAY), refId: `test:${randomUUID()}`,
        },
      });
    }
    await computeReorderPoints(new Date(), { productIds: [p.id, q.id] });
    const fresh = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(fresh.avgDailyUsage!.toNumber()).toBeCloseTo(2, 4);
    // 2 × 5 (lead, SupplierProduct override) + 2 × 2 (safety) = 14
    expect(fresh.reorderPoint!.toNumber()).toBe(14);
    expect(await getProduct(p.id)).toMatchObject({ reorderPoint: 14, reorderThreshold: 14, lowStock: false });

    // push stock below the reorder point via a reservation-free path: set stock 10 (ledger kept consistent)
    await prisma.product.update({ where: { id: p.id }, data: { stockQty: 10 } });
    await prisma.stockMovement.create({
      data: { branchId: BRANCH_ID, productId: p.id, type: 'ADJUSTMENT_ADD', qty: 660, balanceAfter: 10, reasonCode: 'COUNT_VARIANCE' },
    });
    expect(await getProduct(p.id)).toMatchObject({ lowStock: true });

    const sug = await request(app).get(`/api/v1/purchase-orders/suggestions?branchId=${BRANCH_ID}`).set(...bearer(adminToken));
    expect(sug.status).toBe(200);
    const items = (sug.body.data.groups as { supplierId: string | null; items: { productId: string; suggestedQty: number; unitCost: number }[] }[])
      .flatMap((g) => g.items.map((i) => ({ ...i, supplierId: g.supplierId })));
    const ip = items.find((i) => i.productId === p.id)!;
    // target 14 + 2×10 = 34; position 10 → 24 → MOQ 12 → 24
    expect(ip).toMatchObject({ supplierId: sup.id, suggestedQty: 24, unitCost: 900 });
    const iq = items.find((i) => i.productId === q.id)!;
    // no usage, threshold = min 2, position 0 → 2 (no supplier group)
    expect(iq).toMatchObject({ supplierId: null, suggestedQty: 2 });

    // an ORDERED PO covering it removes the product from the suggestions
    const po = await request(app).post('/api/v1/purchase-orders').set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, supplierId: sup.id, status: 'ORDERED', items: [{ productId: p.id, quantity: 24 }] });
    expect(po.body.data.items[0].unitCost).toBe(900);
    const sug2 = await request(app).get(`/api/v1/purchase-orders/suggestions?branchId=${BRANCH_ID}`).set(...bearer(adminToken));
    const ids2 = (sug2.body.data.groups as { items: { productId: string }[] }[]).flatMap((g) => g.items.map((i) => i.productId));
    expect(ids2).not.toContain(p.id);

    expect(roundOrderQty(0, null)).toBe(1);
    expect(roundOrderQty(13.2, null)).toBe(14);
    expect(roundOrderQty(13, 6)).toBe(18);
    expect(roundOrderQty(12, 6)).toBe(12);
  });

  it('M4/L8 — SQL low-stock filter + stats match the old in-memory semantics', async () => {
    const specs: [string, number, number][] = [
      ['LS-OUT', 0, 5], ['LS-EQ', 5, 5], ['LS-LOW', 2, 5], ['LS-OK', 6, 5], ['LS-ZMIN', 0, 0], ['LS-OK0', 1, 0],
    ];
    for (const [sku, stock, min] of specs) await product(sku, { stockQty: stock, minStockQty: min });
    const old = (stock: number, min: number) => stock <= 0 || stock <= min; // outOfStock || lowStock
    const expected = specs.filter(([, s, m]) => old(s, m)).map(([sku]) => `${SKU}${sku}`).sort();
    const res = await request(app).get(`/api/v1/products?q=${SKU}LS-&lowStock=true&pageSize=50`).set(...bearer(adminToken));
    expect(res.status).toBe(200);
    expect((res.body.data.items as { sku: string }[]).map((i) => i.sku).sort()).toEqual(expected);
    expect(res.body.data.total).toBe(expected.length);

    // stats (SQL aggregate) equals a JS recomputation over all live products of the branch
    const all = await prisma.product.findMany({ where: { deletedAt: null, branchId: BRANCH_ID } });
    let low = 0; let out = 0; let value = 0;
    for (const p of all) {
      const s = p.stockQty.toNumber();
      const thr = Math.max(p.minStockQty.toNumber(), p.reorderPoint?.toNumber() ?? 0);
      if (s <= 0) out += 1; else if (s <= thr) low += 1;
      value += Math.max(s, 0) * Math.round(p.costPrice.toNumber() * 100) / 100;
    }
    const stats = (await request(app).get(`/api/v1/products/stats?branchId=${BRANCH_ID}`).set(...bearer(adminToken))).body.data;
    expect(stats).toMatchObject({ totalProducts: all.length, lowStockCount: low, outOfStockCount: out });
    expect(stats.totalStockValue).toBeCloseTo(value, 0);
  });

  // ------------------------------------------------------------------ L7

  it('L7 — product delete blocked with reasons (stock, lots, BOM, reservations, open PO)', async () => {
    const withStock = await stocked('DEL-STOCK', 3);
    const r1 = await request(app).delete(`/api/v1/products/${withStock.id}`).set(...bearer(adminToken));
    expect(r1.status).toBe(409);
    expect(r1.body.error.message).toContain('ສະຕັອກ');

    const inBom = await product('DEL-BOM');
    const svc = await service('del', [{ productId: inBom.id, qtyPerUse: 1 }]);
    const appt = await appointment(svc.id);
    await setStatus(appt.id, 'CONFIRMED');
    const r2 = await request(app).delete(`/api/v1/products/${inBom.id}`).set(...bearer(adminToken));
    expect(r2.status).toBe(409);
    expect(r2.body.error.details.reasons).toHaveLength(2); // BOM + reservation
    expect(r2.body.error.message).toContain(svc.name);

    const onPo = await product('DEL-PO');
    const sup = await prisma.supplier.create({ data: { name: `${SUP} DEL`, phone: '1' } });
    await request(app).post('/api/v1/purchase-orders').set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, supplierId: sup.id, items: [{ productId: onPo.id, quantity: 1, unitCost: 1 }] });
    expect((await request(app).delete(`/api/v1/products/${onPo.id}`).set(...bearer(adminToken))).status).toBe(409);

    const lotOnly = await product('DEL-LOT', { trackLot: true });
    await prisma.stockLot.create({ data: { productId: lotOnly.id, branchId: BRANCH_ID, lotNumber: 'L1', qtyOnHand: 1, unitCost: 1 } });
    expect((await request(app).delete(`/api/v1/products/${lotOnly.id}`).set(...bearer(adminToken))).status).toBe(409);

    const clean = await product('DEL-OK');
    expect((await request(app).delete(`/api/v1/products/${clean.id}`).set(...bearer(adminToken))).status).toBe(204);
    await setStatus(appt.id, 'CANCELLED');
  });

  // ------------------------------------------------------------------ Reports

  it('reports — turnover / days on hand, aging buckets, usage per service', async () => {
    const ymd = (d: Date) => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
    const p = await product('RPT', { stockQty: 8, costPrice: 1000 });
    await prisma.stockMovement.create({
      data: { branchId: BRANCH_ID, productId: p.id, type: 'PURCHASE_IN', qty: 10, balanceAfter: 10, unitCost: 1000, valueChange: 10000, createdAt: new Date(Date.now() - 100 * DAY) },
    });
    const svc = await service('rpt', [{ productId: p.id, qtyPerUse: 1 }]);
    const a1 = await appointment(svc.id);
    const a2 = await appointment(svc.id);
    for (const a of [a1, a2]) {
      await prisma.stockMovement.create({
        data: {
          branchId: BRANCH_ID, productId: p.id, type: 'SERVICE_CONSUMED', qty: 1, balanceAfter: 9, unitCost: 1000, valueChange: -1000,
          refId: `appt:${a.id}`, createdAt: new Date(Date.now() - 5 * DAY),
        },
      });
    }
    const from = ymd(new Date(Date.now() - 19 * DAY));
    const to = ymd(new Date());
    const turn = await request(app).get(`/api/v1/stock-movements/turnover?branchId=${BRANCH_ID}&from=${from}&to=${to}`).set(...bearer(adminToken));
    expect(turn.status).toBe(200);
    expect(turn.body.data.days).toBe(20);
    const row = (turn.body.data.rows as { productId: string }[]).find((r) => r.productId === p.id);
    // opening 10000, closing 8000 → avg 9000; cogs 2000 → turnover 0.22; DOH = 9000 × 20 / 2000 = 90
    expect(row).toMatchObject({ openingValue: 10000, closingValue: 8000, avgValue: 9000, cogs: 2000, turnover: 0.22, daysOnHand: 90 });

    const lotP = await stocked('RPT-LOT', 5, 200, { trackLot: true });
    await prisma.stockLot.create({
      data: { productId: lotP.id, branchId: BRANCH_ID, lotNumber: 'AGE-1', qtyOnHand: 3, unitCost: 300, receivedAt: new Date(Date.now() - 45 * DAY) },
    });
    const aging = await request(app).get(`/api/v1/stock-movements/aging?branchId=${BRANCH_ID}`).set(...bearer(adminToken));
    expect(aging.status).toBe(200);
    const rows = aging.body.data.rows as { productId: string; bucket: string; ageSource: string; qty: number; value: number; lotNumber: string | null }[];
    expect(rows.find((r) => r.productId === p.id)).toMatchObject({ bucket: '90+', ageSource: 'LAST_RECEIPT', qty: 8, value: 8000 });
    expect(rows.find((r) => r.productId === lotP.id && r.lotNumber === 'AGE-1')).toMatchObject({ bucket: '31-60', ageSource: 'LOT', qty: 3, value: 900 });
    expect(rows.find((r) => r.productId === lotP.id && r.lotNumber === null)).toMatchObject({ bucket: '0-30', ageSource: 'CREATED', qty: 2, value: 400 });
    const bucketSum = (aging.body.data.buckets as { value: number }[]).reduce((s, b) => s + b.value, 0);
    expect(bucketSum).toBeCloseTo(aging.body.data.totals.value, 0);

    const usage = await request(app).get(`/api/v1/stock-movements/service-usage?branchId=${BRANCH_ID}&from=${from}&to=${to}`).set(...bearer(adminToken));
    expect(usage.status).toBe(200);
    expect((usage.body.data.rows as { serviceId: string }[]).find((r) => r.serviceId === svc.id)).toMatchObject({
      productId: p.id, appointments: 2, qty: 2, value: 2000, qtyPerAppointment: 1,
    });
    expect((usage.body.data.byService as { serviceId: string }[]).find((r) => r.serviceId === svc.id)).toMatchObject({
      appointments: 2, value: 2000, valuePerAppointment: 1000,
    });
  });
});
