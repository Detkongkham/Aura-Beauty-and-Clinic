/** Error code ມາດຕະຖານ — client map ໄປຫາຂໍ້ຄວາມ i18n. */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL: 'INTERNAL',

  // domain-specific
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  DOUBLE_BOOKING: 'DOUBLE_BOOKING',
  NO_STYLIST_AVAILABLE: 'NO_STYLIST_AVAILABLE',
  CANCEL_WINDOW_PASSED: 'CANCEL_WINDOW_PASSED',
  TENDER_NOT_ALLOWED: 'TENDER_NOT_ALLOWED',
  CASH_DRAWER_REQUIRED: 'CASH_DRAWER_REQUIRED',
  /** trigger ຖານຂໍ້ມູນປະຕິເສດການແກ້ເອກະສານການເງິນທີ່ອອກແລ້ວ (INV/CN/Z/ກະທີ່ປິດ). */
  LEDGER_LOCKED: 'LEDGER_LOCKED',
  /** ຕ້ອງຢືນຢັນລະຫັດຜ່ານກ່ອນເຮັດທຸລະກຳທີ່ອ່ອນໄຫວ (ເຊັ່ນ ປ່ຽນເລກບັນຊີຮັບເງິນ). */
  REAUTH_REQUIRED: 'REAUTH_REQUIRED',
  REAUTH_FAILED: 'REAUTH_FAILED',
  /** login ຜິດເກີນ Settings ▸ maxLoginAttempts — details.lockedUntil. */
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  /** ເຊດຊັນຖືກປິດເພາະບໍ່ມີການເຄື່ອນໄຫວເກີນ Settings ▸ sessionTimeoutMinutes. */
  SESSION_IDLE: 'SESSION_IDLE',
  /** ລະຫັດ 2FA ຜິດ / mfaToken ໝົດອາຍຸ. */
  MFA_INVALID: 'MFA_INVALID',
  /** ຕ້ອງເປີດ 2FA ກ່ອນ (Settings ▸ require2fa) — ປິດບໍ່ໄດ້. */
  MFA_REQUIRED: 'MFA_REQUIRED',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
