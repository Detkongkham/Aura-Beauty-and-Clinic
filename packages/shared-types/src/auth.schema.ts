import { z } from 'zod';
import { UserRole } from './enums.js';
import { PermissionKey } from './permission.schema.js';
import { portalPrefsSchema } from './portal.schema.js';

/** ເບີໂທລາວ/ສາກົນ ແບບຢືດຢຸ່ນ: ຕົວເລກ 8–15 ຫຼັກ, ອາດมี "+" ນຳ. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{8,15}$/, 'ເບີໂທບໍ່ຖືກຕ້ອງ');

export const passwordSchema = z
  .string()
  .min(8, 'ລະຫັດຜ່ານຕ້ອງຍາວຢ່າງໜ້ອຍ 8 ຕົວອັກສອນ')
  .max(128);

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: phoneSchema,
  email: z.string().trim().email().optional(),
  password: passwordSchema,
  branchId: z.string().uuid().optional(),
  /** Wave 10G — opt-in ໂປຣໂມຊັນ (push). ຕ້ອງຕິກເອງ, ບໍ່ຕິກລ່ວງໜ້າ. ບໍ່ສົ່ງ = ບໍ່ໃຫ້ຄວາມຍິນຍອມ. */
  marketingOptIn: z.boolean().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

/**
 * Avatar ກາຕູນ 3D ທີ່ຜູ້ໃຊ້ເລືອກເອງ — ເກັບໃນ `User.avatarUrl` ເປັນ token `pack:NN`
 * (01…AVATAR_PACK_SIZE). web (`public/avatars/3d`) + mobile (`assets/avatars/3d`) ມີຊຸດ
 * ດຽວກັນ, ດັ່ງນັ້ນເລກດຽວກັນ = ໜ້າດຽວກັນທັງສອງຝັ່ງ. ບໍ່ມີ token → ໃຊ້ hash ຊື່ຄືເກົ່າ.
 */
export const AVATAR_PACK_SIZE = 47;
const PACK_AVATAR_RE = /^pack:(\d{2})$/;

/** 1-based pack index → token `pack:07`. */
export function packAvatarToken(index: number): string {
  return `pack:${String(index).padStart(2, '0')}`;
}

/** token `pack:NN` → 1-based index, ຫຼື null ຖ້າບໍ່ແມ່ນ token ທີ່ຖືກຕ້ອງ. */
export function parsePackAvatar(value: string | null | undefined): number | null {
  const m = value ? PACK_AVATAR_RE.exec(value) : null;
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= AVATAR_PACK_SIZE ? n : null;
}

/** ຮູບໂປຣໄຟລ໌: data URL (ຍໍ່ຝັ່ງ client ≤256px), https URL ຫຼື token avatar `pack:NN`. ~300KB ພໍສຳລັບ JPEG 256px. */
export const avatarUrlSchema = z
  .string()
  .max(300_000)
  .refine(
    (v) =>
      /^data:image\/(png|jpe?g|webp);base64,/.test(v) ||
      /^https?:\/\//.test(v) ||
      parsePackAvatar(v) !== null,
    { message: 'ຮູບບໍ່ຖືກຕ້ອງ' },
  );

