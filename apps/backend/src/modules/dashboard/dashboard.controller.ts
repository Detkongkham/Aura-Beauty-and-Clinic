import type { Request, Response } from 'express';
import type { AccessTokenPayload, DashboardStatsQuery } from '@abcp/shared-types';
import { ApiError } from '../../utils/ApiError.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import * as dashboardService from './dashboard.service.js';

/**
 * ສາຂາທີ່ຜູ້ເອີ້ນມີສິດເບິ່ງ. SUPER_ADMIN ເລືອກໄດ້ທຸກສາຂາ (ລວມ 'all').
 * BRANCH_ADMIN ຖືກບັງຄັບໃຫ້ເປັນສາຂາຂອງຕົນ — 'all' ຖືກແປງເປັນສາຂາຕົນ (web-admin ສົ່ງ 'all'
 * ເປັນຄ່າເລີ່ມຕົ້ນ), ສາຂາອື່ນ → 403, ບໍ່ມີສາຂາຜູກ → 403.
 */
export function resolveDashboardBranch(
  auth: AccessTokenPayload | undefined,
  requested: DashboardStatsQuery['branchId'],
): DashboardStatsQuery['branchId'] {
  if (auth?.role === 'SUPER_ADMIN') return requested;
  const own = auth?.branchId;
  if (!own) throw ApiError.forbidden('ບັນຊີນີ້ຍັງບໍ່ໄດ້ຜູກກັບສາຂາ');
  if (requested !== 'all' && requested !== own) {
    throw ApiError.forbidden('ເບິ່ງໄດ້ສະເພາະຂໍ້ມູນສາຂາຂອງທ່ານ');
  }
  return own;
}

/** GET /dashboard/stats */
export const dashboardStatsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as DashboardStatsQuery;
  const data = await dashboardService.getDashboardStats({
    ...query,
    branchId: resolveDashboardBranch(req.auth, query.branchId),
  });
  res.json({ data });
});
