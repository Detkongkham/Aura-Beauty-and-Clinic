import { describe, expect, it } from 'vitest';

import { can, isAdminRole, permissionsFor } from './rbac';

describe('rbac', () => {
  it('marks only SUPER_ADMIN and BRANCH_ADMIN as admin roles', () => {
    expect(isAdminRole('SUPER_ADMIN')).toBe(true);
    expect(isAdminRole('BRANCH_ADMIN')).toBe(true);
    expect(isAdminRole('STAFF')).toBe(false);
    expect(isAdminRole('CUSTOMER')).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });

  it('grants SUPER_ADMIN every permission', () => {
    expect(can('SUPER_ADMIN', 'users:manage')).toBe(true);
    expect(can('SUPER_ADMIN', 'services:manage')).toBe(true);
  });

  it('restricts BRANCH_ADMIN from user management and cross-branch settings', () => {
    expect(can('BRANCH_ADMIN', 'staff:manage')).toBe(true);
    expect(can('BRANCH_ADMIN', 'users:manage')).toBe(false);
    expect(can('BRANCH_ADMIN', 'settings:manage')).toBe(false);
  });

  it('gives non-admin roles no permissions', () => {
    expect(permissionsFor('STAFF')).toHaveLength(0);
    expect(can('CUSTOMER', 'dashboard:view')).toBe(false);
  });
});
