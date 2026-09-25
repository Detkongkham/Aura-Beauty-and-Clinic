import {
  INVENTORY_EXPORT_MAX_ROWS,
  type AccessTokenPayload,
  type InventoryExportView,
  type Paginated,
  type PoMatchStatusValue,
  type PurchaseOrderMatchView,
  type SupplierBalanceView,
  type SupplierReturnCancelInput,
  type SupplierReturnCreateInput,
  type SupplierReturnListQuery,
  type SupplierReturnView,
} from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { nextDocumentNo } from '../../utils/documentNumbers.js';
import {
  assertBranchScope,
  costDec,
  costNum,
  deductStock,
  getAdjustSettings,
  lockProductRows,
  money,
  qdec,
  qnum,
} from './inventory.service.js';

/**
 * Inventory ຄື້ນ 9D — 3-way match (H4) + ຄືນສິນຄ້າຜູ້ສະໜອງ / debit note (H5).
 *
 * 3-way match: PO (ສັ່ງ) ↔ GRN (ຮັບຈິງ, accepted × ຕົ້ນທຶນ GRN) ↔ ໃບເກັບເງິນຜູ້ສະໜອງ = Expense ທີ່ຜູກ `purchaseOrderId`
 * (SUBMITTED/APPROVED/PAID; ບໍ່ສ້າງ model SupplierInvoice ໃໝ່). ຍອດ LAK (amountBase) ລວມພາສີ → ທຽບກັບ
 * `ມູນຄ່າທີ່ຮັບສຸດທິ + ພາສີ`. Debit note (ໃບຄືນ POSTED ທີ່ຜູກ PO) ຫັກທັງສອງຝັ່ງ: ມູນຄ່າທີ່ຮັບສຸດທິ = ຮັບ − ຄືນ,
 * ຍອດເກັບສຸດທິ = ໃບເກັບເງິນ − debit note.
 *
 * Debit note: Expense ບໍ່ມີແນວຄິດ "ເຄຣດິດ" (amount ຕ້ອງບວກ, VOID ແມ່ນຍົກເລີກທັງໃບ) → ໃຊ້ SupplierReturn ທີ່ POSTED ເອງເປັນ
 * debit note (ເລກ RTS-…, totalValue) — 3-way match ແລະ ຍອດຄົງຄ້າງຜູ້ສະໜອງ (`supplierBalance`) ຫັກມັນອອກ.
 */

type Auth = Pick<AccessTokenPayload, 'sub' | 'role' | 'branchId'>;
type Db = Prisma.TransactionClient | typeof prisma;
const EPS = 0.0005;
/** Expense ທີ່ນັບເປັນໃບເກັບເງິນຂອງ PO (ສົ່ງແລ້ວ — ຮ່າງ/ປະຕິເສດ/ຍົກເລີກ ບໍ່ນັບ). */
const INVOICE_STATUSES = ['SUBMITTED', 'APPROVED', 'PAID'] as const;

// ============================================================ 3-way match

