import type {
  CreatePackageInput,
  PackageListQuery,
  PackagePurchaseView,
  PackageView,
  UpdatePackageInput,
  UserPackageUsageView,
  UserPackageView,
} from '@abcp/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { notifyUser } from '../../services/push.js';
import { ApiError } from '../../utils/ApiError.js';
import { vientianeDateKey } from '../../utils/dateHelpers.js';
import { dec, toNum } from '../../utils/money.js';

const DAY_MS = 86_400_000;

const PACKAGE_INCLUDE = {
  items: {
    orderBy: { id: 'asc' },
    select: {
      serviceId: true,
      totalUnits: true,
      service: { select: { name: true, imageUrl: true, durationMinutes: true, price: true } },
    },
  },
} satisfies Prisma.PackageInclude;

type PackageRow = Prisma.PackageGetPayload<{ include: typeof PACKAGE_INCLUDE }>;

function toPackageView(p: PackageRow, activeHolders = 0): PackageView {
  const items = p.items.map((i) => ({
    serviceId: i.serviceId,
    serviceName: i.service.name,
    serviceImageUrl: i.service.imageUrl,
    durationMinutes: i.service.durationMinutes,
    unitPrice: toNum(i.service.price),
    totalUnits: i.totalUnits,
  }));
  const valuePrice = items.reduce((s, i) => s + i.unitPrice * i.totalUnits, 0);
  const totalPrice = toNum(p.totalPrice);
  const totalSessions = items.reduce((s, i) => s + i.totalUnits, 0);
  const savings = Math.max(0, valuePrice - totalPrice);
  return {
    id: p.id,
    branchId: p.branchId,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl ?? items.find((i) => i.serviceImageUrl)?.serviceImageUrl ?? null,
    totalPrice,
    currency: p.currency,
    validityDays: p.validityDays,
    isActive: p.isActive,
    items,
    valuePrice,
    savings,
    totalSessions,
    perSessionPrice: totalSessions > 0 ? Math.round(totalPrice / totalSessions) : totalPrice,
    savingsPct: valuePrice > 0 ? Math.round((savings / valuePrice) * 100) : 0,
    activeHolders,
  };
}

/** ນັບຜູ້ຖືແພັກເກັດ ACTIVE ຕໍ່ packageId (ບໍ່ນັບທີ່ໝົດອາຍຸແລ້ວ). */
async function activeHolderCounts(packageIds: string[]): Promise<Map<string, number>> {
  if (packageIds.length === 0) return new Map();
  const rows = await prisma.userPackage.groupBy({
    by: ['packageId'],
    where: { packageId: { in: packageIds }, status: 'ACTIVE', expireDate: { gt: new Date() } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.packageId, r._count._all]));
}

const USER_PACKAGE_INCLUDE = {
  package: { select: { name: true, imageUrl: true, totalPrice: true, validityDays: true } },
  items: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      serviceId: true,
      totalUnits: true,
      remainingUnits: true,
      service: { select: { name: true, imageUrl: true, durationMinutes: true } },
    },
  },
} satisfies Prisma.UserPackageInclude;

type UserPackageRow = Prisma.UserPackageGetPayload<{ include: typeof USER_PACKAGE_INCLUDE }>;

function toUserPackageView(u: UserPackageRow, now = new Date()): UserPackageView {
  const items = u.items.map((i) => ({
    id: i.id,
    serviceId: i.serviceId,
    serviceName: i.service.name,
    serviceImageUrl: i.service.imageUrl,
    durationMinutes: i.service.durationMinutes,
    totalUnits: i.totalUnits,
    remainingUnits: i.remainingUnits,
  }));
  const totalUnits = items.reduce((s, i) => s + i.totalUnits, 0);
  const remainingUnits = items.reduce((s, i) => s + i.remainingUnits, 0);
  return {
    id: u.id,
    packageId: u.packageId,
    packageName: u.package.name,
    imageUrl: u.package.imageUrl ?? items.find((i) => i.serviceImageUrl)?.serviceImageUrl ?? null,
    status: u.status,
    expired: u.status === 'ACTIVE' && u.expireDate.getTime() <= now.getTime(),
    expireDate: u.expireDate.toISOString(),
    purchasedAt: u.createdAt.toISOString(),
    paymentId: u.status === 'PENDING_PAYMENT' ? u.purchasePaymentId : null,
    totalPrice: toNum(u.package.totalPrice),
    items,
    remainingSessions: remainingUnits,
    totalSessions: totalUnits,
    usedSessions: totalUnits - remainingUnits,
    daysLeft: daysLeftUntil(u.expireDate, now),
    validityDays: u.package.validityDays,
  };
}

