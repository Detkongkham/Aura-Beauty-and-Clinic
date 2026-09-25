import { z } from 'zod';

/**
 * Payroll P2/P3/P4 (docs/payroll-audit.md) — ຮອບຈ່າຍເງິນເດືອນ, ໃບຈ່າຍເງິນ, ເງິນເດືອນພື້ນຖານ/OT,
 * ລາຍການເພີ່ມ/ຫັກ, ປະກັນສັງຄົມ, ອາກອນລາຍໄດ້ແບບຂັ້ນໄດ.
 */

const monthYearSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'ຕ້ອງເປັນຮູບແບບ YYYY-MM');

export const SALARY_TYPES = ['NONE', 'MONTHLY', 'DAILY', 'HOURLY'] as const;
export type SalaryType = (typeof SALARY_TYPES)[number];

export const PAYROLL_RUN_STATUSES = ['DRAFT', 'APPROVED', 'PAID'] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export const PAYROLL_ADJUSTMENT_TYPES = ['ALLOWANCE', 'ADVANCE', 'PENALTY', 'OTHER_DEDUCTION'] as const;
export type PayrollAdjustmentType = (typeof PAYROLL_ADJUSTMENT_TYPES)[number];

export const PAYROLL_PAY_METHODS = ['CASH', 'TRANSFER'] as const;
export type PayrollPayMethod = (typeof PAYROLL_PAY_METHODS)[number];

// ---- settings --------------------------------------------------------------

export const pitBracketSchema = z.object({
  /** ເພດານເທິງຂອງຂັ້ນ (LAK/ເດືອນ); null = ບໍ່ຈຳກັດ (ຂັ້ນສຸດທ້າຍ). */
  upTo: z.number().positive().nullable(),
  rate: z.number().min(0).max(0.6),
});
export type PitBracket = z.infer<typeof pitBracketSchema>;

export const payrollSettingsSchema = z.object({
  pitBrackets: z
    .array(pitBracketSchema)
    .min(1)
    .max(12)
    .refine(
      (b) =>
        b.every((x, i) => (i === b.length - 1 ? x.upTo === null : x.upTo !== null)) &&
        b.slice(0, -1).every((x, i) => i === 0 || (x.upTo ?? 0) > (b[i - 1]!.upTo ?? 0)),
      { message: 'ຂັ້ນໄດຕ້ອງຮຽງຈາກນ້ອຍຫາໃຫຍ່ ແລະ ຂັ້ນສຸດທ້າຍບໍ່ມີເພດານ' },
    ),
  sso: z.object({
    employeeRate: z.number().min(0).max(0.3),
    employerRate: z.number().min(0).max(0.3),
    /** ເພດານຄ່າຈ້າງທີ່ໃຊ້ຄິດປະກັນສັງຄົມ (LAK/ເດືອນ). */
    wageCeiling: z.number().positive(),
    /** ລວມຄ່າຄອມ/ໂບນັດເຂົ້າຖານປະກັນສັງຄົມບໍ່. */
    includeVariablePay: z.boolean(),
  }),
  time: z.object({
    workDaysPerMonth: z.number().int().min(1).max(31),
    standardHoursPerDay: z.number().min(1).max(24),
    overtimeMultiplier: z.number().min(1).max(5),
    /** ເງິນເດືອນລາຍເດືອນ: ຫັກມື້ຂາດ (ABSENT) = ເງິນເດືອນ ÷ ວັນເຮັດວຽກ × ມື້ຂາດ. */
    deductAbsence: z.boolean(),
  }),
  /** C2 — ຄ່າຄອມຈ່າຍໄດ້ສະເພາະນັດທີ່ເກັບເງິນບິນຄົບແລ້ວ. */
  commissionRequiresCollection: z.boolean(),
  /** G3.5 — BRANCH_ADMIN ກົດ "ຈ່າຍ" ດ່ວນ (ນອກຮອບ) ໄດ້ບໍ່ເກີນຍອດນີ້ຕໍ່ຄັ້ງ; ເກີນ = ເຈົ້າຂອງເທົ່ານັ້ນ. 0 = ບໍ່ອະນຸຍາດເລີຍ. */
  quickPayLimitLak: z.number().min(0),
});
export type PayrollSettings = z.infer<typeof payrollSettingsSchema>;

