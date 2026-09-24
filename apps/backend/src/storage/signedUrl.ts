import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

/**
 * Signed URL ສຳລັບໄຟລ໌ໃນ /uploads (ສະລິບ, ໃບຮັບເງິນ, ຮູບ chat, ຮູບຜິວ, QR ທະນາຄານ…).
 *
 * DB ເກັບ URL ແບບບໍ່ມີລາຍເຊັນ (canonical) ຄືເກົ່າ — ລາຍເຊັນຖືກຕິດຕອນສົ່ງອອກເທົ່ານັ້ນ:
 *  - `signResponseUrls` ຫໍ່ `res.json` ໃຫ້ທຸກ API response ⇒ ທຸກ URL ທີ່ຂຶ້ນຕົ້ນດ້ວຍ STORAGE_PUBLIC_URL ໄດ້ `?exp&sig`
 *  - `stripRequestUrls` ລຶບ `exp/sig` ອອກຈາກ body ທີ່ client ສົ່ງກັບມາ ⇒ ບໍ່ມີລາຍເຊັນຫຼົງເຂົ້າ DB
 *  - `requireUploadSignature` ກວດລາຍເຊັນກ່ອນ express.static serve ໄຟລ໌
 *
 * ເວລາໝົດອາຍຸປັດເປັນ bucket (UPLOAD_URL_TTL_SECONDS) ⇒ URL ຂອງໄຟລ໌ດຽວກັນຄົງທີ່ພາຍໃນ bucket, cache ຮູບຂອງ
 * browser/expo-image ຍັງໃຊ້ໄດ້; URL ມີອາຍຸ TTL–2×TTL ນັບຈາກຕອນອອກ.
 */

const publicBase = env.STORAGE_PUBLIC_URL.replace(/\/$/, '');
const publicPrefix = `${publicBase}/`;
const secret = createHmac('sha256', env.UPLOAD_URL_SECRET ?? env.JWT_ACCESS_SECRET)
  .update('abcp:upload-url:v1')
  .digest();

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

function signature(key: string, exp: number): string {
  return createHmac('sha256', secret).update(`${key}\n${exp}`).digest('base64url').slice(0, 32);
}

function currentExpiry(nowMs = Date.now()): number {
  const ttl = env.UPLOAD_URL_TTL_SECONDS;
  const now = Math.floor(nowMs / 1000);
  return (Math.floor(now / ttl) + 2) * ttl;
}

/** key ຂອງໄຟລ໌ (ບໍ່ມີ '/' ນຳໜ້າ, ບໍ່ມີ query) ຈາກ URL ສາທາລະນະ — null ຖ້າບໍ່ແມ່ນ URL ຂອງ storage ເຮົາ. */
function keyOf(url: string): string | null {
  if (!url.startsWith(publicPrefix)) return null;
  const rest = url.slice(publicPrefix.length);
  const q = rest.indexOf('?');
  return q === -1 ? rest : rest.slice(0, q);
}

export function signUploadUrl(url: string, nowMs?: number): string {
  const key = keyOf(url);
  const decoded = key && safeDecode(key);
  if (!key || !decoded) return url;
  const exp = currentExpiry(nowMs);
  return `${publicPrefix}${key}?exp=${exp}&sig=${signature(decoded, exp)}`;
}

export function unsignUploadUrl(url: string): string {
  const key = keyOf(url);
  return key && url.length > publicPrefix.length + key.length ? `${publicPrefix}${key}` : url;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** ຍ່າງທົ່ວ plain object/array ແລ້ວປ່ຽນທຸກ string ທີ່ເປັນ URL ຂອງ storage — Date/Decimal/Buffer ບໍ່ແຕະ. */
function mapUrls(value: unknown, fn: (url: string) => string, depth = 0): unknown {
  if (typeof value === 'string') return value.startsWith(publicPrefix) ? fn(value) : value;
  if (depth > 32) return value;
  if (Array.isArray(value)) return value.map((v) => mapUrls(v, fn, depth + 1));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapUrls(v, fn, depth + 1);
    return out;
  }
  return value;
}

export function signUrlsDeep<T>(value: T): T {
  return mapUrls(value, (u) => signUploadUrl(u)) as T;
}

export function unsignUrlsDeep<T>(value: T): T {
  return mapUrls(value, unsignUploadUrl) as T;
}

/** API middleware: ຕິດລາຍເຊັນໃສ່ URL ໃນ response + ລຶບລາຍເຊັນອອກຈາກ request body. */
export function signedUploadUrls(req: Request, res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === 'object') req.body = unsignUrlsDeep(req.body);
  const json = res.json.bind(res);
  res.json = (body?: unknown) => json(signUrlsDeep(body));
  next();
}

/** ກວດ `?exp&sig` ກ່ອນ serve ໄຟລ໌ຈາກ /uploads — ບໍ່ມີ/ຜິດ/ໝົດອາຍຸ ⇒ 403. */
export function requireUploadSignature(req: Request, res: Response, next: NextFunction): void {
  if (!env.UPLOAD_URL_SIGNING) return next();
  const exp = Number(req.query.exp);
  const sig = typeof req.query.sig === 'string' ? req.query.sig : '';
  const key = safeDecode(req.path.replace(/^\/+/, ''));
  const valid =
    key !== null &&
    Number.isInteger(exp) &&
    exp * 1000 > Date.now() &&
    /^[A-Za-z0-9_-]{32}$/.test(sig) &&
    timingSafeEqual(Buffer.from(sig), Buffer.from(signature(key, exp)));
  if (!valid) {
    res.status(403).json({ success: false, error: { code: 'UPLOAD_URL_INVALID', message: 'Signed URL missing, invalid or expired' } });
    return;
  }
  // ໄຟລ໌ເປັນຂໍ້ມູນສ່ວນຕົວ — cache ໄດ້ສະເພາະ browser ຂອງຜູ້ຖື URL, ບໍ່ເກີນອາຍຸລາຍເຊັນ
  const maxAge = Math.max(0, exp - Math.floor(Date.now() / 1000));
  res.setHeader('Cache-Control', `private, max-age=${maxAge}`);
  next();
}
