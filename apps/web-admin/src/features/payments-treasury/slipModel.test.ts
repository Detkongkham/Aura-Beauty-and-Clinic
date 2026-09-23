import type { PaymentSlipView } from '@abcp/shared-types';
import { describe, expect, it } from 'vitest';

import {
  acceptedAmounts,
  agingTone,
  billAfterApprove,
  correctionsFromDraft,
  draftFromSlip,
  filterSlips,
  groupQueue,
  rangeBounds,
  slipChecks,
  slipHeadlineAmount,
  sortSlips,
  waitingMinutes,
} from './slipModel';

function slip(over: Partial<PaymentSlipView> = {}): PaymentSlipView {
  return {
    id: 'a',
    paymentId: 'p',
    branchId: 'b1',
    branchName: 'Main',
    customerName: 'Noy',
    uploadedById: 'u',
    uploadedByName: 'Noy',
    imageUrl: '/x.jpg',
    declaredAmount: null,
    ocrStatus: 'DONE',
    ocrEngine: 'tesseract',
    ocrMs: 900,
    qrPayload: null,
    bankCode: 'BCEL',
    amount: 100000,
    currency: 'LAK',
    txnRef: 'REF123456',
    transferredAt: '2026-09-20T03:00:00.000Z',
    senderName: 'NOY',
    receiverAccount: '0123456789',
    matchScore: 100,
    mismatchFields: [],
    verdict: 'AUTO_MATCHED',
    rejectReason: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: null,
    paymentTransactionId: null,
    ocrError: null,
    ocrConfidence: 90,
    dateOnly: false,
    uploadedByRole: 'CUSTOMER',
    sizeBytes: 100_000,
    riskSignals: [],
    nearDuplicateOfId: null,
    claimedBy: null,
    infoRequestedAt: null,
    infoRequestNote: null,
    rejectCode: null,
    reversedByName: null,
    reversedAt: null,
    reverseReason: null,
    bankProof: { status: 'NO_STATEMENT', refMatched: false, line: null },
    reversal: { allowed: false, blockedReason: 'NOT_APPROVED' },
    updatedAt: '2026-09-20T03:05:00.000Z',
    payment: {
      totalAmount: 100000,
      balanceAmount: 100000,
      currency: 'LAK',
      paidAmount: 0,
      depositAmount: 0,
      depositRemaining: 0,
      status: 'PENDING',
      invoiceNo: null,
      appointmentId: null,
      createdAt: '2026-09-20T02:00:00.000Z',
    },
    bankAccount: null,
    createdAt: '2026-09-20T03:05:00.000Z',
    ...over,
  };
}

