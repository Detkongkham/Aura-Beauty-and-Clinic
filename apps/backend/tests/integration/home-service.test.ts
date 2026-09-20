import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { haversineMeters } from '../../src/utils/geo.js';
import { computeTravelFee } from '../../src/modules/home-service/home-service.service.js';

/**
 * Integration — Phase 7B Home Service auto-dispatch + travel fee (Module 29).
 *   HOME_SERVICE booking → ຈັບຄູ່ຊ່າງທີ່ໃກ້ທີ່ສຸດ + HomeServiceTrip + travelFee ຄິດຖືກຕ້ອງ ·
 *   ບໍ່ມີຊ່າງວ່າງ → 409 NO_STYLIST_AVAILABLE · ຊ່າງ 2 ຄົນ → ໃກ້ກວ່າຊະນະ ·
 *   RBAC: STAFF-only ແລະ admin-only endpoints · ການເຂົ້າເຖິງ trip view (ເຈົ້າຂອງ / ຊ່າງ / admin ເທົ່ານັ້ນ).
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const HAIRCUT_ID = '33333333-0000-0000-0000-000000000001'; // 120000, 45 ນາທີ
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const STYLIST_PHONE = '02055500001'; // seed — ຊ່າງຜົມອາວຸໂສ, ໃກ້ສາຂາ
const CUSTOMER_PHONE = '02088870001';
const OTHER_CUSTOMER_PHONE = '02088870002';
const FAR_STAFF_PHONE = '02088870009';

// ຈຸດໝາຍ ~2.4km ຈາກຊ່າງທີ່ seed ໄວ້ (17.977, 102.634).
const DEST_LAT = 17.995;
const DEST_LNG = 102.65;

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

/** ວັນພຸດ (dow 3) ຫ່າງໄກອະນາຄົດ ເພື່ອຫຼີກລ່ຽງການຊ້ອນກັບ test suite ອື່ນ. */
function futureWednesday(weeksAhead: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + weeksAhead * 7);
  d.setUTCHours(0, 0, 0, 0);
  while (d.getUTCDay() !== 3) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { phone: { in: [CUSTOMER_PHONE, OTHER_CUSTOMER_PHONE, FAR_STAFF_PHONE] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);

  if (ids.length) {
    const appts = await prisma.appointment.findMany({
      where: { customerId: { in: ids } },
      select: { id: true },
    });
    const aids = appts.map((a) => a.id);
    if (aids.length) {
      await prisma.homeServiceTrip.deleteMany({ where: { appointmentId: { in: aids } } });
      await prisma.staffCommission.deleteMany({ where: { appointmentId: { in: aids } } });
    }
    await prisma.appointment.deleteMany({ where: { customerId: { in: ids } } });
  }

  const farStaff = await prisma.staffProfile.findFirst({
    where: { user: { phone: FAR_STAFF_PHONE } },
    select: { id: true },
  });
  if (farStaff) {
    await prisma.workingHour.deleteMany({ where: { staffProfileId: farStaff.id } });
    await prisma.staffService.deleteMany({ where: { staffProfileId: farStaff.id } });
    await prisma.staffBranch.deleteMany({ where: { staffProfileId: farStaff.id } });
    await prisma.staffProfile.deleteMany({ where: { id: farStaff.id } });
  }

  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

describe('Phase 7B — Home Service auto-dispatch (Module 29)', () => {
  let app: Express;
  let adminToken: string;
  let stylistToken: string;
  let stylistProfileId: string;
  let customerToken: string;
  let otherCustomerToken: string;

  beforeAll(async () => {
    app = createApp();
    await cleanup();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    adminToken = login.body.data.tokens.accessToken as string;

    const stylistLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: STYLIST_PHONE, password: 'Staff@12345' });
    stylistToken = stylistLogin.body.data.tokens.accessToken as string;

    const stylist = await prisma.staffProfile.findFirstOrThrow({
      where: { user: { phone: STYLIST_PHONE } },
      select: { id: true },
    });
    stylistProfileId = stylist.id;
    // ຢືນຢັນສະຖານະຮັບວຽກ + ຄວາມສົດຂອງພິກັດ (freshness window 15 ນາທີ) ບໍ່ອີງໃສ່ເວລາທີ່ seed ໄວ້.
    await prisma.staffProfile.update({
      where: { id: stylistProfileId },
      data: {
        isHomeServiceAvailable: true,
        lastKnownLatitude: 17.977,
        lastKnownLongitude: 102.634,
        lastLocationAt: new Date(),
      },
    });

    const c = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Home Service QA', phone: CUSTOMER_PHONE, password: 'Passw0rd!' });
    customerToken = c.body.data.tokens.accessToken as string;

    const o = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Other Customer QA', phone: OTHER_CUSTOMER_PHONE, password: 'Passw0rd!' });
    otherCustomerToken = o.body.data.tokens.accessToken as string;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  function bookingBody(startAt: Date): Record<string, unknown> {
    return {
      branchId: BRANCH_ID,
      serviceId: HAIRCUT_ID,
      startAt: startAt.toISOString(),
      deliveryType: 'HOME_SERVICE',
      homeAddress: 'ບ້ານທົດສອບ, ວຽງຈັນ',
      destLatitude: DEST_LAT,
      destLongitude: DEST_LNG,
    };
  }

  it('STAFF PATCH availability — CUSTOMER = 403', async () => {
    const res = await request(app)
      .patch('/api/v1/home-service/staff/availability')
      .set(...bearer(customerToken))
      .send({ isAvailable: true });
    expect(res.status).toBe(403);
  });

  it('GET/PATCH /home-service/staff/availability — ຊ່າງອ່ານ+ປ່ຽນສະຖານະຕົນເອງໄດ້', async () => {
    const off = await request(app)
      .patch('/api/v1/home-service/staff/availability')
      .set(...bearer(stylistToken))
      .send({ isAvailable: false });
    expect(off.status).toBe(200);
    expect(off.body.data.isAvailable).toBe(false);

    const read = await request(app)
      .get('/api/v1/home-service/staff/availability')
      .set(...bearer(stylistToken));
    expect(read.status).toBe(200);
    expect(read.body.data.isAvailable).toBe(false);

    const on = await request(app)
      .patch('/api/v1/home-service/staff/availability')
      .set(...bearer(stylistToken))
      .send({ isAvailable: true });
    expect(on.body.data.isAvailable).toBe(true);
  });

  it('admin GET /home-service/admin/trips — STAFF = 403', async () => {
    const res = await request(app)
      .get('/api/v1/home-service/admin/trips')
      .set(...bearer(stylistToken));
    expect(res.status).toBe(403);
  });

  it('HOME_SERVICE booking → ຈັບຄູ່ຊ່າງ + travelFee ຖືກຕ້ອງ + HomeServiceTrip ASSIGNED', async () => {
    const at = futureWednesday(30);
    at.setUTCHours(14 - 7, 0, 0, 0); // 14:00 ວຽງຈັນ

    const res = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...bearer(customerToken))
      .send(bookingBody(at));
    expect(res.status).toBe(201);
    const appointmentId = res.body.data.id as string;

    const appt = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
      select: { staffProfileId: true, travelFee: true },
    });
    expect(appt.staffProfileId).toBe(stylistProfileId);

    const expectedDistance = haversineMeters(DEST_LAT, DEST_LNG, 17.977, 102.634);
    expect(appt.travelFee.toNumber()).toBe(computeTravelFee(expectedDistance));
    expect(appt.travelFee.toNumber()).toBeGreaterThan(10_000); // base fee ດ້ວຍ, ບໍ່ແມ່ນ 0

    const trip = await prisma.homeServiceTrip.findUnique({ where: { appointmentId } });
    expect(trip?.status).toBe('ASSIGNED');
    expect(trip?.matchedStaffId).toBe(stylistProfileId);

    // GET trip — ເຈົ້າຂອງເບິ່ງໄດ້, ຄົນອື່ນ 403
    const mine = await request(app)
      .get(`/api/v1/home-service/${appointmentId}`)
      .set(...bearer(customerToken));
    expect(mine.status).toBe(200);
    expect(mine.body.data.matchedStaffId).toBe(stylistProfileId);
    expect(mine.body.data.branchPhone).toEqual(expect.any(String));
    expect(mine.body.data.matchedStaffTitle).toEqual(expect.any(String));
    expect(mine.body.data.matchedStaffRating).toEqual(expect.any(Number));

    const stranger = await request(app)
      .get(`/api/v1/home-service/${appointmentId}`)
      .set(...bearer(otherCustomerToken));
    expect(stranger.status).toBe(403);

    const asStaff = await request(app)
      .get(`/api/v1/home-service/${appointmentId}`)
      .set(...bearer(stylistToken));
    expect(asStaff.status).toBe(200);

    const adminList = await request(app)
      .get(`/api/v1/home-service/admin/trips?branchId=${BRANCH_ID}`)
      .set(...bearer(adminToken));
    expect(adminList.status).toBe(200);
    expect(
      (adminList.body.data as Array<{ appointmentId: string }>).some((t) => t.appointmentId === appointmentId),
    ).toBe(true);
  });

  it('ບໍ່ມີຊ່າງວ່າງ (isHomeServiceAvailable=false) → booking ຍັງສຳເລັດ, trip ເປັນ NO_MATCH', async () => {
    await prisma.staffProfile.update({
      where: { id: stylistProfileId },
      data: { isHomeServiceAvailable: false },
    });

    const at = futureWednesday(31);
    at.setUTCHours(14 - 7, 0, 0, 0); // 14:00 ວຽງຈັນ
    const res = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...bearer(customerToken))
      .send(bookingBody(at));
    // ຫາຊ່າງທີ່ວ່າງແທ້ບໍ່ໄດ້ (ລະດັບ 1) → booking ຍັງສຳເລັດຢູ່ (ບໍ່ປະຕິເສດ), trip ຕົກເປັນ NO_MATCH
    // ໃຫ້ dispatcher ຊ່ວຍຫາຊ່າງໃຫ້ (ບໍ່ throw ອີກຕໍ່ໄປ).
    expect(res.status).toBe(201);
    const appointmentId = res.body.data.id as string;

    const trip = await prisma.homeServiceTrip.findUniqueOrThrow({ where: { appointmentId } });
    expect(trip.status).toBe('NO_MATCH');
    expect(trip.matchedStaffId).toBeNull();
    expect(trip.assignedAt).toBeNull();

    // Admin ຍັງເຫັນ trip ນີ້ຢູ່ໃນ dispatch queue (status=NO_MATCH)
    const adminList = await request(app)
      .get(`/api/v1/home-service/admin/trips?branchId=${BRANCH_ID}&status=NO_MATCH`)
      .set(...bearer(adminToken));
    expect(adminList.status).toBe(200);
    expect(
      (adminList.body.data as Array<{ appointmentId: string }>).some((t) => t.appointmentId === appointmentId),
    ).toBe(true);

    // Admin ຈັດຊ່າງໃຫ້ໄດ້ (assignTrip) — ຕົກເປັນ ASSIGNED
    const assign = await request(app)
      .patch(`/api/v1/home-service/admin/trips/${appointmentId}/assign`)
      .set(...bearer(adminToken))
      .send({ staffProfileId: stylistProfileId });
    expect(assign.status).toBe(200);
    expect(assign.body.data.status).toBe('ASSIGNED');
    expect(assign.body.data.matchedStaffId).toBe(stylistProfileId);

    await prisma.staffProfile.update({
      where: { id: stylistProfileId },
      data: { isHomeServiceAvailable: true },
    });
  });

  it('ຊ່າງ 2 ຄົນ — ໃກ້ກວ່າຊະນະ', async () => {
    const farUser = await prisma.user.create({
      data: {
        name: 'Far Stylist QA',
        phone: FAR_STAFF_PHONE,
        password: 'x',
        role: 'STAFF',
        branchId: BRANCH_ID,
      },
    });
    const farStaff = await prisma.staffProfile.create({
      data: {
        userId: farUser.id,
        title: 'Far Stylist QA',
        isHomeServiceAvailable: true,
        // ~11km ໄກກວ່າ stylistProfileId ຫຼາຍ
        lastKnownLatitude: 18.05,
        lastKnownLongitude: 102.7,
        lastLocationAt: new Date(),
        staffBranches: { create: { branchId: BRANCH_ID, isPrimary: true } },
        staffServices: { create: { serviceId: HAIRCUT_ID } },
      },
    });

    const at = futureWednesday(32);
    const dow = at.getUTCDay();
    await prisma.workingHour.create({
      data: {
        staffProfileId: farStaff.id,
        dayOfWeek: dow,
        startTime: '00:00',
        endTime: '23:59',
        isDayOff: false,
      },
    });
    at.setUTCHours(14 - 7, 0, 0, 0); // 14:00 ວຽງຈັນ

    const res = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...bearer(customerToken))
      .send(bookingBody(at));
    expect(res.status).toBe(201);

    const appt = await prisma.appointment.findUniqueOrThrow({
      where: { id: res.body.data.id as string },
      select: { staffProfileId: true },
    });
    // stylistProfileId (17.977,102.634) ໃກ້ DEST ກວ່າ farStaff (18.05,102.7) ຫຼາຍ → ຕ້ອງຊະນະ
    expect(appt.staffProfileId).toBe(stylistProfileId);
  });
});
