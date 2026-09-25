import {
  INVENTORY_EXPORT_MAX_ROWS,
  type AccessTokenPayload,
  type InventoryExportView,
  type Paginated,
  type StockCountCancelInput,
  type StockCountCreateInput,
  type StockCountLineView,
  type StockCountLinesUpdateInput,
  type StockCountListQuery,
  type StockCountRejectInput,
  type StockCountView,
} from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { notifyUser } from '../../services/push.js';
import { ApiError } from '../../utils/ApiError.js';
import { nextDocumentNo } from '../../utils/documentNumbers.js';
import {
  MOVEMENT_SIGN,
  assertBranchScope,
  costDec,
  costNum,
  fromDateOnly,
  getAdjustSettings,
  money,
  qdec,
  qnum,
} from './inventory.service.js';

/**
 * H3 (audit ຄື້ນ 9B) — ນັບສະຕັອກຈິງ (stock-take / cycle count).
 *
 * ວົງຈອນ: DRAFT (ເລືອກສິນຄ້າ) → COUNTING (snapshot systemQty ຕອນ start) → PENDING_APPROVAL (ທຸກແຖວມີ countedQty)
 * → POSTED (ສ່ວນຕ່າງ post ເປັນ ADJUSTMENT_ADD/DEDUCT reason COUNT_VARIANCE, refId `count:<id>` ໃນ tx ດຽວ).
 * ປະຕິເສດ → ກັບໄປ COUNTING. ຍົກເລີກໄດ້ທຸກຂັ້ນກ່ອນ POSTED.
 *
 * ການເໜັງຕີງລະຫວ່າງນັບ — ໃຊ້ "snapshot + delta" ແທນການ lock ສິນຄ້າ (ຮ້ານຍັງເຮັດບໍລິການ/ຮັບເຄື່ອງໄດ້ລະຫວ່າງນັບ):
 *   variance = countedQty − (systemQty + Σ ການເໜັງຕີງສຸດທິຂອງສິນຄ້າ/lot ນັ້ນ ນັບແຕ່ startedAt)
 * ເຊັ່ນ snapshot 10, ນັບໄດ້ 7, ລະຫວ່າງນັບມີ BOM ຕັດ 2 → ຄາດວ່າຈະມີ 8 → ສ່ວນຕ່າງ −1 (ບໍ່ແມ່ນ −3).
 * ແຖວ lot ນັບສະເພາະ movement ຂອງ lot ນັ້ນ; ແຖວ "ບໍ່ມີ lot" ນັບ movement ທີ່ lotId = null ຂອງສິນຄ້ານັ້ນ.
 * ຂໍ້ຈຳກັດ: ການມອບສະຕັອກເກົ່າເຂົ້າ lot (assign-unlotted) ບໍ່ຂຽນ movement → ຖ້າເຮັດລະຫວ່າງນັບ delta ຈະບໍ່ເຫັນ —
 * ຢ່າມອບ lot ລະຫວ່າງມີໃບນັບເປີດຢູ່. lot ໃໝ່ທີ່ເກີດລະຫວ່າງນັບ (ຮັບ PO) ບໍ່ຢູ່ໃນໃບນັບ ຈຶ່ງບໍ່ຖືກປັບ.
 * ຄວາມຖືກຕ້ອງຂອງ snapshot: start/post lock ແຖວ products ທັງໝົດໃນໃບກ່ອນ ແລ້ວຈຶ່ງອ່ານ/ຕັ້ງ startedAt → movement
 * ທີ່ commit ແລ້ວຢູ່ໃນ snapshot, movement ທີ່ມາຫຼັງຕ້ອງລໍ lock ຈຶ່ງມີ createdAt ≥ startedAt (ບໍ່ນັບຊ້ຳ/ບໍ່ຕົກ).
 */

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;
type Auth = Pick<AccessTokenPayload, 'sub' | 'role' | 'branchId'>;

const EPS = 0.0005;

const COUNT_INCLUDE = {
  branch: { select: { name: true } },
  createdBy: { select: { name: true } },
  countedBy: { select: { name: true } },
  approvedBy: { select: { name: true } },
  _count: { select: { lines: true } },
} satisfies Prisma.StockCountInclude;
type CountRow = Prisma.StockCountGetPayload<{ include: typeof COUNT_INCLUDE }>;

