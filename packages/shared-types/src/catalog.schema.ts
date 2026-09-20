import { z } from 'zod';
import { paginationQuerySchema } from './common.schema.js';

/** query param boolean ("true"/"1" = ຈິງ, ອື່ນ = ບໍ່ຈິງ). */
const booleanFlag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true' || v === '1');

/** ຄື `booleanFlag` ແຕ່ຮັກສາ `undefined` ໄວ້ (tri-state filter — ບໍ່ໄດ້ສົ່ງ = ບໍ່ກັ່ນຕອງ). */
const optionalBooleanFlag = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === true || v === 'true' || v === '1'));

/** ວິທີຈັດຮຽງລາຍການບໍລິການ. */
export const serviceSortSchema = z.enum(['popular', 'name', 'priceAsc', 'priceDesc']);
export type ServiceSort = z.infer<typeof serviceSortSchema>;

/** GET /catalog/services — filter/ຄົ້ນຫາ (Customer App Search + Home + Booking Step 1). */
export const serviceListQuerySchema = paginationQuerySchema.extend({
  branchId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  q: z.string().trim().min(1).max(120).optional(),
  popular: booleanFlag,
  sort: serviceSortSchema.optional(),
  priceMin: z.coerce.number().nonnegative().optional(),
  priceMax: z.coerce.number().nonnegative().optional(),
  durationMax: z.coerce.number().int().positive().optional(),
  requireDeposit: optionalBooleanFlag,
});
export type ServiceListQuery = z.infer<typeof serviceListQuerySchema>;

/** GET /staff — filter ລາຍຊື່ຊ່າງສຳລັບ Customer App. */
export const staffListQuerySchema = z.object({
  branchId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
});
export type StaffListQuery = z.infer<typeof staffListQuerySchema>;

// ---- response view-models ------------------------------------------------

export type ServiceCategoryView = {
  id: string;
  name: string;
  imageUrl: string | null;
  serviceCount: number;
};

export type ServiceListItem = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  branchId: string | null;
  price: number;
  /** ລາຄາເຕັມກ່ອນຫຼຸດ (null = ບໍ່ຫຼຸດ). ສະແດງຂີດຄ້ຽນ + ປ້າຍ % ເມື່ອ > price. */
  compareAtPrice: number | null;
  durationMinutes: number;
  imageUrl: string | null;
  /** ຈຸດເດັ່ນສັ້ນໆ ສຳລັບ chip (ເຊັ່ນ "ຜົມສຸຂະພາບດີ"). */
  highlights: string[];
  requireDeposit: boolean;
  depositAmount: number | null;
  /** ຄະແນນສະເລ່ຍ 0–5 (0 = ຍັງບໍ່ມີຣີວິວ). */
  rating: number;
  /** ຈຳນວນຣີວິວທັງໝົດຂອງບໍລິການນີ້. */
  reviewCount: number;
  /** ຢູ່ໃນກຸ່ມບໍລິການຍອດນິຍົມ (top by booking count). */
  popular: boolean;
};

/** ຂັ້ນຕອນການບໍລິການ 1 ຂັ້ນ (Service.steps). */
export type ServiceStep = {
  title: string;
  body: string;
};

/** ຣີວິວລູກຄ້າ 1 ລາຍການ ສຳລັບໜ້າລາຍລະອຽດບໍລິການ. */
export type ServiceReviewItem = {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  rating: number;
  comment: string;
  createdAt: string;
};

export type StaffSummary = {
  id: string;
  name: string;
  title: string;
  avatarUrl: string | null;
  rating: number;
  totalReviews: number;
};

/** ສາຂາທີ່ໃຫ້ບໍລິການ — ທີ່ຢູ່ + ເວລາເປີດ-ປິດ ສຳລັບບັດ "ສະຖານທີ່" ໜ້າລາຍລະອຽດ. */
export type ServiceBranchInfo = {
  id: string;
  name: string;
  address: string;
  phone: string;
  /** HH:mm (ເວລາວຽງຈັນ). */
  openTime: string;
  closeTime: string;
  latitude: number | null;
  longitude: number | null;
};

/** ແພັກເກັດທີ່ລວມບໍລິການນີ້ (ຂາຍຕໍ່ / ປະຢັດກວ່າ). */
export type ServicePackageOffer = {
  id: string;
  name: string;
  totalPrice: number;
  /** ຈຳນວນຄັ້ງຂອງບໍລິການນີ້ໃນແພັກເກັດ. */
  units: number;
  /** ຈຳນວນລາຍການບໍລິການທັງໝົດໃນແພັກເກັດ. */
  itemCount: number;
  /** ປະຢັດທຽບກັບຊື້ແຍກ (≥ 0). */
  savings: number;
};

export type ServiceDetailView = ServiceListItem & {
  isActive: boolean;
  staff: StaffSummary[];
  /** ຂັ້ນຕອນການບໍລິການ (ຮຽງລຳດັບ). ວ່າງ = ຍັງບໍ່ໄດ້ຕັ້ງ. */
  steps: ServiceStep[];
  /** ຣີວິວລ່າສຸດທີ່ມີຂໍ້ຄວາມ (ສູງສຸດ 6, ໃໝ່ສຸດກ່ອນ). */
  reviews: ServiceReviewItem[];
  /** ສິ່ງອຳນວຍຄວາມສະດວກຂອງສາຂາທີ່ໃຫ້ບໍລິການ. */
  amenities: string[];
  /** ຈຳນວນຣີວິວຕໍ່ດາວ — index 0 = 5★ … index 4 = 1★. */
  ratingBreakdown: [number, number, number, number, number];
  /** ຈຳນວນນັດທີ່ສຳເລັດແລ້ວ (social proof). */
  completedCount: number;
  /** ສາຂາສະເພາະຂອງບໍລິການ (null = ໃຫ້ບໍລິການທຸກສາຂາ). */
  branch: ServiceBranchInfo | null;
  /** ແພັກເກັດທີ່ເປີດຂາຍ ແລະ ມີບໍລິການນີ້ (ສູງສຸດ 3). */
  packages: ServicePackageOffer[];
  /** ບໍລິການອື່ນໃນໝວດດຽວກັນ (ສູງສຸດ 6). */
  related: ServiceListItem[];
};

export type StaffListItem = StaffSummary & {
  bio: string | null;
  branchIds: string[];
  serviceIds: string[];
};
