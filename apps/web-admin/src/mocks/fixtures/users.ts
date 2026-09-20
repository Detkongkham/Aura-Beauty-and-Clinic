import {
  mergePermissionOverrides,
  rolePermissions,
  type AdminUser,
  type AuthUser,
  type PermissionOverride,
} from '@abcp/shared-types';
import type { Branch } from '@/types/models';

import { BRANCH_ADMIN_ROLE_ID, SUPER_ADMIN_ROLE_ID, type MockRole } from './roles';

export interface MockUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: AuthUser['role'];
  roleId: string | null;
  branchId: string | null;
  avatarUrl: string | null;
  password: string;
  isActive: boolean;
  quickLoginPin: string | null;
  quickLoginUpdatedAt: string | null;
  lastLoginAt: string | null;
  lastLoginDevice: string | null;
  overrides: PermissionOverride[];
  createdAt: string;
}

/** Seeded admin accounts for the mock backend (Option A). Password for all: `password123`. */
export const MOCK_USERS: MockUser[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'ສຸພາພອນ ອິນທະວົງ',
    phone: '2021000001',
    email: 'super@aura.test',
    role: 'SUPER_ADMIN',
    roleId: SUPER_ADMIN_ROLE_ID,
    branchId: null,
    avatarUrl: null,
    password: 'password123',
    isActive: true,
    quickLoginPin: null,
    quickLoginUpdatedAt: null,
    lastLoginAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
    lastLoginDevice: 'Chrome • macOS',
    overrides: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'ສົມສະຫງວນ ໄຊຍະວົງ',
    phone: '2021000002',
    email: 'branch@aura.test',
    role: 'BRANCH_ADMIN',
    roleId: BRANCH_ADMIN_ROLE_ID,
    branchId: '00000000-0000-4000-8000-000000000177',
    avatarUrl: null,
    password: 'password123',
    isActive: true,
    quickLoginPin: null,
    quickLoginUpdatedAt: null,
    lastLoginAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
    lastLoginDevice: 'Safari • iOS',
    overrides: [],
    createdAt: '2026-01-02T00:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000000',
    name: 'ຜູ້ດູແລລະບົບສູງສຸດ',
    phone: '02000000000',
    email: 'admin@aura.la',
    role: 'SUPER_ADMIN',
    roleId: SUPER_ADMIN_ROLE_ID,
    branchId: null,
    avatarUrl: null,
    password: 'Admin@12345',
    isActive: true,
    quickLoginPin: null,
    quickLoginUpdatedAt: null,
    lastLoginAt: new Date().toISOString(),
    lastLoginDevice: 'Chrome • macOS',
    overrides: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: '00000000-0000-4000-8000-00000000000b',
    name: 'ນາງ ສົມສະຫງວນ ໄຊຍະວົງ',
    phone: '02000000001',
    email: 'manager.vte@aura.la',
    role: 'BRANCH_ADMIN',
    roleId: BRANCH_ADMIN_ROLE_ID,
    branchId: '00000000-0000-4000-8000-000000000177',
    avatarUrl: null,
    password: 'Manager@12345',
    isActive: true,
    quickLoginPin: null,
    quickLoginUpdatedAt: null,
    lastLoginAt: new Date().toISOString(),
    lastLoginDevice: 'Safari • iOS',
    overrides: [],
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];

/** Base permission set for a mock user: their dynamic Role if assigned, else the legacy enum default. */
export function basePermissions(u: MockUser, roles: MockRole[]): readonly string[] {
  const role = roles.find((r) => r.id === u.roleId);
  return role ? role.permissions : rolePermissions(u.role);
}

/** Strip mock-only fields and compute the effective permission set (role + overrides). */
export function publicUser(u: MockUser, roles: MockRole[] = []): AuthUser {
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    role: u.role,
    branchId: u.branchId,
    permissions: mergePermissionOverrides(basePermissions(u, roles), u.overrides),
    allowDirectMessages: false,
  };
}

export function toAdminUser(u: MockUser, branches: Branch[] = [], roles: MockRole[] = []): AdminUser {
  const role = roles.find((r) => r.id === u.roleId);
  return {
    id: u.id,
    name: u.name,
    phone: u.phone,
    email: u.email,
    role: u.role,
    roleId: role?.id ?? null,
    roleName: role?.name ?? null,
    roleIcon: role?.icon ?? null,
    roleColor: role?.color ?? null,
    branchId: u.branchId,
    branchName: branches.find((b) => b.id === u.branchId)?.name ?? null,
    avatarUrl: u.avatarUrl,
    isActive: u.isActive,
    quickLoginEnabled: u.quickLoginPin != null,
    quickLoginUpdatedAt: u.quickLoginUpdatedAt,
    lastLoginAt: u.lastLoginAt,
    lastLoginDevice: u.lastLoginDevice,
    createdAt: u.createdAt,
  };
}
