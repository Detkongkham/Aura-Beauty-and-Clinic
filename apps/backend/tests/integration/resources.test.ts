import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — Phase 7C Multi-Resource Allocation (Module 17).
 *   `Room`/`Equipment` CRUD (SUPER_ADMIN/BRANCH_ADMIN) + branch validation + delete-blocked-when-in-use +
 *   RBAC (CUSTOMER → 403 on writes, GET allowed to any logged-in role).
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const HAIRCUT_ID = '33333333-0000-0000-0000-000000000001';
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const CUST_PHONE = '02088830099';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

async function wipe(): Promise<void> {
  await prisma.appointment.deleteMany({ where: { customer: { phone: CUST_PHONE } } });
  await prisma.user.deleteMany({ where: { phone: CUST_PHONE } });
  await prisma.room.deleteMany({ where: { name: { startsWith: 'QA ' } } });
  await prisma.equipment.deleteMany({ where: { code: { startsWith: 'QA-' } } });
}

describe('Phase 7C — Multi-Resource Allocation (Rooms & Equipment)', () => {
  let app: Express;
  let adminToken: string;
  let custToken: string;

  beforeAll(async () => {
    app = createApp();
    await wipe();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    adminToken = login.body.data.tokens.accessToken as string;

    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Resources QA', phone: CUST_PHONE, password: 'Passw0rd!' });
    custToken = reg.body.data.tokens.accessToken as string;
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('CUSTOMER ບໍ່ມີສິດສ້າງ room/equipment → 403 (ແຕ່ GET ເຫັນໄດ້)', async () => {
    const create = await request(app)
      .post('/api/v1/resources/rooms')
      .set(...bearer(custToken))
      .send({ branchId: BRANCH_ID, name: 'QA ຫ້ອງ 1' });
    expect(create.status).toBe(403);

    const list = await request(app).get('/api/v1/resources/rooms').set(...bearer(custToken));
    expect(list.status).toBe(200);
  });

  it('admin CRUD ຮອບເຕັມ — Room', async () => {
    const create = await request(app)
      .post('/api/v1/resources/rooms')
      .set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, name: 'QA ຫ້ອງ 1' });
    expect(create.status).toBe(201);
    const roomId = create.body.data.id as string;
    expect(create.body.data.branchName).toBeTruthy();

    const list = await request(app)
      .get(`/api/v1/resources/rooms?branchId=${BRANCH_ID}`)
      .set(...bearer(adminToken));
    expect(list.status).toBe(200);
    expect((list.body.data as Array<{ id: string }>).some((r) => r.id === roomId)).toBe(true);

    const update = await request(app)
      .patch(`/api/v1/resources/rooms/${roomId}`)
      .set(...bearer(adminToken))
      .send({ isAvailable: false });
    expect(update.status).toBe(200);
    expect(update.body.data.isAvailable).toBe(false);

    const del = await request(app)
      .delete(`/api/v1/resources/rooms/${roomId}`)
      .set(...bearer(adminToken));
    expect(del.status).toBe(200);
  });

  it('ສ້າງ room ບໍ່ຖືກ ຖ້າ branchId ບໍ່ຖືກຕ້ອງ → 400', async () => {
    const res = await request(app)
      .post('/api/v1/resources/rooms')
      .set(...bearer(adminToken))
      .send({ branchId: '99999999-9999-9999-9999-999999999999', name: 'QA ຫ້ອງຜີ' });
    expect(res.status).toBe(400);
  });

  it('ລຶບ room ບໍ່ໄດ້ຖ້າຍັງມີນັດໝາຍໃຊ້ຢູ່ → 409', async () => {
    const room = await request(app)
      .post('/api/v1/resources/rooms')
      .set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, name: 'QA ຫ້ອງໃຊ້ຢູ່' });
    const roomId = room.body.data.id as string;

    const avail = await request(app)
      .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${HAIRCUT_ID}&date=${futureDate()}`)
      .set(...bearer(custToken));
    const slot = (avail.body.data.slots as Array<{ staffProfileId: string; startAt: string }>)[0]!;

    const booked = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...bearer(custToken))
      .send({
        branchId: BRANCH_ID,
        serviceId: HAIRCUT_ID,
        staffProfileId: slot.staffProfileId,
        startAt: slot.startAt,
        roomId,
      });
    expect(booked.status).toBe(201);

    const del = await request(app)
      .delete(`/api/v1/resources/rooms/${roomId}`)
      .set(...bearer(adminToken));
    expect(del.status).toBe(409);
  });

  it('admin CRUD ຮອບເຕັມ — Equipment (+ ລະຫັດຊ້ຳ → 409)', async () => {
    const create = await request(app)
      .post('/api/v1/resources/equipment')
      .set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, name: 'QA ເຄື່ອງໜຶ່ງ', code: 'QA-EQ-1' });
    expect(create.status).toBe(201);
    const equipmentId = create.body.data.id as string;

    const dup = await request(app)
      .post('/api/v1/resources/equipment')
      .set(...bearer(adminToken))
      .send({ branchId: BRANCH_ID, name: 'QA ເຄື່ອງສອງ', code: 'QA-EQ-1' });
    expect(dup.status).toBe(409);

    const del = await request(app)
      .delete(`/api/v1/resources/equipment/${equipmentId}`)
      .set(...bearer(adminToken));
    expect(del.status).toBe(200);
  });
});

/** ວັນທີ UTC ຖັດໄປ 5 ມື້ (ຫຼີກລ່ຽງບໍ່ໃຫ້ຄາບກັບ slot ທີ່ test ອື່ນອາດຈອງໄວ້ມື້ນີ້). */
function futureDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 5);
  return d.toISOString().slice(0, 10);
}
