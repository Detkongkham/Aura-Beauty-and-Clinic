/**
 * One-off backfill for the `add_dynamic_roles` migration: seeds the two
 * built-in Role rows (Super Admin / Branch Admin) matching the legacy
 * enum-based permission defaults, then links every existing admin user to
 * the row that matches their `role` enum. Safe to re-run (upsert by name) —
 * re-running also refreshes these two system roles' `permissions` to match
 * the current `@abcp/shared-types` PERMISSIONS list (e.g. after adding the
 * granular create/edit/delete/special actions), without touching any
 * custom role an admin created.
 */
import { PrismaClient } from '@prisma/client';
import { PERMISSIONS, ROLE_PERMISSIONS } from '@abcp/shared-types';

const prisma = new PrismaClient();

async function main() {
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'Super Admin' },
    update: { permissions: [...PERMISSIONS] },
    create: {
      name: 'Super Admin',
      icon: 'Crown',
      color: '#4f46e5',
      permissions: [...PERMISSIONS],
      isSystem: true,
    },
  });

  const branchAdminRole = await prisma.role.upsert({
    where: { name: 'Branch Admin' },
    update: { permissions: [...ROLE_PERMISSIONS.BRANCH_ADMIN] },
    create: {
      name: 'Branch Admin',
      icon: 'Building2',
      color: '#0ea5e9',
      permissions: [...ROLE_PERMISSIONS.BRANCH_ADMIN],
      isSystem: true,
    },
  });

  const superAdmins = await prisma.user.updateMany({
    where: { role: 'SUPER_ADMIN', roleRefId: null },
    data: { roleRefId: superAdminRole.id },
  });
  const branchAdmins = await prisma.user.updateMany({
    where: { role: 'BRANCH_ADMIN', roleRefId: null },
    data: { roleRefId: branchAdminRole.id },
  });

  console.log(`Linked ${superAdmins.count} SUPER_ADMIN + ${branchAdmins.count} BRANCH_ADMIN user(s) to their Role.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
