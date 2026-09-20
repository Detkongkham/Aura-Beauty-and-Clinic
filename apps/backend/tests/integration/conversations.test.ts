import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — Phase 8 Platform-Wide Messaging (Module 38), Wave 8B: STAFF_INTERNAL conversations.
 *   ສ້າງຫ້ອງ STAFF_INTERNAL → participant ອ່ານ/ສົ່ງໄດ້, ຄົນອື່ນ 403 · CUSTOMER ສ້າງບໍ່ໄດ້ → 403 ·
 *   admin ເຂົ້າ thread ໃດກໍ່ໄດ້ (oversight) · ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const STAFF1_PHONE = '02055500001';
const STAFF2_PHONE = '02055500002';
const STAFF_PASSWORD = 'Staff@12345';
const CUST_PHONE = '02088880077';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

async function wipe(): Promise<void> {
  const cust = await prisma.user.findMany({ where: { phone: CUST_PHONE }, select: { id: true } });
  const custIds = cust.map((u) => u.id);
  await prisma.chatMessage.deleteMany({ where: { thread: { type: 'STAFF_INTERNAL' } } });
  await prisma.conversationParticipant.deleteMany({ where: { thread: { type: 'STAFF_INTERNAL' } } });
  await prisma.chatThread.deleteMany({ where: { type: 'STAFF_INTERNAL' } });
  if (custIds.length) await prisma.user.deleteMany({ where: { id: { in: custIds } } });
}

