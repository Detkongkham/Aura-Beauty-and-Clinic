import type {
  BonusBulkPaidInput,
  BonusPaidInput,
  CommissionBulkPayInput,
  CommissionPayInput,
  KpiGoalWriteInput,
  KpiRecomputeInput,
  KpiBulkTargetInput,
  PayrollAttendance,
  PayrollBreakdown,
  PayrollCommissionLine,
  PayrollDailyPoint,
  PayrollQuery,
  PayrollReport,
  PayrollRow,
  PayoutState,
} from '@abcp/shared-types';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../utils/ApiError.js';
import { BONUS_RATE_DEFAULT, BONUS_RATE_SETTING_KEY } from '../../constants/phase6.js';
import { vientianeDateKey, vientianeDayStart } from '../../utils/dateHelpers.js';
import {
  COLLECTED_APPOINTMENT_WHERE,
  COLLECTION_SELECT,
  commissionRequiresCollection,
  isAppointmentCollected,
} from './commission.js';
import { assertNotInApprovedRun, commissionIdsInPaidRuns, getPayrollSettings } from './payroll-run.service.js';

/**
 * ຜູ້ກະທຳ + ຂອບເຂດ. `branchId` != null = BRANCH_ADMIN — ທຸກການອ່ານ/ຂຽນຖືກບັງຄັບໃຫ້ຢູ່ໃນສາຂານັ້ນ
 * (docs/payroll-audit.md C4). SUPER_ADMIN = null (ບໍ່ຈຳກັດ).
 */
export type PayrollActor = { userId: string; branchId: string | null };

/** BRANCH_ADMIN ເບິ່ງ/ຈ່າຍໄດ້ສະເພາະຊ່າງທີ່ສັງກັດສາຂາຕົນ. */
async function assertStaffInScope(actor: PayrollActor, staffProfileIds: string[]): Promise<void> {
  if (!actor.branchId) return;
  const ids = [...new Set(staffProfileIds)];
  const inBranch = await prisma.staffBranch.count({
    where: { staffProfileId: { in: ids }, branchId: actor.branchId },
  });
  if (inBranch !== ids.length) throw ApiError.forbidden('ຈັດການໄດ້ສະເພາະຊ່າງຂອງສາຂາທ່ານ');
}

