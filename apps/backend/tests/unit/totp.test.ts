import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, generateRecoveryCodes, totpAt, verifyTotp } from '../../src/utils/totp.js';

// RFC 6238 appendix B — SHA-1 seed "12345678901234567890", 8-digit vectors truncated to the last 6.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp', () => {
  it('matches the RFC 6238 SHA-1 test vectors', () => {
    expect(totpAt(RFC_SECRET, 59_000)).toBe('287082');
    expect(totpAt(RFC_SECRET, 1_111_111_109_000)).toBe('081804');
    expect(totpAt(RFC_SECRET, 1_234_567_890_000)).toBe('005924');
    expect(totpAt(RFC_SECRET, 2_000_000_000_000)).toBe('279037');
  });

  it('round-trips base32', () => {
    const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });

  it('accepts ±1 step of drift and rejects further', () => {
    const t = 1_700_000_000_000;
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, t - 30_000), t)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, t + 30_000), t)).toBe(true);
    expect(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, t - 90_000), t)).toBe(false);
    expect(verifyTotp(RFC_SECRET, 'abcdef', t)).toBe(false);
  });

  it('makes distinct XXXX-XXXX recovery codes', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });
});
