import { LOYALTY_TIER_THRESHOLDS, type LoyaltyAccountView, type LoyaltyTier } from '@abcp/shared-types';

export const TIERS: LoyaltyTier[] = ['SILVER', 'GOLD', 'PLATINUM'];

/**
 * A member counts as "close to upgrading" when this many points or fewer stand
 * between their lifetime total and the next tier (100 pts ≈ ₭1,000,000 of spend).
 */
export const NEAR_UPGRADE_POINTS = 100;

/** No ledger movement for this many days → dormant (re-engagement candidate). */
export const DORMANT_DAYS = 90;

/**
 * Per-tier visual identity. Silver/Gold/Platinum read as metals — the same slate /
 * amber medal tones the Referrals leaderboard uses — while Platinum takes the brand
 * primary so the top tier is the most saturated mark on the page. `fill` feeds
 * Recharts, which cannot read Tailwind classes.
 */
export const TIER_STYLE: Record<
  LoyaltyTier,
  { chip: string; ring: string; bar: string; dot: string; text: string; fill: string; gradient: string }
> = {
  SILVER: {
    chip: 'bg-slate-400/15 text-slate-600 dark:text-slate-300',
    ring: 'ring-slate-400/40',
    bar: 'bg-slate-400',
    dot: 'bg-slate-400',
    text: 'text-slate-600 dark:text-slate-300',
    fill: '#94a3b8',
    gradient: 'from-slate-400/25 via-slate-300/10 to-transparent',
  },
  GOLD: {
    chip: 'bg-amber-400/15 text-amber-700 dark:text-amber-400',
    ring: 'ring-amber-400/40',
    bar: 'bg-amber-400',
    dot: 'bg-amber-400',
    text: 'text-amber-700 dark:text-amber-400',
    fill: '#f59e0b',
    gradient: 'from-amber-400/25 via-amber-300/10 to-transparent',
  },
  PLATINUM: {
    chip: 'bg-primary/10 text-primary',
    ring: 'ring-primary/40',
    bar: 'bg-primary',
    dot: 'bg-primary',
    text: 'text-primary',
    fill: 'hsl(var(--primary))',
    gradient: 'from-primary/25 via-primary/10 to-transparent',
  },
};

/** Share of the way from the member's current tier floor to the next tier (0–1; 1 at the top tier). */
export function tierProgress(a: Pick<LoyaltyAccountView, 'tierLevel' | 'nextTier' | 'lifetimePoints'>): number {
  if (!a.nextTier) return 1;
  const floor = LOYALTY_TIER_THRESHOLDS[a.tierLevel];
  const span = LOYALTY_TIER_THRESHOLDS[a.nextTier] - floor;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (a.lifetimePoints - floor) / span));
}

export function isNearUpgrade(a: Pick<LoyaltyAccountView, 'pointsToNextTier'>): boolean {
  return a.pointsToNextTier != null && a.pointsToNextTier <= NEAR_UPGRADE_POINTS;
}

export function isDormant(a: Pick<LoyaltyAccountView, 'lastActivityAt'>, now = Date.now()): boolean {
  if (!a.lastActivityAt) return true;
  return now - new Date(a.lastActivityAt).getTime() > DORMANT_DAYS * 86_400_000;
}