const LINE_INCLUDE = {
  product: { select: { name: true, sku: true, unit: true, costPrice: true } },
  lot: { select: { lotNumber: true, expiryDate: true, unitCost: true } },
} satisfies Prisma.StockCountLineInclude;
type LineRow = Prisma.StockCountLineGetPayload<{ include: typeof LINE_INCLUDE }>;

const lineKey = (productId: string, lotId: string | null) => `${productId}|${lotId ?? ''}`;

async function lockProducts(tx: Tx, productIds: string[]): Promise<void> {
  const ids = [...new Set(productIds)].sort();
  if (!ids.length) return;
  // ລຽງ id ກ່ອນ lock → ທຸກ tx lock ຕາມລຳດັບດຽວກັນ ກັນ deadlock.
  await tx.$queryRaw`SELECT id FROM "products" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
}

async function lockCountRow(tx: Tx, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "stock_counts" WHERE id = ${id} FOR UPDATE`;
}

/**
 * Σ ການເໜັງຕີງສຸດທິ (signed) ຕໍ່ (productId, lotId) ນັບແຕ່ startedAt (ແລະ ກ່ອນ `until` ຖ້າມີ), ບໍ່ລວມແຖວທີ່ໃບນັບນີ້
 * post ເອງ. ຄືນ map + ຈຳນວນແຖວ ledger ທີ່ເກີດລະຫວ່າງນັບ (ໃຫ້ UI ເຕືອນ).
 */
async function movementDeltas(
  db: Db,
  countId: string,
  productIds: string[],
  startedAt: Date,
  until?: Date | null,
): Promise<{ deltas: Map<string, number>; movementCount: number }> {
  const deltas = new Map<string, number>();
  if (!productIds.length) return { deltas, movementCount: 0 };
  const grouped = await db.stockMovement.groupBy({
    by: ['productId', 'lotId', 'type'],
    where: {
      productId: { in: [...new Set(productIds)] },
      createdAt: { gte: startedAt, ...(until ? { lt: until } : {}) },
      OR: [{ refId: null }, { refId: { not: `count:${countId}` } }],
    },
    _sum: { qty: true },
    _count: { _all: true },
  });
  let movementCount = 0;
  for (const g of grouped) {
    const k = lineKey(g.productId, g.lotId);
    deltas.set(k, qnum((deltas.get(k) ?? 0) + (MOVEMENT_SIGN[g.type] ?? 1) * qnum(g._sum.qty)));
    movementCount += g._count._all;
  }
  return { deltas, movementCount };
}

function lineUnitCost(l: LineRow): number {
  return l.lot ? costNum(l.lot.unitCost) : costNum(l.product.costPrice);
}

type LiveLine = { expectedQty: number | null; variance: number | null; unitCost: number; varianceValue: number | null; moved: number };

/** ຄິດ variance ແບບ live (snapshot + delta). POSTED ໃຊ້ຄ່າທີ່ post ໄວ້ແລ້ວ. */
function liveLine(l: LineRow, deltas: Map<string, number>, posted: boolean): LiveLine {
  if (posted) {
    const variance = l.variance != null ? qnum(l.variance) : null;
    const counted = l.countedQty != null ? qnum(l.countedQty) : null;
    return {
      expectedQty: counted != null && variance != null ? qnum(counted - variance) : null,
      variance,
      unitCost: l.unitCost != null ? costNum(l.unitCost) : lineUnitCost(l),
      varianceValue: l.varianceValue != null ? money(l.varianceValue) : null,
      moved: counted != null && variance != null && l.systemQty != null ? qnum(counted - variance - qnum(l.systemQty)) : 0,
    };
  }
  const moved = deltas.get(lineKey(l.productId, l.lotId)) ?? 0;
  const expectedQty = l.systemQty != null ? qnum(qnum(l.systemQty) + moved) : null;
  const unitCost = lineUnitCost(l);
  const variance = l.countedQty != null && expectedQty != null ? qnum(qnum(l.countedQty) - expectedQty) : null;
  return { expectedQty, variance, unitCost, varianceValue: variance != null ? money(variance * unitCost) : null, moved };
}

