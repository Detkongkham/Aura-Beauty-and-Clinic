import type { Prisma } from '@prisma/client';
import { tsParam, VIENTIANE_OFFSET_MINUTES } from './dateHelpers.js';

/**
 * Wave 10B — ເລກເອກະສານຕໍ່ເນື່ອງ ບໍ່ຂາດຕອນ ບໍ່ຊ້ຳ (gapless).
 * INV = ໃບຮັບເງິນ (ອອກຕອນບິນ FULLY_PAID), CN = ໃບຄືນເງິນ (credit note, ອອກຕອນ refund PAID).
 * PO = ໃບສັ່ງຊື້, TRF = ໃບໂອນສິນຄ້າ (inventory M5 — ແຖວເກົ່າຍັງເປັນ `PO-<hex>`/`TRF-<hex>`, ບໍ່ backfill).
 * SC = ໃບນັບສະຕັອກ (inventory H3). GRN = ໃບຮັບເຄື່ອງ (H4), RTS = ໃບຄືນສິນຄ້າຜູ້ສະໜອງ / debit note (H5).
 * RS = ບິນຂາຍສິນຄ້າໜ້າຮ້ານ (inventory M13 — ເລກຂອງ RetailSale; ໃບຮັບເງິນຍັງເປັນ INV ຂອງ Payment).
 *
 * ຕ້ອງເອີ້ນພາຍໃນ $transaction ດຽວກັບການຂຽນເອກະສານ: `INSERT … ON CONFLICT DO UPDATE lastNo+1` ລັອກແຖວຕົວນັບ
 * ຈົນ commit → ຄົນທີ່ມາພ້ອມກັນລໍຄິວ (ເລກບໍ່ຊ້ຳ), ແລະ ຖ້າ tx rollback ເລກກໍ rollback ນຳ (ເລກບໍ່ຂາດ).
 * ຮູບແບບ: `<TYPE>-<ລະຫັດສາຂາ>-<ປີວຽງຈັນ>-<ລຳດັບ 6 ຫຼັກ>` (ຕ້ອງກົງກັບ SQL backfill ໃນ migration 20260921190000).
 */
export type DocType = 'INV' | 'CN' | 'Z' | 'PO' | 'TRF' | 'SC' | 'GRN' | 'RTS' | 'RS';

export async function nextDocumentNo(
  tx: Prisma.TransactionClient,
  branchId: string,
  docType: DocType,
  at: Date = new Date(),
): Promise<string> {
  const year = new Date(at.getTime() + VIENTIANE_OFFSET_MINUTES * 60_000).getUTCFullYear();
  const rows = await tx.$queryRaw<{ lastNo: number }[]>`
    INSERT INTO "document_sequences" ("branchId", "docType", "year", "lastNo", "updatedAt")
    VALUES (${branchId}, ${docType}, ${year}, 1, ${tsParam(new Date())})
    ON CONFLICT ("branchId", "docType", "year")
    DO UPDATE SET "lastNo" = "document_sequences"."lastNo" + 1, "updatedAt" = EXCLUDED."updatedAt"
    RETURNING "lastNo"`;
  const branch = await tx.branch.findUniqueOrThrow({ where: { id: branchId }, select: { id: true, code: true } });
  const prefix = branch.code?.trim() || branch.id.slice(0, 4).toUpperCase();
  return `${docType}-${prefix}-${year}-${String(rows[0]!.lastNo).padStart(6, '0')}`;
}
