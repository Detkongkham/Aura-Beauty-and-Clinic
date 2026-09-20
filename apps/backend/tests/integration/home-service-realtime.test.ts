import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { signAccessToken } from '../../src/utils/token.js';
import { closeSocketServer, createSocketServer } from '../../src/realtime/socket.js';

/**
 * Integration — Phase 7B socket.io infra (Module 29).
 *   join-trip (ເຈົ້າຂອງ/ຊ່າງ) → stylist:location → trip:location broadcast ໄປຫາ room ດຽວກັນ ·
 *   join-trip ໂດຍຄົນນອກ → 'unauthorized' · handshake ບໍ່ມີ token → connect_error.
 * ໃຊ້ຊ່າງ + ສາຂາທົດສອບຂອງຕົນເອງ (ບໍ່ແມ່ນ seed ຮ່ວມ) ເພື່ອບໍ່ຊ້ອນກັບໄຟລ໌ອື່ນທີ່ອາດແລ່ນຄຽງກັນ —
 * matchNearestStaff/walk-in auto-assign ກອງຕາມ branchId, ດັ່ງນັ້ນສາຂາແຍກຕ່າງຫາກ = isolation ເຕັມ.
 * ຕ້ອງມີ PostgreSQL + Redis (`@socket.io/redis-adapter`) + `pnpm db:seed`.
 */
const TEST_BRANCH_ID = '99999999-0000-0000-0000-000000000001';
const HAIRCUT_ID = '33333333-0000-0000-0000-000000000001';
const STYLIST_PHONE = '02088880009';
const CUSTOMER_PHONE = '02088880001';
const OUTSIDER_PHONE = '02088880002';

