import {
  INVENTORY_EXPORT_MAX_ROWS,
  type InventoryExportView,
  type Paginated,
  type StockAdjustReasonValue,
  type StockShrinkageQuery,
  type StockShrinkageView,
  type StockValuationQuery,
  type StockValuationRow,
  type StockValuationView,
  STOCK_AGING_BUCKETS,
  type InventoryTurnoverQuery,
  type InventoryTurnoverRow,
  type InventoryTurnoverView,
  type ServiceUsageQuery,
  type ServiceUsageRow,
  type ServiceUsageView,
  type StockAgingBucket,
  type StockAgingQuery,
  type StockAgingRow,
  type StockAgingView,
  type AbcClass,
  type AbcQuery,
  type AbcRow,
  type AbcView,
  type InventoryCategoryGroup,
} from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { vientianeDateKey, vientianeDayStart } from '../../utils/dateHelpers.js';
import { categoryLabel } from './inventory-master.service.js';
import {
  MOVEMENT_SIGN,
  getAdjustSettings,
  SHRINKAGE_MOVEMENT_WHERE,
  costNum,
  fromDateOnly,
  money,
  movementCost,
  qnum,
  vientianeDayRange,
} from './inventory.service.js';

/**
 * M15 — export ທຸກແຖວທີ່ຜ່ານຕົວກັ່ນຕອງ (ບໍ່ແມ່ນແຕ່ໜ້າປັດຈຸບັນ) ໂດຍເອີ້ນ list function ເດີມດ້ວຍ page 1 +
 * pageSize = ເພດານ (ຂ້າມ max 5000 ຂອງ paginationQuerySchema ເພາະເອີ້ນ service ໂດຍກົງ). ເກີນເພດານ → truncated.
 */
export async function exportList<T, Q extends { page: number; pageSize: number }>(
  list: (q: Q) => Promise<Paginated<T>>,
  q: Q,
  maxRows: number = INVENTORY_EXPORT_MAX_ROWS,
): Promise<InventoryExportView<T>> {
  const r = await list({ ...q, page: 1, pageSize: maxRows });
  return { items: r.items, total: r.total, truncated: r.total > r.items.length, maxRows };
}

/** M3 — select ໝວດ (ພ້ອມໝວດແມ່) ສຳລັບແຖວລາຍງານ. */
const CATEGORY_SELECT = { categoryId: true, category: { select: { name: true, parent: { select: { name: true } } } } } as const;
type WithCategory = { categoryId: string | null; category: { name: string; parent: { name: string } | null } | null };
const catOf = (p: WithCategory) => ({ categoryId: p.categoryId, categoryName: categoryLabel(p.category) });

/** M3 — ລວມແຖວຕາມໝວດ (ບໍ່ມີໝວດ = categoryId null ຢູ່ທ້າຍ). */
function groupByCategory<R extends { categoryId: string | null; categoryName: string | null }, G>(
  rows: R[],
  init: () => G,
  add: (g: G, r: R) => void,
): (G & { categoryId: string | null; categoryName: string | null })[] {
  const by = new Map<string, G & { categoryId: string | null; categoryName: string | null }>();
  for (const r of rows) {
    const key = r.categoryId ?? '';
    let g = by.get(key);
    if (!g) by.set(key, (g = { ...init(), categoryId: r.categoryId, categoryName: r.categoryName }));
    add(g, r);
  }
  return [...by.values()].sort(
    (a, b) => Number(a.categoryId == null) - Number(b.categoryId == null) || (a.categoryName ?? '').localeCompare(b.categoryName ?? ''),
  );
}

function resolveBranch(q: { branchId?: string }, authBranchId?: string | null): string | null {
  if (authBranchId && q.branchId && q.branchId !== authBranchId) throw ApiError.forbidden('ບໍ່ມີສິດເບິ່ງສາຂາອື່ນ');
  return authBranchId ?? q.branchId ?? null;
}