export async function computePoMatch(db: Db, poId: string): Promise<PurchaseOrderMatchView> {
  const po = await db.purchaseOrder.findUnique({
    where: { id: poId },
    include: { items: { include: { product: { select: { name: true, sku: true, unit: true } } } } },
  });
  if (!po) throw ApiError.notFound('ບໍ່ພົບໃບສັ່ງຊື້');
  const [grnLines, returns, invoices, settings] = await Promise.all([
    db.goodsReceiptLine.findMany({
      where: { goodsReceipt: { purchaseOrderId: poId } },
      select: { poItemId: true, qtyReceived: true, qtyRejected: true, unitCost: true },
    }),
    db.supplierReturn.findMany({
      where: { purchaseOrderId: poId, status: 'POSTED' },
      include: { lines: { select: { productId: true, qty: true, value: true } } },
      orderBy: { postedAt: 'asc' },
    }),
    db.expense.findMany({
      where: { purchaseOrderId: poId, status: { in: [...INVOICE_STATUSES] } },
      select: { id: true, title: true, invoiceNumber: true, status: true, amountBase: true, taxAmount: true, fxRate: true },
      orderBy: { createdAt: 'asc' },
    }),
    getAdjustSettings(),
  ]);

  const recvByItem = new Map<string, { qty: number; rejected: number; value: number }>();
  for (const l of grnLines) {
    const cur = recvByItem.get(l.poItemId) ?? { qty: 0, rejected: 0, value: 0 };
    cur.qty += qnum(l.qtyReceived);
    cur.rejected += qnum(l.qtyRejected);
    cur.value += qnum(l.qtyReceived) * costNum(l.unitCost);
    recvByItem.set(l.poItemId, cur);
  }
  const retByProduct = new Map<string, { qty: number; value: number }>();
  for (const r of returns) {
    for (const l of r.lines) {
      const cur = retByProduct.get(l.productId) ?? { qty: 0, value: 0 };
      cur.qty += qnum(l.qty);
      cur.value += money(l.value);
      retByProduct.set(l.productId, cur);
    }
  }

  // M10 — ທຸກຍອດຂອງ match ເປັນ LAK: ລາຄາ PO (ສະກຸນ PO) × fxRate; GRN unitCost ເປັນ LAK ຢູ່ແລ້ວ; ໃບເກັບເງິນ = amountBase.
  const fx = po.fxRate.toNumber();
  const lines = po.items.map((it) => {
    const recv = recvByItem.get(it.id) ?? { qty: 0, rejected: 0, value: 0 };
    const poUnitCostLak = it.unitCost.toNumber() * fx;
    const ret = retByProduct.get(it.productId) ?? { qty: 0, value: 0 };
    return {
      poItemId: it.id,
      productId: it.productId,
      productName: it.product.name,
      sku: it.product.sku,
      unit: it.product.unit,
      orderedQty: qnum(it.quantity),
      receivedQty: qnum(recv.qty),
      rejectedQty: qnum(recv.rejected),
      returnedQty: qnum(ret.qty),
      poUnitCost: money(poUnitCostLak),
      orderedValue: money(qnum(it.quantity) * poUnitCostLak),
      receivedValue: money(recv.value),
      returnedValue: money(ret.value),
    };
  });

  const ordered = money(lines.reduce((s, l) => s + l.orderedValue, 0));
  const received = money(lines.reduce((s, l) => s + l.receivedValue, 0));
  const returned = money(returns.reduce((s, r) => s + money(r.totalValue), 0));
  const invoiceViews = invoices.map((e) => ({
    expenseId: e.id,
    title: e.title,
    invoiceNumber: e.invoiceNumber,
    status: e.status,
    amountBase: money(e.amountBase),
    taxBase: e.taxAmount != null ? money(qnum(e.taxAmount) * e.fxRate.toNumber()) : 0,
  }));
  const invoiced = money(invoiceViews.reduce((s, i) => s + i.amountBase, 0));
  const invoicedTax = money(invoiceViews.reduce((s, i) => s + i.taxBase, 0));
  const netReceived = money(received - returned);
  const netInvoiced = money(invoiced - returned);
  const expected = money(netReceived + invoicedTax);
  const tol = settings.invoiceMatchTolerancePct / 100;

  let status: PoMatchStatusValue;
  if (!invoiceViews.length) status = 'NO_INVOICE';
  // ≤ 1 LAK ຖືວ່າເທົ່າກັນ (ປັດເສດ). ໃບເກັບເງິນຕ່ຳກວ່າມູນຄ່າທີ່ຮັບ (ເກັບເປັນງວດ) ບໍ່ສ່ຽງຈ່າຍເກີນ → MATCHED.
  else if (netInvoiced <= expected * (1 + tol) + 1) status = 'MATCHED';
  else {
    const stillOpen = ['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED'].includes(po.status);
    const orderedCeiling = (ordered - returned + invoicedTax) * (1 + tol) + 1;
    status = stillOpen && netInvoiced <= orderedCeiling ? 'UNDER_RECEIVED' : 'OVER_INVOICED';
  }

  return {
    purchaseOrderId: po.id,
    poNumber: po.poNumber,
    poStatus: po.status,
    status,
    tolerancePct: settings.invoiceMatchTolerancePct,
    ordered,
    received,
    returned,
    netReceived,
    invoiced,
    invoicedTax,
    netInvoiced,
    expected,
    variance: money(netInvoiced - expected),
    invoices: invoiceViews,
    debitNotes: returns.map((r) => ({
      supplierReturnId: r.id,
      returnNumber: r.returnNumber,
      postedAt: r.postedAt ? r.postedAt.toISOString() : null,
      value: money(r.totalValue),
    })),
    lines,
  };
}

