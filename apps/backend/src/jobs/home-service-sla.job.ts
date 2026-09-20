import type { Job } from 'bullmq';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import { notifyBranchAdmins } from '../modules/home-service/home-service.service.js';
import {
  HOME_SERVICE_SLA_LATE_BUFFER_MINUTES,
  HOME_SERVICE_SLA_NO_MATCH_MINUTES,
  HOME_SERVICE_SLA_RENOTIFY_MINUTES,
} from '../constants/phase7.js';
import type { HomeServiceSlaJobData } from './queues.js';

/** ບັນຊະລະຄືນທຸກ N ນາທີ — ໃຊ້ bucket ເປັນສ່ວນໜຶ່ງຂອງ dedupeKey ກັນສົ່ງຊ້ຳຖີ່ເກີນໄປ. */
function renotifyBucket(now: number): number {
  return Math.floor(now / (HOME_SERVICE_SLA_RENOTIFY_MINUTES * 60_000));
}

/**
 * SLA sweep (ໂມດູນ 29) — ແລ່ນທຸກ 5 ນາທີ (queues.ts), ກວດ:
 *  1. trip NO_MATCH/MATCHING ຄ້າງດົນເກີນເກນ → ແຈ້ງ branch admin ໃຫ້ມາຈັດຊ່າງ.
 *  2. trip ASSIGNED/EN_ROUTE ທີ່ຊ່າງອາດຊ້າກວ່າ ETA ບວກ buffer → ແຈ້ງ branch admin.
 * dedupeKey ປະສົມ tripId + bucket ເວລາ ກັນແຈ້ງຊ້ຳຖີ່ເກີນໄປ (renotify ທຸກ N ນາທີ).
 */
export async function processHomeServiceSla(_job: Job<HomeServiceSlaJobData>): Promise<void> {
  const now = Date.now();
  const bucket = renotifyBucket(now);
  let notified = 0;

  const stale = await prisma.homeServiceTrip.findMany({
    where: {
      status: { in: ['NO_MATCH', 'MATCHING'] },
      createdAt: { lte: new Date(now - HOME_SERVICE_SLA_NO_MATCH_MINUTES * 60_000) },
    },
    select: {
      id: true,
      status: true,
      appointment: { select: { branchId: true, customer: { select: { name: true } } } },
    },
  });
  for (const trip of stale) {
    await notifyBranchAdmins(trip.appointment.branchId, {
      type: 'HOME_SERVICE_SLA_NO_MATCH',
      title: 'Home Service ຄ້າງດົນ — ຕ້ອງການຄວາມສົນໃຈ',
      body: `${trip.appointment.customer.name} ຍັງບໍ່ໄດ້ຈັບຄູ່ຊ່າງ (${trip.status})`,
      data: { tripId: trip.id },
      dedupeKey: `sla:no-match:${trip.id}:${bucket}`,
    });
    notified += 1;
  }

  const active = await prisma.homeServiceTrip.findMany({
    where: { status: { in: ['ASSIGNED', 'EN_ROUTE'] }, etaMinutes: { not: null } },
    select: {
      id: true,
      etaMinutes: true,
      assignedAt: true,
      enRouteAt: true,
      appointment: { select: { branchId: true, customer: { select: { name: true } } } },
    },
  });
  for (const trip of active) {
    const startedFrom = trip.enRouteAt ?? trip.assignedAt;
    if (!startedFrom || trip.etaMinutes == null) continue;
    const budgetMs = (trip.etaMinutes + HOME_SERVICE_SLA_LATE_BUFFER_MINUTES) * 60_000;
    if (now - startedFrom.getTime() < budgetMs) continue;

    await notifyBranchAdmins(trip.appointment.branchId, {
      type: 'HOME_SERVICE_SLA_LATE',
      title: 'ຊ່າງ Home Service ອາດຊ້າ',
      body: `${trip.appointment.customer.name} — ຊ່າງຊ້າກວ່າ ETA ທີ່ຄາດໄວ້`,
      data: { tripId: trip.id },
      dedupeKey: `sla:late:${trip.id}:${bucket}`,
    });
    notified += 1;
  }

  if (notified > 0) logger.info({ notified }, 'home-service SLA sweep sent');
}
