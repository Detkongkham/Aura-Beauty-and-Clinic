import type {
  MyPayslipView,
  PayrollAdjustmentCreateInput,
  PayrollAdjustmentQuery,
  PayrollAdjustmentType,
  PayrollAdjustmentView,
  PayrollPayMethod,
  PayrollRunCreateInput,
  PayrollRunListQuery,
  PayrollRunPayInput,
  PayrollRunReopenInput,
  PayrollRunView,
  PayrollSettings,
  PayslipTaxStep,
  PayslipView,
  PayrollYtdQuery,
  PayrollYtdRow,
  PayrollYtdView,
  StaffSalaryInput,
} from '@abcp/shared-types';
import { payrollSettingsSchema } from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { notifyUser } from '../../services/push.js';
import { ApiError } from '../../utils/ApiError.js';
import { vientianeDateKey, vientianeDayStart } from '../../utils/dateHelpers.js';
import {
  COLLECTION_SELECT,
  COMMISSION_COLLECTION_SETTING_KEY,
  commissionRequiresCollection,
  isAppointmentCollected,
} from './commission.js';
import { computePayslip, DEFAULT_PAYROLL_SETTINGS, round2 } from './payroll-calc.js';
import type { PayrollActor } from './payroll.service.js';
import { refreshBonuses } from './payroll.service.js';

/**
 * Payroll P2/P3/P4 (docs/payroll-audit.md §4.2/§5) — ຮອບຈ່າຍເງິນເດືອນ.
 *
 * - ໜຶ່ງຮອບ ຕໍ່ ສາຂາ ຕໍ່ ເດືອນ; ພະນັກງານເຂົ້າຮອບຂອງ **ສາຂາຫຼັກ** ຂອງຕົນ (ອາກອນຂັ້ນໄດຕ້ອງຄິດຈາກລາຍໄດ້ລວມຂອງຄົນ).
 * - ຄ່າຄອມໃນໃບ = ຄ່າຄອມທີ່ຍັງບໍ່ຈ່າຍ + ເກັບເງິນບິນແລ້ວ ຂອງນັດທີ່ເລີ່ມກ່ອນທ້າຍເດືອນ (ທຸກສາຂາ). ນັດທີ່ປິດ
 *   ຍ້ອນຫຼັງເຂົ້າເດືອນທີ່ຈ່າຍແລ້ວ ຈຶ່ງໄຫຼໄປຮອບຖັດໄປເອງ — ເດືອນທີ່ປິດແລ້ວບໍ່ປ່ຽນ (G3.1).
 * - DRAFT ຄິດໃໝ່ໄດ້; APPROVED ແຊ່ແຂງຕົວເລກ + ລັອກລາຍການເພີ່ມ/ຫັກ + ກັນປຸ່ມ "ຈ່າຍຄ່າຄອມ" ແບບເກົ່າ;
 *   PAID ໝາຍຄອມ/ໂບນັດ/clawback ວ່າຈ່າຍແລ້ວ ແລະ ລົງລາຍຈ່າຍ SALARY (ສະເພາະສ່ວນທີ່ບໍ່ແມ່ນຄອມ/ໂບນັດ —
 *   P&L ນັບຄອມ/ໂບນັດແບບ accrual ຈາກ payroll report ຢູ່ແລ້ວ, ບໍ່ດັ່ງນັ້ນຈະນັບຊ້ຳ).
 * - ອະນຸມັດ/ຈ່າຍ/ເປີດຄືນ = SUPER_ADMIN ເທົ່ານັ້ນ (ແຍກໜ້າທີ່ຈາກຜູ້ກຽມ — G3.2).
 */

type Tx = Prisma.TransactionClient;

export const PAYROLL_SETTINGS_KEY = 'payroll.settings';
const SALARY_CATEGORY_CODE = 'SALARY';
const dec = (n: number) => new Prisma.Decimal(round2(n).toFixed(2));
const num = (v: Prisma.Decimal | number | null | undefined) =>
  v == null ? 0 : typeof v === 'number' ? v : v.toNumber();

// ---- settings ----------------------------------------------------------------

export async function getPayrollSettings(): Promise<PayrollSettings> {
  const [row, requireCollection] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: PAYROLL_SETTINGS_KEY } }),
    commissionRequiresCollection(),
  ]);
  const stored = (row?.value ?? {}) as Partial<PayrollSettings>;
  const merged: PayrollSettings = {
    pitBrackets: stored.pitBrackets ?? DEFAULT_PAYROLL_SETTINGS.pitBrackets,
    sso: { ...DEFAULT_PAYROLL_SETTINGS.sso, ...(stored.sso ?? {}) },
    time: { ...DEFAULT_PAYROLL_SETTINGS.time, ...(stored.time ?? {}) },
    commissionRequiresCollection: requireCollection,
    quickPayLimitLak: stored.quickPayLimitLak ?? DEFAULT_PAYROLL_SETTINGS.quickPayLimitLak,
  };
  const parsed = payrollSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_PAYROLL_SETTINGS;
}

export async function updatePayrollSettings(input: PayrollSettings, actor: PayrollActor): Promise<PayrollSettings> {
  const before = await getPayrollSettings();
  const { commissionRequiresCollection: requireCollection, ...rest } = input;
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: PAYROLL_SETTINGS_KEY },
      create: { key: PAYROLL_SETTINGS_KEY, value: rest },
      update: { value: rest },
    }),
    prisma.appSetting.upsert({
      where: { key: COMMISSION_COLLECTION_SETTING_KEY },
      create: { key: COMMISSION_COLLECTION_SETTING_KEY, value: requireCollection },
      update: { value: requireCollection },
    }),
  ]);
  await audit(actor, 'payroll_settings_updated', null, before, input);
  return getPayrollSettings();
}

// ---- helpers -----------------------------------------------------------------

