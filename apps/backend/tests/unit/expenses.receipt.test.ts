import { describe, expect, it } from 'vitest';
import { extractDate, parseReceiptText } from '../../src/modules/expenses/receipt.js';

const TODAY = new Date('2026-09-21T00:00:00Z');

describe('receipt parser (E7)', () => {
  it('takes the grand total, not the subtotal or VAT line', () => {
    const r = parseReceiptText(['ABC MART', 'Subtotal 90,000', 'VAT 10% 9,000', 'Grand Total 99,000', 'Cash 100,000'].join('\n'), TODAY);
    expect(r).toMatchObject({ total: 99_000, taxAmount: 9_000, vendor: 'ABC MART' });
  });

  it('reads a total printed on the line after its label', () => {
    expect(parseReceiptText('Shop\nTOTAL\n1.250.000 KIP', TODAY)).toMatchObject({ total: 1_250_000, currency: 'LAK' });
  });

  it('reads Lao labels', () => {
    const r = parseReceiptText('ຮ້ານ ສົມໃຈ\nເລກທີ: 00123A\nລວມທັງໝົດ 45,000 ກີບ', TODAY);
    expect(r).toMatchObject({ total: 45_000, invoiceNumber: '00123A', currency: 'LAK' });
  });

  it('does not guess a total when two large numbers tie', () => {
    expect(parseReceiptText('Item 50,000\nItem 50,000', TODAY).total).toBeNull();
  });

  it('dates: dd/mm/yyyy, ISO, two-digit year; rejects future and impossible dates', () => {
    expect(extractDate('Date 05/09/2026', TODAY)).toBe('2026-09-05');
    expect(extractDate('2026-08-31 10:22', TODAY)).toBe('2026-08-31');
    expect(extractDate('1/2/26', TODAY)).toBe('2026-02-01');
    expect(extractDate('31/02/2026', TODAY)).toBeNull();
    expect(extractDate('01/12/2027', TODAY)).toBeNull();
  });

  it('ignores an invoice token with no digits', () => {
    expect(parseReceiptText('Receipt: THANKYOU\nTotal 10,000', TODAY).invoiceNumber).toBeNull();
  });
});
