import type { FxRateView, FxRefreshResult, UpsertFxRateInput } from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { LOYALTY_POINT_VALUE_LAK } from '@abcp/shared-types';
import { notifyUser } from '../../services/push.js';
import { dec, round2, toNum } from '../../utils/money.js';
import { getFinancePolicy } from './policy.js';

/**
 * Wave 11 — ວຽກບັນຊີປະຈຳວັນ: ຄະແນນໝົດອາຍຸ (F-13), breakage ບັດຂອງຂວັນ (F-12), FX feed (F-10).
 * ທຸກຟັງຊັນ idempotent — ແລ່ນຊ້ຳໃນມື້ດຽວກັນບໍ່ຕັດຊ້ຳ.
 */

const MONTH_MS = 30.4375 * 86_400_000;

// ---- F-13 points expiry (FIFO) ------------------------------------------

type PointsRow = {
  id: string;
  userid: string;
  points: number;
  oldcredits: bigint | number | null;
  sooncredits: bigint | number | null;
  debits: bigint | number | null;
};

/**
 * ຄະແນນທີ່ໄດ້ຮັບກ່ອນ cutoff (ວັນນີ້ − N ເດືອນ) ແລະ ຍັງບໍ່ຖືກໃຊ້ → ໝົດອາຍຸ. FIFO: ລາຍການຫັກທັງໝົດ
 * (ແລກ/ໝົດອາຍຸ/ປັບລົບ) ກິນຄະແນນເກົ່າສຸດກ່ອນ, ສະນັ້ນ ຍອດໝົດອາຍຸ = max(0, ເຄຣດິດເກົ່າ − ຫັກທັງໝົດ).
 * ໝົດອາຍຸແລ້ວ ຍອດຫັກເພີ່ມຂຶ້ນ → ແລ່ນຊ້ຳໄດ້ 0 (idempotent ໂດຍທຳມະຊາດ).
 */
export async function expireLoyaltyPoints(now = new Date()): Promise<{ accounts: number; points: number; notified: number }> {
  const policy = await getFinancePolicy();
  if (policy.pointsExpiryMonths <= 0) return { accounts: 0, points: 0, notified: 0 };
  const cutoff = new Date(now.getTime() - policy.pointsExpiryMonths * MONTH_MS);
  const soon = new Date(cutoff.getTime() + Math.max(policy.pointsExpiryNoticeDays, 0) * 86_400_000);

  const rows = await prisma.$queryRaw<PointsRow[]>`
    SELECT la."id", la."userId" AS userid, la."points",
      SUM(CASE WHEN lt."points" > 0 AND lt."createdAt" < ${cutoff} THEN lt."points" ELSE 0 END) AS oldcredits,
      SUM(CASE WHEN lt."points" > 0 AND lt."createdAt" >= ${cutoff} AND lt."createdAt" < ${soon} THEN lt."points" ELSE 0 END) AS sooncredits,
      -SUM(CASE WHEN lt."points" < 0 THEN lt."points" ELSE 0 END) AS debits
    FROM "loyalty_accounts" la
    JOIN "loyalty_transactions" lt ON lt."loyaltyAccountId" = la."id"
    WHERE la."points" > 0
    GROUP BY la."id"
  `;

  let accounts = 0;
  let total = 0;
  let notified = 0;
  for (const r of rows) {
    const old = Number(r.oldcredits ?? 0);
    const debits = Number(r.debits ?? 0);
    const expire = Math.min(Math.max(0, old - debits), r.points);
    if (expire > 0) {
      await prisma.$transaction(async (tx) => {
        // ລັອກບັນຊີ + ອ່ານຍອດໃໝ່ ກັນການແລກຄະແນນພ້ອມກັນ.
        const [locked] = await tx.$queryRaw<{ points: number }[]>`
          SELECT "points" FROM "loyalty_accounts" WHERE "id" = ${r.id} FOR UPDATE`;
        const n = Math.min(expire, locked?.points ?? 0);
        if (n <= 0) return;
        await tx.loyaltyTransaction.create({
          data: {
            loyaltyAccountId: r.id,
            type: 'EXPIRE',
            points: -n,
            refId: `expire:${now.toISOString().slice(0, 10)}`,
            notes: `ຄະແນນໝົດອາຍຸ (ເກີນ ${policy.pointsExpiryMonths} ເດືອນ)`,
          },
        });
        await tx.loyaltyAccount.update({ where: { id: r.id }, data: { points: { decrement: n } } });
        accounts += 1;
        total += n;
      });
    }
    // ແຈ້ງລ່ວງໜ້າ: ຄະແນນທີ່ຈະໝົດອາຍຸພາຍໃນ noticeDays ມື້ (ຫຼັງຕັດຮອບນີ້ແລ້ວ).
    if (policy.pointsExpiryNoticeDays > 0) {
      const soonPts = Math.min(Math.max(0, old + Number(r.sooncredits ?? 0) - (debits + expire)), r.points - expire);
      if (soonPts > 0) {
        const res = await notifyUser({
          userId: r.userid,
          type: 'LOYALTY_POINTS_EXPIRING',
          title: 'ຄະແນນສະສົມໃກ້ໝົດອາຍຸ',
          body: `${soonPts.toLocaleString()} ຄະແນນ ຈະໝົດອາຍຸພາຍໃນ ${policy.pointsExpiryNoticeDays} ມື້ — ໃຊ້ແລກສ່ວນຫຼຸດໄດ້ເລີຍ`,
          data: { points: soonPts },
          dedupeKey: `points-expiring:${r.id}:${soon.toISOString().slice(0, 7)}`,
        }).catch(() => ({ delivered: false }));
        if (res.delivered) notified += 1;
      }
    }
  }
  return { accounts, points: total, notified };
}

