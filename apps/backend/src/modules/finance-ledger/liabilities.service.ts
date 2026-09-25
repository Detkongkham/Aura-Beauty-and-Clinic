import type { AccessTokenPayload, LiabilitiesQuery, LiabilitiesView } from '@abcp/shared-types';
import { LOYALTY_POINT_VALUE_LAK } from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { dateOnlyVientiane } from './util.js';
import { round2, toNum } from '../../utils/money.js';
import { journalRange } from './journal.service.js';
import { getFinancePolicy } from './policy.js';

/**
 * Wave 11 (F-11/F-12/F-13) — ໜີ້ສິນສັນຍາ (IFRS 15 contract liabilities) ຄົງເຫຼືອ ณ ປັດຈຸບັນ:
 * ມັດຈຳລູກຄ້າ, ບັດຂອງຂວັນ, ແພັກເກັດທີ່ຍັງບໍ່ໃຊ້, ຄະແນນສະສົມ (ຕີມູນຄ່າ), ທິບຄ້າງຈ່າຍ
 * + ລາຍການທີ່ຖືກຮັບຮູ້ເປັນລາຍຮັບໃນຊ່ວງ (breakage, ຄະແນນໝົດອາຍຸ, ຄ່າປັບ, ຄ່າບໍລິການ).
 * ຄະແນນສະສົມບໍ່ຜູກສາຂາ → ສະແດງຍອດລວມທັງລະບົບສະເໝີ.
 */
