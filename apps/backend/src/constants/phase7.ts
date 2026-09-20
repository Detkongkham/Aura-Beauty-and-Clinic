/**
 * Phase 7 (Revenue, AI & ການຄ້າ) — tunables.
 */

/** ປັດລາຄາຫຼັງ dynamic-pricing ໃຫ້ລົງໂຕເຕັມໃກ້ສຸດ (ກີບ). */
export const PRICE_ROUNDING_LAK = 100;

// ---- Module 29: Home Service travel fee ----
/** ຄ່າທຳນຽມພື້ນຖານ (ກີບ) ຂອງການໄປບໍລິການເຖິງບ້ານ. */
export const TRAVEL_FEE_BASE_LAK = 10_000;
/** ຄ່າທຳນຽມເພີ່ມຕໍ່ກິໂລແມັດ (ກີບ). */
export const TRAVEL_FEE_PER_KM_LAK = 3_000;

// ---- Module 29: Home Service SLA escalation ----
/** trip NO_MATCH/MATCHING ຄ້າງດົນເກີນນີ້ (ນາທີ) = ຕ້ອງແຈ້ງ branch admin. */
export const HOME_SERVICE_SLA_NO_MATCH_MINUTES = 10;
/** ຊ່າງ ASSIGNED/EN_ROUTE ຊ້າກວ່າ ETA ບວກ buffer ນີ້ (ນາທີ) = ຖືວ່າ "ອາດຊ້າ", ຕ້ອງແຈ້ງ. */
export const HOME_SERVICE_SLA_LATE_BUFFER_MINUTES = 10;
/** ໄລຍະຫ່າງລະຫວ່າງການແຈ້ງເຕືອນຊ້ຳສຳລັບ trip ດຽວກັນ (ນາທີ) — ກັນ spam ຈາກ sweep ທຸກ 5 ນາທີ. */
export const HOME_SERVICE_SLA_RENOTIFY_MINUTES = 30;
