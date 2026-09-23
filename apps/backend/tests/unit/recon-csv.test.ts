import { describe, expect, it } from 'vitest';
import { detectMapping, parseAmount, parseCsv, parseStatement, parseStatementDate } from '../../src/modules/payments-treasury/reconciliation/csv.js';
import { pickCandidate } from '../../src/modules/payments-treasury/reconciliation/matcher.js';

describe('reconciliation CSV parser', () => {
  it('parses quoted fields, semicolons and a BOM', () => {
    expect(parseCsv('﻿a;"b;c";d\n1;"x ""y""";3\n\n')).toEqual([
      ['a', 'b;c', 'd'],
      ['1', 'x "y"', '3'],
    ]);
  });

  it('parses amounts in the formats banks use', () => {
    expect(parseAmount('1,234,500.00')).toEqual({ value: 1234500, hint: null });
    expect(parseAmount('(5,000)')?.value).toBe(-5000);
    expect(parseAmount('5,000-')?.value).toBe(-5000);
    expect(parseAmount('1.234.567,89')?.value).toBe(1234567.89);
    expect(parseAmount('12,000 DR')).toEqual({ value: 12000, hint: 'DR' });
    expect(parseAmount('₭ 50,000')?.value).toBe(50000);
    expect(parseAmount('')).toBeNull();
  });

  it('parses dates in DMY / YMD / MDY / month names and treats times as Vientiane', () => {
    expect(parseStatementDate('21/09/2026', 'DMY')).toEqual({ date: '2026-09-21', postedAt: null });
    expect(parseStatementDate('2026-09-21 08:30', 'DMY')).toEqual({ date: '2026-09-21', postedAt: '2026-09-21T01:30:00.000Z' });
    expect(parseStatementDate('09/21/26', 'MDY')?.date).toBe('2026-09-21');
    expect(parseStatementDate('21-Sep-2026', 'DMY')?.date).toBe('2026-09-21');
    expect(parseStatementDate('31/02/2026', 'DMY')).toBeNull();
    expect(parseStatementDate('21/09/2026', 'DMY', '11:15 PM')?.postedAt).toBe('2026-09-21T16:15:00.000Z');
  });

  it('detects Lao headers and a signed amount column', () => {
    const rows = parseCsv('ວັນທີ,ລາຍລະອຽດ,ຈຳນວນເງິນ,ຍອດຄົງເຫຼືອ\n01/09/2026,ໂອນເຂົ້າ,"100,000","600,000"\n01/09/2026,ຄ່າທຳນຽມ,-2000,"598,000"');
    const m = detectMapping(rows)!;
    expect(m).toMatchObject({ date: 0, description: 1, amount: 2, balance: 3, headerRow: 0 });
    const out = parseStatement(rows, m);
    expect(out.lines.map((l) => [l.direction, l.amount])).toEqual([
      ['CREDIT', 100000],
      ['DEBIT', 2000],
    ]);
  });
});

describe('reconciliation matcher', () => {
  const line = { id: 'l', direction: 'CREDIT' as const, amount: 100, statementDate: '2026-09-10', postedAt: null, reference: null, description: null };
  const cand = (id: string, dateKey: string, refs: string[] = []) => ({ kind: 'TX' as const, id, amount: 100, netAmount: 100, at: new Date(`${dateKey}T05:00:00Z`), dateKey, refs });

  it('refuses to guess between two identical candidates', () => {
    expect(pickCandidate(line, [cand('a', '2026-09-10'), cand('b', '2026-09-10')])).toBeNull();
  });
  it('a reference hit wins, and same day beats next day', () => {
    expect(pickCandidate({ ...line, description: 'FT from REFX1' }, [cand('a', '2026-09-10'), cand('b', '2026-09-10', ['REFX1'])])?.id).toBe('b');
    expect(pickCandidate(line, [cand('a', '2026-09-11'), cand('b', '2026-09-10')])?.id).toBe('b');
  });
  it('ignores candidates more than a day away or with a different amount', () => {
    expect(pickCandidate(line, [cand('a', '2026-09-13'), { ...cand('b', '2026-09-10'), amount: 99, netAmount: 99 }])).toBeNull();
  });
});
