import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { qdec, qnum } from './inventory.service.js';
import { bomBaseQty } from './inventory-master.service.js';

/**
 * H7 (inventory audit ຄື້ນ 9D) — ການຈອງ consumable ຈາກນັດໝາຍ (on hand / reserved / available / on order).
 *
 * ຫຼັກການ:
 *  - ນັດ CONFIRMED / IN_PROGRESS → ຈອງ BOM ຂອງບໍລິການ (ໜຶ່ງແຖວຕໍ່ ນັດ+ສິນຄ້າ, qty = qtyPerUse × factorToBase (ໜ່ວຍພື້ນຖານ) — ຊຸດດຽວກັບທີ່
 *    `consumeServiceStock` ຈະຕັດຕອນ COMPLETED ເພື່ອໃຫ້ reserved ກົງກັບການຕັດຈິງ).
 *  - PENDING / CANCELLED / NO_SHOW / ນັດຖືກລຶບ → ປົດຈອງ (RELEASED). ບໍລິການປ່ຽນ → ແຖວທີ່ບໍ່ຢູ່ໃນ BOM ໃໝ່ຖືກປົດ,
 *    ແຖວໃໝ່ຖືກຈອງ (ແຖວເກົ່າທີ່ RELEASED ຖືກເປີດຄືນ — unique ຕໍ່ appointmentId+productId ຈຶ່ງ idempotent).
 *  - COMPLETED → CONSUMED (`markReservationsConsumed` ເອີ້ນຈາກ consumeServiceStock ໃນ tx ດຽວກັນ).
 *  - "Soft": ບໍ່ແຕະ stockQty ຫຼື ledger (reconcileStock ບໍ່ກ່ຽວ), ບໍ່ throw ຂໍ້ຜິດພາດທາງທຸລະກິດ, ບໍ່ບລັອກການຈອງນັດ
 *    ຫຼື ການປິດນັດ — ມີແຕ່ຂໍ້ຜິດພາດ DB ແທ້ໆທີ່ຈະເຮັດໃຫ້ tx ຂອງນັດ rollback (Postgres abort tx ຢູ່ແລ້ວ).
 */

type Db = Prisma.TransactionClient | typeof prisma;

/** ສະຖານະນັດທີ່ຖືວ່າ "ຈະໃຊ້ຂອງແນ່ນອນ" → ຈອງ. */
const RESERVING_STATUSES = new Set(['CONFIRMED', 'IN_PROGRESS']);

export type ReservationSyncResult = { reserved: number; released: number; consumed: number };

/**
 * ປັບການຈອງຂອງນັດໃຫ້ກົງກັບສະຖານະ + ບໍລິການປັດຈຸບັນ (idempotent — ເອີ້ນຊ້ຳໄດ້ທຸກເວລາ). ຕ້ອງເອີ້ນຫຼັງ update ນັດ
 * ພາຍໃນ tx ດຽວກັນ (ຖ້າມີ) ເພື່ອໃຫ້ອ່ານສະຖານະໃໝ່.
 */
export async function syncAppointmentReservations(db: Db, appointmentId: string): Promise<ReservationSyncResult> {
  const out: ReservationSyncResult = { reserved: 0, released: 0, consumed: 0 };
  const appt = await db.appointment.findUnique({
    where: { id: appointmentId },
    select: { status: true, serviceId: true, deletedAt: true },
  });
  const existing = await db.stockReservation.findMany({
    where: { appointmentId },
    select: { id: true, productId: true, qty: true, status: true },
  });
  const now = new Date();

  if (appt && !appt.deletedAt && appt.status === 'COMPLETED') {
    out.consumed = await markReservationsConsumed(db, appointmentId);
    return out;
  }

  const wanted = new Map<string, { branchId: string; qty: number }>();
  if (appt && !appt.deletedAt && RESERVING_STATUSES.has(appt.status)) {
    const bom = await db.serviceConsumable.findMany({
      where: { serviceId: appt.serviceId },
      select: {
        productId: true,
        qtyPerUse: true,
        factorToBase: true,
        product: { select: { branchId: true, deletedAt: true } },
      },
    });
    for (const c of bom) {
      // M1 — ຈອງເປັນໜ່ວຍພື້ນຖານ (qtyPerUse × factor) — ຄືກັບທີ່ consumeServiceStock ຕັດ.
      const qty = bomBaseQty(c);
      if (c.product.deletedAt || qty <= 0) continue;
      wanted.set(c.productId, { branchId: c.product.branchId, qty });
    }
  }

  // ປົດແຖວ ACTIVE ທີ່ບໍ່ຕ້ອງການອີກ (ສະຖານະບໍ່ຈອງ ຫຼື ບໍລິການປ່ຽນ).
  const toRelease = existing.filter((r) => r.status === 'ACTIVE' && !wanted.has(r.productId)).map((r) => r.id);
  if (toRelease.length) {
    const res = await db.stockReservation.updateMany({
      where: { id: { in: toRelease }, status: 'ACTIVE' },
      data: { status: 'RELEASED', releasedAt: now },
    });
    out.released = res.count;
  }

  const byProduct = new Map(existing.map((r) => [r.productId, r]));
  for (const [productId, w] of wanted) {
    const cur = byProduct.get(productId);
    if (cur?.status === 'ACTIVE' && Math.abs(qnum(cur.qty) - w.qty) < 0.0005) continue;
    if (cur?.status === 'CONSUMED') continue; // ຕັດແລ້ວ (ນັດຖືກເປີດຄືນຫຼັງ COMPLETED) — ບໍ່ຈອງຊ້ຳ
    await db.stockReservation.upsert({
      where: { appointmentId_productId: { appointmentId, productId } },
      update: { qty: qdec(w.qty), branchId: w.branchId, status: 'ACTIVE', releasedAt: null },
      create: { appointmentId, productId, branchId: w.branchId, qty: qdec(w.qty) },
    });
    out.reserved += 1;
  }
  return out;
}

