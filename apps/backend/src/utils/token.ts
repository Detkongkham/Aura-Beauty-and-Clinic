import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { accessTokenPayloadSchema, type AccessTokenPayload } from '@abcp/shared-types';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';
import { ErrorCode } from '../constants/errorCodes.js';

export type RefreshTokenPayload = {
  sub: string;
  jti: string;
  /** UserSession id — token ທີ່ອອກກ່ອນ 2026-09-23 ບໍ່ມີ (ຈັດການແບບ LEGACY). */
  sid?: string;
};

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL });
}

export function signRefreshToken(sub: string, sid?: string): { token: string; jti: string } {
  const jti = randomUUID();
  const payload: RefreshTokenPayload = sid ? { sub, jti, sid } : { sub, jti };
  const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  });
  return { token, jti };
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    return accessTokenPayloadSchema.parse(decoded);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Token ໝົດອາຍຸ', ErrorCode.TOKEN_EXPIRED);
    }
    throw ApiError.unauthorized('Token ບໍ່ຖືກຕ້ອງ', ErrorCode.TOKEN_INVALID);
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
    return decoded;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Refresh token ໝົດອາຍຸ', ErrorCode.TOKEN_EXPIRED);
    }
    throw ApiError.unauthorized('Refresh token ບໍ່ຖືກຕ້ອງ', ErrorCode.TOKEN_INVALID);
  }
}
