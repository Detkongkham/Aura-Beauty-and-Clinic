import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { ApiError } from '../../utils/ApiError.js';
import { earnPoints } from '../loyalty/loyalty.service.js';
import { costDec, costNum, deductStock, lockProductRows, money, qdec, qnum, receiveIntoLot } from './inventory.service.js';

type Tx = Prisma.TransactionClient;

/**
 * M13 — ການເໜັງຕີງສະຕັອກຂອງການຂາຍໜ້າຮ້ານ. ແຍກອອກຈາກ retail.service ເພື່ອໃຫ້ payments/refunds ເອີ້ນໄດ້ໂດຍບໍ່ມີ import ວົງວຽນ.
 *
 *  - SOLD         refId `sale:<retailSaleId>`   — ຕັດອອກຕອນ Payment FULLY_PAID (FEFO ຜ່ານ deductStock, ໜຶ່ງແຖວຕໍ່ lot).
 *  - SALE_RETURN  refId `saleret:<refundId>`    — ເຂົ້າ lot ເດີມ ຕາມຕົ້ນທຶນຂອງແຖວ SOLD ເດີມ ຕອນ Refund PAID; WAC ບໍ່ປ່ຽນ.
 */
export const saleRefId = (saleId: string) => `sale:${saleId}`;
export const saleReturnRefId = (refundId: string) => `saleret:${refundId}`;

/**
 * ຕັດສະຕັອກ SOLD ຂອງບິນຂາຍ (ພາຍໃນ tx). idempotent: lock ແຖວ retail_sales ແລ້ວກວດ stockPostedAt.
 * ກວດ allowNegativeStock ຂອງສາຂາ (ບໍ່ອະນຸຍາດ + ບໍ່ພໍ → 409, tx rollback).
 */
export async function postRetailSaleStockTx(tx: Tx, saleId: string): Promise<boolean> {
  await tx.$queryRaw`SELECT id FROM "retail_sales" WHERE id = ${saleId} FOR UPDATE`;
  const sale = await tx.retailSale.findUnique({
    where: { id: saleId },
    include: { lines: true, branch: { select: { allowNegativeStock: true } } },
  });
  if (!sale) throw ApiError.notFound('ບໍ່ພົບບິນຂາຍ');
  if (sale.stockPostedAt) return false;
  if (sale.status === 'VOIDED') throw ApiError.conflict('ບິນຂາຍນີ້ຖືກຍົກເລີກແລ້ວ');
  const refId = saleRefId(sale.id);
  // safety net: ຖ້າມີແຖວ SOLD ຂອງບິນນີ້ຢູ່ແລ້ວ (ບໍ່ຄວນເກີດ) ບໍ່ຕັດຊ້ຳ.
  const already = await tx.stockMovement.count({ where: { refId, type: 'SOLD' } });
  if (already > 0) {
    await tx.retailSale.update({ where: { id: sale.id }, data: { stockPostedAt: new Date(), stockError: null } });
    return false;
  }
  await lockProductRows(tx, sale.lines.map((l) => l.productId));
  // ລວມແຖວສິນຄ້າດຽວກັນ (ຫຼາຍແຖວ/ຫຼາຍໜ່ວຍ) ເພື່ອກວດຍອດ; ຕັດຕໍ່ແຖວເພື່ອຈື່ cogs ຂອງແຖວ.
  for (const line of sale.lines) {
    const p = await tx.product.findUniqueOrThrow({
      where: { id: line.productId },
      select: { name: true, stockQty: true, costPrice: true, trackLot: true, branchId: true },
    });
    const qty = qnum(line.qty);
    const before = qnum(p.stockQty);
    const after = qnum(before - qty);
    if (after < 0 && !sale.branch.allowNegativeStock) {
      throw ApiError.conflict(`ສະຕັອກສິນຄ້າ "${p.name}" ບໍ່ພຽງພໍ (ມີ ${before}, ຂາຍ ${qty})`);
    }
    const rows = await deductStock(tx, {
      productId: line.productId,
      branchId: p.branchId,
      trackLot: p.trackLot,
      wac: costNum(p.costPrice),
      qty,
      balanceBefore: before,
      type: 'SOLD',
      refId,
      notes: `ຂາຍໜ້າຮ້ານ ${sale.saleNumber}`,
      createdByUserId: sale.createdByUserId,
    });
    await tx.product.update({ where: { id: line.productId }, data: { stockQty: qdec(after) } });
    const cogs = rows.reduce((s, r) => s - qnum(r.valueChange), 0);
    await tx.retailSaleLine.update({ where: { id: line.id }, data: { cogs: new Prisma.Decimal(money(cogs).toFixed(2)) } });
  }
  await tx.retailSale.update({
    where: { id: sale.id },
    data: { status: 'PAID', paidAt: sale.paidAt ?? new Date(), stockPostedAt: new Date(), stockError: null },
  });
  return true;
}