async function audit(
  actor: PayrollActor,
  action: string,
  entityId: string | null,
  oldValue: unknown,
  newValue: unknown,
  branchId?: string | null,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      branchId: branchId ?? actor.branchId,
      userId: actor.userId,
      action: `staff.${action}`,
      entityName: 'staff',
      entityId,
      oldValue: (oldValue ?? undefined) as never,
      newValue: (newValue ?? undefined) as never,
    },
  });
}

function assertBranch(actor: PayrollActor, branchId: string): void {
  if (actor.branchId && actor.branchId !== branchId) throw ApiError.forbidden('ຈັດການໄດ້ສະເພາະສາຂາຂອງທ່ານ');
}

function monthBounds(monthYear: string) {
  const y = Number(monthYear.slice(0, 4));
  const m = Number(monthYear.slice(5, 7)) - 1;
  const dateFrom = new Date(Date.UTC(y, m, 1));
  const dateTo = new Date(Date.UTC(y, m + 1, 1));
  return { from: vientianeDayStart(dateFrom), to: vientianeDayStart(dateTo), dateFrom, dateTo };
}

function currentMonthYear(): string {
  return vientianeDateKey(new Date()).toISOString().slice(0, 7);
}

/** ພະນັກງານທີ່ສາຂາຫຼັກ = branchId (isPrimary; ບໍ່ມີ primary → ສາຂາທຳອິດ). */
async function staffOfPrimaryBranch(branchId: string) {
  const rows = await prisma.staffProfile.findMany({
    where: { staffBranches: { some: { branchId } } },
    select: {
      id: true,
      deletedAt: true,
      isActive: true,
      salaryType: true,
      baseSalary: true,
      ssoEnrolled: true,
      user: { select: { id: true, name: true } },
      staffBranches: { select: { branchId: true, isPrimary: true }, orderBy: { branchId: 'asc' } },
    },
  });
  return rows.filter((s) => {
    const primary = s.staffBranches.find((b) => b.isPrimary) ?? s.staffBranches[0];
    return primary?.branchId === branchId;
  });
}

/** commission/clawback id ທີ່ຖືກຈອງໄວ້ໃນຮອບອື່ນທີ່ APPROVED (ຍັງບໍ່ຈ່າຍ) — ບໍ່ດຶງຊ້ຳ. */
async function reservedByOtherRuns(exceptRunId: string | null) {
  const slips = await prisma.payslip.findMany({
    where: { run: { status: 'APPROVED', ...(exceptRunId ? { id: { not: exceptRunId } } : {}) } },
    select: { commissionIds: true, clawbackIds: true },
  });
  const commissions = new Set<string>();
  const clawbacks = new Set<string>();
  for (const s of slips) {
    for (const id of s.commissionIds as string[]) commissions.add(id);
    for (const id of s.clawbackIds as string[]) clawbacks.add(id);
  }
  return { commissions, clawbacks };
}

async function runOrThrow(id: string) {
  const run = await prisma.payrollRun.findUnique({ where: { id } });
  if (!run) throw ApiError.notFound('ບໍ່ພົບຮອບຈ່າຍເງິນເດືອນ');
  return run;
}

