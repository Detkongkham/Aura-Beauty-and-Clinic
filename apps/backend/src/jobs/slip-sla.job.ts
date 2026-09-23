import type { Job } from 'bullmq';
import { logger } from '../config/logger.js';
import { runSlipSlaAlerts } from '../modules/payments-treasury/slips/slips.service.js';
import type { SlipSlaJobData } from './queues.js';

/** ໂມດູນ 39 S4 — ສະລິບລໍກວດເກີນ SLA ຂອງສາຂາ → ແຈ້ງ SUPER_ADMIN/BRANCH_ADMIN (dedupe ຕໍ່ໃບທີ່ເກີນລ່າສຸດ). */
export async function processSlipSla(job: Job<SlipSlaJobData>): Promise<void> {
  const out = await runSlipSlaAlerts();
  if (out.notified > 0) logger.info({ ...out, job: job.name }, 'slip SLA sweep processed');
}