// ---- F-12 gift card breakage ---------------------------------------------

/** ບັດ ACTIVE ທີ່ເລີຍວັນໝົດອາຍຸ ແລະ ຍັງມີຍອດ → EXPIRED + ຮັບຮູ້ຍອດຄົງເຫຼືອເປັນລາຍຮັບ breakage. */
export async function recognizeGiftCardBreakage(now = new Date()): Promise<{ cards: number; amount: number }> {
  const policy = await getFinancePolicy();
  if (!policy.giftCardBreakage) return { cards: 0, amount: 0 };
  const due = await prisma.giftCard.findMany({
    where: { status: 'ACTIVE', expireDate: { lt: now } },
    select: { id: true },
  });
  let cards = 0;
  let amount = 0;
  for (const { id } of due) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "gift_cards" WHERE "id" = ${id} FOR UPDATE`;
      const card = await tx.giftCard.findUniqueOrThrow({ where: { id }, select: { status: true, currentBalance: true } });
      if (card.status !== 'ACTIVE') return;
      const bal = toNum(card.currentBalance);
      await tx.giftCard.update({
        where: { id },
        data: { status: 'EXPIRED', expiredAt: now, breakageAmount: dec(bal), currentBalance: dec(0) },
      });
      if (bal > 0) {
        await tx.giftCardTransaction.create({
          data: { giftCardId: id, amount: dec(-bal), balanceAfter: dec(0), isBreakage: true },
        });
      }
      cards += 1;
      amount += bal;
    });
  }
  return { cards, amount: round2(amount) };
}

// ---- F-10 FX feed --------------------------------------------------------

export type FxFetcher = (base: string) => Promise<Record<string, number>>;

/** default: open.er-api.com (ຟຣີ, ບໍ່ຕ້ອງ key) — ຄືນ rates ຂອງ 1 `base` = ? ສະກຸນອື່ນ. */
const defaultFetcher: FxFetcher = async (base) => {
  const url = process.env.FX_FEED_URL ?? `https://open.er-api.com/v6/latest/${base}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`FX feed HTTP ${res.status}`);
  const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
  if (!json.rates) throw new Error('FX feed: no rates');
  return json.rates;
};

