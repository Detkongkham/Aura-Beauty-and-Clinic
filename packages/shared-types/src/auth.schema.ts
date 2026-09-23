import { z } from 'zod';
import { UserRole } from './enums.js';
import { PermissionKey } from './permission.schema.js';

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

/** ຮູບໂປຣໄຟລ໌: data URL (ຍໍ່ຝັ່ງ client ≤256px) ຫຼື https URL. ~300KB ພໍສຳລັບ JPEG 256px. */
export const avatarUrlSchema = z
  .string()
  .max(300_000)
  .refine((v) => /^data:image\/(png|jpe?g|webp);base64,/.test(v) || /^https?:\/\//.test(v), {
    message: 'ຮູບບໍ່ຖືກຕ້ອງ',
  });

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
  policy: { minPasswordLength: number; sessionTimeoutMinutes: number };
  stats: { activeSessions: number; actions30d: number; lastActionAt: string | null };
  currentSessionId: string | null;
}