async function namesOf(ids: Array<string | null>): Promise<Map<string, string>> {
  const clean = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (clean.length === 0) return new Map();
  const users = await prisma.user.findMany({ where: { id: { in: clean } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

type PayslipRow = Prisma.PayslipGetPayload<Record<string, never>>;

function payslipView(p: PayslipRow): PayslipView {
  const totalDeductions = round2(
    num(p.ssoEmployee) + num(p.incomeTax) + num(p.advances) + num(p.otherDeductions) + num(p.clawback),
  );
  return {
    id: p.id,
    payrollRunId: p.payrollRunId,
    staffProfileId: p.staffProfileId,
    staffName: p.staffName,
    salaryType: p.salaryType,
    baseRate: num(p.baseRate),
    daysPresent: p.daysPresent,
    daysAbsent: p.daysAbsent,
    hoursWorked: num(p.hoursWorked),
    overtimeHours: num(p.overtimeHours),
    basePay: num(p.basePay),
    absenceDeduction: num(p.absenceDeduction),
    overtimePay: num(p.overtimePay),
    commission: num(p.commission),
    bonus: num(p.bonus),
    allowances: num(p.allowances),
    grossPay: num(p.grossPay),
    ssoBase: num(p.ssoBase),
    ssoEmployee: num(p.ssoEmployee),
    ssoEmployer: num(p.ssoEmployer),
    taxableIncome: num(p.taxableIncome),
    incomeTax: num(p.incomeTax),
    advances: num(p.advances),
    otherDeductions: num(p.otherDeductions),
    clawback: num(p.clawback),
    totalDeductions,
    netPay: num(p.netPay),
    commissionLines: (p.commissionIds as string[]).length,
    adjustments: p.adjustments as PayslipView['adjustments'],
    taxBreakdown: p.taxBreakdown as PayslipTaxStep[],
  };
}

async function runView(
  run: Prisma.PayrollRunGetPayload<Record<string, never>>,
  payslips?: PayslipRow[],
): Promise<PayrollRunView> {
  const [branch, names, slipStats, account] = await Promise.all([
    prisma.branch.findUnique({ where: { id: run.branchId }, select: { name: true } }),
    namesOf([run.preparedById, run.approvedById, run.paidById]),
    payslips
      ? Promise.resolve({ count: payslips.length, negative: payslips.filter((p) => num(p.netPay) < 0).length })
      : Promise.all([
          prisma.payslip.count({ where: { payrollRunId: run.id } }),
          prisma.payslip.count({ where: { payrollRunId: run.id, netPay: { lt: 0 } } }),
        ]).then(([count, negative]) => ({ count, negative })),
    run.bankAccountId
      ? prisma.bankAccount.findUnique({
          where: { id: run.bankAccountId },
          select: { accountName: true, accountNumber: true, bank: { select: { code: true } } },
        })
      : null,
  ]);
  return {
    id: run.id,
    branchId: run.branchId,
    branchName: branch?.name ?? '—',
    monthYear: run.monthYear,
    status: run.status,
    note: run.note,
    preparedBy: names.get(run.preparedById) ?? '—',
    preparedAt: run.preparedAt.toISOString(),
    approvedBy: run.approvedById ? (names.get(run.approvedById) ?? '—') : null,
    approvedAt: run.approvedAt?.toISOString() ?? null,
    paidBy: run.paidById ? (names.get(run.paidById) ?? '—') : null,
    paidAt: run.paidAt?.toISOString() ?? null,
    paymentMethod: (run.paymentMethod as PayrollPayMethod | null) ?? null,
    paymentReference: run.paymentReference,
    bankAccountLabel: account
      ? `${account.bank.code} · ${account.accountName} · ****${account.accountNumber.slice(-4)}`
      : null,
    reopenCount: run.reopenCount,
    lastReopenReason: run.lastReopenReason,
    staffCount: slipStats.count,
    totalGross: num(run.totalGross),
    totalDeductions: num(run.totalDeductions),
    totalNet: num(run.totalNet),
    totalCommission: num(run.totalCommission),
    totalBonus: num(run.totalBonus),
    totalEmployerSso: num(run.totalEmployerSso),
    totalIncomeTax: num(run.totalIncomeTax),
    employerCost: round2(num(run.totalGross) + num(run.totalEmployerSso)),
    negativeNetCount: slipStats.negative,
    expenseId: run.expenseId,
    ...(payslips ? { payslips: payslips.map(payslipView) } : {}),
  };
}

// ---- runs --------------------------------------------------------------------

export async function listRuns(query: PayrollRunListQuery, actor: PayrollActor): Promise<PayrollRunView[]> {
  const branchId = actor.branchId ?? query.branchId;
  const runs = await prisma.payrollRun.findMany({
    where: { ...(branchId ? { branchId } : {}), ...(query.monthYear ? { monthYear: query.monthYear } : {}) },
    orderBy: [{ monthYear: 'desc' }, { preparedAt: 'desc' }],
    take: 60,
  });
  return Promise.all(runs.map((r) => runView(r)));
}

export async function getRun(id: string, actor: PayrollActor): Promise<PayrollRunView> {
  const run = await runOrThrow(id);
  assertBranch(actor, run.branchId);
  const payslips = await prisma.payslip.findMany({ where: { payrollRunId: id }, orderBy: { staffName: 'asc' } });
  return runView(run, payslips);
}

/**
 * ສ້າງ ຫຼື ຄິດຮອບ DRAFT ໃໝ່ (idempotent ຕໍ່ ສາຂາ×ເດືອນ). ຮອບທີ່ APPROVED/PAID ແລ້ວ → 409.
 * ບໍ່ອະນຸຍາດເດືອນໃນອະນາຄົດ.
 */
export async function prepareRun(input: PayrollRunCreateInput, actor: PayrollActor): Promise<PayrollRunView> {
  assertBranch(actor, input.branchId);
  if (input.monthYear > currentMonthYear()) throw ApiError.badRequest('ຍັງບໍ່ເຖິງເດືອນນີ້ — ສ້າງຮອບລ່ວງໜ້າບໍ່ໄດ້');
  const branch = await prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true } });
  if (!branch) throw ApiError.notFound('ບໍ່ພົບສາຂາ');
  const existing = await prisma.payrollRun.findUnique({
    where: { branchId_monthYear: { branchId: input.branchId, monthYear: input.monthYear } },
  });
  if (existing && existing.status !== 'DRAFT') {
    throw ApiError.conflict('ຮອບຂອງເດືອນນີ້ອະນຸມັດ/ຈ່າຍແລ້ວ — ຕ້ອງເປີດຄືນກ່ອນຈຶ່ງຄິດໃໝ່ໄດ້');
  }

  const [settings, staff, reserved] = await Promise.all([
    getPayrollSettings(),
    staffOfPrimaryBranch(input.branchId),
    reservedByOtherRuns(existing?.id ?? null),
  ]);
  const { to, dateFrom, dateTo } = monthBounds(input.monthYear);
  const ids = staff.map((s) => s.id);
  await refreshBonuses(ids, input.monthYear);

  const [commissions, goals, clawbacks, adjustments, attendance] = await Promise.all([
    prisma.staffCommission.findMany({
      where: {
        staffProfileId: { in: ids },
        isPaid: false,
        appointment: { status: 'COMPLETED', deletedAt: null, startAt: { lt: to } },
      },
      select: { id: true, staffProfileId: true, payoutAmount: true, appointment: { select: COLLECTION_SELECT } },
    }),
    prisma.staffKpiGoal.findMany({
      where: { staffProfileId: { in: ids }, monthYear: input.monthYear, isBonusPaid: false, bonusAmount: { gt: 0 } },
      select: { id: true, staffProfileId: true, bonusAmount: true },
    }),
    prisma.commissionClawback.findMany({
      where: { staffProfileId: { in: ids }, isSettled: false, monthYear: { lte: input.monthYear } },
      select: { id: true, staffProfileId: true, amount: true },
    }),
    prisma.payrollAdjustment.findMany({
      where: { staffProfileId: { in: ids }, monthYear: input.monthYear },
      select: { staffProfileId: true, type: true, label: true, amount: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.staffAttendance.findMany({
      where: { staffProfileId: { in: ids }, date: { gte: dateFrom, lt: dateTo } },
      select: { staffProfileId: true, status: true, checkIn: true, checkOut: true },
    }),
  ]);

  const group = <T extends { staffProfileId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) m.set(r.staffProfileId, [...(m.get(r.staffProfileId) ?? []), r]);
    return m;
  };
  const eligibleCommissions = commissions.filter(
    (c) =>
      !reserved.commissions.has(c.id) &&
      (!settings.commissionRequiresCollection || isAppointmentCollected(c.appointment)),
  );
  const commBy = group(eligibleCommissions);
  const goalBy = new Map(goals.map((g) => [g.staffProfileId, g]));
  const clawBy = group(clawbacks.filter((c) => !reserved.clawbacks.has(c.id)));
  const adjBy = group(adjustments);
  const attBy = group(attendance);

  const slips = staff
    .map((s) => {
      const comm = commBy.get(s.id) ?? [];
      const goal = goalBy.get(s.id);
      const claws = clawBy.get(s.id) ?? [];
      const adj = (adjBy.get(s.id) ?? []).map((a) => ({
        type: a.type as PayrollAdjustmentType,
        label: a.label,
        amount: num(a.amount),
      }));
      const figures = computePayslip(
        {
          salaryType: s.salaryType,
          baseRate: num(s.baseSalary),
          ssoEnrolled: s.ssoEnrolled,
          attendance: attBy.get(s.id) ?? [],
          commission: comm.reduce((t, c) => t + num(c.payoutAmount), 0),
          bonus: goal ? num(goal.bonusAmount) : 0,
          clawback: claws.reduce((t, c) => t + num(c.amount), 0),
          adjustments: adj,
        },
        settings,
      );
      return { staff: s, comm, goal, claws, adj, figures };
    })
    // ຄົນທີ່ບໍ່ມີຫຍັງຕ້ອງຈ່າຍ/ຫັກເລີຍ (ຄົນຮັບຄອມທີ່ບໍ່ມີວຽກ, ຫຼື ຖືກລຶບແລ້ວບໍ່ມີຄ້າງ) ບໍ່ອອກໃບ.
    .filter(({ staff: s, figures: f }) => {
      const hasMoney = f.grossPay !== 0 || f.netPay !== 0 || f.clawback !== 0;
      if (s.deletedAt) return hasMoney;
      return hasMoney || (s.salaryType !== 'NONE' && s.isActive);
    });

  const totals = slips.reduce(
    (t, { figures: f }) => {
      t.gross += f.grossPay;
      t.deductions += f.ssoEmployee + f.incomeTax + f.advances + f.otherDeductions + f.clawback;
      t.net += f.netPay;
      t.commission += f.commission;
      t.bonus += f.bonus;
      t.employerSso += f.ssoEmployer;
      t.tax += f.incomeTax;
      return t;
    },
    { gross: 0, deductions: 0, net: 0, commission: 0, bonus: 0, employerSso: 0, tax: 0 },
  );

  const runId = await prisma.$transaction(async (tx) => {
    const data = {
      status: 'DRAFT' as const,
      note: input.note ?? existing?.note ?? null,
      preparedById: actor.userId,
      preparedAt: new Date(),
      totalGross: dec(totals.gross),
      totalDeductions: dec(totals.deductions),
      totalNet: dec(totals.net),
      totalCommission: dec(totals.commission),
      totalBonus: dec(totals.bonus),
      totalEmployerSso: dec(totals.employerSso),
      totalIncomeTax: dec(totals.tax),
    };
    const run = existing
      ? await tx.payrollRun.update({ where: { id: existing.id, status: 'DRAFT' }, data })
      : await tx.payrollRun.create({ data: { ...data, branchId: input.branchId, monthYear: input.monthYear } });
    await tx.payslip.deleteMany({ where: { payrollRunId: run.id } });
    if (slips.length > 0) {
      await tx.payslip.createMany({
        data: slips.map(({ staff: s, comm, goal, claws, adj, figures: f }) => ({
          payrollRunId: run.id,
          staffProfileId: s.id,
          staffName: s.user.name,
          salaryType: s.salaryType,
          baseRate: s.baseSalary,
          daysPresent: f.daysPresent,
          daysAbsent: f.daysAbsent,
          hoursWorked: dec(f.hoursWorked),
          overtimeHours: dec(f.overtimeHours),
          basePay: dec(f.basePay),
          absenceDeduction: dec(f.absenceDeduction),
          overtimePay: dec(f.overtimePay),
          commission: dec(f.commission),
          bonus: dec(f.bonus),
          allowances: dec(f.allowances),
          grossPay: dec(f.grossPay),
          ssoBase: dec(f.ssoBase),
          ssoEmployee: dec(f.ssoEmployee),
          ssoEmployer: dec(f.ssoEmployer),
          taxableIncome: dec(f.taxableIncome),
          incomeTax: dec(f.incomeTax),
          advances: dec(f.advances),
          otherDeductions: dec(f.otherDeductions),
          clawback: dec(f.clawback),
          netPay: dec(f.netPay),
          commissionIds: comm.map((c) => c.id),
          clawbackIds: claws.map((c) => c.id),
          bonusGoalId: goal?.id ?? null,
          adjustments: adj,
          taxBreakdown: f.taxBreakdown,
        })),
      });
    }
    return run.id;
  });

  await audit(
    actor,
    existing ? 'payroll_run_recomputed' : 'payroll_run_prepared',
    runId,
    existing ? { totalNet: num(existing.totalNet) } : null,
    { monthYear: input.monthYear, staff: slips.length, totalNet: round2(totals.net) },
    input.branchId,
  );
  return getRun(runId, actor);
}

export async function approveRun(id: string, actor: PayrollActor): Promise<PayrollRunView> {
  const run = await runOrThrow(id);
  if (run.status !== 'DRAFT') throw ApiError.conflict('ອະນຸມັດໄດ້ສະເພາະຮອບ DRAFT');
  const slips = await prisma.payslip.findMany({
    where: { payrollRunId: id },
    select: { commissionIds: true, clawbackIds: true, bonusGoalId: true },
  });
  if (slips.length === 0) throw ApiError.badRequest('ຮອບນີ້ບໍ່ມີໃບຈ່າຍເງິນ');
  await assertSourcesStillOpen(prisma, slips);
  const res = await prisma.payrollRun.updateMany({
    where: { id, status: 'DRAFT' },
    data: { status: 'APPROVED', approvedById: actor.userId, approvedAt: new Date() },
  });
  if (res.count !== 1) throw ApiError.conflict('ຮອບນີ້ຖືກປ່ຽນສະຖານະໄປແລ້ວ');
  await audit(actor, 'payroll_run_approved', id, { status: 'DRAFT' }, { status: 'APPROVED', totalNet: num(run.totalNet) }, run.branchId);
  return getRun(id, actor);
}

export async function reopenRun(id: string, input: PayrollRunReopenInput, actor: PayrollActor): Promise<PayrollRunView> {
  const run = await runOrThrow(id);
  if (run.status !== 'APPROVED') throw ApiError.conflict('ເປີດຄືນໄດ້ສະເພາະຮອບທີ່ອະນຸມັດແລ້ວ ແລະ ຍັງບໍ່ຈ່າຍ');
  const res = await prisma.payrollRun.updateMany({
    where: { id, status: 'APPROVED' },
    data: {
      status: 'DRAFT',
      approvedById: null,
      approvedAt: null,
      reopenCount: { increment: 1 },
      lastReopenReason: input.reason,
    },
  });
  if (res.count !== 1) throw ApiError.conflict('ຮອບນີ້ຖືກປ່ຽນສະຖານະໄປແລ້ວ');
  await audit(actor, 'payroll_run_reopened', id, { status: 'APPROVED' }, { status: 'DRAFT', reason: input.reason }, run.branchId);
  return getRun(id, actor);
}

/** ທຸກລາຍການທີ່ໃບອ້າງອີງຕ້ອງຍັງ "ເປີດ" — ຖ້າຖືກຈ່າຍດ້ວຍທາງອື່ນໄປແລ້ວ ຕ້ອງຄິດຮອບໃໝ່. */
async function assertSourcesStillOpen(
  db: Tx | typeof prisma,
  slips: Array<{ commissionIds: Prisma.JsonValue; clawbackIds: Prisma.JsonValue; bonusGoalId: string | null }>,
): Promise<void> {
  const commissionIds = slips.flatMap((s) => s.commissionIds as string[]);
  const clawbackIds = slips.flatMap((s) => s.clawbackIds as string[]);
  const goalIds = slips.map((s) => s.bonusGoalId).filter((x): x is string => Boolean(x));
  const [openComm, openClaw, openGoals] = await Promise.all([
    db.staffCommission.count({ where: { id: { in: commissionIds }, isPaid: false } }),
    db.commissionClawback.count({ where: { id: { in: clawbackIds }, isSettled: false } }),
    db.staffKpiGoal.count({ where: { id: { in: goalIds }, isBonusPaid: false } }),
  ]);
  if (openComm !== commissionIds.length || openClaw !== clawbackIds.length || openGoals !== goalIds.length) {
    throw ApiError.conflict('ບາງລາຍການຖືກຈ່າຍ/ຫັກໄປແລ້ວນອກຮອບນີ້ — ກົດ "ຄິດໃໝ່" ກ່ອນ');
  }
}

async function salaryCategoryId(tx: Tx): Promise<string> {
  const cat = await tx.expenseCategory.upsert({
    where: { code: SALARY_CATEGORY_CODE },
    update: {},
    create: { code: SALARY_CATEGORY_CODE, nameLo: 'ເງິນເດືອນ', nameEn: 'Salaries', kind: 'PAYROLL', sortOrder: 20 },
    select: { id: true },
  });
  return cat.id;
}

export async function payRun(id: string, input: PayrollRunPayInput, actor: PayrollActor): Promise<PayrollRunView> {
  const run = await runOrThrow(id);
  if (run.status !== 'APPROVED') throw ApiError.conflict('ຕ້ອງອະນຸມັດຮອບກ່ອນຈຶ່ງຈ່າຍໄດ້');
  const now = new Date();
  if (input.bankAccountId) {
    const acct = await prisma.bankAccount.findUnique({
      where: { id: input.bankAccountId },
      select: { branchId: true, isActive: true, currency: true },
    });
    if (!acct || !acct.isActive) throw ApiError.badRequest('ບັນຊີທະນາຄານບໍ່ພົບ ຫຼື ປິດໃຊ້ງານ');
    if (acct.branchId !== run.branchId) throw ApiError.badRequest('ບັນຊີທະນາຄານຕ້ອງເປັນຂອງສາຂາດຽວກັບຮອບຈ່າຍ');
    if (acct.currency !== 'LAK') throw ApiError.badRequest('ຈ່າຍເງິນເດືອນໄດ້ຈາກບັນຊີກີບ (LAK) ເທົ່ານັ້ນ');
  }

  const { expenseAmount, staffUsers } = await prisma.$transaction(
    async (tx) => {
      const claimed = await tx.payrollRun.updateMany({
        where: { id, status: 'APPROVED' },
        data: {
          status: 'PAID',
          paidById: actor.userId,
          paidAt: now,
          paymentMethod: input.method,
          paymentReference: input.reference ?? null,
          bankAccountId: input.bankAccountId ?? null,
        },
      });
      if (claimed.count !== 1) throw ApiError.conflict('ຮອບນີ້ຖືກຈ່າຍ ຫຼື ປ່ຽນສະຖານະໄປແລ້ວ');

      const slips = await tx.payslip.findMany({
        where: { payrollRunId: id },
        select: {
          staffProfileId: true,
          commissionIds: true,
          clawbackIds: true,
          bonusGoalId: true,
          basePay: true,
          absenceDeduction: true,
          overtimePay: true,
          allowances: true,
          ssoEmployer: true,
          netPay: true,
          staffProfile: { select: { userId: true } },
        },
      });
      await assertSourcesStillOpen(tx, slips);

      const commissionIds = slips.flatMap((s) => s.commissionIds as string[]);
      const clawbackIds = slips.flatMap((s) => s.clawbackIds as string[]);
      const goalIds = slips.map((s) => s.bonusGoalId).filter((x): x is string => Boolean(x));
      if (commissionIds.length) {
        await tx.staffCommission.updateMany({
          where: { id: { in: commissionIds }, isPaid: false },
          data: { isPaid: true, paidAt: now, paidById: actor.userId },
        });
      }
      if (clawbackIds.length) {
        await tx.commissionClawback.updateMany({ where: { id: { in: clawbackIds } }, data: { isSettled: true } });
      }
      if (goalIds.length) {
        await tx.staffKpiGoal.updateMany({
          where: { id: { in: goalIds } },
          data: { isBonusPaid: true, bonusPaidAt: now, bonusPaidById: actor.userId },
        });
      }

      // P4 — ລົງລາຍຈ່າຍສະເພາະຕົ້ນທຶນທີ່ P&L ຍັງບໍ່ໄດ້ນັບ: ເງິນເດືອນ/OT/ເງິນເພີ່ມ + ປະກັນສັງຄົມສ່ວນນາຍຈ້າງ.
      const expenseAmount = round2(
        slips.reduce(
          (t, s) =>
            t + num(s.basePay) - num(s.absenceDeduction) + num(s.overtimePay) + num(s.allowances) + num(s.ssoEmployer),
          0,
        ),
      );
      if (expenseAmount > 0) {
        const { dateTo } = monthBounds(run.monthYear);
        const lastDay = new Date(dateTo.getTime() - 86_400_000);
        const expense = await tx.expense.create({
          data: {
            branchId: run.branchId,
            categoryId: await salaryCategoryId(tx),
            status: 'PAID',
            title: `ເງິນເດືອນ ${run.monthYear}`,
            amount: dec(expenseAmount),
            amountBase: dec(expenseAmount),
            expenseDate: lastDay,
            notes: `Payroll run ${run.id} — ບໍ່ລວມຄ່າຄອມ/ໂບນັດ (ນັບໃນ P&L ແລ້ວ)`,
            paidReference: input.reference ?? null,
            paidFromAccountId: input.bankAccountId ?? null,
            createdById: actor.userId,
            submittedAt: now,
            approvedById: run.approvedById,
            approvedAt: run.approvedAt,
            paidAt: now,
          },
          select: { id: true },
        });
        await tx.payrollRun.update({ where: { id }, data: { expenseId: expense.id } });
      }
      return { expenseAmount, staffUsers: slips.map((s) => ({ userId: s.staffProfile.userId, net: num(s.netPay) })) };
    },
    { isolationLevel: 'Serializable' },
  );

  await audit(
    actor,
    'payroll_run_paid',
    id,
    { status: 'APPROVED' },
    { status: 'PAID', method: input.method, reference: input.reference ?? null, totalNet: num(run.totalNet), expenseAmount },
    run.branchId,
  );

  // G5.6 — ແຈ້ງຊ່າງແຕ່ລະຄົນ (ລົ້ມກໍ່ບໍ່ກະທົບການຈ່າຍ).
  for (const s of staffUsers) {
    notifyUser({
      userId: s.userId,
      type: 'PAYROLL_PAYSLIP_PAID',
      title: 'ເງິນເດືອນອອກແລ້ວ',
      body: `ໃບຈ່າຍເງິນເດືອນ ${run.monthYear} ພ້ອມແລ້ວ — ເງິນສຸດທິ ${Math.round(s.net).toLocaleString('en-US')} ກີບ`,
      data: { screen: 'StaffPayslips', monthYear: run.monthYear },
      dedupeKey: `payslip:${id}:${s.userId}`,
    }).catch((err: unknown) => logger.warn({ err, runId: id }, 'payslip notify failed'));
  }
  return getRun(id, actor);
}

/** C4 + G3.1 — ຄ່າຄອມທີ່ຢູ່ໃນຮອບ APPROVED ຈ່າຍດ້ວຍປຸ່ມແບບເກົ່າບໍ່ໄດ້ (ຕ້ອງຈ່າຍຜ່ານຮອບ). */
export async function assertNotInApprovedRun(staffProfileIds: string[]): Promise<void> {
  const locked = await prisma.payslip.count({
    where: { staffProfileId: { in: staffProfileIds }, run: { status: 'APPROVED' } },
  });
  if (locked > 0) {
    throw ApiError.conflict('ພະນັກງານນີ້ຢູ່ໃນຮອບຈ່າຍທີ່ອະນຸມັດແລ້ວ — ຈ່າຍຜ່ານຮອບ ຫຼື ເປີດຮອບຄືນກ່ອນ');
  }
}

/** commission id ທີ່ຈ່າຍຜ່ານຮອບ PAID ແລ້ວ — ຍົກເລີກການຈ່າຍແບບເກົ່າບໍ່ໄດ້ (ໃບຈ່າຍເງິນເປັນຫຼັກຖານ). */
export async function commissionIdsInPaidRuns(staffProfileIds: string[]): Promise<Set<string>> {
  const slips = await prisma.payslip.findMany({
    where: { staffProfileId: { in: staffProfileIds }, run: { status: 'PAID' } },
    select: { commissionIds: true },
  });
  return new Set(slips.flatMap((s) => s.commissionIds as string[]));
}

// ---- payslips ----------------------------------------------------------------

export async function getPayslip(id: string, actor: PayrollActor): Promise<PayslipView & { run: PayrollRunView }> {
  const p = await prisma.payslip.findUnique({ where: { id } });
  if (!p) throw ApiError.notFound('ບໍ່ພົບໃບຈ່າຍເງິນ');
  const run = await runOrThrow(p.payrollRunId);
  assertBranch(actor, run.branchId);
  return { ...payslipView(p), run: await runView(run) };
}

/** Staff portal — ໃບຈ່າຍເງິນຂອງຕົນເອງ (ຮອບ APPROVED/PAID ເທົ່ານັ້ນ, DRAFT ຍັງປ່ຽນໄດ້ຈຶ່ງບໍ່ສະແດງ). */
export async function myPayslips(userId: string): Promise<MyPayslipView[]> {
  const profile = await prisma.staffProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!profile) throw ApiError.forbidden('ບັນຊີນີ້ບໍ່ແມ່ນພະນັກງານ');
  const slips = await prisma.payslip.findMany({
    where: { staffProfileId: profile.id, run: { status: { in: ['APPROVED', 'PAID'] } } },
    include: { run: { select: { monthYear: true, status: true, paidAt: true, branchId: true } } },
    orderBy: { run: { monthYear: 'desc' } },
    take: 24,
  });
  const branches = await prisma.branch.findMany({
    where: { id: { in: [...new Set(slips.map((s) => s.run.branchId))] } },
    select: { id: true, name: true },
  });
  const branchName = new Map(branches.map((b) => [b.id, b.name]));
  return slips.map(({ run, ...p }) => ({
    ...payslipView(p),
    monthYear: run.monthYear,
    branchName: branchName.get(run.branchId) ?? '—',
    runStatus: run.status,
    paidAt: run.paidAt?.toISOString() ?? null,
  }));
}

// ---- salary & adjustments ----------------------------------------------------

export async function setStaffSalary(
  staffProfileId: string,
  input: StaffSalaryInput,
  actor: PayrollActor,
): Promise<StaffSalaryInput & { staffProfileId: string }> {
  const before = await prisma.staffProfile.findFirst({
    where: { id: staffProfileId, deletedAt: null },
    select: { salaryType: true, baseSalary: true, ssoEnrolled: true },
  });
  if (!before) throw ApiError.notFound('ບໍ່ພົບຊ່າງ');
  if (input.salaryType === 'NONE' && input.baseSalary > 0) {
    throw ApiError.badRequest('ປະເພດ "ບໍ່ມີເງິນເດືອນ" ຕ້ອງມີຍອດເປັນ 0');
  }
  await prisma.staffProfile.update({
    where: { id: staffProfileId },
    data: { salaryType: input.salaryType, baseSalary: dec(input.baseSalary), ssoEnrolled: input.ssoEnrolled },
  });
  await audit(
    actor,
    'salary_updated',
    staffProfileId,
    { salaryType: before.salaryType, baseSalary: num(before.baseSalary), ssoEnrolled: before.ssoEnrolled },
    input,
  );
  return { staffProfileId, ...input };
}

export async function getStaffSalary(staffProfileId: string): Promise<StaffSalaryInput & { staffProfileId: string }> {
  const s = await prisma.staffProfile.findUnique({
    where: { id: staffProfileId },
    select: { salaryType: true, baseSalary: true, ssoEnrolled: true },
  });
  if (!s) throw ApiError.notFound('ບໍ່ພົບຊ່າງ');
  return { staffProfileId, salaryType: s.salaryType, baseSalary: num(s.baseSalary), ssoEnrolled: s.ssoEnrolled };
}

/** ລາຍການຂອງເດືອນຖືກລັອກເມື່ອຮອບຂອງສາຂາຫຼັກຄົນນັ້ນ APPROVED/PAID. */
async function lockedStaffForMonth(staffProfileIds: string[], monthYear: string): Promise<Set<string>> {
  const slips = await prisma.payslip.findMany({
    where: { staffProfileId: { in: staffProfileIds }, run: { monthYear, status: { in: ['APPROVED', 'PAID'] } } },
    select: { staffProfileId: true },
  });
  return new Set(slips.map((s) => s.staffProfileId));
}

async function staffInScope(actor: PayrollActor, staffProfileId: string): Promise<void> {
  if (!actor.branchId) return;
  const n = await prisma.staffBranch.count({ where: { staffProfileId, branchId: actor.branchId } });
  if (n === 0) throw ApiError.forbidden('ຈັດການໄດ້ສະເພາະຊ່າງຂອງສາຂາທ່ານ');
}

export async function listAdjustments(
  query: PayrollAdjustmentQuery,
  actor: PayrollActor,
): Promise<PayrollAdjustmentView[]> {
  const branchId = actor.branchId ?? query.branchId;
  const rows = await prisma.payrollAdjustment.findMany({
    where: {
      monthYear: query.monthYear,
      ...(query.staffProfileId ? { staffProfileId: query.staffProfileId } : {}),
      ...(branchId ? { staffProfile: { staffBranches: { some: { branchId } } } } : {}),
    },
    include: { staffProfile: { select: { user: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
  });
  const locked = await lockedStaffForMonth([...new Set(rows.map((r) => r.staffProfileId))], query.monthYear);
  return rows.map((r) => ({
    id: r.id,
    staffProfileId: r.staffProfileId,
    staffName: r.staffProfile.user.name,
    monthYear: r.monthYear,
    type: r.type,
    amount: num(r.amount),
    label: r.label,
    createdAt: r.createdAt.toISOString(),
    locked: locked.has(r.staffProfileId),
  }));
}

export async function createAdjustment(
  input: PayrollAdjustmentCreateInput,
  actor: PayrollActor,
): Promise<PayrollAdjustmentView> {
  await staffInScope(actor, input.staffProfileId);
  const staff = await prisma.staffProfile.findUnique({
    where: { id: input.staffProfileId },
    select: { user: { select: { name: true } } },
  });
  if (!staff) throw ApiError.notFound('ບໍ່ພົບຊ່າງ');
  if ((await lockedStaffForMonth([input.staffProfileId], input.monthYear)).size > 0) {
    throw ApiError.conflict('ຮອບຈ່າຍເດືອນນີ້ອະນຸມັດ/ຈ່າຍແລ້ວ — ເພີ່ມລາຍການບໍ່ໄດ້');
  }
  const row = await prisma.payrollAdjustment.create({
    data: { ...input, amount: dec(input.amount), createdById: actor.userId },
  });
  await audit(actor, 'payroll_adjustment_created', input.staffProfileId, null, input);
  return {
    id: row.id,
    staffProfileId: row.staffProfileId,
    staffName: staff.user.name,
    monthYear: row.monthYear,
    type: row.type,
    amount: num(row.amount),
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    locked: false,
  };
}

export async function deleteAdjustment(id: string, actor: PayrollActor): Promise<void> {
  const row = await prisma.payrollAdjustment.findUnique({ where: { id } });
  if (!row) throw ApiError.notFound('ບໍ່ພົບລາຍການ');
  await staffInScope(actor, row.staffProfileId);
  if ((await lockedStaffForMonth([row.staffProfileId], row.monthYear)).size > 0) {
    throw ApiError.conflict('ຮອບຈ່າຍເດືອນນີ້ອະນຸມັດ/ຈ່າຍແລ້ວ — ລຶບລາຍການບໍ່ໄດ້');
  }
  await prisma.payrollAdjustment.delete({ where: { id } });
  await audit(actor, 'payroll_adjustment_deleted', row.staffProfileId, {
    type: row.type,
    amount: num(row.amount),
    label: row.label,
    monthYear: row.monthYear,
  }, null);
}

// ---- G1.8 service commission rules -----------------------------------------

export type ServiceCommissionRuleView = { serviceId: string; serviceName: string; rate: number; updatedAt: string };

export async function listServiceCommissionRules(): Promise<ServiceCommissionRuleView[]> {
  const rules = await prisma.serviceCommissionRule.findMany({ orderBy: { updatedAt: 'desc' } });
  const services = await prisma.service.findMany({
    where: { id: { in: rules.map((r) => r.serviceId) } },
    select: { id: true, name: true },
  });
  const name = new Map(services.map((s) => [s.id, s.name]));
  return rules.map((r) => ({
    serviceId: r.serviceId,
    serviceName: name.get(r.serviceId) ?? '—',
    rate: r.rate,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** rate = null → ລຶບກົດ (ກັບໄປໃຊ້ອັດຕາຂອງພະນັກງານ). ມີຜົນກັບຄ່າຄອມທີ່ເກີດຫຼັງຈາກນີ້ເທົ່ານັ້ນ. */
export async function setServiceCommissionRule(
  serviceId: string,
  rate: number | null,
  actor: PayrollActor,
): Promise<ServiceCommissionRuleView | null> {
  const service = await prisma.service.findFirst({ where: { id: serviceId, deletedAt: null }, select: { id: true, name: true } });
  if (!service) throw ApiError.notFound('ບໍ່ພົບບໍລິການ');
  const before = await prisma.serviceCommissionRule.findUnique({ where: { serviceId } });
  if (rate === null) {
    if (before) await prisma.serviceCommissionRule.delete({ where: { serviceId } });
    await audit(actor, 'service_commission_rule_removed', serviceId, before ? { rate: before.rate } : null, null);
    return null;
  }
  const row = await prisma.serviceCommissionRule.upsert({
    where: { serviceId },
    create: { serviceId, rate, updatedById: actor.userId },
    update: { rate, updatedById: actor.userId },
  });
  await audit(actor, 'service_commission_rule_set', serviceId, before ? { rate: before.rate } : null, { rate });
  return { serviceId, serviceName: service.name, rate: row.rate, updatedAt: row.updatedAt.toISOString() };
}

// ---- G5.3 year-to-date -------------------------------------------------------

export async function payrollYtd(query: PayrollYtdQuery, actor: PayrollActor): Promise<PayrollYtdView> {
  const branchId = actor.branchId ?? query.branchId;
  const slips = await prisma.payslip.findMany({
    where: {
      run: {
        status: 'PAID',
        monthYear: { gte: `${query.year}-01`, lte: `${query.year}-12` },
        ...(branchId ? { branchId } : {}),
      },
    },
    select: {
      staffProfileId: true,
      staffName: true,
      grossPay: true,
      commission: true,
      bonus: true,
      ssoEmployee: true,
      ssoEmployer: true,
      incomeTax: true,
      netPay: true,
      payrollRunId: true,
    },
  });
  const by = new Map<string, PayrollYtdRow>();
  for (const p of slips) {
    const r = by.get(p.staffProfileId) ?? {
      staffProfileId: p.staffProfileId,
      staffName: p.staffName,
      months: 0,
      grossPay: 0,
      commission: 0,
      bonus: 0,
      ssoEmployee: 0,
      ssoEmployer: 0,
      incomeTax: 0,
      netPay: 0,
    };
    r.months += 1;
    r.grossPay += num(p.grossPay);
    r.commission += num(p.commission);
    r.bonus += num(p.bonus);
    r.ssoEmployee += num(p.ssoEmployee);
    r.ssoEmployer += num(p.ssoEmployer);
    r.incomeTax += num(p.incomeTax);
    r.netPay += num(p.netPay);
    by.set(p.staffProfileId, r);
  }
  const rows = [...by.values()]
    .map((r) => ({
      ...r,
      grossPay: round2(r.grossPay),
      commission: round2(r.commission),
      bonus: round2(r.bonus),
      ssoEmployee: round2(r.ssoEmployee),
      ssoEmployer: round2(r.ssoEmployer),
      incomeTax: round2(r.incomeTax),
      netPay: round2(r.netPay),
    }))
    .sort((a, b) => b.grossPay - a.grossPay);
  const sum = (k: keyof Omit<PayrollYtdRow, 'staffProfileId' | 'staffName' | 'months'>) =>
    round2(rows.reduce((t, r) => t + r[k], 0));
  return {
    year: query.year,
    rows,
    totals: {
      runs: new Set(slips.map((s) => s.payrollRunId)).size,
      grossPay: sum('grossPay'),
      commission: sum('commission'),
      bonus: sum('bonus'),
      ssoEmployee: sum('ssoEmployee'),
      ssoEmployer: sum('ssoEmployer'),
      incomeTax: sum('incomeTax'),
      netPay: sum('netPay'),
    },
  };
}

