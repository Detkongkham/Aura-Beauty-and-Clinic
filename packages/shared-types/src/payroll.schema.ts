import { z } from 'zod';

/** ໂມດູນ 34 — Staff KPI, Leaderboard & Bonuses + payroll (ຄ່າຄອມມິດຊັນ isPaid + export). */

const monthYearSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'ຕ້ອງເປັນຮູບແບບ YYYY-MM');

export const payrollQuerySchema = z.object({
  monthYear: monthYearSchema.optional(),
  branchId: z.string().uuid().optional(),
});
export type PayrollQuery = z.infer<typeof payrollQuerySchema>;

export const kpiGoalWriteSchema = z.object({
  monthYear: monthYearSchema,
  targetRevenue: z.coerce.number().nonnegative(),
});
export type KpiGoalWriteInput = z.infer<typeof kpiGoalWriteSchema>;

export const kpiRecomputeSchema = z.object({
  monthYear: monthYearSchema,
  branchId: z.string().uuid().optional(),
});
export type KpiRecomputeInput = z.infer<typeof kpiRecomputeSchema>;

export const bonusPaidSchema = z.object({
  monthYear: monthYearSchema,
  isBonusPaid: z.boolean(),
});
export type BonusPaidInput = z.infer<typeof bonusPaidSchema>;

export const commissionPaySchema = z.object({
  staffProfileId: z.string().uuid(),
  monthYear: monthYearSchema,
  isPaid: z.boolean(),
  /** ຈຳກັດການຈ່າຍໄວ້ສະເພາະສາຂາທີ່ກຳລັງເບິ່ງຢູ່ — ບໍ່ດັ່ງນັ້ນຄິວສາຂາອື່ນຈະຖືກຈ່າຍນຳ. */
  branchId: z.string().uuid().optional(),
});
export type CommissionPayInput = z.infer<typeof commissionPaySchema>;

/** ຈ່າຍຄ່າຄອມຫຼາຍຄົນພ້ອມກັນ (bulk action bar ໃນຕາຕະລາງ payroll). */
export const commissionBulkPaySchema = z.object({
  staffProfileIds: z.array(z.string().uuid()).min(1).max(500),
  monthYear: monthYearSchema,
  isPaid: z.boolean(),
  branchId: z.string().uuid().optional(),
});
export type CommissionBulkPayInput = z.infer<typeof commissionBulkPaySchema>;

/** ໝາຍໂບນັດຈ່າຍ/ຍົກເລີກ ຫຼາຍຄົນພ້ອມກັນ. */
export const bonusBulkPaidSchema = z.object({
  staffProfileIds: z.array(z.string().uuid()).min(1).max(500),
  monthYear: monthYearSchema,
  isBonusPaid: z.boolean(),
});
export type BonusBulkPaidInput = z.infer<typeof bonusBulkPaidSchema>;

// ---- response view-models -----------------------------------------

/** ສະຫຼຸບການລົງເວລາຂອງເດືອນ (StaffAttendance) — ໃຊ້ເປັນບໍລິບົດຂອງຜົນງານ. */
export type PayrollAttendance = {
  /** ຈຳນວນມື້ທີ່ມີການ check-in (ທຸກສະຖານະ ນອກຈາກ ABSENT). */
  present: number;
  late: number;
  overtime: number;
  absent: number;
};

/** ສະຖານະການຈ່າຍລວມຂອງແຖວໜຶ່ງ — ໃຊ້ແທນການອ່ານຕົວເລກເອງ. */
export type PayoutState = 'CLEAR' | 'PARTIAL' | 'DUE' | 'NONE';

