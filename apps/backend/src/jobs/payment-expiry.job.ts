import type { Job } from 'bullmq';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import { replayStaleEvents } from '../modules/payments-treasury/payments-treasury.webhook.js';
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
  // Module 39 W2 — provider intent ທີ່ໝົດອາຍຸ + replay webhook ທີ່ຄ້າງ (process ລົ້ມກາງທາງ)
  const intents = await prisma.providerIntent.updateMany({
    where: { status: 'PENDING', expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
  const replay = await replayStaleEvents();
  logger.info(
    { expired: count, expiredIntents: intents.count, replay, job: job.name },
    'payment expiry sweep processed',
  );
}
