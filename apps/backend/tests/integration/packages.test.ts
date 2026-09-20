import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { reminderQueue, waitlistQueue } from '../../src/jobs/queues.js';

/**
 * Integration — ລູກຄ້າຊື້ແພັກເກັດເອງ:
 *   list → purchase (PENDING_PAYMENT, idempotent bill) → ຈອງດ້ວຍສິດກ່ອນຈ່າຍ = ປະຕິເສດ
 *   → QR settle → ACTIVE → ຈອງດ້ວຍສິດ (ບໍ່ເກັບເງິນ, ຕັດ 1 ຄັ້ງ) → ຍົກເລີກ = ຄືນສິດ
 *   → ຄົນອື່ນໃຊ້ສິດບໍ່ໄດ້ → ຍົກເລີກການຊື້ທີ່ຄ້າງຈ່າຍ.
 * ຕ້ອງມີ PostgreSQL (abcp_test) + `prisma migrate deploy` + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SERVICE_ID = '33333333-0000-0000-0000-000000000001';
/** ແພັກເກັດຂອງ test ເອງ (ບໍ່ອີງ seed) — ລຶບຄືນໃນ afterAll. */
const PACKAGE_ID = '99999999-0000-0000-0000-0000000000a1';
const PACKAGE_2_ID = '99999999-0000-0000-0000-0000000000a2';
const SERVICE_2_ID = '33333333-0000-0000-0000-000000000002';
const PHONE = '02088890901';
const OTHER_PHONE = '02088890902';

const idem = (): [string, string] => ['Idempotency-Key', randomUUID()];

function futureWorkingDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(0, 0, 0, 0);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function seedPackages(): Promise<void> {
  const defs = [
    { id: PACKAGE_ID, name: 'QA ຄອສ 5 ຄັ້ງ', totalPrice: 500000, items: [{ serviceId: SERVICE_ID, totalUnits: 5 }] },
    { id: PACKAGE_2_ID, name: 'QA ຄອສ 2', totalPrice: 300000, items: [{ serviceId: SERVICE_2_ID, totalUnits: 1 }] },
  ];
  for (const d of defs) {
    await prisma.package.upsert({
      where: { id: d.id },
      update: { isActive: true, totalPrice: d.totalPrice },
      create: {
        id: d.id,
        branchId: BRANCH_ID,
        name: d.name,
        totalPrice: d.totalPrice,
        validityDays: 180,
        items: { create: d.items },
      },
    });
  }
}

async function dropPackages(): Promise<void> {
  const ids = [PACKAGE_ID, PACKAGE_2_ID];
  await prisma.userPackage.deleteMany({ where: { packageId: { in: ids } } });
  await prisma.packageItem.deleteMany({ where: { packageId: { in: ids } } });
  await prisma.package.deleteMany({ where: { id: { in: ids } } });
}

