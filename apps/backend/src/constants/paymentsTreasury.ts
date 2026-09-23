/** ໂມດູນ 39 W3 — AppSetting keys ຂອງລະບົບກວດສະລິບ. */

/** ຄວາມຄາດເຄື່ອນຂອງຈຳນວນເງິນທີ່ຍອມຮັບ (ກີບ) ລະຫວ່າງສະລິບກັບຍອດທີ່ຄາດໝາຍ. ຄ່າເລີ່ມຕົ້ນ 0 (ຕ້ອງກົງກັນ). */
export const SLIP_AMOUNT_TOLERANCE_SETTING_KEY = 'payments.slip.amountTolerance';

/**
 * ຖ້າ true — ສະລິບທີ່ຜ່ານທັງ 3 ເກນ (AUTO_MATCHED) ຈະຖືກສ້າງ `PaymentTransaction` ໂດຍ server ທັນທີ
 * ໂດຍບໍ່ຕ້ອງລໍພະນັກງານ. ຄ່າເລີ່ມຕົ້ນ **false**: OCR ຢືນຢັນບໍ່ໄດ້ວ່າສະລິບແທ້/ປອມ (ບໍ່ມີ API ທະນາຄານ),
 * ສະນັ້ນເປີດໄດ້ພຽງເມື່ອເຈົ້າຂອງຮ້ານຍອມຮັບຄວາມສ່ຽງນີ້ເອງ.
 */
export const SLIP_AUTO_APPROVE_SETTING_KEY = 'payments.slip.autoApprove';

/** ສະລິບທີ່ໂອນກ່ອນເປີດບິນເກີນເວລານີ້ ຖືວ່າເປັນສະລິບເກົ່າທີ່ນຳມາໃຊ້ຊ້ຳ. */
export const SLIP_BEFORE_BILL_GRACE_MS = 10 * 60_000;
/** ສະລິບທີ່ໂອນເກີນເວລາປັດຈຸບັນໄປໃນອະນາຄົດ (ນາຬິກາຄາດເຄື່ອນ) ທີ່ຍອມຮັບ. */
export const SLIP_FUTURE_SKEW_MS = 10 * 60_000;
/** ສະລິບທີ່ເກົ່າກວ່ານີ້ (ນັບຈາກເວລາອັບໂຫຼດ) ຖືວ່າບໍ່ຜ່ານເກນເວລາ. */
export const SLIP_MAX_AGE_MS = 24 * 60 * 60_000;

export const SLIP_MAX_BYTES = 8 * 1024 * 1024;
/** ຂະໜາດສູງສຸດ (ດ້ານຍາວ) ຂອງຮູບສະລິບທີ່ເກັບ — ຫຼຸດພື້ນທີ່ ແລະ ພໍສຳລັບ OCR. */
export const SLIP_MAX_DIMENSION = 2000;

/** S4 — ເປົ້າໝາຍເວລາກວດສະລິບ (ນາທີ) + ແຍກຕາມສາຂາ + ເປີດ/ປິດການແຈ້ງເຕືອນເມື່ອເກີນ. */
export const SLIP_SLA_SETTING_KEY = 'payments.slip.reviewSlaMinutes';
export const SLIP_BRANCH_SLA_SETTING_KEY = 'payments.slip.branchSlaMinutes';
export const SLIP_SLA_ALERT_SETTING_KEY = 'payments.slip.slaAlertEnabled';
export const DEFAULT_SLIP_SLA_MINUTES = 30;