// ---- inputs ----------------------------------------------------------------

export const staffSalarySchema = z.object({
  salaryType: z.enum(SALARY_TYPES),
  baseSalary: z.coerce.number().min(0).max(1_000_000_000),
  ssoEnrolled: z.boolean(),
});
export type StaffSalaryInput = z.infer<typeof staffSalarySchema>;

export const payrollAdjustmentCreateSchema = z.object({
  staffProfileId: z.string().uuid(),
  monthYear: monthYearSchema,
  type: z.enum(PAYROLL_ADJUSTMENT_TYPES),
  amount: z.coerce.number().positive().max(1_000_000_000),
  label: z.string().trim().min(2).max(120),
});
export type PayrollAdjustmentCreateInput = z.infer<typeof payrollAdjustmentCreateSchema>;

export const payrollAdjustmentQuerySchema = z.object({
  monthYear: monthYearSchema,
  staffProfileId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
});
export type PayrollAdjustmentQuery = z.infer<typeof payrollAdjustmentQuerySchema>;

export const payrollRunCreateSchema = z.object({
  branchId: z.string().uuid(),
  monthYear: monthYearSchema,
  note: z.string().trim().max(500).optional(),
});
export type PayrollRunCreateInput = z.infer<typeof payrollRunCreateSchema>;

export const payrollRunListQuerySchema = z.object({
  monthYear: monthYearSchema.optional(),
  branchId: z.string().uuid().optional(),
});
export type PayrollRunListQuery = z.infer<typeof payrollRunListQuerySchema>;

export const payrollRunReopenSchema = z.object({
  reason: z.string().trim().min(3, 'ກະລຸນາລະບຸເຫດຜົນ').max(300),
});
export type PayrollRunReopenInput = z.infer<typeof payrollRunReopenSchema>;

export const payrollRunPaySchema = z
  .object({
    method: z.enum(PAYROLL_PAY_METHODS),
    reference: z.string().trim().max(120).optional(),
    /** ບັນຊີທະນາຄານທີ່ໂອນອອກ (TRANSFER) — ຜູກກັບລາຍຈ່າຍເພື່ອໃຫ້ກະທົບຍອດ (reconciliation) ເຫັນ. */
    bankAccountId: z.string().uuid().optional(),
  })
  .refine((v) => v.method === 'TRANSFER' || !v.bankAccountId, {
    message: 'ບັນຊີທະນາຄານໃຊ້ໄດ້ກັບການໂອນເທົ່ານັ້ນ',
    path: ['bankAccountId'],
  });
export type PayrollRunPayInput = z.infer<typeof payrollRunPaySchema>;

/** G5.5 — ຕັ້ງເປົ້າ KPI ເປັນຊຸດ. PREV_MONTH_PCT: ເປົ້າ = ລາຍຮັບເດືອນກ່ອນ × value%; FIXED: ທຸກຄົນ = value. */
export const kpiBulkTargetSchema = z.object({
  monthYear: monthYearSchema,
  branchId: z.string().uuid().optional(),
  mode: z.enum(['PREV_MONTH_PCT', 'FIXED']),
  value: z.coerce.number().positive().max(1_000_000_000),
  /** ບໍ່ທັບຄົນທີ່ຕັ້ງເປົ້າໄວ້ແລ້ວ (ຄ່າເລີ່ມຕົ້ນ). */
  overwrite: z.boolean().default(false),
});
export type KpiBulkTargetInput = z.infer<typeof kpiBulkTargetSchema>;

