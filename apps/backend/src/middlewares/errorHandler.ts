import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { ErrorCode } from '../constants/errorCodes.js';
import { logger } from '../config/logger.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: ErrorCode.VALIDATION_ERROR, message: 'ຂໍ້ມູນທີ່ສົ່ງມາບໍ່ຖືກຕ້ອງ', details: err.flatten() },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: { code: ErrorCode.CONFLICT, message: 'ຂໍ້ມູນຊ້ຳກັບທີ່ມີຢູ່ແລ້ວ', details: err.meta },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: ErrorCode.NOT_FOUND, message: 'ບໍ່ພົບຂໍ້ມູນ' } });
      return;
    }
  }

  // ຂໍ້ຈຳກັດ 10C — trigger `*_ledger_lock` (migration 20260923100000) ປະຕິເສດການແກ້ເອກະສານທີ່ອອກແລ້ວ.
  if (err instanceof Error && err.message.includes('LEDGER_LOCKED:')) {
    res.status(409).json({
      error: { code: ErrorCode.LEDGER_LOCKED, message: 'ເອກະສານການເງິນນີ້ອອກແລ້ວ/ກະປິດແລ້ວ — ແກ້ບໍ່ໄດ້, ໃຫ້ອອກໃບຄືນເງິນແທນ' },
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: ErrorCode.INTERNAL, message: 'ເກີດຂໍ້ຜິດພາດພາຍໃນ' } });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: ErrorCode.NOT_FOUND, message: 'ບໍ່ພົບ endpoint ນີ້' } });
}
