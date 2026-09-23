import type { SlipBankProof } from '@abcp/shared-types';
import { prisma } from '../../../config/database.js';
import { vientianeDateKey } from '../../../utils/dateHelpers.js';
import { toNum } from '../../../utils/money.js';

/**
 * S1 — ຫຼັກຖານຈາກ statement ທະນາຄານ: ສະລິບເປັນພຽງຮູບ, ແຖວເງິນເຂົ້າໃນ statement ຄືຫຼັກຖານແທ້.
 *
 * ເງື່ອນໄຂ (ຄືກັບ matcher ຂອງການກະທົບຍອດ): ບັນຊີດຽວກັນ (ຫຼື ບັນຊີ active ຂອງສາຂາ ຖ້າສະລິບຍັງບໍ່ຜູກ), ແຖວ CREDIT,
 * ຈຳນວນເທົ່າກັນ (±0.01), ວັນ statement ຫ່າງຈາກມື້ໂອນບໍ່ເກີນ 1 ມື້. ເລກອ້າງອີງທີ່ພົບໃນ reference/description
 * ເປັນຄະແນນເພີ່ມ. ແຖວທີ່ຖືກຈັບຄູ່ກັບ tx ອື່ນແລ້ວ ບໍ່ນັບ. ຄິດເປັນຊຸດ (query ດຽວຕໍ່ list) ບໍ່ແມ່ນຕໍ່ແຖວ.
 */

const DAY_MS = 86_400_000;

export interface ProofInput {
  id: string;
  branchId: string;
  bankAccountId: string | null;
  amount: number | null;
  declaredAmount: number | null;
  txnRef: string | null;
  transferredAt: Date | null;
  createdAt: Date;
  paymentTransactionId: string | null;
}

const key = (d: Date): string => d.toISOString().slice(0, 10);
const shift = (k: string, days: number): string => key(new Date(new Date(`${k}T00:00:00Z`).getTime() + days * DAY_MS));

export async function computeBankProofs(slips: ProofInput[]): Promise<Map<string, SlipBankProof>> {
  const out = new Map<string, SlipBankProof>();
  const none: SlipBankProof = { status: 'NO_STATEMENT', refMatched: false, line: null };
  if (slips.length === 0) return out;

  // ບັນຊີທີ່ຕ້ອງເບິ່ງ: ບັນຊີຂອງສະລິບ, ຫຼື ທຸກບັນຊີ active ຂອງສາຂາ
  const unbound = [...new Set(slips.filter((s) => !s.bankAccountId).map((s) => s.branchId))];
  const branchAccounts = unbound.length
    ? await prisma.bankAccount.findMany({ where: { branchId: { in: unbound }, isActive: true }, select: { id: true, branchId: true } })
    : [];
  const accountsOf = (s: ProofInput): string[] =>
    s.bankAccountId ? [s.bankAccountId] : branchAccounts.filter((a) => a.branchId === s.branchId).map((a) => a.id);

  const dayOf = (s: ProofInput): string => key(vientianeDateKey(s.transferredAt ?? s.createdAt));
  const accountIds = [...new Set(slips.flatMap(accountsOf))];
  const days = [...new Set(slips.flatMap((s) => [shift(dayOf(s), -1), dayOf(s), shift(dayOf(s), 1)]))];
  if (accountIds.length === 0) {
    for (const s of slips) out.set(s.id, none);
    return out;
  }

  const [lines, imports] = await Promise.all([
    prisma.bankStatementLine.findMany({
      where: {
        bankAccountId: { in: accountIds },
        direction: 'CREDIT',
        statementDate: { in: days.map((d) => new Date(`${d}T00:00:00Z`)) },
      },
      select: {
        id: true,
        bankAccountId: true,
        statementDate: true,
        postedAt: true,
        amount: true,
        reference: true,
        description: true,
        matchStatus: true,
        matchedTxId: true,
      },
    }),
    prisma.bankStatementImport.findMany({
      where: { bankAccountId: { in: accountIds } },
      select: { bankAccountId: true, fromDate: true, toDate: true },
    }),
  ]);

  const covered = (accountId: string, day: string): boolean =>
    imports.some((i) => i.bankAccountId === accountId && key(i.fromDate) <= day && key(i.toDate) >= day);

  for (const s of slips) {
    const accts = accountsOf(s);
    const day = dayOf(s);
    const amount = s.amount ?? s.declaredAmount;
    const ref = (s.txnRef ?? '').toLowerCase();
    const window = new Set([shift(day, -1), day, shift(day, 1)]);
    const pool = lines.filter((l) => accts.includes(l.bankAccountId) && window.has(key(l.statementDate)));
    const view = (l: (typeof lines)[number], refMatched: boolean, status: SlipBankProof['status']): SlipBankProof => ({
      status,
      refMatched,
      line: {
        id: l.id,
        statementDate: key(l.statementDate),
        postedAt: l.postedAt?.toISOString() ?? null,
        amount: toNum(l.amount),
        reference: l.reference,
        description: l.description,
      },
    });

    const matched = s.paymentTransactionId ? pool.find((l) => l.matchedTxId === s.paymentTransactionId) : undefined;
    if (matched) {
      out.set(s.id, view(matched, hasRef(matched, ref), 'MATCHED'));
      continue;
    }
    const candidates = amount == null
      ? []
      : pool
          .filter((l) => Math.abs(toNum(l.amount) - amount) <= 0.01)
          // ແຖວທີ່ຈັບຄູ່ກັບ tx ອື່ນແລ້ວ ເປັນເງິນຂອງຄົນອື່ນ
          .filter((l) => l.matchStatus !== 'MATCHED' || l.matchedTxId === s.paymentTransactionId)
          .map((l) => ({ l, ref: hasRef(l, ref), sameDay: key(l.statementDate) === day }))
          .sort((a, b) => Number(b.ref) - Number(a.ref) || Number(b.sameDay) - Number(a.sameDay));
    if (candidates.length > 0) {
      out.set(s.id, view(candidates[0]!.l, candidates[0]!.ref, 'FOUND'));
    } else if (accts.some((a) => covered(a, day))) {
      out.set(s.id, { status: 'NOT_FOUND', refMatched: false, line: null });
    } else {
      out.set(s.id, none);
    }
  }
  return out;
}

function hasRef(l: { reference: string | null; description: string | null }, ref: string): boolean {
  if (ref.length < 4) return false;
  return `${l.reference ?? ''} ${l.description ?? ''}`.toLowerCase().includes(ref);
}