/**
 * ມູນຄ່າສະຕັອກ ນະທ້າຍວັນ `asOf` (ວັນວຽງຈັນ) ຄິດຈາກ ledger ລ້ວນໆ (ບໍ່ແມ່ນ stockQty/costPrice ປັດຈຸບັນ):
 *   qty   = Σ (sign × qty) ຂອງທຸກແຖວກ່ອນທ້າຍວັນ
 *   value = Σ valueChange ຂອງແຖວທີ່ມີຄ່າ (C4 valued ledger) + ແຖວເກົ່າ (valueChange null, ກ່ອນ C4 ຫຼື ຍອດເປີດ)
 *           ຕີມູນຄ່າດ້ວຍ fallbackCost = unitCost ທຳອິດທີ່ຮູ້ຂອງສິນຄ້ານັ້ນໃນ ledger, ຖ້າບໍ່ມີເລີຍ = WAC ປັດຈຸບັນ
 *           → ໝາຍ `fallbackUsed` ໃຫ້ຜູ້ອ່ານຮູ້ວ່າເປັນຄ່າປະມານ.
 */
export async function getStockValuation(
  q: StockValuationQuery,
  authBranchId?: string | null,
): Promise<StockValuationView> {
  const branchId = resolveBranch(q, authBranchId);
  const asOf = q.asOf ?? fromDateOnly(vientianeDateKey(new Date()))!;
  const lt = new Date(vientianeDayStart(new Date(`${asOf}T00:00:00.000Z`)).getTime() + 86_400_000);
  const where: Prisma.StockMovementWhereInput = { createdAt: { lt }, ...(branchId ? { branchId } : {}) };

  const [all, legacy] = await Promise.all([
    prisma.stockMovement.groupBy({ by: ['productId', 'type'], where, _sum: { qty: true, valueChange: true } }),
    prisma.stockMovement.groupBy({
      by: ['productId', 'type'],
      where: { ...where, valueChange: null },
      _sum: { qty: true },
      _count: { _all: true },
    }),
  ]);

  const acc = new Map<string, { qty: number; value: number; legacyQty: number; legacyRows: number }>();
  const get = (id: string) => {
    let a = acc.get(id);
    if (!a) acc.set(id, (a = { qty: 0, value: 0, legacyQty: 0, legacyRows: 0 }));
    return a;
  };
  for (const g of all) {
    const a = get(g.productId);
    a.qty += (MOVEMENT_SIGN[g.type] ?? 1) * qnum(g._sum.qty);
    a.value += g._sum.valueChange ? g._sum.valueChange.toNumber() : 0;
  }
  for (const g of legacy) {
    const a = get(g.productId);
    a.legacyQty += (MOVEMENT_SIGN[g.type] ?? 1) * qnum(g._sum.qty);
    a.legacyRows += g._count._all;
  }
  const ids = [...acc.keys()];
  if (!ids.length) return { asOf, branchId, rows: [], totals: { products: 0, value: 0, fallbackProducts: 0 } };

  const legacyIds = ids.filter((id) => acc.get(id)!.legacyRows > 0);
  const firstCosts = legacyIds.length
    ? await prisma.$queryRaw<{ productId: string; unitCost: Prisma.Decimal }[]>`
        SELECT DISTINCT ON ("productId") "productId", "unitCost" FROM "stock_movements"
        WHERE "productId" IN (${Prisma.join(legacyIds)}) AND "unitCost" IS NOT NULL
        ORDER BY "productId", "createdAt" ASC`
    : [];
  const firstCost = new Map(firstCosts.map((r) => [r.productId, costNum(r.unitCost)]));
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, name: true, sku: true, unit: true, costPrice: true, branchId: true, branch: { select: { name: true } },
      ...CATEGORY_SELECT,
    },
  });

  const rows: StockValuationRow[] = [];
  for (const p of products) {
    const a = acc.get(p.id)!;
    const fallbackUsed = a.legacyRows > 0;
    const fallbackCost = fallbackUsed ? (firstCost.get(p.id) ?? costNum(p.costPrice)) : null;
    const qty = qnum(a.qty);
    const value = money(a.value + (fallbackCost != null ? a.legacyQty * fallbackCost : 0));
    if (Math.abs(qty) < 0.0005 && Math.abs(value) < 0.005) continue;
    rows.push({
      productId: p.id,
      productName: p.name,
      sku: p.sku.split(':deleted:')[0]!,
      unit: p.unit,
      branchId: p.branchId,
      branchName: p.branch.name,
      ...catOf(p),
      qty,
      value,
      avgCost: qty !== 0 ? money(value / qty) : 0,
      fallbackUsed,
      fallbackRows: a.legacyRows,
      fallbackCost: fallbackCost != null ? money(fallbackCost) : null,
    });
  }
  rows.sort((x, y) => y.value - x.value || x.productName.localeCompare(y.productName));
  const groups: InventoryCategoryGroup[] | undefined =
    q.groupBy === 'category'
      ? groupByCategory(rows, () => ({ products: 0, qty: 0, value: 0 }), (g, r) => {
          g.products += 1;
          g.qty = qnum(g.qty + r.qty);
          g.value = money(g.value + r.value);
        })
      : undefined;
  return {
    asOf,
    branchId,
    rows,
    ...(groups ? { groups } : {}),
    totals: {
      products: rows.length,
      value: money(rows.reduce((s, r) => s + r.value, 0)),
      fallbackProducts: rows.filter((r) => r.fallbackUsed).length,
    },
  };
}

