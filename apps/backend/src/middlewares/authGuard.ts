import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/token.js';

/** ຕ້ອງມີ Authorization: Bearer <accessToken> ທີ່ຖືກຕ້ອງ. */
export function authGuard(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(ApiError.unauthorized());
    return;
  }
  req.auth = verifyAccessToken(header.slice('Bearer '.length));
  next();
}
