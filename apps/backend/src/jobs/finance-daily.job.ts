import type { Job } from 'bullmq';
import { logger } from '../config/logger.js';
import { expireLoyaltyPoints, recognizeGiftCardBreakage, refreshFxRates } from '../modules/finance-ledger/maintenance.js';
import type { FinanceDailyJobData } from './queues.js';

/** Wave 11 — ວຽກບັນຊີປະຈຳວັນ: FX feed (ຖ້າເປີດ), ຄະແນນໝົດອາຍຸ, breakage ບັດຂອງຂວັນ. ແຕ່ລະສ່ວນລົ້ມແຍກກັນ. */
export async function processFinanceDaily(job: Job<FinanceDailyJobData>): Promise<void> {
  const fx = await refreshFxRates().catch((err) => ({ failed: (err as Error).message }));
  const points = await expireLoyaltyPoints().catch((err) => ({ error: (err as Error).message }));
  const breakage = await recognizeGiftCardBreakage().catch((err) => ({ error: (err as Error).message }));
  logger.info({ job: job.name, fx, points, breakage }, 'finance daily processed');
}
