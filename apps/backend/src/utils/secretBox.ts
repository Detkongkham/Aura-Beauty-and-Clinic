import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

/** AES-256-GCM for small secrets at rest (TOTP seeds). Format: v1.<iv>.<tag>.<ciphertext> (base64url). */

function key(): Buffer {
  return createHash('sha256')
    .update(`abcp-secretbox:${env.TWO_FACTOR_ENC_KEY ?? env.JWT_REFRESH_SECRET}`)
    .digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function open(sealed: string): string {
  const [v, iv, tag, ct] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('secretBox: bad format');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
