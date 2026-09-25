import { z } from 'zod';
import { timeStringSchema } from './common.schema.js';

/**
 * The 18 Lao first-level administrative areas (17 provinces + Vientiane Capital).
 * Kept in sync with web-admin `LaoProvinceId` / `src/features/branches/lao-provinces.ts`.
 */
export const laoProvinceSchema = z.enum([
  'vientiane-capital',
  'vientiane',
  'phongsaly',
  'louangnamtha',
  'oudomxay',
  'bokeo',
  'louangprabang',
  'houaphanh',
  'xayaboury',
  'xiangkhouang',
  'xaisomboun',
  'bolikhamxai',
  'khammouane',
  'savannakhet',
  'salavan',
  'sekong',
  'champasak',
  'attapeu',
]);
export type LaoProvinceId = z.infer<typeof laoProvinceSchema>;

/** ສິ່ງອຳນວຍຄວາມສະດວກທີ່ສາຂາມີ — ສະແດງໃນ mobile service detail. */
export const branchAmenitySchema = z.enum(['wifi', 'parking', 'drink', 'lounge', 'kids', 'card']);
export type BranchAmenity = z.infer<typeof branchAmenitySchema>;

const latitudeSchema = z.coerce.number().min(-90).max(90);
const longitudeSchema = z.coerce.number().min(-180).max(180);

/** POST /branches — ສ້າງສາຂາໃໝ່ (SUPER_ADMIN). */
/** Wave 11 — ເວລາເປີດ-ປິດຂອງມື້ໜຶ່ງ (day 0 = ວັນອາທິດ … 6 = ວັນເສົາ). */
export const branchDayHoursSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    open: timeStringSchema,
    close: timeStringSchema,
    closed: z.boolean().default(false),
  })
  .refine((d) => d.closed || d.open < d.close, { message: 'ເວລາປິດຕ້ອງຫຼັງເວລາເປີດ', path: ['close'] });
export type BranchDayHours = z.infer<typeof branchDayHoursSchema>;

export const branchCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(24),
  address: z.string().trim().max(240).default(''),
  phone: z.string().trim().max(40).default(''),
  email: z.string().trim().email().max(160).optional().or(z.literal('')),
  province: laoProvinceSchema.optional(),
  latitude: latitudeSchema.optional(),
  longitude: longitudeSchema.optional(),
  openTime: timeStringSchema.default('09:00'),
  closeTime: timeStringSchema.default('20:00'),
  isActive: z.boolean().default(true),
  /** Inventory audit C2 — ອະນຸຍາດໃຫ້ BOM ຕັດສະຕັອກຕິດລົບໄດ້ (backflush exception) ແທນທີ່ຈະ block ນັດໝາຍ. */
  allowNegativeStock: z.boolean().default(false),
  amenities: z.array(branchAmenitySchema).max(12).optional(),
  /** Wave 11 — ເວລາແຍກຕາມມື້; [] / null = ໃຊ້ openTime/closeTime ທຸກມື້. */
  weeklyHours: z.array(branchDayHoursSchema).max(7).nullable().optional(),
  managerUserId: z.string().uuid().nullable().optional(),
  coverImageUrl: z.string().trim().url().nullable().optional(),
  photoUrls: z.array(z.string().trim().url()).max(12).optional(),
  monthlyRevenueTarget: z.number().nonnegative().max(1e12).nullable().optional(),
  monthlyBookingTarget: z.number().int().nonnegative().max(1_000_000).nullable().optional(),
});
export type BranchCreateInput = z.infer<typeof branchCreateSchema>;

/** PATCH /branches/:id — ແກ້ໄຂ (ທຸກ field ເປັນ optional). */
export const branchUpdateSchema = branchCreateSchema.partial().extend({
  /** ຢືນຢັນປິດສາຂາ ເຖິງວ່າຍັງມີນັດໝາຍທີ່ຈະມາເຖິງ (ບໍ່ດັ່ງນັ້ນ 409 BRANCH_HAS_UPCOMING). */
  force: z.boolean().optional(),
});
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;

