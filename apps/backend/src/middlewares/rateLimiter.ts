import rateLimit from 'express-rate-limit';
import { ErrorCode } from '../constants/errorCodes.js';

const payload = {
  error: { code: ErrorCode.RATE_LIMITED, message: 'ຮ້ອງຂໍຫຼາຍເກີນໄປ ກະລຸນາລໍຖ້າ' },
};

/** ໃຊ້ທົ່ວໄປ: 300 req / 15 ນາທີ / IP. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: payload,
});

/** ເຄັ່ງຄັດສຳລັບ auth: 10 req / 15 ນາທີ / IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: payload,
});

/** ກັນ spam ສ້າງຫ້ອງແຊັດ DIRECT ໃໝ່ (Module 38 Wave 8D) — 20 req / 15 ນາທີ / IP, ຂ້າມ request
 * ອື່ນທີ່ບໍ່ແມ່ນ `POST /conversations {type:'DIRECT'}` (STAFF_INTERNAL ບໍ່ຈຳກັດເຄັ່ງຄັດແບບນີ້). */
export const directConversationLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: payload,
  skip: (req) => (req.body as { type?: string } | undefined)?.type !== 'DIRECT',
});