function toFxView(r: {
  baseCurrency: string;
  rate: Prisma.Decimal;
  source: string;
  locked: boolean;
  fetchedAt: Date | null;
  updatedAt: Date;
}): FxRateView {
  return {
    currency: r.baseCurrency,
    rate: r.rate.toNumber(),
    source: r.source === 'FEED' ? 'FEED' : 'MANUAL',
    locked: r.locked,
    fetchedAt: r.fetchedAt?.toISOString() ?? null,
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listFxRates(): Promise<FxRateView[]> {
  const rows = await prisma.exchangeRate.findMany({ where: { targetCurrency: 'LAK' }, orderBy: { baseCurrency: 'asc' } });
  return rows.map(toFxView);
}

export async function upsertFxRate(input: UpsertFxRateInput): Promise<FxRateView> {
  const row = await prisma.exchangeRate.upsert({
    where: { baseCurrency_targetCurrency: { baseCurrency: input.currency, targetCurrency: 'LAK' } },
    create: { baseCurrency: input.currency, targetCurrency: 'LAK', rate: new Prisma.Decimal(input.rate), source: 'MANUAL', locked: input.locked },
    update: { rate: new Prisma.Decimal(input.rate), source: 'MANUAL', locked: input.locked },
  });
  return toFxView(row);
}

/**
 * ດຶງອັດຕາ ແລ້ວຂຽນ `<ccy> → LAK` ຂອງທຸກສະກຸນໃນ policy.fxCurrencies ຍົກເວັ້ນແຖວທີ່ locked.
 * `force` = ແລ່ນເຖິງແມ່ນ fxAutoFeed ປິດ (ປຸ່ມ "ດຶງດຽວນີ້" ໃນໜ້າ admin).
 */
export async function refreshFxRates(opts: { force?: boolean; fetcher?: FxFetcher } = {}): Promise<FxRefreshResult> {
  const policy = await getFinancePolicy();
  const fetchedAt = new Date();
  const out: FxRefreshResult = { updated: [], skippedLocked: [], failed: null, fetchedAt: fetchedAt.toISOString() };
  if (!policy.fxAutoFeed && !opts.force) return out;
  let rates: Record<string, number>;
  try {
    rates = await (opts.fetcher ?? defaultFetcher)('LAK');
  } catch (err) {
    out.failed = (err as Error).message;
    logger.warn({ err }, 'FX feed failed');
    return out;
  }
  for (const ccy of policy.fxCurrencies) {
    const perLak = rates[ccy];
    if (!perLak || perLak <= 0) continue;
    // ອັດຕາເກັບ 6 ຕຳແໜ່ງ (Decimal 12,6) — ບໍ່ໃຊ້ round2 ທີ່ປັດເປັນ LAK ຈຳນວນເຕັມ (VND ≈ 0.8 LAK).
    const rate = Math.round((1 / perLak) * 1e6) / 1e6;
    const existing = await prisma.exchangeRate.findUnique({
      where: { baseCurrency_targetCurrency: { baseCurrency: ccy, targetCurrency: 'LAK' } },
      select: { locked: true },
    });
    if (existing?.locked) {
      out.skippedLocked.push(ccy);
      continue;
    }
    await prisma.exchangeRate.upsert({
      where: { baseCurrency_targetCurrency: { baseCurrency: ccy, targetCurrency: 'LAK' } },
      create: { baseCurrency: ccy, targetCurrency: 'LAK', rate: new Prisma.Decimal(rate), source: 'FEED', fetchedAt },
      update: { rate: new Prisma.Decimal(rate), source: 'FEED', fetchedAt },
    });
    out.updated.push(ccy);
  }
  return out;
}

/** ມູນຄ່າ LAK ຕໍ່ 1 ຄະແນນ (ໃຊ້ຕີມູນຄ່າໜີ້ສິນຄະແນນ). */
export const pointValueLak = (): number => LOYALTY_POINT_VALUE_LAK;
