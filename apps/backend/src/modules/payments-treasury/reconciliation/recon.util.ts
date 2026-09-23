import { prisma } from '../../../config/database.js';
import { ApiError } from '../../../utils/ApiError.js';
import { vientianeDateKey } from '../../../utils/dateHelpers.js';

/** ໂມດູນ 39 — ຄ່າຄົງທີ່ ແລະ ຕົວຊ່ວຍຂອງການກະທົບຍອດ. */

export const DAY_MS = 24 * 60 * 60_000;
/** ຊ່ວງສູງສຸດຂອງການກະທົບຍອດຕໍ່ຄັ້ງ — ກັນ query ໃຫຍ່ເກີນໄປ. */
export const MAX_RECONCILE_DAYS = 62;
/** ທ່າຄ່າຄວາມຄາດເຄື່ອນ (ກີບ) ທີ່ຖືວ່າກົງກັນ. */
export const VARIANCE_EPSILON = 0.01;
/** ຜົນ webhook ທີ່ຕ້ອງໃຫ້ຄົນກວດ. */
export const ISSUE_RESULTS = ['AMOUNT_MISMATCH', 'OVERPAY', 'UNKNOWN_INTENT', 'PROVIDER_MISMATCH'] as const;
export const BANK_TENDERS = ['BANK_TRANSFER', 'BANK_QR'] as const;
export const OPEN_SLIP_VERDICTS = ['PENDING', 'AUTO_MATCHED', 'NEEDS_REVIEW'] as const;

/** G9 — AppSetting keys. */
export const RECON_REMINDER_SETTING_KEY = 'payments.recon.reminderEnabled';
export const RECON_ALERT_THRESHOLD_SETTING_KEY = 'payments.recon.varianceAlertThreshold';
export const DEFAULT_ALERT_THRESHOLD = 100_000;

export function keyToDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}
export function dateToKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function todayKeyVientiane(now = new Date()): string {
  return dateToKey(vientianeDateKey(now));
}
export function monthOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function assertRange(from: string, to: string): { fromDate: Date; toDate: Date } {
  const fromDate = keyToDate(from);
  const toDate = keyToDate(to);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw ApiError.badRequest('ວັນທີບໍ່ຖືກຕ້ອງ');
  }
  if (toDate < fromDate) throw ApiError.badRequest('ວັນທີສິ້ນສຸດຕ້ອງບໍ່ກ່ອນວັນທີເລີ່ມ');
  if ((toDate.getTime() - fromDate.getTime()) / DAY_MS + 1 > MAX_RECONCILE_DAYS) {
    throw ApiError.badRequest(`ຊ່ວງກະທົບຍອດຕ້ອງບໍ່ເກີນ ${MAX_RECONCILE_DAYS} ມື້`);
  }
  return { fromDate, toDate };
}

/** ເດືອນ (YYYY-MM) ທີ່ປິດງວດແລ້ວ ຂອງສາຂາ ໃນລາຍການເດືອນທີ່ໃຫ້ມາ. */
export async function lockedMonths(branchIds: string[], months: string[]): Promise<Set<string>> {
  if (!branchIds.length || !months.length) return new Set();
  const rows = await prisma.reconciliationPeriod.findMany({
    where: { branchId: { in: branchIds }, month: { in: months } },
    select: { branchId: true, month: true },
  });
  return new Set(rows.map((r) => `${r.branchId}|${r.month}`));
}

/** G5 — 409 ຖ້າມື້ນີ້ຢູ່ໃນງວດທີ່ປິດແລ້ວ. */
export async function assertNotLocked(branchId: string, dateKey: string): Promise<void> {
  const p = await prisma.reconciliationPeriod.findUnique({
    where: { branchId_month: { branchId, month: monthOf(dateKey) } },
    select: { id: true },
  });
  if (p) throw ApiError.conflict(`ງວດ ${monthOf(dateKey)} ປິດແລ້ວ — ແກ້ໄຂບໍ່ໄດ້ (ຕ້ອງເປີດງວດຄືນກ່ອນ)`);
}

/** months YYYY-MM ທີ່ຊ່ວງ [from, to] ກວມ. */
export function monthsInRange(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
