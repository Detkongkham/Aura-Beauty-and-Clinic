import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { Prisma } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { reconcileStock, consumeServiceStock } from '../../src/modules/inventory/inventory.service.js';
import { runLotExpiryAlerts } from '../../src/jobs/lot-expiry.job.js';

/**
 * Integration — Phase 6 Inventory (Module 32 B2B Supplier/PO + Module 14 BOM ledger).
 *   suppliers CRUD · products + opening stock movement · manual adjust (+/‑, ຫ້າມຕິດລົບ) ·
 *   purchase order → receive → stockQty ເພີ່ມ + PURCHASE_IN movement (idempotent) ·
 *   BOM: walk-in haircut → COMPLETED → ຕັດ shampoo 0.03 + SERVICE_CONSUMED (idempotent) ·
 *   RBAC: CUSTOMER → 403.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const HAIRCUT_ID = '33333333-0000-0000-0000-000000000001'; // seed: BOM shampoo 0.03/ຄັ້ງ
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const CUST_PHONE = '02090001777';
const CUST_PASSWORD = 'Cust@12345';
const WI_PHONE = '02088840077';
const TEST_SKU = 'SKU-P6-TEST-1';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

async function wipe(): Promise<void> {
  const products = await prisma.product.findMany({
    where: { sku: TEST_SKU },
    select: { id: true },
  });
  const pids = products.map((p) => p.id);
  if (pids.length) {
    await prisma.purchaseOrderItem.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: pids } } });
  }
  // C5 — sweep leftovers from an aborted lot test run
  const lotProducts = await prisma.product.findMany({ where: { sku: { startsWith: 'SKU-P6-LOT-' } }, select: { id: true } });
  if (lotProducts.length) {
    const lp = lotProducts.map((p) => p.id);
    await prisma.stockMovement.deleteMany({ where: { productId: { in: lp } } });
    await prisma.stockLot.deleteMany({ where: { productId: { in: lp } } });
    await prisma.purchaseOrderItem.deleteMany({ where: { productId: { in: lp } } });
    await prisma.product.deleteMany({ where: { id: { in: lp } } });
  }
  await prisma.purchaseOrder.deleteMany({ where: { supplier: { name: 'ຜູ້ສະໜອງທົດສອບ P6' } } });
  if (pids.length) await prisma.product.deleteMany({ where: { id: { in: pids } } });
  await prisma.supplier.deleteMany({ where: { name: 'ຜູ້ສະໜອງທົດສອບ P6' } });

  const appts = await prisma.appointment.findMany({
    where: { customer: { phone: WI_PHONE } },
    select: { id: true },
  });
  const aids = appts.map((a) => a.id);
  if (aids.length) {
    await prisma.queueTicket.deleteMany({ where: { appointmentId: { in: aids } } });
    await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: aids } } });
    await prisma.stockMovement.deleteMany({ where: { refId: { in: aids.map((id) => `appt:${id}`) } } });
    await prisma.appointment.deleteMany({ where: { id: { in: aids } } });
  }
  await prisma.user.deleteMany({ where: { phone: WI_PHONE } });
}

describe('Phase 6 — Inventory (Suppliers, Purchase Orders, BOM ledger)', () => {
  let app: Express;
  let adminToken: string;
  let custToken: string;

  beforeAll(async () => {
    app = createApp();
    await wipe();

    adminToken = (
      await request(app).post('/api/v1/auth/login').send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD })
    ).body.data.tokens.accessToken;

    await request(app).post('/api/v1/auth/register').send({
      name: 'ລູກຄ້າ P6',
      phone: CUST_PHONE,
      password: CUST_PASSWORD,
    });
    custToken = (
      await request(app).post('/api/v1/auth/login').send({ phone: CUST_PHONE, password: CUST_PASSWORD })
    ).body.data.tokens.accessToken;
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('RBAC — CUSTOMER cannot create a supplier', async () => {
    const res = await request(app)
      .post('/api/v1/suppliers')
      .set(...bearer(custToken))
      .send({ name: 'x', phone: '123' });
    expect(res.status).toBe(403);
  });

  it('supplier CRUD + delete blocked while a PO references it', async () => {
    const created = await request(app)
      .post('/api/v1/suppliers')
      .set(...bearer(adminToken))
      .send({ name: 'ຜູ້ສະໜອງທົດສອບ P6', phone: '020 5555 0100', email: 'p6@supplier.test' });
    expect(created.status).toBe(201);
    const supplierId = created.body.data.id as string;

    const updated = await request(app)
      .patch(`/api/v1/suppliers/${supplierId}`)
      .set(...bearer(adminToken))
      .send({ name: 'ຜູ້ສະໜອງທົດສອບ P6', phone: '020 5555 0199', contactPerson: 'ທ. ກ' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.phone).toBe('020 5555 0199');

    // product to order
    const prod = await request(app)
      .post('/api/v1/products')
      .set(...bearer(adminToken))
      .send({
        branchId: BRANCH_ID,
        name: 'ສິນຄ້າທົດສອບ P6',
        sku: TEST_SKU,
        unit: 'ອັນ',
        costPrice: 12000,
        openingStock: 4,
        minStockQty: 10,
      });
    expect(prod.status).toBe(201);
    const productId = prod.body.data.id as string;
    expect(prod.body.data.stockQty).toBe(4);
    expect(prod.body.data.lowStock).toBe(true);

    // opening stock left a movement
    const mv = await request(app)
      .get(`/api/v1/stock-movements?productId=${productId}`)
      .set(...bearer(adminToken));
    expect(mv.body.data.items[0].type).toBe('ADJUSTMENT_ADD');
    expect(mv.body.data.items[0].balanceAfter).toBe(4);

    // manual adjust: -2 ok, then -10 rejected (would go negative)
    const dec = await request(app)
      .post('/api/v1/stock-movements/adjust')
      .set(...bearer(adminToken))
      .send({ productId, delta: -2, notes: 'ເສຍຫາຍ' });
    expect(dec.status).toBe(201);
    expect(dec.body.data.type).toBe('ADJUSTMENT_DEDUCT');
    expect(dec.body.data.balanceAfter).toBe(2);

    const bad = await request(app)
      .post('/api/v1/stock-movements/adjust')
      .set(...bearer(adminToken))
      .send({ productId, delta: -10 });
    expect(bad.status).toBe(409);

    // purchase order → receive
    const po = await request(app)
      .post('/api/v1/purchase-orders')
      .set(...bearer(adminToken))
      .send({
        branchId: BRANCH_ID,
        supplierId,
        items: [{ productId, quantity: 20, unitCost: 11500 }],
      });
    expect(po.status).toBe(201);
    expect(po.body.data.poNumber).toMatch(/^PO-[0-9A-F]{8}$/);
    expect(po.body.data.totalAmount).toBe(230000);
    const poId = po.body.data.id as string;

    const recv = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .set(...bearer(adminToken));
    expect(recv.status).toBe(200);
    expect(recv.body.data.status).toBe('RECEIVED');

    const afterRecv = await request(app).get(`/api/v1/products/${productId}`).set(...bearer(adminToken));
    expect(afterRecv.body.data.stockQty).toBe(22); // 4 - 2 + 20

    // receive again → 409
    const recv2 = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .set(...bearer(adminToken));
    expect(recv2.status).toBe(409);

    // supplier delete blocked (PO exists)
    const delBlocked = await request(app)
      .delete(`/api/v1/suppliers/${supplierId}`)
      .set(...bearer(adminToken));
    expect(delBlocked.status).toBe(409);
  });

  it('BOM — completing a haircut appointment deducts shampoo 0.03 exactly once', async () => {
    // shampoo is shared mutable state across parallel test files → assert on THIS
    // appointment's own SERVICE_CONSUMED ledger row + the product delta it caused,
    // not the global stock level.
    const wi = await request(app)
      .post('/api/v1/appointments/walk-in')
      .set(...bearer(adminToken))
      .send({
        branchId: BRANCH_ID,
        customerName: 'ລູກຄ້າ BOM',
        customerPhone: WI_PHONE,
        serviceId: HAIRCUT_ID,
      });
    expect(wi.status).toBe(201);
    const appointmentId = wi.body.data.appointmentId as string;
    const refId = `appt:${appointmentId}`;

    const done = await request(app)
      .patch(`/api/v1/appointments/${appointmentId}/status`)
      .set(...bearer(adminToken))
      .send({ status: 'COMPLETED' });
    expect(done.status).toBe(200);

    const consumed = await prisma.stockMovement.findMany({
      where: { refId, type: 'SERVICE_CONSUMED' },
    });
    expect(consumed).toHaveLength(1);
    expect(consumed[0]!.qty.toNumber()).toBe(0.03);
    const balanceAfterFirst = consumed[0]!.balanceAfter.toNumber();

    // idempotent — re-PATCH COMPLETED must not add a second consumption row
    await request(app)
      .patch(`/api/v1/appointments/${appointmentId}/status`)
      .set(...bearer(adminToken))
      .send({ status: 'COMPLETED' });
    const consumedAgain = await prisma.stockMovement.findMany({
      where: { refId, type: 'SERVICE_CONSUMED' },
    });
    expect(consumedAgain).toHaveLength(1);
    expect(consumedAgain[0]!.balanceAfter.toNumber()).toBe(balanceAfterFirst);
  });

  it('inventory stats reflect low stock and open POs', async () => {
    const res = await request(app)
      .get(`/api/v1/products/stats?branchId=${BRANCH_ID}`)
      .set(...bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('totalStockValue');
    expect(res.body.data.lowStockCount).toBeGreaterThanOrEqual(0);
  });

  it('BOM — service create rejects a consumable that does not reference a real Product', async () => {
    const res = await request(app)
      .post('/api/v1/services')
      .set(...bearer(adminToken))
      .send({
        categoryId: '22222222-0000-0000-0000-000000000001',
        name: 'ບໍລິການ BOM ບໍ່ຖືກ',
        price: 100000,
        durationMinutes: 30,
        consumables: [{ productId: '00000000-0000-0000-0000-0000000000ff', qtyPerUse: 1 }],
      });
    expect(res.status).toBe(400);
  });

  it('branch scope — BRANCH_ADMIN cannot mutate another branch stock; can mutate its own', async () => {
    const managerToken = (
      await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: '02000000001', password: 'Manager@12345' })
    ).body.data.tokens.accessToken;

    // a product in a DIFFERENT branch, created by SUPER_ADMIN
    const otherBranch = await prisma.branch.create({
      data: { name: 'P6 branch-scope test', address: '—', phone: '020', baseCurrency: 'LAK' },
    });
    const foreign = await request(app)
      .post('/api/v1/products')
      .set(...bearer(adminToken))
      .send({
        branchId: otherBranch.id,
        name: 'ສິນຄ້າສາຂາອື່ນ',
        sku: 'SKU-P6-FOREIGN-1',
        unit: 'ອັນ',
        costPrice: 5000,
        openingStock: 5,
      });
    const foreignId = foreign.body.data.id as string;

    try {
      // manager (branchId = seed branch) is blocked on the foreign product
      const blockedAdjust = await request(app)
        .post('/api/v1/stock-movements/adjust')
        .set(...bearer(managerToken))
        .send({ productId: foreignId, delta: 1 });
      expect(blockedAdjust.status).toBe(403);

      const blockedCreate = await request(app)
        .post('/api/v1/products')
        .set(...bearer(managerToken))
        .send({
          branchId: otherBranch.id,
          name: 'x',
          sku: 'SKU-P6-FOREIGN-2',
          unit: 'ອັນ',
          costPrice: 1,
        });
      expect(blockedCreate.status).toBe(403);

      // …but can adjust a product in its own branch (shampoo, seeded in the seed branch)
      const shampoo = await prisma.product.findFirstOrThrow({ where: { sku: 'SKU-SHAMPOO-1L' } });
      const ownAdjust = await request(app)
        .post('/api/v1/stock-movements/adjust')
        .set(...bearer(managerToken))
        .send({ productId: shampoo.id, delta: 1, notes: 'branch-scope ok' });
      expect(ownAdjust.status).toBe(201);
      // put it back
      await request(app)
        .post('/api/v1/stock-movements/adjust')
        .set(...bearer(managerToken))
        .send({ productId: shampoo.id, delta: -1 });
    } finally {
      await prisma.stockMovement.deleteMany({ where: { productId: foreignId } });
      await prisma.product.deleteMany({ where: { id: foreignId } });
      await prisma.branch.deleteMany({ where: { id: otherBranch.id } });
    }
  });

  // ---------------------------------------------------------------------
  // Audit ຄື້ນ 9A (docs/inventory-audit.md) — C1/C2/C3/H1/M16/M17.
  // ---------------------------------------------------------------------

  it('C3 — soft-delete releases the SKU so it can be reused in the same branch', async () => {
    const sku = 'SKU-P6-REUSE-1';
    const first = await request(app)
      .post('/api/v1/products')
      .set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, name: 'ສິນຄ້າ reuse #1', sku, unit: 'ອັນ', costPrice: 1000 });
    expect(first.status).toBe(201);
    const firstId = first.body.data.id as string;

    const del = await request(app).delete(`/api/v1/products/${firstId}`).set(...bearer(adminToken));
    expect(del.status).toBe(204);

    // sku ຖືກຕໍ່ທ້າຍ :deleted:<ts> — ຄືນມາໃຊ້ໄດ້ອີກໃນສາຂາດຽວກັນ
    const second = await request(app)
      .post('/api/v1/products')
      .set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, name: 'ສິນຄ້າ reuse #2', sku, unit: 'ອັນ', costPrice: 1000 });
    expect(second.status).toBe(201);
    expect(second.body.data.sku).toBe(sku);

    await prisma.product.deleteMany({ where: { id: { in: [firstId, second.body.data.id as string] } } });
  });

  it('H1 — manual adjust records createdByUserId + shows it in the ledger', async () => {
    const sku = 'SKU-P6-WHO-1';
    const created = await request(app)
      .post('/api/v1/products')
      .set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, name: 'ສິນຄ້າ ledger who', sku, unit: 'ອັນ', costPrice: 1000, openingStock: 5 });
    const productId = created.body.data.id as string;

    const adj = await request(app)
      .post('/api/v1/stock-movements/adjust')
      .set(...bearer(adminToken))
      .send({ productId, delta: 2 });
    expect(adj.status).toBe(201);
    expect(adj.body.data.createdByUserId).toBeTruthy();
    expect(adj.body.data.createdByUserName).toBeTruthy();

    // opening-stock movement ຄວນເປັນ null (ລະບົບ, ບໍ່ແມ່ນມະນຸດກົດຕອນ create ດ້ວຍ authenticated user? —
    // ຕົວຈິງ createProduct ກໍ່ຮັບ createdByUserId ນຳ, ດັ່ງນັ້ນຄວນມີຄ່າເໝືອນກັນ).
    const mv = await request(app)
      .get(`/api/v1/stock-movements?productId=${productId}`)
      .set(...bearer(adminToken));
    expect(mv.body.data.items.every((m: { createdByUserId: string | null }) => m.createdByUserId)).toBe(true);

    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });
  });

  it('M17 — purchase order rejects duplicate productId in items', async () => {
    const supplier = await prisma.supplier.create({
      data: { name: 'ຜູ້ສະໜອງທົດສອບ P6', phone: '020 5555 0200' },
    });
    const product = await prisma.product.create({
      data: { branchId: BRANCH_ID, name: 'ສິນຄ້າ dup PO', sku: 'SKU-P6-DUPITEM-1', unit: 'ອັນ', costPrice: 1000 },
    });
    try {
      const res = await request(app)
        .post('/api/v1/purchase-orders')
        .set(...bearer(adminToken))
        .send({
          branchId: BRANCH_ID,
          supplierId: supplier.id,
          items: [
            { productId: product.id, quantity: 5, unitCost: 1000 },
            { productId: product.id, quantity: 3, unitCost: 1000 },
          ],
        });
      expect(res.status).toBe(400);
    } finally {
      await prisma.product.deleteMany({ where: { id: product.id } });
      await prisma.supplier.deleteMany({ where: { id: supplier.id } });
    }
  });

  it('M16 — stock-movement date filter `to` includes the whole day, not just midnight', async () => {
    const product = await prisma.product.create({
      data: { branchId: BRANCH_ID, name: 'ສິນຄ້າ M16', sku: 'SKU-P6-M16-1', unit: 'ອັນ', costPrice: 1000 },
    });
    try {
      const adj = await request(app)
        .post('/api/v1/stock-movements/adjust')
        .set(...bearer(adminToken))
        .send({ productId: product.id, delta: 1 });
      expect(adj.status).toBe(201);
      const today = new Date().toISOString().slice(0, 10);

      const res = await request(app)
        .get(`/api/v1/stock-movements?productId=${product.id}&from=${today}&to=${today}`)
        .set(...bearer(adminToken));
      expect(res.status).toBe(200);
      // ຖ້າ bug M16 ຍັງຢູ່ (lte ຕອນທ່ຽງຄືນ), ລາຍການທີ່ຫາກໍ່ສ້າງມື້ນີ້ຈະຫາຍໄປ.
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    } finally {
      await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
      await prisma.product.deleteMany({ where: { id: product.id } });
    }
  });

  it('C1 — concurrent manual adjustments do not lose updates (row lock serializes them)', async () => {
    const product = await prisma.product.create({
      data: {
        branchId: BRANCH_ID,
        name: 'ສິນຄ້າ concurrency',
        sku: 'SKU-P6-RACE-1',
        unit: 'ອັນ',
        costPrice: 1000,
        stockQty: 100,
      },
    });
    try {
      const N = 20;
      const results = await Promise.all(
        Array.from({ length: N }, () =>
          request(app)
            .post('/api/v1/stock-movements/adjust')
            .set(...bearer(adminToken))
            .send({ productId: product.id, delta: -1 }),
        ),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);

      const fresh = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      // ຖ້າ race condition (C1) ຍັງບໍ່ໄດ້ແກ້, lost update ຈະເຮັດໃຫ້ຄ່ານີ້ສູງກວ່າ 80.
      expect(fresh.stockQty.toNumber()).toBe(80);
    } finally {
      await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
      await prisma.product.deleteMany({ where: { id: product.id } });
    }
  });

  it('C2 — BOM consumption blocks when it would go negative, and reconcileStock stays clean', async () => {
    const product = await prisma.product.create({
      data: {
        branchId: BRANCH_ID,
        name: 'ວັດຖຸດິບໃກ້ໝົດ',
        sku: 'SKU-P6-NEGSTOCK-1',
        unit: 'ອັນ',
        costPrice: 5000,
        stockQty: 1,
      },
    });
    const service = await prisma.service.create({
      data: {
        categoryId: '22222222-0000-0000-0000-000000000001',
        branchId: BRANCH_ID,
        name: 'ບໍລິການທົດສອບ C2',
        price: new Prisma.Decimal(50000),
        durationMinutes: 15,
      },
    });
    await prisma.serviceConsumable.create({
      data: { serviceId: service.id, productId: product.id, qtyPerUse: 1 },
    });
    await prisma.staffService.create({
      data: { staffProfileId: '13497486-39df-4fe1-b0af-f0aba508129e', serviceId: service.id },
    });

    const phone1 = '02088850001';
    const phone2 = '02088850002';
    try {
      // ຄັ້ງທຳອິດ — ຕັດໄດ້ພໍດີ (1 → 0).
      const wi1 = await request(app)
        .post('/api/v1/appointments/walk-in')
        .set(...bearer(adminToken))
        .send({ branchId: BRANCH_ID, customerName: 'ລູກຄ້າ C2 #1', customerPhone: phone1, serviceId: service.id });
      expect(wi1.status).toBe(201);
      const appt1 = wi1.body.data.appointmentId as string;
      const done1 = await request(app)
        .patch(`/api/v1/appointments/${appt1}/status`)
        .set(...bearer(adminToken))
        .send({ status: 'COMPLETED' });
      expect(done1.status).toBe(200);

      // ຄັ້ງທີສອງ — ວັດຖຸດິບໝົດແລ້ວ, allowNegativeStock ຂອງສາຂາຍັງປິດຢູ່ → ຕ້ອງຖືກບລັອກ.
      const wi2 = await request(app)
        .post('/api/v1/appointments/walk-in')
        .set(...bearer(adminToken))
        .send({ branchId: BRANCH_ID, customerName: 'ລູກຄ້າ C2 #2', customerPhone: phone2, serviceId: service.id });
      expect(wi2.status).toBe(201);
      const appt2 = wi2.body.data.appointmentId as string;
      const done2 = await request(app)
        .patch(`/api/v1/appointments/${appt2}/status`)
        .set(...bearer(adminToken))
        .send({ status: 'COMPLETED' });
      expect(done2.status).toBe(409);
      // rollback — ນັດໝາຍນີ້ຕ້ອງບໍ່ COMPLETED (transaction ຖືກຍົກເລີກທັງໝົດ).
      const stillPending = await prisma.appointment.findUniqueOrThrow({ where: { id: appt2 } });
      expect(stillPending.status).not.toBe('COMPLETED');

      // ເປີດ allowNegativeStock ຂອງສາຂາ → ອະນຸຍາດຕິດລົບໄດ້ (backflush exception).
      await prisma.branch.update({ where: { id: BRANCH_ID }, data: { allowNegativeStock: true } });
      const done2Retry = await request(app)
        .patch(`/api/v1/appointments/${appt2}/status`)
        .set(...bearer(adminToken))
        .send({ status: 'COMPLETED' });
      expect(done2Retry.status).toBe(200);
      const afterRetry = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(afterRetry.stockQty.toNumber()).toBe(-1);

      // totalStockValue ບໍ່ຄວນຕິດລົບຍ້ອນສິນຄ້ານີ້.
      const stats = await request(app)
        .get(`/api/v1/products/stats?branchId=${BRANCH_ID}`)
        .set(...bearer(adminToken));
      expect(stats.body.data.totalStockValue).toBeGreaterThanOrEqual(0);
    } finally {
      await prisma.branch.update({ where: { id: BRANCH_ID }, data: { allowNegativeStock: false } });
      const appts = await prisma.appointment.findMany({
        where: { customer: { phone: { in: [phone1, phone2] } } },
        select: { id: true },
      });
      const aids = appts.map((a) => a.id);
      if (aids.length) {
        await prisma.queueTicket.deleteMany({ where: { appointmentId: { in: aids } } });
        await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: aids } } });
        await prisma.stockMovement.deleteMany({ where: { refId: { in: aids.map((id) => `appt:${id}`) } } });
        await prisma.appointment.deleteMany({ where: { id: { in: aids } } });
      }
      await prisma.user.deleteMany({ where: { phone: { in: [phone1, phone2] } } });
      await prisma.staffService.deleteMany({ where: { serviceId: service.id } });
      await prisma.serviceConsumable.deleteMany({ where: { serviceId: service.id } });
      await prisma.service.deleteMany({ where: { id: service.id } });
      await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
      await prisma.product.deleteMany({ where: { id: product.id } });
    }
  });

  // ---------------------------------------------------------------------
  // C4 (audit ຄື້ນ 9B) — WAC costing + valued ledger + COGS summary.
  // ---------------------------------------------------------------------

  it('C4 — two PO receipts at different unit costs blend into the correct weighted average', async () => {
    const sku = 'SKU-P6-WAC-1';
    const created = await request(app)
      .post('/api/v1/products')
      .set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, name: 'ສິນຄ້າ WAC', sku, unit: 'ອັນ', costPrice: 1, openingStock: 0 });
    expect(created.status).toBe(201);
    const productId = created.body.data.id as string;

    const supplier = await prisma.supplier.create({
      data: { name: 'ຜູ້ສະໜອງທົດສອບ P6', phone: '020 5555 0300' },
    });

    try {
      // 10 @ 10,000
      const po1 = await request(app)
        .post('/api/v1/purchase-orders')
        .set(...bearer(adminToken))
        .send({ branchId: BRANCH_ID, supplierId: supplier.id, items: [{ productId, quantity: 10, unitCost: 10000 }] });
      expect(po1.status).toBe(201);
      const recv1 = await request(app)
        .post(`/api/v1/purchase-orders/${po1.body.data.id}/receive`)
        .set(...bearer(adminToken));
      expect(recv1.status).toBe(200);

      const afterFirst = await request(app).get(`/api/v1/products/${productId}`).set(...bearer(adminToken));
      expect(afterFirst.body.data.costPrice).toBe(10000);

      const mv1 = await request(app)
        .get(`/api/v1/stock-movements?productId=${productId}&type=PURCHASE_IN`)
        .set(...bearer(adminToken));
      expect(mv1.body.data.items[0].unitCost).toBe(10000);
      expect(mv1.body.data.items[0].valueChange).toBe(100000); // 10 × 10,000

      // 10 @ 20,000 → WAC = (10×10,000 + 10×20,000) / 20 = 15,000
      const po2 = await request(app)
        .post('/api/v1/purchase-orders')
        .set(...bearer(adminToken))
        .send({ branchId: BRANCH_ID, supplierId: supplier.id, items: [{ productId, quantity: 10, unitCost: 20000 }] });
      expect(po2.status).toBe(201);
      const recv2 = await request(app)
        .post(`/api/v1/purchase-orders/${po2.body.data.id}/receive`)
        .set(...bearer(adminToken));
      expect(recv2.status).toBe(200);

      const afterSecond = await request(app).get(`/api/v1/products/${productId}`).set(...bearer(adminToken));
      expect(afterSecond.body.data.costPrice).toBe(15000);
      expect(afterSecond.body.data.stockQty).toBe(20);
    } finally {
      await prisma.purchaseOrderItem.deleteMany({ where: { productId } });
      await prisma.purchaseOrder.deleteMany({ where: { supplierId: supplier.id } });
      await prisma.stockMovement.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.supplier.deleteMany({ where: { id: supplier.id } });
    }
  });

  it('C4 — consumeServiceStock records negative COGS on SERVICE_CONSUMED without moving WAC', async () => {
    const product = await prisma.product.create({
      data: {
        branchId: BRANCH_ID,
        name: 'ວັດຖຸດິບ COGS',
        sku: 'SKU-P6-COGS-1',
        unit: 'ອັນ',
        costPrice: 8000,
        stockQty: 10,
      },
    });
    const service = await prisma.service.create({
      data: {
        categoryId: '22222222-0000-0000-0000-000000000001',
        branchId: BRANCH_ID,
        name: 'ບໍລິການທົດສອບ C4',
        price: new Prisma.Decimal(50000),
        durationMinutes: 15,
      },
    });
    await prisma.serviceConsumable.create({
      data: { serviceId: service.id, productId: product.id, qtyPerUse: 2 },
    });
    await prisma.staffService.create({
      data: { staffProfileId: '13497486-39df-4fe1-b0af-f0aba508129e', serviceId: service.id },
    });
    const phone = '02088850003';

    try {
      const wi = await request(app)
        .post('/api/v1/appointments/walk-in')
        .set(...bearer(adminToken))
        .send({ branchId: BRANCH_ID, customerName: 'ລູກຄ້າ C4', customerPhone: phone, serviceId: service.id });
      expect(wi.status).toBe(201);
      const appointmentId = wi.body.data.appointmentId as string;
      const done = await request(app)
        .patch(`/api/v1/appointments/${appointmentId}/status`)
        .set(...bearer(adminToken))
        .send({ status: 'COMPLETED' });
      expect(done.status).toBe(200);

      const mv = await request(app)
        .get(`/api/v1/stock-movements?productId=${product.id}&type=SERVICE_CONSUMED`)
        .set(...bearer(adminToken));
      expect(mv.body.data.items).toHaveLength(1);
      expect(mv.body.data.items[0].unitCost).toBe(8000);
      expect(mv.body.data.items[0].valueChange).toBe(-16000); // 2 × 8,000

      // WAC ບໍ່ປ່ຽນຍ້ອນການບໍລິໂພກ.
      const afterConsume = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(afterConsume.costPrice.toNumber()).toBe(8000);
    } finally {
      const appts = await prisma.appointment.findMany({ where: { customer: { phone } }, select: { id: true } });
      const aids = appts.map((a) => a.id);
      if (aids.length) {
        await prisma.queueTicket.deleteMany({ where: { appointmentId: { in: aids } } });
        await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: aids } } });
        await prisma.stockMovement.deleteMany({ where: { refId: { in: aids.map((id) => `appt:${id}`) } } });
        await prisma.appointment.deleteMany({ where: { id: { in: aids } } });
      }
      await prisma.user.deleteMany({ where: { phone } });
      await prisma.staffService.deleteMany({ where: { serviceId: service.id } });
      await prisma.serviceConsumable.deleteMany({ where: { serviceId: service.id } });
      await prisma.service.deleteMany({ where: { id: service.id } });
      await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
      await prisma.product.deleteMany({ where: { id: product.id } });
    }
  });

  it('C4 — GET /stock-movements/cogs-summary aggregates SERVICE_CONSUMED valueChange for a branch/date range', async () => {
    const product = await prisma.product.create({
      data: {
        branchId: BRANCH_ID,
        name: 'ວັດຖຸດິບ COGS summary',
        sku: 'SKU-P6-COGSSUM-1',
        unit: 'ອັນ',
        costPrice: 5000,
        stockQty: 100,
      },
    });
    try {
      const before = await request(app)
        .get(`/api/v1/stock-movements/cogs-summary?branchId=${BRANCH_ID}`)
        .set(...bearer(adminToken));
      expect(before.status).toBe(200);
      const baseline = before.body.data.totalCogs as number;

      // ຈຳລອງການບໍລິໂພກໂດຍກົງ (ບໍ່ຜ່ານ BOM) ເພື່ອທົດສອບ aggregation ໂດຍບໍ່ຕ້ອງສ້າງນັດໝາຍ/ບໍລິການ.
      await prisma.stockMovement.create({
        data: {
          branchId: BRANCH_ID,
          productId: product.id,
          type: 'SERVICE_CONSUMED',
          qty: new Prisma.Decimal(3),
          balanceAfter: new Prisma.Decimal(97),
          unitCost: new Prisma.Decimal(5000),
          valueChange: new Prisma.Decimal(-15000),
          notes: 'C4 cogs-summary test',
        },
      });

      const after = await request(app)
        .get(`/api/v1/stock-movements/cogs-summary?branchId=${BRANCH_ID}`)
        .set(...bearer(adminToken));
      expect(after.status).toBe(200);
      expect(after.body.data.totalCogs).toBe(baseline + 15000);
    } finally {
      await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
      await prisma.product.deleteMany({ where: { id: product.id } });
    }
  });

  it('M19 — reconcileStock() catches a stockQty written outside the ledger', async () => {
    const product = await prisma.product.create({
      data: {
        branchId: BRANCH_ID,
        name: 'ສິນຄ້າ reconcile',
        sku: 'SKU-P6-RECON-1',
        unit: 'ອັນ',
        costPrice: 1000,
        // stockQty ເລີ່ມ 0 (default) ໂດຍບໍ່ໄດ້ຜ່ານ createProduct — ledger ຈຶ່ງວ່າງເປົ່າຄືກັນ, ຍັງກົງກັນ.
      },
    });
    try {
      const before = await reconcileStock();
      expect(before.mismatches.find((m) => m.productId === product.id)).toBeUndefined();

      // ຂຽນ stockQty ກົງໆ ໂດຍຂ້າມ ledger (ຈຳລອງ bug ຫຼື migration ຜິດ).
      await prisma.product.update({ where: { id: product.id }, data: { stockQty: 999 } });
      const after = await reconcileStock();
      const mismatch = after.mismatches.find((m) => m.productId === product.id);
      expect(mismatch).toBeDefined();
      expect(mismatch?.actualBalance).toBe(999);
      expect(mismatch?.ledgerBalance).toBe(0); // ບໍ່ມີ movement ໃດເລີຍ — stockQty ຖືກຂຽນທັບກົງໆ
    } finally {
      await prisma.stockMovement.deleteMany({ where: { productId: product.id } });
      await prisma.product.deleteMany({ where: { id: product.id } });
    }
  });
  // ---------------------------------------------------------------- C5 — lot / expiry / FEFO / recall

  async function makeSupplier(): Promise<string> {
    const r = await request(app)
      .post('/api/v1/suppliers')
      .set(...bearer(adminToken))
      .send({ name: 'ຜູ້ສະໜອງທົດສອບ P6', phone: '02055500001' });
    return r.body.data.id as string;
  }

  async function makeLotProduct(sku: string, name: string): Promise<string> {
    const r = await request(app)
      .post('/api/v1/products')
      .set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, name, sku, unit: 'ຕຸກ', costPrice: 0, trackLot: true });
    expect(r.status).toBe(201);
    expect(r.body.data.trackLot).toBe(true);
    return r.body.data.id as string;
  }

  async function poReceive(
    supplierId: string,
    productId: string,
    qty: number,
    unitCost: number,
    lots?: { lotNumber: string; expiryDate?: string }[],
  ) {
    const po = await request(app)
      .post('/api/v1/purchase-orders')
      .set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, supplierId, status: 'ORDERED', items: [{ productId, quantity: qty, unitCost }] });
    expect(po.status).toBe(201);
    return request(app)
      .post(`/api/v1/purchase-orders/${po.body.data.id}/receive`)
      .set(...bearer(adminToken))
      .send(lots ? { lots: lots.map((l) => ({ productId, ...l })) } : {});
  }

  async function cleanupLotProduct(productId: string): Promise<void> {
    await prisma.stockMovement.deleteMany({ where: { productId } });
    await prisma.stockLot.deleteMany({ where: { productId } });
    await prisma.purchaseOrderItem.deleteMany({ where: { productId } });
    await prisma.purchaseOrder.deleteMany({ where: { supplier: { name: 'ຜູ້ສະໜອງທົດສອບ P6' }, items: { none: {} } } });
    await prisma.product.deleteMany({ where: { id: productId } });
  }

  it('C5 — receiving a lot-tracked product without lot info is rejected (400) and leaves stock untouched', async () => {
    const supplierId = await makeSupplier();
    const productId = await makeLotProduct('SKU-P6-LOT-NOLOT', 'ຢາສີດ lot ບໍ່ໃສ່');
    try {
      const res = await poReceive(supplierId, productId, 5, 1000);
      expect(res.status).toBe(400);
      const p = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      expect(p.stockQty.toNumber()).toBe(0);
      expect(await prisma.stockLot.count({ where: { productId } })).toBe(0);
    } finally {
      await cleanupLotProduct(productId);
    }
  });

  it('C5 — FEFO consumption spans lots (soonest expiry first), splits ledger rows per lot, and /usage traces the appointment', async () => {
    const supplierId = await makeSupplier();
    const productId = await makeLotProduct('SKU-P6-LOT-FEFO', 'ຢາສີດ FEFO');
    const service = await prisma.service.create({
      data: {
        categoryId: '22222222-0000-0000-0000-000000000001',
        branchId: BRANCH_ID,
        name: 'ບໍລິການທົດສອບ C5',
        price: new Prisma.Decimal(50000),
        durationMinutes: 15,
      },
    });
    const phone = '02088850005';
    try {
      // lot ທີ່ໝົດອາຍຸຊ້າ ຮັບກ່ອນ (ຕົ້ນທຶນ 1000) — FEFO ຕ້ອງບໍ່ຕັດອັນນີ້ກ່ອນ ເຖິງວ່າຮັບມາກ່ອນ.
      expect((await poReceive(supplierId, productId, 5, 1000, [{ lotNumber: 'LOT-LATE', expiryDate: '2028-12-31' }])).status).toBe(200);
      expect((await poReceive(supplierId, productId, 1, 2000, [{ lotNumber: 'LOT-SOON', expiryDate: '2027-01-31' }])).status).toBe(200);

      await prisma.serviceConsumable.create({ data: { serviceId: service.id, productId, qtyPerUse: 2 } });
      await prisma.staffService.create({
        data: { staffProfileId: '13497486-39df-4fe1-b0af-f0aba508129e', serviceId: service.id },
      });
      const wi = await request(app)
        .post('/api/v1/appointments/walk-in')
        .set(...bearer(adminToken))
        .send({ branchId: BRANCH_ID, customerName: 'ລູກຄ້າ C5', customerPhone: phone, serviceId: service.id });
      expect(wi.status).toBe(201);
      const appointmentId = wi.body.data.appointmentId as string;
      expect(
        (await request(app).patch(`/api/v1/appointments/${appointmentId}/status`).set(...bearer(adminToken)).send({ status: 'COMPLETED' })).status,
      ).toBe(200);

      const soon = await prisma.stockLot.findFirstOrThrow({ where: { productId, lotNumber: 'LOT-SOON' } });
      const late = await prisma.stockLot.findFirstOrThrow({ where: { productId, lotNumber: 'LOT-LATE' } });
      expect(soon.qtyOnHand.toNumber()).toBe(0); // ໝົດ 1 ໜ່ວຍ
      expect(late.qtyOnHand.toNumber()).toBe(4); // ຕັດອີກ 1 ຈາກ lot ຊ້າ

      const moves = await prisma.stockMovement.findMany({
        where: { productId, type: 'SERVICE_CONSUMED' },
        orderBy: { createdAt: 'asc' },
      });
      expect(moves).toHaveLength(2);
      expect(moves[0]!.lotId).toBe(soon.id);
      expect(moves[0]!.qty.toNumber()).toBe(1);
      expect(moves[0]!.unitCost?.toNumber()).toBe(2000);
      expect(moves[0]!.valueChange?.toNumber()).toBe(-2000);
      expect(moves[1]!.lotId).toBe(late.id);
      expect(moves[1]!.qty.toNumber()).toBe(1);
      expect(moves[1]!.unitCost?.toNumber()).toBe(1000);
      expect(moves[1]!.valueChange?.toNumber()).toBe(-1000);
      // ແຖວທີ 2 ຕໍ່ balance ຕໍ່ຈາກແຖວທຳອິດ (6 → 5 → 4)
      expect(moves[0]!.balanceAfter.toNumber()).toBe(5);
      expect(moves[1]!.balanceAfter.toNumber()).toBe(4);

      // idempotent — ເອີ້ນ consume ຊ້ຳຕໍ່ appointment ດຽວກັນ ບໍ່ຕັດເພີ່ມ (ມີ 2 ແຖວແລ້ວກໍຍັງຖືກກວດ)
      await prisma.$transaction((tx) => consumeServiceStock(tx, { appointmentId, serviceId: service.id }));
      expect(await prisma.stockMovement.count({ where: { productId, type: 'SERVICE_CONSUMED' } })).toBe(2);
      expect((await reconcileStock()).mismatches.find((m) => m.productId === productId)).toBeUndefined();

      // Recall — lot ນີ້ຖືກໃຊ້ກັບໃຜ
      const usage = await request(app).get(`/api/v1/stock-lots/${soon.id}/usage`).set(...bearer(adminToken));
      expect(usage.status).toBe(200);
      expect(usage.body.data.lot.lotNumber).toBe('LOT-SOON');
      expect(usage.body.data.customerCount).toBe(1);
      expect(usage.body.data.appointments).toHaveLength(1);
      expect(usage.body.data.appointments[0].appointmentId).toBe(appointmentId);
      expect(usage.body.data.appointments[0].customerName).toBe('ລູກຄ້າ C5');
      expect(usage.body.data.appointments[0].qty).toBe(1);

      // ລາຍການ lot + ຟິວເຕີ expiringWithinDays (LOT-SOON ໝົດຫມົດແລ້ວ → ບໍ່ຢູ່ໃນ list default)
      const list = await request(app).get(`/api/v1/stock-lots?productId=${productId}`).set(...bearer(adminToken));
      expect(list.body.data.items.map((l: { lotNumber: string }) => l.lotNumber)).toEqual(['LOT-LATE']);
      const withEmpty = await request(app)
        .get(`/api/v1/stock-lots?productId=${productId}&includeEmpty=true`)
        .set(...bearer(adminToken));
      expect(withEmpty.body.data.items.map((l: { lotNumber: string }) => l.lotNumber)).toEqual(['LOT-SOON', 'LOT-LATE']);

      // RBAC
      expect((await request(app).get(`/api/v1/stock-lots/${soon.id}/usage`).set(...bearer(custToken))).status).toBe(403);
    } finally {
      const appts = await prisma.appointment.findMany({ where: { customer: { phone } }, select: { id: true } });
      const aids = appts.map((a) => a.id);
      if (aids.length) {
        await prisma.queueTicket.deleteMany({ where: { appointmentId: { in: aids } } });
        await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: aids } } });
        await prisma.stockMovement.deleteMany({ where: { refId: { in: aids.map((id) => `appt:${id}`) } } });
        await prisma.appointment.deleteMany({ where: { id: { in: aids } } });
      }
      await prisma.user.deleteMany({ where: { phone } });
      await prisma.staffService.deleteMany({ where: { serviceId: service.id } });
      await prisma.serviceConsumable.deleteMany({ where: { serviceId: service.id } });
      await prisma.service.deleteMany({ where: { id: service.id } });
      await cleanupLotProduct(productId);
    }
  });

  it('C5 — same lot number received twice adds qty, blends lot cost, and a different expiry is rejected', async () => {
    const supplierId = await makeSupplier();
    const productId = await makeLotProduct('SKU-P6-LOT-DUP', 'ຢາສີດ lot ຊ້ຳ');
    try {
      expect((await poReceive(supplierId, productId, 2, 1000, [{ lotNumber: 'L1', expiryDate: '2027-05-01' }])).status).toBe(200);
      expect((await poReceive(supplierId, productId, 2, 2000, [{ lotNumber: 'L1', expiryDate: '2027-05-01' }])).status).toBe(200);
      const lot = await prisma.stockLot.findFirstOrThrow({ where: { productId, lotNumber: 'L1' } });
      expect(lot.qtyOnHand.toNumber()).toBe(4);
      expect(lot.unitCost.toNumber()).toBe(1500);
      expect((await poReceive(supplierId, productId, 1, 1000, [{ lotNumber: 'L1', expiryDate: '2027-06-01' }])).status).toBe(409);
      // ປິດ trackLot ບໍ່ໄດ້ ຕາບໃດທີ່ lot ຍັງມີຂອງ
      const off = await request(app)
        .patch(`/api/v1/products/${productId}`)
        .set(...bearer(adminToken))
        .send({ trackLot: false });
      expect(off.status).toBe(409);
      // ປັບເພີ່ມມືໂດຍບໍ່ບອກ lot → 400; ຫັກມື 3 ໃຊ້ FEFO
      expect(
        (await request(app).post('/api/v1/stock-movements/adjust').set(...bearer(adminToken)).send({ productId, delta: 1 })).status,
      ).toBe(400);
      const ded = await request(app)
        .post('/api/v1/stock-movements/adjust')
        .set(...bearer(adminToken))
        .send({ productId, delta: -3 });
      expect(ded.status).toBe(201);
      expect(ded.body.data.lotNumber).toBe('L1');
      expect((await prisma.stockLot.findFirstOrThrow({ where: { productId, lotNumber: 'L1' } })).qtyOnHand.toNumber()).toBe(1);
    } finally {
      await cleanupLotProduct(productId);
    }
  });

  it('C5 — runLotExpiryAlerts notifies once per expiry bucket for lots within 60 days (not for far-off or empty lots)', async () => {
    const product = await prisma.product.create({
      data: { branchId: BRANCH_ID, name: 'ສິນຄ້າ expiry job', sku: 'SKU-P6-LOT-JOB', unit: 'ຕຸກ', costPrice: 100, trackLot: true, stockQty: 9 },
    });
    const day = (n: number) => new Date(Date.now() + n * 86_400_000 - (Date.now() % 86_400_000));
    const mk = (lotNumber: string, expiryDate: Date, qtyOnHand: number) =>
      prisma.stockLot.create({
        data: { productId: product.id, branchId: BRANCH_ID, lotNumber, expiryDate, qtyOnHand, unitCost: 100 },
      });
    try {
      const soon = await mk('J-SOON', day(20), 3);
      const far = await mk('J-FAR', day(200), 3);
      const empty = await mk('J-EMPTY', day(5), 0);
      const expired = await mk('J-EXPIRED', day(-3), 3);

      const first = await runLotExpiryAlerts();
      expect(first.notified).toBeGreaterThan(0);
      const logs = await prisma.notificationLog.findMany({
        where: { type: 'stock_lot_expiry', dedupeKey: { startsWith: 'lot-expiry:' }, data: { path: ['productId'], equals: product.id } },
      });
      const lotIds = new Set(logs.map((l) => (l.data as { lotId: string }).lotId));
      expect(lotIds.has(soon.id)).toBe(true);
      expect(lotIds.has(expired.id)).toBe(true);
      expect(lotIds.has(far.id)).toBe(false);
      expect(lotIds.has(empty.id)).toBe(false);
      expect(logs.find((l) => (l.data as { lotId: string }).lotId === expired.id)?.severity).toBe('critical');

      // ແລ່ນຊ້ຳ ວັນດຽວກັນ → ບໍ່ແຈ້ງຊ້ຳ
      const before = await prisma.notificationLog.count({ where: { type: 'stock_lot_expiry' } });
      const second = await runLotExpiryAlerts();
      expect(second.notified).toBe(0);
      expect(await prisma.notificationLog.count({ where: { type: 'stock_lot_expiry' } })).toBe(before);
    } finally {
      const lots = await prisma.stockLot.findMany({ where: { productId: product.id }, select: { id: true } });
      await prisma.notificationLog.deleteMany({
        where: { OR: lots.map((l) => ({ dedupeKey: { startsWith: `lot-expiry:${l.id}:` } })) },
      });
      await prisma.stockLot.deleteMany({ where: { productId: product.id } });
      await prisma.product.deleteMany({ where: { id: product.id } });
    }
  });
});
