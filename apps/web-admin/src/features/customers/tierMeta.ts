/** Loyalty tiers, richest first, plus the untiered bucket. Shared by the tier
 *  donut and the lifetime-value bar chart so colours stay in lock-step.
 *  Colour is always paired with a label + value (design.md §10 — never colour-only). */
export const TIER_ORDER = ['PLATINUM', 'GOLD', 'SILVER', 'NONE'] as const;

export type TierKey = (typeof TIER_ORDER)[number];

export const TIER_COLOR: Record<TierKey, string> = {
  PLATINUM: 'hsl(var(--chart-1))',
  GOLD: 'hsl(var(--chart-2))',
  SILVER: 'hsl(var(--chart-4))',
  NONE: 'hsl(var(--muted-foreground) / 0.35)',
};

/** Tiers a user can actually filter the table by (`NONE` is not a filter value). */
export const FILTERABLE_TIERS = ['PLATINUM', 'GOLD', 'SILVER'] as const;
