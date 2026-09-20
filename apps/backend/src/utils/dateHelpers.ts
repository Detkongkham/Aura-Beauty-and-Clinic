import { Prisma } from '@prisma/client';
/** ຕົວຊ່ວຍເລື່ອງ DateTime ສຳລັບ Booking Slot Engine (startAt/endAt). */

export const MINUTE_MS = 60_000;

/** ປ່ຽນ "HH:MM" → ນາທີນັບຈາກ 00:00 */
export function timeStringToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** ຄ່າ minutesFromMidnight ຂອງ Date ຕາມ UTC (schedule ເກັບເປັນ local wall-clock string). */
export function minutesOfDayUTC(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MINUTE_MS);
}

/** ຕົ້ນວັນ (UTC) ຂອງ date ທີ່ໃຫ້ມາ */
export function startOfDayUTC(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function endOfDayUTC(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/** ສ້າງ Date ຈາກ (ວັນທີ base) + ນາທີໃນມື້ນັ້ນ, ອີງ UTC. */
export function dateAtMinutesUTC(baseDay: Date, minutesFromMidnight: number): Date {
  const d = startOfDayUTC(baseDay);
  return addMinutes(d, minutesFromMidnight);
}

/** ກວດວ່າ 2 ຊ່ວງເວລາຊ້ອນກັນ (half-open: [start, end)). */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

// ---- Asia/Vientiane wall-clock -------------------------------------------
// ຕາຕະລາງ (WorkingHour, DynamicPricingRule, …) ເກັບ "HH:MM" + dayOfWeek ເປັນເວລາທ້ອງຖິ່ນວຽງຈັນ.
// DB/API ເກັບ instant ຈິງ (UTC). ວຽງຈັນ = UTC+7 ຄົງທີ່ (ບໍ່ມີ DST) → ໃຊ້ offset ຕາຍຕົວ.

export const VIENTIANE_OFFSET_MINUTES = 7 * 60;
const VTE_OFFSET_MS = VIENTIANE_OFFSET_MINUTES * MINUTE_MS;

/** ວັນທີປະຕິທິນ (Date ທີ່ UTC-midnight) ຂອງມື້ວຽງຈັນທີ່ `at` ຕົກຢູ່ — ໃຊ້ເປັນ key ຂອງ @db.Date. */
export function vientianeDateKey(at: Date): Date {
  const shifted = new Date(at.getTime() + VTE_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/** Instant ຂອງ 00:00 ວຽງຈັນ ໃນວັນທີປະຕິທິນ `dateKey` (ອ່ານ Y-M-D ຕາມ UTC ເຊັ່ນ `new Date('2026-09-20')`). */
export function vientianeDayStart(dateKey: Date): Date {
  return new Date(
    Date.UTC(dateKey.getUTCFullYear(), dateKey.getUTCMonth(), dateKey.getUTCDate()) - VTE_OFFSET_MS,
  );
}

/** [00:00, 24:00) ວຽງຈັນ ຂອງມື້ທີ່ `at` ຕົກຢູ່ (end exclusive). */
export function vientianeDayRangeOf(at: Date): { start: Date; end: Date } {
  const start = vientianeDayStart(vientianeDateKey(at));
  return { start, end: new Date(start.getTime() + 24 * 60 * MINUTE_MS) };
}

/** 0=ອາທິດ … 6=ເສົາ ຕາມເວລາວຽງຈັນ. */
export function vientianeDayOfWeek(at: Date): number {
  return vientianeDateKey(at).getUTCDay();
}

/** ນາທີນັບຈາກ 00:00 ວຽງຈັນ. */
export function minutesOfDayVientiane(at: Date): number {
  return Math.floor((at.getTime() - vientianeDayStart(vientianeDateKey(at)).getTime()) / MINUTE_MS);
}

/**
 * A `Date` as a raw-SQL parameter for a `timestamp without time zone` column.
 *
 * Prisma binds a JS `Date` in `$queryRaw` as **timestamptz**. Our datetime
 * columns are `timestamp without time zone` holding UTC instants, and this
 * deployment's Postgres session runs `TimeZone = 'Asia/Vientiane'`, so
 * comparing the two makes Postgres reinterpret the column in +07:00 — every
 * comparison silently lands 7 hours off and quietly matches nothing (or the
 * wrong rows).
 *
 * Passing the ISO string and casting it explicitly keeps the value naive-UTC,
 * exactly how Prisma wrote it:
 *
 * ```ts
 * WHERE "startAt" < ${tsParam(endAt)}
 * ```
 *
 * Use this for **every** date bound into a raw query. `NOW()` and
 * `INTERVAL` arithmetic inside SQL are unaffected.
 */
export function tsParam(value: Date): Prisma.Sql {
  return Prisma.sql`${value.toISOString()}::timestamp`;
}
