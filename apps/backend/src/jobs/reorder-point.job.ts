import type { Job } from 'bullmq';
import { logger } from '../config/logger.js';
import { computeAbcClasses } from '../modules/inventory/inventory-reports.service.js';
import { computeReorderPoints } from '../modules/inventory/reorder.service.js';
import { backfillReservations } from '../modules/inventory/reservation.service.js';

/**
 * Inventory ຄື້ນ 9D — ທຸກຄືນ 04:15 (Asia/Vientiane):
 *  1. H7 — ສ້ອມແປງ/backfill ການຈອງ consumable ຂອງນັດ CONFIRMED/IN_PROGRESS (idempotent; ປົດແຖວທີ່ຄ້າງ).
 *  2. M11 — ຄິດ avgDailyUsage (90 ວັນ) + reorderPoint ຂອງທຸກສິນຄ້າ.
 *  3. M3 (ຄື້ນ 9C) — ABC class ຕໍ່ສາຂາ ຕາມມູນຄ່າການໃຊ້ 90 ວັນ (Product.abcClass).
 * ບໍ່ແຕະ stockQty/ledger → ບໍ່ກະທົບ reconcileStock (02:30).
 */
export async function processReorderPoint(_job: Job): Promise<void> {
  const res = await backfillReservations();
  const rp = await computeReorderPoints();
  const abc = await computeAbcClasses();
  logger.info({ reservations: res, reorder: rp, abc }, 'reorder-point nightly: reservations synced + reorder points + ABC computed');
}
