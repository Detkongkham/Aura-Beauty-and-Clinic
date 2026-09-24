import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — the variant every authenticator app
 * (Google Authenticator, Microsoft Authenticator, 1Password, Authy) supports. No dependency.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit random secret, base32 (what the QR / manual-entry key carries). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(key: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', key).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return bin.toString().padStart(DIGITS, '0');
}

export function totpAt(secret: string, timeMs = Date.now()): string {
  return hotp(base32Decode(secret), Math.floor(timeMs / 1000 / STEP_SECONDS));
}

/** Accepts the current step ± `window` steps (clock drift on the phone). */
export function verifyTotp(secret: string, code: string, timeMs = Date.now(), window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const key = base32Decode(secret);
  const counter = Math.floor(timeMs / 1000 / STEP_SECONDS);
  const given = Buffer.from(code);
  for (let d = -window; d <= window; d++) {
    if (timingSafeEqual(Buffer.from(hotp(key, counter + d)), given)) return true;
  }
  return false;
}

export function otpauthUrl(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Ten `XXXX-XXXX` recovery codes (unambiguous alphabet — no 0/O/1/I). */
export function generateRecoveryCodes(count = 10): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(8);
    const raw = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}
