import { Queue } from 'bullmq';
import { createRedisConnection } from '../config/redis.js';
import { logger } from '../config/logger.js';

/**
 * Queue registry ກາງ (Module 20, 23, 24).
 * ທຸກ producer import ຈາກທີ່ນີ້ — ຫ້າມ new Queue() ກະຈາຍ.
 */
const connection = createRedisConnection();

export const QueueName = {
  REMINDER: 'reminder',
  WAITLIST: 'waitlist',
  MARKETING: 'marketing',
  CHAT_LOCK: 'chat-lock',
  HOME_SERVICE_SLA: 'home-service-sla',
  STOCK_RECONCILE: 'stock-reconcile',
  PAYMENT_EXPIRY: 'payment-expiry',
  SLIP_OCR: 'slip-ocr',
  RECURRING_EXPENSE: 'recurring-expense',
  RECON_REMINDER: 'recon-reminder',
  SLIP_SLA: 'slip-sla',
} as const;

export type ReminderJobData = { appointmentId?: string };
export type WaitlistJobData = {
  branchId: string;
  serviceId: string;
  freedFrom: string;
  freedTo: string;
};
export type MarketingJobData = Record<string, never>;
export type ChatLockJobData = Record<string, never>;
export type HomeServiceSlaJobData = Record<string, never>;
export type StockReconcileJobData = Record<string, never>;
export type PaymentExpiryJobData = Record<string, never>;
export type SlipOcrJobData = { slipId: string };
export type RecurringExpenseJobData = Record<string, never>;
export type ReconReminderJobData = Record<string, never>;
export type SlipSlaJobData = Record<string, never>;

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: 1000,
  removeOnFail: 500,
};

export const reminderQueue = new Queue<ReminderJobData>(QueueName.REMINDER, {
  connection,
  defaultJobOptions,
});

export const waitlistQueue = new Queue<WaitlistJobData>(QueueName.WAITLIST, {
  connection,
  defaultJobOptions,
});

export const marketingQueue = new Queue<MarketingJobData>(QueueName.MARKETING, {
  connection,
  defaultJobOptions,
});

export const chatLockQueue = new Queue<ChatLockJobData>(QueueName.CHAT_LOCK, {
  connection,
  defaultJobOptions,
});

export const homeServiceSlaQueue = new Queue<HomeServiceSlaJobData>(QueueName.HOME_SERVICE_SLA, {
  connection,
  defaultJobOptions,
});

export const stockReconcileQueue = new Queue<StockReconcileJobData>(QueueName.STOCK_RECONCILE, {
  connection,
  defaultJobOptions,
});

/** Wave 10A (ອຸດ H1) — ລ້າງ PaymentTransaction PENDING ທີ່ໝົດອາຍຸ (orphan QR intent). */
export const paymentExpiryQueue = new Queue<PaymentExpiryJobData>(QueueName.PAYMENT_EXPIRY, {
  connection,
  defaultJobOptions,
});

/** Module 39 W4 — ສ້າງລາຍຈ່າຍຊ້ຳປະຈຳເດືອນ (DRAFT). */
export const recurringExpenseQueue = new Queue<RecurringExpenseJobData>(QueueName.RECURRING_EXPENSE, {
  connection,
  defaultJobOptions,
});

/** ໂມດູນ 39 G9 — ເຕືອນການກະທົບຍອດທະນາຄານປະຈຳເຊົ້າ. */
export const reconReminderQueue = new Queue<ReconReminderJobData>(QueueName.RECON_REMINDER, {
  connection,
  defaultJobOptions,
});

/** ໂມດູນ 39 W3 — ອ່ານ OCR ສະລິບໂອນເງິນ (ໜັກ, ແລ່ນນອກ request). */
export const slipOcrQueue = new Queue<SlipOcrJobData>(QueueName.SLIP_OCR, {
  connection,
  defaultJobOptions,
});

/** ໂມດູນ 39 S4 — ແຈ້ງເມື່ອສະລິບລໍກວດເກີນ SLA ຂອງສາຂາ. */
export const slipSlaQueue = new Queue<SlipSlaJobData>(QueueName.SLIP_SLA, {
  connection,
  defaultJobOptions,
});

