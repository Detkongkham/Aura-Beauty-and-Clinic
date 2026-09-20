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

/** PATCH /auth/me — ແກ້ໄຂໂປຣໄຟລ໌ຕົນເອງ (ຊື່ / ອີເມວ). ເບີໂທ + role ປ່ຽນບໍ່ໄດ້ຢູ່ນີ້. */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    email: z.string().trim().email().nullable().optional(),
    /** opt-in ອະນຸຍາດໃຫ້ລູກຄ້າອື່ນທັກແຊັດ DIRECT (Module 38 Wave 8D) — default ປິດ. */
    allowDirectMessages: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.email !== undefined || v.allowDirectMessages !== undefined, {
    message: 'ບໍ່ມີຂໍ້ມູນໃຫ້ອັບເດດ',
  });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** POST /auth/change-password — ຕ້ອງຢືນຢັນລະຫັດຜ່ານປັດຈຸບັນ. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
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
});
export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;