/** PATCH /auth/me — ແກ້ໄຂໂປຣໄຟລ໌ຕົນເອງ (ຊື່ / ອີເມວ / ຮູບ). ເບີໂທ + role ປ່ຽນບໍ່ໄດ້ຢູ່ນີ້. */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().email().nullable().optional(),
    avatarUrl: avatarUrlSchema.nullable().optional(),
    /** opt-in ອະນຸຍາດໃຫ້ລູກຄ້າອື່ນທັກແຊັດ DIRECT (Module 38 Wave 8D) — default ປິດ. */
    allowDirectMessages: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.name !== undefined ||
      v.email !== undefined ||
      v.avatarUrl !== undefined ||
      v.allowDirectMessages !== undefined,
    { message: 'ບໍ່ມີຂໍ້ມູນໃຫ້ອັບເດດ' },
  );
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** POST /auth/change-password — ຕ້ອງຢືນຢັນລະຫັດຜ່ານປັດຈຸບັນ. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
  /** ຖອນເຊດຊັນອື່ນທັງໝົດ (ອຸປະກອນອື່ນ) ພ້ອມກັນ. ບໍ່ສົ່ງ = false (mobile ເດີມ). */
  signOutOthers: z.boolean().optional(),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const authUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string(),
  email: z.string().email().nullable(),
  role: UserRole,
  branchId: z.string().uuid().nullable(),
  /** Effective permission set — role base merged with per-user overrides. */
  permissions: z.array(PermissionKey),
  /** opt-in ອະນຸຍາດໃຫ້ລູກຄ້າອື່ນທັກແຊັດ DIRECT (Module 38 Wave 8D) — default ປິດ. */
  allowDirectMessages: z.boolean(),
  /** ຮູບໂປຣໄຟລ໌ທີ່ອັບໂຫຼດເອງ — null = ໃຊ້ avatar cartoon. optional ເພື່ອ client ເກົ່າ. */
  avatarUrl: z.string().nullable().optional(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof authTokensSchema>;

export const authResponseSchema = z.object({
  user: authUserSchema,
  tokens: authTokensSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

/** payload ທີ່ຝັງໃນ JWT access token */
export const accessTokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  role: UserRole,
  branchId: z.string().uuid().nullable(),
  /** UserSession id — ບອກວ່າ request ມາຈາກເຊດຊັນໃດ (ໜ້າ /account ▸ Sessions). token ເກົ່າບໍ່ມີ. */
  sid: z.string().uuid().optional(),
});
export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;

// ---------------------------------------------------------------------------
// Account console (web-admin /account) — self-service, ຜູ້ໃຊ້ທີ່ login ຢູ່ເທົ່ານັ້ນ
// ---------------------------------------------------------------------------

/** PUT /auth/me/quick-login-pin — ຕັ້ງ PIN ເອງ, ຕ້ອງຢືນຢັນລະຫັດຜ່ານ. */
export const setOwnQuickLoginPinSchema = z.object({
  currentPassword: z.string().min(1),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN ຕ້ອງເປັນຕົວເລກ 4-6 ຫຼັກ'),
});
export type SetOwnQuickLoginPinInput = z.infer<typeof setOwnQuickLoginPinSchema>;

/** GET /auth/me/activity */
export const accountActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  before: z.string().datetime().optional(),
});
export type AccountActivityQuery = z.infer<typeof accountActivityQuerySchema>;

export type AccountSessionMethod = 'PASSWORD' | 'PIN' | 'REGISTER' | 'LEGACY';

export interface AccountSession {
  id: string;
  method: AccountSessionMethod;
  deviceLabel: string | null;
  /** 'desktop' | 'mobile' | 'tablet' | 'unknown' — ສຳລັບເລືອກໄອຄອນ. */
  deviceKind: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface AccountActivityItem {
  id: string;
  action: string;
  entityName: string;
  entityId: string | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AccountOverview {
  user: AuthUser;
  avatarUrl: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  lastLoginDevice: string | null;
  passwordChangedAt: string | null;
  quickLogin: { eligible: boolean; enabled: boolean; updatedAt: string | null };
  branch: { id: string; name: string } | null;
  role: { name: string; color: string; icon: string } | null;
  staff: { title: string } | null;
  /** ນະໂຍບາຍຈາກ Settings ▸ Security. */
  policy: { minPasswordLength: number; sessionTimeoutMinutes: number; require2fa: boolean };
  /** Authenticator-app 2FA. Optional so older payloads still parse. */
  twoFactor?: TwoFactorStatus;
  stats: { activeSessions: number; actions30d: number; lastActionAt: string | null };
  currentSessionId: string | null;
}

// ---------------------------------------------------------------------------
// Account security (2026-09-24) — 2FA (TOTP), lockout, password reset, preferences,
// admin view of another user's sessions.
// ---------------------------------------------------------------------------

/** 6-digit TOTP code or an `XXXX-XXXX` recovery code (dash / spaces optional). */
export const twoFactorCodeSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').toUpperCase())
  .refine((v) => /^\d{6}$/.test(v) || /^[A-Z0-9]{8}$/.test(v), 'ລະຫັດບໍ່ຖືກຕ້ອງ');

/**
 * POST /auth/login (and /auth/quick-login) when a second step is needed. No tokens yet —
 * `mfaToken` is a 5-minute ticket for POST /auth/2fa/verify (mode `verify`) or the
 * /auth/2fa/setup → /auth/2fa/activate enrolment (mode `setup`, when Settings ▸ require2fa
 * applies to the account and it has no authenticator yet).
 */
export interface MfaChallenge {
  mfaRequired: true;
  mode: 'verify' | 'setup';
  mfaToken: string;
  expiresIn: number;
}
export type LoginResult = AuthResponse | MfaChallenge;

export function isMfaChallenge(res: LoginResult): res is MfaChallenge {
  return (res as MfaChallenge).mfaRequired === true;
}

export const mfaTokenSchema = z.object({ mfaToken: z.string().min(10) });
export const mfaVerifySchema = z.object({ mfaToken: z.string().min(10), code: twoFactorCodeSchema });
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

/** Secret shown once while enrolling — `otpauthUrl` goes into a QR code. */
export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
}

/** Enrolment finished (login flow) — tokens plus the one-time recovery codes. */
export interface MfaActivateResult extends AuthResponse {
  recoveryCodes: string[];
}

export const startTwoFactorSchema = z.object({ currentPassword: z.string().min(1) });
export const enableTwoFactorSchema = z.object({ code: twoFactorCodeSchema });
export const disableTwoFactorSchema = z.object({
  currentPassword: z.string().min(1),
  code: twoFactorCodeSchema,
});
export type DisableTwoFactorInput = z.infer<typeof disableTwoFactorSchema>;

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesLeft: number;
  /** Settings ▸ require2fa applies to this role — disabling is refused. */
  required: boolean;
}

