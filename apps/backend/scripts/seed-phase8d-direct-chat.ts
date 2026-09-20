/**
 * Demo/QA seed — Phase 8 Module 38 Wave 8D (DIRECT customer↔customer chat).
 * Idempotent (safe to re-run): upserts a second demo customer with `allowDirectMessages` on,
 * opens a DIRECT thread with the existing seed customer (`02099900001`), adds a few messages,
 * and files one PENDING `ChatReport` so the web-admin moderation page has something to show.
 *
 * Run: `pnpm --filter @abcp/backend exec tsx scripts/seed-phase8d-direct-chat.ts`
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const HASH = (pw: string): string => bcrypt.hashSync(pw, 12);

async function main(): Promise<void> {
  const customerA = await prisma.user.findUnique({ where: { phone: '02099900001' } });
  if (!customerA) {
    throw new Error('ບໍ່ພົບ customer ຫຼັກ 02099900001 — ຣັນ `pnpm db:seed` ກ່ອນ');
  }
  await prisma.user.update({ where: { id: customerA.id }, data: { allowDirectMessages: true } });

  const customerB = await prisma.user.upsert({
    where: { phone: '02099900002' },
    update: { allowDirectMessages: true },
    create: {
      name: 'ນາງ ສີດາ ພົມມະວົງ',
      phone: '02099900002',
      password: HASH('Customer@12345'),
      role: 'CUSTOMER',
      branchId: customerA.branchId,
      allowDirectMessages: true,
      loyaltyAccount: { create: {} },
    },
  });

  let thread = await prisma.chatThread.findFirst({
    where: {
      type: 'DIRECT',
      participants: { some: { userId: customerA.id } },
      AND: { participants: { some: { userId: customerB.id } } },
    },
  });
  if (!thread) {
    thread = await prisma.chatThread.create({
      data: {
        type: 'DIRECT',
        participants: { create: [{ userId: customerA.id }, { userId: customerB.id }] },
      },
    });
  }

  const existingMessages = await prisma.chatMessage.count({ where: { threadId: thread.id } });
  if (existingMessages === 0) {
    const m1 = await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        senderId: customerA.id,
        senderRole: 'CUSTOMER',
        body: 'ສະບາຍດີ! ເຈົ້າຈອງບໍລິການສະປາທີ່ນີ້ບໍ່? ດີບໍ່?',
      },
    });
    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        senderId: customerB.id,
        senderRole: 'CUSTOMER',
        body: 'ດີຫຼາຍເລີຍເອີ້ຍ! ຊ່າງໃຫ້ບໍລິການດີ ແນະນຳໆ',
      },
    });
    await prisma.chatThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });

    const existingReport = await prisma.chatReport.findFirst({ where: { conversationId: thread.id } });
    if (!existingReport) {
      await prisma.chatReport.create({
        data: {
          conversationId: thread.id,
          messageId: m1.id,
          reportedById: customerB.id,
          reason: 'ຂໍ້ຄວາມນີ້ເບິ່ງຄືວ່າແປກໆ (seed ຕົວຢ່າງສຳລັບ QA moderation queue)',
        },
      });
    }
  }

  console.log('✅ Phase 8D demo seed ສຳເລັດ', {
    customerA: customerA.phone,
    customerB: customerB.phone,
    threadId: thread.id,
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