/**
 * ລາຍງານການສູນເສຍ (shrinkage) — ADJUSTMENT_DEDUCT ທີ່ reason ຢູ່ໃນ STOCK_SHRINKAGE_REASONS (ຊຸດດຽວກັບແຖວ
 * shrinkage ໃນ P&L ຜ່ານ SHRINKAGE_MOVEMENT_WHERE), ມູນຄ່າ = −valueChange (ແຖວເກົ່າ: qty × WAC ປັດຈຸບັນ ຄື P&L).
 */
export async function getStockShrinkage(
  q: StockShrinkageQuery,
  authBranchId?: string | null,
): Promise<StockShrinkageView> {
  const branchId = resolveBranch(q, authBranchId);
  const { from, to, gte, lt } = vientianeDayRange(q);
  const rows = await prisma.stockMovement.findMany({
    where: { ...SHRINKAGE_MOVEMENT_WHERE, createdAt: { gte, lt }, ...(branchId ? { branchId } : {}) },
    select: {
      productId: true,
      reasonCode: true,
      qty: true,
      valueChange: true,
      product: { select: { name: true, sku: true, unit: true, costPrice: true, branch: { select: { name: true } } } },
    },
  });
  const byReason = new Map<StockAdjustReasonValue, { count: number; qty: number; value: number }>();
  const byProduct = new Map<string, StockShrinkageView['byProduct'][number]>();
  let total = 0;
  for (const m of rows) {
    const v = movementCost(m, costNum(m.product.costPrice));
    const qty = qnum(m.qty);
    total += v;
    const reason = m.reasonCode as StockAdjustReasonValue;
    const r = byReason.get(reason) ?? { count: 0, qty: 0, value: 0 };
    r.count += 1;
    r.qty += qty;
    r.value += v;
    byReason.set(reason, r);
    const p = byProduct.get(m.productId) ?? {
      productId: m.productId,
      productName: m.product.name,
      sku: m.product.sku.split(':deleted:')[0]!,
      unit: m.product.unit,
      branchName: m.product.branch.name,
      count: 0,
      qty: 0,
      value: 0,
    };
    p.count += 1;
    p.qty += qty;
    p.value += v;
    byProduct.set(m.productId, p);
  }
  return {
    from,
    to,
    branchId,
    byReason: [...byReason.entries()]
      .map(([reason, r]) => ({ reason, count: r.count, qty: qnum(r.qty), value: money(r.value) }))
      .sort((a, b) => b.value - a.value || a.reason.localeCompare(b.reason)),
    byProduct: [...byProduct.values()]
      .map((p) => ({ ...p, qty: qnum(p.qty), value: money(p.value) }))
      .sort((a, b) => b.value - a.value || a.productName.localeCompare(b.productName)),
    totals: { count: rows.length, value: money(total) },
  };
}

