import { Worker } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { QueueName, registerRepeatableJobs } from './queues.js';
import { processChatLock } from './chat-lock.job.js';
import { processReminder } from './reminder.job.js';
import { processWaitlist } from './waitlist.job.js';
import { processMarketing } from './marketing.job.js';
import { processHomeServiceSla } from './home-service-sla.job.js';
import { processStockReconciliation } from './stock-reconciliation.job.js';
import { processPaymentExpiry } from './payment-expiry.job.js';
import { processSlipOcr } from './slip-ocr.job.js';
import { processSlipSla } from './slip-sla.job.js';
import { processRecurringExpense } from './recurring-expense.job.js';
import { processReconReminder } from './reconciliation-reminder.job.js';
import { processLotExpiry } from './lot-expiry.job.js';

/** Bootstrap ທຸກ BullMQ worker. ຮຽກຈາກ src/jobs/main.ts (process ແຍກ). */
export function startWorkers(): Worker[] {
  const connection = createRedisConnection();

  const reminderWorker = new Worker(QueueName.REMINDER, processReminder, { connection, concurrency: 5 });
  const waitlistWorker = new Worker(QueueName.WAITLIST, processWaitlist, { connection, concurrency: 5 });
  const marketingWorker = new Worker(QueueName.MARKETING, processMarketing, { connection, concurrency: 1 });
  const chatLockWorker = new Worker(QueueName.CHAT_LOCK, processChatLock, { connection, concurrency: 1 });
  const homeServiceSlaWorker = new Worker(QueueName.HOME_SERVICE_SLA, processHomeServiceSla, {
    connection,
    concurrency: 1,
  });
  const stockReconcileWorker = new Worker(QueueName.STOCK_RECONCILE, processStockReconciliation, {
    connection,
    concurrency: 1,
  });
  const paymentExpiryWorker = new Worker(QueueName.PAYMENT_EXPIRY, processPaymentExpiry, {
    connection,
    concurrency: 1,
  });

  const recurringExpenseWorker = new Worker(QueueName.RECURRING_EXPENSE, processRecurringExpense, {
    connection,
    concurrency: 1,
  });

  const reconReminderWorker = new Worker(QueueName.RECON_REMINDER, processReconReminder, {
    connection,
    concurrency: 1,
  });

  // OCR ໜັກ CPU (WASM) — ຈຳກັດ 2 ພ້ອມກັນ
  const slipOcrWorker = new Worker(QueueName.SLIP_OCR, processSlipOcr, { connection, concurrency: 2 });

  const slipSlaWorker = new Worker(QueueName.SLIP_SLA, processSlipSla, { connection, concurrency: 1 });

  const lotExpiryWorker = new Worker(QueueName.LOT_EXPIRY, processLotExpiry, { connection, concurrency: 1 });

  const workers = [
    reminderWorker,
    waitlistWorker,
    marketingWorker,
    chatLockWorker,
    homeServiceSlaWorker,
    stockReconcileWorker,
    paymentExpiryWorker,
    recurringExpenseWorker,
    reconReminderWorker,
    slipOcrWorker,
    slipSlaWorker,
    lotExpiryWorker,
  ];
  for (const w of workers) {
    w.on('failed', (job, err) => logger.error({ jobId: job?.id, err }, `${w.name} job failed`));
    w.on('completed', (job) => logger.debug({ jobId: job.id }, `${w.name} job completed`));
  }

  void registerRepeatableJobs();

  logger.info(
    '⚙️  BullMQ workers ເລີ່ມແລ້ວ (reminder, waitlist, marketing, chat-lock, home-service SLA, stock reconcile, payment expiry, recurring expense, slip OCR, slip SLA, lot expiry)',
  );
  return workers;
}
