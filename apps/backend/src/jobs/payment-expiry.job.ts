import type { Job } from 'bullmq';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import type { PaymentExpiryJobData } from './queues.js';

/**
 * Wave 10A (ອຸດ H1) — QR/deposit intent `PaymentTransaction` ສະຖານະ PENDING ທີ່ໝົດອາຍຸແລ້ວ
 * (`expiresAt` ຜ່ານໄປແລ້ວ) ຖືກໝາຍເປັນ EXPIRED. ກັນ orphan row ຄ້າງໄວ້ຕະຫຼອດ ແລະ ກັນ settle-mock/
 * webhook ຮັບຮອງ QR ເກົ່າ.
 */
export async function processPaymentExpiry(job: Job<PaymentExpiryJobData>): Promise<void> {
  const { count } = await prisma.paymentTransaction.updateMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
  logger.info({ expired: count, job: job.name }, 'payment expiry sweep processed');
}