describe('Phase 8 — Platform-Wide Messaging, Wave 8B (STAFF_INTERNAL)', () => {
  let app: Express;
  let adminToken: string;
  let adminId: string;
  let staff1Token: string;
  let staff1Id: string;
  let staff2Token: string;
  let staff2Id: string;
  let custToken: string;

  beforeAll(async () => {
    app = createApp();
    await wipe();

    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    adminToken = adminLogin.body.data.tokens.accessToken as string;
    adminId = adminLogin.body.data.user.id as string;

    const s1 = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: STAFF1_PHONE, password: STAFF_PASSWORD });
    staff1Token = s1.body.data.tokens.accessToken as string;
    staff1Id = s1.body.data.user.id as string;

    const s2 = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: STAFF2_PHONE, password: STAFF_PASSWORD });
    staff2Token = s2.body.data.tokens.accessToken as string;
    staff2Id = s2.body.data.user.id as string;

    const custReg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Messaging QA', phone: CUST_PHONE, password: 'Passw0rd!' });
    custToken = custReg.body.data.tokens.accessToken as string;
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('CUSTOMER ສ້າງ STAFF_INTERNAL conversation ບໍ່ໄດ້ → 403', async () => {
    const res = await request(app)
      .post('/api/v1/conversations')
      .set(...bearer(custToken))
      .send({ type: 'STAFF_INTERNAL', participantIds: [staff1Id] });
    expect(res.status).toBe(403);
  });

  it('staff1 ສ້າງຫ້ອງກັບ staff2 → ທັງສອງເຫັນໃນ list, ອ່ານ/ສົ່ງໄດ້; staff ອື່ນທີ່ບໍ່ແມ່ນ participant → 403', async () => {
    const created = await request(app)
      .post('/api/v1/conversations')
      .set(...bearer(staff1Token))
      .send({ type: 'STAFF_INTERNAL', participantIds: [staff2Id] });
    expect(created.status).toBe(201);
    expect(created.body.data.type).toBe('STAFF_INTERNAL');
    expect(created.body.data.participants).toHaveLength(2);
    const threadId = created.body.data.id as string;

    const list1 = await request(app)
      .get('/api/v1/conversations?type=STAFF_INTERNAL')
      .set(...bearer(staff1Token));
    expect(list1.status).toBe(200);
    expect(list1.body.data.some((c: { id: string }) => c.id === threadId)).toBe(true);

    const list2 = await request(app)
      .get('/api/v1/conversations?type=STAFF_INTERNAL')
      .set(...bearer(staff2Token));
    expect(list2.body.data.some((c: { id: string }) => c.id === threadId)).toBe(true);

    const send = await request(app)
      .post(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(staff1Token))
      .send({ body: 'ສະບາຍດີ ຝາກຄິວແທນມື້ນີ້ໄດ້ບໍ່' });
    expect(send.status).toBe(201);

    const reply = await request(app)
      .post(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(staff2Token))
      .send({ body: 'ໄດ້ເລີຍ' });
    expect(reply.status).toBe(201);

    const read = await request(app)
      .get(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(staff2Token));
    expect(read.status).toBe(200);
    expect(read.body.data.total).toBe(2);

    // admin ເຂົ້າ thread ໄດ້ (oversight) ເຖິງບໍ່ແມ່ນ participant
    const adminRead = await request(app)
      .get(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(adminToken));
    expect(adminRead.status).toBe(200);

    // ລູກຄ້າ (ບໍ່ແມ່ນ staff, ບໍ່ແມ່ນ participant) ອ່ານ/ສົ່ງບໍ່ໄດ້
    const custRead = await request(app)
      .get(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(custToken));
    expect(custRead.status).toBe(403);
  });

  it('Wave 8C — staff ປິດຫ້ອງບໍ່ໄດ້ → 403; admin lock ຫ້ອງໄດ້ → ສົ່ງບໍ່ໄດ້ (409) ແຕ່ອ່ານໄດ້; unlock ຄືນ ສົ່ງໄດ້ອີກ', async () => {
    const created = await request(app)
      .post('/api/v1/conversations')
      .set(...bearer(staff1Token))
      .send({ type: 'STAFF_INTERNAL', participantIds: [staff2Id] });
    const threadId = created.body.data.id as string;

    const staffLock = await request(app)
      .patch(`/api/v1/conversations/${threadId}/lock`)
      .set(...bearer(staff1Token))
      .send({ isLocked: true });
    expect(staffLock.status).toBe(403);

    const adminLock = await request(app)
      .patch(`/api/v1/conversations/${threadId}/lock`)
      .set(...bearer(adminToken))
      .send({ isLocked: true });
    expect(adminLock.status).toBe(200);

    const blockedSend = await request(app)
      .post(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(staff1Token))
      .send({ body: 'ຫ້ອງນີ້ຄວນຖືກປິດແລ້ວ' });
    expect(blockedSend.status).toBe(409);

    const stillRead = await request(app)
      .get(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(staff1Token));
    expect(stillRead.status).toBe(200);

    const adminUnlock = await request(app)
      .patch(`/api/v1/conversations/${threadId}/lock`)
      .set(...bearer(adminToken))
      .send({ isLocked: false });
    expect(adminUnlock.status).toBe(200);

    const sendAgain = await request(app)
      .post(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(staff1Token))
      .send({ body: 'ເປີດຄືນແລ້ວ ສົ່ງໄດ້' });
    expect(sendAgain.status).toBe(201);
  });
  it('inbox — list ມີ lastMessage/messageCount/unreadCount; POST /:id/read ລ້າງ unread; ຂໍ້ຄວາມຕົນເອງບໍ່ນັບ', async () => {
    const created = await request(app)
      .post('/api/v1/conversations')
      .set(...bearer(staff1Token))
      .send({ type: 'STAFF_INTERNAL', participantIds: [staff2Id, adminId] });
    expect(created.status).toBe(201);
    const threadId = created.body.data.id as string;
    expect(created.body.data.unreadCount).toBe(0);
    expect(created.body.data.lastMessage).toBeNull();

    for (const body of ['ປະຊຸມ 9 ໂມງ', 'ຢ່າລືມເອົາລາຍງານມາ']) {
      const r = await request(app)
        .post(`/api/v1/chat/threads/${threadId}/messages`)
        .set(...bearer(staff1Token))
        .send({ body });
      expect(r.status).toBe(201);
    }

    const find = async (token: string) => {
      const list = await request(app).get('/api/v1/conversations?type=STAFF_INTERNAL').set(...bearer(token));
      expect(list.status).toBe(200);
      return list.body.data.find((c: { id: string }) => c.id === threadId);
    };

    const forSender = await find(staff1Token);
    expect(forSender.unreadCount).toBe(0);
    expect(forSender.messageCount).toBe(2);
    expect(forSender.isLocked).toBe(false);
    expect(forSender.lastMessage.body).toBe('ຢ່າລືມເອົາລາຍງານມາ');
    expect(forSender.lastMessage.senderId).toBe(staff1Id);

    expect((await find(staff2Token)).unreadCount).toBe(2);

    const markRead = await request(app)
      .post(`/api/v1/conversations/${threadId}/read`)
      .set(...bearer(staff2Token));
    expect(markRead.status).toBe(200);
    expect((await find(staff2Token)).unreadCount).toBe(0);

    const media = await request(app)
      .get(`/api/v1/conversations/${threadId}/media`)
      .set(...bearer(staff2Token));
    expect(media.status).toBe(200);
    expect(media.body.data).toEqual({ photoCount: 0, voiceCount: 0, photos: [] });
    const mediaOutsider = await request(app)
      .get(`/api/v1/conversations/${threadId}/media`)
      .set(...bearer(custToken));
    expect(mediaOutsider.status).toBe(403);

    const outsider = await request(app)
      .post(`/api/v1/conversations/${threadId}/read`)
      .set(...bearer(custToken));
    expect(outsider.status).toBe(403);
  });
});
