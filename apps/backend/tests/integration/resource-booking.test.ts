import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — room/equipment chosen at booking must belong to the booking branch and be in service
 * (7C.1 debt: admin booking form now has a resource picker). ຕ້ອງມີ PostgreSQL (.env.test) + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const HAIRCUT_ID = '33333333-0000-0000-0000-000000000001';
const CUST_PHONE = '02088870001';
const OTHER_BRANCH = 'ສາຂາທົດສອບ resource-booking';
const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

let app: Express;
let custToken = '';


async function wipe() {
  await prisma.appointment.deleteMany({ where: { customer: { phone: CUST_PHONE } } });
  await prisma.user.deleteMany({ where: { phone: CUST_PHONE } });
  await prisma.room.deleteMany({ where: { name: { startsWith: 'QA-RB ' } } });
  await prisma.branch.deleteMany({ where: { name: OTHER_BRANCH } });
}

beforeAll(async () => {
  app = createApp();
  await wipe();
  const reg = await request(app).post('/api/v1/auth/register').send({ name: 'RB QA', phone: CUST_PHONE, password: 'Passw0rd!' });
  custToken = reg.body.data.tokens.accessToken;
});

afterAll(async () => {
  await wipe();
  await prisma.$disconnect();
});

describe('booking with a room', () => {
  it('rejects a room from another branch or one that is out of service', async () => {
    const other = await prisma.branch.create({ data: { name: OTHER_BRANCH, address: 'x', phone: '02000000996' } });
    const foreignRoom = await prisma.room.create({ data: { branchId: other.id, name: 'QA-RB foreign' } });
    const closedRoom = await prisma.room.create({ data: { branchId: BRANCH_ID, name: 'QA-RB closed', isAvailable: false } });
    const openRoom = await prisma.room.create({ data: { branchId: BRANCH_ID, name: 'QA-RB open' } });

    // First day in the next two weeks that has an open slot (days off / closures vary with the seed).
    let slot: { staffProfileId: string; startAt: string } | undefined;
    for (let d = 3; d < 17 && !slot; d += 1) {
      const date = new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);
      const avail = await request(app)
        .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${HAIRCUT_ID}&date=${date}`)
        .set(...bearer(custToken));
      slot = (avail.body.data?.slots as Array<{ staffProfileId: string; startAt: string }> | undefined)?.[0];
    }
    if (!slot) throw new Error('no open slot in the next two weeks');
    const s = slot;
    const book = (roomId: string) =>
      request(app)
        .post('/api/v1/booking/appointments/me')
        .set(...bearer(custToken))
        .send({ branchId: BRANCH_ID, serviceId: HAIRCUT_ID, staffProfileId: s.staffProfileId, startAt: s.startAt, roomId });

    expect((await book(foreignRoom.id)).status).toBe(400);
    expect((await book(closedRoom.id)).status).toBe(409);
    expect((await book(openRoom.id)).status).toBe(201);
  });
});
