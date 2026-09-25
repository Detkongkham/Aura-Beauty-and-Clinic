import type {
  ReorderSuggestionGroup,
  ReorderSuggestionItem,
  ReorderSuggestionQuery,
  ReorderSuggestionView,
} from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { costDec, costNum, getAdjustSettings, money, qdec, qnum, reorderThresholdOf } from './inventory.service.js';
import { ON_ORDER_PO_STATUSES, onOrderByProduct, reservedByProduct } from './reservation.service.js';
import { factorNum } from './inventory-master.service.js';

/**
 * M11 (inventory audit ຄື້ນ 9D) — ຈຸດສັ່ງຊື້ໃໝ່ອັດຕະໂນມັດ + ຄຳແນະນຳ PO.
 *
 *   avgDailyUsage = Σ (SERVICE_CONSUMED + SOLD − SALE_RETURN) (qty) ໃນ 90 ວັນຫຼ້າສຸດ ÷ 90   (M13 — ລວມຂາຍໜ້າຮ້ານ)
 *   leadTime      = SupplierProduct ທີ່ isPreferred (leadTimeDays → Supplier.leadTimeDays) → ລາຍການລາຄາອື່ນ → default
 *   safetyStock   = avgDailyUsage × inventory.safetyStockDays (default 3)
 *   reorderPoint  = avgDailyUsage × leadTime + safetyStock
 *   ເກນທີ່ໃຊ້ຈິງ   = max(minStockQty, reorderPoint)  (minStockQty = ພື້ນຂັ້ນຕ່ຳທີ່ຕັ້ງດ້ວຍມື)
 *
 * ຄຳແນະນຳ: ສິນຄ້າທີ່ available + onOrder ≤ ເກນ → ສັ່ງໃຫ້ຮອດ ເກນ + avgDaily × inventory.reorderReviewDays,
 * ປັດຂຶ້ນເປັນຈຳນວນເຕັມ ແລະ ຜົນຄູນຂອງ MOQ, ຈັດກຸ່ມຕາມຜູ້ສະໜອງຫຼັກ (→ ໜຶ່ງ PO DRAFT ຕໍ່ກຸ່ມ).
 */

export const USAGE_WINDOW_DAYS = 90;

type SupplierLink = {
  isPreferred: boolean;
  leadTimeDays: number | null;
  unitCost: Prisma.Decimal;
  currency: string;
  moq: Prisma.Decimal | null;
  uomId?: string | null;
  factorToBase?: Prisma.Decimal;
  uom?: { code: string } | null;
  supplier: {
    id: string;
    name: string;
    leadTimeDays: number | null;
    isActive: boolean;
    deletedAt: Date | null;
    branchId: string | null;
  };
};

const LINK_SELECT = {
  isPreferred: true,
  leadTimeDays: true,
  unitCost: true,
  currency: true,
  moq: true,
  uomId: true,
  factorToBase: true,
  uom: { select: { code: true } },
  supplier: { select: { id: true, name: true, leadTimeDays: true, isActive: true, deletedAt: true, branchId: true } },
} satisfies Prisma.SupplierProductSelect;

/** ລາຍການລາຄາທີ່ໃຊ້ໄດ້ (ຜູ້ສະໜອງ active, ບໍ່ຖືກລຶບ, ຂອງສາຂາສິນຄ້າ ຫຼື ໃຊ້ຮ່ວມ) — ຜູ້ສະໜອງຫຼັກກ່ອນ ແລ້ວລາຄາຖືກສຸດ. */
function usableLinks(links: SupplierLink[], productBranchId: string): SupplierLink[] {
  return links
    .filter((l) => l.supplier.isActive && !l.supplier.deletedAt && (!l.supplier.branchId || l.supplier.branchId === productBranchId))
    .sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred) || costNum(a.unitCost) - costNum(b.unitCost));
}

export function leadTimeOf(links: SupplierLink[], productBranchId: string, defaultDays: number): number {
  const best = usableLinks(links, productBranchId)[0];
  return best?.leadTimeDays ?? best?.supplier.leadTimeDays ?? defaultDays;
}

export function reorderPointOf(avgDaily: number, leadTimeDays: number, safetyDays: number): number {
  return avgDaily * leadTimeDays + avgDaily * safetyDays;
}

/** ປັດຂຶ້ນເປັນຈຳນວນເຕັມ (ຢ່າງໜ້ອຍ 1) ແລ້ວເປັນຜົນຄູນຂອງ MOQ. */
export function roundOrderQty(raw: number, moq: number | null): number {
  const units = Math.max(1, Math.ceil(raw - 1e-9));
  if (!moq || moq <= 0) return units;
  return qnum(Math.ceil(units / moq - 1e-9) * moq);
}

