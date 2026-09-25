import { describe, expect, it } from 'vitest';
import { computePayslip, DEFAULT_PAYROLL_SETTINGS, progressiveTax } from '../../src/modules/payroll/payroll-calc.js';

const S = DEFAULT_PAYROLL_SETTINGS;
const day = (h: number, status: 'ON_TIME' | 'LATE' | 'OVERTIME' | 'ABSENT' = 'ON_TIME') => ({
  status,
  checkIn: new Date('2026-01-05T01:00:00Z'),
  checkOut: new Date(new Date('2026-01-05T01:00:00Z').getTime() + h * 3_600_000),
});

describe('payroll-calc — progressive income tax', () => {
  it('taxes nothing under the exemption band', () => {
    expect(progressiveTax(1_300_000, S.pitBrackets).tax).toBe(0);
  });
  it('taxes each band at its own rate', () => {
    // 3.7M × 5% + 0.8775M × 10%
    const r = progressiveTax(5_877_500, S.pitBrackets);
    expect(r.tax).toBe(185_000 + 87_750);
    expect(r.steps.map((s) => s.rate)).toEqual([0, 0.05, 0.1]);
  });
  it('the top band has no ceiling', () => {
    const r = progressiveTax(100_000_000, S.pitBrackets);
    expect(r.steps.at(-1)).toMatchObject({ rate: 0.25, to: null });
    expect(r.tax).toBe(0 + 185_000 + 1_000_000 + 1_500_000 + 8_000_000 + 8_750_000);
  });
});

describe('payroll-calc — payslip', () => {
  it('monthly salary: absence deduction, overtime, allowance, SSO ceiling, tax, advance', () => {
    const f = computePayslip(
      {
        salaryType: 'MONTHLY',
        baseRate: 6_000_000,
        ssoEnrolled: true,
        attendance: [day(8), day(10, 'OVERTIME'), day(0, 'ABSENT'), day(0, 'ABSENT')],
        commission: 300_000,
        bonus: 0,
        clawback: 0,
        adjustments: [
          { type: 'ALLOWANCE', label: 'ອາຫານ', amount: 200_000 },
          { type: 'ADVANCE', label: 'ເບີກ', amount: 500_000 },
        ],
      },
      S,
    );
    expect(f.daysPresent).toBe(2);
    expect(f.daysAbsent).toBe(2);
    expect(f.overtimeHours).toBe(2);
    expect(f.absenceDeduction).toBeCloseTo(461_538.46, 2);
    expect(f.overtimePay).toBeCloseTo(86_538.46, 2);
    expect(f.grossPay).toBeCloseTo(6_125_000, 1);
    expect(f.ssoBase).toBe(4_500_000);
    expect(f.ssoEmployee).toBe(247_500);
    expect(f.ssoEmployer).toBe(270_000);
    expect(f.incomeTax).toBeCloseTo(272_750, 0);
    expect(f.netPay).toBeCloseTo(6_125_000 - 247_500 - 272_750 - 500_000, 0);
  });

  it('commission-only staff: no SSO on variable pay by default, clawback reduces net', () => {
    const f = computePayslip(
      {
        salaryType: 'NONE',
        baseRate: 0,
        ssoEnrolled: true,
        attendance: [day(12, 'OVERTIME')],
        commission: 1_000_000,
        bonus: 100_000,
        clawback: 50_000,
        adjustments: [],
      },
      S,
    );
    expect(f.basePay).toBe(0);
    expect(f.overtimePay).toBe(0);
    expect(f.ssoBase).toBe(0);
    expect(f.incomeTax).toBe(0);
    expect(f.netPay).toBe(1_050_000);
  });

  it('daily and hourly rates follow attendance; a missing check-out counts as a standard day', () => {
    const daily = computePayslip(
      { salaryType: 'DAILY', baseRate: 100_000, ssoEnrolled: false, attendance: [day(8), day(8, 'LATE'), day(0, 'ABSENT')], commission: 0, bonus: 0, clawback: 0, adjustments: [] },
      S,
    );
    expect(daily.basePay).toBe(200_000);
    expect(daily.absenceDeduction).toBe(0);

    const noOut = { status: 'OVERTIME' as const, checkIn: new Date(), checkOut: null };
    const hourly = computePayslip(
      { salaryType: 'HOURLY', baseRate: 20_000, ssoEnrolled: false, attendance: [day(6), noOut], commission: 0, bonus: 0, clawback: 0, adjustments: [] },
      S,
    );
    expect(hourly.hoursWorked).toBe(14);
    expect(hourly.basePay).toBe(280_000);
    expect(hourly.overtimeHours).toBe(0);
  });

  it('variable pay joins the SSO base only when configured', () => {
    const f = computePayslip(
      { salaryType: 'NONE', baseRate: 0, ssoEnrolled: true, attendance: [], commission: 2_000_000, bonus: 0, clawback: 0, adjustments: [] },
      { ...S, sso: { ...S.sso, includeVariablePay: true } },
    );
    expect(f.ssoBase).toBe(2_000_000);
    expect(f.ssoEmployee).toBe(110_000);
  });
});
