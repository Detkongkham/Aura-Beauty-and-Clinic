import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — Phase 7C In-App Chat & Consultation Threads (Module 21).
 *   Thread lazy-create ຕໍ່ນັດໝາຍ (ensureThread idempotent) · RBAC (ລູກຄ້າເຈົ້າຂອງ/ຊ່າງທີ່ຖືກຈັບຄູ່/admin
 *   ເຂົ້າໄດ້, ລູກຄ້າ/ຊ່າງອື່ນ → 403) · ຂໍ້ຄວາມຮຽງລຳດັບ + pagination round trip.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const HAIRCUT_ID = '33333333-0000-0000-0000-000000000001';
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const STAFF1_PHONE = '02055500001';
const STAFF2_PHONE = '02055500002';
const STAFF_PASSWORD = 'Staff@12345';
const CUST_PHONE = '02088870099';
const OUTSIDER_PHONE = '02088870098';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

async function wipe(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { phone: { in: [CUST_PHONE, OUTSIDER_PHONE] } },
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
      await prisma.chatMessage.deleteMany({ where: { thread: { appointmentId: { in: aids } } } });
      await prisma.chatThread.deleteMany({ where: { appointmentId: { in: aids } } });
    }
    await prisma.appointment.deleteMany({ where: { customerId: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

function futureDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

describe('Phase 7C — In-App Chat & Consultation Threads (Module 21)', () => {
  let app: Express;
  let adminToken: string;
  let custToken: string;
  let outsiderCustToken: string;
  const staffTokenByPhone: Record<string, string> = {};
  let appointmentId: string;
  let matchedStaffPhone: string;

  beforeAll(async () => {
    app = createApp();
    await wipe();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    adminToken = login.body.data.tokens.accessToken as string;

    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Chat QA', phone: CUST_PHONE, password: 'Passw0rd!' });
    custToken = reg.body.data.tokens.accessToken as string;

    const outsiderReg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Chat QA Outsider', phone: OUTSIDER_PHONE, password: 'Passw0rd!' });
    outsiderCustToken = outsiderReg.body.data.tokens.accessToken as string;

    for (const phone of [STAFF1_PHONE, STAFF2_PHONE]) {
      const staffLogin = await request(app)
        .post('/api/v1/auth/login')
        .send({ phone, password: STAFF_PASSWORD });
      staffTokenByPhone[phone] = staffLogin.body.data.tokens.accessToken as string;
    }

    const avail = await request(app)
      .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${HAIRCUT_ID}&date=${futureDate()}`)
      .set(...bearer(custToken));
    const slot = (avail.body.data.slots as Array<{ staffProfileId: string; startAt: string }>)[0]!;

    const staffProfile = await prisma.staffProfile.findUniqueOrThrow({
      where: { id: slot.staffProfileId },
      include: { user: { select: { phone: true } } },
    });
    matchedStaffPhone = staffProfile.user.phone;
    // ຮັບປະກັນວ່າ matched staff ມີ token ໄວ້ (ອາດຢູ່ນອກ 2 phone ຂ້າງເທິງໃນ seed ອື່ນ — login ເພີ່ມ).
    if (!staffTokenByPhone[matchedStaffPhone]) {
      const extra = await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: matchedStaffPhone, password: STAFF_PASSWORD });
      staffTokenByPhone[matchedStaffPhone] = extra.body.data.tokens.accessToken as string;
    }

    const booked = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...bearer(custToken))
      .send({
        branchId: BRANCH_ID,
        serviceId: HAIRCUT_ID,
        staffProfileId: slot.staffProfileId,
        startAt: slot.startAt,
      });
    expect(booked.status).toBe(201);
    appointmentId = booked.body.data.id as string;
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('ຄົນນອກ (ບໍ່ແມ່ນເຈົ້າຂອງ/ຊ່າງ/admin) ບໍ່ມີສິດເບິ່ງ thread → 403', async () => {
    const res = await request(app)
      .get(`/api/v1/chat/appointments/${appointmentId}/thread`)
      .set(...bearer(outsiderCustToken));
    expect(res.status).toBe(403);

    const outsiderStaffPhone = matchedStaffPhone === STAFF1_PHONE ? STAFF2_PHONE : STAFF1_PHONE;
    const resStaff = await request(app)
      .get(`/api/v1/chat/appointments/${appointmentId}/thread`)
      .set(...bearer(staffTokenByPhone[outsiderStaffPhone]!));
    expect(resStaff.status).toBe(403);
  });

  it('ensureThread ຖືກສ້າງແບບ lazy ຄັ້ງດຽວ — ຮຽກຊ້ຳໄດ້ thread id ດຽວກັນ (customer/staff/admin ເຂົ້າໄດ້)', async () => {
    const first = await request(app)
      .get(`/api/v1/chat/appointments/${appointmentId}/thread`)
      .set(...bearer(custToken));
    expect(first.status).toBe(200);
    const threadId = first.body.data.id as string;
    expect(first.body.data.appointmentId).toBe(appointmentId);

    const second = await request(app)
      .get(`/api/v1/chat/appointments/${appointmentId}/thread`)
      .set(...bearer(staffTokenByPhone[matchedStaffPhone]!));
    expect(second.status).toBe(200);
    expect(second.body.data.id).toBe(threadId);

    const third = await request(app)
      .post(`/api/v1/chat/appointments/${appointmentId}/thread`)
      .set(...bearer(adminToken));
    expect(third.status).toBe(200);
    expect(third.body.data.id).toBe(threadId);
  });

  it('ຂໍ້ຄວາມຮຽງລຳດັບເວລາ + pagination round trip; ຄົນນອກສົ່ງ/ອ່ານບໍ່ໄດ້ → 403', async () => {
    const thread = await request(app)
      .get(`/api/v1/chat/appointments/${appointmentId}/thread`)
      .set(...bearer(custToken));
    const threadId = thread.body.data.id as string;

    for (let i = 0; i < 3; i += 1) {
      const send = await request(app)
        .post(`/api/v1/chat/threads/${threadId}/messages`)
        .set(...bearer(custToken))
        .send({ body: `ຂໍ້ຄວາມທີ ${i + 1}` });
      expect(send.status).toBe(201);
    }
    const reply = await request(app)
      .post(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(staffTokenByPhone[matchedStaffPhone]!))
      .send({ body: 'ຮັບຂໍ້ຄວາມແລ້ວ' });
    expect(reply.status).toBe(201);
    expect(reply.body.data.senderRole).toBe('STAFF');

    const page1 = await request(app)
      .get(`/api/v1/chat/threads/${threadId}/messages?page=1&pageSize=2`)
      .set(...bearer(custToken));
    expect(page1.status).toBe(200);
    expect(page1.body.data.items).toHaveLength(2);
    expect(page1.body.data.total).toBe(4);
    expect(page1.body.data.items[0].body).toBe('ຂໍ້ຄວາມທີ 1');

    const page2 = await request(app)
      .get(`/api/v1/chat/threads/${threadId}/messages?page=2&pageSize=2`)
      .set(...bearer(custToken));
    expect(page2.body.data.items).toHaveLength(2);
    expect(page2.body.data.items[1].body).toBe('ຮັບຂໍ້ຄວາມແລ້ວ');

    // latest=true — page 1 = ຂໍ້ຄວາມໃໝ່ສຸດ, ແຕ່ຍັງຮຽງ ເກົ່າ→ໃໝ່
    const latest = await request(app)
      .get(`/api/v1/chat/threads/${threadId}/messages?page=1&pageSize=2&latest=true`)
      .set(...bearer(custToken));
    expect(latest.status).toBe(200);
    expect(latest.body.data.total).toBe(4);
    expect((latest.body.data.items as Array<{ body: string }>).map((m) => m.body)).toEqual([
      'ຂໍ້ຄວາມທີ 3',
      'ຮັບຂໍ້ຄວາມແລ້ວ',
    ]);

    // thread view ມີບໍລິບົດນັດໝາຍສຳລັບຫົວແຊັດ
    expect(thread.body.data).toMatchObject({
      serviceName: expect.any(String),
      appointmentStartAt: expect.any(String),
      appointmentStatus: expect.any(String),
      branchName: expect.any(String),
      branchPhone: expect.any(String),
    });

    const outsiderSend = await request(app)
      .post(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(outsiderCustToken))
      .send({ body: 'ບໍ່ຄວນສົ່ງໄດ້' });
    expect(outsiderSend.status).toBe(403);

    const outsiderRead = await request(app)
      .get(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(outsiderCustToken));
    expect(outsiderRead.status).toBe(403);
  });

  it('ສົ່ງຮູບ/ຂໍ້ຄວາມສຽງ (base64) → ໄດ້ mediaUrl + messageType ຖືກຕ້ອງ; ຄົນນອກສົ່ງບໍ່ໄດ້; contentType ຜິດ → 400', async () => {
    const thread = await request(app)
      .get(`/api/v1/chat/appointments/${appointmentId}/thread`)
      .set(...bearer(custToken));
    const threadId = thread.body.data.id as string;

    const tinyPng =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    const image = await request(app)
      .post(`/api/v1/chat/threads/${threadId}/media`)
      .set(...bearer(custToken))
      .send({ messageType: 'IMAGE', contentType: 'image/png', dataBase64: tinyPng });
    expect(image.status).toBe(201);
    expect(image.body.data.messageType).toBe('IMAGE');
    expect(image.body.data.mediaUrl).toMatch(/^https?:\/\//);

    const audio = await request(app)
      .post(`/api/v1/chat/threads/${threadId}/media`)
      .set(...bearer(staffTokenByPhone[matchedStaffPhone]!))
      .send({ messageType: 'AUDIO', contentType: 'audio/m4a', dataBase64: tinyPng, caption: 'ສະບາຍດີ' });
    expect(audio.status).toBe(201);
    expect(audio.body.data.messageType).toBe('AUDIO');
    expect(audio.body.data.body).toBe('ສະບາຍດີ');

    const badType = await request(app)
      .post(`/api/v1/chat/threads/${threadId}/media`)
      .set(...bearer(custToken))
      .send({ messageType: 'IMAGE', contentType: 'application/pdf', dataBase64: tinyPng });
    expect(badType.status).toBe(400);

    const outsiderSend = await request(app)
      .post(`/api/v1/chat/threads/${threadId}/media`)
      .set(...bearer(outsiderCustToken))
      .send({ messageType: 'IMAGE', contentType: 'image/png', dataBase64: tinyPng });
    expect(outsiderSend.status).toBe(403);

    const list = await request(app)
      .get(`/api/v1/chat/threads/${threadId}/messages?pageSize=50`)
      .set(...bearer(custToken));
    const kinds = list.body.data.items.map((m: { messageType: string }) => m.messageType);
    expect(kinds).toContain('IMAGE');
    expect(kinds).toContain('AUDIO');
  });
});
