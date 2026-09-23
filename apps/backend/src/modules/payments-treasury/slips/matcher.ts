import {
  SLIP_BEFORE_BILL_GRACE_MS,
  SLIP_FUTURE_SKEW_MS,
  SLIP_MAX_AGE_MS,
} from '../../../constants/paymentsTreasury.js';
import { vientianeDateKey } from '../../../utils/dateHelpers.js';
import type { SlipParsed } from './parser.js';

export type MismatchField = 'amount' | 'currency' | 'receiverAccount' | 'transferredAt' | 'txnRef';

export interface CandidateAccount {
  id: string;
  accountNumber: string;
}

export interface MatchInput {
  parsed: SlipParsed;
  expected: { amounts: number[]; currency: string; tolerance: number };
  accounts: CandidateAccount[];
  /** ເວລາເປີດບິນ + ເວລາອັບໂຫຼດ — ກອບເວລາທີ່ຍອມຮັບຂອງການໂອນ. */
  billCreatedAt: Date;
  uploadedAt: Date;
}

export interface MatchResult {
  matchScore: number;
  mismatchFields: MismatchField[];
  verdict: 'AUTO_MATCHED' | 'NEEDS_REVIEW';
  matchedAccountId: string | null;
  /** ໂຕເລກ token ທີ່ກົງກັບບັນຊີ (ໃຊ້ເກັບເປັນ receiverAccount). */
  matchedToken: string | null;
}

const digits = (s: string): string => s.replace(/\D/g, '');

/** token ຈາກສະລິບ (ອາດປິດບັງ) ກົງກັບບັນຊີໜຶ່ງບໍ — ປຽບທຽບຫາງເລກ (suffix). */
export function accountMatches(token: string, accountNumber: string): boolean {
  const acct = digits(accountNumber);
  if (token.length < 4 || acct.length < 4) return false;
  return acct === token || acct.endsWith(token) || token.endsWith(acct);
}

function amountMatches(amount: number | null, expected: number[], tolerance: number): boolean {
  if (amount === null) return false;
  // +0.005 ກັນ floating-point ຢູ່ຂອບ tolerance
  return expected.some((e) => Math.abs(amount - e) <= Math.max(tolerance, 0) + 0.005);
}

function timeMatches(p: SlipParsed, billCreatedAt: Date, uploadedAt: Date): boolean {
  if (!p.transferredAt) return false;
  if (p.dateOnly) {
    // ບໍ່ມີເວລາ → ປຽບທຽບເປັນມື້ (ວຽງຈັນ): ຕ້ອງຢູ່ລະຫວ່າງມື້ເປີດບິນ ຫາ ມື້ອັບໂຫຼດ
    const day = vientianeDateKey(p.transferredAt).getTime();
    return day >= vientianeDateKey(billCreatedAt).getTime() && day <= vientianeDateKey(uploadedAt).getTime();
  }
  const t = p.transferredAt.getTime();
  return (
    t >= billCreatedAt.getTime() - SLIP_BEFORE_BILL_GRACE_MS &&
    t <= uploadedAt.getTime() + SLIP_FUTURE_SKEW_MS &&
    uploadedAt.getTime() - t <= SLIP_MAX_AGE_MS
  );
}

/**
 * ການຕັດສິນມາຈາກການປຽບທຽບ ບໍ່ແມ່ນຈາກຂໍ້ຄວາມ (docs §3): ຈຳນວນເງິນ (50) + ບັນຊີປາຍທາງ (30) + ເວລາ (20).
 * AUTO_MATCHED ຕ້ອງຜ່ານທັງ 3 ເກນ **ແລະ** ອ່ານເລກອ້າງອີງໄດ້ (ບໍ່ມີເລກອ້າງອີງ = ກັນສະລິບຊ້ຳບໍ່ໄດ້).
 */
export function evaluateSlip(input: MatchInput): MatchResult {
  const { parsed, expected, accounts } = input;
  const mismatch: MismatchField[] = [];
  let score = 0;

  if (parsed.currency && parsed.currency !== expected.currency) mismatch.push('currency');

  // ສະກຸນເງິນບໍ່ກົງ → ປຽບທຽບຈຳນວນບໍ່ໄດ້ (ບໍ່ນັບເປັນ 'amount' ຊ້ຳ)
  if (!mismatch.includes('currency')) {
    if (amountMatches(parsed.amount, expected.amounts, expected.tolerance)) score += 50;
    else mismatch.push('amount');
  }

  let matchedAccountId: string | null = null;
  let matchedToken: string | null = null;
  outer: for (const acc of accounts) {
    for (const token of parsed.accountTokens) {
      if (accountMatches(token, acc.accountNumber)) {
        matchedAccountId = acc.id;
        matchedToken = token;
        break outer;
      }
    }
  }
  if (matchedAccountId) score += 30;
  else mismatch.push('receiverAccount');

  if (timeMatches(parsed, input.billCreatedAt, input.uploadedAt)) score += 20;
  else mismatch.push('transferredAt');

  if (!parsed.txnRef) mismatch.push('txnRef');

  return {
    matchScore: score,
    mismatchFields: mismatch,
    verdict: mismatch.length === 0 ? 'AUTO_MATCHED' : 'NEEDS_REVIEW',
    matchedAccountId,
    matchedToken,
  };
}
