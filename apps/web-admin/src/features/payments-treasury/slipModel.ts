import { BLOCKING_RISK_SIGNALS } from '@abcp/shared-types';
import type {
  PaymentSlipView,
  SlipCorrectedFields,
  SlipFlag,
  SlipRejectCode,
  SlipRiskSignal,
  SlipVerdict,
} from '@abcp/shared-types';

import { APP_TIMEZONE } from '@/lib/constants';
import { dayjs } from '@/lib/format';

import type { Tone } from '@/features/payroll/payroll.lib';

import { OPEN_VERDICTS, expectedAmount } from './treasury.lib';

export type SlipView = 'action' | 'approved' | 'rejected' | 'all';
export const SLIP_VIEWS: SlipView[] = ['action', 'approved', 'rejected', 'all'];

export function matchesSlipView(s: PaymentSlipView, view: SlipView): boolean {
  switch (view) {
    case 'action':
      return OPEN_VERDICTS.includes(s.verdict);
    case 'approved':
      return s.verdict === 'APPROVED';
    case 'rejected':
      return s.verdict === 'REJECTED' || s.verdict === 'DUPLICATE' || s.verdict === 'REVERSED';
    default:
      return true;
  }
}

/** Reviewer's queue first: mismatches (need eyes) → auto-matched (one click) → processing; oldest first inside a bucket. */
const ACTION_RANK: Record<string, number> = { NEEDS_REVIEW: 0, AUTO_MATCHED: 1, PENDING: 2 };

export type SlipSort = 'queue' | 'newest' | 'oldest' | 'amount';
export const SLIP_SORTS: SlipSort[] = ['queue', 'newest', 'oldest', 'amount'];

