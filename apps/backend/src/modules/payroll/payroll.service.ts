import type {
  BonusBulkPaidInput,
  BonusPaidInput,
  CommissionBulkPayInput,
  CommissionPayInput,
  KpiGoalWriteInput,
  KpiRecomputeInput,
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

async function buildRows(query: PayrollQuery): Promise<BuiltReport> {
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
        select: { staffProfileId: true, payoutAmount: true, isPaid: true },
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

  const commBy = new Map<string, { total: number; paid: number; lines: number }>();
  for (const c of commissions) {
    const e = commBy.get(c.staffProfileId) ?? { total: 0, paid: 0, lines: 0 };
    const p = c.payoutAmount.toNumber();
    e.total += p;
    e.lines += 1;
    if (c.isPaid) e.paid += p;
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
    const comm = commBy.get(s.id) ?? { total: 0, paid: 0, lines: 0 };
    const goal = goalBy.get(s.id);
    const target = goal ? goal.targetRevenue.toNumber() : 0;
    const actual = round2(gross.revenue);
    const bonusAmount = goal ? goal.bonusAmount.toNumber() : 0;
    const bonusPaid = goal ? goal.isBonusPaid : false;
    const commissionTotal = round2(comm.total);
    const commissionPaid = round2(comm.paid);
    const commissionUnpaid = round2(commissionTotal - commissionPaid);
    const claw = clawBy.get(s.id) ?? { total: 0, unsettled: 0 };
    const clawbackTotal = round2(claw.total);
    const clawbackUnsettled = round2(claw.unsettled);
    const payable = round2(commissionTotal + bonusAmount - clawbackTotal);
    const outstanding = round2(Math.max(0, commissionUnpaid + (bonusPaid ? 0 : bonusAmount) - clawbackUnsettled));
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
  const [{ range, rows, daily, previous }, bonusRate] = await Promise.all([
    buildRows(query),
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
): Promise<PayrollBreakdown> {
  const { rows, range } = await buildRows({ ...query, branchId: undefined });
  const row = rows.find((r) => r.staffProfileId === staffProfileId);
  if (!row) throw ApiError.notFound('ບໍ່ພົບຊ່າງ');

  const commissions = await prisma.staffCommission.findMany({
    where: {
      staffProfileId,
      appointment: {
        status: 'COMPLETED',
        deletedAt: null,
        startAt: { gte: range.from, lt: range.to },
      },
    },
    select: {
      id: true,
      serviceAmount: true,
      commissionRate: true,
      payoutAmount: true,
      isPaid: true,
      appointment: {
        select: {
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
  }));

  // ລາຍຮັບລາຍວັນ + top services ອີງຄິວຂອງຄົນນີ້ (ບໍ່ແມ່ນສະເພາະແຖວທີ່ມີຄ່າຄອມ).
  const appts = await prisma.appointment.findMany({
    where: {
      staffProfileId,
      status: 'COMPLETED',
      deletedAt: null,
      startAt: { gte: range.from, lt: range.to },
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

async function recomputeGoal(
  staffProfileId: string,
  label: string,
  from: Date,
  to: Date,
  bonusRate: number,
  branchId: string | undefined,
  targetOverride?: number,
): Promise<void> {
  const existing = await prisma.staffKpiGoal.findFirst({
    where: { staffProfileId, monthYear: label },
    select: { id: true, targetRevenue: true },
  });
  const target = targetOverride ?? (existing ? existing.targetRevenue.toNumber() : 0);

  const agg = await prisma.appointment.aggregate({
    where: {
      staffProfileId,
      status: 'COMPLETED',
      deletedAt: null,
      startAt: { gte: from, lt: to },
      ...(branchId ? { branchId } : {}),
    },
    _sum: { totalAmount: true },
  });
  const actual = round2(agg._sum.totalAmount?.toNumber() ?? 0);
  const bonus = target > 0 && actual > target ? round2((actual - target) * bonusRate) : 0;

  if (existing) {
    await prisma.staffKpiGoal.update({
      where: { id: existing.id },
      data: {
        targetRevenue: new Prisma.Decimal(target.toFixed(2)),
        actualRevenue: new Prisma.Decimal(actual.toFixed(2)),
        bonusAmount: new Prisma.Decimal(bonus.toFixed(2)),
      },
    });
  } else {
    await prisma.staffKpiGoal.create({
      data: {
        staffProfileId,
        monthYear: label,
        targetRevenue: new Prisma.Decimal(target.toFixed(2)),
        actualRevenue: new Prisma.Decimal(actual.toFixed(2)),
        bonusAmount: new Prisma.Decimal(bonus.toFixed(2)),
      },
    });
  }
}

export async function setKpiGoal(
  staffProfileId: string,
  input: KpiGoalWriteInput,
): Promise<PayrollRow> {
  const staff = await prisma.staffProfile.findFirst({
    where: { id: staffProfileId, deletedAt: null },
    select: { id: true },
  });
  if (!staff) throw ApiError.notFound('ບໍ່ພົບຊ່າງ');
  const { from, to, label } = monthRange(input.monthYear);
  const bonusRate = await getBonusRate();
  await recomputeGoal(staffProfileId, label, from, to, bonusRate, undefined, input.targetRevenue);
  const { rows } = await buildRows({ monthYear: input.monthYear });
  const row = rows.find((r) => r.staffProfileId === staffProfileId);
  if (!row) throw ApiError.notFound('ບໍ່ພົບແຖວ payroll ຫຼັງບັນທຶກ');
  return row;
}

export async function recomputeKpi(input: KpiRecomputeInput): Promise<{ monthYear: string; updated: number }> {
  const { from, to, label } = monthRange(input.monthYear);
  const bonusRate = await getBonusRate();
  const staff = await prisma.staffProfile.findMany({
    where: {
      deletedAt: null,
      ...(input.branchId ? { staffBranches: { some: { branchId: input.branchId } } } : {}),
    },
    select: { id: true },
  });
  for (const s of staff) {
    await recomputeGoal(s.id, label, from, to, bonusRate, input.branchId);
  }
  return { monthYear: label, updated: staff.length };
}

export async function setBonusPaid(
  staffProfileId: string,
  input: BonusPaidInput,
): Promise<{ staffProfileId: string; monthYear: string; isBonusPaid: boolean }> {
  const goal = await prisma.staffKpiGoal.findFirst({
    where: { staffProfileId, monthYear: input.monthYear },
    select: { id: true },
  });
  if (!goal) throw ApiError.notFound('ບໍ່ພົບເປົ້າ KPI ຂອງເດືອນນີ້');
  await prisma.staffKpiGoal.update({ where: { id: goal.id }, data: { isBonusPaid: input.isBonusPaid } });
  return { staffProfileId, monthYear: input.monthYear, isBonusPaid: input.isBonusPaid };
}

export async function setBonusPaidBulk(
  input: BonusBulkPaidInput,
): Promise<{ monthYear: string; isBonusPaid: boolean; affected: number }> {
  const res = await prisma.staffKpiGoal.updateMany({
    where: { staffProfileId: { in: input.staffProfileIds }, monthYear: input.monthYear },
    data: { isBonusPaid: input.isBonusPaid },
  });
  return { monthYear: input.monthYear, isBonusPaid: input.isBonusPaid, affected: res.count };
}

/**
 * ໝາຍຄ່າຄອມຂອງເດືອນວ່າຈ່າຍແລ້ວ/ຍັງ.
 *
 * `branchId` ຕ້ອງຖືກສົ່ງຜ່ານລົງ where ນຳ — ບໍ່ດັ່ງນັ້ນການກົດ "ຈ່າຍ" ໃນມຸມມອງ
 * ທີ່ກັ່ນຕອງດ້ວຍສາຂາໜຶ່ງ ຈະໄປຈ່າຍຄ່າຄອມຂອງຄິວສາຂາອື່ນຂອງຄົນດຽວກັນນຳ.
 */
export async function payCommissions(
  input: CommissionPayInput & { branchId?: string },
): Promise<{ staffProfileId: string; monthYear: string; isPaid: boolean; affected: number }> {
  const { from, to } = monthRange(input.monthYear);
  const res = await prisma.staffCommission.updateMany({
    where: {
      staffProfileId: input.staffProfileId,
      appointment: {
        status: 'COMPLETED',
        deletedAt: null,
        startAt: { gte: from, lt: to },
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
    },
    data: { isPaid: input.isPaid },
  });
  // ຂໍ້ຈຳກັດ 10B — ຈ່າຍຄອມເດືອນນີ້ = ຫັກ clawback ຂອງເດືອນນີ້ແລ້ວ (ຍົກເລີກການຈ່າຍ → ຍັງບໍ່ຫັກ).
  await prisma.commissionClawback.updateMany({
    where: { staffProfileId: input.staffProfileId, monthYear: input.monthYear, ...(input.branchId ? { branchId: input.branchId } : {}) },
    data: { isSettled: input.isPaid },
  });
  return {
    staffProfileId: input.staffProfileId,
    monthYear: input.monthYear,
    isPaid: input.isPaid,
    affected: res.count,
  };
}

/** ຈ່າຍຄ່າຄອມຫຼາຍຄົນໃນຄັ້ງດຽວ — ໜຶ່ງ statement, ບໍ່ແມ່ນ loop ຂອງ request. */
export async function payCommissionsBulk(
  input: CommissionBulkPayInput,
): Promise<{ monthYear: string; isPaid: boolean; affected: number; staff: number }> {
  const { from, to } = monthRange(input.monthYear);
  const res = await prisma.staffCommission.updateMany({
    where: {
      staffProfileId: { in: input.staffProfileIds },
      appointment: {
        status: 'COMPLETED',
        deletedAt: null,
        startAt: { gte: from, lt: to },
        ...(input.branchId ? { branchId: input.branchId } : {}),
      },
    },
    data: { isPaid: input.isPaid },
  });
  await prisma.commissionClawback.updateMany({
    where: {
      staffProfileId: { in: input.staffProfileIds },
      monthYear: input.monthYear,
      ...(input.branchId ? { branchId: input.branchId } : {}),
    },
    data: { isSettled: input.isPaid },
  });
  return {
    monthYear: input.monthYear,
    isPaid: input.isPaid,
    affected: res.count,
    staff: input.staffProfileIds.length,
  };
}
