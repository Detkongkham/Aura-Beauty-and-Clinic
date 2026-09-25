import type { PurchaseOrderItemView } from '@abcp/shared-types';
import { describe, expect, it } from 'vitest';
import {
  buildReceiptLines,
  countedProgress,
  daysBetweenIso,
  dirtyCountLines,
  expiryTone,
  initialReceiveDraft,
  isValidIsoDate,
  maskIsoDate,
  normalizeScannedCode,
  parseQty,
  receiveFactor,
  validateAdjust,
  validateReceiveLine,
} from '../src/features/inventory/inventory.logic';

const item = (over: Partial<PurchaseOrderItemView> = {}): PurchaseOrderItemView => ({
  id: 'i1',
  productId: 'p1',
  productName: 'Serum',
  sku: 'SR-1',
  unit: 'pcs',
  quantity: 24,
  unitCost: 1000,
  lineTotal: 24000,
  uomId: 'box',
  uomCode: 'box',
  factorToBase: 12,
  uomQty: 2,
  uomUnitCost: 12000,
  trackLot: false,
  lotNumber: null,
  expiryDate: null,
  mfgDate: null,
  qtyReceived: 12,
  qtyRejected: 0,
  qtyOutstanding: 12,
  ...over,
});

describe('inventory logic', () => {
  it('normalizes scanned codes', () => {
    expect(normalizeScannedCode(' 8851234567890\n')).toBe('8851234567890');
    expect(normalizeScannedCode('')).toBeNull();
    expect(normalizeScannedCode('x'.repeat(65))).toBeNull();
  });

  it('parses quantities', () => {
    expect(parseQty('')).toBeNull();
    expect(parseQty('2,5')).toBe(2.5);
    expect(parseQty('1.')).toBe(1);
    expect(Number.isNaN(parseQty('abc') as number)).toBe(true);
  });

  it('colours expiry by days left', () => {
    expect(expiryTone(-1)).toBe('destructive');
    expect(expiryTone(60)).toBe('warning');
    expect(expiryTone(61)).toBe('success');
    expect(expiryTone(null)).toBe('neutral');
  });

  it('masks and validates ISO dates', () => {
    expect(maskIsoDate('20270131')).toBe('2027-01-31');
    expect(maskIsoDate('2027-1')).toBe('2027-1');
    expect(isValidIsoDate('2027-02-29')).toBe(false);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(daysBetweenIso('2026-09-26', '2026-10-01')).toBe(5);
  });

  it('only sends changed, valid count lines', () => {
    const lines = [
      { id: 'a', countedQty: null },
      { id: 'b', countedQty: 3 },
      { id: 'c', countedQty: 5 },
      { id: 'd', countedQty: 1 },
    ];
    const drafts = { a: '4', b: '3', c: 'x', d: '' };
    expect(dirtyCountLines(lines, drafts)).toEqual([
      { lineId: 'a', countedQty: 4 },
      { lineId: 'd', countedQty: null },
    ]);
    expect(countedProgress(lines, drafts)).toEqual({ counted: 2, total: 4 });
  });

  it('requires notes for high-risk adjust reasons and a lot when adding tracked stock', () => {
    const base = { direction: 'deduct' as const, qtyText: '2', notes: '', trackLot: false, lotNumber: '', expiry: '' };
    expect(validateAdjust({ ...base, reason: null })).toBe('reason');
    expect(validateAdjust({ ...base, reason: 'LOST_OR_THEFT' })).toBe('notes');
    expect(validateAdjust({ ...base, reason: 'DAMAGED' })).toBeNull();
    expect(validateAdjust({ ...base, qtyText: '0', reason: 'DAMAGED' })).toBe('qty');
    expect(validateAdjust({ ...base, direction: 'add', trackLot: true, reason: 'OTHER', notes: 'x' })).toBe('lot');
  });

  it('builds receipt lines in the chosen unit', () => {
    const it1 = item();
    const draft = initialReceiveDraft(it1);
    expect(draft.received).toBe('1'); // 12 pcs outstanding = 1 box
    expect(receiveFactor(it1, undefined, [])).toBe(12);
    expect(receiveFactor(it1, null, [])).toBe(1);
    const lines = buildReceiptLines([it1], {
      i1: { ...draft, uomId: null, received: '10', rejected: '2', rejectReason: 'broken' },
    });
    expect(lines).toEqual([
      { poItemId: 'i1', qtyReceived: 10, qtyRejected: 2, rejectReason: 'broken', uomId: null },
    ]);
  });

  it('validates tracked receipt lines', () => {
    const tracked = item({ trackLot: true });
    const d = initialReceiveDraft(tracked);
    expect(validateReceiveLine(tracked, d)).toBe('lot');
    expect(validateReceiveLine(tracked, { ...d, lotNumber: 'L1', expiryDate: '2027-13-01' })).toBe('expiry');
    expect(validateReceiveLine(tracked, { ...d, rejected: '1' , lotNumber: 'L1' })).toBe('rejectReason');
  });
});