describe('slipModel', () => {
  it('queues mismatches before clean auto-matches, oldest first', () => {
    const items = [
      slip({ id: 'auto-new', verdict: 'AUTO_MATCHED', createdAt: '2026-09-20T05:00:00.000Z' }),
      slip({ id: 'needs', verdict: 'NEEDS_REVIEW', createdAt: '2026-09-20T06:00:00.000Z' }),
      slip({ id: 'auto-old', verdict: 'AUTO_MATCHED', createdAt: '2026-09-20T04:00:00.000Z' }),
      slip({ id: 'done', verdict: 'APPROVED' }),
    ];
    expect(filterSlips(items, { view: 'action', branchId: '', q: '' }).map((s) => s.id)).toEqual([
      'needs',
      'auto-old',
      'auto-new',
    ]);
  });

  it('treats DUPLICATE as rejected and filters by branch + search', () => {
    const items = [
      slip({ id: 'dup', verdict: 'DUPLICATE' }),
      slip({ id: 'rej', verdict: 'REJECTED', branchId: 'b2', customerName: 'Somchai' }),
    ];
    expect(filterSlips(items, { view: 'rejected', branchId: '', q: '' })).toHaveLength(2);
    expect(
      filterSlips(items, { view: 'rejected', branchId: 'b2', q: '' }).map((s) => s.id),
    ).toEqual(['rej']);
    expect(filterSlips(items, { view: 'all', branchId: '', q: 'somch' }).map((s) => s.id)).toEqual([
      'rej',
    ]);
  });

  it('headlines the read amount, then declared, then open balance', () => {
    expect(slipHeadlineAmount(slip({ amount: 5 }))).toBe(5);
    expect(slipHeadlineAmount(slip({ amount: null, declaredAmount: 7 }))).toBe(7);
    expect(slipHeadlineAmount(slip({ amount: null, declaredAmount: null }))).toBe(100000);
  });

  it('sends only the fields the reviewer changed', () => {
    const s = slip();
    const d = draftFromSlip(s);
    expect(correctionsFromDraft(s, d)).toBeUndefined();
    expect(correctionsFromDraft(s, { ...d, amount: '120000', txnRef: 'REF123456' })).toEqual({
      amount: 120000,
    });
    // Vientiane wall clock 10:00 → 03:00Z
    const fixed = correctionsFromDraft(s, { ...d, transferredAt: '2026-09-20T11:30' });
    expect(fixed?.transferredAt).toBe('2026-09-20T04:30:00.000Z');
    // invalid edits are ignored rather than sent
    expect(correctionsFromDraft(s, { ...d, amount: '-5', txnRef: 'ab' })).toBeUndefined();
  });

  it('reads the four matcher checks, including unread fields and duplicates', () => {
    const states = (x: PaymentSlipView) => slipChecks(x).map((c) => `${c.key}:${c.state}`);
    expect(states(slip())).toEqual(['amount:pass', 'account:pass', 'time:pass', 'ref:pass']);
    expect(
      states(slip({ verdict: 'NEEDS_REVIEW', mismatchFields: ['amount'], txnRef: null })),
    ).toEqual(['amount:fail', 'account:pass', 'time:pass', 'ref:unread']);
    expect(states(slip({ mismatchFields: ['currency'] }))[0]).toBe('amount:fail');
    expect(states(slip({ receiverAccount: null, mismatchFields: ['receiverAccount'] }))[1]).toBe(
      'account:unread',
    );
    expect(states(slip({ verdict: 'DUPLICATE' }))[3]).toBe('ref:fail');
    expect(
      slipChecks(slip({ ocrStatus: 'PROCESSING', verdict: 'PENDING' })).every(
        (c) => c.state === 'pending',
      ),
    ).toBe(true);
    expect(slipChecks(slip()).reduce((n, c) => n + c.points, 0)).toBe(100);
  });

  it('measures waiting time for open slips only, toned against the SLA', () => {
    const now = new Date('2026-09-20T03:45:00.000Z').getTime();
    expect(waitingMinutes(slip(), now)).toBe(40);
    expect(waitingMinutes(slip({ verdict: 'APPROVED' }), now)).toBeNull();
    expect([agingTone(5, 30), agingTone(15, 30), agingTone(30, 30)]).toEqual([
      'neutral',
      'warning',
      'danger',
    ]);
  });

  it('previews what confirming does to the bill', () => {
    const bill = (o: Partial<PaymentSlipView['payment']>) =>
      slip({
        payment: {
          ...slip().payment,
          totalAmount: 500000,
          balanceAmount: 500000,
          depositAmount: 100000,
          depositRemaining: 100000,
          ...o,
        },
      });
    expect(billAfterApprove(bill({}), 500000)).toEqual({ owedAfter: 0, outcome: 'FULLY_PAID' });
    expect(billAfterApprove(bill({}), 100000)).toEqual({
      owedAfter: 400000,
      outcome: 'DEPOSIT_PAID',
    });
    expect(billAfterApprove(bill({}), 50000).outcome).toBe('PARTIAL');
    expect(billAfterApprove(bill({}), 600000)).toEqual({ owedAfter: -100000, outcome: 'OVERPAID' });
    expect(acceptedAmounts(bill({}))).toEqual([500000, 100000]);
    expect(acceptedAmounts(slip({ declaredAmount: 7 }))).toEqual([7]);
  });

  it('groups the to-do queue by what the reviewer must do, and sorts on request', () => {
    const items = [
      slip({ id: 'p', verdict: 'PENDING' }),
      slip({ id: 'a', verdict: 'AUTO_MATCHED', amount: 9 }),
      slip({ id: 'n', verdict: 'NEEDS_REVIEW', amount: 99, createdAt: '2026-09-20T01:00:00.000Z' }),
    ];
    expect(groupQueue(items).map((g) => g.verdict)).toEqual([
      'NEEDS_REVIEW',
      'AUTO_MATCHED',
      'PENDING',
    ]);
    expect(sortSlips(items, 'all', 'amount').map((s) => s.id)[0]).toBe('p');
    expect(sortSlips(items, 'all', 'oldest').map((s) => s.id)[0]).toBe('n');
  });

  it('turns a date preset into Vientiane day bounds', () => {
    expect(rangeBounds('all', '2026-09-23')).toEqual({});
    expect(rangeBounds('today', '2026-09-23')).toEqual({ from: '2026-09-23', to: '2026-09-23' });
    expect(rangeBounds('7d', '2026-09-23')).toEqual({ from: '2026-09-17', to: '2026-09-23' });
  });
});
