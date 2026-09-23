import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import sharp from 'sharp';
import {
  detectBankCode,
  extractAccountTokens,
  parseMoney,
  parseSlipText,
} from '../../src/modules/payments-treasury/slips/parser.js';
import { accountMatches, evaluateSlip } from '../../src/modules/payments-treasury/slips/matcher.js';
import { decodeQr, parseQrPayload } from '../../src/modules/payments-treasury/slips/ocr/qr.js';

/** Unit — Module 39 W3: parser / matcher / QR ຂອງສະລິບ (pure, ບໍ່ຕ້ອງ DB). */

describe('slip parser', () => {
  it('parseMoney: ຮູບແບບຕົວແຍກຫຼັກພັນ/ທົດສະນິຍົມທີ່ພົບໃນສະລິບລາວ', () => {
    expect(parseMoney('150,000')).toBe(150000);
    expect(parseMoney('150.000')).toBe(150000);
    expect(parseMoney('150,000.00')).toBe(150000);
    expect(parseMoney('1.500.000,50')).toBe(1500000.5);
    expect(parseMoney('75000')).toBe(75000);
    expect(parseMoney('abc')).toBeNull();
  });

  const text = [
    'BCEL One',
    'Transfer Successful',
    'Fee: 0 LAK',
    'Amount: 150,000 LAK',
    'Balance: 5,000,000 LAK',
    'To: 010120001234567',
    'From: Somchai',
    'Reference No: 2026092012345678',
    'Date: 20/09/2026 10:30',
  ].join('\n');

  it('ດຶງ field ຫຼັກຈາກຂໍ້ຄວາມສະລິບ (ຈຳນວນເງິນບໍ່ຫຼົງໄປຫາ Balance)', () => {
    const p = parseSlipText(text);
    expect(p.bankCode).toBe('BCEL');
    expect(p.amount).toBe(150000);
    expect(p.currency).toBe('LAK');
    expect(p.txnRef).toBe('2026092012345678');
    expect(p.senderName).toBe('Somchai');
    // 10:30 ວຽງຈັນ (UTC+7) = 03:30 UTC
    expect(p.transferredAt?.toISOString()).toBe('2026-09-20T03:30:00.000Z');
    expect(p.dateOnly).toBe(false);
    expect(p.accountTokens).toContain('010120001234567');
  });

  it('ວັນທີແບບ ISO / "20 Sep 2026" / mm/dd ທີ່ເດືອນ > 12 / ມີແຕ່ວັນທີ', () => {
    expect(parseSlipText('2026-09-20 14:05:09').transferredAt?.toISOString()).toBe('2026-09-20T07:05:09.000Z');
    expect(parseSlipText('20 Sep 2026 9:15 PM').transferredAt?.toISOString()).toBe('2026-09-20T14:15:00.000Z');
    expect(parseSlipText('09/20/2026 10:00').transferredAt?.toISOString()).toBe('2026-09-20T03:00:00.000Z');
    const d = parseSlipText('Date 20/09/2026');
    expect(d.dateOnly).toBe(true);
    expect(d.transferredAt).not.toBeNull();
  });

  it('QR ມີຄວາມສຳຄັນກວ່າ OCR ສຳລັບ reference/amount', () => {
    const p = parseSlipText('Amount: 999 LAK\nRef: ABCDEF1234', { reference: 'QR-REF-001', amount: 150000 });
    expect(p.txnRef).toBe('QR-REF-001');
    expect(p.amount).toBe(150000);
  });

  it('ບໍ່ຈັບຄຳວ່າ "Reference" ເປັນເລກອ້າງອີງ ແລະ ບໍ່ເດົາຈາກເລກບັນຊີ', () => {
    expect(parseSlipText('Reference number\nAmount 1,000 LAK').txnRef).toBeNull();
  });

  it('detectBankCode + extractAccountTokens (ເລກແບບປິດບັງ)', () => {
    expect(detectBankCode('Lao Development Bank')).toBe('LDB');
    expect(detectBankCode('random text')).toBeNull();
    expect(extractAccountTokens('To: XXX-XXXX-4567\nDate 20/09/2026')).toEqual(['4567']);
    expect(extractAccountTokens('Time 10:30')).toEqual([]);
  });
});

