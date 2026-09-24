import type { AccountOverview } from '@abcp/shared-types';

// --- Password strength -------------------------------------------------------

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;

export interface PasswordRules {
  minLength: boolean;
  mixedCase: boolean;
  number: boolean;
  symbol: boolean;
  long: boolean;
}

export function passwordRules(pw: string, minLength: number): PasswordRules {
  return {
    minLength: pw.length >= minLength,
    mixedCase: /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    number: /\d/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
    long: pw.length >= Math.max(12, minLength + 4),
  };
}

/**
 * 0 = empty, 1 weak … 4 strong. Below the policy minimum it can never rise above
 * "weak", so the meter can't look green for a password the server will reject.
 */
export function passwordStrength(pw: string, minLength: number): StrengthLevel {
  if (!pw) return 0;
  const r = passwordRules(pw, minLength);
  if (!r.minLength) return 1;
  const extras = [r.mixedCase, r.number, r.symbol, r.long].filter(Boolean).length;
  return Math.min(4, Math.max(1, extras)) as StrengthLevel;
}

// --- Security checklist ------------------------------------------------------

export const PASSWORD_MAX_AGE_DAYS = 180;
export const SESSION_SOFT_LIMIT = 3;
const DAY_MS = 86_400_000;

export type SecurityCheckKey = 'passwordFresh' | 'twoFactor' | 'sessionsTidy' | 'email' | 'photo';

export interface SecurityCheck {
  key: SecurityCheckKey;
  ok: boolean;
  weight: number;
  /** In-page anchor that fixes it. */
  target: string;
}

/** Days since the password was last set — falls back to account creation when never changed. */
export function passwordAgeDays(
  o: Pick<AccountOverview, 'passwordChangedAt' | 'createdAt'>,
  now = Date.now(),
): number {
  const since = Date.parse(o.passwordChangedAt ?? o.createdAt);
  return Math.max(0, Math.floor((now - since) / DAY_MS));
}

export function securityChecks(o: AccountOverview, now = Date.now()): SecurityCheck[] {
  return [
    {
      key: 'passwordFresh',
      ok: passwordAgeDays(o, now) <= PASSWORD_MAX_AGE_DAYS,
      weight: 35,
      target: 'acc-security',
    },
    { key: 'twoFactor', ok: Boolean(o.twoFactor?.enabled), weight: 25, target: 'acc-2fa' },
    {
      key: 'sessionsTidy',
      ok: o.stats.activeSessions <= SESSION_SOFT_LIMIT,
      weight: 20,
      target: 'acc-sessions',
    },
    { key: 'email', ok: Boolean(o.user.email), weight: 12, target: 'acc-profile' },
    { key: 'photo', ok: Boolean(o.avatarUrl), weight: 8, target: 'acc-profile' },
  ];
}

export function securityScore(checks: SecurityCheck[]): number {
  const total = checks.reduce((s, c) => s + c.weight, 0);
  const got = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  return total === 0 ? 0 : Math.round((got / total) * 100);
}

export function scoreTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'danger';
}

// --- Activity feed -----------------------------------------------------------

const BARE_VERB: Record<string, string> = {
  create: 'created',
  update: 'updated',
  delete: 'deleted',
  login: 'login',
};
const ENTITY_HEAD: Record<string, string> = {
  user: 'users',
  purchaseorder: 'purchase_order',
  giftcard: 'giftcard',
};

/**
 * Normalises both audit formats into { head, verb }:
 * - middleware / service rows: `auth.password_changed` → { auth, password_changed }
 * - legacy bare rows: action `UPDATE` + entityName `User` → { users, updated }
 */
export function splitAction(action: string, entityName?: string): { head: string; verb: string } {
  const dot = action.indexOf('.');
  if (dot !== -1) return { head: action.slice(0, dot), verb: action.slice(dot + 1) };
  const verb = action.toLowerCase();
  const entity = (entityName ?? '').replace(/[\s_-]/g, '').toLowerCase();
  return { head: ENTITY_HEAD[entity] ?? entity, verb: BARE_VERB[verb] ?? verb };
}

/** Readable fallback for verbs without a translation: `status_changed` → `status changed`. */
export function humanizeVerb(verb: string): string {
  return verb.replace(/_/g, ' ');
}

/** Groups feed items by Vientiane calendar day, preserving order (items arrive newest first). */
export function groupByDay<T extends { createdAt: string }>(
  items: T[],
  dayKey: (iso: string) => string,
) {
  const groups: Array<{ day: string; items: T[] }> = [];
  for (const it of items) {
    const day = dayKey(it.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(it);
    else groups.push({ day, items: [it] });
  }
  return groups;
}

// --- Access summary ----------------------------------------------------------

/** `['users:view','users:manage','dashboard:view']` → Map { users → [view, manage], dashboard → [view] }. */
export function groupPermissions(perms: readonly string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const p of perms) {
    const [group, action] = p.split(':');
    if (!group || !action) continue;
    const list = map.get(group) ?? [];
    list.push(action);
    map.set(group, list);
  }
  return map;
}
