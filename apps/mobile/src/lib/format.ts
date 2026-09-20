import dayjs from 'dayjs';
import 'dayjs/locale/en';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(localizedFormat);

/**
 * ເຂດເວລານະຄອນຫຼວງວຽງຈັນ = UTC+7 ຄົງທີ່ (ລາວບໍ່ມີ DST).
 * ໃຊ້ offset ຕາຍຕົວແທນ dayjs `.tz()` ເພາະ Hermes ບໍ່ມີ Intl timezone data —
 * `dayjs(x).tz('Asia/Vientiane')` ຈະຄືນ `Invalid Date` ເທິງເຄື່ອງຈິງ.
 */
export const TZ = 'Asia/Vientiane';
const VIENTIANE_OFFSET_MINUTES = 7 * 60;

/** dayjs object ທີ່ສະແດງເປັນ wall-clock ວຽງຈັນ (UTC+7). */
export function vientiane(value?: string | number | Date | dayjs.Dayjs): dayjs.Dayjs {
  return dayjs(value).utcOffset(VIENTIANE_OFFSET_MINUTES);
}

/** ₭ 250,000 — ບໍ່ມີທົດສະນິຍົມ (LAK). */
export function formatLAK(amount: number): string {
  return `₭ ${Math.round(amount).toLocaleString('en-US')}`;
}

export function formatDate(iso: string): string {
  return vientiane(iso).format('D MMM YYYY');
}

export function formatTime(iso: string): string {
  return vientiane(iso).format('HH:mm');
}

export function formatDateTime(iso: string): string {
  return vientiane(iso).format('D MMM YYYY · HH:mm');
}

/** 'YYYY-MM-DD' ຂອງ N ວັນຂ້າງໜ້າ (ຕາມ tz ຮ້ານ). */
export function isoDateInDays(daysAhead: number): string {
  return vientiane().add(daysAhead, 'day').format('YYYY-MM-DD');
}

export function slotBucket(iso: string): 'morning' | 'afternoon' | 'evening' {
  const h = vientiane(iso).hour();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