// ============================================================ 9D reports — turnover / DOH, aging, usage per service

const DAY_MS = 86_400_000;
const dayBefore = (ymd: string) => fromDateOnly(new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() - DAY_MS))!;

/**
 * Turnover = COGS ÷ ມູນຄ່າສະຕັອກສະເລ່ຍ (ມູນຄ່າ ledger ທ້າຍວັນກ່ອນ `from` + ທ້າຍວັນ `to`) ÷ 2 (ຜ່ານ getStockValuation).
 * Days on hand (DIO) = ມູນຄ່າສະເລ່ຍ ÷ (COGS ÷ ຈຳນວນວັນ). COGS = SERVICE_CONSUMED (movementCost ຄືກັບ P&L).
 */
export async function getInventoryTurnover(
  q: InventoryTurnoverQuery,
  authBranchId?: string | null,
): Promise<InventoryTurnoverView> {
  const branchId = resolveBranch(q, authBranchId);
  const { from, to, gte, lt } = vientianeDayRange(q);
  const days = Math.round((lt.getTime() - gte.getTime()) / DAY_MS);
  const [opening, closing, moves] = await Promise.all([
    getStockValuation({ asOf: dayBefore(from), ...(branchId ? { branchId } : {}) }, authBranchId),
    getStockValuation({ asOf: to, ...(branchId ? { branchId } : {}) }, authBranchId),
    prisma.stockMovement.findMany({
      // M13 — COGS ລວມ retail: SOLD − SALE_RETURN (SALE_RETURN valueChange ບວກ → movementCost ລົບ = ຫັກຄືນ).
      where: { type: { in: ['SERVICE_CONSUMED', 'SOLD', 'SALE_RETURN'] }, createdAt: { gte, lt }, ...(branchId ? { branchId } : {}) },
      select: { productId: true, qty: true, valueChange: true, product: { select: { costPrice: true } } },
    }),
  ]);
  const cogsBy = new Map<string, number>();
  for (const m of moves) cogsBy.set(m.productId, (cogsBy.get(m.productId) ?? 0) + movementCost(m, costNum(m.product.costPrice)));
  const openBy = new Map(opening.rows.map((r) => [r.productId, r]));
  const closeBy = new Map(closing.rows.map((r) => [r.productId, r]));
  const ids = [...new Set([...openBy.keys(), ...closeBy.keys(), ...cogsBy.keys()])];
  const products = ids.length
    ? await prisma.product.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, sku: true, unit: true, branch: { select: { name: true } }, ...CATEGORY_SELECT },
      })
    : [];
  const ratio = (cogs: number, avg: number) => ({
    turnover: avg > 0 ? Math.round((cogs / avg) * 100) / 100 : 0,
    daysOnHand: cogs > 0 ? Math.round(((avg * days) / cogs) * 10) / 10 : null,
  });
  const rows: InventoryTurnoverRow[] = products.map((p) => {
    const cogs = money(cogsBy.get(p.id) ?? 0);
    const openingValue = openBy.get(p.id)?.value ?? 0;
    const closingValue = closeBy.get(p.id)?.value ?? 0;
    const avgValue = money((openingValue + closingValue) / 2);
    return {
      productId: p.id,
      productName: p.name,
      sku: p.sku.split(':deleted:')[0]!,
      unit: p.unit,
      branchName: p.branch.name,
      ...catOf(p),
      cogs,
      openingValue,
      closingValue,
      avgValue,
      ...ratio(cogs, avgValue),
    };
  });
  rows.sort((a, b) => b.cogs - a.cogs || a.productName.localeCompare(b.productName));
  const cogs = money(rows.reduce((s, r) => s + r.cogs, 0));
  const avgValue = money((opening.totals.value + closing.totals.value) / 2);
  const groups =
    q.groupBy === 'category'
      ? groupByCategory(rows, () => ({ products: 0, cogs: 0, openingValue: 0, closingValue: 0 }), (g, r) => {
          g.products += 1;
          g.cogs = money(g.cogs + r.cogs);
          g.openingValue = money(g.openingValue + r.openingValue);
          g.closingValue = money(g.closingValue + r.closingValue);
        }).map((g) => {
          const avg = money((g.openingValue + g.closingValue) / 2);
          return { ...g, avgValue: avg, ...ratio(g.cogs, avg) };
        })
      : undefined;
  return {
    from,
    to,
    branchId,
    days,
    rows,
    ...(groups ? { groups } : {}),
    totals: { cogs, openingValue: opening.totals.value, closingValue: closing.totals.value, avgValue, ...ratio(cogs, avgValue) },
  };
}

