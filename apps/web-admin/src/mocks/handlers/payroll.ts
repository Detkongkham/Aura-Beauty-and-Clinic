import type { PayrollBreakdown, PayrollReport, PayrollRow } from '@abcp/shared-types';
import { http } from 'msw';

import { api, ok } from '../helpers';

/**
 * Payroll / Staff KPI mocks (Module 34). Mirrors `GET /payroll/kpi` closely
 * enough that the console renders its real states in dev: people who cleared
 * their target, people still owed money, someone without a target, and an
 * inactive staff member who still has a balance.
 */

const MONTH = new Date().toISOString().slice(0, 7);

function daysInMonth(monthYear: string): number {
  const y = Number(monthYear.slice(0, 4));
  const m = Number(monthYear.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

type Seed = {
  id: string;
  name: string;
  branch: string;
  jobs: number;
  revenue: number;
  prev: number;
  rate: number;
  paidRatio: number;
  target: number;
  bonus: number;
  bonusPaid: boolean;
  active?: boolean;
  rating: number;
  reviews: number;
  present: number;
  late: number;
  absent: number;
};

const SEEDS: Seed[] = [
  { id: 'sp-1', name: 'ນາງ ສົມໃຈ', branch: 'ສາຂາ ວຽງຈັນ', jobs: 62, revenue: 18_400_000, prev: 15_900_000, rate: 0.12, paidRatio: 1, target: 16_000_000, bonus: 120_000, bonusPaid: true, rating: 4.9, reviews: 54, present: 24, late: 1, absent: 0 },
  { id: 'sp-2', name: 'ທ້າວ ບຸນມີ', branch: 'ສາຂາ ວຽງຈັນ', jobs: 48, revenue: 14_100_000, prev: 14_800_000, rate: 0.1, paidRatio: 0.4, target: 15_000_000, bonus: 0, bonusPaid: false, rating: 4.6, reviews: 31, present: 22, late: 3, absent: 1 },
  { id: 'sp-3', name: 'ນາງ ດາວ', branch: 'ສາຂາ ປາກເຊ', jobs: 41, revenue: 11_250_000, prev: 8_900_000, rate: 0.1, paidRatio: 0, target: 10_000_000, bonus: 62_500, bonusPaid: false, rating: 4.8, reviews: 27, present: 23, late: 0, absent: 0 },
  { id: 'sp-4', name: 'ທ້າວ ແສງ', branch: 'ສາຂາ ປາກເຊ', jobs: 27, revenue: 6_800_000, prev: 7_400_000, rate: 0.08, paidRatio: 0, target: 0, bonus: 0, bonusPaid: false, rating: 4.4, reviews: 12, present: 19, late: 2, absent: 2 },
  { id: 'sp-5', name: 'ນາງ ພອນ', branch: 'ສາຂາ ວຽງຈັນ', jobs: 9, revenue: 2_150_000, prev: 5_600_000, rate: 0.1, paidRatio: 0, target: 8_000_000, bonus: 0, bonusPaid: false, active: false, rating: 4.2, reviews: 8, present: 6, late: 1, absent: 9 },
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildRows(): PayrollRow[] {
  const total = SEEDS.reduce((s, x) => s + x.revenue, 0);
  const rows = SEEDS.map((s) => {
    const commissionTotal = round2(s.revenue * s.rate);
    const commissionPaid = round2(commissionTotal * s.paidRatio);
    const commissionUnpaid = round2(commissionTotal - commissionPaid);
    const payable = round2(commissionTotal + s.bonus);
    const outstanding = round2(commissionUnpaid + (s.bonusPaid ? 0 : s.bonus));
    return {
      staffProfileId: s.id,
      staffName: s.name,
      branchId: s.branch === 'ສາຂາ ວຽງຈັນ' ? 'br-1' : 'br-2',
      branchName: s.branch,
      rank: 0,
      completedJobs: s.jobs,
      grossRevenue: s.revenue,
      commissionRate: s.rate,
      commissionTotal,
      commissionPaid,
      commissionUnpaid,
      targetRevenue: s.target,
      actualRevenue: s.revenue,
      targetMet: s.target > 0 && s.revenue >= s.target,
      attainmentPct: s.target > 0 ? Math.round((s.revenue / s.target) * 100) : 0,
      bonusAmount: s.bonus,
      bonusPaid: s.bonusPaid,
      clawbackTotal: 0,
      clawbackUnsettled: 0,
      payable,
      outstanding,
      isActive: s.active ?? true,
      rating: s.rating,
      totalReviews: s.reviews,
      avgTicket: s.jobs > 0 ? round2(s.revenue / s.jobs) : 0,
      revenueShare: total > 0 ? s.revenue / total : 0,
      prevGrossRevenue: s.prev,
      prevCompletedJobs: Math.round(s.jobs * 0.9),
      revenueDeltaPct: s.prev > 0 ? Math.round(((s.revenue - s.prev) / s.prev) * 100) : null,
      commissionLines: s.jobs,
      attendance: { present: s.present, late: s.late, overtime: 0, absent: s.absent },
      payoutState:
        payable <= 0 ? 'CLEAR' : outstanding <= 0 ? 'CLEAR' : outstanding >= payable ? 'DUE' : 'PARTIAL',
    } satisfies PayrollRow;
  });
  rows.sort((a, b) => b.grossRevenue - a.grossRevenue);
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });
  return rows;
}

function buildReport(monthYear: string, branchId: string | null): PayrollReport {
  const all = buildRows();
  const rows = branchId ? all.filter((r) => r.branchId === branchId) : all;
  const sum = (pick: (r: PayrollRow) => number) => round2(rows.reduce((s, r) => s + pick(r), 0));
  const grossRevenue = sum((r) => r.grossRevenue);
  const commissionTotal = sum((r) => r.commissionTotal);
  const bonusTotal = sum((r) => r.bonusAmount);
  const payable = round2(commissionTotal + bonusTotal);
  const days = daysInMonth(monthYear);
  const isCurrentMonth = monthYear === MONTH;
  const elapsed = isCurrentMonth ? Math.min(days, new Date().getUTCDate()) : days;

  return {
    monthYear,
    generatedAt: new Date().toISOString(),
    bonusRate: 0.05,
    isCurrentMonth,
    daysElapsed: elapsed,
    daysInMonth: days,
    rows,
    daily: Array.from({ length: days }, (_, i) => {
      const filled = i < elapsed;
      const revenue = filled ? Math.round((grossRevenue / Math.max(elapsed, 1)) * (0.5 + ((i * 7) % 11) / 10)) : 0;
      return {
        date: `${monthYear}-${String(i + 1).padStart(2, '0')}`,
        revenue,
        jobs: filled ? Math.max(1, Math.round(revenue / 280_000)) : 0,
      };
    }),
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
      clawbackTotal: 0,
      payable,
      outstanding: sum((r) => r.outstanding),
      staffOwed: rows.filter((r) => r.outstanding > 0).length,
      targetRevenue: sum((r) => r.targetRevenue),
      targetMetCount: rows.filter((r) => r.targetMet).length,
      staffWithTarget: rows.filter((r) => r.targetRevenue > 0).length,
      labourCostRatio: grossRevenue > 0 ? round2(payable / grossRevenue) : 0,
    },
    previous: {
      monthYear: `${monthYear.slice(0, 4)}-${String(Math.max(1, Number(monthYear.slice(5, 7)) - 1)).padStart(2, '0')}`,
      grossRevenue: sum((r) => r.prevGrossRevenue),
      completedJobs: rows.reduce((s, r) => s + r.prevCompletedJobs, 0),
      commissionTotal: round2(commissionTotal * 0.94),
      payable: round2(payable * 0.94),
    },
  };
}