describe('slip matcher', () => {
  const base = {
    billCreatedAt: new Date('2026-09-20T03:00:00Z'),
    uploadedAt: new Date('2026-09-20T03:40:00Z'),
    accounts: [{ id: 'acc-1', accountNumber: '010120001234567' }],
    expected: { amounts: [150000], currency: 'LAK', tolerance: 0 },
  };
  const good = parseSlipText(
    ['Amount: 150,000 LAK', 'To: 010120001234567', 'Ref: 20260920123456', 'Date: 20/09/2026 10:30'].join('\n'),
  );

  it('ຜ່ານທັງ 3 ເກນ + ມີ txnRef → AUTO_MATCHED (100)', () => {
    const r = evaluateSlip({ ...base, parsed: good });
    expect(r).toMatchObject({ verdict: 'AUTO_MATCHED', matchScore: 100, mismatchFields: [], matchedAccountId: 'acc-1' });
  });

  it('ຈຳນວນບໍ່ກົງ → NEEDS_REVIEW ແລະ ຊີ້ field', () => {
    const r = evaluateSlip({ ...base, parsed: { ...good, amount: 140000 } });
    expect(r.verdict).toBe('NEEDS_REVIEW');
    expect(r.mismatchFields).toEqual(['amount']);
    expect(r.matchScore).toBe(50);
  });

  it('tolerance ຍອມຮັບສ່ວນຕ່າງ', () => {
    const p = { ...good, amount: 149500 };
    expect(evaluateSlip({ ...base, parsed: p }).verdict).toBe('NEEDS_REVIEW');
    expect(evaluateSlip({ ...base, expected: { ...base.expected, tolerance: 500 }, parsed: p }).verdict).toBe('AUTO_MATCHED');
  });

  it('ບັນຊີປາຍທາງຜິດ / ສະກຸນເງິນຜິດ / ບໍ່ມີ txnRef', () => {
    expect(evaluateSlip({ ...base, parsed: { ...good, accountTokens: ['999999999'] } }).mismatchFields).toEqual([
      'receiverAccount',
    ]);
    expect(evaluateSlip({ ...base, parsed: { ...good, currency: 'THB' } }).mismatchFields).toEqual(['currency']);
    const r = evaluateSlip({ ...base, parsed: { ...good, txnRef: null } });
    expect(r.mismatchFields).toEqual(['txnRef']);
    expect(r.verdict).toBe('NEEDS_REVIEW');
    expect(r.matchScore).toBe(100);
  });

  it('ເວລາ: ສະລິບເກົ່າກ່ອນເປີດບິນ / ເກົ່າກວ່າ 24 ຊມ. / ໃນອະນາຄົດ → ບໍ່ຜ່ານ', () => {
    const at = (iso: string) => ({ ...good, transferredAt: new Date(iso) });
    expect(evaluateSlip({ ...base, parsed: at('2026-09-19T03:00:00Z') }).mismatchFields).toEqual(['transferredAt']);
    expect(evaluateSlip({ ...base, parsed: at('2026-09-20T02:00:00Z') }).mismatchFields).toEqual(['transferredAt']);
    expect(evaluateSlip({ ...base, parsed: at('2026-09-20T05:00:00Z') }).mismatchFields).toEqual(['transferredAt']);
  });

  it('ມີແຕ່ວັນທີ → ປຽບທຽບເປັນມື້ (ວຽງຈັນ)', () => {
    const dateOnly = parseSlipText(
      ['Amount: 150,000 LAK', 'To: 010120001234567', 'Ref: 20260920123456', 'Date: 20/09/2026'].join('\n'),
    );
    expect(evaluateSlip({ ...base, parsed: dateOnly }).verdict).toBe('AUTO_MATCHED');
    const yesterday = { ...dateOnly, transferredAt: new Date('2026-09-18T17:00:00Z') };
    expect(evaluateSlip({ ...base, parsed: yesterday }).mismatchFields).toEqual(['transferredAt']);
  });

  it('accountMatches: ຫາງເລກ/ແບບປິດບັງ, ບໍ່ຈັບ token ສັ້ນ', () => {
    expect(accountMatches('010120001234567', '010-1200-01234567')).toBe(true);
    expect(accountMatches('4567', '010120001234567')).toBe(true);
    expect(accountMatches('4568', '010120001234567')).toBe(false);
    expect(accountMatches('567', '010120001234567')).toBe(false);
  });
});

describe('slip QR', () => {
  it('parseQrPayload: EMV TLV (amount + reference) ແລະ URL ກວດສອບ', () => {
    // TLV: 00="01", 01="11", 54=amount "150000", 62 › 05=reference "123456"
    expect(parseQrPayload('000201010211540615000062100506123456')).toEqual({ amount: 150000, reference: '123456' });
    expect(parseQrPayload('https://verify.example-bank.la/slip?ref=TXN20260920A1')).toEqual({ reference: 'TXN20260920A1' });
    expect(parseQrPayload('https://verify.example-bank.la/s/ABCDEFGH12345')).toEqual({ reference: 'ABCDEFGH12345' });
    expect(parseQrPayload('hello')).toEqual({});
  });

  it('decodeQr: ອ່ານ QR ທີ່ຝັງໃນຮູບສະລິບ; ຮູບບໍ່ມີ QR → null', async () => {
    const qr = await QRCode.toBuffer('https://verify.example-bank.la/slip?ref=TXN20260920A1', { width: 300, margin: 2 });
    const slip = await sharp({ create: { width: 800, height: 900, channels: 3, background: '#ffffff' } })
      .composite([{ input: qr, top: 500, left: 250 }])
      .png()
      .toBuffer();
    expect(await decodeQr(slip)).toBe('https://verify.example-bank.la/slip?ref=TXN20260920A1');
    const blank = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#ffffff' } }).png().toBuffer();
    expect(await decodeQr(blank)).toBeNull();
  });
});
