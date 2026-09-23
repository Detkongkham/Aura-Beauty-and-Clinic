import type { Job } from 'bullmq';
import { logger } from '../config/logger.js';
import { runReconciliationReminders } from '../modules/payments-treasury/reconciliation/reconciliation.service.js';
import type { ReconReminderJobData } from './queues.js';

/** ໂມດູນ 39 G9 — ເຕືອນ admin ທຸກເຊົ້າ: ມື້ວານຍັງບໍ່ກະທົບຍອດ / ສ່ວນຕ່າງໃຫຍ່ທີ່ຍັງບໍ່ອະທິບາຍ. */
export async function processReconReminder(job: Job<ReconReminderJobData>): Promise<void> {
  const out = await runReconciliationReminders();
  logger.info({ ...out, job: job.name }, 'reconciliation reminder sweep processed');
}
