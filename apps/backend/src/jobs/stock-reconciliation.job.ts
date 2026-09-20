import type { Job } from 'bullmq';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import { reconcileStock } from '../modules/inventory/inventory.service.js';
import { notifyUser } from '../services/push.js';

/**
 * ໂມດູນ 14/32 audit ຄື້ນ 9A, M19 — reconciliation ປະຈຳຄືນ: ທຽບ SUM(stock_movements) ກັບ
 * `products.stockQty` ຈິງ. ນີ້ຄືຕົວດັກ bug ຊັ້ນສຸດທ້າຍ ຖ້າ C1 (race condition) ຫຼືການຂຽນນອກ ledger
 * ໃດໜຶ່ງເຮັດໃຫ້ຕົວເລກ 2 ບ່ອນນີ້ບໍ່ກົງກັນ — ໂດຍປົກກະຕິບໍ່ຄວນພົບ mismatch ໃດເລີຍ.
 * ພົບ → log ລະດັບ error + ແຈ້ງເຕືອນ SUPER_ADMIN ທຸກຄົນ (dedupe ຕໍ່ວັນ ບໍ່ໃຫ້ສະແປມ).
 */
export async function processStockReconciliation(_job: Job): Promise<void> {
  const { checked, mismatches } = await reconcileStock();

  if (mismatches.length === 0) {
    logger.info({ checked }, 'stock reconciliation: ledger ⟷ stockQty ກົງກັນທັງໝົດ');
    return;
  }

  logger.error({ checked, mismatches }, 'stock reconciliation: ພົບຄວາມແຕກຕ່າງລະຫວ່າງ ledger ກັບ stockQty');

  const admins = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN', isActive: true, deletedAt: null },
    select: { id: true },
  });
  if (admins.length === 0) return;

  const dateKey = new Date().toISOString().slice(0, 10);
  const preview = mismatches
    .slice(0, 5)
    .map((m) => `${m.productName}: ລະບົບ=${m.actualBalance} ledger=${m.ledgerBalance} (ຕ່າງ ${m.diff})`)
    .join('\n');
  const more = mismatches.length > 5 ? `\n… ແລະ ອີກ ${mismatches.length - 5} ລາຍການ` : '';

  await Promise.all(
    admins.map((a) =>
      notifyUser({
        userId: a.id,
        type: 'stock_reconciliation_mismatch',
        title: `⚠️ ພົບຂໍ້ມູນສະຕັອກບໍ່ກົງກັນ (${mismatches.length} ລາຍການ)`,
        body: preview + more,
        dedupeKey: `stock-recon:${dateKey}`,
        data: { mismatchCount: mismatches.length },
      }),
    ),
  );
}
