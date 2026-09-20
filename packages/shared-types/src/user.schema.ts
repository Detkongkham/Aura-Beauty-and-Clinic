import { z } from 'zod';
import { UserRole } from './enums.js';
import { phoneSchema } from './auth.schema.js';

/** Admin console only ever creates/manages SUPER_ADMIN or BRANCH_ADMIN accounts. */
export const manageableRoleSchema = z.enum(['SUPER_ADMIN', 'BRANCH_ADMIN']);
export type ManageableRole = z.infer<typeof manageableRoleSchema>;

export const adminUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  role: UserRole,
  roleId: z.string().uuid().nullable(),
  roleName: z.string().nullable(),
  roleIcon: z.string().nullable(),
  roleColor: z.string().nullable(),
  branchId: z.string().uuid().nullable(),
  branchName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  isActive: z.boolean(),
  quickLoginEnabled: z.boolean(),
  quickLoginUpdatedAt: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  lastLoginDevice: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: phoneSchema,
  email: z.string().trim().email().optional(),
  role: manageableRoleSchema,
  roleId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().nullable().optional(),
  role: manageableRoleSchema.optional(),
  roleId: z.string().uuid().nullable().optional(),
  branchId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  avatarUrl: z.string().nullable().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const setQuickLoginPinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, 'PIN ຕ້ອງເປັນຕົວເລກ 4-6 ຫຼັກ'),
});
export type SetQuickLoginPinInput = z.infer<typeof setQuickLoginPinSchema>;

export const quickLoginInputSchema = z.object({
  userId: z.string().uuid(),
  pin: z.string().min(4).max(6),
});
export type QuickLoginInput = z.infer<typeof quickLoginInputSchema>;
