import { describe, expect, it } from 'vitest';
import { computeAvailableSlots } from '../../src/modules/booking/slotEngine.js';

const DAY = new Date('2026-09-07T00:00:00.000Z'); // ວັນຈັນ

const workingHour = {
  startTime: '09:00',
  endTime: '18:00',
  breakStartTime: '12:00',
  breakEndTime: '13:00',
  isDayOff: false,
};

describe('computeAvailableSlots', () => {
  it('ຄືນ [] ຖ້າ isDayOff', () => {
    const slots = computeAvailableSlots({
      day: DAY,
      durationMinutes: 60,
      workingHour: { ...workingHour, isDayOff: true },
      busy: [],
    });
    expect(slots).toEqual([]);
  });

  it('ຄືນ [] ຖ້າບໍ່ມີ workingHour', () => {
    expect(
      computeAvailableSlots({ day: DAY, durationMinutes: 60, workingHour: null, busy: [] }),
    ).toEqual([]);
  });

  it('slot ທຳອິດເລີ່ມ 09:00 ແລະ slot ສຸດທ້າຍ + duration ≤ 18:00', () => {
    const slots = computeAvailableSlots({ day: DAY, durationMinutes: 60, workingHour, busy: [] });
    expect(slots[0]?.startAt.toISOString()).toBe('2026-09-07T09:00:00.000Z');
    const last = slots.at(-1)!;
    expect(last.endAt.toISOString()).toBe('2026-09-07T18:00:00.000Z');
  });

  it('ຂ້າມຊ່ວງພັກທ່ຽງ 12:00–13:00', () => {
    const slots = computeAvailableSlots({ day: DAY, durationMinutes: 60, workingHour, busy: [] });
    const startsAtNoonish = slots.filter((s) => {
      const h = s.startAt.getUTCHours();
      const m = s.startAt.getUTCMinutes();
      return (h === 11 && m > 0) || h === 12;
    });
    expect(startsAtNoonish).toHaveLength(0);
    expect(slots.some((s) => s.startAt.toISOString() === '2026-09-07T13:00:00.000Z')).toBe(true);
  });

  it('ຕັດ slot ທີ່ຊ້ອນກັບຄິວທີ່ຈອງແລ້ວ', () => {
    const busy = [
      { startAt: new Date('2026-09-07T10:00:00.000Z'), endAt: new Date('2026-09-07T11:00:00.000Z') },
    ];
    const slots = computeAvailableSlots({ day: DAY, durationMinutes: 60, workingHour, busy });
    expect(slots.some((s) => rangeOverlaps(s.startAt, s.endAt, busy[0]!.startAt, busy[0]!.endAt))).toBe(
      false,
    );
    // 09:00–10:00 ຍັງວ່າງ, 09:15 ຈະຊ້ອນ → ບໍ່ຄວນມີ
    expect(slots.some((s) => s.startAt.toISOString() === '2026-09-07T09:00:00.000Z')).toBe(true);
    expect(slots.some((s) => s.startAt.toISOString() === '2026-09-07T09:30:00.000Z')).toBe(false);
  });

  it('notBefore ຕັດ slot ໃນອະດີດ', () => {
    const slots = computeAvailableSlots({
      day: DAY,
      durationMinutes: 60,
      workingHour,
      busy: [],
      notBefore: new Date('2026-09-07T14:00:00.000Z'),
    });
    expect(slots.every((s) => s.startAt >= new Date('2026-09-07T14:00:00.000Z'))).toBe(true);
    expect(slots[0]?.startAt.toISOString()).toBe('2026-09-07T14:00:00.000Z');
  });
});

function rangeOverlaps(a1: Date, a2: Date, b1: Date, b2: Date): boolean {
  return a1 < b2 && a2 > b1;
}