export type PayrollRow = {
  staffProfileId: string;
  staffName: string;
  branchId: string;
  branchName: string;
  rank: number;
  completedJobs: number;
  grossRevenue: number;
  commissionRate: number;
  commissionTotal: number;
  commissionPaid: number;
  commissionUnpaid: number;
  targetRevenue: number;
  actualRevenue: number;
  targetMet: boolean;
  attainmentPct: number;
  bonusAmount: number;
  bonusPaid: boolean;
  /** commissionTotal + bonusAmount */
  payable: number;
  /** commissionUnpaid + (bonusPaid ? 0 : bonusAmount) */
  outstanding: number;

  // ── ບໍລິບົດເພີ່ມ (Wave 11 — payroll console) ─────────────────────
  /** ຊ່າງຍັງເຮັດວຽກຢູ່ບໍ່ — ຊ່າງທີ່ປິດໃຊ້ງານຍັງຕ້ອງຖືກຈ່າຍຄ້າງ. */
  isActive: boolean;
  rating: number;
  totalReviews: number;
  /** ຍອດສະເລ່ຍຕໍ່ຄິວ (grossRevenue / completedJobs). */
  avgTicket: number;
  /** ສ່ວນແບ່ງລາຍຮັບຂອງຄົນນີ້ໃນລາຍງານນີ້ (0–1). */
  revenueShare: number;
  /** ລາຍຮັບເດືອນກ່ອນ — ສຳລັບ MoM delta. */
  prevGrossRevenue: number;
  prevCompletedJobs: number;
  /** % ປ່ຽນແປງທຽບເດືອນກ່ອນ; `null` ເມື່ອເດືອນກ່ອນເປັນ 0 (ຄິດບໍ່ໄດ້). */
  revenueDeltaPct: number | null;
  /** ຈຳນວນລາຍການຄ່າຄອມ (= ຄິວທີ່ສ້າງຄ່າຄອມ). */
  commissionLines: number;
  attendance: PayrollAttendance;
  payoutState: PayoutState;
};

export type PayrollDailyPoint = {
  /** YYYY-MM-DD ຕາມເວລາວຽງຈັນ. */
  date: string;
  revenue: number;
  jobs: number;
};

export type PayrollTotals = {
  staff: number;
  activeStaff: number;
  completedJobs: number;
  grossRevenue: number;
  commissionTotal: number;
  commissionPaid: number;
  commissionUnpaid: number;
  bonusTotal: number;
  bonusUnpaid: number;
  /** commissionTotal + bonusTotal — ຄ່າແຮງລວມຂອງເດືອນ. */
  payable: number;
  outstanding: number;
  /** ຈຳນວນຄົນທີ່ຍັງມີຍອດຄ້າງ. */
  staffOwed: number;
  targetRevenue: number;
  targetMetCount: number;
  /** ຈຳນວນຄົນທີ່ຕັ້ງເປົ້າແລ້ວ — ສ່ວນທີ່ເຫຼືອຄື gap ຂອງການຕັ້ງເປົ້າ. */
  staffWithTarget: number;
  /** payable ÷ grossRevenue — ສັດສ່ວນຄ່າແຮງຕໍ່ລາຍຮັບ (labour cost ratio). */
  labourCostRatio: number;
};

export type PayrollPrevious = {
  monthYear: string;
  grossRevenue: number;
  completedJobs: number;
  commissionTotal: number;
  payable: number;
};

export type PayrollReport = {
  monthYear: string;
  generatedAt: string;
  bonusRate: number;
  /** ເດືອນນີ້ຍັງບໍ່ທັນຈົບ → ຕົວເລກຍັງເໜັງຕີງ, UI ຕ້ອງບອກຜູ້ໃຊ້. */
  isCurrentMonth: boolean;
  daysElapsed: number;
  daysInMonth: number;
  rows: PayrollRow[];
  daily: PayrollDailyPoint[];
  totals: PayrollTotals;
  previous: PayrollPrevious;
};

/** ໜຶ່ງແຖວຄ່າຄອມ = ໜຶ່ງຄິວທີ່ສຳເລັດ. */
export type PayrollCommissionLine = {
  commissionId: string;
  appointmentId: string;
  startAt: string;
  customerName: string;
  serviceName: string;
  branchName: string;
  serviceAmount: number;
  commissionRate: number;
  payoutAmount: number;
  isPaid: boolean;
};

/** ຂໍ້ມູນ drill-down ຕໍ່ຄົນ — payslip ຂອງເດືອນ. */
export type PayrollBreakdown = {
  monthYear: string;
  row: PayrollRow;
  lines: PayrollCommissionLine[];
  daily: PayrollDailyPoint[];
  topServices: Array<{ serviceName: string; jobs: number; revenue: number }>;
  /** 6 ເດືອນຫຼ້າສຸດ (ເກົ່າ→ໃໝ່) ສຳລັບ sparkline ໃນ payslip. */
  history: Array<{ monthYear: string; grossRevenue: number; payable: number }>;
};
