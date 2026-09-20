import { z } from 'zod';
import { PermissionKey } from './permission.schema.js';

/** Curated icon set for role cards — keys map to a lucide-react component on the frontend. */
export const ROLE_ICONS = [
  'UsersRound',
  'Crown',
  'Building2',
  'Landmark',
  'Briefcase',
  'ShieldCheck',
  'Wrench',
  'Truck',
  'FileText',
  'Banknote',
  'Scale',
  'Factory',
] as const;
export const RoleIcon = z.enum(ROLE_ICONS);
export type RoleIconKey = z.infer<typeof RoleIcon>;

/** Curated swatch palette for role colour — stored as-is (hex) rather than a design token. */
export const ROLE_COLORS = [
  '#4f46e5',
  '#0ea5e9',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4',
  '#ef4444',
  '#10b981',
  '#f43f5e',
  '#14b8a6',
] as const;

export const roleSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  permissions: z.array(PermissionKey),
  isSystem: z.boolean(),
  memberCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type Role = z.infer<typeof roleSchema>;

export const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(80),
  icon: RoleIcon.default('UsersRound'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  permissions: z.array(PermissionKey).default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  icon: RoleIcon.optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  permissions: z.array(PermissionKey).optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
