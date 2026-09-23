import type { CashPolicy } from '@abcp/shared-types';
import { prisma } from '../../../config/database.js';
import { env } from '../../../config/env.js';
import { ErrorCode } from '../../../constants/errorCodes.js';
import { ApiError } from '../../../utils/ApiError.js';

/**
 * Wave 10C — ນະໂຍບາຍເງິນສົດ. ຄ່າໃນ AppSetting 'finance-cash' ຊະນະ ຄ່າ default ຂອງ env (CASH_REQUIRE_OPEN_DRAWER).
 * ເປີດ (default ໃນ production) = ຮັບເງິນສົດ / ຈ່າຍຄືນເງິນສົດ ໄດ້ສະເພາະເມື່ອສາຂານັ້ນມີກະລິ້ນຊັກເປີດຢູ່ → ເງິນສົດທຸກບາດມີກະ/ຜູ້ຮັບຜິດຊອບ.
 */
const KEY = 'finance-cash';

export async function getCashPolicy(): Promise<CashPolicy> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  const stored = (row?.value as Partial<CashPolicy> | undefined)?.requireOpenDrawer;
  return { requireOpenDrawer: typeof stored === 'boolean' ? stored : env.CASH_REQUIRE_OPEN_DRAWER === 'true' };
}

export async function updateCashPolicy(input: CashPolicy): Promise<CashPolicy> {
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: input }, update: { value: input } });
  return input;
}

/** ຖ້ານະໂຍບາຍບັງຄັບ ແລະ ສາຂານັ້ນບໍ່ມີກະເປີດ → 409 CASH_DRAWER_REQUIRED. */
export async function assertCashDrawerOpen(branchId: string): Promise<void> {
  const policy = await getCashPolicy();
  if (!policy.requireOpenDrawer) return;
  const open = await prisma.cashDrawerSession.findFirst({ where: { branchId, status: 'OPEN' }, select: { id: true } });
  if (!open) {
    throw new ApiError(409, ErrorCode.CASH_DRAWER_REQUIRED, 'ຕ້ອງເປີດກະລິ້ນຊັກຂອງສາຂາກ່ອນ ຈຶ່ງຮັບ/ຈ່າຍຄືນເງິນສົດໄດ້');
  }
}