export const payrollHandlers = [
  http.get(api('/payroll/kpi'), ({ request }) => {
    const url = new URL(request.url);
    return ok(buildReport(url.searchParams.get('monthYear') ?? MONTH, url.searchParams.get('branchId')));
  }),

  http.get(api('/payroll/kpi/:staffProfileId/breakdown'), ({ params, request }) => {
    const url = new URL(request.url);
    const monthYear = url.searchParams.get('monthYear') ?? MONTH;
    const report = buildReport(monthYear, null);
    const row = report.rows.find((r) => r.staffProfileId === params.staffProfileId) ?? report.rows[0]!;
    return ok({
      monthYear,
      row,
      lines: Array.from({ length: Math.min(8, row.commissionLines) }, (_, i) => ({
        commissionId: `cm-${row.staffProfileId}-${i}`,
        appointmentId: `ap-${i}`,
        startAt: new Date(Date.now() - i * 86_400_000).toISOString(),
        customerName: `ລູກຄ້າ ${i + 1}`,
        serviceName: i % 2 === 0 ? 'ນວດອົບສະໝຸນໄພ' : 'ດູແລຜິວໜ້າ',
        branchName: row.branchName,
        serviceAmount: 300_000,
        commissionRate: row.commissionRate,
        payoutAmount: Math.round(300_000 * row.commissionRate),
        isPaid: i % 3 !== 0,
      })),
      daily: report.daily,
      topServices: [
        { serviceName: 'ນວດອົບສະໝຸນໄພ', jobs: Math.round(row.completedJobs * 0.5), revenue: Math.round(row.grossRevenue * 0.5) },
        { serviceName: 'ດູແລຜິວໜ້າ', jobs: Math.round(row.completedJobs * 0.3), revenue: Math.round(row.grossRevenue * 0.32) },
        { serviceName: 'ເລັບເຈວ', jobs: Math.round(row.completedJobs * 0.2), revenue: Math.round(row.grossRevenue * 0.18) },
      ],
      history: Array.from({ length: 6 }, (_, i) => {
        const factor = 0.7 + i * 0.06;
        return {
          monthYear: `${monthYear.slice(0, 4)}-${String(Math.max(1, Number(monthYear.slice(5, 7)) - (5 - i))).padStart(2, '0')}`,
          grossRevenue: Math.round(row.grossRevenue * factor),
          payable: Math.round(row.payable * factor),
        };
      }),
    } satisfies PayrollBreakdown);
  }),

  http.get(api('/payroll/export'), () =>
    new Response('﻿rank,staff,branch\n', {
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
    }),
  ),

  http.put(api('/payroll/kpi/:staffProfileId'), ({ params }) =>
    ok({ ...buildRows()[0]!, staffProfileId: params.staffProfileId as string }),
  ),

  http.post(api('/payroll/kpi/recompute'), async ({ request }) => {
    const body = (await request.json()) as { monthYear: string };
    return ok({ monthYear: body.monthYear, updated: SEEDS.length });
  }),

  http.patch(api('/payroll/kpi/:staffProfileId/bonus-paid'), async ({ params, request }) => {
    const body = (await request.json()) as { monthYear: string; isBonusPaid: boolean };
    return ok({ staffProfileId: params.staffProfileId, ...body });
  }),

  http.patch(api('/payroll/kpi/bonus-paid-bulk'), async ({ request }) => {
    const body = (await request.json()) as { staffProfileIds: string[] };
    return ok({ affected: body.staffProfileIds.length });
  }),

  http.post(api('/payroll/commissions/pay'), async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return ok({ ...body, affected: 1 });
  }),

  http.post(api('/payroll/commissions/pay-bulk'), async ({ request }) => {
    const body = (await request.json()) as { staffProfileIds: string[] };
    return ok({ affected: body.staffProfileIds.length, staff: body.staffProfileIds.length });
  }),
];
