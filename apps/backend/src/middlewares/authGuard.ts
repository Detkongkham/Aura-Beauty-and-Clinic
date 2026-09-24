import type { NextFunction, Request, Response } from 'express';
import { assertLiveSession } from '../modules/auth/sessions.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/token.js';

/**
 * ຕ້ອງມີ Authorization: Bearer <accessToken> ທີ່ຖືກຕ້ອງ. Token ທີ່ມີ `sid` ຍັງຖືກກວດວ່າເຊດຊັນຍັງບໍ່ຖືກຖອນ
 * ແລະ ບໍ່ໝົດເວລາ idle (Settings ▸ sessionTimeoutMinutes) — ຜົນ cache 30 ວິນາທີ.
 */
export function authGuard(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(ApiError.unauthorized());
    return;
  }
  const auth = verifyAccessToken(header.slice('Bearer '.length));
  req.auth = auth;
  if (!auth.sid) {
    next();
    return;
  }
  assertLiveSession(auth.sid, auth.sub, auth.role).then(() => next(), next);
}