export function sortSlips(
  items: PaymentSlipView[],
  view: SlipView,
  sort: SlipSort = 'queue',
): PaymentSlipView[] {
  return [...items].sort((a, b) => {
    if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt);
    if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt);
    if (sort === 'amount') return slipHeadlineAmount(b) - slipHeadlineAmount(a);
    if (view === 'action') {
      const r = (ACTION_RANK[a.verdict] ?? 9) - (ACTION_RANK[b.verdict] ?? 9);
      if (r !== 0) return r;
      return a.createdAt.localeCompare(b.createdAt);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function filterSlips(
  items: PaymentSlipView[],
  f: { view: SlipView; branchId: string; q: string },
): PaymentSlipView[] {
  const needle = f.q.trim().toLowerCase();
  return sortSlips(
    items.filter(
      (s) =>
        matchesSlipView(s, f.view) &&
        (!f.branchId || s.branchId === f.branchId) &&
        (!needle ||
          [s.customerName, s.uploadedByName, s.txnRef, s.senderName, s.branchName]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(needle)),
    ),
    f.view,
  );
}

/** Amount the row should headline: what OCR read, else what was declared, else the bill's open balance. */
export function slipHeadlineAmount(s: PaymentSlipView): number {
  return s.amount ?? expectedAmount(s);
}

export interface SlipDraft {
  bankCode: string;
  amount: string;
  txnRef: string;
  /** `YYYY-MM-DDTHH:mm` in Vientiane wall-clock, as a datetime-local input holds it. */
  transferredAt: string;
  receiverAccount: string;
  senderName: string;
}

export function draftFromSlip(s: PaymentSlipView): SlipDraft {
  return {
    bankCode: s.bankCode ?? '',
    amount: s.amount != null ? String(s.amount) : '',
    txnRef: s.txnRef ?? '',
    transferredAt: s.transferredAt
      ? dayjs(s.transferredAt).tz(APP_TIMEZONE).format('YYYY-MM-DDTHH:mm')
      : '',
    receiverAccount: s.receiverAccount ?? '',
    senderName: s.senderName ?? '',
  };
}

/** Only the fields the reviewer actually changed — untouched OCR values are not re-sent. */
export function correctionsFromDraft(
  s: PaymentSlipView,
  d: SlipDraft,
): SlipCorrectedFields | undefined {
  const base = draftFromSlip(s);
  const out: SlipCorrectedFields = {};
  if (d.bankCode.trim() && d.bankCode.trim() !== base.bankCode) out.bankCode = d.bankCode.trim();
  const amount = Number(d.amount);
  if (d.amount.trim() && Number.isFinite(amount) && amount > 0 && d.amount.trim() !== base.amount) {
    out.amount = amount;
  }
  if (d.txnRef.trim().length >= 4 && d.txnRef.trim() !== base.txnRef) out.txnRef = d.txnRef.trim();
  if (d.transferredAt && d.transferredAt !== base.transferredAt) {
    const at = dayjs.tz(d.transferredAt, APP_TIMEZONE);
    if (at.isValid()) out.transferredAt = at.toISOString();
  }
  if (d.receiverAccount.trim() && d.receiverAccount.trim() !== base.receiverAccount) {
    out.receiverAccount = d.receiverAccount.trim();
  }
  if (d.senderName.trim() && d.senderName.trim() !== base.senderName)
    out.senderName = d.senderName.trim();
  return Object.keys(out).length > 0 ? out : undefined;
}

// ── Page model (redesign 2026-09-23) ─────────────────────────────────

export const SLIP_FLAGS: SlipFlag[] = [
  'amount',
  'receiverAccount',
  'transferredAt',
  'txnRef',
  'ocrFailed',
  'duplicate',
  'risk',
  'infoRequested',
];

export type CheckKey = 'amount' | 'account' | 'time' | 'ref';
export type CheckState = 'pass' | 'fail' | 'unread' | 'pending';
export interface SlipCheck {
  key: CheckKey;
  /** Points this check contributes to the 100-point match score (ref is a gate, 0 points). */
  points: number;
  state: CheckState;
}

/**
 * The matcher's four rules, as the reviewer should read them (mirrors backend `evaluateSlip`):
 * amount 50 + receiving account 30 + transfer time 20, and a readable reference that is a gate for
 * auto-match (without it, duplicates can't be caught).
 */
export function slipChecks(s: PaymentSlipView): SlipCheck[] {
  if (s.ocrStatus === 'PENDING' || s.ocrStatus === 'PROCESSING') {
    return [
      { key: 'amount', points: 50, state: 'pending' },
      { key: 'account', points: 30, state: 'pending' },
      { key: 'time', points: 20, state: 'pending' },
      { key: 'ref', points: 0, state: 'pending' },
    ];
  }
  const bad = new Set<string>(s.mismatchFields);
  const state = (read: unknown, failed: boolean): CheckState =>
    read == null ? 'unread' : failed ? 'fail' : 'pass';
  return [
    {
      key: 'amount',
      points: 50,
      state: bad.has('currency') ? 'fail' : state(s.amount, bad.has('amount')),
    },
    { key: 'account', points: 30, state: state(s.receiverAccount, bad.has('receiverAccount')) },
    { key: 'time', points: 20, state: state(s.transferredAt, bad.has('transferredAt')) },
    { key: 'ref', points: 0, state: s.verdict === 'DUPLICATE' ? 'fail' : state(s.txnRef, false) },
  ];
}

export const CHECK_TONE: Record<CheckState, Tone> = {
  pass: 'success',
  fail: 'danger',
  unread: 'warning',
  pending: 'neutral',
};

export function isOpen(s: Pick<PaymentSlipView, 'verdict'>): boolean {
  return OPEN_VERDICTS.includes(s.verdict);
}

/** Whole minutes the slip has been waiting (open slips only; null once decided). */
export function waitingMinutes(
  s: Pick<PaymentSlipView, 'verdict' | 'createdAt'>,
  now = Date.now(),
): number | null {
  if (!isOpen(s)) return null;
  return Math.max(0, Math.floor((now - new Date(s.createdAt).getTime()) / 60_000));
}

/** Waiting-time tone against the review SLA: calm → half-way → breached. */
export function agingTone(minutes: number, slaMinutes: number): Tone {
  if (minutes >= slaMinutes) return 'danger';
  if (minutes >= slaMinutes / 2) return 'warning';
  return 'neutral';
}

/** Amounts the matcher accepts: the declared amount, else the open balance and any unpaid deposit. */
export function acceptedAmounts(s: PaymentSlipView): number[] {
  if (s.declaredAmount != null) return [s.declaredAmount];
  const out = [s.payment.balanceAmount];
  if (s.payment.depositRemaining > 0 && s.payment.depositRemaining !== s.payment.balanceAmount) {
    out.push(s.payment.depositRemaining);
  }
  return out;
}

export type BillOutcome = 'FULLY_PAID' | 'DEPOSIT_PAID' | 'PARTIAL' | 'OVERPAID';

/** What the bill looks like if this slip is confirmed for `amount`. */
export function billAfterApprove(
  s: PaymentSlipView,
  amount: number,
): { owedAfter: number; outcome: BillOutcome } {
  const owedAfter = Math.round((s.payment.balanceAmount - amount) * 100) / 100;
  if (owedAfter < -0.01) return { owedAfter, outcome: 'OVERPAID' };
  if (owedAfter <= 0.01) return { owedAfter: 0, outcome: 'FULLY_PAID' };
  const paidAfter = s.payment.paidAmount + amount;
  if (s.payment.depositAmount > 0 && paidAfter + 0.01 >= s.payment.depositAmount)
    return { owedAfter, outcome: 'DEPOSIT_PAID' };
  return { owedAfter, outcome: 'PARTIAL' };
}

/** Queue buckets for the "to do" view, in working order. */
export const QUEUE_GROUPS: SlipVerdict[] = ['NEEDS_REVIEW', 'AUTO_MATCHED', 'PENDING'];

export function groupQueue(
  items: PaymentSlipView[],
): { verdict: SlipVerdict; items: PaymentSlipView[] }[] {
  return QUEUE_GROUPS.map((verdict) => ({
    verdict,
    items: items.filter((s) => s.verdict === verdict),
  })).filter((g) => g.items.length > 0);
}

/** One-tap reject reasons — each fills the reason box (still editable) and sends its code (S8). */
export const REJECT_PRESETS = [
  'amountShort',
  'wrongAccount',
  'unreadable',
  'duplicate',
  'notReceived',
  'oldSlip',
  'suspectedFake',
] as const;
export type RejectPreset = (typeof REJECT_PRESETS)[number];
export const REJECT_CODE: Record<RejectPreset, SlipRejectCode> = {
  amountShort: 'AMOUNT_SHORT',
  wrongAccount: 'WRONG_ACCOUNT',
  unreadable: 'UNREADABLE',
  duplicate: 'DUPLICATE',
  notReceived: 'NOT_RECEIVED',
  oldSlip: 'OLD_SLIP',
  suspectedFake: 'SUSPECTED_FAKE',
};

/** Blocking risk signals present on a slip (they keep it out of auto-match and bulk confirm). */
export function blockingRisks(s: Pick<PaymentSlipView, 'riskSignals'>): SlipRiskSignal[] {
  return s.riskSignals.filter((x) => BLOCKING_RISK_SIGNALS.includes(x));
}

/** S5 — someone else holds a live claim on this slip. */
export function claimedByOther(s: Pick<PaymentSlipView, 'claimedBy'>, meId: string | undefined): boolean {
  return Boolean(s.claimedBy && s.claimedBy.id !== meId);
}

/** Date presets for the upload-date filter (Vientiane days). */
export type SlipRange = 'all' | 'today' | '7d' | '30d';
export const SLIP_RANGES: SlipRange[] = ['all', 'today', '7d', '30d'];

export function rangeBounds(range: SlipRange, today: string): { from?: string; to?: string } {
  if (range === 'all') return {};
  const days = range === 'today' ? 0 : range === '7d' ? 6 : 29;
  return { from: dayjs(today, 'YYYY-MM-DD').subtract(days, 'day').format('YYYY-MM-DD'), to: today };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