export async function getPoMatch(poId: string): Promise<PurchaseOrderMatchView> {
  return computePoMatch(prisma, poId);
}

/** ສະຫຼຸບ match ຕໍ່ PO (ໃຊ້ໃນລາຍການ Expense). */
export async function poMatchSummaries(
  poIds: string[],
): Promise<Map<string, { status: PoMatchStatusValue; variance: number }>> {
  const out = new Map<string, { status: PoMatchStatusValue; variance: number }>();
  for (const id of [...new Set(poIds)]) {
    try {
      const m = await computePoMatch(prisma, id);
      out.set(id, { status: m.status, variance: m.variance });
    } catch {
      // PO ຖືກລຶບ — ຂ້າມ
    }
  }
  return out;
}

// ============================================================ Supplier returns (H5)

const RETURN_INCLUDE = {
  branch: { select: { name: true } },
  supplier: { select: { name: true } },
  purchaseOrder: { select: { poNumber: true } },
  goodsReceipt: { select: { grnNumber: true } },
  createdBy: { select: { name: true } },
  postedBy: { select: { name: true } },
  lines: {
    include: {
      product: { select: { name: true, sku: true, unit: true } },
      lot: { select: { lotNumber: true } },
    },
  },
  _count: { select: { lines: true } },
} satisfies Prisma.SupplierReturnInclude;
type ReturnRow = Prisma.SupplierReturnGetPayload<{ include: typeof RETURN_INCLUDE }>;

function toReturnView(r: ReturnRow, withLines: boolean): SupplierReturnView {
  return {
    id: r.id,
    returnNumber: r.returnNumber,
    branchId: r.branchId,
    branchName: r.branch.name,
    supplierId: r.supplierId,
    supplierName: r.supplier.name,
    purchaseOrderId: r.purchaseOrderId,
    poNumber: r.purchaseOrder?.poNumber ?? null,
    goodsReceiptId: r.goodsReceiptId,
    grnNumber: r.goodsReceipt?.grnNumber ?? null,
    status: r.status,
    reason: r.reason,
    notes: r.notes,
    totalValue: money(r.totalValue),
    lineCount: r._count.lines,
    createdByUserName: r.createdBy?.name ?? null,
    postedByUserName: r.postedBy?.name ?? null,
    postedAt: r.postedAt ? r.postedAt.toISOString() : null,
    cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null,
    cancelReason: r.cancelReason,
    createdAt: r.createdAt.toISOString(),
    ...(withLines
      ? {
          lines: r.lines.map((l) => ({
            id: l.id,
            productId: l.productId,
            productName: l.product.name,
            sku: l.product.sku,
            unit: l.product.unit,
            lotId: l.lotId,
            lotNumber: l.lot?.lotNumber ?? null,
            qty: qnum(l.qty),
            unitCost: l.unitCost != null ? money(l.unitCost) : null,
            value: l.value != null ? money(l.value) : null,
          })),
        }
      : {}),
  };
}