function toLineView(l: LineRow, live: LiveLine): StockCountLineView {
  return {
    id: l.id,
    productId: l.productId,
    productName: l.product.name,
    sku: l.product.sku,
    unit: l.product.unit,
    lotId: l.lotId,
    lotNumber: l.lot?.lotNumber ?? null,
    expiryDate: fromDateOnly(l.lot?.expiryDate),
    systemQty: l.systemQty != null ? qnum(l.systemQty) : null,
    movedSinceStart: live.moved,
    expectedQty: live.expectedQty,
    countedQty: l.countedQty != null ? qnum(l.countedQty) : null,
    variance: live.variance,
    unitCost: money(live.unitCost),
    varianceValue: live.varianceValue,
    reasonCode: l.reasonCode,
    notes: l.notes,
    countedAt: l.countedAt ? l.countedAt.toISOString() : null,
  };
}

function toCountView(
  c: CountRow,
  agg: { counted: number; net: number; abs: number },
  extra: { movementsDuringCount?: number; lines?: StockCountLineView[] } = {},
): StockCountView {
  return {
    id: c.id,
    countNumber: c.countNumber,
    branchId: c.branchId,
    branchName: c.branch.name,
    status: c.status,
    type: c.type,
    scheduledAt: c.scheduledAt?.toISOString() ?? null,
    startedAt: c.startedAt?.toISOString() ?? null,
    submittedAt: c.submittedAt?.toISOString() ?? null,
    postedAt: c.postedAt?.toISOString() ?? null,
    cancelledAt: c.cancelledAt?.toISOString() ?? null,
    createdByUserName: c.createdBy?.name ?? null,
    countedByUserName: c.countedBy?.name ?? null,
    approvedByUserName: c.approvedBy?.name ?? null,
    rejectReason: c.rejectReason,
    cancelReason: c.cancelReason,
    notes: c.notes,
    lineCount: c._count.lines,
    countedLineCount: agg.counted,
    netVarianceValue: money(agg.net),
    absVarianceValue: money(agg.abs),
    movementsDuringCount: extra.movementsDuringCount ?? 0,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    ...(extra.lines ? { lines: extra.lines } : {}),
  };
}

async function loadLines(db: Db, countId: string): Promise<LineRow[]> {
  return db.stockCountLine.findMany({
    where: { countId },
    include: LINE_INCLUDE,
    orderBy: [{ product: { name: 'asc' } }, { lot: { expiryDate: { sort: 'asc', nulls: 'last' } } }, { createdAt: 'asc' }],
  });
}

/** ຄິດ live ທຸກແຖວຂອງໃບນັບ (ໃຊ້ທັງ detail, submit, approve). */
async function evaluate(db: Db, c: { id: string; status: string; startedAt: Date | null; postedAt: Date | null }) {
  const lines = await loadLines(db, c.id);
  const posted = c.status === 'POSTED';
  const { deltas, movementCount } = c.startedAt
    ? await movementDeltas(db, c.id, lines.map((l) => l.productId), c.startedAt, posted ? c.postedAt : null)
    : { deltas: new Map<string, number>(), movementCount: 0 };
  const live = lines.map((l) => ({ line: l, live: liveLine(l, deltas, posted) }));
  let counted = 0;
  let net = 0;
  let abs = 0;
  for (const { line, live: v } of live) {
    if (line.countedQty != null) counted += 1;
    if (v.varianceValue != null) {
      net += v.varianceValue;
      abs += Math.abs(v.varianceValue);
    }
  }
  return { lines: live, movementCount, agg: { counted, net, abs } };
}

/** ບັນທຶກ variance/unitCost/varianceValue ທີ່ຄິດແລ້ວລົງແຖວ (ສະເພາະແຖວທີ່ປ່ຽນ) — ໃຫ້ list/ລາຍງານອ່ານໄດ້ໄວ. */
async function persistVariances(tx: Tx, rows: { line: LineRow; live: LiveLine }[]): Promise<void> {
  for (const { line, live } of rows) {
    const v = live.variance;
    const vv = live.varianceValue;
    const same =
      (line.variance == null ? v == null : v != null && Math.abs(qnum(line.variance) - v) < EPS) &&
      (line.varianceValue == null ? vv == null : vv != null && Math.abs(money(line.varianceValue) - vv) < 0.005) &&
      line.unitCost != null &&
      Math.abs(costNum(line.unitCost) - live.unitCost) < 0.00005;
    if (same) continue;
    await tx.stockCountLine.update({
      where: { id: line.id },
      data: {
        variance: v != null ? qdec(v) : null,
        unitCost: costDec(live.unitCost),
        varianceValue: vv != null ? new Prisma.Decimal(vv.toFixed(2)) : null,
      },
    });
  }
}

