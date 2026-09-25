import { afterAll, beforeAll, describe, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { hashPassword } from '../../src/utils/password.js';

/**
 * Integration — thread lock/unlock scope (Module 38 debt): BRANCH_ADMIN can lock a staff thread with
 * members from its branch; a BRANCH_ADMIN from another branch cannot; locked threads refuse sends.
 * ຕ້ອງມີ PostgreSQL (.env.test) + `pnpm db:seed`.
 */
const STAFF1 = { phone: '02055500001', password: 'Staff@12345' };
const STAFF2 = { phone: '02055500002', password: 'Staff@12345' };
const BA = { phone: '02000000001', password: 'Manager@12345' };
const OTHER_BA_PHONE = '02088860001';
const OTHER_BRANCH = 'ສາຂາທົດສອບ thread-lock';
const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

let app: Express;
let threadId = '';

async function login(c: { phone: string; password: string }) {
  const r = await request(app).post('/api/v1/auth/login').send(c);
  return { token: r.body.data.tokens.accessToken as string, id: r.body.data.user.id as string };
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { phone: OTHER_BA_PHONE } });
  await prisma.branch.deleteMany({ where: { name: OTHER_BRANCH } });
}

beforeAll(async () => {
  app = createApp();
  await cleanup();
});

afterAll(async () => {
  if (threadId) {
    await prisma.chatMessage.deleteMany({ where: { threadId } });
    await prisma.conversationParticipant.deleteMany({ where: { threadId } });
    await prisma.chatThread.delete({ where: { id: threadId } }).catch(() => undefined);
  }
  await cleanup();
  await prisma.$disconnect();
});

describe('thread lock scope', () => {
  it('own-branch admin locks/unlocks; another branch admin gets 403; locked thread refuses sends', async () => {
    const s1 = await login(STAFF1);
    const s2 = await login(STAFF2);
    const created = await request(app)
      .post('/api/v1/conversations')
      .set(...bearer(s1.token))
      .send({ type: 'STAFF_INTERNAL', participantIds: [s2.id] });
    threadId = created.body.data.id;

    const other = await prisma.branch.create({ data: { name: OTHER_BRANCH, address: 'x', phone: '02000000997' } });
    await prisma.user.create({
      data: { name: 'BA other', phone: OTHER_BA_PHONE, password: await hashPassword('Branch@12345'), role: 'BRANCH_ADMIN', branchId: other.id },
    });
    const foreign = await login({ phone: OTHER_BA_PHONE, password: 'Branch@12345' });
    await request(app).patch(`/api/v1/conversations/${threadId}/lock`).set(...bearer(foreign.token)).send({ isLocked: true }).expect(403);

    const ba = await login(BA);
    await request(app).patch(`/api/v1/conversations/${threadId}/lock`).set(...bearer(ba.token)).send({ isLocked: true }).expect(200);
    await request(app).post(`/api/v1/chat/threads/${threadId}/messages`).set(...bearer(s1.token)).send({ body: 'x' }).expect(409);
    await request(app).patch(`/api/v1/conversations/${threadId}/lock`).set(...bearer(ba.token)).send({ isLocked: false }).expect(200);
    await request(app).post(`/api/v1/chat/threads/${threadId}/messages`).set(...bearer(s1.token)).send({ body: 'ok' }).expect(201);
  });
});

describe('moderation blocks view', () => {
  it('admins see all blocks with a per-user count; customers cannot', async () => {
    const admin = await login({ phone: '02000000000', password: 'Admin@12345' });
    const res = await request(app).get('/api/v1/conversations/moderation/blocks').set(...bearer(admin.token));
    if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
    if (!Array.isArray(res.body.data)) throw new Error('expected an array');
    const s1 = await login(STAFF1);
    const denied = await request(app).get('/api/v1/conversations/moderation/blocks').set(...bearer(s1.token));
    if (denied.status !== 403) throw new Error(`expected 403, got ${denied.status}`);
  });
});
