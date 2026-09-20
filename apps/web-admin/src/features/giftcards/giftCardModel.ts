import type { GiftCardView } from '@abcp/shared-types';

/**
 * Presentation-level status. The DB `status` alone is not enough: an ACTIVE row whose
 * `expireDate` has passed is expired for every practical purpose, and legacy rows mark
 * a spent card via `isRedeemed` rather than DEPLETED. Precedence mirrors what a
 * cashier would need to know first (unpaid → void → spent → expired → usable).
 */
export type CardState = 'active' | 'pendingPayment' | 'redeemed' | 'expired' | 'void';

export const CARD_STATES: CardState[] = ['active', 'pendingPayment', 'redeemed', 'expired', 'void'];

export function cardState(c: GiftCardView): CardState {
  if (c.status === 'PENDING_PAYMENT') return 'pendingPayment';
  if (c.status === 'VOID') return 'void';
  if (c.isRedeemed || c.status === 'DEPLETED') return 'redeemed';
  if (c.isExpired || c.status === 'EXPIRED') return 'expired';
  return 'active';
}

export const STATE_BADGE: Record<CardState, 'success' | 'warning' | 'neutral' | 'danger' | 'info'> = {
  active: 'success',
  pendingPayment: 'warning',
  redeemed: 'info',
  expired: 'danger',
  void: 'neutral',
};

/** Dot colour paired with the state label — never the only signal. */
export const STATE_DOT: Record<CardState, string> = {
  active: 'bg-success',
  pendingPayment: 'bg-warning',
  redeemed: 'bg-info',
  expired: 'bg-destructive',
  void: 'bg-muted-foreground',
};

/** Staff-issued (complimentary, audit-logged) vs customer-purchased. */
export type CardSource = 'complimentary' | 'purchased';

export function cardSource(c: GiftCardView): CardSource {
  return c.issuedByUserId ? 'complimentary' : 'purchased';
}

const DAY_MS = 86_400_000;

/** Whole days until expiry (negative once expired). */
export function daysUntil(iso: string, now = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - now) / DAY_MS);
}

/** Window used by the "expiring soon" tile, list and filter. */
export const EXPIRING_WINDOW_DAYS = 30;

export function isExpiringSoon(c: GiftCardView, now = Date.now()): boolean {
  if (cardState(c) !== 'active' || c.currentBalance <= 0) return false;
  const d = daysUntil(c.expireDate, now);
  return d >= 0 && d <= EXPIRING_WINDOW_DAYS;
}

export type CardCurrency = 'LAK' | 'THB' | 'USD';

export function cardCurrency(c: Pick<GiftCardView, 'currency'>): CardCurrency {
  return c.currency === 'THB' || c.currency === 'USD' ? c.currency : 'LAK';
}

/**
 * Where the issued value currently sits. Pending-payment cards are excluded from the
 * split (no money has been taken yet) and reported separately as `pending`.
 * All cards are issued in LAK (issue/purchase schemas), so plain sums are safe.
 */
export function valueSplit(cards: GiftCardView[]) {
  const acc = { redeemed: 0, outstanding: 0, breakage: 0, voided: 0, pending: 0, activeCount: 0 };
  for (const c of cards) {
    const s = cardState(c);
    if (s === 'pendingPayment') {
      acc.pending += c.initialBalance;
      continue;
    }
    acc.redeemed += Math.max(0, c.initialBalance - c.currentBalance);
    if (s === 'active') {
      acc.outstanding += c.currentBalance;
      acc.activeCount += 1;
    } else if (s === 'expired') acc.breakage += c.currentBalance;
    else if (s === 'void') acc.voided += c.currentBalance;
  }
  const total = acc.redeemed + acc.outstanding + acc.breakage + acc.voided;
  return { ...acc, total, redemptionRate: total > 0 ? acc.redeemed / total : 0 };
}
