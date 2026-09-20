import type { Job } from 'bullmq';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import { notifyUser } from '../services/push.js';
import type { WaitlistJobData } from './queues.js';

/**
 * Smart Waitlist Backfill (Module 20).
 * ເມື່ອຄິວຖືກຍົກເລີກ → enqueue job ນີ້. ຫາຄົນໃນ Waitlist ຂອງບໍລິການ/ວັນນັ້ນ
 * ແລ້ວແຈ້ງເຕືອນ (ດຶງມາສຽບແທນ). ບໍ່ລຶບ entry — dedupeKey ກັນສົ່ງຊ້ຳຕໍ່ slot ດຽວ.
 */
export async function processWaitlist(job: Job<WaitlistJobData>): Promise<void> {
  const preferredDate = new Date(job.data.freedFrom.slice(0, 10));

  const candidates = await prisma.waitlist.findMany({
    where: {
      branchId: job.data.branchId,
      serviceId: job.data.serviceId,
      preferredDate,
    },
    orderBy: { createdAt: 'asc' },
    take: 10,
    select: {
      id: true,
      customerId: true,
      service: { select: { name: true } },
      branch: { select: { name: true } },
    },
  });

  let notified = 0;
  for (const c of candidates) {
    const res = await notifyUser({
      userId: c.customerId,
      type: 'WAITLIST_SLOT_OPEN',
      title: 'ມີຄິວວ່າງແລ້ວ! 🎉',
      body: `${c.service.name} ທີ່ ${c.branch.name} ມີຄິວວ່າງໃນວັນທີ່ທ່ານລໍຖ້າ — ຈອງດ່ວນກ່ອນເຕັມ`,
      data: {
        branchId: job.data.branchId,
        serviceId: job.data.serviceId,
        freedFrom: job.data.freedFrom,
      },
      dedupeKey: `waitlist:${c.id}:${job.data.freedFrom}`,
    });
    if (res.delivered) notified += 1;
  }

  logger.info({ candidates: candidates.length, notified, ...job.data }, 'waitlist backfill processed');
}
