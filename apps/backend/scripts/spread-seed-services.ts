/**
 * Wave 11 — one-off data fix for demo/dev databases (idempotent).
 *
 * Problem: every seeded service sat on the head-office branch, so the catalogue query
 * (`branchId = X OR branchId IS NULL`) showed 0 services at the other branches.
 *
 * Fix: the chain-wide menu (every non-"ບໍລິການເສີມ" service on head office) becomes global
 * (branchId = null); the bulk "ບໍລິການເສີມ #n" add-ons are spread round-robin across active
 * branches and assigned to that branch's staff so they are bookable. Never touches services
 * created on a branch other than head office.
 *
 *   pnpm --filter @abcp/backend exec tsx scripts/spread-seed-services.ts [--dry-run]
 */
import { prisma } from '../src/config/database.js';

const HEAD_OFFICE = '11111111-1111-1111-1111-111111111111';
const ADDON_PREFIX = 'ບໍລິການເສີມ';

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run');
  const services = await prisma.service.findMany({
    where: { branchId: HEAD_OFFICE, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  const addons = services.filter((s) => s.name.startsWith(ADDON_PREFIX));
  const menu = services.filter((s) => !s.name.startsWith(ADDON_PREFIX));
  const branches = await prisma.branch.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`head-office services: ${services.length} (menu ${menu.length}, add-ons ${addons.length}); active branches: ${branches.length}`);
  if (dry || branches.length === 0) return;

  const madeGlobal = await prisma.service.updateMany({ where: { id: { in: menu.map((s) => s.id) } }, data: { branchId: null } });

  let assigned = 0;
  for (const [i, s] of addons.entries()) {
    const b = branches[i % branches.length]!;
    await prisma.service.update({ where: { id: s.id }, data: { branchId: b.id } });
    const staff = await prisma.staffProfile.findMany({ where: { user: { branchId: b.id, deletedAt: null } }, select: { id: true } });
    if (staff.length) {
      const r = await prisma.staffService.createMany({
        data: staff.map((st) => ({ staffProfileId: st.id, serviceId: s.id })),
        skipDuplicates: true,
      });
      assigned += r.count;
    }
  }
  console.log(`made global: ${madeGlobal.count}; add-ons spread: ${addons.length}; staff assignments added: ${assigned}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