// ============================================================ reads

async function listAggregates(ids: string[]): Promise<Map<string, { counted: number; net: number; abs: number }>> {
  const out = new Map<string, { counted: number; net: number; abs: number }>();
  if (!ids.length) return out;
  const rows = await prisma.$queryRaw<{ countId: string; counted: bigint; net: Prisma.Decimal | null; abs: Prisma.Decimal | null }[]>`
    SELECT "countId", COUNT("countedQty") AS counted, SUM("varianceValue") AS net, SUM(ABS("varianceValue")) AS abs
    FROM "stock_count_lines" WHERE "countId" IN (${Prisma.join(ids)}) GROUP BY "countId"`;
  for (const r of rows) out.set(r.countId, { counted: Number(r.counted), net: qnum(r.net), abs: qnum(r.abs) });
  return out;
}

function countWhere(q: Pick<StockCountListQuery, 'branchId' | 'status' | 'type'>, authBranchId?: string | null): Prisma.StockCountWhereInput {
  return {
    // BRANCH_ADMIN ເຫັນສະເພາະໃບນັບຂອງສາຂາຕົນ
    ...(authBranchId ? { branchId: authBranchId } : q.branchId ? { branchId: q.branchId } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.type ? { type: q.type } : {}),
  };
}

export async function listStockCounts(
  q: StockCountListQuery,
  authBranchId?: string | null,
): Promise<Paginated<StockCountView>> {
  const where = countWhere(q, authBranchId);
  const [rows, total] = await Promise.all([
    prisma.stockCount.findMany({
      where,
      include: COUNT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.stockCount.count({ where }),
  ]);
  const aggs = await listAggregates(rows.map((r) => r.id));
  return {
    items: rows.map((r) => toCountView(r, aggs.get(r.id) ?? { counted: 0, net: 0, abs: 0 })),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export async function exportStockCounts(
  q: StockCountListQuery,
  authBranchId?: string | null,
  maxRows: number = INVENTORY_EXPORT_MAX_ROWS,
): Promise<InventoryExportView<StockCountView>> {
  const r = await listStockCounts({ ...q, page: 1, pageSize: maxRows }, authBranchId);
  return { items: r.items, total: r.total, truncated: r.total > r.items.length, maxRows };
}

async function findCount(db: Db, id: string): Promise<CountRow> {
  const c = await db.stockCount.findUnique({ where: { id }, include: COUNT_INCLUDE });
  if (!c) throw ApiError.notFound('ບໍ່ພົບໃບນັບສະຕັອກ');
  return c;
}

async function detailView(db: Db, id: string): Promise<StockCountView> {
  const c = await findCount(db, id);
  const ev = await evaluate(db, c);
  return toCountView(c, ev.agg, {
    movementsDuringCount: ev.movementCount,
    lines: ev.lines.map(({ line, live }) => toLineView(line, live)),
  });
}

export async function getStockCount(id: string, authBranchId?: string | null): Promise<StockCountView> {
  const c = await findCount(prisma, id);
  if (authBranchId && authBranchId !== c.branchId) throw ApiError.forbidden('ເບິ່ງໄດ້ສະເພາະໃບນັບຂອງສາຂາຂອງທ່ານ');
  return detailView(prisma, id);
}

// ============================================================ writes

export async function createStockCount(input: StockCountCreateInput, auth: Auth | null): Promise<StockCountView> {
  assertBranchScope(auth?.branchId, input.branchId);
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true } });
  if (!branch) throw ApiError.badRequest('ບໍ່ພົບສາຂາ');

  let productIds: string[];
  if (input.type === 'FULL') {
    const all = await prisma.product.findMany({
      where: { branchId: input.branchId, deletedAt: null, isActive: true },
      select: { id: true },
      orderBy: { name: 'asc' },
    });
    productIds = all.map((p) => p.id);
  } else {
    productIds = [...new Set(input.productIds ?? [])];
    const found = await prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      select: { id: true, branchId: true },
    });
    if (found.length !== productIds.length) throw ApiError.badRequest('ມີສິນຄ້າບາງລາຍການບໍ່ພົບ');
    if (found.some((p) => p.branchId !== input.branchId)) throw ApiError.badRequest('ສິນຄ້າຕ້ອງຢູ່ສາຂາດຽວກັນກັບໃບນັບ');
  }
  if (!productIds.length) throw ApiError.badRequest('ສາຂານີ້ບໍ່ມີສິນຄ້າໃຫ້ນັບ');

  const id = await prisma.$transaction(async (tx) => {
    const c = await tx.stockCount.create({
      data: {
        branchId: input.branchId,
        countNumber: await nextDocumentNo(tx, input.branchId, 'SC'),
        type: input.type,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        notes: input.notes?.trim() || null,
        createdByUserId: auth?.sub ?? null,
        // DRAFT: ໜຶ່ງແຖວຕໍ່ສິນຄ້າ (ຍັງບໍ່ snapshot) — ຕອນ start ຈະແຕກເປັນແຖວ lot + snapshot ຍອດ.
        lines: { createMany: { data: productIds.map((productId) => ({ productId })) } },
      },
      select: { id: true },
    });
    return c.id;
  });
  return detailView(prisma, id);
}

