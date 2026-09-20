import { PERMISSIONS, ROLE_PERMISSIONS } from '@abcp/shared-types';

export interface MockRole {
  id: string;
  name: string;
  icon: string;
  color: string;
  permissions: string[];
  isSystem: boolean;
  createdAt: string;
}

export const SUPER_ADMIN_ROLE_ID = '00000000-0000-4000-8000-0000000000r1';
export const BRANCH_ADMIN_ROLE_ID = '00000000-0000-4000-8000-0000000000r2';

/** Seeded system roles for the mock backend — mirrors `scripts/backfillRoles.ts`. */
export const MOCK_ROLES: MockRole[] = [
  {
    id: SUPER_ADMIN_ROLE_ID,
    name: 'Super Admin',
    icon: 'Crown',
    color: '#4f46e5',
    permissions: [...PERMISSIONS],
    isSystem: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: BRANCH_ADMIN_ROLE_ID,
    name: 'Branch Admin',
    icon: 'Building2',
    color: '#0ea5e9',
    permissions: [...ROLE_PERMISSIONS.BRANCH_ADMIN],
    isSystem: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];
