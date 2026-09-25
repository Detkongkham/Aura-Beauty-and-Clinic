import type {
  PayrollAdjustmentType,
  PayrollSettings,
  PayslipTaxStep,
  PitBracket,
  SalaryType,
} from '@abcp/shared-types';

/**
 * Payroll P3 — ສູດຄິດໃບຈ່າຍເງິນ (pure, ບໍ່ແຕະ DB) ເພື່ອໃຫ້ unit test ໄດ້ກົງໆ.
 *
 * ລຳດັບ:
 *   gross   = basePay − absenceDeduction + overtimePay + commission + bonus + allowances
 *   ssoBase = min(ເພດານ, ຄ່າຈ້າງຄົງທີ່ [+ ຄອມ/ໂບນັດ ຖ້າຕັ້ງໄວ້])          (ຖ້າເຂົ້າປະກັນສັງຄົມ)
 *   taxable = gross − ssoEmployee                                      (ອາກອນແບບຂັ້ນໄດ)
 *   net     = gross − ssoEmployee − incomeTax − advances − otherDeductions − clawback
 */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** ຄ່າເລີ່ມຕົ້ນ — ຕ້ອງໃຫ້ນັກບັນຊີກວດກັບກົດໝາຍ/ດຳລັດສະບັບປັດຈຸບັນກ່ອນໃຊ້ຈິງ (ແກ້ໄດ້ໃນ /payroll/settings). */
export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  // ກົດໝາຍວ່າດ້ວຍອາກອນລາຍໄດ້ (2019): ອັດຕາກ້າວໜ້າ 0–25% ຕໍ່ເດືອນ.
  pitBrackets: [
    { upTo: 1_300_000, rate: 0 },
    { upTo: 5_000_000, rate: 0.05 },
    { upTo: 15_000_000, rate: 0.1 },
    { upTo: 25_000_000, rate: 0.15 },
    { upTo: 65_000_000, rate: 0.2 },
    { upTo: null, rate: 0.25 },
  ],
  sso: { employeeRate: 0.055, employerRate: 0.06, wageCeiling: 4_500_000, includeVariablePay: false },
  time: { workDaysPerMonth: 26, standardHoursPerDay: 8, overtimeMultiplier: 1.5, deductAbsence: true },
  commissionRequiresCollection: true,
  quickPayLimitLak: 5_000_000,
};

export function progressiveTax(taxable: number, brackets: PitBracket[]): { tax: number; steps: PayslipTaxStep[] } {
  const steps: PayslipTaxStep[] = [];
  let lower = 0;
  let tax = 0;
  for (const b of brackets) {
    if (taxable <= lower) break;
    const upper = b.upTo ?? Number.POSITIVE_INFINITY;
    const slice = Math.min(taxable, upper) - lower;
    const t = round2(slice * b.rate);
    if (slice > 0) {
      steps.push({ from: lower, to: b.upTo, rate: b.rate, tax: t });
      tax += t;
    }
    lower = upper;
  }
  return { tax: round2(tax), steps };
}

export type AttendanceDay = {
  status: 'ON_TIME' | 'LATE' | 'OVERTIME' | 'ABSENT';
  checkIn: Date;
  checkOut: Date | null;
};

export type PayslipInput = {
  salaryType: SalaryType;
  baseRate: number;
  ssoEnrolled: boolean;
  attendance: AttendanceDay[];
  commission: number;
  bonus: number;
  clawback: number;
  adjustments: Array<{ type: PayrollAdjustmentType; label: string; amount: number }>;
};

export type PayslipFigures = {
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
  netPay: number;
  taxBreakdown: PayslipTaxStep[];
};

const HOUR_MS = 3_600_000;

export function computePayslip(input: PayslipInput, settings: PayrollSettings): PayslipFigures {
  const { time, sso } = settings;
  const present = input.attendance.filter((a) => a.status !== 'ABSENT');
  const daysAbsent = input.attendance.length - present.length;
  // ບໍ່ມີ checkOut (ລືມກົດອອກ) → ນັບເປັນມື້ມາດຕະຖານ, ບໍ່ໃຫ້ OT.
  const hoursOf = (a: AttendanceDay) =>
    a.checkOut ? Math.max(0, (a.checkOut.getTime() - a.checkIn.getTime()) / HOUR_MS) : time.standardHoursPerDay;
  const hoursWorked = round2(present.reduce((s, a) => s + hoursOf(a), 0));
  // OT ນັບສະເພາະມື້ທີ່ສະຖານະ OVERTIME (ຜູ້ຈັດການຮັບຮູ້) ແລະ ເກີນຊົ່ວໂມງມາດຕະຖານ.
  const overtimeHours = round2(
    present
      .filter((a) => a.status === 'OVERTIME' && a.checkOut)
      .reduce((s, a) => s + Math.max(0, hoursOf(a) - time.standardHoursPerDay), 0),
  );

  const rate = input.baseRate;
  let basePay = 0;
  let hourly = 0;
  let absenceDeduction = 0;
  switch (input.salaryType) {
    case 'MONTHLY':
      basePay = rate;
      hourly = rate / time.workDaysPerMonth / time.standardHoursPerDay;
      if (time.deductAbsence) {
        absenceDeduction = Math.min(basePay, (rate / time.workDaysPerMonth) * daysAbsent);
      }
      break;
    case 'DAILY':
      basePay = rate * present.length;
      hourly = rate / time.standardHoursPerDay;
      break;
    case 'HOURLY':
      basePay = rate * hoursWorked;
      hourly = rate;
      break;
    case 'NONE':
      break;
  }
  basePay = round2(basePay);
  absenceDeduction = round2(absenceDeduction);
  const overtimePay = round2(overtimeHours * hourly * time.overtimeMultiplier);

  const sumOf = (t: PayrollAdjustmentType) =>
    round2(input.adjustments.filter((a) => a.type === t).reduce((s, a) => s + a.amount, 0));
  const allowances = sumOf('ALLOWANCE');
  const advances = sumOf('ADVANCE');
  const otherDeductions = round2(sumOf('PENALTY') + sumOf('OTHER_DEDUCTION'));

  const commission = round2(input.commission);
  const bonus = round2(input.bonus);
  const fixedPay = basePay - absenceDeduction + overtimePay + allowances;
  const grossPay = round2(fixedPay + commission + bonus);

  const ssoBase = input.ssoEnrolled
    ? round2(Math.min(sso.wageCeiling, Math.max(0, fixedPay + (sso.includeVariablePay ? commission + bonus : 0))))
    : 0;
  const ssoEmployee = round2(ssoBase * sso.employeeRate);
  const ssoEmployer = round2(ssoBase * sso.employerRate);

  const taxableIncome = round2(Math.max(0, grossPay - ssoEmployee));
  const { tax: incomeTax, steps } = progressiveTax(taxableIncome, settings.pitBrackets);

  const clawback = round2(input.clawback);
  const netPay = round2(grossPay - ssoEmployee - incomeTax - advances - otherDeductions - clawback);

  return {
    daysPresent: present.length,
    daysAbsent,
    hoursWorked,
    overtimeHours,
    basePay,
    absenceDeduction,
    overtimePay,
    commission,
    bonus,
    allowances,
    grossPay,
    ssoBase,
    ssoEmployee,
    ssoEmployer,
    taxableIncome,
    incomeTax,
    advances,
    otherDeductions,
    clawback,
    netPay,
    taxBreakdown: steps,
  };
}