/** Job ທຸກຄືນ — ຄິດ avgDailyUsage/reorderPoint ຂອງທຸກສິນຄ້າ (ບໍ່ແຕະ stockQty/ledger). */
export async function computeReorderPoints(
  now: Date = new Date(),
  opts: { productIds?: string[] } = {},
): Promise<{ products: number; withUsage: number }> {
  const settings = await getAdjustSettings();
  const since = new Date(now.getTime() - USAGE_WINDOW_DAYS * 86_400_000);
  const [usage, products] = await Promise.all([
    prisma.stockMovement.groupBy({
      by: ['productId', 'type'],
      where: {
        type: { in: ['SERVICE_CONSUMED', 'SOLD', 'SALE_RETURN'] },
        createdAt: { gte: since, lt: now },
        ...(opts.productIds ? { productId: { in: opts.productIds } } : {}),
      },
      _sum: { qty: true },
    }),
    prisma.product.findMany({
      where: { deletedAt: null, ...(opts.productIds ? { id: { in: opts.productIds } } : {}) },
      select: { id: true, branchId: true, supplierProducts: { select: LINK_SELECT } },
    }),
  ]);
  const usedBy = new Map<string, number>();
  for (const u of usage) {
    const sign = u.type === 'SALE_RETURN' ? -1 : 1;
    usedBy.set(u.productId, (usedBy.get(u.productId) ?? 0) + sign * qnum(u._sum.qty));
  }
  let withUsage = 0;
  const CHUNK = 200;
  for (let i = 0; i < products.length; i += CHUNK) {
    await prisma.$transaction(
      products.slice(i, i + CHUNK).map((p) => {
        const avg = Math.max(0, usedBy.get(p.id) ?? 0) / USAGE_WINDOW_DAYS;
        if (avg > 0) withUsage += 1;
        const lead = leadTimeOf(p.supplierProducts, p.branchId, settings.defaultLeadTimeDays);
        return prisma.product.update({
          where: { id: p.id },
          data: {
            avgDailyUsage: costDec(avg),
            reorderPoint: qdec(reorderPointOf(avg, lead, settings.safetyStockDays)),
            reorderComputedAt: now,
          },
        });
      }),
    );
  }
  return { products: products.length, withUsage };
}

/**
 * GET /purchase-orders/suggestions?branchId — ສິນຄ້າ active ທີ່ available + onOrder ≤ max(min, reorderPoint).
 * ການກັ່ນເຮັດຝັ່ງ SQL (reservation/on-order aggregate) ແລ້ວຈຶ່ງໂຫຼດລາຍລະອຽດສະເພາະແຖວທີ່ຜ່ານ.
 */
