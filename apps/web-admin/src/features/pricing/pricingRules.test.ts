import { describe, expect, it } from 'vitest';
import type { PricingRuleView } from '@abcp/shared-types';

import {
  conflictPairs,
  dayOrder,
  isLiveNow,
  nowContext,
  previewPrice,
  ruleEffect,
  weekCoverage,
} from './pricingRules';

const rule = (over: Partial<PricingRuleView> = {}): PricingRuleView => ({
  id: 'r1',
  branchId: 'b1',
  branchName: 'Main',
  serviceId: null,
  serviceName: null,
  ruleName: 'Happy hour',
  dayOfWeek: 1,
  startTime: '13:00',
  endTime: '16:00',
  discountPercent: 20,
  priceMultiplier: 1,
  isActive: true,
  ...over,
});

describe('ruleEffect', () => {
  it('combines discount and multiplier the way the backend does', () => {
    expect(ruleEffect({ discountPercent: 20, priceMultiplier: 1 })).toMatchObject({
      netPercent: 20,
      kind: 'discount',
    });
    expect(ruleEffect({ discountPercent: 0, priceMultiplier: 1.25 })).toMatchObject({
      netPercent: -25,
      kind: 'surge',
    });
    expect(ruleEffect({ discountPercent: 0, priceMultiplier: 1 })).toMatchObject({ kind: 'flat' });
    // 10% off then ×1.1 is still 1% cheaper (0.9 × 1.1 = 0.99), not flat
    expect(ruleEffect({ discountPercent: 10, priceMultiplier: 1.1 })).toMatchObject({
      netPercent: 1,
      kind: 'discount',
    });
  });
});

describe('previewPrice', () => {
  it('rounds to 100 LAK like the pricing engine', () => {
    expect(previewPrice(250_555, { discountPercent: 20, priceMultiplier: 1 })).toMatchObject({
      base: 250_600,
      final: 200_400,
      savings: 50_200,
    });
  });
});

describe('nowContext', () => {
  it('rolls the day over at Vientiane midnight, not UTC midnight', () => {
    // Sunday 18:00 UTC = Monday 01:00 Vientiane
    expect(nowContext(new Date('2026-09-13T18:00:00Z'))).toEqual({ dayOfWeek: 1, minutes: 60 });
  });
});

describe('isLiveNow', () => {
  // The engine reads Asia/Vientiane (UTC+7), so the helper must too — independent of browser TZ.
  const at = new Date('2026-09-14T06:30:00Z'); // Monday 13:30 Vientiane
  const now = nowContext(at);

  it('matches a rule whose window contains "now"', () => {
    expect(isLiveNow(rule(), now)).toBe(true);
  });

  it('ignores paused rules, other days and closed windows', () => {
    expect(isLiveNow(rule({ isActive: false }), now)).toBe(false);
    expect(isLiveNow(rule({ dayOfWeek: 2 }), now)).toBe(false);
    expect(isLiveNow(rule({ startTime: '16:00', endTime: '18:00' }), now)).toBe(false);
  });
});

describe('conflictPairs', () => {
  it('flags overlapping active rules and names the cheaper winner', () => {
    const a = rule({ id: 'a', discountPercent: 10 });
    const b = rule({ id: 'b', startTime: '15:00', endTime: '17:00', discountPercent: 30 });
    const pairs = conflictPairs([a, b]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.overlapMinutes).toBe(60);
    expect(pairs[0]!.winner.id).toBe('b');
  });

  it('does not flag different services, days, branches or paused rules', () => {
    const a = rule({ id: 'a', serviceId: 's1' });
    expect(conflictPairs([a, rule({ id: 'b', serviceId: 's2' })])).toHaveLength(0);
    expect(conflictPairs([a, rule({ id: 'b', serviceId: 's1', dayOfWeek: 3 })])).toHaveLength(0);
    expect(conflictPairs([a, rule({ id: 'b', serviceId: 's1', branchId: 'b2' })])).toHaveLength(0);
    expect(conflictPairs([a, rule({ id: 'b', serviceId: 's1', isActive: false })])).toHaveLength(0);
  });

  it('flags an all-services rule against a service-specific one', () => {
    const pairs = conflictPairs([rule({ id: 'a' }), rule({ id: 'b', serviceId: 's1' })]);
    expect(pairs).toHaveLength(1);
  });
});

describe('weekCoverage', () => {
  it('merges overlapping windows and keeps surge out of discounted minutes', () => {
    const c = weekCoverage([
      rule({ id: 'a', startTime: '13:00', endTime: '16:00' }),
      rule({ id: 'b', startTime: '15:00', endTime: '17:00' }),
      rule({ id: 'c', startTime: '16:30', endTime: '18:00', discountPercent: 0, priceMultiplier: 1.2 }),
      rule({ id: 'd', isActive: false, startTime: '20:00', endTime: '22:00' }),
    ]);
    expect(c.discountMinutes).toBe(4 * 60); // 13:00–17:00 merged
    expect(c.surgeMinutes).toBe(60); // 17:00–18:00 only; 16:30–17:00 already discounted
    expect(c.uncoveredMinutes).toBe(7 * 1440 - 5 * 60);
  });
});

describe('dayOrder', () => {
  it('anchors the grid on the configured week start', () => {
    expect(dayOrder('mon')).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(dayOrder('sun')).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});
