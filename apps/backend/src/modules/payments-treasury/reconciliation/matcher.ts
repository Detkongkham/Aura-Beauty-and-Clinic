import { prisma } from '../../../config/database.js';
import { vientianeDateKey, vientianeDayStart } from '../../../utils/dateHelpers.js';
import { round2, toNum } from '../../../utils/money.js';
import { BANK_TENDERS, DAY_MS, dateToKey, keyToDate } from './recon.util.js';

/**
 * G1 — ຈັບຄູ່ແຖວ statement ກັບລາຍການໃນລະບົບແບບອັດຕະໂນມັດ.
 *
 * ເງື່ອນໄຂ: ບັນຊີດຽວກັນ, ທິດທາງດຽວກັນ, ຈຳນວນເທົ່າກັນ (ຫຼື ເທົ່າກັບຍອດສຸດທິ ຖ້າ provider ຫັກຄ່າທຳນຽມ),
 * ວັນທີຫ່າງບໍ່ເກີນ 1 ມື້ (ເງິນໂອນຕອນເດິກເຂົ້າທະນາຄານມື້ຖັດໄປ).
 * ຄະແນນ: ເລກອ້າງອີງກົງ +100, ມື້ດຽວກັນ +20, ເວລາໃກ້ກັນ +0…10.
 * ຈັບຄູ່ສະເພາະເມື່ອ (ກ) ເລກອ້າງອີງກົງ ຫຼື (ຂ) ມີຜູ້ສະໝັກຄະແນນສູງສຸດພຽງອັນດຽວ — ບໍ່ເດົາເມື່ອສອງລາຍການຄືກັນ.
 */

type Candidate = {
  kind: 'TX' | 'EXPENSE' | 'REFUND' | 'CASH_FUND';
  id: string;
  amount: number;
  /** ຍອດທີ່ທະນາຄານຄວນສະແດງ (gross − fee ສຳລັບ provider ທີ່ໂອນສຸດທິ). */
  netAmount: number;
  at: Date;
  dateKey: string;
  refs: string[];
};

type LineLike = {
  id: string;
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  statementDate: string;
  postedAt: Date | null;
  reference: string | null;
  description: string | null;
};

const EPS = 0.01;

function refHit(line: LineLike, refs: string[]): boolean {
  const hay = `${line.reference ?? ''} ${line.description ?? ''}`.toLowerCase();
  return refs.some((r) => r.length >= 4 && hay.includes(r.toLowerCase()));
}

function score(line: LineLike, c: Candidate): number | null {
  const amountOk = Math.abs(c.amount - line.amount) <= EPS || Math.abs(c.netAmount - line.amount) <= EPS;
  if (!amountOk) return null;
  const dayDiff = Math.abs(keyToDate(c.dateKey).getTime() - keyToDate(line.statementDate).getTime()) / DAY_MS;
  if (dayDiff > 1) return null;
  let s = 0;
  if (refHit(line, c.refs)) s += 100;
  if (dayDiff === 0) s += 20;
  if (line.postedAt) {
    const hours = Math.abs(line.postedAt.getTime() - c.at.getTime()) / 3_600_000;
    s += Math.max(0, 10 - hours);
  }
  return s;
}