/** DRAFT → COUNTING: lock ສິນຄ້າ → startedAt → snapshot ຍອດລະບົບ (lot ແຍກແຖວ + ແຖວ "ບໍ່ມີ lot"). */
export async function startStockCount(id: string, auth: Auth | null): Promise<StockCountView> {
  await prisma.$transaction(
    async (tx) => {
      await lockCountRow(tx, id);
      const c = await findCount(tx, id);
      assertBranchScope(auth?.branchId, c.branchId);
      if (c.status !== 'DRAFT') throw ApiError.conflict('ເລີ່ມນັບໄດ້ສະເພາະໃບນັບທີ່ຍັງເປັນຮ່າງ');
      const draft = await tx.stockCountLine.findMany({ where: { countId: id }, select: { productId: true } });
      const productIds = [...new Set(draft.map((l) => l.productId))];
      await lockProducts(tx, productIds);
      const startedAt = new Date();
      const products = await tx.product.findMany({
        where: { id: { in: productIds }, deletedAt: null },
        select: { id: true, stockQty: true, trackLot: true },
        orderBy: { name: 'asc' },
      });
      const lots = await tx.stockLot.findMany({
        where: { productId: { in: products.filter((p) => p.trackLot).map((p) => p.id) }, qtyOnHand: { gt: 0 } },
        select: { id: true, productId: true, qtyOnHand: true },
        orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }],
      });
      const seeds: Prisma.StockCountLineCreateManyInput[] = [];
      for (const p of products) {
        const stock = qnum(p.stockQty);
        if (!p.trackLot) {
          seeds.push({ countId: id, productId: p.id, lotId: null, systemQty: qdec(stock) });
          continue;
        }
        const own = lots.filter((l) => l.productId === p.id);
        for (const l of own) seeds.push({ countId: id, productId: p.id, lotId: l.id, systemQty: l.qtyOnHand });
        const unlotted = qnum(stock - own.reduce((s, l) => s + qnum(l.qtyOnHand), 0));
        // ແຖວ "ບໍ່ມີ lot" ສຳລັບສະຕັອກເກົ່າ; ຖ້າສິນຄ້າບໍ່ມີ lot ເຫຼືອເລີຍ ກໍໃຫ້ມີ 1 ແຖວ ເພື່ອນັບພົບຂອງທີ່ບໍ່ຢູ່ໃນລະບົບໄດ້.
        if (unlotted > EPS || own.length === 0) {
          seeds.push({ countId: id, productId: p.id, lotId: null, systemQty: qdec(unlotted) });
        }
      }
      if (!seeds.length) throw ApiError.conflict('ບໍ່ມີສິນຄ້າໃຫ້ນັບ (ສິນຄ້າຖືກລຶບໝົດແລ້ວ)');
      await tx.stockCountLine.deleteMany({ where: { countId: id } });
      await tx.stockCountLine.createMany({ data: seeds });
      await tx.stockCount.update({
        where: { id },
        data: { status: 'COUNTING', startedAt, countedByUserId: auth?.sub ?? null },
      });
    },
    { timeout: 30_000 },
  );
  return detailView(prisma, id);
}