/**
 * Hook ຈາກ payments.recomputeAndSettle ເມື່ອ Payment FULLY_PAID. ບໍ່ throw — ເງິນຮັບແລ້ວ, ສະນັ້ນຖ້າຕັດສະຕັອກບໍ່ໄດ້
 * (ສະຕັອກບໍ່ພໍ ແລະ ສາຂາບໍ່ອະນຸຍາດຕິດລົບ) ບິນເປັນ PAID + `stockError` → ລອງຄືນດ້ວຍ POST /retail-sales/:id/post-stock.
 */
export async function onRetailPaymentSettled(paymentId: string): Promise<void> {
  const sale = await prisma.retailSale.findUnique({
    where: { paymentId },
    select: { id: true, customerId: true, stockPostedAt: true, status: true, payment: { select: { totalAmount: true, paidAt: true } } },
  });
  if (!sale || sale.status === 'VOIDED') return;
  if (sale.status === 'PENDING_PAYMENT') {
    await prisma.retailSale.updateMany({
      where: { id: sale.id, status: 'PENDING_PAYMENT' },
      data: { status: 'PAID', paidAt: sale.payment.paidAt ?? new Date() },
    });
  }
  if (!sale.stockPostedAt) {
    try {
      await prisma.$transaction((tx) => postRetailSaleStockTx(tx, sale.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ saleId: sale.id, err: msg }, 'retail sale stock post failed');
      await prisma.retailSale.update({ where: { id: sale.id }, data: { stockError: msg.slice(0, 400) } });
    }
  }
  // ຄະແນນສະສົມ: ບິນ retail ບໍ່ມີ appointment → earn ແຍກ refId `sale:<id>` (idempotent ໃນ earnPoints).
  if (sale.customerId) {
    await prisma
      .$transaction((tx) =>
        earnPoints(tx, {
          userId: sale.customerId!,
          amountLak: qnum(sale.payment.totalAmount),
          refId: saleRefId(sale.id),
          notes: 'ໄດ້ຄະແນນຈາກການຊື້ສິນຄ້າ',
        }),
      )
      .catch(() => undefined);
  }
}

/**
 * Hook ຈາກ refunds.payRefund (ພາຍໃນ tx ຂອງການຈ່າຍຄືນ): post ແຖວຄືນສິນຄ້າທີ່ຜູກ refund ນີ້ → SALE_RETURN.
 * ຄືນເຂົ້າ lot ເດີມ (ຕາມແຖວ SOLD ຂອງບິນ, ລົບສ່ວນທີ່ຄືນແລ້ວຕໍ່ lot) ຕາມຕົ້ນທຶນເດີມ; WAC (costPrice) ບໍ່ປ່ຽນ.
 * idempotent: ແຕ່ລະແຖວຄືນ post ຄັ້ງດຽວ (postedAt).
 */
