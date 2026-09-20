import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Wave 10A (ອຸດ C3) — ບັງຄັບ header `Idempotency-Key` ໃສ່ທຸກ POST ທີ່ແຕະເງິນ. Client (web/mobile)
 * ຕ້ອງສ້າງ UUID ໃໝ່ຕໍ່ "ການກົດ 1 ຄັ້ງ" ແລ້ວສົ່ງຄືນ header ດຽວກັນຖ້າ retry. ຮ້ອງຊ້ຳດ້ວຍ key/body
 * ດຽວກັນ → ຄືນ response ເກົ່າ (ບໍ່ execute ຊ້ຳ); key ດຽວກັນແຕ່ body ຕ່າງ → 409.
 */
export function requireIdempotencyKey() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.header('Idempotency-Key');
    if (!key || key.length < 8) {
      next(ApiError.badRequest('ຕ້ອງມີ header Idempotency-Key (UUID ຕໍ່ການກົດ 1 ຄັ້ງ)'));
      return;
    }
    const userId = req.auth?.sub ?? 'anonymous';
    const endpoint = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}`;
    const requestHash = createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex');
    const where = { key_userId_endpoint: { key, userId, endpoint } } as const;

    const existing = await prisma.idempotencyKey.findUnique({ where });
    if (existing) {
      if (existing.requestHash !== requestHash) {
        next(ApiError.conflict('Idempotency-Key ນີ້ຖືກໃຊ້ກັບ request ອື່ນແລ້ວ'));
        return;
      }
      if (existing.statusCode != null) {
        res.status(existing.statusCode).json(existing.responseBody as object);
        return;
      }
      next(ApiError.conflict('ການຮ້ອງຂໍນີ້ກຳລັງດຳເນີນການຢູ່, ກະລຸນາລໍຖ້າ'));
      return;
    }

    try {
      await prisma.idempotencyKey.create({ data: { key, userId, endpoint, requestHash } });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        next(ApiError.conflict('ການຮ້ອງຂໍນີ້ກຳລັງດຳເນີນການຢູ່, ກະລຸນາລໍຖ້າ'));
        return;
      }
      next(err);
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      prisma.idempotencyKey
        .update({
          where,
          data: { statusCode: res.statusCode, responseBody: body as Prisma.InputJsonValue },
        })
        .catch(() => undefined);
      return originalJson(body);
    }) as typeof res.json;

    next();
  };
}