/** ຈຳນວນມື້ທີ່ຍັງເຫຼືອ — ນັບເປັນ "ມື້ປະຕິທິນວຽງຈັນ" ເພື່ອບໍ່ໃຫ້ຜົນປ່ຽນຕາມໂມງ. */
function daysLeftUntil(expireDate: Date, now: Date): number {
  const from = vientianeDateKey(now).getTime();
  const to = vientianeDateKey(expireDate).getTime();
  return Math.max(0, Math.round((to - from) / DAY_MS));
}

// ---- catalog (customer) -------------------------------------------------

/** GET /packages — ແພັກເກັດທີ່ເປີດຂາຍ (ຖືກສຸດກ່ອນ). */
export async function listPackages(query: PackageListQuery): Promise<PackageView[]> {
  const rows = await prisma.package.findMany({
    where: {
      isActive: true,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.serviceId ? { items: { some: { serviceId: query.serviceId } } } : {}),
    },
    orderBy: { totalPrice: 'asc' },
    include: PACKAGE_INCLUDE,
  });
  const holders = await activeHolderCounts(rows.map((r) => r.id));
  return rows.map((r) => toPackageView(r, holders.get(r.id) ?? 0));
}

export async function getPackage(id: string): Promise<PackageView> {
  const row = await prisma.package.findUnique({ where: { id }, include: PACKAGE_INCLUDE });
  if (!row) throw ApiError.notFound('ບໍ່ພົບແພັກເກັດ');
  const holders = await activeHolderCounts([row.id]);
  return toPackageView(row, holders.get(row.id) ?? 0);
}

/**
 * POST /packages/:id/purchase — ສ້າງ Payment + UserPackage PENDING_PAYMENT. ລາຄາ/ສາຂາ/ຈຳນວນຄັ້ງ
 * ເອົາຈາກ server ເທົ່ານັ້ນ. ຖ້າມີການຊື້ແພັກເກັດດຽວກັນທີ່ຍັງຄ້າງຈ່າຍ → ຄືນບິນເກົ່າ (ກັນບິນຊ້ອນ).
 * activate ອັດຕະໂນມັດຈາກ `payments.service.recomputeAndSettle` ເມື່ອ FULLY_PAID.
 */
export async function purchasePackage(userId: string, packageId: string): Promise<PackagePurchaseView> {
  const pkg = await prisma.package.findUnique({ where: { id: packageId }, include: PACKAGE_INCLUDE });
  if (!pkg || !pkg.isActive) throw ApiError.notFound('ບໍ່ພົບແພັກເກັດ ຫຼື ປິດການຂາຍແລ້ວ');
  if (pkg.items.length === 0) throw ApiError.badRequest('ແພັກເກັດນີ້ຍັງບໍ່ມີບໍລິການ');

  const existing = await prisma.userPackage.findFirst({
    where: { userId, packageId, status: 'PENDING_PAYMENT', purchasePaymentId: { not: null } },
    select: { id: true, purchasePaymentId: true, purchasePayment: { select: { paymentStatus: true } } },
    orderBy: { createdAt: 'desc' },
  });
  if (existing?.purchasePaymentId && existing.purchasePayment?.paymentStatus !== 'FULLY_PAID') {
    return {
      userPackageId: existing.id,
      paymentId: existing.purchasePaymentId,
      amount: toNum(pkg.totalPrice),
      currency: pkg.currency,
      packageName: pkg.name,
    };
  }

  const created = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.create({
      data: {
        branchId: pkg.branchId,
        totalAmount: pkg.totalPrice,
        depositAmount: dec(0),
        currency: pkg.currency,
        paymentStatus: 'PENDING',
      },
      select: { id: true },
    });
    const userPackage = await tx.userPackage.create({
      data: {
        userId,
        packageId: pkg.id,
        // ຕັ້ງຊົ່ວຄາວ — ນັບໃໝ່ຕອນ activate (ອາຍຸເລີ່ມແຕ່ມື້ຈ່າຍຄົບ).
        expireDate: new Date(Date.now() + pkg.validityDays * DAY_MS),
        status: 'PENDING_PAYMENT',
        purchasePaymentId: payment.id,
        items: {
          create: pkg.items.map((i) => ({
            serviceId: i.serviceId,
            totalUnits: i.totalUnits,
            remainingUnits: i.totalUnits,
          })),
        },
      },
      select: { id: true },
    });
    return { paymentId: payment.id, userPackageId: userPackage.id };
  });

  return {
    ...created,
    amount: toNum(pkg.totalPrice),
    currency: pkg.currency,
    packageName: pkg.name,
  };
}

