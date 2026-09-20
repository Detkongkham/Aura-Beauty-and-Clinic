import {
  addMinutes,
  MINUTE_MS,
  rangesOverlap,
  timeStringToMinutes,
} from '../../utils/dateHelpers.js';
import { SLOT_GRANULARITY_MINUTES } from '../../constants/index.js';

export type WorkingWindow = {
  /** ນາທີນັບຈາກ 00:00 (local wall-clock) */
  startMinutes: number;
  endMinutes: number;
  breakStartMinutes: number | null;
  breakEndMinutes: number | null;
  isDayOff: boolean;
};

export type BusyInterval = {
  startAt: Date;
  endAt: Date;
};

export type ComputeSlotsInput = {
  /** Instant ຂອງ 00:00 ທ້ອງຖິ່ນ (ວຽງຈັນ) ຂອງມື້ເປົ້າໝາຍ — ເບິ່ງ `vientianeDayStart()`.
   * working hours "HH:MM" ຖືກບວກເປັນນາທີຈາກຈຸດນີ້. */
  day: Date;
  durationMinutes: number;
  workingHour: {
    startTime: string;
    endTime: string;
    breakStartTime: string | null;
    breakEndTime: string | null;
    isDayOff: boolean;
  } | null;
  /** ຄິວທີ່ຖືກຈອງແລ້ວ + ຊ່ວງລາພັກ (time-off) ຂອງຊ່າງຄົນນັ້ນ. */
  busy: BusyInterval[];
  granularityMinutes?: number;
  /** ຫ້າມ slot ທີ່ເລີ່ມກ່ອນເວລານີ້ (ເຊັ່ນ ຕອນນີ້ + lead time). */
  notBefore?: Date;
};

export type SlotResult = { startAt: Date; endAt: Date };

function toWindow(wh: ComputeSlotsInput['workingHour']): WorkingWindow | null {
  if (!wh || wh.isDayOff) return null;
  return {
    startMinutes: timeStringToMinutes(wh.startTime),
    endMinutes: timeStringToMinutes(wh.endTime),
    breakStartMinutes: wh.breakStartTime ? timeStringToMinutes(wh.breakStartTime) : null,
    breakEndMinutes: wh.breakEndTime ? timeStringToMinutes(wh.breakEndTime) : null,
    isDayOff: false,
  };
}

/**
 * Booking Slot Engine (Module 04).
 * ຄິດໄລ່ slot ວ່າງແບບ pure — ບໍ່ແຕະ DB. ໃຊ້ half-open interval [start, end).
 * ປ້ອງກັນເວລາຊ້ອນ, ຂ້າມຊ່ວງພັກທ່ຽງ, ວັນພັກ, ແລະ busy intervals.
 */
export function computeAvailableSlots(input: ComputeSlotsInput): SlotResult[] {
  const {
    day,
    durationMinutes,
    busy,
    granularityMinutes = SLOT_GRANULARITY_MINUTES,
    notBefore,
  } = input;

  const win = toWindow(input.workingHour);
  if (!win || durationMinutes <= 0) return [];

  const dayStart = addMinutes(day, win.startMinutes);
  const dayEnd = addMinutes(day, win.endMinutes);

  const blockers: BusyInterval[] = [...busy];
  if (win.breakStartMinutes != null && win.breakEndMinutes != null) {
    blockers.push({
      startAt: addMinutes(day, win.breakStartMinutes),
      endAt: addMinutes(day, win.breakEndMinutes),
    });
  }

  const slots: SlotResult[] = [];
  for (
    let cursor = new Date(dayStart);
    (cursor.getTime() - day.getTime()) / MINUTE_MS + durationMinutes <= win.endMinutes &&
    cursor < dayEnd;
    cursor = addMinutes(cursor, granularityMinutes)
  ) {
    const slotStart = new Date(cursor);
    const slotEnd = addMinutes(slotStart, durationMinutes);

    if (notBefore && slotStart < notBefore) continue;

    const clashes = blockers.some((b) => rangesOverlap(slotStart, slotEnd, b.startAt, b.endAt));
    if (clashes) continue;

    slots.push({ startAt: slotStart, endAt: slotEnd });
  }

  return slots;
}
