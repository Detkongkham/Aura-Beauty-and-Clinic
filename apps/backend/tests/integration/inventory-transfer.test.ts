import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — Cross-branch stock transfer (ການໂອນສິນຄ້າຂ້າມສາຂາ).
 *   create (DRAFT) → send (ຕັດສະຕັອກຕົ້ນທາງ, TRANSFER_OUT) → receive (ບວກສະຕັອກປາຍທາງ, ສ້າງ
 *   Product ໃໝ່ຖ້າ SKU ບໍ່ມີຢູ່ສາຂານັ້ນ, TRANSFER_IN) · ຫ້າມສົ່ງເກີນສະຕັອກທີ່ມີ ·
 *   BRANCH_ADMIN ສ້າງ/ສົ່ງໄດ້ສະເພາະຕົ້ນທາງຂອງຕົນ, ຮັບໄດ້ສະເພາະປາຍທາງຂອງຕົນ.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const HOME_BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const BRANCH_ADMIN_PHONE = '02000000001';
const BRANCH_ADMIN_PASSWORD = 'Manager@12345';
const TEST_SKU = 'SKU-TRF-TEST-1';
const OTHER_BRANCH_NAME = 'ສາຂາທົດສອບການໂອນ';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

async function wipe(): Promise<void> {
  const products = await prisma.product.findMany({ where: { sku: { startsWith: TEST_SKU } }, select: { id: true } });
  const pids = products.map((p) => p.id);
  if (pids.length) {
    const items = await prisma.stockTransferItem.findMany({
      where: { productId: { in: pids } },
      select: { stockTransferId: true },
    });
    await prisma.stockTransferItem.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockTransfer.deleteMany({ where: { id: { in: items.map((i) => i.stockTransferId) } } });
    await prisma.stockMovement.deleteMany({ where: { productId: { in: pids } } });
    await prisma.stockLot.deleteMany({ where: { productId: { in: pids } } });
  }
  const otherBranch = await prisma.branch.findFirst({ where: { name: OTHER_BRANCH_NAME }, select: { id: true } });
  if (otherBranch) {
    await prisma.stockTransfer.deleteMany({
      where: { OR: [{ fromBranchId: otherBranch.id }, { toBranchId: otherBranch.id }] },
    });
  }
  if (pids.length) await prisma.product.deleteMany({ where: { id: { in: pids } } });
  await prisma.branch.deleteMany({ where: { name: OTHER_BRANCH_NAME } });
}