/** ເລືອກຜູ້ສະໝັກທີ່ດີທີ່ສຸດ ຫຼື null ຖ້າບໍ່ແນ່ໃຈ (ສອງອັນຄະແນນເທົ່າກັນ ແລະ ບໍ່ມີເລກອ້າງອີງ). */
export function pickCandidate(line: LineLike, pool: Candidate[]): Candidate | null {
  const scored = pool
    .map((c) => ({ c, s: score(line, c) }))
    .filter((x): x is { c: Candidate; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s);
  if (!scored.length) return null;
  const [top, second] = scored;
  if (top!.s >= 100) return second && second.s >= 100 && Math.abs(second.s - top!.s) < 1 ? null : top!.c;
  if (second && Math.abs(second.s - top!.s) < 1) return null;
  return top!.c;
}

/** ຜູ້ສະໝັກໃນລະບົບຂອງບັນຊີໜຶ່ງ ໃນຊ່ວງ [fromKey−1, toKey+1] ທີ່ຍັງບໍ່ຖືກຈັບຄູ່. */
export async function loadCandidates(bankAccountId: string, fromKey: string, toKey: string, excludeMatched = true) {
  const start = vientianeDayStart(new Date(keyToDate(fromKey).getTime() - DAY_MS));
  const end = vientianeDayStart(new Date(keyToDate(toKey).getTime() + 2 * DAY_MS));
  const matched = excludeMatched
    ? await prisma.bankStatementLine.findMany({
        where: { bankAccountId, matchStatus: 'MATCHED' },
        select: { matchedTxId: true, matchedExpenseId: true, matchedRefundId: true, matchedCashFundEntryId: true },
      })
    : [];
  const usedTx = new Set(matched.map((m) => m.matchedTxId).filter(Boolean));
  const usedExp = new Set(matched.map((m) => m.matchedExpenseId).filter(Boolean));
  const usedRef = new Set(matched.map((m) => m.matchedRefundId).filter(Boolean));
  const usedFund = new Set(matched.map((m) => m.matchedCashFundEntryId).filter(Boolean));

  const [txs, expenses, refunds, fundTopups] = await Promise.all([
    prisma.paymentTransaction.findMany({
      where: { bankAccountId, status: 'SUCCESS', method: { in: [...BANK_TENDERS] }, createdAt: { gte: start, lt: end } },
      select: {
        id: true,
        amount: true,
        createdAt: true,
        qrReference: true,
        slip: { select: { txnRef: true } },
        providerIntent: { select: { reference: true, provider: { select: { feeRate: true, settlesNet: true } } } },
      },
    }),
    prisma.expense.findMany({
      where: { paidFromAccountId: bankAccountId, status: 'PAID', paidAt: { gte: start, lt: end } },
      select: { id: true, amount: true, paidAt: true, paidReference: true },
    }),
    prisma.refund.findMany({
      where: { bankAccountId, status: 'PAID', paidAt: { gte: start, lt: end } },
      select: { id: true, amount: true, paidAt: true, providerRef: true },
    }),
    prisma.cashFundEntry.findMany({
      where: { bankAccountId, type: 'TOPUP', createdAt: { gte: start, lt: end } },
      select: { id: true, amount: true, createdAt: true },
    }),
  ]);

  const credits: Candidate[] = txs
    .filter((t) => !usedTx.has(t.id))
    .map((t) => {
      const amount = toNum(t.amount);
      const p = t.providerIntent?.provider;
      const fee = p?.settlesNet ? round2(amount * p.feeRate) : 0;
      return {
        kind: 'TX' as const,
        id: t.id,
        amount,
        netAmount: round2(amount - fee),
        at: t.createdAt,
        dateKey: dateToKey(vientianeDateKey(t.createdAt)),
        refs: [t.slip?.txnRef, t.providerIntent?.reference, t.qrReference].filter((x): x is string => Boolean(x)),
      };
    });
  const debits: Candidate[] = [
    ...expenses
      .filter((e) => !usedExp.has(e.id))
      .map((e) => ({
        kind: 'EXPENSE' as const,
        id: e.id,
        amount: toNum(e.amount),
        netAmount: toNum(e.amount),
        at: e.paidAt!,
        dateKey: dateToKey(vientianeDateKey(e.paidAt!)),
        refs: e.paidReference ? [e.paidReference] : [],
      })),
    ...refunds
      .filter((r) => !usedRef.has(r.id))
      .map((r) => ({
        kind: 'REFUND' as const,
        id: r.id,
        amount: toNum(r.amount),
        netAmount: toNum(r.amount),
        at: r.paidAt!,
        dateKey: dateToKey(vientianeDateKey(r.paidAt!)),
        refs: r.providerRef ? [r.providerRef] : [],
      })),
    ...fundTopups
      .filter((f) => !usedFund.has(f.id))
      .map((f) => ({
        kind: 'CASH_FUND' as const,
        id: f.id,
        amount: Math.abs(toNum(f.amount)),
        netAmount: Math.abs(toNum(f.amount)),
        at: f.createdAt,
        dateKey: dateToKey(vientianeDateKey(f.createdAt)),
        refs: [] as string[],
      })),
  ];
  return { credits, debits };
}

/** ຈັບຄູ່ແຖວທີ່ຍັງ UNMATCHED ຂອງບັນຊີໃນຊ່ວງວັນທີ. ຄືນຈຳນວນທີ່ຈັບຄູ່ໄດ້. */
export async function autoMatch(bankAccountId: string, fromKey: string, toKey: string): Promise<number> {
  const lines = await prisma.bankStatementLine.findMany({
    where: {
      bankAccountId,
      matchStatus: 'UNMATCHED',
      statementDate: { gte: keyToDate(fromKey), lte: keyToDate(toKey) },
    },
    orderBy: [{ statementDate: 'asc' }, { seq: 'asc' }],
  });
  if (!lines.length) return 0;
  const { credits, debits } = await loadCandidates(bankAccountId, fromKey, toKey);
  const now = new Date();
  let matched = 0;
  for (const l of lines) {
    const line: LineLike = {
      id: l.id,
      direction: l.direction,
      amount: toNum(l.amount),
      statementDate: dateToKey(l.statementDate),
      postedAt: l.postedAt,
      reference: l.reference,
      description: l.description,
    };
    const pool = l.direction === 'CREDIT' ? credits : debits;
    const pick = pickCandidate(line, pool);
    if (!pick) continue;
    pool.splice(pool.indexOf(pick), 1);
    await prisma.bankStatementLine.update({
      where: { id: l.id },
      data: {
        matchStatus: 'MATCHED',
        matchedTxId: pick.kind === 'TX' ? pick.id : null,
        matchedExpenseId: pick.kind === 'EXPENSE' ? pick.id : null,
        matchedRefundId: pick.kind === 'REFUND' ? pick.id : null,
        matchedCashFundEntryId: pick.kind === 'CASH_FUND' ? pick.id : null,
        matchedById: null,
        matchedAt: now,
      },
    });
    matched += 1;
  }
  return matched;
}
