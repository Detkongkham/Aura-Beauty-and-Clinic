import type { Job } from 'bullmq';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import { LOT_EXPIRY_WARN_DAYS, lotDaysLeft } from '../modules/inventory/inventory.service.js';
import { notifyUser } from '../services/push.js';
import type { LotExpiryJobData } from './queues.js';

/**
 * ຂັ້ນເຕືອນ (ວັນທີ່ເຫຼືອ) — ແຈ້ງເມື່ອ lot ຂ້າມແຕ່ລະຂັ້ນເທົ່ານັ້ນ (60 → 30 → 7 → ໝົດອາຍຸ) ບໍ່ແຈ້ງຊ້ຳທຸກມື້.
 * dedupeKey ມີຂັ້ນຢູ່ໃນຊື່ ເພື່ອໃຫ້ lot ດຽວກັນຖືກແຈ້ງໄດ້ສູງສຸດ 4 ຄັ້ງຕະຫຼອດອາຍຸ ແລະ ແຕ່ລະຄັ້ງແຮງຂຶ້ນ.
 */
function bucketOf(daysLeft: number): 'expired' | '7' | '30' | '60' {
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 7) return '7';
  if (daysLeft <= 30) return '30';
  return '60';
}

/**
 * C5 — ຫາ lot ທີ່ຍັງມີສະຕັອກ ແລະ ວັນໝົດອາຍຸ ≤ ວັນນີ້ + 60 ວັນ ແລ້ວແຈ້ງເຂົ້າ NotificationLog (inbox ທີ່ມີຢູ່)
 * ຫາ SUPER_ADMIN ທຸກຄົນ + BRANCH_ADMIN ຂອງສາຂາທີ່ lot ນັ້ນຢູ່ (ຫຼັກດຽວກັນກັບ slip SLA alert).
 */
export async function runLotExpiryAlerts(now = new Date()): Promise<{ lots: number; notified: number }> {
  const horizon = new Date(now.getTime() + (LOT_EXPIRY_WARN_DAYS + 1) * 86_400_000);
  const lots = await prisma.stockLot.findMany({
    where: { qtyOnHand: { gt: 0 }, expiryDate: { not: null, lte: horizon }, product: { deletedAt: null } },
    include: { product: { select: { name: true, unit: true } }, branch: { select: { name: true } } },
    orderBy: { expiryDate: 'asc' },
  });

  let notified = 0;
  const counted = [] as typeof lots;
  for (const lot of lots) {
    const daysLeft = lotDaysLeft(lot.expiryDate, now);
    // ກັນ lot ທີ່ຢູ່ນອກຂອບ 60 ວັນຈາກການປັດວັນ (horizon ເຜື່ອໄວ້ 1 ວັນ)
    if (daysLeft == null || daysLeft > LOT_EXPIRY_WARN_DAYS) continue;
    counted.push(lot);
    const bucket = bucketOf(daysLeft);
    const recipients = await prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [{ role: 'SUPER_ADMIN' }, { role: 'BRANCH_ADMIN', branchId: lot.branchId }],
      },
      select: { id: true },
    });
    const qty = Number(lot.qtyOnHand.toString());
    const title =
      daysLeft < 0
        ? `⛔ Lot ໝົດອາຍຸແລ້ວ — ${lot.product.name} (${lot.lotNumber})`
        : `⚠️ Lot ໃກ້ໝົດອາຍຸ — ${lot.product.name} (${lot.lotNumber})`;
    const body =
      `${lot.branch.name}: ເຫຼືອ ${qty} ${lot.product.unit} · ໝົດອາຍຸ ${lot.expiryDate!.toISOString().slice(0, 10)} ` +
      (daysLeft < 0 ? `(ເກີນມາ ${-daysLeft} ວັນ)` : `(ອີກ ${daysLeft} ວັນ)`);
    for (const r of recipients) {
      const res = await notifyUser({
        userId: r.id,
        type: 'stock_lot_expiry',
        title,
        body,
        severity: daysLeft <= 7 ? 'critical' : 'warning',
        dedupeKey: `lot-expiry:${lot.id}:${bucket}:${r.id}`,
        data: { lotId: lot.id, productId: lot.productId, branchId: lot.branchId, daysLeft },
      });
      if (res.delivered) notified += 1;
    }
  }
  return { lots: counted.length, notified };
}

export async function processLotExpiry(job: Job<LotExpiryJobData>): Promise<void> {
  const out = await runLotExpiryAlerts();
  logger.info({ ...out, job: job.name }, 'lot expiry sweep processed');
}
