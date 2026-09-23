import type { AccessTokenPayload } from '@abcp/shared-types';

declare global {
  namespace Express {
    interface Request {
      /** ຖືກ set ໂດຍ authGuard ຫຼັງ verify JWT access token. */
      auth?: AccessTokenPayload;
      /** byte ດິບຂອງ request body — ໃຊ້ກວດ HMAC ຂອງ webhook. */
      rawBody?: Buffer;
    }
  }
}

export {};
