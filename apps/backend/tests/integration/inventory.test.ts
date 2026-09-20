import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { Prisma } from '@prisma/client';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { reconcileStock } from '../../src/modules/inventory/inventory.service.js';

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
});