function agingBucket(days: number): StockAgingBucket {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

/**
 * Stock aging (ປັດຈຸບັນ) — ສິນຄ້າ trackLot: ຕໍ່ lot ຕາມ receivedAt (ມູນຄ່າ = ຕົ້ນທຶນ lot); ສະຕັອກທີ່ບໍ່ມີ lot (ສິນຄ້າທົ່ວໄປ
 * ຫຼື ສ່ວນເກີນ Σ lot): ອາຍຸນັບຈາກ PURCHASE_IN ຫຼ້າສຸດ (ບໍ່ເຄີຍຮັບ → ວັນສ້າງສິນຄ້າ), ມູນຄ່າ = WAC.
 */
export async function getStockAging(q: StockAgingQuery, authBranchId?: string | null, now: Date = new Date()): Promise<StockAgingView> {
  const branchId = resolveBranch(q, authBranchId);
  const today = vientianeDateKey(now);
  const products = await prisma.product.findMany({
    where: { deletedAt: null, stockQty: { gt: 0 }, ...(branchId ? { branchId } : {}) },
    select: {
      id: true, name: true, sku: true, unit: true, stockQty: true, costPrice: true, trackLot: true, createdAt: true,
      branch: { select: { name: true } },
      ...CATEGORY_SELECT,
      lots: { where: { qtyOnHand: { gt: 0 } }, select: { lotNumber: true, qtyOnHand: true, unitCost: true, receivedAt: true } },
    },
  });
  const ids = products.map((p) => p.id);
  const lastIn = ids.length
    ? await prisma.stockMovement.groupBy({ by: ['productId'], where: { productId: { in: ids }, type: 'PURCHASE_IN' }, _max: { createdAt: true } })
    : [];
  const lastInBy = new Map(lastIn.map((g) => [g.productId, g._max.createdAt]));
  const ageOf = (d: Date) => Math.max(0, Math.round((today.getTime() - vientianeDateKey(d).getTime()) / DAY_MS));
  const rows: StockAgingRow[] = [];
  for (const p of products) {
    const base = { productId: p.id, productName: p.name, sku: p.sku, unit: p.unit, branchName: p.branch.name, ...catOf(p) };
    let lotted = 0;
    for (const l of p.lots) {
      const qty = qnum(l.qtyOnHand);
      lotted += qty;
      const ageDays = ageOf(l.receivedAt);
      rows.push({ ...base, lotNumber: l.lotNumber, ageSource: 'LOT', receivedAt: l.receivedAt.toISOString(), ageDays, bucket: agingBucket(ageDays), qty, value: money(qty * costNum(l.unitCost)) });
    }
    const rest = qnum(qnum(p.stockQty) - lotted);
    if (rest > 0.0005) {
      const last = lastInBy.get(p.id) ?? null;
      const at = last ?? p.createdAt;
      const ageDays = ageOf(at);
      rows.push({ ...base, lotNumber: null, ageSource: last ? 'LAST_RECEIPT' : 'CREATED', receivedAt: at.toISOString(), ageDays, bucket: agingBucket(ageDays), qty: rest, value: money(rest * costNum(p.costPrice)) });
    }
  }
  rows.sort((a, b) => b.ageDays - a.ageDays || b.value - a.value);
  const buckets = STOCK_AGING_BUCKETS.map((bucket) => {
    const rs = rows.filter((r) => r.bucket === bucket);
    return { bucket, qty: qnum(rs.reduce((s, r) => s + r.qty, 0)), value: money(rs.reduce((s, r) => s + r.value, 0)), lines: rs.length };
  });
  const groups =
    q.groupBy === 'category'
      ? groupByCategory(
          rows,
          () => ({ qty: 0, value: 0, byBucket: Object.fromEntries(STOCK_AGING_BUCKETS.map((b) => [b, 0])) as Record<StockAgingBucket, number> }),
          (g, r) => {
            g.qty = qnum(g.qty + r.qty);
            g.value = money(g.value + r.value);
            g.byBucket[r.bucket] = money(g.byBucket[r.bucket] + r.value);
          },
        )
      : undefined;
  return {
    asOf: fromDateOnly(today)!,
    branchId,
    rows,
    ...(groups ? { groups } : {}),
    buckets,
    totals: { qty: qnum(rows.reduce((s, r) => s + r.qty, 0)), value: money(rows.reduce((s, r) => s + r.value, 0)), lines: rows.length },
  };
}

/** ການໃຊ້ consumable ຕໍ່ບໍລິການ — SERVICE_CONSUMED (refId `appt:<id>`) ໃນຊ່ວງ, join ນັດ → ບໍລິການ; ມູນຄ່າ = movementCost. */
export async function getServiceUsage(q: ServiceUsageQuery, authBranchId?: string | null): Promise<ServiceUsageView> {
  const branchId = resolveBranch(q, authBranchId);
  const { from, to, gte, lt } = vientianeDayRange(q);
  const moves = await prisma.stockMovement.findMany({
    where: { type: 'SERVICE_CONSUMED', createdAt: { gte, lt }, refId: { startsWith: 'appt:' }, ...(branchId ? { branchId } : {}) },
    select: { productId: true, refId: true, qty: true, valueChange: true, product: { select: { name: true, unit: true, costPrice: true } } },
  });
  const apptIds = [...new Set(moves.map((m) => m.refId!.slice('appt:'.length)))];
  const appts = apptIds.length
    ? await prisma.appointment.findMany({ where: { id: { in: apptIds } }, select: { id: true, serviceId: true, service: { select: { name: true } } } })
    : [];
  const apptBy = new Map(appts.map((a) => [a.id, a]));
  const rowsBy = new Map<string, ServiceUsageRow & { appts: Set<string> }>();
  const svcBy = new Map<string, { serviceName: string; appts: Set<string>; value: number }>();
  for (const m of moves) {
    const aid = m.refId!.slice('appt:'.length);
    const a = apptBy.get(aid);
    if (!a) continue;
    const v = movementCost(m, costNum(m.product.costPrice));
    const key = `${a.serviceId}|${m.productId}`;
    let r = rowsBy.get(key);
    if (!r) {
      r = { serviceId: a.serviceId, serviceName: a.service.name, productId: m.productId, productName: m.product.name, unit: m.product.unit, appointments: 0, qty: 0, value: 0, qtyPerAppointment: 0, appts: new Set() };
      rowsBy.set(key, r);
    }
    r.qty += qnum(m.qty);
    r.value += v;
    r.appts.add(aid);
    const s = svcBy.get(a.serviceId) ?? { serviceName: a.service.name, appts: new Set<string>(), value: 0 };
    s.appts.add(aid);
    s.value += v;
    svcBy.set(a.serviceId, s);
  }
  const rows: ServiceUsageRow[] = [...rowsBy.values()]
    .map(({ appts: set, ...r }) => ({
      ...r,
      appointments: set.size,
      qty: qnum(r.qty),
      value: money(r.value),
      qtyPerAppointment: set.size ? Math.round((r.qty / set.size) * 1000) / 1000 : 0,
    }))
    .sort((a, b) => a.serviceName.localeCompare(b.serviceName) || b.value - a.value);
  const byService = [...svcBy.entries()]
    .map(([serviceId, s]) => ({
      serviceId,
      serviceName: s.serviceName,
      appointments: s.appts.size,
      value: money(s.value),
      valuePerAppointment: s.appts.size ? money(s.value / s.appts.size) : 0,
    }))
    .sort((a, b) => b.value - a.value);
  return {
    from,
    to,
    branchId,
    rows,
    byService,
    totals: { appointments: new Set(moves.map((m) => m.refId)).size, value: money(byService.reduce((s, x) => s + x.value, 0)) },
  };
}

// ============================================================ 9C — M3 ABC analysis

/**
 * ຈັດ A/B/C ຕາມສ່ວນແບ່ງສະສົມ (Pareto): ລຽງມູນຄ່າຈາກຫຼາຍຫານ້ອຍ; ແຖວທີ່ສ່ວນແບ່ງສະສົມ *ກ່ອນ* ແຖວນີ້ < A% = A
 * (ແຖວທີ່ຂ້າມເສັ້ນ A ນັບເປັນ A — ສິນຄ້າດຽວທີ່ມີ 90% ຂອງມູນຄ່າຕ້ອງເປັນ A), < B% = B, ນອກນັ້ນ = C.
 * ມູນຄ່າ ≤ 0 (ບໍ່ມີການໃຊ້/ບໍ່ມີສະຕັອກ) = C ສະເໝີ. ຜົນ: ກຸ່ມ A ≈ ≤ A% ຂອງມູນຄ່າ, A+B ≈ ≤ B%.
 */
export function classifyAbc<T extends { value: number; name?: string }>(
  items: T[],
  aPct: number,
  bPct: number,
): (T & { sharePct: number; cumulativePct: number; abcClass: AbcClass })[] {
  const sorted = [...items].sort((x, y) => y.value - x.value || (x.name ?? '').localeCompare(y.name ?? ''));
  const total = sorted.reduce((s, r) => s + Math.max(r.value, 0), 0);
  let cum = 0;
  const EPS = 1e-9;
  return sorted.map((r) => {
    const v = Math.max(r.value, 0);
    const before = total > 0 ? (cum / total) * 100 : 100;
    cum += v;
    const cumulativePct = total > 0 ? (cum / total) * 100 : 0;
    const abcClass: AbcClass = v <= 0 ? 'C' : before < aPct - EPS ? 'A' : before < bPct - EPS ? 'B' : 'C';
    return {
      ...r,
      sharePct: total > 0 ? Math.round((v / total) * 10_000) / 100 : 0,
      cumulativePct: Math.round(cumulativePct * 100) / 100,
      abcClass,
    };
  });
}

type AbcProduct = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  branchId: string;
  stockQty: Prisma.Decimal;
  costPrice: Prisma.Decimal;
  branch: { name: string };
} & WithCategory;