export async function getLiabilities(auth: AccessTokenPayload, q: LiabilitiesQuery): Promise<LiabilitiesView> {
  const now = new Date();
  const to = q.to ?? dateOnlyVientiane(now);
  const from = q.from ?? dateOnlyVientiane(new Date(now.getTime() - 29 * 86_400_000));
  const range = journalRange(from, to);
  const branchId = auth.role !== 'SUPER_ADMIN' && auth.branchId ? auth.branchId : q.branchId !== 'all' ? q.branchId : null;
  const bSql = branchId ? Prisma.sql`AND p."branchId" = ${branchId}` : Prisma.empty;
  const in30 = new Date(now.getTime() + 30 * 86_400_000);

  const [deposits] = await prisma.$queryRaw<{ amount: Prisma.Decimal | null; bills: bigint }[]>`
    SELECT COALESCE(SUM(GREATEST(paid.amount - p."refundedAmount" - p."forfeitedAmount", 0)), 0) AS amount,
           COUNT(*) FILTER (WHERE paid.amount - p."refundedAmount" - p."forfeitedAmount" > 0) AS bills
    FROM "payments" p
    JOIN LATERAL (
      SELECT COALESCE(SUM(pt."amount"), 0) AS amount FROM "payment_transactions" pt
      WHERE pt."paymentId" = p."id" AND pt."status" = 'SUCCESS'
    ) paid ON true
    WHERE p."invoiceNo" IS NULL AND p."paymentStatus" IN ('PENDING', 'DEPOSIT_PAID')
      AND NOT EXISTS (SELECT 1 FROM "gift_cards" g WHERE g."purchasePaymentId" = p."id")
      AND NOT EXISTS (SELECT 1 FROM "user_packages" u WHERE u."purchasePaymentId" = p."id")
      ${bSql}
  `;

  const gcWhere: Prisma.GiftCardWhereInput = { status: 'ACTIVE', ...(branchId ? { branchId } : {}) };
  const [gc, gcSoon] = await Promise.all([
    prisma.giftCard.aggregate({ where: gcWhere, _sum: { currentBalance: true }, _count: true }),
    prisma.giftCard.aggregate({ where: { ...gcWhere, expireDate: { lte: in30 } }, _sum: { currentBalance: true } }),
  ]);

  const pkgs = await prisma.userPackage.findMany({
    where: { status: 'ACTIVE', expireDate: { gt: now }, ...(branchId ? { package: { branchId } } : {}) },
    select: {
      purchasePayment: { select: { totalAmount: true } },
      package: { select: { totalPrice: true } },
      items: { select: { totalUnits: true, remainingUnits: true } },
    },
  });
  let pkgAmount = 0;
  let pkgSessions = 0;
  let pkgCount = 0;
  for (const u of pkgs) {
    const total = u.items.reduce((s, i) => s + i.totalUnits, 0);
    const left = u.items.reduce((s, i) => s + i.remainingUnits, 0);
    if (total <= 0 || left <= 0) continue;
    const price = u.purchasePayment ? toNum(u.purchasePayment.totalAmount) : toNum(u.package.totalPrice);
    pkgAmount += (price * left) / total;
    pkgSessions += left;
    pkgCount += 1;
  }

  const policy = await getFinancePolicy();
  const pts = await prisma.loyaltyAccount.aggregate({ _sum: { points: true } });
  const points = pts._sum.points ?? 0;
  let expiringPts = 0;
  if (policy.pointsExpiryMonths > 0) {
    const cutoff30 = new Date(now.getTime() - policy.pointsExpiryMonths * 30.4375 * 86_400_000 + 30 * 86_400_000);
    const rows = await prisma.$queryRaw<{ points: number; old: bigint | null; debits: bigint | null }[]>`
      SELECT la."points",
        SUM(CASE WHEN lt."points" > 0 AND lt."createdAt" < ${cutoff30} THEN lt."points" ELSE 0 END) AS old,
        -SUM(CASE WHEN lt."points" < 0 THEN lt."points" ELSE 0 END) AS debits
      FROM "loyalty_accounts" la JOIN "loyalty_transactions" lt ON lt."loyaltyAccountId" = la."id"
      WHERE la."points" > 0 GROUP BY la."id"`;
    for (const r of rows) expiringPts += Math.min(Math.max(0, Number(r.old ?? 0) - Number(r.debits ?? 0)), r.points);
  }

  const tips = await prisma.gratuityShare.groupBy({
    by: ['staffProfileId'],
    where: { paidOutAt: null, ...(branchId ? { gratuity: { branchId } } : {}) },
    _sum: { amount: true },
  });
  const tipsAmount = tips.reduce((s, t) => s + toNum(t._sum.amount), 0);

  const pWhere: Prisma.PaymentWhereInput = branchId ? { branchId } : {};
  const [breakage, expired, fees, sc] = await Promise.all([
    prisma.giftCardTransaction.aggregate({
      where: { isBreakage: true, createdAt: range, ...(branchId ? { giftCard: { branchId } } : {}) },
      _sum: { amount: true },
    }),
    prisma.loyaltyTransaction.aggregate({ where: { type: 'EXPIRE', createdAt: range }, _sum: { points: true } }),
    prisma.payment.aggregate({ where: { ...pWhere, forfeitedAt: range }, _sum: { forfeitedAmount: true } }),
    prisma.payment.aggregate({ where: { ...pWhere, paidAt: range, invoiceNo: { not: null } }, _sum: { serviceChargeAmount: true } }),
  ]);

  const view: LiabilitiesView = {
    asOf: now.toISOString(),
    from,
    to,
    customerDeposits: { amount: round2(toNum(deposits?.amount)), bills: Number(deposits?.bills ?? 0) },
    giftCards: {
      amount: round2(toNum(gc._sum.currentBalance)),
      cards: gc._count,
      expiringIn30Days: round2(toNum(gcSoon._sum.currentBalance)),
    },
    packages: { amount: round2(pkgAmount), packages: pkgCount, sessions: pkgSessions },
    loyaltyPoints: {
      points,
      amount: round2(points * LOYALTY_POINT_VALUE_LAK),
      pointValueLak: LOYALTY_POINT_VALUE_LAK,
      expiringIn30Days: expiringPts,
    },
    tipsPayable: { amount: round2(tipsAmount), staff: tips.filter((t) => toNum(t._sum.amount) > 0).length },
    total: 0,
    recognized: {
      breakage: round2(-toNum(breakage._sum.amount)),
      pointsExpired: -(expired._sum.points ?? 0),
      cancellationFees: round2(toNum(fees._sum.forfeitedAmount)),
      serviceCharges: round2(toNum(sc._sum.serviceChargeAmount)),
    },
  };
  view.total = round2(
    view.customerDeposits.amount + view.giftCards.amount + view.packages.amount + view.loyaltyPoints.amount + view.tipsPayable.amount,
  );
  return view;
}
