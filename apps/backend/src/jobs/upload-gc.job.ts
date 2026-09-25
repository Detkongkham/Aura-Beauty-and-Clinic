import type { Job } from 'bullmq';
import { logger } from '../config/logger.js';
import { sweepOrphanServiceImages } from '../modules/services-admin/services-admin.service.js';

/**
 * ທຸກຄືນ 03:45 (Asia/Vientiane): ລຶບຮູບບໍລິການ/ໝວດໝູ່ທີ່ອັບໂຫລດແລ້ວບໍ່ໄດ້ບັນທຶກ
 * (ປິດແທັບ, ຟອມຄ້າງ…) — ເກີນ 24 ຊົ່ວໂມງ ແລະ ບໍ່ມີແຖວໃດອ້າງອີງ.
 */
export async function processUploadGc(_job: Job): Promise<void> {
  const services = await sweepOrphanServiceImages();
  logger.info({ services }, 'upload-gc nightly: orphan service images swept');
}