/** C3 — ທຸກການຂຽນຂອງ payroll ບັນທຶກ AuditLog ພ້ອມຄ່າກ່ອນ/ຫຼັງ (middleware ກາງຂ້າມ /payroll). */
async function auditPayroll(
  actor: PayrollActor,
  action: string,
  entityId: string | null,
  oldValue: unknown,
  newValue: unknown,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      branchId: actor.branchId,
      userId: actor.userId,
      action: `staff.${action}`,
      entityName: 'staff',
      entityId,
      oldValue: (oldValue ?? undefined) as never,
      newValue: (newValue ?? undefined) as never,
    },
  });
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` ຂອງມື້ວຽງຈັນທີ່ instant ນີ້ຕົກຢູ່. */
function dayKeyString(at: Date): string {
  return vientianeDateKey(at).toISOString().slice(0, 10);
}

type MonthRange = {
  /** instant ຂອງ 00:00 ວັນທີ 1 ຕາມເວລາວຽງຈັນ. */
  from: Date;
  /** instant ຂອງ 00:00 ວັນທີ 1 ເດືອນຖັດໄປ (exclusive). */
  to: Date;
  /** UTC-midnight date keys ສຳລັບ column ຊະນິດ `@db.Date` (StaffAttendance.date). */
  dateFrom: Date;
  dateTo: Date;
  label: string;
  year: number;
  /** 0-based */
  monthIndex: number;
};

/**
 * `YYYY-MM` (ຫຼື undefined = ເດືອນປັດຈຸບັນ) → ຊ່ວງເດືອນ **ຕາມເວລາວຽງຈັນ**.
 *
 * ເມື່ອກ່ອນນີ້ໃຊ້ຂອບເຂດ UTC ຊື່ໆ, ຊຶ່ງຫມາຍຄວາມວ່າຄິວທີ່ເກີດລະຫວ່າງ 00:00–07:00
 * ຂອງວັນທີ 1 (ເວລາວຽງຈັນ) ຖືກນັບເຂົ້າ **ເດືອນກ່ອນ** — ຄ່າຄອມເດືອນໜຶ່ງຮົ່ວໄປອີກເດືອນ.
 * ເບິ່ງ `dateHelpers.ts` ສຳລັບ convention ດຽວກັນທີ່ໃຊ້ທົ່ວແອັບ.
 */
function monthRange(month?: string): MonthRange {
  const nowV = vientianeDateKey(new Date());
  const y = month ? Number(month.slice(0, 4)) : nowV.getUTCFullYear();
  const m = month ? Number(month.slice(5, 7)) - 1 : nowV.getUTCMonth();
  const dateFrom = new Date(Date.UTC(y, m, 1));
  const dateTo = new Date(Date.UTC(y, m + 1, 1));
  return {
    from: vientianeDayStart(dateFrom),
    to: vientianeDayStart(dateTo),
    dateFrom,
    dateTo,
    label: `${y}-${String(m + 1).padStart(2, '0')}`,
    year: y,
    monthIndex: m,
  };
}

/** ເດືອນກ່ອນໜ້າ `label` ໃນຮູບແບບ `YYYY-MM`. */
function prevMonthLabel(label: string): string {
  const y = Number(label.slice(0, 4));
  const m = Number(label.slice(5, 7)) - 1;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function getBonusRate(): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: BONUS_RATE_SETTING_KEY } });
  const raw = typeof row?.value === 'number' ? row.value : Number((row?.value as { rate?: number })?.rate);
  const rate = Number.isFinite(raw) ? Number(raw) : BONUS_RATE_DEFAULT;
  return Math.min(0.5, Math.max(0, rate));
}

type StaffRow = {
  id: string;
  commissionRate: number;
  isActive: boolean;
  rating: number;
  totalReviews: number;
  user: { name: string };
  staffBranches: Array<{ branchId: string; isPrimary: boolean; branch: { name: string } }>;
};

function primaryBranch(s: StaffRow): { id: string; name: string } {
  const pick = s.staffBranches.find((b) => b.isPrimary) ?? s.staffBranches[0];
  return pick ? { id: pick.branchId, name: pick.branch.name } : { id: '', name: '—' };
}

const EMPTY_ATTENDANCE: PayrollAttendance = { present: 0, late: 0, overtime: 0, absent: 0 };

/** ຍອດຄ້າງ → ສະຖານະການຈ່າຍ, ເພື່ອໃຫ້ UI ບໍ່ຕ້ອງຄິດເງື່ອນໄຂເອງ (ແລະ CSV ມີຄ່າດຽວກັນ). */
function payoutStateOf(payable: number, outstanding: number): PayoutState {
  if (payable <= 0) return 'NONE';
  if (outstanding <= 0) return 'CLEAR';
  return outstanding >= payable ? 'DUE' : 'PARTIAL';
}

type BuiltReport = {
  range: MonthRange;
  rows: PayrollRow[];
  daily: PayrollDailyPoint[];
  previous: { grossRevenue: number; completedJobs: number; commissionTotal: number; payable: number };
};

async function buildRows(query: PayrollQuery, requireCollection: boolean): Promise<BuiltReport> {
  const range = monthRange(query.monthYear);
  const { from, to, dateFrom, dateTo, label } = range;
  const branchId = query.branchId;
  const prevRange = monthRange(prevMonthLabel(label));

  const staff = (await prisma.staffProfile.findMany({
    where: {
      deletedAt: null,
      ...(branchId ? { staffBranches: { some: { branchId } } } : {}),
    },
    select: {
      id: true,
      commissionRate: true,
      isActive: true,
      rating: true,
      totalReviews: true,
      user: { select: { name: true } },
      staffBranches: { select: { branchId: true, isPrimary: true, branch: { select: { name: true } } } },
    },
  })) as StaffRow[];
  const ids = staff.map((s) => s.id);
  if (ids.length === 0) {
    return {
      range,
      rows: [],
      daily: [],
      previous: { grossRevenue: 0, completedJobs: 0, commissionTotal: 0, payable: 0 },
    };
  }

  const apptWhere = (lo: Date, hi: Date): Prisma.AppointmentWhereInput => ({
    staffProfileId: { in: ids },
    status: 'COMPLETED',
    deletedAt: null,
    startAt: { gte: lo, lt: hi },
    ...(branchId ? { branchId } : {}),
  });

  const [appts, prevAppts, commissions, prevCommissions, goals, prevGoals, attendance, clawbacks] =
    await Promise.all([
      prisma.appointment.findMany({
        where: apptWhere(from, to),
        select: { staffProfileId: true, totalAmount: true, startAt: true },
      }),
      prisma.appointment.findMany({
        where: apptWhere(prevRange.from, prevRange.to),
        select: { staffProfileId: true, totalAmount: true },
      }),
      prisma.staffCommission.findMany({
        where: {
          staffProfileId: { in: ids },
          appointment: {
            status: 'COMPLETED',
            deletedAt: null,
            startAt: { gte: from, lt: to },
            ...(branchId ? { branchId } : {}),
          },
        },
        select: {
          staffProfileId: true,
          payoutAmount: true,
          isPaid: true,
          appointment: { select: COLLECTION_SELECT },
        },
      }),
      prisma.staffCommission.aggregate({
        where: {
          staffProfileId: { in: ids },
          appointment: {
            status: 'COMPLETED',
            deletedAt: null,
            startAt: { gte: prevRange.from, lt: prevRange.to },
            ...(branchId ? { branchId } : {}),
          },
        },
        _sum: { payoutAmount: true },
      }),
      prisma.staffKpiGoal.findMany({
        where: { staffProfileId: { in: ids }, monthYear: label },
        select: { staffProfileId: true, targetRevenue: true, bonusAmount: true, isBonusPaid: true },
      }),
      prisma.staffKpiGoal.aggregate({
        where: { staffProfileId: { in: ids }, monthYear: prevRange.label },
        _sum: { bonusAmount: true },
      }),
      prisma.staffAttendance.findMany({
        where: { staffProfileId: { in: ids }, date: { gte: dateFrom, lt: dateTo } },
        select: { staffProfileId: true, status: true },
      }),
      // ຂໍ້ຈຳກັດ 10B — ຄອມທີ່ຈ່າຍແລ້ວແຕ່ບິນຖືກຄືນເງິນ → ຫັກໃນເດືອນທີ່ຄືນເງິນ.
      prisma.commissionClawback.findMany({
        where: { staffProfileId: { in: ids }, monthYear: label, ...(branchId ? { branchId } : {}) },
        select: { staffProfileId: true, amount: true, isSettled: true },
      }),
    ]);

  const clawBy = new Map<string, { total: number; unsettled: number }>();
  for (const c of clawbacks) {
    const e = clawBy.get(c.staffProfileId) ?? { total: 0, unsettled: 0 };
    const amt = c.amount.toNumber();
    e.total += amt;
    if (!c.isSettled) e.unsettled += amt;
    clawBy.set(c.staffProfileId, e);
  }

  const grossBy = new Map<string, { jobs: number; revenue: number }>();
  const dailyBy = new Map<string, { revenue: number; jobs: number }>();
  for (const a of appts) {
    const e = grossBy.get(a.staffProfileId) ?? { jobs: 0, revenue: 0 };
    const amount = a.totalAmount.toNumber();
    e.jobs += 1;
    e.revenue += amount;
    grossBy.set(a.staffProfileId, e);

    const key = dayKeyString(a.startAt);
    const d = dailyBy.get(key) ?? { revenue: 0, jobs: 0 };
    d.revenue += amount;
    d.jobs += 1;
    dailyBy.set(key, d);
  }

  const prevBy = new Map<string, { jobs: number; revenue: number }>();
  for (const a of prevAppts) {
    const e = prevBy.get(a.staffProfileId) ?? { jobs: 0, revenue: 0 };
    e.jobs += 1;
    e.revenue += a.totalAmount.toNumber();
    prevBy.set(a.staffProfileId, e);
  }

  const commBy = new Map<string, { total: number; paid: number; held: number; lines: number }>();
  for (const c of commissions) {
    const e = commBy.get(c.staffProfileId) ?? { total: 0, paid: 0, held: 0, lines: 0 };
    const p = c.payoutAmount.toNumber();
    e.total += p;
    e.lines += 1;
    if (c.isPaid) e.paid += p;
    else if (requireCollection && !isAppointmentCollected(c.appointment)) e.held += p;
    commBy.set(c.staffProfileId, e);
  }

  const attendBy = new Map<string, PayrollAttendance>();
  for (const a of attendance) {
    const e = attendBy.get(a.staffProfileId) ?? { ...EMPTY_ATTENDANCE };
    if (a.status === 'ABSENT') e.absent += 1;
    else {
      e.present += 1;
      if (a.status === 'LATE') e.late += 1;
      if (a.status === 'OVERTIME') e.overtime += 1;
    }
    attendBy.set(a.staffProfileId, e);
  }

  const goalBy = new Map(goals.map((g) => [g.staffProfileId, g]));
  const totalRevenue = appts.reduce((s, a) => s + a.totalAmount.toNumber(), 0);

  const rows: PayrollRow[] = staff.map((s) => {
    const br = primaryBranch(s);
    const gross = grossBy.get(s.id) ?? { jobs: 0, revenue: 0 };
    const prev = prevBy.get(s.id) ?? { jobs: 0, revenue: 0 };
    const comm = commBy.get(s.id) ?? { total: 0, paid: 0, held: 0, lines: 0 };
    const goal = goalBy.get(s.id);
    const target = goal ? goal.targetRevenue.toNumber() : 0;
    const actual = round2(gross.revenue);
    const bonusAmount = goal ? goal.bonusAmount.toNumber() : 0;
    const bonusPaid = goal ? goal.isBonusPaid : false;
    const commissionTotal = round2(comm.total);
    const commissionPaid = round2(comm.paid);
    const commissionUnpaid = round2(commissionTotal - commissionPaid);
    const commissionHeld = round2(comm.held);
    const claw = clawBy.get(s.id) ?? { total: 0, unsettled: 0 };
    const clawbackTotal = round2(claw.total);
    const clawbackUnsettled = round2(claw.unsettled);
    const payable = round2(commissionTotal + bonusAmount - clawbackTotal);
    const outstanding = round2(
      Math.max(0, commissionUnpaid - commissionHeld + (bonusPaid ? 0 : bonusAmount) - clawbackUnsettled),
    );
    const prevRevenue = round2(prev.revenue);

    return {
      staffProfileId: s.id,
      staffName: s.user.name,
      branchId: br.id,
      branchName: br.name,
      rank: 0,
      completedJobs: gross.jobs,
      grossRevenue: actual,
      commissionRate: s.commissionRate,
      commissionTotal,
      commissionPaid,
      commissionUnpaid,
      commissionHeld,
      targetRevenue: target,
      actualRevenue: actual,
      targetMet: target > 0 && actual >= target,
      attainmentPct: target > 0 ? Math.round((actual / target) * 100) : 0,
      bonusAmount,
      bonusPaid,
      clawbackTotal,
      clawbackUnsettled,
      payable,
      outstanding,
      isActive: s.isActive,
      rating: s.rating,
      totalReviews: s.totalReviews,
      avgTicket: gross.jobs > 0 ? round2(actual / gross.jobs) : 0,
      revenueShare: totalRevenue > 0 ? actual / totalRevenue : 0,
      prevGrossRevenue: prevRevenue,
      prevCompletedJobs: prev.jobs,
      revenueDeltaPct: prevRevenue > 0 ? Math.round(((actual - prevRevenue) / prevRevenue) * 100) : null,
      commissionLines: comm.lines,
      attendance: attendBy.get(s.id) ?? { ...EMPTY_ATTENDANCE },
      payoutState: payoutStateOf(payable, outstanding),
    };
  });

  rows.sort((a, b) => b.grossRevenue - a.grossRevenue || b.completedJobs - a.completedJobs);
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  // ທຸກໆມື້ຂອງເດືອນ (ລວມມື້ທີ່ເປັນ 0) ເພື່ອໃຫ້ເສັ້ນກຣາຟບໍ່ຂາດຊ່ວງ.
  const daily: PayrollDailyPoint[] = [];
  for (let t = dateFrom.getTime(); t < dateTo.getTime(); t += DAY_MS) {
    const key = new Date(t).toISOString().slice(0, 10);
    const hit = dailyBy.get(key);
    daily.push({ date: key, revenue: round2(hit?.revenue ?? 0), jobs: hit?.jobs ?? 0 });
  }

  const prevCommissionTotal = round2(prevCommissions._sum.payoutAmount?.toNumber() ?? 0);
  const prevBonusTotal = round2(prevGoals._sum.bonusAmount?.toNumber() ?? 0);

  return {
    range,
    rows,
    daily,
    previous: {
      grossRevenue: round2(prevAppts.reduce((s, a) => s + a.totalAmount.toNumber(), 0)),
      completedJobs: prevAppts.length,
      commissionTotal: prevCommissionTotal,
      payable: round2(prevCommissionTotal + prevBonusTotal),
    },
  };
}

export async function getPayrollReport(query: PayrollQuery): Promise<PayrollReport> {
  const requireCollection = await commissionRequiresCollection();
  const [{ range, rows, daily, previous }, bonusRate] = await Promise.all([
    buildRows(query, requireCollection),
    getBonusRate(),
  ]);

  const nowKey = vientianeDateKey(new Date());
  const isCurrentMonth =
    nowKey.getUTCFullYear() === range.year && nowKey.getUTCMonth() === range.monthIndex;
  const daysInMonth = daily.length;
  const daysElapsed = isCurrentMonth
    ? Math.min(daysInMonth, nowKey.getUTCDate())
    : nowKey.getTime() < range.dateFrom.getTime()
      ? 0
      : daysInMonth;

  const sum = (pick: (r: PayrollRow) => number) => round2(rows.reduce((s, r) => s + pick(r), 0));
  const grossRevenue = sum((r) => r.grossRevenue);
  const commissionTotal = sum((r) => r.commissionTotal);
  const bonusTotal = sum((r) => r.bonusAmount);
  const clawbackTotal = sum((r) => r.clawbackTotal);
  const payable = round2(commissionTotal + bonusTotal - clawbackTotal);

  return {
    monthYear: range.label,
    generatedAt: new Date().toISOString(),
    bonusRate,
    commissionRequiresCollection: requireCollection,
    isCurrentMonth,
    daysElapsed,
    daysInMonth,
    rows,
    daily,
    totals: {
      staff: rows.length,
      activeStaff: rows.filter((r) => r.isActive).length,
      completedJobs: rows.reduce((s, r) => s + r.completedJobs, 0),
      grossRevenue,
      commissionTotal,
      commissionPaid: sum((r) => r.commissionPaid),
      commissionUnpaid: sum((r) => r.commissionUnpaid),
      commissionHeld: sum((r) => r.commissionHeld),
      bonusTotal,
      bonusUnpaid: sum((r) => (r.bonusPaid ? 0 : r.bonusAmount)),
      clawbackTotal,
      payable,
      outstanding: sum((r) => r.outstanding),
      staffOwed: rows.filter((r) => r.outstanding > 0).length,
      targetRevenue: sum((r) => r.targetRevenue),
      targetMetCount: rows.filter((r) => r.targetMet).length,
      staffWithTarget: rows.filter((r) => r.targetRevenue > 0).length,
      labourCostRatio: grossRevenue > 0 ? round2(payable / grossRevenue) : 0,
    },
    previous: {
      monthYear: prevMonthLabel(range.label),
      ...previous,
    },
  };
}

/**
 * Payslip ຕໍ່ຄົນ — ລາຍການຄ່າຄອມແຕ່ລະຄິວ, ເສັ້ນລາຍຮັບລາຍວັນ, ບໍລິການທີ່ເຮັດຫຼາຍສຸດ
 * ແລະ 6 ເດືອນຍ້ອນຫຼັງ. ເປີດຈາກ drawer ຂອງຕາຕະລາງ payroll.
 */
export async function getStaffBreakdown(
  staffProfileId: string,
  query: PayrollQuery,
  actor: PayrollActor,
): Promise<PayrollBreakdown> {
  await assertStaffInScope(actor, [staffProfileId]);
  // SUPER_ADMIN: payslip ລວມທຸກສາຂາ; BRANCH_ADMIN: ສະເພາະສາຂາຕົນ.
  const scopeBranchId = actor.branchId ?? undefined;
  const requireCollection = await commissionRequiresCollection();
  const { rows, range } = await buildRows({ ...query, branchId: scopeBranchId }, requireCollection);
  const row = rows.find((r) => r.staffProfileId === staffProfileId);
  if (!row) throw ApiError.notFound('ບໍ່ພົບຊ່າງ');
  const branchWhere = scopeBranchId ? { branchId: scopeBranchId } : {};

  const commissions = await prisma.staffCommission.findMany({
    where: {
      staffProfileId,
      appointment: {
        status: 'COMPLETED',
        deletedAt: null,
        startAt: { gte: range.from, lt: range.to },
        ...branchWhere,
      },
    },
    select: {
      id: true,
      serviceAmount: true,
      commissionRate: true,
      payoutAmount: true,
      isPaid: true,
      paidAt: true,
      appointment: {
        select: {
          ...COLLECTION_SELECT,
          id: true,
          startAt: true,
          totalAmount: true,
          customer: { select: { name: true } },
          service: { select: { name: true } },
          branch: { select: { name: true } },
        },
      },
    },
    orderBy: { appointment: { startAt: 'desc' } },
  });

  const lines: PayrollCommissionLine[] = commissions.map((c) => ({
    commissionId: c.id,
    appointmentId: c.appointment.id,
    startAt: c.appointment.startAt.toISOString(),
    customerName: c.appointment.customer.name,
    serviceName: c.appointment.service.name,
    branchName: c.appointment.branch.name,
    serviceAmount: round2(c.serviceAmount.toNumber()),
    commissionRate: c.commissionRate,
    payoutAmount: round2(c.payoutAmount.toNumber()),
    isPaid: c.isPaid,
    paidAt: c.paidAt?.toISOString() ?? null,
    collected: !requireCollection || isAppointmentCollected(c.appointment),
  }));

  // ລາຍຮັບລາຍວັນ + top services ອີງຄິວຂອງຄົນນີ້ (ບໍ່ແມ່ນສະເພາະແຖວທີ່ມີຄ່າຄອມ).
  const appts = await prisma.appointment.findMany({
    where: {
      staffProfileId,
      status: 'COMPLETED',
      deletedAt: null,
      startAt: { gte: range.from, lt: range.to },
      ...branchWhere,
    },
    select: { startAt: true, totalAmount: true, service: { select: { name: true } } },
  });

  const dailyBy = new Map<string, { revenue: number; jobs: number }>();
  const svcBy = new Map<string, { jobs: number; revenue: number }>();
  for (const a of appts) {
    const amount = a.totalAmount.toNumber();
    const key = dayKeyString(a.startAt);
    const d = dailyBy.get(key) ?? { revenue: 0, jobs: 0 };
    d.revenue += amount;
    d.jobs += 1;
    dailyBy.set(key, d);

    const s = svcBy.get(a.service.name) ?? { jobs: 0, revenue: 0 };
    s.jobs += 1;
    s.revenue += amount;
    svcBy.set(a.service.name, s);
  }

  const daily: PayrollDailyPoint[] = [];
  for (let t = range.dateFrom.getTime(); t < range.dateTo.getTime(); t += DAY_MS) {
    const key = new Date(t).toISOString().slice(0, 10);
    const hit = dailyBy.get(key);
    daily.push({ date: key, revenue: round2(hit?.revenue ?? 0), jobs: hit?.jobs ?? 0 });
  }

  const topServices = [...svcBy.entries()]
    .map(([serviceName, v]) => ({ serviceName, jobs: v.jobs, revenue: round2(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // 6 ເດືອນຍ້ອນຫຼັງ — ລາຍຮັບຕໍ່ເດືອນ + ຄ່າແຮງ (ຄ່າຄອມ+ໂບນັດ) ຂອງຄົນນີ້.
  const historyLabels: string[] = [];
  let cursor = range.label;
  for (let i = 0; i < 6; i += 1) {
    historyLabels.unshift(cursor);
    cursor = prevMonthLabel(cursor);
  }
  const oldest = monthRange(historyLabels[0]!);
  const [histAppts, histComms, histGoals] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        staffProfileId,
        status: 'COMPLETED',
        deletedAt: null,
        startAt: { gte: oldest.from, lt: range.to },
        ...branchWhere,
      },
      select: { startAt: true, totalAmount: true },
    }),
    prisma.staffCommission.findMany({
      where: {
        staffProfileId,
        appointment: {
          status: 'COMPLETED',
          deletedAt: null,
          startAt: { gte: oldest.from, lt: range.to },
          ...branchWhere,
        },
      },
      select: { payoutAmount: true, appointment: { select: { startAt: true } } },
    }),
    prisma.staffKpiGoal.findMany({
      where: { staffProfileId, monthYear: { in: historyLabels } },
      select: { monthYear: true, bonusAmount: true },
    }),
  ]);

  const monthKeyOf = (at: Date) => dayKeyString(at).slice(0, 7);
  const histRevenue = new Map<string, number>();
  for (const a of histAppts) {
    const k = monthKeyOf(a.startAt);
    histRevenue.set(k, (histRevenue.get(k) ?? 0) + a.totalAmount.toNumber());
  }
  const histPayable = new Map<string, number>();
  for (const c of histComms) {
    const k = monthKeyOf(c.appointment.startAt);
    histPayable.set(k, (histPayable.get(k) ?? 0) + c.payoutAmount.toNumber());
  }
  for (const g of histGoals) {
    histPayable.set(g.monthYear, (histPayable.get(g.monthYear) ?? 0) + g.bonusAmount.toNumber());
  }

  return {
    monthYear: range.label,
    row,
    lines,
    daily,
    topServices,
    history: historyLabels.map((monthYear) => ({
      monthYear,
      grossRevenue: round2(histRevenue.get(monthYear) ?? 0),
      payable: round2(histPayable.get(monthYear) ?? 0),
    })),
  };
}

export async function exportPayrollCsv(query: PayrollQuery): Promise<{ filename: string; csv: string }> {
  const report = await getPayrollReport(query);
  const headers = [
    'rank',
    'staff',
    'branch',
    'active',
    'completed_jobs',
    'gross_revenue',
    'avg_ticket',
    'prev_gross_revenue',
    'revenue_delta_pct',
    'commission_rate',
    'commission_total',
    'commission_paid',
    'commission_unpaid',
    'commission_held',
    'target_revenue',
    'actual_revenue',
    'attainment_pct',
    'bonus_amount',
    'bonus_paid',
    'payable',
    'outstanding',
    'payout_state',
    'days_present',
    'days_late',
    'days_absent',
  ];
  const esc = (v: string | number | boolean | null): string => {
    const s = v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of report.rows) {
    lines.push(
      [
        r.rank,
        r.staffName,
        r.branchName,
        r.isActive,
        r.completedJobs,
        r.grossRevenue,
        r.avgTicket,
        r.prevGrossRevenue,
        r.revenueDeltaPct,
        r.commissionRate,
        r.commissionTotal,
        r.commissionPaid,
        r.commissionUnpaid,
        r.commissionHeld,
        r.targetRevenue,
        r.actualRevenue,
        r.attainmentPct,
        r.bonusAmount,
        r.bonusPaid,
        r.payable,
        r.outstanding,
        r.payoutState,
        r.attendance.present,
        r.attendance.late,
        r.attendance.absent,
      ]
        .map(esc)
        .join(','),
    );
  }
  // UTF-8 BOM so Excel reads Lao names correctly.
  return { filename: `payroll-${report.monthYear}.csv`, csv: `${"﻿"}${lines.join('\n')}\n` };
}


/**
 * ຄິດເປົ້າ/ລາຍຮັບຈິງ/ໂບນັດ ໃໝ່ໃຫ້ຫຼາຍຄົນໃນຄັ້ງດຽວ (G4.5 — ໜຶ່ງ groupBy ແທນ N aggregate, ຢູ່ໃນ transaction ດຽວ).
 * ລາຍຮັບຈິງລວມທຸກສາຂາ ເພາະເປົ້າເປັນຂອງຄົນຕໍ່ເດືອນ (ບໍ່ແມ່ນຕໍ່ສາຂາ).
 * ໂບນັດທີ່ຈ່າຍແລ້ວບໍ່ຖືກປ່ຽນ — ຈ່າຍແລ້ວຄືຈ່າຍແລ້ວ.
 */
async function recomputeGoals(
  staffProfileIds: string[],
  range: MonthRange,
  bonusRate: number,
  targetOverride?: number | Map<string, number>,
): Promise<number> {
  if (staffProfileIds.length === 0) return 0;
  const [existing, actuals] = await Promise.all([
    prisma.staffKpiGoal.findMany({
      where: { staffProfileId: { in: staffProfileIds }, monthYear: range.label },
      select: { staffProfileId: true, targetRevenue: true, isBonusPaid: true },
    }),
    prisma.appointment.groupBy({
      by: ['staffProfileId'],
      where: {
        staffProfileId: { in: staffProfileIds },
        status: 'COMPLETED',
        deletedAt: null,
        startAt: { gte: range.from, lt: range.to },
      },
      _sum: { totalAmount: true },
    }),
  ]);
  const goalBy = new Map(existing.map((g) => [g.staffProfileId, g]));
  const actualBy = new Map(actuals.map((a) => [a.staffProfileId, a._sum.totalAmount?.toNumber() ?? 0]));
  const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));

  await prisma.$transaction(
    staffProfileIds.map((staffProfileId) => {
      const goal = goalBy.get(staffProfileId);
      const override = targetOverride instanceof Map ? targetOverride.get(staffProfileId) : targetOverride;
      const target = override ?? (goal ? goal.targetRevenue.toNumber() : 0);
      const actual = round2(actualBy.get(staffProfileId) ?? 0);
      const bonus = target > 0 && actual > target ? round2((actual - target) * bonusRate) : 0;
      const frozen = goal?.isBonusPaid === true;
      return prisma.staffKpiGoal.upsert({
        where: { staffProfileId_monthYear: { staffProfileId, monthYear: range.label } },
        update: {
          actualRevenue: dec(actual),
          ...(frozen ? {} : { targetRevenue: dec(target), bonusAmount: dec(bonus) }),
        },
        create: {
          staffProfileId,
          monthYear: range.label,
          targetRevenue: dec(target),
          actualRevenue: dec(actual),
          bonusAmount: dec(bonus),
        },
      });
    }),
  );
  return staffProfileIds.length;
}

/**
 * G4.3 — ໂບນັດເປັນ snapshot ທີ່ປ່ຽນສະເພາະຕອນ recompute. ຮອບຈ່າຍເງິນເອີ້ນອັນນີ້ກ່ອນສ້າງໃບ ເພື່ອໃຫ້ໂບນັດ
 * ອີງລາຍຮັບລ່າສຸດສະເໝີ (ສະເພາະຄົນທີ່ມີເປົ້າຢູ່ແລ້ວ — ບໍ່ສ້າງແຖວເປົ້າ 0 ໃຫ້ທຸກຄົນ).
 */
export async function refreshBonuses(staffProfileIds: string[], monthYear: string): Promise<void> {
  const withGoal = await prisma.staffKpiGoal.findMany({
    where: { staffProfileId: { in: staffProfileIds }, monthYear, isBonusPaid: false },
    select: { staffProfileId: true },
  });
  if (withGoal.length === 0) return;
  await recomputeGoals(
    withGoal.map((g) => g.staffProfileId),
    monthRange(monthYear),
    await getBonusRate(),
  );
}

/** G3.5 — ການຈ່າຍດ່ວນ (ນອກຮອບ) ຂອງ BRANCH_ADMIN ຈຳກັດຍອດຕໍ່ຄັ້ງ; ຍອດໃຫຍ່ກວ່ານັ້ນ ເຈົ້າຂອງຈ່າຍ ຫຼື ຜ່ານຮອບຈ່າຍ. */
async function assertQuickPayLimit(actor: PayrollActor, amount: number): Promise<void> {
  if (!actor.branchId || amount <= 0) return;
  const { quickPayLimitLak } = await getPayrollSettings();
  if (amount > quickPayLimitLak) {
    throw ApiError.forbidden(
      `ຍອດ ${Math.round(amount).toLocaleString('en-US')} ກີບ ເກີນເພດານຈ່າຍດ່ວນຂອງຜູ້ຈັດການສາຂາ (${Math.round(quickPayLimitLak).toLocaleString('en-US')} ກີບ) — ໃຫ້ເຈົ້າຂອງຈ່າຍ ຫຼື ຈ່າຍຜ່ານຮອບເງິນເດືອນ`,
    );
  }
}

/**
 * G5.5 — ຕັ້ງເປົ້າ KPI ໃຫ້ຫຼາຍຄົນໃນຄັ້ງດຽວ. PREV_MONTH_PCT ຂ້າມຄົນທີ່ເດືອນກ່ອນບໍ່ມີລາຍຮັບ.
 * ຄ່າເລີ່ມຕົ້ນບໍ່ທັບເປົ້າທີ່ຕັ້ງໄວ້ແລ້ວ; ເປົ້າທີ່ໂບນັດຈ່າຍແລ້ວບໍ່ປ່ຽນສະເໝີ.
 */
export async function setKpiTargetsBulk(
  input: KpiBulkTargetInput,
  actor: PayrollActor,
): Promise<{ monthYear: string; updated: number; skipped: number }> {
  const branchId = actor.branchId ?? input.branchId;
  const range = monthRange(input.monthYear);
  const prev = monthRange(prevMonthLabel(range.label));
  const staff = await prisma.staffProfile.findMany({
    where: { deletedAt: null, isActive: true, ...(branchId ? { staffBranches: { some: { branchId } } } : {}) },
    select: { id: true },
  });
  const ids = staff.map((s) => s.id);
  const [existing, prevActuals] = await Promise.all([
    prisma.staffKpiGoal.findMany({
      where: { staffProfileId: { in: ids }, monthYear: range.label },
      select: { staffProfileId: true, targetRevenue: true, isBonusPaid: true },
    }),
    prisma.appointment.groupBy({
      by: ['staffProfileId'],
      where: { staffProfileId: { in: ids }, status: 'COMPLETED', deletedAt: null, startAt: { gte: prev.from, lt: prev.to } },
      _sum: { totalAmount: true },
    }),
  ]);
  const goalBy = new Map(existing.map((g) => [g.staffProfileId, g]));
  const prevBy = new Map(prevActuals.map((a) => [a.staffProfileId, a._sum.totalAmount?.toNumber() ?? 0]));
  const targets = new Map<string, number>();
  for (const id of ids) {
    const goal = goalBy.get(id);
    if (goal?.isBonusPaid) continue;
    if (!input.overwrite && goal && goal.targetRevenue.toNumber() > 0) continue;
    const target =
      input.mode === 'FIXED' ? input.value : Math.round(((prevBy.get(id) ?? 0) * input.value) / 100 / 1000) * 1000;
    if (target > 0) targets.set(id, target);
  }
  const updated = await recomputeGoals([...targets.keys()], range, await getBonusRate(), targets);
  await auditPayroll(actor, 'kpi_targets_bulk_set', null, null, {
    monthYear: range.label,
    branchId: branchId ?? null,
    mode: input.mode,
    value: input.value,
    overwrite: input.overwrite,
    updated,
  });
  return { monthYear: range.label, updated, skipped: ids.length - updated };
}

export async function setKpiGoal(
  staffProfileId: string,
  input: KpiGoalWriteInput,
  actor: PayrollActor,
): Promise<PayrollRow> {
  const staff = await prisma.staffProfile.findFirst({
    where: { id: staffProfileId, deletedAt: null },
    select: { id: true },
  });
  if (!staff) throw ApiError.notFound('ບໍ່ພົບຊ່າງ');
  await assertStaffInScope(actor, [staffProfileId]);
  const range = monthRange(input.monthYear);
  const before = await prisma.staffKpiGoal.findUnique({
    where: { staffProfileId_monthYear: { staffProfileId, monthYear: range.label } },
    select: { targetRevenue: true, bonusAmount: true, isBonusPaid: true },
  });
  if (before?.isBonusPaid && before.targetRevenue.toNumber() !== input.targetRevenue) {
    throw ApiError.conflict('ໂບນັດເດືອນນີ້ຈ່າຍແລ້ວ — ຍົກເລີກການຈ່າຍກ່ອນຈຶ່ງປ່ຽນເປົ້າໄດ້');
  }
  await recomputeGoals([staffProfileId], range, await getBonusRate(), input.targetRevenue);
  const { rows } = await buildRows(
    { monthYear: input.monthYear, branchId: actor.branchId ?? undefined },
    await commissionRequiresCollection(),
  );
  const row = rows.find((r) => r.staffProfileId === staffProfileId);
  if (!row) throw ApiError.notFound('ບໍ່ພົບແຖວ payroll ຫຼັງບັນທຶກ');
  await auditPayroll(
    actor,
    'kpi_goal_set',
    staffProfileId,
    before ? { monthYear: range.label, targetRevenue: before.targetRevenue.toNumber(), bonusAmount: before.bonusAmount.toNumber() } : null,
    { monthYear: range.label, targetRevenue: row.targetRevenue, bonusAmount: row.bonusAmount },
  );
  return row;
}

export async function recomputeKpi(
  input: KpiRecomputeInput,
  actor: PayrollActor,
): Promise<{ monthYear: string; updated: number }> {
  const range = monthRange(input.monthYear);
  const branchId = actor.branchId ?? input.branchId;
  const staff = await prisma.staffProfile.findMany({
    where: {
      deletedAt: null,
      ...(branchId ? { staffBranches: { some: { branchId } } } : {}),
    },
    select: { id: true },
  });
  const updated = await recomputeGoals(
    staff.map((s) => s.id),
    range,
    await getBonusRate(),
  );
  await auditPayroll(actor, 'kpi_recomputed', null, null, { monthYear: range.label, branchId: branchId ?? null, updated });
  return { monthYear: range.label, updated };
}

async function applyBonusPaid(
  staffProfileIds: string[],
  monthYear: string,
  isBonusPaid: boolean,
  reason: string | undefined,
  actor: PayrollActor,
): Promise<number> {
  await assertStaffInScope(actor, staffProfileIds);
  await assertNotInApprovedRun(staffProfileIds);
  const goals = await prisma.staffKpiGoal.findMany({
    where: { staffProfileId: { in: staffProfileIds }, monthYear, isBonusPaid: !isBonusPaid },
    select: { id: true, staffProfileId: true, bonusAmount: true },
  });
  if (goals.length === 0) return 0;
  if (isBonusPaid) await assertQuickPayLimit(actor, goals.reduce((t, g) => t + g.bonusAmount.toNumber(), 0));
  if (!isBonusPaid) {
    const inPaidRun = await prisma.payslip.count({
      where: { bonusGoalId: { in: goals.map((g) => g.id) }, run: { status: 'PAID' } },
    });
    if (inPaidRun > 0) throw ApiError.conflict('ໂບນັດນີ້ຈ່າຍຜ່ານຮອບເງິນເດືອນແລ້ວ — ຍົກເລີກບໍ່ໄດ້');
  }
  await prisma.staffKpiGoal.updateMany({
    where: { id: { in: goals.map((g) => g.id) } },
    data: isBonusPaid
      ? { isBonusPaid: true, bonusPaidAt: new Date(), bonusPaidById: actor.userId }
      : { isBonusPaid: false, bonusPaidAt: null, bonusPaidById: null },
  });
  const detail = goals.map((g) => ({ staffProfileId: g.staffProfileId, bonusAmount: g.bonusAmount.toNumber() }));
  await auditPayroll(
    actor,
    isBonusPaid ? 'bonus_paid' : 'bonus_payment_cancelled',
    goals.length === 1 ? goals[0]!.staffProfileId : null,
    { monthYear, isBonusPaid: !isBonusPaid, staff: detail },
    {
      monthYear,
      isBonusPaid,
      total: round2(detail.reduce((t, d) => t + d.bonusAmount, 0)),
      ...(reason ? { reason } : {}),
    },
  );
  return goals.length;
}

export async function setBonusPaid(
  staffProfileId: string,
  input: BonusPaidInput,
  actor: PayrollActor,
): Promise<{ staffProfileId: string; monthYear: string; isBonusPaid: boolean }> {
  const goal = await prisma.staffKpiGoal.findUnique({
    where: { staffProfileId_monthYear: { staffProfileId, monthYear: input.monthYear } },
    select: { id: true },
  });
  if (!goal) throw ApiError.notFound('ບໍ່ພົບເປົ້າ KPI ຂອງເດືອນນີ້');
  await applyBonusPaid([staffProfileId], input.monthYear, input.isBonusPaid, input.reason, actor);
  return { staffProfileId, monthYear: input.monthYear, isBonusPaid: input.isBonusPaid };
}

export async function setBonusPaidBulk(
  input: BonusBulkPaidInput,
  actor: PayrollActor,
): Promise<{ monthYear: string; isBonusPaid: boolean; affected: number }> {
  const affected = await applyBonusPaid(input.staffProfileIds, input.monthYear, input.isBonusPaid, input.reason, actor);
  return { monthYear: input.monthYear, isBonusPaid: input.isBonusPaid, affected };
}

/**
 * ໝາຍຄ່າຄອມຂອງເດືອນວ່າຈ່າຍແລ້ວ/ຍັງ ໃຫ້ຊ່າງໜຶ່ງຄົນ ຫຼື ຫຼາຍຄົນ.
 *
 * - `branchId` ຕ້ອງຖືກສົ່ງລົງ where — ບໍ່ດັ່ງນັ້ນການກົດ "ຈ່າຍ" ໃນມຸມມອງທີ່ກັ່ນຕອງດ້ວຍສາຂາໜຶ່ງ
 *   ຈະໄປຈ່າຍຄ່າຄອມຂອງຄິວສາຂາອື່ນຂອງຄົນດຽວກັນນຳ. BRANCH_ADMIN ຖືກບັງຄັບເປັນສາຂາຕົນ (C4).
 * - C2: ຈ່າຍໄດ້ສະເພາະນັດທີ່ເກັບເງິນບິນຄົບແລ້ວ — ສ່ວນທີ່ເຫຼືອຍັງ "held".
 * - C3: ບັນທຶກ paidAt/paidById + AuditLog (ຍອດ ແລະ ລາຍການ).
 */
async function applyCommissionPaid(
  staffProfileIds: string[],
  monthYear: string,
  isPaid: boolean,
  requestedBranchId: string | undefined,
  reason: string | undefined,
  actor: PayrollActor,
): Promise<{ affected: number; amount: number; held: number }> {
  await assertStaffInScope(actor, staffProfileIds);
  await assertNotInApprovedRun(staffProfileIds);
  const branchId = actor.branchId ?? requestedBranchId;
  if (actor.branchId && requestedBranchId && requestedBranchId !== actor.branchId) {
    throw ApiError.forbidden('ຈັດການໄດ້ສະເພາະສາຂາຂອງທ່ານ');
  }
  const { from, to } = monthRange(monthYear);
  const requireCollection = isPaid && (await commissionRequiresCollection());
  const apptWhere: Prisma.AppointmentWhereInput = {
    status: 'COMPLETED',
    deletedAt: null,
    startAt: { gte: from, lt: to },
    ...(branchId ? { branchId } : {}),
  };

  const { targets, held } = await prisma.$transaction(async (tx) => {
    const candidates = await tx.staffCommission.findMany({
      where: { staffProfileId: { in: staffProfileIds }, isPaid: !isPaid, appointment: apptWhere },
      select: { id: true, staffProfileId: true, appointmentId: true, payoutAmount: true, appointment: { select: COLLECTION_SELECT } },
    });
    const targets = requireCollection ? candidates.filter((c) => isAppointmentCollected(c.appointment)) : candidates;
    if (!isPaid && targets.length > 0) {
      const locked = await commissionIdsInPaidRuns(staffProfileIds);
      if (targets.some((c) => locked.has(c.id))) {
        throw ApiError.conflict('ຄ່າຄອມບາງລາຍການຈ່າຍຜ່ານຮອບເງິນເດືອນແລ້ວ — ຍົກເລີກບໍ່ໄດ້');
      }
    }
    if (isPaid) await assertQuickPayLimit(actor, targets.reduce((t, c) => t + c.payoutAmount.toNumber(), 0));
    const heldAmount = candidates
      .filter((c) => !targets.includes(c))
      .reduce((t, c) => t + c.payoutAmount.toNumber(), 0);
    if (targets.length > 0) {
      await tx.staffCommission.updateMany({
        // isPaid ຊ້ຳໃນ where = ກັນສອງ request ຈ່າຍແຖວດຽວກັນພ້ອມກັນ.
        where: {
          id: { in: targets.map((c) => c.id) },
          isPaid: !isPaid,
          ...(requireCollection ? { appointment: COLLECTED_APPOINTMENT_WHERE } : {}),
        },
        data: isPaid
          ? { isPaid: true, paidAt: new Date(), paidById: actor.userId }
          : { isPaid: false, paidAt: null, paidById: null },
      });
    }
    // ຂໍ້ຈຳກັດ 10B — ຈ່າຍຄອມເດືອນນີ້ = ຫັກ clawback ຂອງເດືອນນີ້ແລ້ວ (ຍົກເລີກການຈ່າຍ → ຍັງບໍ່ຫັກ).
    await tx.commissionClawback.updateMany({
      where: { staffProfileId: { in: staffProfileIds }, monthYear, ...(branchId ? { branchId } : {}) },
      data: { isSettled: isPaid },
    });
    return { targets, held: round2(heldAmount) };
  });

  const amount = round2(targets.reduce((t, c) => t + c.payoutAmount.toNumber(), 0));
  if (targets.length > 0) {
    await auditPayroll(
      actor,
      isPaid ? 'commission_paid' : 'commission_payment_cancelled',
      staffProfileIds.length === 1 ? staffProfileIds[0]! : null,
      { monthYear, isPaid: !isPaid },
      {
        monthYear,
        isPaid,
        branchId: branchId ?? null,
        amount,
        lines: targets.length,
        held,
        commissionIds: targets.slice(0, 200).map((c) => c.id),
        ...(reason ? { reason } : {}),
      },
    );
  }
  return { affected: targets.length, amount, held };
}

export async function payCommissions(
  input: CommissionPayInput,
  actor: PayrollActor,
): Promise<{ staffProfileId: string; monthYear: string; isPaid: boolean; affected: number; amount: number; held: number }> {
  const res = await applyCommissionPaid(
    [input.staffProfileId],
    input.monthYear,
    input.isPaid,
    input.branchId,
    input.reason,
    actor,
  );
  return { staffProfileId: input.staffProfileId, monthYear: input.monthYear, isPaid: input.isPaid, ...res };
}

/** ຈ່າຍຄ່າຄອມຫຼາຍຄົນໃນຄັ້ງດຽວ — ໜຶ່ງ transaction, ບໍ່ແມ່ນ loop ຂອງ request. */
export async function payCommissionsBulk(
  input: CommissionBulkPayInput,
  actor: PayrollActor,
): Promise<{ monthYear: string; isPaid: boolean; affected: number; amount: number; held: number; staff: number }> {
  const res = await applyCommissionPaid(
    input.staffProfileIds,
    input.monthYear,
    input.isPaid,
    input.branchId,
    input.reason,
    actor,
  );
  return { monthYear: input.monthYear, isPaid: input.isPaid, ...res, staff: input.staffProfileIds.length };
}
