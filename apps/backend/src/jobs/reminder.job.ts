import type { Job } from 'bullmq';
import { prisma } from '../config/database.js';
import { logger } from '../config/logger.js';
import { notifyUser } from '../services/push.js';
import { REMINDER_OFFSETS_HOURS } from '../constants/phase5.js';
import type { ReminderJobData } from './queues.js';

const SLACK_MS = 16 * 60_000; // sweep runs every 15 min — ໃຫ້ overlap ໜ້ອຍໜຶ່ງ

function fmtTime(d: Date): string {
  return d.toLocaleString('lo-LA', {
    timeZone: 'Asia/Vientiane',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Reminder sweep (Module 23) — ກວດນັດທີ່ຈະຮອດໃນອີກ ~24h ແລະ ~1h
 * ແລ້ວສົ່ງ push + ບັນທຶກ `NotificationLog`. `dedupeKey` ກັນສົ່ງຊ້ຳ.
 * ຮັບໄດ້ທັງ job 'sweep' (repeatable) ແລະ job ເກົ່າ 'schedule' (per-appointment enqueue).
 */
export async function processReminder(job: Job<ReminderJobData>): Promise<void> {
  const now = Date.now();
  let sent = 0;

  for (const offsetH of REMINDER_OFFSETS_HOURS) {
    const center = now + offsetH * 3_600_000;
    const from = new Date(center - SLACK_MS);
    const to = new Date(center + SLACK_MS);

    const appts = await prisma.appointment.findMany({
      where: {
        deletedAt: null,
        status: { in: ['PENDING', 'CONFIRMED'] },
        startAt: { gte: from, lte: to },
        ...(job.data.appointmentId ? { id: job.data.appointmentId } : {}),
      },
      select: {
        id: true,
        startAt: true,
        customerId: true,
        service: { select: { name: true } },
        branch: { select: { name: true } },
      },
    });

    for (const appt of appts) {
      const res = await notifyUser({
        userId: appt.customerId,
        type: 'APPOINTMENT_REMINDER',
        title: offsetH >= 24 ? 'ເຕືອນນັດໝາຍມື້ອື່ນ' : 'ນັດໝາຍຂອງທ່ານໃກ້ຮອດແລ້ວ',
        body: `${appt.service.name} ທີ່ ${appt.branch.name} — ${fmtTime(appt.startAt)}`,
        data: { appointmentId: appt.id, offsetHours: offsetH },
        dedupeKey: `reminder:${appt.id}:${offsetH}h`,
      });
      if (res.delivered) sent += 1;
    }
  }

  if (sent > 0) logger.info({ sent, job: job.name }, 'reminder sweep sent');
}