/** ບັນທຶກຜົນນັບ (ບາງແຖວກໍໄດ້) — ສະເພາະ COUNTING. */
export async function updateStockCountLines(
  id: string,
  input: StockCountLinesUpdateInput,
  auth: Auth | null,
): Promise<StockCountView> {
  await prisma.$transaction(
    async (tx) => {
      await lockCountRow(tx, id);
      const c = await findCount(tx, id);
      assertBranchScope(auth?.branchId, c.branchId);
      if (c.status !== 'COUNTING') throw ApiError.conflict('ບັນທຶກຜົນນັບໄດ້ສະເພາະໃບທີ່ກຳລັງນັບ');
      const ids = input.lines.map((l) => l.lineId);
      const owned = await tx.stockCountLine.count({ where: { id: { in: ids }, countId: id } });
      if (owned !== new Set(ids).size) throw ApiError.badRequest('ມີແຖວທີ່ບໍ່ຢູ່ໃນໃບນັບນີ້');
      const now = new Date();
      for (const l of input.lines) {
        await tx.stockCountLine.update({
          where: { id: l.lineId },
          data: {
            countedQty: l.countedQty != null ? qdec(l.countedQty) : null,
            countedAt: l.countedQty != null ? now : null,
            ...(l.notes !== undefined ? { notes: l.notes?.trim() || null } : {}),
          },
        });
      }
      if (auth?.sub) await tx.stockCount.update({ where: { id }, data: { countedByUserId: auth.sub } });
      const ev = await evaluate(tx, c);
      await persistVariances(tx, ev.lines.filter(({ line }) => ids.includes(line.id)));
    },
    { timeout: 30_000 },
  );
  return detailView(prisma, id);
}

export async function submitStockCount(id: string, auth: Auth | null): Promise<StockCountView> {
  const result = await prisma.$transaction(
    async (tx) => {
      await lockCountRow(tx, id);
      const c = await findCount(tx, id);
      assertBranchScope(auth?.branchId, c.branchId);
      if (c.status !== 'COUNTING') throw ApiError.conflict('ສົ່ງອະນຸມັດໄດ້ສະເພາະໃບທີ່ກຳລັງນັບ');
      const uncounted = await tx.stockCountLine.count({ where: { countId: id, countedQty: null } });
      if (uncounted > 0) throw ApiError.badRequest(`ຍັງມີ ${uncounted} ແຖວທີ່ບໍ່ໄດ້ນັບ`);
      const ev = await evaluate(tx, c);
      await persistVariances(tx, ev.lines);
      await tx.stockCount.update({ where: { id }, data: { status: 'PENDING_APPROVAL', submittedAt: new Date(), rejectReason: null } });
      return { abs: ev.agg.abs, countNumber: c.countNumber, branchId: c.branchId, branchName: c.branch.name };
    },
    { timeout: 30_000 },
  );
  const { approvalThresholdLak } = await getAdjustSettings();
  if (result.abs > approvalThresholdLak) void notifyCountApprovers(id, result, auth?.sub ?? null);
  return detailView(prisma, id);
}

async function notifyCountApprovers(
  id: string,
  r: { abs: number; countNumber: string; branchId: string; branchName: string },
  submitterId: string | null,
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN', isActive: true, deletedAt: null, ...(submitterId ? { id: { not: submitterId } } : {}) },
      select: { id: true },
    });
    await Promise.all(
      admins.map((u) =>
        notifyUser({
          userId: u.id,
          type: 'STOCK_COUNT_PENDING',
          title: 'ໃບນັບສະຕັອກລໍຖ້າອະນຸມັດ',
          body: `${r.countNumber} · ສ່ວນຕ່າງ ${Math.round(r.abs).toLocaleString('en-US')} LAK · ${r.branchName}`,
          severity: 'warning',
          data: { stockCountId: id, branchId: r.branchId },
          dedupeKey: `stock-count-pending:${id}:${Date.now()}:${u.id}`,
        }),
      ),
    );
  } catch (err) {
    logger.warn({ err, stockCountId: id }, 'stock count approver notification failed');
  }
}