/**
 * ເອີ້ນຈາກ `payments.service.recomputeAndSettle` ເມື່ອ Payment ຮອດ FULLY_PAID. no-op ຖ້າບິນນີ້
 * ບໍ່ແມ່ນການຊື້ແພັກເກັດ ຫຼື activate ແລ້ວ.
 */
export async function activatePurchasedPackage(paymentId: string): Promise<void> {
  const row = await prisma.userPackage.findUnique({
    where: { purchasePaymentId: paymentId },
    select: { id: true, userId: true, status: true, package: { select: { name: true, validityDays: true } } },
  });
  if (!row || row.status !== 'PENDING_PAYMENT') return;

  const { count } = await prisma.userPackage.updateMany({
    where: { id: row.id, status: 'PENDING_PAYMENT' },
    data: {
      status: 'ACTIVE',
      expireDate: new Date(Date.now() + row.package.validityDays * DAY_MS),
    },
  });
  if (count === 0) return;

  await notifyUser({
    userId: row.userId,
    type: 'PACKAGE_ACTIVATED',
    title: 'ແພັກເກັດພ້ອມໃຊ້ແລ້ວ',
    body: `${row.package.name} ເປີດໃຊ້ງານແລ້ວ — ຈອງບໍລິການໄດ້ເລີຍ`,
    data: { userPackageId: row.id },
    dedupeKey: `package-activated:${row.id}`,
  }).catch(() => undefined);
}

/** GET /packages/me — ຄອສຂອງຂ້ອຍ (ບໍ່ລວມ VOID), ໃໝ່ສຸດກ່ອນ. */
export async function myPackages(userId: string): Promise<UserPackageView[]> {
  const rows = await prisma.userPackage.findMany({
    where: { userId, status: { not: 'VOID' } },
    orderBy: { createdAt: 'desc' },
    include: USER_PACKAGE_INCLUDE,
  });
  const now = new Date();
  return rows.map((r) => toUserPackageView(r, now));
}

/** DELETE /packages/me/:userPackageId — ຍົກເລີກການຊື້ທີ່ຍັງບໍ່ໄດ້ຈ່າຍ. */
export async function cancelPendingPurchase(userId: string, userPackageId: string): Promise<void> {
  const row = await prisma.userPackage.findFirst({
    where: { id: userPackageId, userId },
    select: {
      id: true,
      status: true,
      purchasePaymentId: true,
      purchasePayment: { select: { transactions: { where: { status: 'SUCCESS' }, select: { id: true } } } },
    },
  });
  if (!row) throw ApiError.notFound('ບໍ່ພົບແພັກເກັດ');
  if (row.status !== 'PENDING_PAYMENT') throw ApiError.badRequest('ຍົກເລີກໄດ້ສະເພາະລາຍການທີ່ຍັງບໍ່ຈ່າຍ');
  if ((row.purchasePayment?.transactions.length ?? 0) > 0) {
    throw ApiError.badRequest('ບິນນີ້ມີການຈ່າຍບາງສ່ວນແລ້ວ ກະລຸນາຕິດຕໍ່ຮ້ານ');
  }
  await prisma.userPackage.update({ where: { id: row.id }, data: { status: 'VOID' } });
}