export async function listSupplierReturns(
  q: SupplierReturnListQuery,
  authBranchId?: string | null,
): Promise<Paginated<SupplierReturnView>> {
  const where: Prisma.SupplierReturnWhereInput = {
    ...(authBranchId ? { branchId: authBranchId } : q.branchId ? { branchId: q.branchId } : {}),
    ...(q.supplierId ? { supplierId: q.supplierId } : {}),
    ...(q.purchaseOrderId ? { purchaseOrderId: q.purchaseOrderId } : {}),
    ...(q.status ? { status: q.status } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.supplierReturn.findMany({
      where,
      include: RETURN_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.supplierReturn.count({ where }),
  ]);
  return {
    items: rows.map((r) => toReturnView(r, false)),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export async function exportSupplierReturns(
  q: SupplierReturnListQuery,
  authBranchId?: string | null,
  maxRows: number = INVENTORY_EXPORT_MAX_ROWS,
): Promise<InventoryExportView<SupplierReturnView>> {
  const r = await listSupplierReturns({ ...q, page: 1, pageSize: maxRows }, authBranchId);
  return { items: r.items, total: r.total, truncated: r.total > r.items.length, maxRows };
}

async function returnDetail(db: Db, id: string): Promise<SupplierReturnView> {
  const r = await db.supplierReturn.findUnique({ where: { id }, include: RETURN_INCLUDE });
  if (!r) throw ApiError.notFound('ບໍ່ພົບໃບຄືນສິນຄ້າ');
  return toReturnView(r, true);
}

export async function getSupplierReturn(id: string, authBranchId?: string | null): Promise<SupplierReturnView> {
  const v = await returnDetail(prisma, id);
  if (authBranchId && authBranchId !== v.branchId) throw ApiError.forbidden('ເບິ່ງໄດ້ສະເພາະໃບຄືນຂອງສາຂາຂອງທ່ານ');
  return v;
}

export async function createSupplierReturn(input: SupplierReturnCreateInput, auth: Auth | null): Promise<SupplierReturnView> {
  assertBranchScope(auth?.branchId, input.branchId);
  const [branch, supplier] = await Promise.all([
    prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true } }),
    prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true } }),
  ]);
  if (!branch) throw ApiError.badRequest('ບໍ່ພົບສາຂາ');
  if (!supplier) throw ApiError.badRequest('ບໍ່ພົບຜູ້ສະໜອງ');

  let purchaseOrderId = input.purchaseOrderId ?? null;
  let allowedProducts: Set<string> | null = null;
  if (input.goodsReceiptId) {
    const grn = await prisma.goodsReceipt.findUnique({
      where: { id: input.goodsReceiptId },
      include: { purchaseOrder: { select: { supplierId: true } }, lines: { select: { productId: true } } },
    });
    if (!grn) throw ApiError.badRequest('ບໍ່ພົບໃບຮັບເຄື່ອງ (GRN)');
    if (purchaseOrderId && grn.purchaseOrderId !== purchaseOrderId) throw ApiError.badRequest('GRN ບໍ່ແມ່ນຂອງ PO ນີ້');
    if (grn.branchId !== input.branchId || grn.purchaseOrder.supplierId !== input.supplierId) {
      throw ApiError.badRequest('GRN ຕ້ອງເປັນຂອງສາຂາ ແລະ ຜູ້ສະໜອງດຽວກັນ');
    }
    purchaseOrderId = grn.purchaseOrderId;
    allowedProducts = new Set(grn.lines.map((l) => l.productId));
  } else if (purchaseOrderId) {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: { select: { productId: true } } },
    });
    if (!po) throw ApiError.badRequest('ບໍ່ພົບໃບສັ່ງຊື້');
    if (po.branchId !== input.branchId || po.supplierId !== input.supplierId) {
      throw ApiError.badRequest('PO ຕ້ອງເປັນຂອງສາຂາ ແລະ ຜູ້ສະໜອງດຽວກັນ');
    }
    allowedProducts = new Set(po.items.map((i) => i.productId));
  }

  const keys = input.lines.map((l) => `${l.productId}|${l.lotId ?? ''}`);
  if (new Set(keys).size !== keys.length) throw ApiError.badRequest('ມີແຖວຊ້ຳກັນ (ສິນຄ້າ + lot ດຽວກັນ)');
  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, deletedAt: null },
    select: { id: true, branchId: true, name: true },
  });
  if (products.length !== productIds.length) throw ApiError.badRequest('ມີສິນຄ້າບາງລາຍການບໍ່ພົບ');
  if (products.some((p) => p.branchId !== input.branchId)) throw ApiError.badRequest('ສິນຄ້າຕ້ອງຢູ່ສາຂາດຽວກັນກັບໃບຄືນ');
  if (allowedProducts && productIds.some((id) => !allowedProducts!.has(id))) {
    throw ApiError.badRequest('ສິນຄ້າບາງລາຍການບໍ່ຢູ່ໃນ PO/GRN ທີ່ອ້າງອີງ');
  }
  const lotIds = input.lines.map((l) => l.lotId).filter((v): v is string => !!v);
  if (lotIds.length) {
    const lots = await prisma.stockLot.findMany({ where: { id: { in: lotIds } }, select: { id: true, productId: true, branchId: true } });
    for (const l of input.lines) {
      if (!l.lotId) continue;
      const lot = lots.find((x) => x.id === l.lotId);
      if (!lot || lot.productId !== l.productId || lot.branchId !== input.branchId) throw ApiError.badRequest('Lot ບໍ່ຖືກຕ້ອງ');
    }
  }

  const id = await prisma.$transaction(async (tx) => {
    const r = await tx.supplierReturn.create({
      data: {
        returnNumber: await nextDocumentNo(tx, input.branchId, 'RTS'),
        branchId: input.branchId,
        supplierId: input.supplierId,
        purchaseOrderId,
        goodsReceiptId: input.goodsReceiptId ?? null,
        reason: input.reason,
        notes: input.notes?.trim() || null,
        createdByUserId: auth?.sub ?? null,
        lines: {
          create: input.lines.map((l) => ({ productId: l.productId, lotId: l.lotId ?? null, qty: qdec(l.qty) })),
        },
      },
      select: { id: true },
    });
    return r.id;
  });
  return returnDetail(prisma, id);
}