/**
 * PENDING_APPROVAL → POSTED. SUPER_ADMIN ອະນຸມັດໄດ້ສະເໝີ; BRANCH_ADMIN (ສາຂາຕົນ) ໄດ້ເມື່ອ Σ|varianceValue| ບໍ່ເກີນ
 * `inventory.adjustApprovalThresholdLak` (ເກນດຽວກັບ H2 maker-checker). post ທັງໝົດໃນ tx ດຽວ + lock ສິນຄ້າ.
 */
export async function approveStockCount(id: string, auth: Auth): Promise<StockCountView> {
  const { approvalThresholdLak } = await getAdjustSettings();
  await prisma.$transaction(
    async (tx) => {
      await lockCountRow(tx, id);
      const c = await findCount(tx, id);
      assertBranchScope(auth.branchId, c.branchId);
      if (c.status !== 'PENDING_APPROVAL') throw ApiError.conflict('ອະນຸມັດໄດ້ສະເພາະໃບທີ່ລໍຖ້າອະນຸມັດ');
      const productIds = (await tx.stockCountLine.findMany({ where: { countId: id }, select: { productId: true } })).map(
        (l) => l.productId,
      );
      // lock ກ່ອນຄິດ delta ສຸດທ້າຍ → ບໍ່ມີ movement ໃໝ່ແຊກລະຫວ່າງຄິດ ແລະ post.
      await lockProducts(tx, productIds);
      const ev = await evaluate(tx, c);
      if (auth.role !== 'SUPER_ADMIN' && ev.agg.abs > approvalThresholdLak) {
        throw ApiError.forbidden(
          `ມູນຄ່າສ່ວນຕ່າງ ${Math.round(ev.agg.abs).toLocaleString('en-US')} LAK ເກີນເກນ — ຕ້ອງໃຫ້ SUPER_ADMIN ອະນຸມັດ`,
        );
      }
      await postCountVariances(tx, c, ev.lines, auth.sub);
      await tx.stockCount.update({
        where: { id },
        data: { status: 'POSTED', postedAt: new Date(), approvedByUserId: auth.sub },
      });
    },
    { timeout: 60_000 },
  );
  return detailView(prisma, id);
}