/**
 * GET /packages/me/:id/usage — ປະຫວັດການໃຊ້ສິດຂອງແພັກເກັດ (ນັດທີ່ຜູກກັບ UserPackageItem).
 * ນັດທີ່ຍົກເລີກ = ສິດຄືນເຂົ້າແພັກເກັດແລ້ວ (`returned`).
 */
export async function packageUsage(
  userId: string,
  userPackageId: string,
): Promise<UserPackageUsageView[]> {
  const owned = await prisma.userPackage.findFirst({
    where: { id: userPackageId, userId },
    select: { id: true },
  });
  if (!owned) throw ApiError.notFound('ບໍ່ພົບແພັກເກັດ');

  const rows = await prisma.appointment.findMany({
    where: { userPackageItem: { userPackageId }, deletedAt: null },
    orderBy: { startAt: 'desc' },
    select: {
      id: true,
      serviceId: true,
      startAt: true,
      status: true,
      service: { select: { name: true } },
      staffProfile: { select: { user: { select: { name: true } } } },
    },
  });

  return rows.map((a) => ({
    appointmentId: a.id,
    serviceId: a.serviceId,
    serviceName: a.service.name,
    startAt: a.startAt.toISOString(),
    status: a.status,
    staffName: a.staffProfile?.user.name ?? null,
    returned: a.status === 'CANCELLED',
  }));
}

// ---- admin --------------------------------------------------------------

async function assertServicesExist(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
  const found = await tx.service.count({ where: { id: { in: ids }, deletedAt: null } });
  if (found !== ids.length) throw ApiError.badRequest('ມີບໍລິການທີ່ບໍ່ພົບໃນແພັກເກັດ');
}

/** GET /packages/admin — ທັງໝົດ (ລວມປິດຂາຍ). */
export async function adminListPackages(branchId?: string): Promise<PackageView[]> {
  const rows = await prisma.package.findMany({
    where: branchId ? { branchId } : {},
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    include: PACKAGE_INCLUDE,
  });
  return rows.map(toPackageView);
}

export async function createPackage(input: CreatePackageInput): Promise<PackageView> {
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true } });
  if (!branch) throw ApiError.notFound('ບໍ່ພົບສາຂາ');
  const id = await prisma.$transaction(async (tx) => {
    await assertServicesExist(tx, input.items.map((i) => i.serviceId));
    const row = await tx.package.create({
      data: {
        branchId: input.branchId,
        name: input.name,
        description: input.description ?? null,
        imageUrl: input.imageUrl ?? null,
        totalPrice: dec(input.totalPrice),
        validityDays: input.validityDays,
        isActive: input.isActive,
        items: { create: input.items },
      },
      select: { id: true },
    });
    return row.id;
  });
  return getPackage(id);
}

/** ປ່ຽນ items = ແທນທີ່ທັງໝົດ. ຄອສທີ່ຂາຍໄປແລ້ວມີ UserPackageItem ຂອງຕົນເອງ → ບໍ່ກະທົບ. */
export async function updatePackage(id: string, input: UpdatePackageInput): Promise<PackageView> {
  const exists = await prisma.package.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw ApiError.notFound('ບໍ່ພົບແພັກເກັດ');
  await prisma.$transaction(async (tx) => {
    if (input.items) {
      await assertServicesExist(tx, input.items.map((i) => i.serviceId));
      await tx.packageItem.deleteMany({ where: { packageId: id } });
      await tx.packageItem.createMany({
        data: input.items.map((i) => ({ packageId: id, ...i })),
      });
    }
    await tx.package.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
        ...(input.totalPrice !== undefined ? { totalPrice: dec(input.totalPrice) } : {}),
        ...(input.validityDays !== undefined ? { validityDays: input.validityDays } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
    });
  });
  return getPackage(id);
}
