import type { BankAccountInsight, BankAccountView, PaymentProviderView } from '@abcp/shared-types';
import { describe, expect, it } from 'vitest';

import {
  accountIssues,
  channelHealth,
  deltaPct,
  groupAccountNumber,
  healthLevel,
  parsePeriod,
  setupChecks,
  topShares,
} from './banks.lib';

const acct = (over: Partial<BankAccountView> = {}): BankAccountView => ({
  id: 'a1',
  bankId: 'b1',
  branchId: 'br1',
  accountName: 'Main',
  accountNumber: '010120000123456',
  currency: 'LAK',
  qrImageKey: 'k',
  qrImageUrl: 'http://x/qr.jpg',
  isActive: true,
  isDefault: true,
  pendingChange: null,
  bank: { id: 'b1', code: 'BCEL', nameLo: 'x', nameEn: 'BCEL', supportsQr: true },
  ...over,
});

const ins = (over: Partial<BankAccountInsight> = {}): BankAccountInsight => ({
  bankAccountId: 'a1',
  receivedToday: 0,
  receivedTodayCount: 0,
  receivedPeriod: 100,
  receivedPeriodCount: 1,
  receivedPrevPeriod: 0,
  paidOutPeriod: 0,
  paidOutPeriodCount: 0,
  daily: [],
  lastReceivedAt: null,
  openSlips: 0,
  pendingIntents: 0,
  lastStatementDate: null,
  unreconciledDays: 0,
  varianceDays: 0,
  ...over,
});

describe('banks.lib', () => {
  it('deltaPct never invents a baseline', () => {
    expect(deltaPct(150, 100)).toBe(50);
    expect(deltaPct(50, 100)).toBe(-50);
    expect(deltaPct(100, 0)).toBeNull();
  });

  it('orders issues by severity and derives the health level', () => {
    const a = acct({ qrImageUrl: null });
    const issues = accountIssues(a, ins({ varianceDays: 1, unreconciledDays: 2, openSlips: 1 }), 30);
    expect(issues).toEqual(['variance', 'unreconciled', 'openSlips', 'noQr']);
    expect(healthLevel(a, issues)).toBe('critical');
    expect(healthLevel(a, ['noQr'])).toBe('attention');
    expect(healthLevel(a, [])).toBe('ok');
    expect(healthLevel(acct({ isActive: false }), [])).toBe('off');
  });

  it('only calls an account dormant over a month or more, and never alerts on it alone', () => {
    const quiet = ins({ receivedPeriod: 0, receivedPeriodCount: 0 });
    expect(accountIssues(acct(), quiet, 7)).toEqual([]);
    expect(accountIssues(acct(), quiet, 30)).toEqual(['dormant']);
    expect(healthLevel(acct(), ['dormant'])).toBe('ok');
  });

  it('no QR is only an issue when the bank supports static QR', () => {
    const noQrSupport = acct({ qrImageUrl: null, bank: { id: 'b', code: 'X', nameLo: 'x', nameEn: 'X', supportsQr: false } });
    expect(accountIssues(noQrSupport, ins(), 30)).toEqual([]);
  });

  it('channel health: off → not ready → attention → healthy', () => {
    const p = { isActive: true, secretConfigured: true, recentIssues: 0 } as PaymentProviderView;
    expect(channelHealth({ ...p, isActive: false })).toBe('off');
    expect(channelHealth({ ...p, secretConfigured: false })).toBe('notReady');
    expect(channelHealth({ ...p, recentIssues: 2 })).toBe('attention');
    expect(channelHealth(p)).toBe('healthy');
  });

  it('setup checklist flags uncovered branches and missing QR', () => {
    const checks = setupChecks({
      branches: [
        { id: 'br1', name: 'A', isActive: true },
        { id: 'br2', name: 'B', isActive: true },
        { id: 'br3', name: 'C', isActive: false },
      ],
      accounts: [acct({ qrImageUrl: null })],
      providers: [],
      insights: undefined,
    });
    const by = Object.fromEntries(checks.map((c) => [c.key, c]));
    expect(by.coverage).toMatchObject({ ok: false, count: 1 });
    expect(by.qr).toMatchObject({ ok: false, count: 1 });
    expect(by.channel).toMatchObject({ ok: false });
    expect(by.statements).toMatchObject({ ok: true });
  });

  it('formats and parses helpers', () => {
    expect(groupAccountNumber('010120000123456')).toBe('0101 2000 0123 456');
    expect(parsePeriod('7')).toBe(7);
    expect(parsePeriod('12')).toBe(30);
    expect(parsePeriod(null)).toBe(30);
    expect(topShares([{ id: 'a', value: 5 }, { id: 'b', value: 9 }, { id: 'c', value: 1 }, { id: 'd', value: 0 }], 2)).toEqual({
      top: [{ id: 'b', value: 9 }, { id: 'a', value: 5 }],
      other: 1,
    });
  });
});
