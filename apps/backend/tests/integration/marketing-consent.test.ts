import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { inQuietHours, makeUnsubscribeToken } from '../../src/modules/marketing/consent.service.js';

/**
 * Integration — Wave 10G ຄວາມຍິນຍອມການຕະຫຼາດ (consent / suppression / policy).
 *   register opt-in ຊັດເຈນ · runCampaign ກັ່ນຕອງ consent + suppression + frequency cap + quiet hours ·
 *   ຖອນຕົວດ້ວຍ token · event ຫຼັກຖານ append-only · RBAC.
 * ຕ້ອງມີ PostgreSQL + `pnpm db:seed`.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_PHONE = '02000000000';
const ADMIN_PASSWORD = 'Admin@12345';
const PHONES = ['02077710001', '02077710002', '02077710003', '02077710004'];
const bearer = (tk: string): [string, string] => ['Authorization', `Bearer ${tk}`];

let app: Express;
let adminToken = '';
let campaignId = '';
const ids: string[] = [];

async function register(phone: string, marketingOptIn?: boolean) {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: `Consent ${phone}`, phone, password: 'Passw0rd!x', ...(marketingOptIn === undefined ? {} : { marketingOptIn }) });
  expect(res.status).toBe(201);
  return { id: res.body.data.user.id as string, token: res.body.data.tokens.accessToken as string };
}

async function makeBirthdayCustomers(): Promise<void> {
  const now = new Date();
  await prisma.user.updateMany({
    where: { id: { in: ids } },
    data: { branchId: BRANCH_ID, dateOfBirth: new Date(Date.UTC(1990, now.getMonth(), now.getDate())) },
  });
}

async function setPolicy(patch: Partial<{ quietHoursEnabled: boolean; quietStart: string; quietEnd: string; weeklyCap: number }>) {
  const res = await request(app)
    .put('/api/v1/marketing/policy')
    .set(...bearer(adminToken))
    .send({ quietHoursEnabled: false, quietStart: '21:00', quietEnd: '08:00', weeklyCap: 0, ...patch });
  expect(res.status).toBe(200);
}

const run = async () =>
  (await request(app).post(`/api/v1/marketing/campaigns/${campaignId}/run`).set(...bearer(adminToken))).body.data;

async function cleanup(): Promise<void> {
  const users = await prisma.user.findMany({ where: { phone: { in: PHONES } }, select: { id: true } });
  const uids = users.map((u) => u.id);
  await prisma.campaignRecipient.deleteMany({ where: { userId: { in: uids } } });
  await prisma.notificationLog.deleteMany({ where: { userId: { in: uids } } });
  await prisma.marketingConsentEvent.deleteMany({ where: { userId: { in: uids } } });
  await prisma.suppressionEntry.deleteMany({ where: { identifier: { in: uids } } });
  await prisma.marketingConsent.deleteMany({ where: { userId: { in: uids } } });
  await prisma.loyaltyAccount.deleteMany({ where: { userId: { in: uids } } });
  await prisma.user.deleteMany({ where: { id: { in: uids } } });
  await prisma.marketingCampaign.deleteMany({ where: { name: 'consent-test' } });
  await prisma.appSetting.deleteMany({ where: { key: 'marketing-policy' } });
}

beforeAll(async () => {
  app = createApp();
  await cleanup();
  const login = await request(app).post('/api/v1/auth/login').send({ phone: ADMIN_PHONE, password: ADMIN_PASSWORD });
  adminToken = login.body.data.tokens.accessToken;
  const c = await request(app)
    .post('/api/v1/marketing/campaigns')
    .set(...bearer(adminToken))
    .send({ branchId: BRANCH_ID, name: 'consent-test', type: 'BIRTHDAY', message: { title: 'Hi', body: 'Promo' }, triggerRule: { daysBefore: 0 } });
  expect(c.status).toBe(201);
  campaignId = c.body.data.id;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.campaignRecipient.deleteMany({ where: { campaignId } });
  await prisma.notificationLog.deleteMany({ where: { userId: { in: ids } } });
});

describe('Wave 10G — consent', () => {
  let optedIn: Awaited<ReturnType<typeof register>>;
  let notOptedIn: Awaited<ReturnType<typeof register>>;

  it('register: opt-in ບັນທຶກ consent + event; ບໍ່ຕິກ = ບໍ່ມີແຖວ', async () => {
    optedIn = await register(PHONES[0]!, true);
    notOptedIn = await register(PHONES[1]!);
    ids.push(optedIn.id, notOptedIn.id);
    const yes = await prisma.marketingConsent.findUnique({ where: { userId_channel: { userId: optedIn.id, channel: 'PUSH' } } });
    expect(yes?.granted).toBe(true);
    expect(yes?.source).toBe('register');
    expect(await prisma.marketingConsent.count({ where: { userId: notOptedIn.id } })).toBe(0);
    expect(await prisma.marketingConsentEvent.count({ where: { userId: optedIn.id } })).toBe(1);
  });

  it('runCampaign ສົ່ງສະເພາະຄົນທີ່ opt-in', async () => {
    await makeBirthdayCustomers();
    await setPolicy({});
    const r = await run();
    expect(r.matched).toBe(2);
    expect(r.sent).toBe(1);
    expect(r.skippedNoConsent).toBe(1);
    const rec = await prisma.campaignRecipient.findMany({ where: { campaignId } });
    expect(rec.map((x) => x.userId)).toEqual([optedIn.id]);
  });

  it('suppression ຊະນະ consent', async () => {
    const add = await request(app)
      .post('/api/v1/marketing/suppressions')
      .set(...bearer(adminToken))
      .send({ identifier: optedIn.id, channel: 'PUSH', reason: 'COMPLAINT' });
    expect(add.status).toBe(201);
    const r = await run();
    expect(r.sent).toBe(0);
    expect(r.skippedSuppressed).toBe(1);
    const prefs = await request(app).get('/api/v1/consent/me').set(...bearer(optedIn.token));
    expect(prefs.body.data.channels.find((c: { channel: string }) => c.channel === 'PUSH')).toMatchObject({ granted: false, suppressed: true });
    await request(app).delete(`/api/v1/marketing/suppressions/${add.body.data.id}`).set(...bearer(adminToken)).expect(200);
    expect((await run()).sent).toBe(1);
  });

  it('PUT /consent/me ເປີດ/ປິດ ແລະ ເກັບ event ທຸກຄັ້ງ', async () => {
    const on = await request(app).put('/api/v1/consent/me').set(...bearer(notOptedIn.token)).send({ channel: 'PUSH', granted: true });
    expect(on.status).toBe(200);
    expect(on.body.data.channels.find((c: { channel: string }) => c.channel === 'PUSH').granted).toBe(true);
    const off = await request(app).put('/api/v1/consent/me').set(...bearer(notOptedIn.token)).send({ channel: 'PUSH', granted: false });
    expect(off.body.data.channels.find((c: { channel: string }) => c.channel === 'PUSH').granted).toBe(false);
    const events = await prisma.marketingConsentEvent.findMany({ where: { userId: notOptedIn.id }, orderBy: { createdAt: 'asc' } });
    expect(events.map((e) => e.granted)).toEqual([true, false]);
    expect(events.every((e) => e.source === 'profile')).toBe(true);
  });

  it('ຖອນຕົວດ້ວຍ token: ໃຊ້ໄດ້, token ປອມ → 400', async () => {
    const bad = await request(app).post('/api/v1/consent/unsubscribe').send({ token: `${makeUnsubscribeToken(optedIn.id, 'PUSH')}x` });
    expect(bad.status).toBe(400);
    const ok = await request(app).post('/api/v1/consent/unsubscribe').send({ token: makeUnsubscribeToken(optedIn.id, 'PUSH') });
    expect(ok.status).toBe(200);
    const r = await run();
    expect(r.sent).toBe(0);
    // optedIn (ຖອນຕົວດ້ວຍ token) + notOptedIn (ເປີດແລ້ວປິດໃນ test ກ່ອນ → suppression UNSUBSCRIBE)
    expect(r.skippedSuppressed).toBe(2);
    // opt-in ໃໝ່ດ້ວຍຕົນເອງ ລ້າງການຖອນຕົວ
    await request(app).put('/api/v1/consent/me').set(...bearer(optedIn.token)).send({ channel: 'PUSH', granted: true }).expect(200);
    expect((await run()).sent).toBe(1);
  });

  it('frequency cap: ເກີນເພດານ/ອາທິດ → ຂ້າມ', async () => {
    await setPolicy({ weeklyCap: 1 });
    await prisma.notificationLog.create({ data: { userId: optedIn.id, type: 'CAMPAIGN', title: 't', body: 'b' } });
    const r = await run();
    expect(r.sent).toBe(0);
    expect(r.skippedFrequencyCap).toBe(1);
    await setPolicy({ weeklyCap: 0 });
  });

  it('quiet hours: ບໍ່ສົ່ງ ແລະ ບໍ່ບັນທຶກ recipient (sweep ຕໍ່ໄປສົ່ງໄດ້)', async () => {
    await setPolicy({ quietHoursEnabled: true, quietStart: '00:00', quietEnd: '23:59' });
    const r = await run();
    expect(r.deferredQuietHours).toBe(true);
    expect(r.sent).toBe(0);
    expect(await prisma.campaignRecipient.count({ where: { campaignId } })).toBe(0);
    await setPolicy({});
    expect((await run()).sent).toBe(1);
  });

  it('consent-summary + RBAC (ລູກຄ້າເຂົ້າ admin route ບໍ່ໄດ້)', async () => {
    const s = await request(app).get('/api/v1/marketing/consent-summary').set(...bearer(adminToken));
    expect(s.status).toBe(200);
    expect(s.body.data.channels).toHaveLength(4);
    await request(app).get('/api/v1/marketing/suppressions').set(...bearer(optedIn.token)).expect(403);
    await request(app).get('/api/v1/consent/me').expect(401);
  });
});

describe('inQuietHours (Vientiane)', () => {
  const policy = { quietHoursEnabled: true, quietStart: '21:00', quietEnd: '08:00', weeklyCap: 3 };
  it('ຂ້າມທ່ຽງຄືນ', () => {
    expect(inQuietHours(policy, new Date('2026-01-01T15:00:00Z'))).toBe(true); // 22:00 ວຽງຈັນ
    expect(inQuietHours(policy, new Date('2026-01-01T02:00:00Z'))).toBe(false); // 09:00
    expect(inQuietHours(policy, new Date('2026-01-01T20:00:00Z'))).toBe(true); // 03:00
  });
  it('ປິດ = ບໍ່ງຽບ', () => {
    expect(inQuietHours({ ...policy, quietHoursEnabled: false }, new Date('2026-01-01T15:00:00Z'))).toBe(false);
  });
});