/** ມູນຄ່າ basis ຕໍ່ສິນຄ້າ: consumptionValue = COGS ຂອງ SERVICE_CONSUMED ໃນຊ່ວງ (movementCost ຄືກັບ P&L); stockValue = ປັດຈຸບັນ. */
async function abcValues(
  branchId: string | null,
  basis: AbcQuery['basis'],
  range: { gte: Date; lt: Date } | null,
): Promise<{ products: AbcProduct[]; valueBy: Map<string, number> }> {
  const products = await prisma.product.findMany({
    where: { deletedAt: null, ...(branchId ? { branchId } : {}) },
    select: {
      id: true, name: true, sku: true, unit: true, branchId: true, stockQty: true, costPrice: true,
      branch: { select: { name: true } },
      ...CATEGORY_SELECT,
    },
  });
  const valueBy = new Map<string, number>();
  if (basis === 'stockValue') {
    for (const p of products) valueBy.set(p.id, money(Math.max(qnum(p.stockQty), 0) * costNum(p.costPrice)));
  } else if (range) {
    const costBy = new Map(products.map((p) => [p.id, costNum(p.costPrice)]));
    const moves = await prisma.stockMovement.findMany({
      where: { type: { in: ['SERVICE_CONSUMED', 'SOLD', 'SALE_RETURN'] }, createdAt: { gte: range.gte, lt: range.lt }, ...(branchId ? { branchId } : {}) },
      select: { productId: true, qty: true, valueChange: true },
    });
    for (const m of moves) {
      if (!costBy.has(m.productId)) continue;
      valueBy.set(m.productId, (valueBy.get(m.productId) ?? 0) + movementCost(m, costBy.get(m.productId)!));
    }
  }
  return { products, valueBy };
}

