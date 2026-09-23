import { describe, expect, it } from 'vitest';
import type { CampaignView } from '@abcp/shared-types';

import {
  audienceRule,
  campaignTotals,
  conversionRate,
  formatRate,
  notificationBody,
  rankCampaigns,
  rateTone,
  typeBreakdown,
} from './campaigns.lib';

function campaign(p: Partial<CampaignView>): CampaignView {
  return {
    id: p.id ?? 'c',
    branchId: 'b',
    branchName: 'Main',
    name: p.name ?? 'Campaign',
    type: p.type ?? 'CUSTOM',
    discountCode: p.discountCode ?? null,
    message: p.message ?? { title: 'Hi', body: 'Body' },
    triggerRule: p.triggerRule ?? null,
    channels: p.channels ?? ['PUSH'],
    isActive: p.isActive ?? true,
    recipientCount: p.recipientCount ?? 0,
    convertedCount: p.convertedCount ?? 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('conversion helpers', () => {
  it('returns null rate for never-sent campaigns', () => {
    expect(conversionRate(0, 0)).toBeNull();
    expect(formatRate(null)).toBe('—');
    expect(rateTone(null)).toBe('neutral');
  });

  it('formats small rates with a decimal and bands the tone', () => {
    expect(formatRate(conversionRate(200, 7))).toBe('3.5%');
    expect(formatRate(conversionRate(10, 3))).toBe('30%');
    expect(rateTone(0.3)).toBe('success');
    expect(rateTone(0.1)).toBe('primary');
    expect(rateTone(0.01)).toBe('warning');
  });
});

describe('audienceRule', () => {
  it('mirrors backend defaults', () => {
    expect(audienceRule({ type: 'BIRTHDAY', triggerRule: null }).key).toBe('campaigns.rule.birthdayToday');
    expect(audienceRule({ type: 'BIRTHDAY', triggerRule: { daysBefore: 3 } })).toEqual({
      key: 'campaigns.rule.birthdayBefore',
      params: { count: 3 },
    });
    expect(audienceRule({ type: 'WIN_BACK', triggerRule: null }).params).toEqual({ count: 90 });
    expect(audienceRule({ type: 'FESTIVAL_PROMO', triggerRule: null }).key).toBe('campaigns.rule.allCustomers');
  });
});

describe('aggregates', () => {
  const rows = [
    campaign({ id: 'a', type: 'BIRTHDAY', recipientCount: 10, convertedCount: 2 }),
    campaign({ id: 'b', type: 'BIRTHDAY', recipientCount: 5, convertedCount: 2, isActive: false }),
    campaign({ id: 'c', type: 'WIN_BACK', recipientCount: 0 }),
  ];

  it('totals reach, conversions, status and never-sent', () => {
    expect(campaignTotals(rows)).toEqual({
      campaigns: 3,
      active: 2,
      paused: 1,
      reached: 15,
      converted: 4,
      neverSent: 1,
      rate: 4 / 15,
    });
  });

  it('breaks down by type in canonical order', () => {
    const breakdown = typeBreakdown(rows);
    expect(breakdown.map((r) => r.type)).toEqual(['BIRTHDAY', 'WIN_BACK', 'FESTIVAL_PROMO', 'CUSTOM']);
    expect(breakdown[0]).toMatchObject({ campaigns: 2, reached: 15, converted: 4 });
    expect(breakdown[1]!.rate).toBeNull();
  });

  it('ranks by conversions then rate, dropping zero-conversion campaigns', () => {
    expect(rankCampaigns(rows).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('appends the discount code like the backend sender', () => {
    expect(notificationBody('Hello', 'BDAY20')).toBe('Hello (ໂຄ້ດ: BDAY20)');
    expect(notificationBody('Hello', null)).toBe('Hello');
  });
});