export const allQueues = [
  reminderQueue,
  waitlistQueue,
  marketingQueue,
  chatLockQueue,
  homeServiceSlaQueue,
  stockReconcileQueue,
  paymentExpiryQueue,
  recurringExpenseQueue,
  reconReminderQueue,
  slipSlaQueue,
];

/**
 * ລົງທະບຽນ repeatable jobs (ຮຽກຄັ້ງດຽວຕອນ worker boot).
 * - reminder sweep: ທຸກ 15 ນາທີ ກວດນັດທີ່ຄົບ 24h / 1h.
 * - marketing daily: ທຸກມື້ເວລາ 08:00 — birthday / win-back sweep.
 */
export async function registerRepeatableJobs(): Promise<void> {
  try {
    await reminderQueue.add(
      'sweep',
      {},
      { repeat: { pattern: '*/15 * * * *' }, jobId: 'reminder-sweep' },
    );
    await marketingQueue.add(
      'daily',
      {},
      { repeat: { pattern: '0 8 * * *' }, jobId: 'marketing-daily' },
    );
    await chatLockQueue.add(
      'daily',
      {},
      { repeat: { pattern: '0 3 * * *' }, jobId: 'chat-lock-daily' },
    );
    await homeServiceSlaQueue.add(
      'sweep',
      {},
      { repeat: { pattern: '*/5 * * * *' }, jobId: 'home-service-sla-sweep' },
    );
    // M19 (audit ຄື້ນ 9A) — reconcile ledger ⟷ stockQty ທຸກຄືນ 02:30 (ບໍ່ຄາບກັບ chat-lock 03:00 / marketing 08:00).
    await stockReconcileQueue.add(
      'nightly',
      {},
      { repeat: { pattern: '30 2 * * *' }, jobId: 'stock-reconcile-nightly' },
    );
    // Wave 10A (ອຸດ H1) — ທຸກ 10 ນາທີ, ໄວກວ່າ DEPOSIT_INTENT_TTL_MINUTES (15) ພໍປະມານ.
    await paymentExpiryQueue.add(
      'sweep',
      {},
      { repeat: { pattern: '*/10 * * * *' }, jobId: 'payment-expiry-sweep' },
    );
    // Module 39 W4 — ທຸກມື້ 06:00 (ຫຼັງ stock reconcile, ກ່ອນ marketing 08:00) ສ້າງລາຍຈ່າຍຊ້ຳທີ່ເຖິງກຳນົດ.
    await recurringExpenseQueue.add(
      'daily',
      {},
      { repeat: { pattern: '0 6 * * *' }, jobId: 'recurring-expense-daily' },
    );
    // Module 39 G9 — 09:00 ເວລາວຽງຈັນ: ມື້ວານຍັງບໍ່ກະທົບຍອດ / ສ່ວນຕ່າງທີ່ຍັງບໍ່ອະທິບາຍ.
    await reconReminderQueue.add(
      'daily',
      {},
      { repeat: { pattern: '0 9 * * *', tz: 'Asia/Vientiane' }, jobId: 'recon-reminder-daily' },
    );
    // Module 39 S4 — ທຸກ 5 ນາທີ: ສະລິບທີ່ລໍເກີນ SLA ຂອງສາຂາ → ແຈ້ງຜູ້ຈັດການ.
    await slipSlaQueue.add('sweep', {}, { repeat: { pattern: '*/5 * * * *' }, jobId: 'slip-sla-sweep' });
    logger.info(
      '🔁 repeatable jobs ລົງທະບຽນແລ້ວ (reminder sweep, marketing daily, chat-lock daily, home-service SLA sweep, stock reconcile nightly, payment expiry sweep, recurring expense daily, recon reminder daily, slip SLA sweep)',
    );
  } catch (err) {
    logger.warn({ err }, 'ລົງທະບຽນ repeatable jobs ບໍ່ສຳເລັດ (Redis?)');
  }
}

export async function closeQueues(): Promise<void> {
  await Promise.all(allQueues.map((q) => q.close()));
  connection.disconnect();
}