async function postCountVariances(
  tx: Tx,
  c: CountRow,
  rows: { line: LineRow; live: LiveLine }[],
  approverId: string,
): Promise<void> {
  const byProduct = new Map<string, { line: LineRow; live: LiveLine }[]>();
  for (const r of rows) byProduct.set(r.line.productId, [...(byProduct.get(r.line.productId) ?? []), r]);
  const branch = await tx.branch.findUnique({ where: { id: c.branchId }, select: { allowNegativeStock: true } });
  const refId = `count:${c.id}`;
  const author = c.countedByUserId ?? approverId;

  for (const [productId, lines] of byProduct) {
    const product = await tx.product.findUnique({
      where: { id: productId },
      select: { name: true, stockQty: true, costPrice: true, trackLot: true },
    });
    if (!product) continue;
    const wac = costNum(product.costPrice);
    let balance = qnum(product.stockQty);
    // ບວກກ່ອນ ລົບທີຫຼັງ → balanceAfter ລະຫວ່າງທາງບໍ່ຕ່ຳກວ່າຍອດສຸດທ້າຍ.
    const ordered = [...lines].sort((a, b) => (b.live.variance ?? 0) - (a.live.variance ?? 0));
    let touched = false;
    for (const { line, live } of ordered) {
      const v = live.variance ?? 0;
      let unitCost = wac;
      if (Math.abs(v) >= EPS) {
        if (line.lotId) {
          // ແຖວ lot: ປັບ lot ນັ້ນໂດຍກົງ (ບໍ່ FEFO), ຕີມູນຄ່າຕາມຕົ້ນທຶນ lot.
          const lot = await tx.stockLot.findUnique({ where: { id: line.lotId } });
          if (!lot) throw ApiError.conflict(`ບໍ່ພົບ lot ຂອງ "${product.name}"`);
          const next = qnum(qnum(lot.qtyOnHand) + v);
          if (next < -EPS) throw ApiError.conflict(`Lot ${lot.lotNumber} ຂອງ "${product.name}" ຈະຕິດລົບ — ກວດຜົນນັບຄືນ`);
          await tx.stockLot.update({ where: { id: lot.id }, data: { qtyOnHand: qdec(next) } });
          unitCost = costNum(lot.unitCost);
        }
        // ແຖວບໍ່ມີ lot: ປັບ stockQty ລ້ວນໆ ຕາມ WAC; ການເພີ່ມຈາກການນັບບໍ່ແມ່ນການຊື້ → WAC ບໍ່ປ່ຽນ (C4).
        balance = qnum(balance + v);
        touched = true;
        await tx.stockMovement.create({
          data: {
            branchId: c.branchId,
            productId,
            type: v > 0 ? 'ADJUSTMENT_ADD' : 'ADJUSTMENT_DEDUCT',
            qty: qdec(Math.abs(v)),
            balanceAfter: qdec(balance),
            unitCost: costDec(unitCost),
            valueChange: money(v * unitCost),
            lotId: line.lotId,
            reasonCode: 'COUNT_VARIANCE',
            refId,
            notes: `ນັບສະຕັອກ ${c.countNumber}${line.notes ? ` — ${line.notes}` : ''}`,
            createdByUserId: author,
          },
        });
      } else if (line.lotId && line.lot) {
        unitCost = costNum(line.lot.unitCost);
      }
      await tx.stockCountLine.update({
        where: { id: line.id },
        data: {
          variance: qdec(v),
          unitCost: costDec(unitCost),
          varianceValue: new Prisma.Decimal(money(v * unitCost).toFixed(2)),
          reasonCode: Math.abs(v) >= EPS ? 'COUNT_VARIANCE' : null,
        },
      });
    }
    if (!touched) continue;
    if (balance < -EPS && !branch?.allowNegativeStock) {
      throw ApiError.conflict(`ສະຕັອກ "${product.name}" ຈະຕິດລົບຫຼັງ post — ກວດຜົນນັບຄືນ`);
    }
    if (product.trackLot) {
      const agg = await tx.stockLot.aggregate({ where: { productId }, _sum: { qtyOnHand: true } });
      if (qnum(agg._sum.qtyOnHand) > balance + EPS) {
        throw ApiError.conflict(`ສະຕັອກບໍ່ມີ lot ຂອງ "${product.name}" ຈະຕິດລົບ — ກວດຜົນນັບຄືນ`);
      }
    }
    await tx.product.update({ where: { id: productId }, data: { stockQty: qdec(balance) } });
  }
}

/** PENDING_APPROVAL → COUNTING ພ້ອມເຫດຜົນ (ນັບຄືນ/ແກ້ໄຂແລ້ວສົ່ງໃໝ່). */
export async function rejectStockCount(id: string, auth: Auth, input: StockCountRejectInput): Promise<StockCountView> {
  await prisma.$transaction(async (tx) => {
    await lockCountRow(tx, id);
    const c = await findCount(tx, id);
    assertBranchScope(auth.branchId, c.branchId);
    if (c.status !== 'PENDING_APPROVAL') throw ApiError.conflict('ປະຕິເສດໄດ້ສະເພາະໃບທີ່ລໍຖ້າອະນຸມັດ');
    await tx.stockCount.update({
      where: { id },
      data: { status: 'COUNTING', rejectReason: input.reason, submittedAt: null },
    });
  });
  return detailView(prisma, id);
}

export async function cancelStockCount(id: string, auth: Auth, input: StockCountCancelInput): Promise<StockCountView> {
  await prisma.$transaction(async (tx) => {
    await lockCountRow(tx, id);
    const c = await findCount(tx, id);
    assertBranchScope(auth.branchId, c.branchId);
    if (c.status === 'POSTED') throw ApiError.conflict('ໃບນັບນີ້ post ແລ້ວ — ຍົກເລີກບໍ່ໄດ້ (ແກ້ດ້ວຍການປັບສະຕັອກແທນ)');
    if (c.status === 'CANCELLED') throw ApiError.conflict('ໃບນັບນີ້ຖືກຍົກເລີກແລ້ວ');
    await tx.stockCount.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: input.reason?.trim() || null },
    });
  });
  return detailView(prisma, id);
}
