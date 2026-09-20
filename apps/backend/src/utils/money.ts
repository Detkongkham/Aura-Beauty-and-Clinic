import { Prisma } from '@prisma/client';

/**
 * Wave 10A (ອຸດ L1) — ລະບົບນີ້ໃຊ້ LAK ເປັນສະກຸນຫຼັກ (ISO 4217 minor unit = 0, ບໍ່ມີທົດສະນິຍົມ);
 * `round2` ຊື່ເກົ່າແຕ່ຕອນນີ້ປັດເປັນຈຳນວນເຕັມ. ຖ້າຕໍ່ໄປຮັບ THB/USD ຈິງ (Wave 10E) ຄ່ອຍເພີ່ມ
 * ຕົວປ່ຽນຄ່າຕາມ currency (@db.Decimal(16,2) ຍັງຮອງຮັບ 2dp ໄດ້ຢູ່ ຖ້າຕ້ອງການໃນອະນາຄົດ).
 */
export function round2(n: number): number {
  return Math.round(n + Number.EPSILON);
}

/** number | Decimal → number (ຈຳນວນເຕັມ LAK). */
export function toNum(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return round2(typeof v === 'number' ? v : v.toNumber());
}

/** number → Prisma.Decimal (ຈຳນວນເຕັມ LAK). */
export function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(round2(n).toFixed(0));
}
