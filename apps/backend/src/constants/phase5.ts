/**
 * Phase 5 (Finance & Marketing) — tunables.
 * ຄ່າ business ທີ່ບໍ່ຄວນ hard-code ກະຈາຍ; ບາງຄ່າ override ໄດ້ຜ່ານ AppSetting.
 */

/** AppSetting key ສຳລັບອັດຕາມັດຈຳ (0.2–0.5). */
export const DEPOSIT_RATE_SETTING_KEY = 'finance.depositRate';

/** ນາທີກ່ອນ QR/charge intent ໝົດອາຍຸ. */
export const DEPOSIT_INTENT_TTL_MINUTES = 15;

/** reminder offsets (ຊົ່ວໂມງກ່ອນ startAt) — Module 23. */
export const REMINDER_OFFSETS_HOURS = [24, 1] as const;
