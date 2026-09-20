import { Cake, Megaphone, PartyPopper, RotateCcw, type LucideIcon } from 'lucide-react';
import type { CampaignType, CampaignView } from '@abcp/shared-types';

export const CAMPAIGN_TYPES: CampaignType[] = ['BIRTHDAY', 'WIN_BACK', 'FESTIVAL_PROMO', 'CUSTOM'];

/** Backend defaults applied in `runCampaign()` when the rule field is missing. */
export const DEFAULT_INACTIVE_DAYS = 90;
export const DEFAULT_DAYS_BEFORE = 0;

export interface CampaignTypeMeta {
  icon: LucideIcon;
  /** Icon chip — soft background + tone text. */
  chip: string;
  /** Solid fill for bars / dots. */
  solid: string;
  /** Soft fill for the "reached" track behind the converted bar. */
  soft: string;
}

/** One visual identity per campaign type, reused by the table, overview cards and sheet. */
export const TYPE_META: Record<CampaignType, CampaignTypeMeta> = {
  BIRTHDAY: {
    icon: Cake,
    chip: 'bg-accent-soft text-accent-foreground',
    solid: 'bg-accent',
    soft: 'bg-accent/25',
  },
  WIN_BACK: { icon: RotateCcw, chip: 'bg-info-soft text-info', solid: 'bg-info', soft: 'bg-info/20' },
  FESTIVAL_PROMO: {
    icon: PartyPopper,
    chip: 'bg-warning-soft text-warning',
    solid: 'bg-warning',
    soft: 'bg-warning/20',
  },
  CUSTOM: { icon: Megaphone, chip: 'bg-primary/10 text-primary', solid: 'bg-primary', soft: 'bg-primary/20' },
};

/** Share of recipients who came back (0–1), or `null` when the campaign has never been sent. */
export function conversionRate(reached: number, converted: number): number | null {
  if (reached <= 0) return null;
  return Math.min(1, converted / reached);
}

/** Percentage label with one decimal under 10% so small-but-real rates don't read as 0%. */
export function formatRate(rate: number | null): string {
  if (rate === null) return '—';
  const pct = rate * 100;
  if (pct > 0 && pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

export type RateTone = 'success' | 'primary' | 'warning' | 'neutral';

/** Visual band for a conversion rate — never the only signal, the % is always printed. */
export function rateTone(rate: number | null): RateTone {
  if (rate === null) return 'neutral';
  if (rate >= 0.2) return 'success';
  if (rate >= 0.05) return 'primary';
  return 'warning';
}

/** i18n key + params describing who a campaign targets, mirroring the backend audience rules. */
export function audienceRule(c: Pick<CampaignView, 'type' | 'triggerRule'>): {
  key: string;
  params?: Record<string, number>;
} {
  if (c.type === 'BIRTHDAY') {
    const days = c.triggerRule?.daysBefore ?? DEFAULT_DAYS_BEFORE;
    return days === 0
      ? { key: 'campaigns.rule.birthdayToday' }
      : { key: 'campaigns.rule.birthdayBefore', params: { count: days } };
  }
  if (c.type === 'WIN_BACK') {
    return {
      key: 'campaigns.rule.winBack',
      params: { count: c.triggerRule?.inactiveDays ?? DEFAULT_INACTIVE_DAYS },
    };
  }
  return { key: 'campaigns.rule.allCustomers' };
}

/** The notification body exactly as `runCampaign()` sends it (discount code appended). */
export function notificationBody(body: string, discountCode: string | null | undefined): string {
  return discountCode ? `${body} (ໂຄ້ດ: ${discountCode})` : body;
}

export interface CampaignTotals {
  campaigns: number;
  active: number;
  paused: number;
  reached: number;
  converted: number;
  neverSent: number;
  rate: number | null;
}

export function campaignTotals(rows: CampaignView[]): CampaignTotals {
  const t = rows.reduce(
    (acc, c) => {
      acc.reached += c.recipientCount;
      acc.converted += c.convertedCount;
      if (c.isActive) acc.active += 1;
      else acc.paused += 1;
      if (c.recipientCount === 0) acc.neverSent += 1;
      return acc;
    },
    { campaigns: rows.length, active: 0, paused: 0, reached: 0, converted: 0, neverSent: 0 },
  );
  return { ...t, rate: conversionRate(t.reached, t.converted) };
}

export interface TypeBreakdownRow {
  type: CampaignType;
  campaigns: number;
  reached: number;
  converted: number;
  rate: number | null;
}

/** Per-type reach/conversion roll-up, in the canonical type order (empty types included). */
export function typeBreakdown(rows: CampaignView[]): TypeBreakdownRow[] {
  return CAMPAIGN_TYPES.map((type) => {
    const members = rows.filter((c) => c.type === type);
    const reached = members.reduce((s, c) => s + c.recipientCount, 0);
    const converted = members.reduce((s, c) => s + c.convertedCount, 0);
    return { type, campaigns: members.length, reached, converted, rate: conversionRate(reached, converted) };
  });
}

/**
 * Top performers — campaigns that have converted at least one customer, ranked by
 * conversions, then by rate (so a small campaign with a great rate still beats a
 * big one with the same count), then by reach.
 */
export function rankCampaigns(rows: CampaignView[]): CampaignView[] {
  return rows
    .filter((c) => c.convertedCount > 0)
    .sort((a, b) => {
      if (b.convertedCount !== a.convertedCount) return b.convertedCount - a.convertedCount;
      const ra = conversionRate(a.recipientCount, a.convertedCount) ?? 0;
      const rb = conversionRate(b.recipientCount, b.convertedCount) ?? 0;
      if (rb !== ra) return rb - ra;
      return b.recipientCount - a.recipientCount;
    });
}