export const payrollYtdQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  branchId: z.string().uuid().optional(),
});
export type PayrollYtdQuery = z.infer<typeof payrollYtdQuerySchema>;

// ---- views -----------------------------------------------------------------

/** G5.3 — ສະຫຼຸບປີຕໍ່ຄົນຈາກໃບຈ່າຍເງິນຂອງຮອບທີ່ PAID (ໃຊ້ຍື່ນອາກອນ/ປະກັນສັງຄົມປະຈຳປີ). */
export type PayrollYtdRow = {
  staffProfileId: string;
  staffName: string;
  months: number;
  grossPay: number;
  commission: number;
  bonus: number;
  ssoEmployee: number;
  ssoEmployer: number;
  incomeTax: number;
  netPay: number;
};
export type PayrollYtdView = {
  year: number;
  rows: PayrollYtdRow[];
  totals: Omit<PayrollYtdRow, 'staffProfileId' | 'staffName' | 'months'> & { runs: number };
};

export type PayrollAdjustmentView = {
  id: string;
  staffProfileId: string;
  staffName: string;
  monthYear: string;
  type: PayrollAdjustmentType;
  amount: number;
  label: string;
  createdAt: string;
  /** ຮອບຂອງເດືອນນີ້ APPROVED/PAID ແລ້ວ → ລຶບບໍ່ໄດ້. */
  locked: boolean;
};

export type PayslipTaxStep = { from: number; to: number | null; rate: number; tax: number };

export type PayslipView = {
  id: string;
  payrollRunId: string;
  staffProfileId: string;
  staffName: string;
  salaryType: SalaryType;
  baseRate: number;
  daysPresent: number;
  daysAbsent: number;
  hoursWorked: number;
  overtimeHours: number;
  basePay: number;
  absenceDeduction: number;
  overtimePay: number;
  commission: number;
  bonus: number;
  allowances: number;
  grossPay: number;
  ssoBase: number;
  ssoEmployee: number;
  ssoEmployer: number;
  taxableIncome: number;
  incomeTax: number;
  advances: number;
  otherDeductions: number;
  clawback: number;
  /** ລວມລາຍການຫັກທັງໝົດ = ssoEmployee + incomeTax + advances + otherDeductions + clawback. */
  totalDeductions: number;
  netPay: number;
  commissionLines: number;
  adjustments: Array<{ type: PayrollAdjustmentType; label: string; amount: number }>;
  taxBreakdown: PayslipTaxStep[];
};

export type PayrollRunView = {
  id: string;
  branchId: string;
  branchName: string;
  monthYear: string;
  status: PayrollRunStatus;
  note: string | null;
  preparedBy: string;
  preparedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  paidBy: string | null;
  paidAt: string | null;
  paymentMethod: PayrollPayMethod | null;
  paymentReference: string | null;
  /** ບັນຊີທີ່ໂອນອອກ (ຖ້າລະບຸ). */
  bankAccountLabel: string | null;
  reopenCount: number;
  lastReopenReason: string | null;
  staffCount: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  totalCommission: number;
  totalBonus: number;
  totalEmployerSso: number;
  totalIncomeTax: number;
  /** ຕົ້ນທຶນນາຍຈ້າງ = gross + ssoEmployer. */
  employerCost: number;
  /** ມີໃບທີ່ເງິນສຸດທິຕິດລົບ (ຫັກເກີນລາຍໄດ້) — ຕ້ອງກວດກ່ອນອະນຸມັດ. */
  negativeNetCount: number;
  expenseId: string | null;
  payslips?: PayslipView[];
};

/** ໃບຈ່າຍເງິນຂອງຊ່າງເອງ (staff portal / ມືຖື) — ສະເພາະຮອບ APPROVED/PAID. */
export type MyPayslipView = PayslipView & {
  monthYear: string;
  branchName: string;
  runStatus: PayrollRunStatus;
  paidAt: string | null;
};