export async function getReorderSuggestions(
  q: ReorderSuggestionQuery,
  authBranchId?: string | null,
): Promise<ReorderSuggestionView> {
  if (authBranchId && q.branchId && q.branchId !== authBranchId) throw ApiError.forbidden('ບໍ່ມີສິດເບິ່ງສາຂາອື່ນ');
  const branchId = authBranchId ?? q.branchId ?? null;
  const branchSql = branchId ? Prisma.sql`AND p."branchId" = ${branchId}` : Prisma.empty;
  const due = await prisma.$queryRaw<{ id: string }[]>`
    WITH r AS (
      SELECT "productId", SUM(qty) AS qty FROM "stock_reservations" WHERE status = 'ACTIVE' GROUP BY "productId"
    ), o AS (
      SELECT i."productId", SUM(GREATEST(i.quantity - i."qtyReceived", 0)) AS qty
        FROM "purchase_order_items" i JOIN "purchase_orders" po ON po.id = i."purchaseOrderId"
       WHERE po.status::text IN (${Prisma.join([...ON_ORDER_PO_STATUSES])})
       GROUP BY i."productId"
    )
    SELECT p.id FROM "products" p
      LEFT JOIN r ON r."productId" = p.id
      LEFT JOIN o ON o."productId" = p.id
     WHERE p."deletedAt" IS NULL AND p."isActive" ${branchSql}
       AND p."stockQty" - COALESCE(r.qty, 0) + COALESCE(o.qty, 0)
           <= GREATEST(p."minStockQty", COALESCE(p."reorderPoint", 0))`;
  const ids = due.map((d) => d.id);
  const settings = await getAdjustSettings();
  if (!ids.length) {
    return { branchId, generatedAt: new Date().toISOString(), groups: [], totals: { products: 0, groups: 0 } };
  }

  const [products, reserved, onOrder, lastPoLines] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: ids } },
      include: {
        branch: { select: { name: true } },
        supplierProducts: { select: LINK_SELECT },
        // M1 — ບໍ່ມີລາຍການລາຄາ → ປັດຕາມໜ່ວຍຊື້ເລີ່ມຕົ້ນຂອງສິນຄ້າ (ຖ້າມີ).
        uomConversions: { where: { isPurchaseDefault: true }, select: { uomId: true, factorToBase: true, uom: { select: { code: true } } } },
      },
      orderBy: { name: 'asc' },
    }),
    reservedByProduct(ids),
    onOrderByProduct(ids),
    // ບໍ່ມີລາຍການລາຄາ → ໃຊ້ຜູ້ສະໜອງຂອງ PO ຫຼ້າສຸດທີ່ມີສິນຄ້ານີ້ (ຖ້າຍັງໃຊ້ໄດ້).
    prisma.purchaseOrderItem.findMany({
      where: { productId: { in: ids }, purchaseOrder: { status: { not: 'CANCELLED' } } },
      orderBy: { purchaseOrder: { orderDate: 'desc' } },
      select: {
        productId: true,
        purchaseOrder: {
          select: { supplier: { select: { id: true, name: true, isActive: true, deletedAt: true } } },
        },
      },
    }),
  ]);
  const lastSupplier = new Map<string, { id: string; name: string }>();
  for (const l of lastPoLines) {
    const s = l.purchaseOrder.supplier;
    if (lastSupplier.has(l.productId) || !s.isActive || s.deletedAt) continue;
    lastSupplier.set(l.productId, { id: s.id, name: s.name });
  }

  const groups = new Map<string, ReorderSuggestionGroup>();
  for (const p of products) {
    const onHand = qnum(p.stockQty);
    const res = reserved.get(p.id) ?? 0;
    const available = qnum(onHand - res);
    const ordered = onOrder.get(p.id) ?? 0;
    const threshold = reorderThresholdOf(p);
    const avg = p.avgDailyUsage != null ? costNum(p.avgDailyUsage) : 0;
    const links = usableLinks(p.supplierProducts, p.branchId);
    const link = links[0];
    // (PO ເປັນສາຂາດຽວກັບສິນຄ້າສະເໝີ ແລະ ຜູ້ສະໜອງຂອງ PO ຕ້ອງເປັນຂອງສາຂານັ້ນ/ໃຊ້ຮ່ວມ → ໃຊ້ໄດ້ກັບສາຂານີ້.)
    const supplier = link ? { id: link.supplier.id, name: link.supplier.name } : (lastSupplier.get(p.id) ?? null);
    const leadTimeDays = link?.leadTimeDays ?? link?.supplier.leadTimeDays ?? settings.defaultLeadTimeDays;
    const moq = link?.moq != null ? qnum(link.moq) : null;
    const target = threshold + avg * settings.reorderReviewDays;
    // M1 — ຈຳນວນຂາດເປັນໜ່ວຍພື້ນຖານ → ປັດຂຶ້ນໃນໜ່ວຍຊື້ (ລາຍການລາຄາ → ໜ່ວຍຊື້ເລີ່ມຕົ້ນ → ໜ່ວຍພື້ນຖານ); MOQ ເປັນໜ່ວຍຊື້.
    const def = p.uomConversions[0];
    const uom = link
      ? { uomId: link.uomId ?? null, code: link.uom?.code ?? null, factor: factorNum(link.factorToBase) }
      : def
        ? { uomId: def.uomId, code: def.uom.code, factor: factorNum(def.factorToBase) }
        : { uomId: null, code: null, factor: 1 };
    const suggestedUomQty = roundOrderQty((target - (available + ordered)) / uom.factor, moq);
    const suggestedQty = qnum(suggestedUomQty * uom.factor);
    const currency = link ? link.currency : 'LAK';
    const uomUnitCost = link ? costNum(link.unitCost) : costNum(p.costPrice) * uom.factor;
    const unitCost = uomUnitCost / uom.factor;
    const item: ReorderSuggestionItem = {
      productId: p.id,
      productName: p.name,
      sku: p.sku,
      unit: p.unit,
      branchId: p.branchId,
      onHand,
      reserved: res,
      available,
      onOrder: ordered,
      minStockQty: qnum(p.minStockQty),
      reorderPoint: p.reorderPoint != null ? qnum(p.reorderPoint) : null,
      threshold,
      avgDailyUsage: avg,
      leadTimeDays,
      moq,
      suggestedQty,
      uomId: uom.uomId,
      uomCode: uom.code,
      factorToBase: uom.factor,
      suggestedUomQty,
      unitCost: costNum(unitCost),
      uomUnitCost: money(uomUnitCost),
      lineTotal: money(suggestedUomQty * uomUnitCost),
    };
    const key = `${supplier?.id ?? '-'}|${p.branchId}|${currency}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        supplierId: supplier?.id ?? null,
        supplierName: supplier?.name ?? null,
        branchId: p.branchId,
        branchName: p.branch.name,
        currency,
        items: [],
        total: 0,
      };
      groups.set(key, g);
    }
    g.items.push(item);
    g.total = money(g.total + item.lineTotal);
  }
  const list = [...groups.values()].sort(
    (a, b) => Number(a.supplierId == null) - Number(b.supplierId == null) || (a.supplierName ?? '').localeCompare(b.supplierName ?? ''),
  );
  return {
    branchId,
    generatedAt: new Date().toISOString(),
    groups: list,
    totals: { products: products.length, groups: list.length },
  };
}
