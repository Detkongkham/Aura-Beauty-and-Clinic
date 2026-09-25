import type { BranchDayHours } from '@abcp/shared-types';

/** Wave 11 — editable state for the branch fields added on top of the original form. */
export type BranchExtras = {
  perDay: boolean;
  weeklyHours: BranchDayHours[];
  managerUserId: string;
  coverImageUrl: string;
  photoUrls: string[];
  revenueTarget: string;
  bookingTarget: string;
};

/** Seven rows (Sun → Sat) from the stored schedule, falling back to the single open/close pair. */
export function fullWeek(stored: BranchDayHours[] | null | undefined, open: string, close: string): BranchDayHours[] {
  return Array.from({ length: 7 }, (_, day) => stored?.find((d) => d.day === day) ?? { day, open, close, closed: false });
}

export function extrasFrom(
  b: {
    weeklyHours?: BranchDayHours[] | null;
    managerUserId?: string | null;
    coverImageUrl?: string | null;
    photoUrls?: string[];
    monthlyRevenueTarget?: number | null;
    monthlyBookingTarget?: number | null;
    openTime?: string;
    closeTime?: string;
  } | null,
): BranchExtras {
  const open = b?.openTime ?? '09:00';
  const close = b?.closeTime ?? '20:00';
  return {
    perDay: Boolean(b?.weeklyHours?.length),
    weeklyHours: fullWeek(b?.weeklyHours, open, close),
    managerUserId: b?.managerUserId ?? '',
    coverImageUrl: b?.coverImageUrl ?? '',
    photoUrls: b?.photoUrls ?? [],
    revenueTarget: b?.monthlyRevenueTarget != null ? String(b.monthlyRevenueTarget) : '',
    bookingTarget: b?.monthlyBookingTarget != null ? String(b.monthlyBookingTarget) : '',
  };
}

export function extrasInvalid(x: BranchExtras): boolean {
  return x.perDay && x.weeklyHours.some((d) => !d.closed && d.open >= d.close);
}

export function extrasPayload(x: BranchExtras) {
  const num = (s: string) => (s.trim() === '' ? null : Math.max(0, Math.round(Number(s) || 0)));
  return {
    weeklyHours: x.perDay ? x.weeklyHours : null,
    managerUserId: x.managerUserId || null,
    coverImageUrl: x.coverImageUrl.trim() || null,
    photoUrls: x.photoUrls,
    monthlyRevenueTarget: num(x.revenueTarget),
    monthlyBookingTarget: num(x.bookingTarget),
  };
}
