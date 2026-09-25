import type {
  AccessTokenPayload,
  InventoryExportView,
  Paginated,
  RefundView,
  RetailMarginQuery,
  RetailMarginRow,
  RetailMarginView,
  RetailSaleCreateInput,
  RetailSaleLineView,
  RetailSaleListQuery,
  RetailSaleReturnInput,
  RetailSaleView,
} from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { nextDocumentNo } from '../../utils/documentNumbers.js';
import { exclusiveBillVat } from '../payments/vat.js';
import { voidPayment } from '../payments/payments.docs.service.js';
import { createRefund } from '../payments/refunds.service.js';
import { exportList } from './inventory-reports.service.js';
import { factorDec, factorNum, resolveUomFactors } from './inventory-master.service.js';
import { money, qdec, qnum, vientianeDayRange } from './inventory.service.js';
import { postRetailSaleStockTx } from './retail-stock.service.js';

/**
 * M13 (inventory 9D) — ຂາຍສິນຄ້າໜ້າຮ້ານ (retail / OTC).
 *
 * ການອອກແບບ: RetailSale + RetailSaleLine ຜູກ Payment 1:1 (ຄືກັບບິນຊື້ບັດຂອງຂວັນ/ແພັກເກັດ) — Payment ບໍ່ມີແຖວລາຍການ
 * ຈຶ່ງເກັບແຖວສິນຄ້າໄວ້ຢູ່ນີ້ ແລ້ວໃຊ້ເສັ້ນທາງເງິນເດີມທັງໝົດ: tender (POST /payments/:id/tenders), ເລກ INV + VAT ຕອນ FULLY_PAID,
 * ໃບຮັບເງິນ (GET /payments/:id/receipt ສະແດງແຖວສິນຄ້າ), void (POST /payments/:id/void) ແລະ refund/CN.
 * ສະຕັອກ: SOLD ຕອນ FULLY_PAID (payments.recomputeAndSettle → onRetailPaymentSettled); SALE_RETURN ຕອນ refund PAID.
 */

type Auth = Pick<AccessTokenPayload, 'sub' | 'role' | 'branchId'>;

function scopeBranch(auth: Auth, branchId?: string | null): string | null {
  if (auth.role === 'BRANCH_ADMIN') {
    if (!auth.branchId) throw ApiError.forbidden('ບັນຊີນີ້ບໍ່ໄດ້ຜູກກັບສາຂາໃດ');
    if (branchId && branchId !== auth.branchId) throw ApiError.forbidden('ບໍ່ມີສິດຈັດການບິນຂອງສາຂາອື່ນ');
    return auth.branchId;
  }
  return branchId ?? null;
}

const SALE_INCLUDE = {
  branch: { select: { name: true } },
  customer: { select: { name: true, phone: true } },
  createdBy: { select: { name: true } },
  payment: {
    select: {
      invoiceNo: true,
      paymentStatus: true,
      totalAmount: true,
      refundedAmount: true,
      taxAmount: true,
      vatRate: true,
      vatMode: true,
      transactions: { where: { status: 'SUCCESS' }, select: { amount: true } },
    },
  },
  _count: { select: { lines: true } },
} satisfies Prisma.RetailSaleInclude;
type SaleRow = Prisma.RetailSaleGetPayload<{ include: typeof SALE_INCLUDE }>;

