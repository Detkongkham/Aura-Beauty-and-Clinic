import { z } from 'zod';
import type { AppointmentStatus } from './enums.js';

/* ─────────────────────────────────────────────────────────────────────────────
 * Packages (ຄອສ/ແພັກເກັດ) — ລູກຄ້າຊື້ເອງໃນແອັບ ແລ້ວໃຊ້ສິດຈອງບໍລິການ.
 * ຊື້ = ສ້າງ UserPackage PENDING_PAYMENT + Payment; activate ເມື່ອ Payment FULLY_PAID.
 * ───────────────────────────────────────────────────────────────────────────── */

export const packageListQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  /** ສະເພາະແພັກເກັດທີ່ມີບໍລິການນີ້. */
  serviceId: z.string().uuid().optional(),
});
export type PackageListQuery = z.infer<typeof packageListQuerySchema>;

/** POST /packages/:id/purchase — body ວ່າງ (ລາຄາ/ສາຂາເອົາຈາກ server ເທົ່ານັ້ນ). */
export const purchasePackageSchema = z.object({}).strict();
export type PurchasePackageInput = z.infer<typeof purchasePackageSchema>;

const packageItemInputSchema = z.object({
  serviceId: z.string().uuid(),
  totalUnits: z.number().int().min(1).max(100),
});

/** POST /packages — admin ສ້າງແພັກເກັດ. */
export const createPackageSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  imageUrl: z.string().url().optional(),
  totalPrice: z.number().positive(),
  validityDays: z.number().int().min(1).max(1825).default(365),
  isActive: z.boolean().default(true),
  items: z
    .array(packageItemInputSchema)
    .min(1)
    .refine((xs) => new Set(xs.map((x) => x.serviceId)).size === xs.length, {
      message: 'ບໍລິການຊ້ຳກັນໃນແພັກເກັດ',
    }),
});
export type CreatePackageInput = z.infer<typeof createPackageSchema>;

/** PATCH /packages/:id — admin ແກ້ໄຂ (items ປ່ຽນບໍ່ກະທົບຄອສທີ່ຂາຍໄປແລ້ວ). */
export const updatePackageSchema = createPackageSchema.omit({ branchId: true }).partial();
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;

export type UserPackageStatus = 'PENDING_PAYMENT' | 'ACTIVE' | 'VOID';

export type PackageItemView = {
  serviceId: string;
  serviceName: string;
  serviceImageUrl: string | null;
  durationMinutes: number;
  /** ລາຄາປົກກະຕິຕໍ່ຄັ້ງ. */
  unitPrice: number;
  totalUnits: number;
};

export type PackageView = {
  id: string;
  branchId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  totalPrice: number;
  currency: string;
  validityDays: number;
  isActive: boolean;
  items: PackageItemView[];
  /** ມູນຄ່າລວມຖ້າຊື້ແຍກ (unitPrice × units). */
  valuePrice: number;
  /** ປະຢັດ = valuePrice − totalPrice (≥ 0). */
  savings: number;
  totalSessions: number;
  /** ລາຄາຕໍ່ຄັ້ງ = totalPrice ÷ totalSessions (ປັດເປັນຈຳນວນເຕັມ). */
  perSessionPrice: number;
  /** ສ່ວນຫຼຸດທຽບກັບຊື້ແຍກ (0–100). */
  savingsPct: number;
  /** ຈຳນວນລູກຄ້າທີ່ກຳລັງຖືແພັກເກັດນີ້ (ACTIVE) — ໃຊ້ເປັນ social proof. */
  activeHolders: number;
};

/** ຜົນຂອງການກົດຊື້ — ພາລູກຄ້າໄປຈ່າຍບິນ `paymentId`. */
export type PackagePurchaseView = {
  userPackageId: string;
  paymentId: string;
  amount: number;
  currency: string;
  packageName: string;
};

export type UserPackageItemView = {
  id: string;
  serviceId: string;
  serviceName: string;
  serviceImageUrl: string | null;
  durationMinutes: number;
  totalUnits: number;
  remainingUnits: number;
};

export type UserPackageView = {
  id: string;
  packageId: string;
  packageName: string;
  imageUrl: string | null;
  status: UserPackageStatus;
  /** ACTIVE ແຕ່ເລີຍວັນໝົດອາຍຸແລ້ວ. */
  expired: boolean;
  expireDate: string;
  purchasedAt: string;
  /** ບິນທີ່ຍັງຄ້າງຈ່າຍ (PENDING_PAYMENT ເທົ່ານັ້ນ). */
  paymentId: string | null;
  totalPrice: number;
  items: UserPackageItemView[];
  remainingSessions: number;
  totalSessions: number;
  /** ໃຊ້ໄປແລ້ວ = totalSessions − remainingSessions. */
  usedSessions: number;
  /** ມື້ທີ່ຍັງເຫຼືອກ່ອນໝົດອາຍຸ (ນັບຕາມມື້ວຽງຈັນ; 0 = ໝົດ/ໝົດອາຍຸແລ້ວ). */
  daysLeft: number;
  /** ອາຍຸໃຊ້ງານທັງໝົດຂອງແພັກເກັດ (ມື້) — ໃຊ້ວາດແຖບອາຍຸ. */
  validityDays: number;
};

/** ປະຫວັດການໃຊ້ສິດ 1 ແພັກເກັດ — GET /packages/me/:id/usage (ໃໝ່ສຸດກ່ອນ). */
export type UserPackageUsageView = {
  appointmentId: string;
  serviceId: string;
  serviceName: string;
  startAt: string;
  status: AppointmentStatus;
  staffName: string | null;
  /** ນັດຖືກຍົກເລີກ/ບໍ່ມາ → ສິດຖືກຄືນເຂົ້າແພັກເກັດແລ້ວ. */
  returned: boolean;
};
