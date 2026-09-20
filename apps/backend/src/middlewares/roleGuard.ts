import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@abcp/shared-types';
import { ApiError } from '../utils/ApiError.js';

/** ອະນຸຍາດສະເພາະ role ທີ່ລະບຸ. ຕ້ອງໃຊ້ຫຼັງ authGuard. */
export function roleGuard(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(ApiError.unauthorized());
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(ApiError.forbidden('ບົດບາດຂອງທ່ານບໍ່ມີສິດເຮັດລາຍການນີ້'));
      return;
    }
    next();
  };
}