const LINE_INCLUDE = {
  product: { select: { name: true, sku: true, unit: true } },
  uom: { select: { code: true } },
  returnLines: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.RetailSaleLineInclude;
type LineRow = Prisma.RetailSaleLineGetPayload<{ include: typeof LINE_INCLUDE }>;

const OPEN_REFUND = new Set(['PENDING', 'APPROVED', 'PAID']);

function toView(s: SaleRow, lines?: LineRow[], refunds?: Map<string, { status: string; creditNoteNo: string | null }>): RetailSaleView {
  const paid = money(s.payment.transactions.reduce((n, t) => n + qnum(t.amount), 0));
  const billTotal = money(s.payment.totalAmount);
  return {
    id: s.id,
    saleNumber: s.saleNumber,
    branchId: s.branchId,
    branchName: s.branch.name,
    customerId: s.customerId,
    customerName: s.customer?.name ?? null,
    customerPhone: s.customer?.phone ?? null,
    paymentId: s.paymentId,
    invoiceNo: s.payment.invoiceNo,
    paymentStatus: s.payment.paymentStatus,
    status: s.status,
    subtotal: money(s.subtotal),
    discountTotal: money(s.discountTotal),
    total: money(s.total),
    billTotal,
    paidAmount: paid,
    balanceAmount: money(Math.max(0, billTotal - paid)),
    refundedAmount: money(s.payment.refundedAmount),
    taxAmount: s.payment.taxAmount != null ? money(s.payment.taxAmount) : null,
    vatRate: s.payment.vatRate != null ? s.payment.vatRate.toNumber() : null,
    notes: s.notes,
    createdByUserName: s.createdBy?.name ?? null,
    paidAt: s.paidAt?.toISOString() ?? null,
    stockPostedAt: s.stockPostedAt?.toISOString() ?? null,
    stockError: s.stockError,
    voidedAt: s.voidedAt?.toISOString() ?? null,
    voidReason: s.voidReason,
    itemCount: s._count.lines,
    createdAt: s.createdAt.toISOString(),
    ...(lines
      ? {
          lines: lines.map((l): RetailSaleLineView => {
            const open = l.returnLines.filter((r) => OPEN_REFUND.has(refunds?.get(r.refundId)?.status ?? ''));
            const pending = open.filter((r) => !r.postedAt).reduce((n, r) => n + qnum(r.qty), 0);
            return {
              id: l.id,
              productId: l.productId,
              productName: l.product.name,
              sku: l.product.sku,
              unit: l.product.unit,
              qty: qnum(l.qty),
              uomId: l.uomId,
              uomCode: l.uom?.code ?? null,
              factorToBase: factorNum(l.factorToBase),
              uomQty: qnum(l.uomQty),
              unitPrice: money(l.unitPrice),
              discount: money(l.discount),
              lineTotal: money(l.lineTotal),
              cogs: l.cogs != null ? money(l.cogs) : null,
              qtyReturned: qnum(l.qtyReturned),
              qtyReturnable: Math.max(0, qnum(qnum(l.qty) - qnum(l.qtyReturned) - pending)),
              returns: l.returnLines.map((r) => ({
                id: r.id,
                refundId: r.refundId,
                refundStatus: (refunds?.get(r.refundId)?.status ?? null) as RetailSaleLineView['returns'][number]['refundStatus'],
                creditNoteNo: refunds?.get(r.refundId)?.creditNoteNo ?? null,
                qty: qnum(r.qty),
                amount: money(r.amount),
                restock: r.restock,
                postedAt: r.postedAt?.toISOString() ?? null,
                createdAt: r.createdAt.toISOString(),
              })),
            };
          }),
        }
      : {}),
  };
}

export async function getRetailSale(id: string, auth: Auth): Promise<RetailSaleView> {
  const s = await prisma.retailSale.findUnique({ where: { id }, include: SALE_INCLUDE });
  if (!s) throw ApiError.notFound('ບໍ່ພົບບິນຂາຍ');
  scopeBranch(auth, s.branchId);
  const lines = await prisma.retailSaleLine.findMany({ where: { saleId: id }, include: LINE_INCLUDE, orderBy: { id: 'asc' } });
  const refundIds = [...new Set(lines.flatMap((l) => l.returnLines.map((r) => r.refundId)))];
  const refunds = refundIds.length
    ? await prisma.refund.findMany({ where: { id: { in: refundIds } }, select: { id: true, status: true, creditNoteNo: true } })
    : [];
  return toView(s, lines, new Map(refunds.map((r) => [r.id, r])));
}

export async function listRetailSales(q: RetailSaleListQuery, auth: Auth): Promise<Paginated<RetailSaleView>> {
  const branchId = scopeBranch(auth, q.branchId);
  const range = q.from || q.to ? vientianeDayRange({ from: q.from ?? q.to, to: q.to ?? q.from }) : null;
  const where: Prisma.RetailSaleWhereInput = {
    ...(branchId ? { branchId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(range ? { createdAt: { gte: range.gte, lt: range.lt } } : {}),
    ...(q.q
      ? {
          OR: [
            { saleNumber: { contains: q.q, mode: 'insensitive' } },
            { payment: { invoiceNo: { contains: q.q, mode: 'insensitive' } } },
            { customer: { name: { contains: q.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.retailSale.findMany({
      where,
      include: SALE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.retailSale.count({ where }),
  ]);
  return {
    items: rows.map((r) => toView(r)),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export function exportRetailSales(q: RetailSaleListQuery, auth: Auth): Promise<InventoryExportView<RetailSaleView>> {
  return exportList((x) => listRetailSales(x, auth), q);
}

/**
 * POST /retail-sales — ສ້າງບິນ (PENDING_PAYMENT) + Payment (PENDING, ມັດຈຳ = ຍອດເຕັມ → ຕ້ອງຈ່າຍຄົບຈຶ່ງຕັດສະຕັອກ).
 * ຈຳນວນປ້ອນເປັນໜ່ວຍຂາຍ → ເກັບເປັນໜ່ວຍພື້ນຖານ (× factor). ກວດສະຕັອກລ່ວງໜ້າ (ບໍ່ lock) ເພື່ອບອກໄວ; ການກວດຈິງ
 * (lock + allowNegativeStock) ເກີດຕອນຕັດສະຕັອກ.
 */
export async function createRetailSale(input: RetailSaleCreateInput, auth: Auth): Promise<RetailSaleView> {
  scopeBranch(auth, input.branchId);
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true, allowNegativeStock: true } });
  if (!branch) throw ApiError.badRequest('ບໍ່ພົບສາຂາ');
  if (input.customerId) {
    const c = await prisma.user.findFirst({ where: { id: input.customerId, deletedAt: null }, select: { id: true } });
    if (!c) throw ApiError.badRequest('ບໍ່ພົບລູກຄ້າ');
  }
  const ids = [...new Set(input.lines.map((l) => l.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true, name: true, branchId: true, isActive: true, isSellable: true, retailPrice: true, stockQty: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const factors = await resolveUomFactors(prisma, input.lines.map((l) => ({ productId: l.productId, uomId: l.uomId ?? null })));
  const need = new Map<string, number>();
  const lines = input.lines.map((l, i) => {
    const p = byId.get(l.productId);
    if (!p) throw ApiError.badRequest('ມີສິນຄ້າບາງລາຍການບໍ່ພົບ');
    if (p.branchId !== input.branchId) throw ApiError.badRequest(`ສິນຄ້າ "${p.name}" ບໍ່ແມ່ນຂອງສາຂານີ້`);
    if (!p.isActive || !p.isSellable) throw ApiError.badRequest(`ສິນຄ້າ "${p.name}" ບໍ່ໄດ້ເປີດຂາຍໜ້າຮ້ານ`);
    const f = factors[i]!;
    const unitPrice = l.unitPrice ?? (p.retailPrice != null ? money(qnum(p.retailPrice) * f.factor) : null);
    if (unitPrice == null) throw ApiError.badRequest(`ສິນຄ້າ "${p.name}" ຍັງບໍ່ມີລາຄາຂາຍ — ລະບຸລາຄາ`);
    const gross = money(l.qty * unitPrice);
    if (l.discount > gross + 0.001) throw ApiError.badRequest(`ສ່ວນຫຼຸດຂອງ "${p.name}" ເກີນມູນຄ່າແຖວ`);
    const baseQty = qnum(l.qty * f.factor);
    if (baseQty <= 0) throw ApiError.badRequest('ຈຳນວນບໍ່ຖືກຕ້ອງ');
    need.set(p.id, (need.get(p.id) ?? 0) + baseQty);
    return { ...l, baseQty, uomId: f.uomId, factor: f.factor, unitPrice, gross, lineTotal: money(gross - l.discount) };
  });
  if (!branch.allowNegativeStock) {
    for (const [pid, q] of need) {
      const p = byId.get(pid)!;
      if (qnum(p.stockQty) - q < -0.0005) throw ApiError.conflict(`ສະຕັອກສິນຄ້າ "${p.name}" ບໍ່ພຽງພໍ (ມີ ${qnum(p.stockQty)})`);
    }
  }
  const subtotal = money(lines.reduce((n, l) => n + l.gross, 0));
  const discountTotal = money(lines.reduce((n, l) => n + l.discount, 0));
  const total = money(subtotal - discountTotal);
  if (total <= 0) throw ApiError.badRequest('ຍອດບິນຕ້ອງຫຼາຍກວ່າ 0');
  // VAT: ບິນ EXCLUSIVE ບວກພາສີ ແລະ ຢຸດໄວ້ຕອນສ້າງ (ຄືກັບບິນບໍລິການ); INCLUSIVE ແຍກຕອນອອກ INV. ບໍ່ມີ service charge.
  const { total: billTotal, vat } = await exclusiveBillVat(total);

  const id = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        branchId: input.branchId,
        totalAmount: new Prisma.Decimal(billTotal.toFixed(2)),
        depositAmount: new Prisma.Decimal(billTotal.toFixed(2)),
        paymentStatus: 'PENDING',
        ...(vat
          ? {
              vatRate: vat.vatRate,
              vatMode: vat.vatMode,
              taxAmount: new Prisma.Decimal(vat.taxAmount.toFixed(2)),
              netAmount: new Prisma.Decimal(vat.netAmount.toFixed(2)),
            }
          : {}),
      },
      select: { id: true },
    });
    const sale = await tx.retailSale.create({
      data: {
        saleNumber: await nextDocumentNo(tx, input.branchId, 'RS'),
        branchId: input.branchId,
        customerId: input.customerId ?? null,
        paymentId: payment.id,
        subtotal: new Prisma.Decimal(subtotal.toFixed(2)),
        discountTotal: new Prisma.Decimal(discountTotal.toFixed(2)),
        total: new Prisma.Decimal(total.toFixed(2)),
        notes: input.notes ?? null,
        createdByUserId: auth.sub,
        lines: {
          create: lines.map((l) => ({
            productId: l.productId,
            qty: qdec(l.baseQty),
            uomId: l.uomId,
            factorToBase: factorDec(l.factor),
            uomQty: qdec(l.qty),
            unitPrice: new Prisma.Decimal(l.unitPrice.toFixed(2)),
            discount: new Prisma.Decimal(l.discount.toFixed(2)),
            lineTotal: new Prisma.Decimal(l.lineTotal.toFixed(2)),
          })),
        },
      },
      select: { id: true },
    });
    return sale.id;
  });
  return getRetailSale(id, auth);
}

/** POST /retail-sales/:id/void — ຍົກເລີກບິນທີ່ຍັງບໍ່ມີເງິນເຂົ້າ (ຜ່ານ voidPayment ເດີມ; ມັນໝາຍ RetailSale VOIDED ນຳ). */
export async function voidRetailSale(id: string, reason: string, auth: AccessTokenPayload): Promise<RetailSaleView> {
  const s = await prisma.retailSale.findUnique({ where: { id }, select: { paymentId: true, branchId: true } });
  if (!s) throw ApiError.notFound('ບໍ່ພົບບິນຂາຍ');
  scopeBranch(auth, s.branchId);
  await voidPayment(auth, s.paymentId, reason);
  return getRetailSale(id, auth);
}

/** POST /retail-sales/:id/post-stock — ລອງຕັດສະຕັອກຄືນ (ບິນ PAID ທີ່ຕັດບໍ່ສຳເລັດ ເຊັ່ນ ສະຕັອກບໍ່ພໍຕອນຈ່າຍ). idempotent. */
export async function retryRetailSaleStock(id: string, auth: Auth): Promise<RetailSaleView> {
  const s = await prisma.retailSale.findUnique({ where: { id }, select: { branchId: true, status: true } });
  if (!s) throw ApiError.notFound('ບໍ່ພົບບິນຂາຍ');
  scopeBranch(auth, s.branchId);
  if (s.status !== 'PAID') throw ApiError.conflict('ຕັດສະຕັອກໄດ້ສະເພາະບິນທີ່ຈ່າຍຄົບແລ້ວ');
  try {
    await prisma.$transaction((tx) => postRetailSaleStockTx(tx, id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.retailSale.update({ where: { id }, data: { stockError: msg.slice(0, 400) } });
    throw err;
  }
  return getRetailSale(id, auth);
}

/**
 * POST /retail-sales/:id/returns — ຄືນສິນຄ້າ: ສ້າງຄຳຮ້ອງຄືນເງິນ (refund engine ເດີມ: ອະນຸມັດ → ຈ່າຍ → CN) ພ້ອມແຖວຄືນ.
 * ຍອດ = Σ qty × (lineTotal ÷ qty ຂອງແຖວ) (+ VAT ຖ້າບິນ EXCLUSIVE). ສະຕັອກເຂົ້າ (SALE_RETURN) ຕອນ refund PAID.
 */
export async function returnRetailSale(id: string, input: RetailSaleReturnInput, auth: AccessTokenPayload): Promise<RefundView> {
  const sale = await prisma.retailSale.findUnique({
    where: { id },
    include: {
      lines: { include: { returnLines: true, product: { select: { name: true } } } },
      payment: { select: { vatMode: true, vatRate: true } },
    },
  });
  if (!sale) throw ApiError.notFound('ບໍ່ພົບບິນຂາຍ');
  scopeBranch(auth, sale.branchId);
  if (sale.status !== 'PAID') throw ApiError.conflict('ຄືນສິນຄ້າໄດ້ສະເພາະບິນທີ່ຈ່າຍແລ້ວ');
  const refundIds = [...new Set(sale.lines.flatMap((l) => l.returnLines.map((r) => r.refundId)))];
  const refunds = refundIds.length
    ? await prisma.refund.findMany({ where: { id: { in: refundIds } }, select: { id: true, status: true } })
    : [];
  const openRefund = new Set(refunds.filter((r) => OPEN_REFUND.has(r.status)).map((r) => r.id));
  const lineBy = new Map(sale.lines.map((l) => [l.id, l]));
  const reqBy = new Map<string, number>();
  let amount = 0;
  const rows = input.lines.map((r) => {
    const l = lineBy.get(r.saleLineId);
    if (!l) throw ApiError.badRequest('ແຖວຂາຍບໍ່ແມ່ນຂອງບິນນີ້');
    const taken = l.returnLines.filter((x) => openRefund.has(x.refundId)).reduce((n, x) => n + qnum(x.qty), 0);
    const already = reqBy.get(l.id) ?? 0;
    const returnable = qnum(qnum(l.qty) - taken - already);
    if (r.qty > returnable + 0.0005) throw ApiError.badRequest(`"${l.product.name}" ຄືນໄດ້ສູງສຸດ ${Math.max(0, returnable)}`);
    reqBy.set(l.id, already + r.qty);
    const lineAmount = money((r.qty * qnum(l.lineTotal)) / qnum(l.qty));
    amount += lineAmount;
    return { ...r, amount: lineAmount };
  });
  const rate = sale.payment.vatMode === 'EXCLUSIVE' && sale.payment.vatRate ? sale.payment.vatRate.toNumber() : 0;
  const refundAmount = money(amount * (1 + rate));
  if (refundAmount <= 0) throw ApiError.badRequest('ຍອດຄືນຕ້ອງຫຼາຍກວ່າ 0');
  return createRefund(
    auth,
    sale.paymentId,
    { amount: refundAmount, reason: input.reason, method: input.method, returnPackageUnit: false },
    {
      afterCreate: async (tx, refundId) => {
        await tx.retailSaleReturnLine.createMany({
          data: rows.map((r) => ({
            saleLineId: r.saleLineId,
            refundId,
            qty: qdec(r.qty),
            amount: new Prisma.Decimal(r.amount.toFixed(2)),
            restock: r.restock,
          })),
        });
      },
    },
  );
}

// ---- Report: gross margin by product --------------------------------

/**
 * GET /retail-sales/margin — ກຳໄລຂັ້ນຕົ້ນຕໍ່ສິນຄ້າ ຂອງບິນ PAID ໃນຊ່ວງ (ວັນວຽງຈັນ ຕາມ paidAt):
 * revenue = Σ lineTotal ບໍ່ລວມ VAT × (1 − qtyReturned/qty); cogs = SOLD − SALE_RETURN ຂອງບິນເຫຼົ່ານັ້ນ (ledger).
 */
export async function getRetailMargin(q: RetailMarginQuery, auth: Auth): Promise<RetailMarginView> {
  const branchId = scopeBranch(auth, q.branchId);
  const { from, to, gte, lt } = vientianeDayRange(q);
  const sales = await prisma.retailSale.findMany({
    where: { status: 'PAID', paidAt: { gte, lt }, ...(branchId ? { branchId } : {}) },
    select: {
      id: true,
      payment: { select: { vatRate: true, vatMode: true } },
      lines: {
        select: {
          productId: true,
          qty: true,
          lineTotal: true,
          qtyReturned: true,
          product: { select: { name: true, sku: true, unit: true } },
        },
      },
    },
  });
  const moves = sales.length
    ? await prisma.stockMovement.findMany({
        where: {
          OR: [
            { type: 'SOLD', refId: { in: sales.map((s) => `sale:${s.id}`) } },
            {
              type: 'SALE_RETURN',
              refId: {
                in: (
                  await prisma.retailSaleReturnLine.findMany({
                    where: { saleLine: { saleId: { in: sales.map((s) => s.id) } } },
                    select: { refundId: true },
                  })
                ).map((r) => `saleret:${r.refundId}`),
              },
            },
          ],
        },
        select: { productId: true, type: true, valueChange: true },
      })
    : [];
  const by = new Map<string, RetailMarginRow>();
  const row = (pid: string, p: { name: string; sku: string; unit: string }) => {
    let r = by.get(pid);
    if (!r) {
      r = { productId: pid, productName: p.name, sku: p.sku, unit: p.unit, qtySold: 0, qtyReturned: 0, netQty: 0, revenue: 0, cogs: 0, grossMargin: 0, marginPct: 0 };
      by.set(pid, r);
    }
    return r;
  };
  for (const s of sales) {
    const rate = s.payment.vatRate ? s.payment.vatRate.toNumber() : 0;
    const exVat = (v: number) => (s.payment.vatMode === 'INCLUSIVE' && rate > 0 ? v / (1 + rate) : v);
    for (const l of s.lines) {
      const r = row(l.productId, l.product);
      const qty = qnum(l.qty);
      const ret = qnum(l.qtyReturned);
      r.qtySold += qty;
      r.qtyReturned += ret;
      r.revenue += exVat(qnum(l.lineTotal)) * (qty > 0 ? 1 - ret / qty : 0);
    }
  }
  for (const m of moves) {
    const r = by.get(m.productId);
    if (r) r.cogs -= qnum(m.valueChange);
  }
  const rows = [...by.values()]
    .map((r) => {
      const revenue = money(r.revenue);
      const cogs = money(r.cogs);
      const grossMargin = money(revenue - cogs);
      return {
        ...r,
        qtySold: qnum(r.qtySold),
        qtyReturned: qnum(r.qtyReturned),
        netQty: qnum(r.qtySold - r.qtyReturned),
        revenue,
        cogs,
        grossMargin,
        marginPct: revenue > 0 ? Math.round((grossMargin / revenue) * 10000) / 10000 : 0,
      };
    })
    .sort((a, b) => b.grossMargin - a.grossMargin);
  const sum = (f: (r: RetailMarginRow) => number) => rows.reduce((n, r) => n + f(r), 0);
  const revenue = money(sum((r) => r.revenue));
  const cogs = money(sum((r) => r.cogs));
  return {
    from,
    to,
    branchId,
    rows,
    totals: {
      saleCount: sales.length,
      qtySold: qnum(sum((r) => r.qtySold)),
      qtyReturned: qnum(sum((r) => r.qtyReturned)),
      revenue,
      cogs,
      grossMargin: money(revenue - cogs),
      marginPct: revenue > 0 ? Math.round(((revenue - cogs) / revenue) * 10000) / 10000 : 0,
    },
  };
}