/**
 * DRAFT → POSTED: ຕັດສະຕັອກເປັນ RETURN_TO_SUPPLIER (reason SUPPLIER_RETURN, refId `rts:<id>`) ໃນ tx ດຽວ + lock ສິນຄ້າ
 * (ລຽງ id). ແຖວທີ່ລະບຸ lot → ຕັດ lot ນັ້ນ (ບໍ່ພໍ = 409, lot ບໍ່ຕິດລົບ); ສິນຄ້າ trackLot ບໍ່ລະບຸ lot → FEFO.
 * ມູນຄ່າ: ຕົ້ນທຶນ lot → ຕົ້ນທຶນ GRN ທີ່ຜູກ (GRN/PO) → WAC. WAC ບໍ່ປ່ຽນ (C4). ກວດ allowNegativeStock (C2).
 * ຄືນເກີນຈຳນວນທີ່ຮັບຈາກ GRN/PO ທີ່ອ້າງອີງ (ລົບທີ່ຄືນແລ້ວ) ບໍ່ໄດ້. ມູນຄ່າລວມ = debit note.
 */
export async function postSupplierReturn(id: string, auth: Auth): Promise<SupplierReturnView> {
  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "supplier_returns" WHERE id = ${id} FOR UPDATE`;
      const r = await tx.supplierReturn.findUnique({ where: { id }, include: { lines: true } });
      if (!r) throw ApiError.notFound('ບໍ່ພົບໃບຄືນສິນຄ້າ');
      assertBranchScope(auth.branchId, r.branchId);
      if (r.status !== 'DRAFT') throw ApiError.conflict('post ໄດ້ສະເພາະໃບຄືນທີ່ເປັນຮ່າງ');
      const branch = await tx.branch.findUnique({ where: { id: r.branchId }, select: { allowNegativeStock: true } });

      await lockProductRows(tx, r.lines.map((l) => l.productId));
      const products = await tx.product.findMany({
        where: { id: { in: r.lines.map((l) => l.productId) } },
        select: { id: true, name: true, branchId: true, stockQty: true, costPrice: true, trackLot: true, deletedAt: true },
      });
      const productById = new Map(products.map((p) => [p.id, p]));

      // ຕົ້ນທຶນ GRN + ເພດານຈຳນວນຄືນ (ຮັບ − ຄືນແລ້ວ) ຕໍ່ສິນຄ້າ ເມື່ອຜູກ GRN/PO.
      const grnCost = new Map<string, number>();
      const cap = new Map<string, number>();
      if (r.goodsReceiptId || r.purchaseOrderId) {
        const grnLines = await tx.goodsReceiptLine.findMany({
          where: r.goodsReceiptId ? { goodsReceiptId: r.goodsReceiptId } : { goodsReceipt: { purchaseOrderId: r.purchaseOrderId! } },
          select: { productId: true, qtyReceived: true, unitCost: true },
        });
        const agg = new Map<string, { qty: number; value: number }>();
        for (const l of grnLines) {
          const cur = agg.get(l.productId) ?? { qty: 0, value: 0 };
          cur.qty += qnum(l.qtyReceived);
          cur.value += qnum(l.qtyReceived) * costNum(l.unitCost);
          agg.set(l.productId, cur);
        }
        const prior = await tx.supplierReturnLine.groupBy({
          by: ['productId'],
          where: {
            supplierReturn: {
              status: 'POSTED',
              ...(r.goodsReceiptId ? { goodsReceiptId: r.goodsReceiptId } : { purchaseOrderId: r.purchaseOrderId }),
            },
          },
          _sum: { qty: true },
        });
        const priorBy = new Map(prior.map((p) => [p.productId, qnum(p._sum.qty)]));
        for (const [pid, a] of agg) {
          if (a.qty > 0) grnCost.set(pid, a.value / a.qty);
          cap.set(pid, qnum(a.qty - (priorBy.get(pid) ?? 0)));
        }
        const wanted = new Map<string, number>();
        for (const l of r.lines) wanted.set(l.productId, qnum((wanted.get(l.productId) ?? 0) + qnum(l.qty)));
        for (const [pid, q] of wanted) {
          const max = cap.get(pid) ?? 0;
          if (q > max + EPS) {
            throw ApiError.conflict(`ຄືນ "${productById.get(pid)?.name ?? pid}" ເກີນຈຳນວນທີ່ຮັບມາ (ຄືນໄດ້ອີກ ${Math.max(0, max)})`);
          }
        }
      }

      const refId = `rts:${r.id}`;
      const notes = `ຄືນສິນຄ້າຜູ້ສະໜອງ ${r.returnNumber} — ${r.reason}`;
      let total = 0;
      const ordered = [...r.lines].sort((a, b) => a.productId.localeCompare(b.productId));
      for (const line of ordered) {
        const p = productById.get(line.productId);
        if (!p || p.deletedAt) throw ApiError.conflict('ສິນຄ້າໃນໃບຄືນຖືກລຶບແລ້ວ');
        const qty = qnum(line.qty);
        const before = qnum(p.stockQty);
        const balance = qnum(before - qty);
        if (balance < 0 && !branch?.allowNegativeStock) {
          throw ApiError.conflict(`ສະຕັອກ "${p.name}" ບໍ່ພຽງພໍສຳລັບການຄືນນີ້`);
        }
        const fallbackCost = grnCost.get(p.id) ?? costNum(p.costPrice);
        let value = 0;
        if (line.lotId) {
          const lot = await tx.stockLot.findUnique({ where: { id: line.lotId } });
          if (!lot || lot.productId !== p.id) throw ApiError.conflict('Lot ບໍ່ຖືກຕ້ອງ');
          if (qnum(lot.qtyOnHand) < qty - EPS) {
            throw ApiError.conflict(`Lot ${lot.lotNumber} ຂອງ "${p.name}" ມີສະຕັອກບໍ່ພຽງພໍ`);
          }
          const unitCost = costNum(lot.unitCost);
          await tx.stockLot.update({ where: { id: lot.id }, data: { qtyOnHand: qdec(qnum(lot.qtyOnHand) - qty) } });
          value = qty * unitCost;
          await tx.stockMovement.create({
            data: {
              branchId: p.branchId,
              productId: p.id,
              type: 'RETURN_TO_SUPPLIER',
              qty: qdec(qty),
              balanceAfter: qdec(balance),
              unitCost: costDec(unitCost),
              valueChange: money(-value),
              lotId: lot.id,
              reasonCode: 'SUPPLIER_RETURN',
              refId,
              notes,
              createdByUserId: auth.sub,
            },
          });
        } else {
          // ສິນຄ້າ trackLot → FEFO; ສິນຄ້າທົ່ວໄປ → 1 ແຖວ ຕາມຕົ້ນທຶນ GRN/WAC.
          const rows = await deductStock(tx, {
            productId: p.id,
            branchId: p.branchId,
            trackLot: p.trackLot,
            wac: fallbackCost,
            qty,
            balanceBefore: before,
            type: 'RETURN_TO_SUPPLIER',
            refId,
            notes,
            createdByUserId: auth.sub,
            reasonCode: 'SUPPLIER_RETURN',
          });
          value = rows.reduce((s, m) => s - qnum(m.valueChange), 0);
        }
        // C4 — ການຄືນບໍ່ປ່ຽນ WAC; ປ່ຽນສະເພາະ stockQty.
        await tx.product.update({ where: { id: p.id }, data: { stockQty: qdec(balance) } });
        p.stockQty = qdec(balance);
        total += money(value);
        await tx.supplierReturnLine.update({
          where: { id: line.id },
          data: { unitCost: costDec(qty > 0 ? value / qty : 0), value: new Prisma.Decimal(money(value).toFixed(2)) },
        });
      }
      await tx.supplierReturn.update({
        where: { id },
        data: {
          status: 'POSTED',
          postedAt: new Date(),
          postedByUserId: auth.sub,
          totalValue: new Prisma.Decimal(money(total).toFixed(2)),
        },
      });
    },
    { timeout: 30_000 },
  );
  return returnDetail(prisma, id);
}

export async function cancelSupplierReturn(
  id: string,
  auth: Auth,
  input: SupplierReturnCancelInput,
): Promise<SupplierReturnView> {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "supplier_returns" WHERE id = ${id} FOR UPDATE`;
    const r = await tx.supplierReturn.findUnique({ where: { id }, select: { status: true, branchId: true } });
    if (!r) throw ApiError.notFound('ບໍ່ພົບໃບຄືນສິນຄ້າ');
    assertBranchScope(auth.branchId, r.branchId);
    if (r.status !== 'DRAFT') throw ApiError.conflict('ຍົກເລີກໄດ້ສະເພາະໃບຄືນທີ່ເປັນຮ່າງ (post ແລ້ວ = debit note ອອກແລ້ວ)');
    await tx.supplierReturn.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: input.reason?.trim() || null },
    });
  });
  return returnDetail(prisma, id);
}