export async function postRetailReturnForRefund(tx: Tx, refundId: string, userId: string | null): Promise<void> {
  const lines = await tx.retailSaleReturnLine.findMany({
    where: { refundId, postedAt: null },
    include: { saleLine: { include: { sale: { select: { id: true, saleNumber: true, branchId: true, stockPostedAt: true } } } } },
  });
  if (!lines.length) return;
  await lockProductRows(tx, lines.map((l) => l.saleLine.productId));
  const refId = saleReturnRefId(refundId);
  for (const rl of lines) {
    const line = rl.saleLine;
    const qty = qnum(rl.qty);
    const now = new Date();
    if (!rl.restock || !line.sale.stockPostedAt) {
      // ບໍ່ເອົາເຂົ້າສະຕັອກ (ຂອງເສຍ) ຫຼື ບິນຍັງບໍ່ເຄີຍຕັດສະຕັອກ → ບໍ່ມີ movement.
      await tx.retailSaleReturnLine.update({ where: { id: rl.id }, data: { postedAt: now } });
      await tx.retailSaleLine.update({ where: { id: line.id }, data: { qtyReturned: qdec(qnum(line.qtyReturned) + qty) } });
      continue;
    }
    // ແຖວ SOLD ຂອງສິນຄ້ານີ້ໃນບິນນີ້ (ແຕ່ລະ lot) − ສ່ວນທີ່ຄືນແລ້ວ ຕໍ່ lot.
    const sold = await tx.stockMovement.findMany({
      where: { refId: saleRefId(line.sale.id), type: 'SOLD', productId: line.productId },
      orderBy: { createdAt: 'asc' },
      select: { lotId: true, qty: true, unitCost: true },
    });
    const priorRefunds = await tx.retailSaleReturnLine.findMany({
      where: { saleLine: { saleId: line.sale.id, productId: line.productId }, postedAt: { not: null }, restock: true },
      select: { refundId: true },
    });
    const prior = priorRefunds.length
      ? await tx.stockMovement.findMany({
          where: {
            type: 'SALE_RETURN',
            productId: line.productId,
            refId: { in: [...new Set(priorRefunds.map((r) => saleReturnRefId(r.refundId)))] },
          },
          select: { lotId: true, qty: true },
        })
      : [];
    // pool ຕໍ່ slice ຂອງ SOLD (ສິນຄ້າດຽວກັນຫຼາຍແຖວຂາຍໃຊ້ pool ດຽວກັນ) ລຽງ "ຕັດທ້າຍສຸດກ່ອນ" (ກົງກັນຂ້າມກັບ FEFO);
    // ຫັກສ່ວນທີ່ຄືນແລ້ວ (ຕາມ lot) ອອກກ່ອນ ແລ້ວຈຶ່ງແຈກຈຳນວນຄືນຄັ້ງນີ້.
    const pool = [...sold].reverse().map((m) => ({ lotId: m.lotId, rem: qnum(m.qty), unitCost: costNum(m.unitCost) }));
    for (const m of prior) {
      let q = qnum(m.qty);
      for (const sl of pool) {
        if (q <= 0) break;
        if (sl.lotId !== m.lotId || sl.rem <= 0) continue;
        const t = Math.min(sl.rem, q);
        sl.rem = qnum(sl.rem - t);
        q = qnum(q - t);
      }
    }
    const slices: { lotId: string | null; qty: number; unitCost: number }[] = [];
    let left = qty;
    for (const sl of pool) {
      if (left <= 0) break;
      if (sl.rem <= 0) continue;
      const take = Math.min(sl.rem, left);
      slices.push({ lotId: sl.lotId, qty: take, unitCost: sl.unitCost });
      left = qnum(left - take);
    }
    if (left > 0.0005) throw ApiError.conflict('ຈຳນວນຄືນເກີນຈຳນວນທີ່ຂາຍອອກຈາກສະຕັອກ');

    const p = await tx.product.findUniqueOrThrow({ where: { id: line.productId }, select: { stockQty: true, branchId: true } });
    let balance = qnum(p.stockQty);
    for (const sl of slices) {
      if (sl.lotId) {
        const lot = await tx.stockLot.findUniqueOrThrow({ where: { id: sl.lotId } });
        await receiveIntoLot(tx, {
          productId: line.productId,
          branchId: lot.branchId,
          lotNumber: lot.lotNumber,
          expiryDate: lot.expiryDate,
          mfgDate: lot.mfgDate,
          qty: sl.qty,
          unitCost: sl.unitCost,
        });
      }
      balance = qnum(balance + sl.qty);
      await tx.stockMovement.create({
        data: {
          branchId: p.branchId,
          productId: line.productId,
          type: 'SALE_RETURN',
          qty: qdec(sl.qty),
          balanceAfter: qdec(balance),
          unitCost: costDec(sl.unitCost),
          valueChange: money(sl.qty * sl.unitCost),
          lotId: sl.lotId,
          refId,
          notes: `ລູກຄ້າຄືນສິນຄ້າ ${line.sale.saleNumber}`,
          createdByUserId: userId,
        },
      });
    }
    // C4 — ຮັບຄືນບໍ່ປ່ຽນ WAC: ອັບເດດສະເພາະ stockQty.
    await tx.product.update({ where: { id: line.productId }, data: { stockQty: qdec(balance) } });
    await tx.retailSaleReturnLine.update({ where: { id: rl.id }, data: { postedAt: now } });
    await tx.retailSaleLine.update({ where: { id: line.id }, data: { qtyReturned: qdec(qnum(line.qtyReturned) + qty) } });
  }
}