/** COMPLETED — ແປງການຈອງ ACTIVE ຂອງນັດເປັນ CONSUMED (ເອີ້ນຈາກ consumeServiceStock). */
export async function markReservationsConsumed(db: Db, appointmentId: string): Promise<number> {
  const res = await db.stockReservation.updateMany({
    where: { appointmentId, status: 'ACTIVE' },
    data: { status: 'CONSUMED', consumedAt: new Date() },
  });
  return res.count;
}

/**
 * ຮຸ້ນສຳລັບ path ທີ່ບໍ່ມີ tx (ເຊັ່ນ ຢືນຢັນນັດຫຼັງຈ່າຍມັດຈຳ) — ບໍ່ໃຫ້ຄວາມຜິດພາດຂອງການຈອງ (ເຊິ່ງເປັນ soft) ເຮັດໃຫ້
 * flow ຂອງນັດທີ່ commit ແລ້ວລົ້ມ; job ກາງຄືນ (`backfillReservations`) ຈະແກ້ໃຫ້ຖືກຕ້ອງເອງ.
 */
export async function syncAppointmentReservationsSafe(appointmentId: string): Promise<void> {
  try {
    await syncAppointmentReservations(prisma, appointmentId);
  } catch (err) {
    logger.warn({ err, appointmentId }, 'stock reservation sync failed (will be repaired by nightly job)');
  }
}

/**
 * Backfill / ສ້ອມແປງ (idempotent): sync ທຸກນັດທີ່ CONFIRMED/IN_PROGRESS ໃນອະນາຄົດ (startAt ≥ ມື້ວານ) +
 * ທຸກນັດທີ່ຍັງມີການຈອງ ACTIVE (ເພື່ອປົດແຖວທີ່ຄ້າງ ເຊັ່ນ ນັດທີ່ຖືກປ່ຽນສະຖານະນອກເສັ້ນທາງປົກກະຕິ).
 * ເອີ້ນຈາກ job reorder-point ທຸກຄືນ (ກ່ອນຄິດ available) ແລະ ໃຊ້ເປັນ script ໄດ້.
 */
export async function backfillReservations(now: Date = new Date()): Promise<{ appointments: number } & ReservationSyncResult> {
  const since = new Date(now.getTime() - 86_400_000);
  const [upcoming, stale] = await Promise.all([
    prisma.appointment.findMany({
      where: { deletedAt: null, status: { in: ['CONFIRMED', 'IN_PROGRESS'] }, startAt: { gte: since } },
      select: { id: true },
    }),
    prisma.stockReservation.findMany({ where: { status: 'ACTIVE' }, select: { appointmentId: true }, distinct: ['appointmentId'] }),
  ]);
  const ids = [...new Set([...upcoming.map((a) => a.id), ...stale.map((r) => r.appointmentId)])];
  const total: ReservationSyncResult = { reserved: 0, released: 0, consumed: 0 };
  for (const id of ids) {
    const r = await prisma.$transaction((tx) => syncAppointmentReservations(tx, id));
    total.reserved += r.reserved;
    total.released += r.released;
    total.consumed += r.consumed;
  }
  return { appointments: ids.length, ...total };
}

/** Σ ACTIVE ຕໍ່ສິນຄ້າ. */
export async function reservedByProduct(productIds: string[]): Promise<Map<string, number>> {
  if (!productIds.length) return new Map();
  const grouped = await prisma.stockReservation.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds }, status: 'ACTIVE' },
    _sum: { qty: true },
  });
  return new Map(grouped.map((g) => [g.productId, qnum(g._sum.qty)]));
}

/** PO ທີ່ຈຳນວນຄ້າງຮັບນັບເປັນ on-order (DRAFT ບໍ່ນັບ; ປິດຮັບບໍ່ຄົບ = RECEIVED ຈຶ່ງບໍ່ນັບ). */
export const ON_ORDER_PO_STATUSES = ['PENDING_APPROVAL', 'ORDERED', 'PARTIALLY_RECEIVED'] as const;

/** Σ max(0, quantity − qtyReceived) ຂອງແຖວ PO ທີ່ເປີດຢູ່ ຕໍ່ສິນຄ້າ. */
export async function onOrderByProduct(productIds: string[]): Promise<Map<string, number>> {
  if (!productIds.length) return new Map();
  const rows = await prisma.$queryRaw<{ productId: string; qty: Prisma.Decimal | null }[]>`
    SELECT i."productId", SUM(GREATEST(i.quantity - i."qtyReceived", 0)) AS qty
      FROM "purchase_order_items" i
      JOIN "purchase_orders" po ON po.id = i."purchaseOrderId"
     WHERE i."productId" IN (${Prisma.join(productIds)})
       AND po.status::text IN (${Prisma.join([...ON_ORDER_PO_STATUSES])})
     GROUP BY i."productId"`;
  return new Map(rows.map((r) => [r.productId, qnum(r.qty)]));
}
