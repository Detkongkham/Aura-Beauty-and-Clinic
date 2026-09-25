/**
 * Advisory password strength for the reset form. The server only enforces
 * `passwordSchema` (≥ 8 chars) — everything else here is a nudge, never a gate.
 */
export type PasswordRule = 'length' | 'mixedCase' | 'digit' | 'symbol';

export interface PasswordStrength {
  /** 0 = empty, 1 = weak (or under the minimum) … 4 = strong. */
  score: 0 | 1 | 2 | 3 | 4;
  rules: Record<PasswordRule, boolean>;
}

export const PASSWORD_RULES: PasswordRule[] = ['length', 'mixedCase', 'digit', 'symbol'];

export function scorePassword(value: string): PasswordStrength {
  const rules: Record<PasswordRule, boolean> = {
    length: value.length >= 8,
    mixedCase: /[a-z]/.test(value) && /[A-Z]/.test(value),
    digit: /\d/.test(value),
    symbol: /[^A-Za-z0-9]/.test(value),
  };
  if (!value) return { score: 0, rules };
  const met = PASSWORD_RULES.filter((r) => rules[r]).length + (value.length >= 12 ? 1 : 0);
  // Below the server minimum it can never read better than "weak".
  const score = rules.length ? Math.min(4, met) : 1;
  return { score: score as PasswordStrength['score'], rules };
}
