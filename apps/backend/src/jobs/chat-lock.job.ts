import type { Job } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/database.js';
import type { ChatLockJobData } from './queues.js';

/**
 * Auto-lock CONSULTATION ChatThreads (Module 38 Wave 8C) — repeatable ທຸກມື້. ຫ້ອງແຊັດຍັງອ່ານໄດ້
 * (history), ພຽງແຕ່ສົ່ງຂໍ້ຄວາມໃໝ່ບໍ່ໄດ້ (ບັງຄັບຢູ່ `chat.service.postMessage`). ບໍ່ຜ່ານ HTTP request
 * ດັ່ງນັ້ນ audit-log middleware ບໍ່ໄດ້ບັນທຶກ — insert `AuditLog` ໂດຍກົງ (userId null = system action).
 */
export async function processChatLock(job: Job<ChatLockJobData>): Promise<void> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - env.CHAT_CONSULTATION_LOCK_AFTER_DAYS);

  const threads = await prisma.chatThread.findMany({
    where: {
      type: 'CONSULTATION',
      isLocked: false,
      appointmentId: { not: null },
      appointment: {
        status: { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] },
        endAt: { lte: cutoff },
      },
    },
    select: { id: true, branchId: true },
  });

  if (threads.length === 0) {
    logger.debug({ job: job.name }, 'chat auto-lock sweep: no threads to lock');
    return;
  }

  await prisma.$transaction([
    prisma.chatThread.updateMany({
      where: { id: { in: threads.map((t) => t.id) } },
      data: { isLocked: true },
    }),
    prisma.auditLog.createMany({
      data: threads.map((t) => ({
        branchId: t.branchId,
        userId: null,
        action: 'conversation.auto_locked',
        entityName: 'conversation',
        entityId: t.id,
      })),
    }),
  ]);

  logger.info({ locked: threads.length, job: job.name }, 'chat auto-lock sweep processed');
}
