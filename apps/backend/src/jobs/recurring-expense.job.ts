import type { Job } from 'bullmq';
import { logger } from '../config/logger.js';
import { generateDueRecurringExpenses } from '../modules/expenses/expenses.service.js';
import type { RecurringExpenseJobData } from './queues.js';

/** Module 39 W4 — ສ້າງລາຍຈ່າຍຊ້ຳປະຈຳເດືອນເປັນ DRAFT (ຕ້ອງສົ່ງອະນຸມັດຕາມ workflow ປົກກະຕິ). */
export async function processRecurringExpense(job: Job<RecurringExpenseJobData>): Promise<void> {
  const { created } = await generateDueRecurringExpenses();
  logger.info({ created, job: job.name }, 'recurring expense sweep processed');
}