/** GET /stock-movements/abc — ABC ຕໍ່ສິນຄ້າ (ຕໍ່ສາຂາ ຫຼື ລວມທຸກສາຂາ) + ສະຫຼຸບຕໍ່ class. ເກນຈາກ AppSetting abcA/abcB. */
export async function getAbcAnalysis(q: AbcQuery, authBranchId?: string | null): Promise<AbcView> {
  const branchId = resolveBranch(q, authBranchId);
  const settings = await getAdjustSettings();
  const range = q.basis === 'consumptionValue' ? vientianeDayRange(q) : null;
  const { products, valueBy } = await abcValues(branchId, q.basis, range);
  const classified = classifyAbc(
    products.map((p) => ({ p, name: p.name, value: money(valueBy.get(p.id) ?? 0) })),
    settings.abcA,
    settings.abcB,
  );
  const rows: AbcRow[] = classified.map((r) => ({
    productId: r.p.id,
    productName: r.p.name,
    sku: r.p.sku,
    unit: r.p.unit,
    branchName: r.p.branch.name,
    categoryName: categoryLabel(r.p.category),
    value: r.value,
    sharePct: r.sharePct,
    cumulativePct: r.cumulativePct,
    abcClass: r.abcClass,
  }));
  const total = money(rows.reduce((s, r) => s + r.value, 0));
  const classes = (['A', 'B', 'C'] as const).map((abcClass) => {
    const rs = rows.filter((r) => r.abcClass === abcClass);
    const value = money(rs.reduce((s, r) => s + r.value, 0));
    return { abcClass, products: rs.length, value, sharePct: total > 0 ? Math.round((value / total) * 10_000) / 100 : 0 };
  });
  return {
    basis: q.basis,
    from: range?.from ?? null,
    to: range?.to ?? null,
    branchId,
    thresholds: { a: settings.abcA, b: settings.abcB },
    rows,
    classes,
    totals: { products: rows.length, value: total },
  };
}

