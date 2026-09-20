import type { NextFunction, Request, Response } from 'express';

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** ຫໍ່ async route handler ໃຫ້ error ຖືກສົ່ງໄປ errorHandler ໂດຍອັດຕະໂນມັດ. */
export const asyncHandler =
  (fn: AsyncRoute) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