/**
 * ຍອດຄົງຄ້າງຂອງຜູ້ສະໜອງ (LAK): ໃບເກັບເງິນ = Expense SUBMITTED/APPROVED/PAID ທີ່ supplierId ຫຼື PO ເປັນຂອງຜູ້ສະໜອງນີ້;
 * outstanding = ໃບເກັບເງິນ − ຈ່າຍແລ້ວ (PAID) − debit notes (ໃບຄືນ POSTED).
 */
export async function getSupplierBalance(supplierId: string, authBranchId?: string | null): Promise<SupplierBalanceView> {
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true, name: true } });
  if (!supplier) throw ApiError.notFound('ບໍ່ພົບຜູ້ສະໜອງ');
  const branchWhere = authBranchId ? { branchId: authBranchId } : {};
  const expenseWhere: Prisma.ExpenseWhereInput = {
    ...branchWhere,
    OR: [{ supplierId }, { purchaseOrder: { supplierId } }],
  };
  const [inv, paid, dn] = await Promise.all([
    prisma.expense.aggregate({ where: { ...expenseWhere, status: { in: [...INVOICE_STATUSES] } }, _sum: { amountBase: true } }),
    prisma.expense.aggregate({ where: { ...expenseWhere, status: 'PAID' }, _sum: { amountBase: true } }),
    prisma.supplierReturn.aggregate({ where: { ...branchWhere, supplierId, status: 'POSTED' }, _sum: { totalValue: true } }),
  ]);
  const invoiced = money(inv._sum.amountBase);
  const paidAmt = money(paid._sum.amountBase);
  const debitNotes = money(dn._sum.totalValue);
  return {
    supplierId,
    supplierName: supplier.name,
    invoiced,
    paid: paidAmt,
    debitNotes,
    outstanding: money(invoiced - paidAmt - debitNotes),
  };
}