/**
 * Job ກາງຄືນ (reorder-point) — ເກັບ Product.abcClass ຕໍ່ສາຂາ ຕາມມູນຄ່າການໃຊ້ (SERVICE_CONSUMED) 90 ວັນຫຼ້າສຸດ.
 * ບໍ່ແຕະ stockQty/ledger.
 */
export async function computeAbcClasses(now: Date = new Date(), windowDays = 90): Promise<{ products: number }> {
  const settings = await getAdjustSettings();
  const branches = await prisma.branch.findMany({ select: { id: true } });
  const range = { gte: new Date(now.getTime() - windowDays * DAY_MS), lt: now };
  let n = 0;
  for (const b of branches) {
    const { products, valueBy } = await abcValues(b.id, 'consumptionValue', range);
    if (!products.length) continue;
    const classified = classifyAbc(
      products.map((p) => ({ id: p.id, name: p.name, value: valueBy.get(p.id) ?? 0 })),
      settings.abcA,
      settings.abcB,
    );
    for (const cls of ['A', 'B', 'C'] as const) {
      const ids = classified.filter((r) => r.abcClass === cls).map((r) => r.id);
      if (ids.length) await prisma.product.updateMany({ where: { id: { in: ids } }, data: { abcClass: cls, abcComputedAt: now } });
    }
    n += products.length;
  }
  return { products: n };
}
