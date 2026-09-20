import dayjs from 'dayjs';
import i18n from '../../i18n';
import { vientiane } from '../../lib/format';

/**
 * ຊື່ວັນ/ເດືອນຕາມພາສາ UI. dayjs ມີແຕ່ locale `en` (ບໍ່ມີລາວ) ຈຶ່ງໃຊ້ຕາຕະລາງເອງ.
 * ໃຊ້ `vientiane()` ສຳລັບ ISO datetime; 'YYYY-MM-DD' ໃຊ້ dayjs ດິບ (ບໍ່ມີເວລາ, ບໍ່ມີ tz shift).
 */
const LAO_MONTHS = [
  'ມັງກອນ', 'ກຸມພາ', 'ມີນາ', 'ເມສາ', 'ພຶດສະພາ', 'ມິຖຸນາ',
  'ກໍລະກົດ', 'ສິງຫາ', 'ກັນຍາ', 'ຕຸລາ', 'ພະຈິກ', 'ທັນວາ',
];
const LAO_DOW_SHORT = ['ອາ', 'ຈັນ', 'ອັງ', 'ພຸດ', 'ພະ', 'ສຸກ', 'ເສົາ'];
const LAO_DOW_FULL = ['ອາທິດ', 'ຈັນ', 'ອັງຄານ', 'ພຸດ', 'ພະຫັດ', 'ສຸກ', 'ເສົາ'];

function isLao(): boolean {
  return (i18n.language ?? 'lo').startsWith('lo');
}

type D = dayjs.Dayjs;

export function monthName(d: D): string {
  return isLao() ? LAO_MONTHS[d.month()]! : d.format('MMMM');
}

export function dowShort(d: D): string {
  return isLao() ? LAO_DOW_SHORT[d.day()]! : d.format('ddd');
}

export function dowFull(d: D): string {
  return isLao() ? `ວັນ${LAO_DOW_FULL[d.day()]}` : d.format('dddd');
}

/** "ວັນພຸດ 17 ກັນຍາ" / "Wednesday 17 September". */
export function longDate(d: D): string {
  return `${dowFull(d)} ${d.format('D')} ${monthName(d)}`;
}

/** "17 ກັນຍາ 2026". */
export function mediumDate(d: D): string {
  return `${d.format('D')} ${monthName(d)} ${d.format('YYYY')}`;
}

/** ISO datetime → dayjs ເວລາວຽງຈັນ. */
export function vt(iso: string): D {
  return vientiane(iso);
}

/** 'YYYY-MM-DD' → dayjs (ບໍ່ມີ tz). */
export function ymd(date: string): D {
  return dayjs(date);
}

/** ຈຳນວນວັນຈາກມື້ນີ້ (ເວລາວຽງຈັນ) ເຖິງ ISO ນັ້ນ: 0 = ມື້ນີ້, 1 = ມື້ອື່ນ. */
export function daysFromToday(iso: string): number {
  const today = vientiane().startOf('day');
  const target = vientiane(iso).startOf('day');
  return Math.round(target.diff(today, 'day', true));
}
