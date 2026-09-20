import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { Job } from 'bullmq';
import { createApp } from '../../src/app.js';
import { prisma } from '../../src/config/database.js';
import { processChatLock } from '../../src/jobs/chat-lock.job.js';
import type { ChatLockJobData } from '../../src/jobs/queues.js';

/**
 * Integration — Phase 8 Platform-Wide Messaging (Module 38), Wave 8C: auto-lock sweep.
 *   CONSULTATION thread ຜູກ appointment ທີ່ COMPLETED ເກີນ N ວັນ → sweep lock ອັດຕະໂນມັດ + ບັນທຶກ
 *   AuditLog (system action, userId null) · thread ອື່ນທີ່ຍັງບໍ່ຄົບກຳນົດ → ບໍ່ຖືກແຕະ.
 */
const BRANCH_ID = '11111111-1111-1111-1111-111111111111';
const HAIRCUT_ID = '33333333-0000-0000-0000-000000000001';
const CUST_PHONE = '02088880066';

const fakeJob = { name: 'test' } as Job<ChatLockJobData>;

function futureDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

async function wipe(): Promise<void> {
  const users = await prisma.user.findMany({ where: { phone: CUST_PHONE }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (ids.length) {
    const appts = await prisma.appointment.findMany({
      where: { customerId: { in: ids } },
      select: { id: true },
    });
    const aids = appts.map((a) => a.id);
    if (aids.length) {
      await prisma.auditLog.deleteMany({ where: { entityName: 'conversation' } });
      await prisma.chatMessage.deleteMany({ where: { thread: { appointmentId: { in: aids } } } });
      await prisma.chatThread.deleteMany({ where: { appointmentId: { in: aids } } });
    }
    await prisma.appointment.deleteMany({ where: { customerId: { in: ids } } });
  }
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

describe('Phase 8 — Platform-Wide Messaging, Wave 8C (auto-lock sweep)', () => {
  let app: Express;
  let custToken: string;

  beforeAll(async () => {
    app = createApp();
    await wipe();

    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Chat Lock QA', phone: CUST_PHONE, password: 'Passw0rd!' });
    custToken = reg.body.data.tokens.accessToken as string;
  });

  afterAll(async () => {
    await wipe();
    await prisma.$disconnect();
  });

  async function bookAndOpenThread(): Promise<string> {
    const avail = await request(app)
      .get(`/api/v1/booking/availability?branchId=${BRANCH_ID}&serviceId=${HAIRCUT_ID}&date=${futureDate()}`)
      .set('Authorization', `Bearer ${custToken}`);
    const slot = (avail.body.data.slots as Array<{ staffProfileId: string; startAt: string }>)[0]!;

    const booked = await request(app)
      .post('/api/v1/booking/appointments/me')
      .set('Authorization', `Bearer ${custToken}`)
      .send({
        branchId: BRANCH_ID,
        serviceId: HAIRCUT_ID,
        staffProfileId: slot.staffProfileId,
        startAt: slot.startAt,
      });
    const appointmentId = booked.body.data.id as string;

    const thread = await request(app)
      .get(`/api/v1/chat/appointments/${appointmentId}/thread`)
      .set('Authorization', `Bearer ${custToken}`);
    return thread.body.data.id as string;
  }

  it('ຫ້ອງທີ່ຜູກ appointment COMPLETED ເກີນກຳນົດ → ຖືກ lock ອັດຕະໂນມັດ + ບັນທຶກ AuditLog', async () => {
    const threadId = await bookAndOpenThread();
    const oldEndAt = new Date();
    oldEndAt.setUTCDate(oldEndAt.getUTCDate() - 30);
    await prisma.appointment.update({
      where: { id: (await prisma.chatThread.findUniqueOrThrow({ where: { id: threadId } })).appointmentId! },
      data: { status: 'COMPLETED', endAt: oldEndAt },
    });

    await processChatLock(fakeJob);

    const locked = await prisma.chatThread.findUniqueOrThrow({ where: { id: threadId } });
    expect(locked.isLocked).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { entityName: 'conversation', entityId: threadId, action: 'conversation.auto_locked' },
    });
    expect(audit).not.toBeNull();
  });

  it('ຫ້ອງທີ່ appointment ຍັງບໍ່ຄົບກຳນົດ (ຫາກໍ່ COMPLETED) → ບໍ່ຖືກ lock', async () => {
    const threadId = await bookAndOpenThread();
    await prisma.appointment.update({
      where: { id: (await prisma.chatThread.findUniqueOrThrow({ where: { id: threadId } })).appointmentId! },
      data: { status: 'COMPLETED', endAt: new Date() },
    });

    await processChatLock(fakeJob);

    const stillOpen = await prisma.chatThread.findUniqueOrThrow({ where: { id: threadId } });
    expect(stillOpen.isLocked).toBe(false);
  });
});
