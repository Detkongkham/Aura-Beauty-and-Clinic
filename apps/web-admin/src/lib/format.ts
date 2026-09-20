import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

import { APP_TIMEZONE, DATE_FORMAT, TIME_FORMAT } from './constants';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(customParseFormat);
dayjs.tz.setDefault(APP_TIMEZONE);

export type DateInput = string | number | Date | dayjs.Dayjs | null | undefined;

const EN_DASH = '–';

/** LAK currency: `kip 250,000`, no decimals (design.md section 9). Accepts LAK/THB/USD. */
export function formatCurrency(
  amount: number | null | undefined,
  currency: 'LAK' | 'THB' | 'USD' = 'LAK',
): string {
  if (amount == null || Number.isNaN(amount)) return EN_DASH;
  const symbol = currency === 'LAK' ? '₭' : currency === 'THB' ? '฿' : '$';
  const fractionDigits = currency === 'LAK' ? 0 : 2;
  const n = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(currency === 'LAK' ? Math.round(amount) : amount);
  return `${symbol} ${n}`;
}

/** Abbreviated figure for stat cards (`1.2K`, `3.4M`). Full value belongs in a title attr. */
export function formatCompactNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return EN_DASH;
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

const toVientiane = (value: DateInput) => dayjs(value ?? undefined).tz(APP_TIMEZONE);

/**
 * Active date pattern — defaults to {@link DATE_FORMAT} but is repointed at
 * Settings ▸ Localization ▸ Date format by `useApplySystemSettings` (mounted
 * once in AppShell) so every `formatDate`/`formatDateTime` call in the app
 * picks it up without each call site knowing about Settings.
 */
let activeDateFormat: string = DATE_FORMAT;

export function setActiveDateFormat(pattern: string): void {
  activeDateFormat = pattern;
}

export type WeekStart = 'mon' | 'sun';

/** Active week-start day — same live-repoint pattern as {@link setActiveDateFormat}. */
let activeWeekStart: WeekStart = 'sun';

export function setActiveWeekStart(value: WeekStart): void {
  activeWeekStart = value;
}

/** Current week-start setting — for views that lay days out themselves (e.g. the pricing week grid). */
export function getActiveWeekStart(): WeekStart {
  return activeWeekStart;
}

/** Monday- or Sunday-anchored start of `d`'s week, per Settings ▸ Localization ▸ "Week starts on". */
export function startOfWeekApp(d: dayjs.Dayjs): dayjs.Dayjs {
  const startDow = activeWeekStart === 'mon' ? 1 : 0;
  const diff = (d.day() - startDow + 7) % 7;
  return d.subtract(diff, 'day').startOf('day');
}

export function formatDate(value: DateInput): string {
  if (value == null) return EN_DASH;
  const d = toVientiane(value);
  return d.isValid() ? d.format(activeDateFormat) : EN_DASH;
}

export function formatTime(value: DateInput): string {
  if (value == null) return EN_DASH;
  const d = toVientiane(value);
  return d.isValid() ? d.format(TIME_FORMAT) : EN_DASH;
}

export function formatDateTime(value: DateInput): string {
  if (value == null) return EN_DASH;
  const d = toVientiane(value);
  return d.isValid() ? d.format(`${activeDateFormat} ${TIME_FORMAT}`) : EN_DASH;
}

type RelativeUnit = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

const RELATIVE_UNITS: [RelativeUnit, number][] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
  ['second', 1000],
];

/** Lao unit nouns for {@link formatRelative}. */
const LAO_RELATIVE_UNIT: Record<RelativeUnit, string> = {
  year: 'ປີ',
  month: 'ເດືອນ',
  day: 'ມື້',
  hour: 'ຊົ່ວໂມງ',
  minute: 'ນາທີ',
  second: 'ວິນາທີ',
};

/**
 * Lao relative time, hand-rolled because `Intl.RelativeTimeFormat('lo')` is not
 * supported in most runtimes and silently falls back to the host locale (which
 * has produced Thai output). Past → `N ໜ່ວຍກ່ອນ`, future → `ອີກ N ໜ່ວຍ`.
 */
function formatRelativeLao(diffMs: number): string {
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diffMs) < ms && unit !== 'second') continue;
    const n = Math.round(diffMs / ms);
    if (n === 0) return 'ຕອນນີ້';
    if (unit === 'day' && n === -1) return 'ມື້ວານນີ້';
    if (unit === 'day' && n === 1) return 'ມື້ອື່ນ';
    const label = LAO_RELATIVE_UNIT[unit];
    return n < 0 ? `${-n} ${label}ກ່ອນ` : `ອີກ ${n} ${label}`;
  }
  return 'ຕອນນີ້';
}

/** Relative time for feeds/notifications only; pair with an absolute value in a title attr. */
export function formatRelative(value: DateInput, locale: 'lo' | 'en' = 'lo'): string {
  if (value == null) return EN_DASH;
  const d = toVientiane(value);
  if (!d.isValid()) return EN_DASH;
  const diffMs = d.valueOf() - Date.now();
  if (locale === 'lo') return formatRelativeLao(diffMs);

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, ms] of RELATIVE_UNITS) {
    if (Math.abs(diffMs) >= ms || unit === 'second') {
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return rtf.format(Math.round(diffMs / 1000), 'second');
}

export { EN_DASH, dayjs };