/** POST /branch-closures — ເພີ່ມວັນປິດຮ້ານ ('all' = ທົ່ວບໍລິສັດ). */
export const branchClosureCreateSchema = z.object({
  branchId: z.union([z.string().uuid(), z.literal('all')]).default('all'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ຕ້ອງເປັນ YYYY-MM-DD'),
  reason: z.string().trim().min(1).max(200),
});
export type BranchClosureCreateInput = z.infer<typeof branchClosureCreateSchema>;

// ---- response view-models ------------------------------------------------

export type BranchView = {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string | null;
  province: LaoProvinceId;
  latitude: number;
  longitude: number;
  timezone: string;
  isActive: boolean;
  openTime: string;
  closeTime: string;
  allowNegativeStock: boolean;
  amenities: BranchAmenity[];
  createdAt: string;
  /** Wave 11 */
  weeklyHours: BranchDayHours[] | null;
  managerUserId: string | null;
  managerName: string | null;
  coverImageUrl: string | null;
  photoUrls: string[];
  monthlyRevenueTarget: number | null;
  monthlyBookingTarget: number | null;
  /** ສາຂາທີ່ເກັບເຂົ້າຄັງ (archived) — ບໍ່ສະແດງໃນລາຍການປົກກະຕິ. */
  archivedAt: string | null;
};

/** GET /branches/:id/history — ປະຫວັດການແກ້ໄຂຂໍ້ມູນສາຂາ (AuditLog). */
export type BranchHistoryEntry = {
  id: string;
  action: string;
  at: string;
  userName: string | null;
  /** field → { from, to } ຂອງສິ່ງທີ່ປ່ຽນ (null ສຳລັບລາຍການເກົ່າທີ່ບໍ່ມີຄ່າກ່ອນໜ້າ). */
  changes: Record<string, { from: unknown; to: unknown }> | null;
};

export const branchArchiveSchema = z.object({ force: z.boolean().optional() });
export type BranchArchiveInput = z.infer<typeof branchArchiveSchema>;

export type BranchClosureView = {
  id: string;
  branchId: string;
  branchName: string;
  date: string;
  reason: string;
  createdAt: string;
};

/** GET /branches/insights — ຕົວຊີ້ວັດການດຳເນີນງານຕໍ່ສາຂາ. */
export const branchInsightsQuerySchema = z.object({
  days: z.coerce.number().int().refine((d) => [7, 30, 90].includes(d)).default(30),
});
export type BranchInsightsQuery = z.infer<typeof branchInsightsQuerySchema>;

export type BranchInsight = {
  branchId: string;
  /** ຊັບພະຍາກອນ */
  staffCount: number;
  roomCount: number;
  roomsAvailable: number;
  equipmentCount: number;
  serviceCount: number;
  /** ມື້ນີ້ (ວຽງຈັນ) */
  today: {
    appointments: number;
    completed: number;
    inProgress: number;
    /** PENDING/CONFIRMED ທີ່ຍັງບໍ່ເຖິງເວລາເລີ່ມ. */
    upcoming: number;
    revenue: number;
    queueWaiting: number;
    /** ນາທີທີ່ຈອງແລ້ວ ÷ (ພະນັກງານ × ນາທີເປີດ) — null ເມື່ອບໍ່ມີພະນັກງານ. */
    utilization: number | null;
  };
  /** ຊ່ວງ `days` ມື້ຫຼ້າສຸດ (ລວມມື້ນີ້) ທຽບກັບຊ່ວງກ່ອນໜ້າທີ່ຍາວເທົ່າກັນ. */
  period: {
    bookings: number;
    completed: number;
    cancelled: number;
    noShow: number;
    revenue: number;
    revenuePrev: number;
    bookingsPrev: number;
    avgTicket: number;
    customers: number;
    utilization: number | null;
    /** ລາຍຮັບ (ນັດທີ່ສຳເລັດ) ຕໍ່ມື້, ເກົ່າ → ໃໝ່. */
    daily: number[];
  };
  rating: { avg: number | null; count: number };
  /** ນັດ PENDING/CONFIRMED ໃນອະນາຄົດ — ໃຊ້ເຕືອນກ່ອນປິດສາຂາ. */
  upcomingAppointments: number;
  lowStock: number;
  outstandingBills: number;
  outstandingAmount: number;
  /** Wave 11 — ຄວາມຄືບໜ້າເປົ້າເດືອນນີ້ (ວຽງຈັນ): ລາຍຮັບ + ນັດສຳເລັດ ແຕ່ວັນທີ 1. */
  month?: { revenue: number; completed: number; revenueTarget: number | null; bookingTarget: number | null; dayOfMonth: number; daysInMonth: number };
  /** ວັນປິດຮ້ານ 60 ມື້ຂ້າງໜ້າ (ລວມວັນປິດທົ່ວບໍລິສັດ). */
  closures: { id: string; date: string; reason: string; companyWide: boolean }[];
};

export type BranchInsightsView = {
  days: number;
  from: string;
  to: string;
  generatedAt: string;
  items: BranchInsight[];
};
