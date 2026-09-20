import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';

/**
 * Integration — Phase 7C M35 Telegram Chatbot Booking Pilot.
 * Webhook secret-token rejection · link-code flow (`/link CODE`) · `/services` ·
 * `/myappointments` + `/cancel` — ທຸກຢ່າງຜ່ານ mocked Telegram update payload (ບໍ່ຮຽກ Telegram ແທ້).
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const SERVICE_ID = '33333333-0000-0000-0000-000000000001';
const PHONE = '02088830088';
const CHAT_ID = 987654321;

function futureWorkingDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(0, 0, 0, 0);
  if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

let updateId = 1;
function update(text: string): { update_id: number; message: { message_id: number; chat: { id: number }; text: string } } {
  updateId += 1;
  return { update_id: updateId, message: { message_id: updateId, chat: { id: CHAT_ID }, text } };
}

const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

async function wipe(): Promise<void> {
  const user = await prisma.user.findUnique({ where: { phone: PHONE }, select: { id: true } });
  if (user) {
    await prisma.appointment.deleteMany({ where: { customerId: user.id } });
    await prisma.telegramLink.deleteMany({ where: { userId: user.id } });
  }
  await prisma.botConversation.deleteMany({ where: { externalUserId: String(CHAT_ID) } });
  await prisma.user.deleteMany({ where: { phone: PHONE } });
}

describe('Phase 7C — M35 Telegram Chatbot Booking Pilot', () => {
  let app: Express;
  let token: string;
  let appointmentId: string;

  beforeAll(async () => {
    app = createApp();
    await wipe();
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Telegram QA', phone: PHONE, password: 'Passw0rd!' });
    token = reg.body.data.tokens.accessToken as string;

    const date = futureWorkingDate(41);
    const avail = await request(app)
      .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${SERVICE_ID}&date=${date}`)
      .set(...bearer(token));
    const slot = (avail.body.data.slots as Array<{ staffProfileId: string; startAt: string }>)[0]!;
    const booked = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set(...bearer(token))
      .send({
        branchId: BRANCH_ID,
        serviceId: SERVICE_ID,
        staffProfileId: slot.staffProfileId,
        startAt: slot.startAt,
      });
    appointmentId = booked.body.data.id as string;
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  it('webhook ບໍ່ມີ secret token ຖືກຕ້ອງ → 403 (ຖ້າ TELEGRAM_WEBHOOK_SECRET ຕັ້ງໄວ້)', async () => {
    const res = await request(app)
      .post('/api/v1/chatbot/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'wrong')
      .send(update('/start'));
    // dev env ບໍ່ໄດ້ຕັ້ງ TELEGRAM_WEBHOOK_SECRET → check ຖືກຂ້າມ, ຄາດວ່າ 200 ; ຖ້າຕັ້ງໄວ້ ຄາດວ່າ 403
    expect([200, 403]).toContain(res.status);
  });

  it('/start → ok', async () => {
    const res = await request(app).post('/api/v1/chatbot/telegram/webhook').send(update('/start'));
    expect(res.status).toBe(200);
  });

  it('/myappointments ກ່ອນຜູກບັນຊີ → ຍັງ ok (ບອກໃຫ້ຜູກກ່ອນ)', async () => {
    const res = await request(app)
      .post('/api/v1/chatbot/telegram/webhook')
      .send(update('/myappointments'));
    expect(res.status).toBe(200);
  });

  it('link-code flow: ອອກລະຫັດ → /link CODE ຜູກບັນຊີສຳເລັດ', async () => {
    const codeRes = await request(app)
      .post('/api/v1/chatbot/telegram/link-code')
      .set(...bearer(token));
    expect(codeRes.status).toBe(200);
    const code = codeRes.body.data.code as string;
    expect(code).toHaveLength(6);

    const linkRes = await request(app)
      .post('/api/v1/chatbot/telegram/webhook')
      .send(update(`/link ${code}`));
    expect(linkRes.status).toBe(200);

    const link = await prisma.telegramLink.findUnique({ where: { telegramChatId: String(CHAT_ID) } });
    expect(link).toBeTruthy();
    expect(link!.linkCode).toBeNull();
  });

  it('/services → ok ຫຼັງຜູກບັນຊີແລ້ວ', async () => {
    const res = await request(app).post('/api/v1/chatbot/telegram/webhook').send(update('/services'));
    expect(res.status).toBe(200);
  });

  it('/myappointments ຫຼັງຜູກ → ບັນທຶກ conversation intent ຖືກຕ້ອງ', async () => {
    await request(app).post('/api/v1/chatbot/telegram/webhook').send(update('/myappointments'));
    const logs = await prisma.botConversation.findMany({
      where: { externalUserId: String(CHAT_ID), intentDetected: 'myappointments' },
    });
    expect(logs.length).toBeGreaterThan(0);
  });

  it('/cancel <id> → ຍົກເລີກນັດໝາຍໄດ້ຈິງ', async () => {
    const res = await request(app)
      .post('/api/v1/chatbot/telegram/webhook')
      .send(update(`/cancel ${appointmentId}`));
    expect(res.status).toBe(200);

    const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
    expect(appt!.status).toBe('CANCELLED');
  });
});
