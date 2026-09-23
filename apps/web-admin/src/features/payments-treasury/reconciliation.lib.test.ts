import type { ReconciliationRow, ReconciliationView } from '@abcp/shared-types';
import { describe, expect, it } from 'vitest';

import {
  accountStats,
  daysBetween,
  enumerateDays,
  findTimingPairs,
  matchPreset,
  presetRange,
  reconciliationCsv,
  shiftRange,
  sortAccountsByAttention,
  summarize,
  viewForCurrency,
} from './reconciliation.lib';

const base: Omit<ReconciliationRow, 'date' | 'bankAccountId' | 'status'> = {
  accountName: 'A',
  accountNumber: '1234567',
  bankCode: 'BCEL',
  branchId: 'b',
  branchName: 'Main',
  currency: 'LAK',
  systemCredit: 100,
  systemCreditCount: 1,
  systemDebit: 0,
  systemDebitCount: 0,
  statementId: null,
  statementCredit: null,
  statementDebit: null,
  note: null,
  creditVariance: null,
  debitVariance: null,
  enteredByName: null,
  enteredAt: null,
  systemFee: 0,
  expectedCredit: 100,
  openingBalance: null,
  closingBalance: null,
  balanceGap: null,
  openingGap: null,
  source: 'MANUAL',
  resolution: null,
  resolutionNote: null,
  resolvedByName: null,
  resolvedAt: null,
  lineCount: 0,
  unmatchedLines: 0,
  locked: false,
};

const row = (date: string, acct: string, status: ReconciliationRow['status'], cv: number | null = null): ReconciliationRow => ({
  ...base,
  date,
  bankAccountId: acct,
  status,
  statementId: status === 'UNRECONCILED' ? null : 'st',
  statementCredit: status === 'UNRECONCILED' ? null : 100 + (cv ?? 0),
  statementDebit: status === 'UNRECONCILED' ? null : 0,
  creditVariance: status === 'UNRECONCILED' ? null : cv ?? 0,
  debitVariance: status === 'UNRECONCILED' ? null : 0,
});

const view = (rows: ReconciliationRow[]): ReconciliationView => ({
  from: '2026-09-01',
  to: '2026-09-10',
  rows,
  totals: { systemCredit: 0, systemDebit: 0, systemFee: 0, statementCredit: 0, statementDebit: 0, matched: 0, variance: 0, resolved: 0, unreconciled: 0 },
  totalsByCurrency: {},
  periods: [],
  openSlips: 0,
  issues: [],
  accounts: [],
});

describe('reconciliation.lib', () => {
  it('presets: last month spans the whole previous calendar month', () => {
    expect(presetRange('lastMonth', '2026-03-15')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(presetRange('d7', '2026-09-21')).toEqual({ from: '2026-09-15', to: '2026-09-21' });
    expect(matchPreset('2026-09-01', '2026-09-21', '2026-09-21')).toBe('month');
    expect(matchPreset('2026-09-02', '2026-09-21', '2026-09-21')).toBeNull();
  });

  it('shiftRange slides by the window length and never passes today', () => {
    expect(shiftRange('2026-09-08', '2026-09-14', -1, '2026-09-21')).toEqual({ from: '2026-09-01', to: '2026-09-07' });
    expect(shiftRange('2026-09-08', '2026-09-14', 1, '2026-09-18')).toEqual({ from: '2026-09-12', to: '2026-09-18' });
    expect(daysBetween('2026-09-01', '2026-09-01')).toBe(1);
    expect(enumerateDays('2026-09-01', '2026-09-03')).toEqual(['2026-09-03', '2026-09-02', '2026-09-01']);
  });

  it('summarize: accuracy counts only checked days; oldest open and largest gap are found', () => {
    const s = summarize(
      view([
        row('2026-09-05', 'a', 'MATCHED'),
        row('2026-09-04', 'a', 'VARIANCE', 50),
        row('2026-09-03', 'b', 'VARIANCE', -200),
        row('2026-09-02', 'b', 'UNRECONCILED'),
        row('2026-09-06', 'a', 'UNRECONCILED'),
      ]),
    );
    expect(s).toMatchObject({ matched: 1, variance: 2, unreconciled: 2, accuracyPct: 33, coveragePct: 60, absVariance: 250, netCreditVariance: -150, unverifiedCredit: 200 });
    expect(s.oldestUnreconciled?.date).toBe('2026-09-02');
    expect(s.largestVariance?.date).toBe('2026-09-03');
    expect(summarize(view([])).accuracyPct).toBeNull();
  });

  it('accountStats groups rows, and attention sort puts differences first', () => {
    const stats = sortAccountsByAttention(
      accountStats(view([row('2026-09-05', 'a', 'MATCHED'), row('2026-09-04', 'b', 'VARIANCE', 10), row('2026-09-03', 'b', 'UNRECONCILED')])),
    );
    expect(stats.map((a) => a.bankAccountId)).toEqual(['b', 'a']);
    expect(stats[0]).toMatchObject({ variance: 1, unreconciled: 1, absVariance: 10 });
    expect(stats[0]!.byDate.get('2026-09-04')?.status).toBe('VARIANCE');
  });

  it('CSV quotes cells that contain commas or quotes', () => {
    const csv = reconciliationCsv([{ ...row('2026-09-05', 'a', 'VARIANCE', 5), note: 'fee, "late"' }]);
    const [head, line] = csv.split('\n');
    expect(head!.startsWith('date,bank,account_name')).toBe(true);
    expect(line).toContain('"fee, ""late"""');
  });

  it('G8 — pairs −x / +x on adjacent days of one account as a timing difference', () => {
    const pairs = findTimingPairs([
      row('2026-09-04', 'a', 'VARIANCE', -300),
      row('2026-09-05', 'a', 'VARIANCE', 300),
      row('2026-09-05', 'b', 'VARIANCE', 300),
      row('2026-09-07', 'a', 'VARIANCE', -50),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ amount: 300, a: { date: '2026-09-04' }, b: { date: '2026-09-05', bankAccountId: 'a' } });
  });

  it('G6 — narrowing to a currency never mixes totals', () => {
    const v = { ...view([row('2026-09-05', 'a', 'MATCHED'), { ...row('2026-09-05', 'u', 'MATCHED'), currency: 'USD' }]) };
    v.totalsByCurrency = { USD: { ...v.totals, systemCredit: 42 } };
    const usd = viewForCurrency(v, 'USD')!;
    expect(usd.rows.map((r) => r.bankAccountId)).toEqual(['u']);
    expect(usd.totals.systemCredit).toBe(42);
    expect(summarize(v).resolved).toBe(0);
  });
});
