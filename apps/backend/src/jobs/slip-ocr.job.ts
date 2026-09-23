import type { Job } from 'bullmq';
import { processSlip } from '../modules/payments-treasury/slips/slips.service.js';
import type { SlipOcrJobData } from './queues.js';

/** ໂມດູນ 39 W3 — ອ່ານ OCR + ຄິດຄະແນນ match ຂອງສະລິບໜຶ່ງໃບ. `processSlip` idempotent ແລະ ບໍ່ throw ເມື່ອ OCR ລົ້ມ. */
export async function processSlipOcr(job: Job<SlipOcrJobData>): Promise<void> {
  await processSlip(job.data.slipId);
}
