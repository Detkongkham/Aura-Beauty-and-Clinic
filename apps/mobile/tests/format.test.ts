import { describe, expect, it } from 'vitest';
import { formatLAK, slotBucket } from '../src/lib/format';

describe('format helpers', () => {
  it('formatLAK renders kip with grouping and no decimals', () => {
    expect(formatLAK(250000)).toBe('₭ 250,000');
    expect(formatLAK(120000.4)).toBe('₭ 120,000');
  });

  it('slotBucket splits by Vientiane local hour', () => {
    expect(slotBucket('2026-09-10T02:30:00.000Z')).toBe('morning'); // 09:30 +07
    expect(slotBucket('2026-09-10T07:00:00.000Z')).toBe('afternoon'); // 14:00
    expect(slotBucket('2026-09-10T11:00:00.000Z')).toBe('evening'); // 18:00
  });
});
