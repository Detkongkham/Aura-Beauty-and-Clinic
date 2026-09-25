import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — Web Admin ▸ Branches + Branch Closures.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed` (seeded admin 02000000000 / Admin@12345).
 */
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const TEST_CODE = 'QA-BR-1';

describe('branches admin API', () => {
  let app: Express;
  let adminToken: string;
  let createdBranchId: string;
  let createdClosureId: string;

  beforeAll(async () => {
    app = createApp();
    await prisma.branchClosure.deleteMany({ where: { branch: { code: TEST_CODE } } });
    await prisma.branch.deleteMany({ where: { code: TEST_CODE } });
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    adminToken = login.body.data.tokens.accessToken as string;
  });

  afterAll(async () => {
    if (createdBranchId) {
      await prisma.branchClosure.deleteMany({ where: { branchId: createdBranchId } });
      await prisma.branch.deleteMany({ where: { id: createdBranchId } });
    }
    await prisma.$disconnect();
  });

  const bearer = (): [string, string] => ['Authorization', `Bearer ${adminToken}`];

  it('401 ໂດຍບໍ່ມີ token', async () => {
    const res = await request(app).get('/api/v1/branches');
    expect(res.status).toBe(401);
  });

  it('ດຶງລາຍການສາຂາ ພ້ອມ view fields ຄົບ', async () => {
    const res = await request(app).get('/api/v1/branches').set(...bearer());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);
    const b = res.body.data.items[0];
    expect(b).toMatchObject({ timezone: 'Asia/Vientiane' });
    expect(b).toHaveProperty('province');
    expect(b).toHaveProperty('openTime');
    expect(b).toHaveProperty('closeTime');
    expect(b).toHaveProperty('code');
  });

  it('ສ້າງສາຂາໃໝ່ + ແກ້ໄຂ', async () => {
    const create = await request(app)
      .post('/api/v1/branches')
      .set(...bearer())
      .send({
        name: 'QA Branch',
        code: TEST_CODE,
        address: '123 QA Rd',
        phone: '02011112222',
        province: 'louangprabang',
        openTime: '08:30',
        closeTime: '19:00',
      });
    expect(create.status).toBe(201);
    expect(create.body.data).toMatchObject({
      code: TEST_CODE,
      province: 'louangprabang',
      openTime: '08:30',
      timezone: 'Asia/Vientiane',
    });
    createdBranchId = create.body.data.id as string;

    const patch = await request(app)
      .patch(`/api/v1/branches/${createdBranchId}`)
      .set(...bearer())
      .send({ isActive: false, closeTime: '18:00' });
    expect(patch.status).toBe(200);
    expect(patch.body.data).toMatchObject({ isActive: false, closeTime: '18:00' });
  });

  it('409 ເມື່ອລະຫັດສາຂາຊ້ຳ', async () => {
    const res = await request(app)
      .post('/api/v1/branches')
      .set(...bearer())
      .send({ name: 'Dup', code: TEST_CODE });
    expect(res.status).toBe(409);
  });

  it('ເພີ່ມ / ດຶງ / ລຶບ ວັນປິດຮ້ານ (branch-scoped + ທົ່ວບໍລິສັດ)', async () => {
    const add = await request(app)
      .post('/api/v1/branch-closures')
      .set(...bearer())
      .send({ branchId: createdBranchId, date: '2027-01-01', reason: 'ປີໃໝ່ສາກົນ' });
    expect(add.status).toBe(201);
    expect(add.body.data).toMatchObject({ date: '2027-01-01', branchId: createdBranchId });
    createdClosureId = add.body.data.id as string;

    const dup = await request(app)
      .post('/api/v1/branch-closures')
      .set(...bearer())
      .send({ branchId: createdBranchId, date: '2027-01-01', reason: 'again' });
    expect(dup.status).toBe(409);

    const all = await request(app)
      .post('/api/v1/branch-closures')
      .set(...bearer())
      .send({ branchId: 'all', date: '2027-04-14', reason: 'ປີໃໝ່ລາວ' });
    expect(all.status).toBe(201);
    expect(all.body.data.branchId).toBe('all');
    await request(app).delete(`/api/v1/branch-closures/${all.body.data.id}`).set(...bearer());

    const list = await request(app).get('/api/v1/branch-closures').set(...bearer());
    expect(list.status).toBe(200);
    expect(list.body.data.items.some((c: { id: string }) => c.id === createdClosureId)).toBe(true);

    const del = await request(app)
      .delete(`/api/v1/branch-closures/${createdClosureId}`)
      .set(...bearer());
    expect(del.status).toBe(204);
  });

  it('insights: ຕົວຊີ້ວັດຕໍ່ສາຂາ + validate days', async () => {
    const res = await request(app).get('/api/v1/branches/insights?days=7').set(...bearer());
    expect(res.status).toBe(200);
    expect(res.body.data.days).toBe(7);
    const mine = res.body.data.items.find((i: { branchId: string }) => i.branchId === createdBranchId);
    expect(mine).toBeDefined();
    expect(mine.period.daily).toHaveLength(7);
    expect(mine).toMatchObject({ staffCount: 0, upcomingAppointments: 0, rating: { avg: null, count: 0 } });
    expect(mine.today.utilization).toBeNull();

    const bad = await request(app).get('/api/v1/branches/insights?days=12').set(...bearer());
    expect(bad.status).toBe(400);
  });

  it('amenities round-trip ແລະ ຄ່າທີ່ບໍ່ຮູ້ຈັກ → 400', async () => {
    const ok = await request(app)
      .patch(`/api/v1/branches/${createdBranchId}`)
      .set(...bearer())
      .send({ amenities: ['wifi', 'parking'], email: 'qa@aura.la' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ amenities: ['wifi', 'parking'], email: 'qa@aura.la' });
    const bad = await request(app)
      .patch(`/api/v1/branches/${createdBranchId}`)
      .set(...bearer())
      .send({ amenities: ['pool'] });
    expect(bad.status).toBe(400);
  });

  it('ປິດສາຂາທີ່ມີນັດຈະມາເຖິງ → 409 ຈົນກວ່າຈະ force', async () => {
    await request(app).patch(`/api/v1/branches/${createdBranchId}`).set(...bearer()).send({ isActive: true });
    const [customer, staffProfile, service] = await Promise.all([
      prisma.user.findFirstOrThrow({ where: { role: 'CUSTOMER' }, select: { id: true } }),
      prisma.staffProfile.findFirstOrThrow({ select: { id: true } }),
      prisma.service.findFirstOrThrow({ select: { id: true } }),
    ]);
    const tpl = { customerId: customer.id, staffProfileId: staffProfile.id, serviceId: service.id };
    const start = new Date(Date.now() + 3 * 24 * 3600_000);
    const appt = await prisma.appointment.create({
      data: {
        ...tpl,
        branchId: createdBranchId,
        startAt: start,
        endAt: new Date(start.getTime() + 3600_000),
        status: 'CONFIRMED',
        totalAmount: 100000,
      },
    });
    try {
      const blocked = await request(app)
        .patch(`/api/v1/branches/${createdBranchId}`)
        .set(...bearer())
        .send({ isActive: false });
      expect(blocked.status).toBe(409);

      const ins = await request(app).get('/api/v1/branches/insights').set(...bearer());
      const mine = ins.body.data.items.find((i: { branchId: string }) => i.branchId === createdBranchId);
      expect(mine.upcomingAppointments).toBe(1);

      const forced = await request(app)
        .patch(`/api/v1/branches/${createdBranchId}`)
        .set(...bearer())
        .send({ isActive: false, force: true });
      expect(forced.status).toBe(200);
      expect(forced.body.data.isActive).toBe(false);
    } finally {
      await prisma.appointment.delete({ where: { id: appt.id } });
    }
  });

  it('BRANCH_ADMIN: ແກ້ ແລະ ເບິ່ງ insights ໄດ້ສະເພາະສາຂາຕົນ', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: '02000000001', password: 'Manager@12345' });
    const managerBearer: [string, string] = ['Authorization', `Bearer ${login.body.data.tokens.accessToken}`];

    const cross = await request(app)
      .patch(`/api/v1/branches/${createdBranchId}`)
      .set(...managerBearer)
      .send({ closeTime: '17:00' });
    expect(cross.status).toBe(403);

    const ins = await request(app).get('/api/v1/branches/insights').set(...managerBearer);
    expect(ins.status).toBe(200);
    expect(ins.body.data.items).toHaveLength(1);
    expect(ins.body.data.items[0].branchId).not.toBe(createdBranchId);

    const closure = await request(app)
      .post('/api/v1/branch-closures')
      .set(...managerBearer)
      .send({ branchId: 'all', date: '2027-05-01', reason: 'x' });
    expect(closure.status).toBe(403);
  });
});