// --- Forgot / reset password -------------------------------------------------

export const forgotPasswordSchema = z.object({ phone: phoneSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  phone: phoneSchema,
  /** 6-digit code (SMS / e-mail) or 8-digit code issued by an admin. */
  code: z.string().trim().regex(/^\d{6,8}$/, 'ລະຫັດບໍ່ຖືກຕ້ອງ'),
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export interface ForgotPasswordResult {
  /** Always true — whether the phone exists is never revealed. */
  accepted: true;
  expiresInMinutes: number;
}

export interface IssuedResetCode {
  code: string;
  expiresAt: string;
}

// --- Personal preferences (server-synced) ------------------------------------

/** Notification sources a user can mute; `security` is always delivered. */
export const NOTIFICATION_PREF_MODULES = [
  'appointments',
  'waitlist',
  'homeService',
  'staff',
  'inventory',
  'payments',
  'giftCards',
  'loyalty',
  'marketing',
  'system',
] as const;
export type NotificationPrefModule = (typeof NOTIFICATION_PREF_MODULES)[number];

export const notificationChannelPrefSchema = z.object({
  inbox: z.boolean().optional(),
  push: z.boolean().optional(),
});

export const userPreferencesSchema = z.object({
  language: z.enum(['lo', 'en']).optional(),
  colorMode: z.enum(['light', 'dark', 'system']).optional(),
  /** web-admin brand tone (azure / teal / indigo / cobalt). */
  webTheme: z.string().max(20).optional(),
  tableDensity: z.enum(['standard', 'compact']).optional(),
  /** mobile tone preset. */
  mobileTone: z.string().max(20).optional(),
  /** web-admin /portal launcher — pins (ordered), recent modules, layout. Replaced wholesale on PATCH. */
  portal: portalPrefsSchema.optional(),
  notifications: z
    .object(
      Object.fromEntries(NOTIFICATION_PREF_MODULES.map((m) => [m, notificationChannelPrefSchema.optional()])) as Record<
        NotificationPrefModule,
        z.ZodOptional<typeof notificationChannelPrefSchema>
      >,
    )
    .optional(),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export interface UserPreferencesResponse {
  preferences: UserPreferences;
  policy: { sessionTimeoutMinutes: number; require2fa: boolean };
}

// --- Admin: another user's security -----------------------------------------

export interface AdminSession extends Omit<AccountSession, 'isCurrent'> {
  revokedAt: string | null;
  revokedReason: string | null;
}

export interface FailedLoginItem {
  id: string;
  createdAt: string;
  ipAddress: string | null;
  reason: string | null;
  device: string | null;
}

export interface UserSecurityView {
  userId: string;
  name: string;
  role: string;
  isActive: boolean;
  twoFactorEnabled: boolean;
  lockedUntil: string | null;
  failedLoginCount: number;
  lastLoginAt: string | null;
  sessions: AdminSession[];
  recentFailures: FailedLoginItem[];
}
