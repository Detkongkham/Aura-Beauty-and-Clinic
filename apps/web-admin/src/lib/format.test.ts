import { describe, expect, it } from 'vitest';

import {
  formatCompactNumber,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatRelative,
} from './format';

describe('format', () => {
  it('formats LAK with no decimals and a kip symbol', () => {
    expect(formatCurrency(250000)).toBe('₭ 250,000');
    expect(formatCurrency(1234567.89)).toBe('₭ 1,234,568');
  });

  it('formats USD/THB with two decimals', () => {
    expect(formatCurrency(12.5, 'USD')).toBe('$ 12.50');
    expect(formatCurrency(99, 'THB')).toBe('฿ 99.00');
  });

  it('returns an en-dash for nullish money', () => {
    expect(formatCurrency(null)).toBe('–');
    expect(formatCurrency(undefined)).toBe('–');
  });

  it('abbreviates large numbers', () => {
    expect(formatCompactNumber(1200)).toBe('1.2K');
    expect(formatCompactNumber(3_400_000)).toBe('3.4M');
  });

  it('formats dates in Vientiane time as DD/MM/YYYY [HH:mm]', () => {
    // 2026-09-01T09:30:00Z -> 16:30 Asia/Vientiane (UTC+7)
    expect(formatDate('2026-09-01T09:30:00Z')).toBe('01/09/2026');
    expect(formatDateTime('2026-09-01T09:30:00Z')).toBe('01/09/2026 16:30');
  });

  it('returns an en-dash for invalid dates', () => {
    expect(formatDate('not-a-date')).toBe('–');
    expect(formatDate(null)).toBe('–');
  });

  it('formats Lao relative time without falling back to another script', () => {
    const now = Date.now();
    expect(formatRelative(now - 7 * 86_400_000)).toBe('7 ມື້ກ່ອນ');
    expect(formatRelative(now - 86_400_000)).toBe('ມື້ວານນີ້');
    expect(formatRelative(now - 3 * 3_600_000)).toBe('3 ຊົ່ວໂມງກ່ອນ');
    expect(formatRelative(now + 2 * 86_400_000)).toBe('ອີກ 2 ມື້');
    expect(formatRelative(now)).toBe('ຕອນນີ້');
    // no Thai-script codepoints (U+0E01–U+0E7F) leak through
    expect(/[ก-๿]/.test(formatRelative(now - 5 * 60_000))).toBe(false);
  });

  it('formats English relative time via Intl', () => {
    expect(formatRelative(Date.now() - 7 * 86_400_000, 'en')).toBe('7 days ago');
  });
});