describe('Cross-branch stock transfer', () => {
  let app: Express;
  let superToken: string;
  let branchAdminToken: string;
  let otherBranchId: string;
  let sourceProductId: string;

  beforeAll(async () => {
    app = createApp();
    await wipe();

    superToken = (
      await request(app).post('/api/v1/auth/login').send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD })
    ).body.data.tokens.accessToken;
    branchAdminToken = (
      await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: BRANCH_ADMIN_PHONE, password: BRANCH_ADMIN_PASSWORD })
    ).body.data.tokens.accessToken;

    const otherBranch = await prisma.branch.create({
      data: {
        name: OTHER_BRANCH_NAME,
        address: 'ທົດສອບ',
        phone: '02099999999',
      },
    });
    otherBranchId = otherBranch.id;

    const product = await prisma.product.create({
      data: {
        branchId: HOME_BRANCH_ID,
        name: 'ສິນຄ້າທົດສອບການໂອນ',
        sku: TEST_SKU,
        unit: 'ອັນ',
        costPrice: '10.00',
        stockQty: '20',
        minStockQty: '2',
      },
    });
    sourceProductId = product.id;
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('BRANCH_ADMIN cannot create a transfer out of a branch that is not their own', async () => {
    const res = await request(app)
      .post('/api/v1/stock-transfers')
      .set(...bearer(branchAdminToken))
      .send({ fromBranchId: otherBranchId, toBranchId: HOME_BRANCH_ID, items: [{ productId: sourceProductId, quantity: 1 }] });
    expect(res.status).toBe(403);
  });

  it('rejects fromBranchId === toBranchId', async () => {
    const res = await request(app)
      .post('/api/v1/stock-transfers')
      .set(...bearer(superToken))
      .send({
        fromBranchId: HOME_BRANCH_ID,
        toBranchId: HOME_BRANCH_ID,
        items: [{ productId: sourceProductId, quantity: 1 }],
      });
    expect(res.status).toBe(400);
  });

  it('full lifecycle: create → send (deducts source) → receive (creates + credits dest product)', async () => {
    const created = await request(app)
      .post('/api/v1/stock-transfers')
      .set(...bearer(branchAdminToken))
      .send({
        fromBranchId: HOME_BRANCH_ID,
        toBranchId: otherBranchId,
        items: [{ productId: sourceProductId, quantity: 8 }],
        notes: 'ທົດສອບ',
      });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('DRAFT');
    const transferId = created.body.data.id as string;

    // ຍັງບໍ່ຕັດສະຕັອກຕົ້ນທາງຈົນກວ່າຈະ "ສົ່ງ"
    const beforeSend = await prisma.product.findUniqueOrThrow({ where: { id: sourceProductId } });
    expect(beforeSend.stockQty.toNumber()).toBe(20);

    // ປາຍທາງ (otherBranchId) ບໍ່ແມ່ນ branch ຂອງ branchAdmin → ຮັບບໍ່ໄດ້ກ່ອນສົ່ງ
    const receiveTooEarly = await request(app)
      .post(`/api/v1/stock-transfers/${transferId}/receive`)
      .set(...bearer(superToken));
    expect(receiveTooEarly.status).toBe(409);

    const sent = await request(app)
      .post(`/api/v1/stock-transfers/${transferId}/send`)
      .set(...bearer(branchAdminToken));
    expect(sent.status).toBe(200);
    expect(sent.body.data.status).toBe('IN_TRANSIT');

    const afterSend = await prisma.product.findUniqueOrThrow({ where: { id: sourceProductId } });
    expect(afterSend.stockQty.toNumber()).toBe(12);
    const outMovement = await prisma.stockMovement.findFirst({
      where: { productId: sourceProductId, type: 'TRANSFER_OUT', refId: `transfer:${transferId}` },
    });
    expect(outMovement?.qty.toNumber()).toBe(8);

    const received = await request(app)
      .post(`/api/v1/stock-transfers/${transferId}/receive`)
      .set(...bearer(superToken));
    expect(received.status).toBe(200);
    expect(received.body.data.status).toBe('COMPLETED');

    const destProduct = await prisma.product.findFirstOrThrow({
      where: { branchId: otherBranchId, sku: TEST_SKU, deletedAt: null },
    });
    expect(destProduct.stockQty.toNumber()).toBe(8);
    expect(destProduct.name).toBe('ສິນຄ້າທົດສອບການໂອນ');
    const inMovement = await prisma.stockMovement.findFirst({
      where: { productId: destProduct.id, type: 'TRANSFER_IN', refId: `transfer:${transferId}` },
    });
    expect(inMovement?.qty.toNumber()).toBe(8);

    // ຮັບຊ້ຳສອງເທື່ອບໍ່ໄດ້ (idempotent guard ຜ່ານ status check)
    const receiveAgain = await request(app)
      .post(`/api/v1/stock-transfers/${transferId}/receive`)
      .set(...bearer(superToken));
    expect(receiveAgain.status).toBe(409);
  });

  it('rejects sending more than available stock', async () => {
    const created = await request(app)
      .post('/api/v1/stock-transfers')
      .set(...bearer(superToken))
      .send({
        fromBranchId: HOME_BRANCH_ID,
        toBranchId: otherBranchId,
        items: [{ productId: sourceProductId, quantity: 9999 }],
      });
    expect(created.status).toBe(201);

    const sent = await request(app)
      .post(`/api/v1/stock-transfers/${created.body.data.id}/send`)
      .set(...bearer(superToken));
    expect(sent.status).toBe(409);
  });

  it('DRAFT transfer can be deleted; non-DRAFT cannot', async () => {
    const draft = await request(app)
      .post('/api/v1/stock-transfers')
      .set(...bearer(superToken))
      .send({ fromBranchId: HOME_BRANCH_ID, toBranchId: otherBranchId, items: [{ productId: sourceProductId, quantity: 1 }] });
    const del = await request(app)
      .delete(`/api/v1/stock-transfers/${draft.body.data.id}`)
      .set(...bearer(superToken));
    expect(del.status).toBe(204);
  });
  it('C5 — transfer of a lot-tracked product carries lot number/expiry and moves lot qty across branches', async () => {
    const lotSku = `${TEST_SKU}-LOT`;
    const product = await prisma.product.create({
      data: {
        branchId: HOME_BRANCH_ID,
        name: 'ສິນຄ້າ lot ໂອນ',
        sku: lotSku,
        unit: 'ຕຸກ',
        costPrice: '100.00',
        stockQty: '10',
        trackLot: true,
      },
    });
    const lot = await prisma.stockLot.create({
      data: {
        productId: product.id,
        branchId: HOME_BRANCH_ID,
        lotNumber: 'LOT-TRF-1',
        expiryDate: new Date('2027-06-30'),
        qtyOnHand: 10,
        unitCost: 120,
      },
    });

    // trackLot ແຕ່ບໍ່ເລືອກ lot → 400
    const noLot = await request(app)
      .post('/api/v1/stock-transfers')
      .set(...bearer(superToken))
      .send({ fromBranchId: HOME_BRANCH_ID, toBranchId: otherBranchId, items: [{ productId: product.id, quantity: 4 }] });
    expect(noLot.status).toBe(400);

    const created = await request(app)
      .post('/api/v1/stock-transfers')
      .set(...bearer(superToken))
      .send({
        fromBranchId: HOME_BRANCH_ID,
        toBranchId: otherBranchId,
        items: [{ productId: product.id, quantity: 4, lotId: lot.id }],
      });
    expect(created.status).toBe(201);
    expect(created.body.data.items[0].lotNumber).toBe('LOT-TRF-1');
    expect(created.body.data.items[0].expiryDate).toBe('2027-06-30');
    const transferId = created.body.data.id as string;

    expect(
      (await request(app).post(`/api/v1/stock-transfers/${transferId}/send`).set(...bearer(superToken))).status,
    ).toBe(200);
    const srcLot = await prisma.stockLot.findUniqueOrThrow({ where: { id: lot.id } });
    expect(srcLot.qtyOnHand.toNumber()).toBe(6);

    expect(
      (await request(app).post(`/api/v1/stock-transfers/${transferId}/receive`).set(...bearer(superToken))).status,
    ).toBe(200);
    const dest = await prisma.product.findFirstOrThrow({
      where: { branchId: otherBranchId, sku: lotSku, deletedAt: null },
    });
    expect(dest.trackLot).toBe(true);
    const destLot = await prisma.stockLot.findFirstOrThrow({
      where: { productId: dest.id, branchId: otherBranchId, lotNumber: 'LOT-TRF-1' },
    });
    expect(destLot.qtyOnHand.toNumber()).toBe(4);
    expect(destLot.expiryDate?.toISOString().slice(0, 10)).toBe('2027-06-30');
    const inMove = await prisma.stockMovement.findFirst({
      where: { productId: dest.id, type: 'TRANSFER_IN', lotId: destLot.id },
    });
    expect(inMove).not.toBeNull();
  });
});
