/**
 * Demo/QA seed — Phase 8 Module 38 Wave 8B (STAFF_INTERNAL chat). Rebuilds the manual-testing
 * conversation between the seeded staff accounts that got wiped by `conversations.test.ts`'s
 * blanket `wipe()` running against the dev DB before test/dev DB isolation was added (`.env.test`,
 * see [[backend-tests-need-db-isolation]] / phase8-progress.md "sixth round"). Idempotent — safe to
 * re-run; skips inserting messages if the thread already has any.
 *
 * Run: `pnpm --filter @abcp/backend exec tsx scripts/seed-phase8b-staff-chat.ts`
 */
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const STORAGE_LOCAL_DIR = process.env.STORAGE_LOCAL_DIR ?? './uploads';
const STORAGE_PUBLIC_URL = process.env.STORAGE_PUBLIC_URL ?? 'http://localhost:4000/uploads';

// ຮູບ demo — ຢືມຮູບ skin-analysis ທີ່ມີຢູ່ແລ້ວມາໃຊ້ແທນການອັບໂຫຼດຮູບໃໝ່ (script ນີ້ບໍ່ມີ UI ໃຫ້ຖ່າຍຮູບ).
const DEMO_SOURCE_IMAGE = 'uploads/skin-analysis/109da1d2-984f-4fbb-ad3f-d539af5e5bec/cff00806-36f2-41cd-ad2e-88b9c4adc41c.png';

async function main(): Promise<void> {
  const [dala, vannasone, admin] = await Promise.all([
    prisma.user.findUnique({ where: { phone: '02055500001' } }),
    prisma.user.findUnique({ where: { phone: '02055500002' } }),
    prisma.user.findUnique({ where: { phone: '02000000000' } }),
  ]);
  if (!dala || !vannasone || !admin) {
    throw new Error('ບໍ່ພົບ staff/admin ຫຼັກ — ຣັນ `pnpm db:seed` ກ່ອນ');
  }
  const targetIds = [dala.id, vannasone.id, admin.id];

  let thread = await prisma.chatThread.findFirst({
    where: { type: 'STAFF_INTERNAL', AND: targetIds.map((userId) => ({ participants: { some: { userId } } })) },
    include: { participants: true },
  });
  if (thread && thread.participants.length !== targetIds.length) thread = null;

  if (!thread) {
    thread = await prisma.chatThread.create({
      data: { type: 'STAFF_INTERNAL', participants: { create: targetIds.map((userId) => ({ userId })) } },
      include: { participants: true },
    });
  }

  const existingMessages = await prisma.chatMessage.count({ where: { threadId: thread.id } });
  if (existingMessages === 0) {
    const key = `chat/${thread.id}/${randomUUID()}.png`;
    const destPath = join(process.cwd(), STORAGE_LOCAL_DIR, key);
    await mkdir(dirname(destPath), { recursive: true });
    await copyFile(join(process.cwd(), DEMO_SOURCE_IMAGE), destPath);
    const mediaUrl = `${STORAGE_PUBLIC_URL.replace(/\/$/, '')}/${key}`;

    await prisma.chatMessage.create({
      data: { threadId: thread.id, senderId: admin.id, senderRole: 'SUPER_ADMIN', body: 'ສະບາຍດີ' },
    });
    await prisma.chatMessage.create({
      data: { threadId: thread.id, senderId: dala.id, senderRole: 'STAFF', body: 'ໂດຍສະບາຍດີ' },
    });
    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        senderId: dala.id,
        senderRole: 'STAFF',
        body: '📷 ຮູບພາບ',
        messageType: 'IMAGE',
        mediaUrl,
      },
    });
    await prisma.chatThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });
  }

  console.log('✅ Phase 8B staff-chat demo seed ສຳເລັດ', {
    threadId: thread.id,
    participants: [dala.name, vannasone.name, admin.name],
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
