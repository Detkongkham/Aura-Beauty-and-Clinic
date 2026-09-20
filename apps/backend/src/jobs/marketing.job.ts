import type { Job } from 'bullmq';
import { logger } from '../config/logger.js';
import { runAllActiveCampaigns } from '../modules/marketing/marketing.service.js';
import type { MarketingJobData } from './queues.js';

/**
 * Automated CRM Marketing sweep (Module 24) — repeatable ທຸກມື້ 08:00.
 * ຣັນທຸກແຄມເປນ active: birthday / win-back / festival.
 * `CampaignRecipient` (unique campaignId+userId) + `NotificationLog.dedupeKey` ກັນສົ່ງຊ້ຳ.
 */
export async function processMarketing(job: Job<MarketingJobData>): Promise<void> {
  const results = await runAllActiveCampaigns();
  const totals = results.reduce(
    (acc, r) => ({ matched: acc.matched + r.matched, sent: acc.sent + r.sent }),
    { matched: 0, sent: 0 },
  );
  logger.info({ campaigns: results.length, ...totals, job: job.name }, 'marketing sweep processed');
}
