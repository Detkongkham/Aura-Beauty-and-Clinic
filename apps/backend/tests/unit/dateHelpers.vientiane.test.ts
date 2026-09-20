import { describe, expect, it } from 'vitest';
import {
  minutesOfDayVientiane,
  vientianeDateKey,
  vientianeDayOfWeek,
  vientianeDayRangeOf,
  vientianeDayStart,
} from '../../src/utils/dateHelpers.js';
import { computeAvailableSlots } from '../../src/modules/booking/slotEngine.js';

describe('Asia/Vientiane helpers (UTC+7)', () => {
  it('rolls the calendar day at Vientiane midnight, not UTC midnight', () => {
    const at = new Date('2026-09-13T18:30:00Z'); // Sunday 18:30 UTC = Monday 01:30 Vientiane
    expect(vientianeDateKey(at).toISOString()).toBe('2026-09-14T00:00:00.000Z');
    expect(vientianeDayOfWeek(at)).toBe(1);
    expect(minutesOfDayVientiane(at)).toBe(90);
  });

  it('day start/range = 00:00–24:00 Vientiane as UTC instants', () => {
    expect(vientianeDayStart(new Date('2026-09-14')).toISOString()).toBe('2026-09-13T17:00:00.000Z');
    const r = vientianeDayRangeOf(new Date('2026-09-14T16:59:00Z')); // 23:59 local
    expect(r.start.toISOString()).toBe('2026-09-13T17:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-09-14T17:00:00.000Z');
  });

  it('slot engine places working hours on Vientiane wall-clock', () => {
    const slots = computeAvailableSlots({
      day: vientianeDayStart(new Date('2026-09-14')),
      durationMinutes: 60,
      workingHour: { startTime: '09:00', endTime: '11:00', breakStartTime: null, breakEndTime: null, isDayOff: false },
      busy: [],
      granularityMinutes: 60,
    });
    expect(slots.map((s) => s.startAt.toISOString())).toEqual([
      '2026-09-14T02:00:00.000Z', // 09:00 Vientiane
      '2026-09-14T03:00:00.000Z', // 10:00 Vientiane
    ]);
  });
});
