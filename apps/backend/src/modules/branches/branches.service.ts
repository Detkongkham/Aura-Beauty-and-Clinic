import type {
  BranchClosureCreateInput,
  BranchClosureView,
  BranchCreateInput,
  BranchUpdateInput,
  BranchView,
  LaoProvinceId,
} from '@abcp/shared-types';
import type { Branch, BranchClosure, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';

const DEFAULT_TIMEZONE = 'Asia/Vientiane';
const DEFAULT_PROVINCE: LaoProvinceId = 'vientiane-capital';

function toBranchView(b: Branch): BranchView {
  return {
    id: b.id,
    name: b.name,
    code: b.code ?? '',
    address: b.address,
    phone: b.phone,
    email: b.email,
    province: (b.province as LaoProvinceId | null) ?? DEFAULT_PROVINCE,
    latitude: b.latitude ?? 0,
    longitude: b.longitude ?? 0,
    timezone: DEFAULT_TIMEZONE,
    isActive: b.isActive,
    openTime: b.openTime,
    closeTime: b.closeTime,
    allowNegativeStock: b.allowNegativeStock,
  };
}

function toClosureView(c: BranchClosure & { branch: { name: string } | null }): BranchClosureView {
  return {
    id: c.id,
    branchId: c.branchId ?? 'all',
    branchName: c.branch?.name ?? 'ທຸກສາຂາ',
    date: c.date.toISOString().slice(0, 10),
    reason: c.reason,
    createdAt: c.createdAt.toISOString(),
  };
}

/** GET /branches — ທຸກສາຂາ (ບໍ່ລວມທີ່ລຶບແລ້ວ). */
export async function listBranches(): Promise<{ items: BranchView[] }> {
  const rows = await prisma.branch.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  return { items: rows.map(toBranchView) };
}

function normaliseEmail(email?: string): string | null {
  return email && email.trim() !== '' ? email.trim() : null;
}

async function assertCodeFree(code: string, exceptId?: string): Promise<void> {
  const clash = await prisma.branch.findFirst({
    where: { code, deletedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw ApiError.conflict('ລະຫັດສາຂານີ້ຖືກໃຊ້ແລ້ວ');
}

export async function createBranch(input: BranchCreateInput): Promise<BranchView> {
  await assertCodeFree(input.code);
  const data: Prisma.BranchCreateInput = {
    name: input.name,
    code: input.code,
    address: input.address,
    phone: input.phone,
    email: normaliseEmail(input.email),
    province: input.province ?? DEFAULT_PROVINCE,
    openTime: input.openTime,
    closeTime: input.closeTime,
    isActive: input.isActive,
    allowNegativeStock: input.allowNegativeStock,
    ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
    ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
  };
  const branch = await prisma.branch.create({ data });
  return toBranchView(branch);
}

export async function updateBranch(id: string, input: BranchUpdateInput): Promise<BranchView> {
  const existing = await prisma.branch.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບສາຂາ');
  if (input.code !== undefined) await assertCodeFree(input.code, id);

  const branch = await prisma.branch.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: normaliseEmail(input.email) } : {}),
      ...(input.province !== undefined ? { province: input.province } : {}),
      ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
      ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
      ...(input.openTime !== undefined ? { openTime: input.openTime } : {}),
      ...(input.closeTime !== undefined ? { closeTime: input.closeTime } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.allowNegativeStock !== undefined ? { allowNegativeStock: input.allowNegativeStock } : {}),
    },
  });
  return toBranchView(branch);
}

// ---- branch closures ---------------------------------------------------

export async function listClosures(): Promise<{ items: BranchClosureView[] }> {
  const rows = await prisma.branchClosure.findMany({
    include: { branch: { select: { name: true } } },
    orderBy: { date: 'desc' },
  });
  return { items: rows.map(toClosureView) };
}

export async function createClosure(input: BranchClosureCreateInput): Promise<BranchClosureView> {
  const branchId = input.branchId === 'all' ? null : input.branchId;
  if (branchId) {
    const branch = await prisma.branch.findFirst({
      where: { id: branchId, deletedAt: null },
      select: { id: true },
    });
    if (!branch) throw ApiError.notFound('ບໍ່ພົບສາຂາ');
  }

  const date = new Date(`${input.date}T00:00:00.000Z`);
  const clash = await prisma.branchClosure.findFirst({
    where: { branchId, date },
    select: { id: true },
  });
  if (clash) throw ApiError.conflict('ວັນປິດຮ້ານນີ້ຖືກເພີ່ມແລ້ວ');

  const row = await prisma.branchClosure.create({
    data: { branchId, date, reason: input.reason },
    include: { branch: { select: { name: true } } },
  });
  return toClosureView(row);
}

export async function deleteClosure(id: string): Promise<void> {
  const existing = await prisma.branchClosure.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound('ບໍ່ພົບວັນປິດຮ້ານ');
  await prisma.branchClosure.delete({ where: { id } });
}