function futureThursday(weeksAhead: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + weeksAhead * 7);
  d.setUTCHours(0, 0, 0, 0);
  while (d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { phone: { in: [CUSTOMER_PHONE, OUTSIDER_PHONE, STYLIST_PHONE] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length) {
    const appts = await prisma.appointment.findMany({
      where: { customerId: { in: ids } },
      select: { id: true },
    });
    const aids = appts.map((a) => a.id);
    if (aids.length) await prisma.homeServiceTrip.deleteMany({ where: { appointmentId: { in: aids } } });
    await prisma.appointment.deleteMany({ where: { customerId: { in: ids } } });
  }

  const stylist = await prisma.staffProfile.findFirst({
    where: { user: { phone: STYLIST_PHONE } },
    select: { id: true },
  });
  if (stylist) {
    await prisma.workingHour.deleteMany({ where: { staffProfileId: stylist.id } });
    await prisma.staffService.deleteMany({ where: { staffProfileId: stylist.id } });
    await prisma.staffBranch.deleteMany({ where: { staffProfileId: stylist.id } });
    await prisma.staffProfile.deleteMany({ where: { id: stylist.id } });
  }

  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.branch.deleteMany({ where: { id: TEST_BRANCH_ID } });
}

function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ບໍ່ໄດ້ຮັບ event "${event}" ພາຍໃນເວລາ`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('Phase 7B — socket.io infra (Module 29)', () => {
  let port: number;
  let stylistToken: string;
  let customerToken: string;
  let outsiderToken: string;
  let appointmentId: string;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    await cleanup();
    const app = createApp();
    const httpServer = createServer(app);
    createSocketServer(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as AddressInfo).port;

    // ສາຂາ + ຊ່າງທົດສອບສະເພາະໄຟລ໌ນີ້ — ບໍ່ແມ່ນ seed ຮ່ວມ, ຫຼີກລ່ຽງການແຂ່ງກັນກັບໄຟລ໌ອື່ນທີ່ໃຊ້ branch ດຽວກັນ
    // (matchNearestStaff / walk-in auto-assign ກອງຕາມ branchId — ສາຂາແຍກ = ບໍ່ມີໃຜເຫັນຊ່າງນີ້).
    const at = futureThursday(40);
    const dow = at.getUTCDay();
    await prisma.branch.create({
      data: {
        id: TEST_BRANCH_ID,
        name: 'Realtime QA Branch',
        address: 'QA',
        phone: '02000000099',
        latitude: 17.9757,
        longitude: 102.6331,
      },
    });
    const stylistUser = await prisma.user.create({
      data: {
        name: 'Realtime Stylist QA',
        phone: STYLIST_PHONE,
        password: 'unused-see-signAccessToken',
        role: 'STAFF',
        branchId: TEST_BRANCH_ID,
      },
    });
    const stylistProfile = await prisma.staffProfile.create({
      data: {
        userId: stylistUser.id,
        title: 'Realtime Stylist QA',
        isHomeServiceAvailable: true,
        lastKnownLatitude: 17.977,
        lastKnownLongitude: 102.634,
        lastLocationAt: new Date(),
        staffBranches: { create: { branchId: TEST_BRANCH_ID, isPrimary: true } },
        staffServices: { create: { serviceId: HAIRCUT_ID } },
      },
    });
    await prisma.workingHour.create({
      data: {
        staffProfileId: stylistProfile.id,
        dayOfWeek: dow,
        startTime: '00:00',
        endTime: '23:59',
        isDayOff: false,
      },
    });
    stylistToken = signAccessToken({ sub: stylistUser.id, role: 'STAFF', branchId: TEST_BRANCH_ID });

    const c = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Realtime QA', phone: CUSTOMER_PHONE, password: 'Passw0rd!' });
    customerToken = c.body.data.tokens.accessToken as string;

    const o = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Outsider QA', phone: OUTSIDER_PHONE, password: 'Passw0rd!' });
    outsiderToken = o.body.data.tokens.accessToken as string;

    at.setUTCHours(14, 0, 0, 0);
    const booked = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        branchId: TEST_BRANCH_ID,
        serviceId: HAIRCUT_ID,
        startAt: at.toISOString(),
        deliveryType: 'HOME_SERVICE',
        homeAddress: 'ບ້ານທົດສອບ, ວຽງຈັນ',
        destLatitude: 17.995,
        destLongitude: 102.65,
      });
    expect(booked.status).toBe(201);
    appointmentId = booked.body.data.id as string;
  });

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await closeSocketServer();
    await cleanup();
    await prisma.$disconnect();
  });

  function connect(token: string): ClientSocket {
    const s = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(s);
    return s;
  }

  it('handshake ບໍ່ມີ token → connect_error', async () => {
    const s = ioClient(`http://localhost:${port}`, { transports: ['websocket'], reconnection: false });
    sockets.push(s);
    await waitForEvent(s, 'connect_error');
  });

  it('join-trip ໂດຍຄົນນອກ → unauthorized', async () => {
    const outsider = connect(outsiderToken);
    await waitForEvent(outsider, 'connect');
    outsider.emit('join-trip', { appointmentId });
    const payload = await waitForEvent<{ appointmentId: string }>(outsider, 'unauthorized');
    expect(payload.appointmentId).toBe(appointmentId);
  });

  it('ຊ່າງ ping ຕຳແໜ່ງ → ລູກຄ້າໄດ້ຮັບ trip:location ໃນ room ດຽວກັນ', async () => {
    const customer = connect(customerToken);
    const stylist = connect(stylistToken);
    await Promise.all([waitForEvent(customer, 'connect'), waitForEvent(stylist, 'connect')]);

    customer.emit('join-trip', { appointmentId });
    stylist.emit('join-trip', { appointmentId });
    await new Promise((r) => setTimeout(r, 200)); // ໃຫ້ join ສຳເລັດກ່ອນ ping

    const locationPromise = waitForEvent<{
      appointmentId: string;
      lat: number;
      lng: number;
      etaMinutes: number | null;
    }>(customer, 'trip:location');
    stylist.emit('stylist:location', { lat: 17.98, lng: 102.64 });

    const event = await locationPromise;
    expect(event.appointmentId).toBe(appointmentId);
    expect(event.lat).toBe(17.98);
    expect(event.lng).toBe(102.64);
    expect(typeof event.etaMinutes).toBe('number');

    const trip = await prisma.homeServiceTrip.findUnique({ where: { appointmentId } });
    expect(trip?.lastLatitude).toBe(17.98);
  });
});
