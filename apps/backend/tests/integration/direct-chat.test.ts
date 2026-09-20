import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — Phase 8 Platform-Wide Messaging (Module 38), Wave 8D: DIRECT (customer↔customer).
 *   opt-in gate · 1-ຕໍ່-1 idempotent creation · block ຫ້າມສົ່ງ (ທັງສອງທິດ) · report → admin moderation
 *   queue → ACTIONED ລ໊ອກຫ້ອງ · STAFF ສ້າງ DIRECT ບໍ່ໄດ້ (403).
 */
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const STAFF1_PHONE = '02055500001';
const STAFF_PASSWORD = 'Staff@12345';
const CUST_A_PHONE = '02088880011';
const CUST_B_PHONE = '02088880022';
const CUST_C_PHONE = '02088880033';

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

async function wipe(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { phone: { in: [CUST_A_PHONE, CUST_B_PHONE, CUST_C_PHONE] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.chatReport.deleteMany({ where: { reportedById: { in: ids } } });
  await prisma.chatBlock.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
  await prisma.chatMessage.deleteMany({
    where: { thread: { participants: { some: { userId: { in: ids } } } } },
  });
  await prisma.conversationParticipant.deleteMany({ where: { userId: { in: ids } } });
  // DIRECT only — CONSULTATION threads never have participants, so an unscoped delete races chat.test.ts.
  await prisma.chatThread.deleteMany({ where: { type: 'DIRECT', participants: { none: {} } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

describe('Phase 8 — Platform-Wide Messaging, Wave 8D (DIRECT)', () => {
  let app: Express;
  let adminToken: string;
  let staff1Token: string;
  let custAToken: string;
  let custAId: string;
  let custBToken: string;
  let custBId: string;
  let custCToken: string;
  let custCId: string;

  beforeAll(async () => {
    app = createApp();
    await wipe();

    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
    adminToken = adminLogin.body.data.tokens.accessToken as string;

    const s1 = await request(app)
      .post('/api/v1/auth/login')
      .send({ phone: STAFF1_PHONE, password: STAFF_PASSWORD });
    staff1Token = s1.body.data.tokens.accessToken as string;

    const a = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Direct QA A', phone: CUST_A_PHONE, password: 'Passw0rd!' });
    custAToken = a.body.data.tokens.accessToken as string;
    custAId = a.body.data.user.id as string;

    const b = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Direct QA B', phone: CUST_B_PHONE, password: 'Passw0rd!' });
    custBToken = b.body.data.tokens.accessToken as string;
    custBId = b.body.data.user.id as string;

    const c = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Direct QA C', phone: CUST_C_PHONE, password: 'Passw0rd!' });
    custCToken = c.body.data.tokens.accessToken as string;
    custCId = c.body.data.user.id as string;
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('STAFF ສ້າງ DIRECT ບໍ່ໄດ້ (DIRECT ສະເພາະ CUSTOMER) → 403', async () => {
    const res = await request(app)
      .post('/api/v1/conversations')
      .set(...bearer(staff1Token))
      .send({ type: 'DIRECT', targetUserId: custAId });
    expect(res.status).toBe(403);
  });

  it('ຝ່າຍເປົ້າໝາຍຍັງບໍ່ໄດ້ເປີດ allowDirectMessages → 400', async () => {
    const res = await request(app)
      .post('/api/v1/conversations')
      .set(...bearer(custAToken))
      .send({ type: 'DIRECT', targetUserId: custBId });
    expect(res.status).toBe(400);
  });

  it('ຫຼັງເປີດ opt-in → ສ້າງ DIRECT ໄດ້ (idempotent), ອ່ານ/ສົ່ງໄດ້ທັງສອງຝ່າຍ, ຄົນນອກ 403', async () => {
    const optIn = await request(app)
      .patch('/api/v1/auth/me')
      .set(...bearer(custBToken))
      .send({ allowDirectMessages: true });
    expect(optIn.status).toBe(200);
    expect(optIn.body.data.allowDirectMessages).toBe(true);

    const created = await request(app)
      .post('/api/v1/conversations')
      .set(...bearer(custAToken))
      .send({ type: 'DIRECT', targetUserId: custBId });
    expect(created.status).toBe(201);
    expect(created.body.data.type).toBe('DIRECT');
    const threadId = created.body.data.id as string;

    const again = await request(app)
      .post('/api/v1/conversations')
      .set(...bearer(custAToken))
      .send({ type: 'DIRECT', targetUserId: custBId });
    expect(again.body.data.id).toBe(threadId);

    const send = await request(app)
      .post(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(custAToken))
      .send({ body: 'ສະບາຍດີ' });
    expect(send.status).toBe(201);

    const reply = await request(app)
      .post(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(custBToken))
      .send({ body: 'ສະບາຍດີຄືກັນ' });
    expect(reply.status).toBe(201);

    const outsiderRead = await request(app)
      .get(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(custCToken));
    expect(outsiderRead.status).toBe(403);
  });

  it('Block ຫ້າມສົ່ງທັງສອງທິດ, ບໍ່ໄດ້ block ຫ້ອງ CONSULTATION/STAFF_INTERNAL, unblock ຄືນສົ່ງໄດ້', async () => {
    await request(app)
      .patch('/api/v1/auth/me')
      .set(...bearer(custCToken))
      .send({ allowDirectMessages: true });

    const created = await request(app)
      .post('/api/v1/conversations')
      .set(...bearer(custAToken))
      .send({ type: 'DIRECT', targetUserId: custCId });
    const threadId = created.body.data.id as string;

    const block = await request(app)
      .post(`/api/v1/conversations/block/${custCId}`)
      .set(...bearer(custAToken));
    expect(block.status).toBe(200);

    const blocks = await request(app).get('/api/v1/conversations/blocks').set(...bearer(custAToken));
    expect(blocks.status).toBe(200);
    expect(blocks.body.data).toEqual([
      expect.objectContaining({ userId: custCId, blockedAt: expect.any(String) }),
    ]);
    // ຝ່າຍທີ່ຖືກບລັອກ ບໍ່ເຫັນວ່າໃຜບລັອກຕົນ.
    const blockedSide = await request(app).get('/api/v1/conversations/blocks').set(...bearer(custCToken));
    expect(blockedSide.body.data).toEqual([]);

    const blockedSend = await request(app)
      .post(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(custAToken))
      .send({ body: 'ຄວນຖືກປະຕິເສດ' });
    expect(blockedSend.status).toBe(409);

    const blockedReplyAttempt = await request(app)
      .post(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(custCToken))
      .send({ body: 'ອີກຝ່າຍ block ຢູ່ ຄວນຖືກປະຕິເສດຄືກັນ' });
    expect(blockedReplyAttempt.status).toBe(409);

    const unblock = await request(app)
      .delete(`/api/v1/conversations/block/${custCId}`)
      .set(...bearer(custAToken));
    expect(unblock.status).toBe(200);
    const afterUnblock = await request(app).get('/api/v1/conversations/blocks').set(...bearer(custAToken));
    expect(afterUnblock.body.data).toEqual([]);

    const sendAgain = await request(app)
      .post(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(custAToken))
      .send({ body: 'unblock ແລ້ວ ສົ່ງໄດ້' });
    expect(sendAgain.status).toBe(201);
  });

  it('Report → admin ເຫັນໃນ queue → ACTIONED ລ໊ອກຫ້ອງ; report ຫ້ອງ STAFF_INTERNAL ບໍ່ໄດ້ → 400', async () => {
    await request(app)
      .patch('/api/v1/auth/me')
      .set(...bearer(custAToken))
      .send({ allowDirectMessages: true });

    const direct = await request(app)
      .post('/api/v1/conversations')
      .set(...bearer(custBToken))
      .send({ type: 'DIRECT', targetUserId: custAId });
    const threadId = direct.body.data.id as string;

    const me = await request(app).get('/api/v1/auth/me').set(...bearer(adminToken));
    const staffInternal = await request(app)
      .post('/api/v1/conversations')
      .set(...bearer(staff1Token))
      .send({ type: 'STAFF_INTERNAL', participantIds: [me.body.data.id] });
    const cannotReport = await request(app)
      .post(`/api/v1/conversations/${staffInternal.body.data.id}/report`)
      .set(...bearer(staff1Token))
      .send({ reason: 'ບໍ່ຄວນ report ໄດ້' });
    expect(cannotReport.status).toBe(400);
    await prisma.chatThread.delete({ where: { id: staffInternal.body.data.id } });

    const report = await request(app)
      .post(`/api/v1/conversations/${threadId}/report`)
      .set(...bearer(custBToken))
      .send({ reason: 'ຂໍ້ຄວາມບໍ່ເໝາະສົມ (QA)' });
    expect(report.status).toBe(201);

    const queue = await request(app)
      .get('/api/v1/conversations/reports?status=PENDING')
      .set(...bearer(adminToken));
    expect(queue.status).toBe(200);
    const item = queue.body.data.find((r: { conversationId: string }) => r.conversationId === threadId);
    expect(item).toBeTruthy();
    expect(item.reportedByName).toBe('Direct QA B');

    const staffCannotReview = await request(app)
      .get('/api/v1/conversations/reports')
      .set(...bearer(staff1Token));
    expect(staffCannotReview.status).toBe(403);

    const review = await request(app)
      .patch(`/api/v1/conversations/reports/${item.id}`)
      .set(...bearer(adminToken))
      .send({ status: 'ACTIONED' });
    expect(review.status).toBe(200);

    const blockedSend = await request(app)
      .post(`/api/v1/chat/threads/${threadId}/messages`)
      .set(...bearer(custAToken))
      .send({ body: 'ຫ້ອງນີ້ຄວນຖືກລ໊ອກແລ້ວ' });
    expect(blockedSend.status).toBe(409);
  });
});
