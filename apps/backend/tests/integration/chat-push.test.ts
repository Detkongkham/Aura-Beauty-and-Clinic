import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

/**
 * Integration — push on new chat messages (Phase 7C.2 / 8B debt): the other participants get one
 * push (not the sender), and a burst from the same sender within a minute pushes only once.
 * ຕ້ອງມີ PostgreSQL (.env.test) + `pnpm db:seed`.
 */
const pushOnly = vi.fn(async () => true);
vi.mock('../../src/services/push.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  pushOnly,
}));

const { createApp } = await import('../../src/app.js');
const { prisma } = await import('../../src/config/database.js');

const STAFF1 = { phone: '02055500001', password: 'Staff@12345' };
const STAFF2 = { phone: '02055500002', password: 'Staff@12345' };
const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

let app: Express;
let threadId = '';

async function login(c: { phone: string; password: string }) {
  const r = await request(app).post('/api/v1/auth/login').send(c);
  return { token: r.body.data.tokens.accessToken as string, id: r.body.data.user.id as string };
}

/** Push is fire-and-forget after the response — wait for it to settle. */
const settle = () => new Promise((r) => setTimeout(r, 150));

beforeAll(async () => {
  app = createApp();
});

afterAll(async () => {
  if (threadId) {
    await prisma.chatMessage.deleteMany({ where: { threadId } });
    await prisma.conversationParticipant.deleteMany({ where: { threadId } });
    await prisma.chatThread.delete({ where: { id: threadId } }).catch(() => undefined);
  }
  await prisma.$disconnect();
});

describe('chat push notifications', () => {
  it('pushes the other participant once per burst, never the sender', async () => {
    const s1 = await login(STAFF1);
    const s2 = await login(STAFF2);
    const created = await request(app)
      .post('/api/v1/conversations')
      .set(...bearer(s1.token))
      .send({ type: 'STAFF_INTERNAL', participantIds: [s2.id] });
    expect(created.status).toBe(201);
    threadId = created.body.data.id;

    pushOnly.mockClear();
    await request(app).post(`/api/v1/chat/threads/${threadId}/messages`).set(...bearer(s1.token)).send({ body: 'ສະບາຍດີ' }).expect(201);
    await settle();
    expect(pushOnly).toHaveBeenCalledTimes(1);
    expect(pushOnly).toHaveBeenCalledWith(
      expect.objectContaining({ userId: s2.id, type: 'CHAT_MESSAGE', body: 'ສະບາຍດີ', data: expect.objectContaining({ threadId }) }),
    );

    // Second message from the same sender inside the quiet window → no second push.
    await request(app).post(`/api/v1/chat/threads/${threadId}/messages`).set(...bearer(s1.token)).send({ body: 'ຢູ່ບໍ່' }).expect(201);
    await settle();
    expect(pushOnly).toHaveBeenCalledTimes(1);

    // A reply from the other side pushes the first sender.
    await request(app).post(`/api/v1/chat/threads/${threadId}/messages`).set(...bearer(s2.token)).send({ body: 'ຢູ່' }).expect(201);
    await settle();
    expect(pushOnly).toHaveBeenCalledTimes(2);
    expect(pushOnly).toHaveBeenLastCalledWith(expect.objectContaining({ userId: s1.id }));
  });
});
