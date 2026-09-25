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
  LOT_EXPIRY: 'lot-expiry',
  REORDER_POINT: 'reorder-point',
  FINANCE_DAILY: 'finance-daily',
  UPLOAD_GC: 'upload-gc',
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
export type LotExpiryJobData = Record<string, never>;
export type ReorderPointJobData = Record<string, never>;
export type FinanceDailyJobData = Record<string, never>;
export type UploadGcJobData = Record<string, never>;

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

/** C5 — ແຈ້ງເຕືອນ lot ສິນຄ້າໃກ້/ໝົດອາຍຸ ທຸກເຊົ້າ. */
export const lotExpiryQueue = new Queue<LotExpiryJobData>(QueueName.LOT_EXPIRY, {
  connection,
  defaultJobOptions,
});

/** Inventory 9D (H7/M11) — ສ້ອມແປງການຈອງ + ຄິດ reorder point ທຸກຄືນ. */
export const reorderPointQueue = new Queue<ReorderPointJobData>(QueueName.REORDER_POINT, {
  connection,
  defaultJobOptions,
});

export const uploadGcQueue = new Queue<UploadGcJobData>(QueueName.UPLOAD_GC, {
  connection,
  defaultJobOptions,
});

/** Wave 11 — FX feed + ຄະແນນໝົດອາຍຸ + breakage ບັດຂອງຂວັນ ທຸກເຊົ້າ. */
export const financeDailyQueue = new Queue<FinanceDailyJobData>(QueueName.FINANCE_DAILY, {
  connection,
  defaultJobOptions,
});

export const allQueues = [
  financeDailyQueue,
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
  lotExpiryQueue,
  reorderPointQueue,
  uploadGcQueue,
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
    // C5 — 08:30 ເວລາວຽງຈັນ (ຫຼັງ marketing 08:00, ກ່ອນ recon reminder 09:00): lot ໃກ້ໝົດອາຍຸ ≤ 60 ວັນ.
    await lotExpiryQueue.add(
      'daily',
      {},
      { repeat: { pattern: '30 8 * * *', tz: 'Asia/Vientiane' }, jobId: 'lot-expiry-daily' },
    );
    // Inventory 9D — 04:15 ເວລາວຽງຈັນ (ຫຼັງ stock reconcile / chat-lock, ກ່ອນ recurring expense): ການຈອງ + reorder point.
    await reorderPointQueue.add(
      'nightly',
      {},
      { repeat: { pattern: '15 4 * * *', tz: 'Asia/Vientiane' }, jobId: 'reorder-point-nightly' },
    );
    // ລ້າງຮູບບໍລິການທີ່ອັບໂຫລດແລ້ວບໍ່ໄດ້ບັນທຶກ (> 24h, ບໍ່ມີແຖວອ້າງອີງ).
    await uploadGcQueue.add(
      'nightly',
      {},
      { repeat: { pattern: '45 3 * * *', tz: 'Asia/Vientiane' }, jobId: 'upload-gc-nightly' },
    );
    // Wave 11 — 05:30 ເວລາວຽງຈັນ: FX feed, ຄະແນນໝົດອາຍຸ, breakage (ກ່ອນ recurring expense 06:00).
    await financeDailyQueue.add(
      'daily',
      {},
      { repeat: { pattern: '30 5 * * *', tz: 'Asia/Vientiane' }, jobId: 'finance-daily' },
    );
    logger.info(
      '🔁 repeatable jobs ລົງທະບຽນແລ້ວ (reminder sweep, marketing daily, chat-lock daily, home-service SLA sweep, stock reconcile nightly, payment expiry sweep, recurring expense daily, recon reminder daily, slip SLA sweep, lot expiry daily, reorder point nightly, upload gc nightly)',
    );
  } catch (err) {
    logger.warn({ err }, 'ລົງທະບຽນ repeatable jobs ບໍ່ສຳເລັດ (Redis?)');
  }
}

export async function closeQueues(): Promise<void> {
  await Promise.all(allQueues.map((q) => q.close()));
  connection.disconnect();
}