async function wipe(phone: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
  if (!user) return;
  const appts = await prisma.appointment.findMany({ where: { customerId: user.id }, select: { id: true } });
  const apptIds = appts.map((a) => a.id);
  if (apptIds.length) {
    await prisma.paymentTransaction.deleteMany({ where: { payment: { appointmentId: { in: apptIds } } } });
    await prisma.payment.deleteMany({ where: { appointmentId: { in: apptIds } } });
    await prisma.queueTicket.deleteMany({ where: { appointmentId: { in: apptIds } } });
    await prisma.appointment.deleteMany({ where: { id: { in: apptIds } } });
  }
  const ups = await prisma.userPackage.findMany({
    where: { userId: user.id },
    select: { id: true, purchasePaymentId: true },
  });
  if (ups.length) {
    await prisma.userPackage.deleteMany({ where: { id: { in: ups.map((u) => u.id) } } });
    const payIds = ups.map((u) => u.purchasePaymentId).filter((x): x is string => !!x);
    await prisma.paymentTransaction.deleteMany({ where: { paymentId: { in: payIds } } });
    await prisma.payment.deleteMany({ where: { id: { in: payIds } } });
  }
  const acc = await prisma.loyaltyAccount.findUnique({ where: { userId: user.id } });
  if (acc) {
    await prisma.loyaltyTransaction.deleteMany({ where: { loyaltyAccountId: acc.id } });
    await prisma.loyaltyAccount.delete({ where: { id: acc.id } });
  }
  await prisma.notificationLog.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

describe('packages — customer self-purchase + redemption', () => {
  let app: Express;
  let token: string;
  let otherToken: string;

  const auth = (tk = token): [string, string] => ['Authorization', `Bearer ${tk}`];

  beforeAll(async () => {
    app = createApp();
    vi.spyOn(reminderQueue, 'add').mockResolvedValue({ id: 'job' } as never);
    vi.spyOn(waitlistQueue, 'add').mockResolvedValue({ id: 'job' } as never);
    await wipe(PHONE);
    await wipe(OTHER_PHONE);
    await seedPackages();
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Package QA', phone: PHONE, password: 'Passw0rd!' });
    token = reg.body.data.tokens.accessToken as string;
    const reg2 = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Package QA 2', phone: OTHER_PHONE, password: 'Passw0rd!' });
    otherToken = reg2.body.data.tokens.accessToken as string;
  });

  afterAll(async () => {
    await wipe(PHONE);
    await wipe(OTHER_PHONE);
    await dropPackages();
    vi.restoreAllMocks();
    await prisma.$disconnect();
  });

  it('purchase → pay → book with credit → cancel restores', async () => {
    const list = await request(app)
      .get(`/api/v1/packages?branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}`)
      .set(...auth());
    expect(list.status).toBe(200);
    const pkg = list.body.data.find((p: { id: string }) => p.id === PACKAGE_ID);
    expect(pkg).toBeTruthy();
    expect(pkg.totalSessions).toBe(5);
    expect(pkg.valuePrice).toBeGreaterThan(0);
    // ຊ່ອງທີ່ໜ້າຮ້ານໃນແອັບໃຊ້ວາງລຳດັບ/ປ້າຍ
    expect(pkg.perSessionPrice).toBe(Math.round(pkg.totalPrice / pkg.totalSessions));
    expect(pkg.savingsPct).toBe(Math.round((pkg.savings / pkg.valuePrice) * 100));
    expect(typeof pkg.activeHolders).toBe('number');

    const bought = await request(app)
      .post(`/api/v1/packages/${PACKAGE_ID}/purchase`)
      .set(...auth())
      .set(...idem())
      .send({});
    expect(bought.status).toBe(201);
    const paymentId = bought.body.data.paymentId as string;
    expect(bought.body.data.amount).toBe(pkg.totalPrice);

    // ກົດຊື້ຊ້ຳ → ບິນເກົ່າ
    const again = await request(app)
      .post(`/api/v1/packages/${PACKAGE_ID}/purchase`)
      .set(...auth())
      .set(...idem())
      .send({});
    expect(again.body.data.paymentId).toBe(paymentId);

    let mine = await request(app).get('/api/v1/packages/me').set(...auth());
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0].status).toBe('PENDING_PAYMENT');
    expect(mine.body.data[0].paymentId).toBe(paymentId);
    const itemId = mine.body.data[0].items[0].id as string;

    const date = futureWorkingDate(45);
    const avail = await request(app)
      .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&date=${date}`)
      .set(...auth());
    const slot = avail.body.data.slots[0] as { staffProfileId: string; startAt: string };
    const bookBody = {
      branchId: BRANCH_ID,
      serviceId: SERVICE_ID,
      staffProfileId: slot.staffProfileId,
      startAt: slot.startAt,
      userPackageItemId: itemId,
    };

    // ຍັງບໍ່ຈ່າຍ → ໃຊ້ສິດບໍ່ໄດ້
    const early = await request(app).post('/api/v1/booking/appointments/me').set(...auth()).send(bookBody);
    expect(early.status).toBe(400);

    // ລູກຄ້າບັນທຶກເງິນສົດເອງບໍ່ໄດ້ (ກັນ activate ຟຣີ)
    const selfCash = await request(app)
      .post(`/api/v1/payments/${paymentId}/tenders`)
      .set(...auth())
      .set(...idem())
      .send({ tenders: [{ method: 'CASH', amount: pkg.totalPrice }] });
    expect(selfCash.status).toBe(403);

    // ຈ່າຍຜ່ານ QR
    const intent = await request(app)
      .post(`/api/v1/payments/${paymentId}/deposit-intent`)
      .set(...auth())
      .set(...idem())
      .send({ method: 'BCEL_ONE_QR' });
    expect(intent.status).toBe(200);
    expect(intent.body.data.amount).toBe(pkg.totalPrice);
    const settled = await request(app)
      .post(`/api/v1/payments/${paymentId}/settle-mock`)
      .set(...auth())
      .set(...idem())
      .send({ qrReference: intent.body.data.qrReference });
    expect(settled.status).toBe(200);
    expect(settled.body.data.paymentStatus).toBe('FULLY_PAID');

    mine = await request(app).get('/api/v1/packages/me').set(...auth());
    expect(mine.body.data[0].status).toBe('ACTIVE');
    expect(mine.body.data[0].remainingSessions).toBe(5);
    expect(mine.body.data[0].usedSessions).toBe(0);
    expect(mine.body.data[0].validityDays).toBe(180);
    expect(mine.body.data[0].daysLeft).toBeGreaterThan(170);
    const userPackageId = mine.body.data[0].id as string;

    // ຍັງບໍ່ໄດ້ຈອງ → ປະຫວັດການໃຊ້ວ່າງ; ຄົນອື່ນເບິ່ງບໍ່ໄດ້
    const emptyUsage = await request(app)
      .get(`/api/v1/packages/me/${userPackageId}/usage`)
      .set(...auth());
    expect(emptyUsage.status).toBe(200);
    expect(emptyUsage.body.data).toHaveLength(0);
    const foreignUsage = await request(app)
      .get(`/api/v1/packages/me/${userPackageId}/usage`)
      .set(...auth(otherToken));
    expect(foreignUsage.status).toBe(404);

    // ຄົນອື່ນໃຊ້ສິດຂອງເຮົາບໍ່ໄດ້
    const stolen = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...auth(otherToken))
      .send(bookBody);
    expect(stolen.status).toBe(400);

    // ຈອງດ້ວຍສິດ → ບໍ່ເກັບເງິນ + ຕັດ 1
    const booked = await request(app).post('/api/v1/booking/appointments/me').set(...auth()).send(bookBody);
    expect(booked.status).toBe(201);
    const appointmentId = booked.body.data.id as string;
    const appt = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: { totalAmount: true, userPackageItemId: true },
    });
    expect(appt?.totalAmount.toNumber()).toBe(0);
    expect(appt?.userPackageItemId).toBe(itemId);
    mine = await request(app).get('/api/v1/packages/me').set(...auth());
    expect(mine.body.data[0].remainingSessions).toBe(4);
    expect(mine.body.data[0].usedSessions).toBe(1);

    // ປະຫວັດການໃຊ້ສິດ = ນັດທີ່ຕັດຄັ້ງ
    const usage = await request(app)
      .get(`/api/v1/packages/me/${userPackageId}/usage`)
      .set(...auth());
    expect(usage.status).toBe(200);
    expect(usage.body.data).toHaveLength(1);
    expect(usage.body.data[0].appointmentId).toBe(appointmentId);
    expect(usage.body.data[0].serviceId).toBe(SERVICE_ID);
    expect(usage.body.data[0].returned).toBe(false);

    // ຍົກເລີກ → ຄືນສິດ
    const cancelled = await request(app)
      .patch(`/api/v1/booking/appointments/${appointmentId}/cancel`)
      .set(...auth())
      .send({});
    expect(cancelled.status).toBe(200);
    mine = await request(app).get('/api/v1/packages/me').set(...auth());
    expect(mine.body.data[0].remainingSessions).toBe(5);

    // ຍົກເລີກແລ້ວ → ແຖວປະຫວັດຍັງຢູ່ ແຕ່ໝາຍວ່າຄືນສິດ
    const afterCancel = await request(app)
      .get(`/api/v1/packages/me/${userPackageId}/usage`)
      .set(...auth());
    expect(afterCancel.body.data).toHaveLength(1);
    expect(afterCancel.body.data[0].returned).toBe(true);
    expect(afterCancel.body.data[0].status).toBe('CANCELLED');
  });

  it('cancel a pending purchase', async () => {
    const bought = await request(app)
      .post(`/api/v1/packages/${PACKAGE_2_ID}/purchase`)
      .set(...auth())
      .set(...idem())
      .send({});
    expect(bought.status).toBe(201);

    const del = await request(app)
      .delete(`/api/v1/packages/me/${bought.body.data.userPackageId}`)
      .set(...auth());
    expect(del.status).toBe(204);

    const mine = await request(app).get('/api/v1/packages/me').set(...auth());
    expect(mine.body.data.some((u: { packageId: string }) => u.packageId === PACKAGE_2_ID)).toBe(false);

    // ຄົນອື່ນເບິ່ງ/ຈ່າຍບິນຂອງເຮົາບໍ່ໄດ້
    const peek = await request(app)
      .get(`/api/v1/payments/${bought.body.data.paymentId}`)
      .set(...auth(otherToken));
    expect(peek.status).toBe(403);
  });

  it('admin-only create', async () => {
    const res = await request(app)
      .post('/api/v1/packages')
      .set(...auth())
      .send({ branchId: BRANCH_ID, name: 'x', totalPrice: 1, items: [{ serviceId: SERVICE_ID, totalUnits: 1 }] });
    expect(res.status).toBe(403);
  });
});
