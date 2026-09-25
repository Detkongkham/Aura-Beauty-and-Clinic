import type { BranchInsight } from '@abcp/shared-types';
import { describe, expect, it } from 'vitest';

import type { Branch } from '@/types/models';

import {
  branchIssues,
  dayProgress,
  deltaPct,
  healthOf,
  networkTotals,
  openState,
  setupChecks,
  sortRows,
  type Row,
} from './branches.lib';

const branch = (over: Partial<Branch> = {}): Branch => ({
  id: 'b1',
  name: 'Aura One',
  code: 'VTE-01',
  address: 'x',
  phone: '020',
  province: 'vientiane-capital',
  latitude: 17.9,
  longitude: 102.6,
  timezone: 'Asia/Vientiane',
  isActive: true,
  openTime: '09:00',
  closeTime: '20:00',
  allowNegativeStock: false,
  ...over,
});

const insight = (over: Partial<BranchInsight> = {}, period: Partial<BranchInsight['period']> = {}): BranchInsight => ({
  branchId: 'b1',
  staffCount: 4,
  roomCount: 2,
  roomsAvailable: 2,
  equipmentCount: 1,
  serviceCount: 10,
  today: { appointments: 0, completed: 0, inProgress: 0, upcoming: 0, revenue: 0, queueWaiting: 0, utilization: 0.5 },
  period: {
    bookings: 10,
    completed: 9,
    cancelled: 0,
    noShow: 0,
    revenue: 1000,
    revenuePrev: 800,
    bookingsPrev: 8,
    avgTicket: 111,
    customers: 7,
    utilization: 0.5,
    daily: [400, 600],
    ...period,
  },
  rating: { avg: 4.6, count: 5 },
  upcomingAppointments: 0,
  lowStock: 0,
  outstandingBills: 0,
  outstandingAmount: 0,
  closures: [],
  ...over,
});

describe('openState / dayProgress', () => {
  it('handles same-day and past-midnight windows', () => {
    expect(openState('09:00', '20:00', '10:00')).toEqual({ isOpen: true, boundary: '20:00' });
    expect(openState('09:00', '20:00', '21:00')).toEqual({ isOpen: false, boundary: '09:00' });
    expect(openState('18:00', '02:00', '01:00').isOpen).toBe(true);
    expect(dayProgress('09:00', '19:00', '14:00')).toBeCloseTo(0.5);
    expect(dayProgress('09:00', '19:00', '20:00')).toBeNull();
  });
});

describe('deltaPct', () => {
  it('returns null without a baseline', () => {
    expect(deltaPct(10, 0)).toBeNull();
    expect(deltaPct(0, 0)).toBe(0);
    expect(deltaPct(120, 100)).toBeCloseTo(0.2);
  });
});

describe('branchIssues', () => {
  it('is clean for a healthy branch', () => {
    expect(branchIssues(branch(), insight())).toEqual([]);
  });

  it('flags a closed branch that still has bookings as critical, first', () => {
    const issues = branchIssues(branch({ isActive: false, latitude: 0, longitude: 0 }), insight({ upcomingAppointments: 3 }));
    expect(issues[0]).toMatchObject({ kind: 'closedWithBookings', tone: 'danger', values: { count: 3 } });
    expect(issues.map((i) => i.kind)).toContain('noCoords');
    expect(healthOf(issues)).toBe('risk');
  });

  it('warns on high loss only with enough bookings', () => {
    expect(branchIssues(branch(), insight({}, { bookings: 10, cancelled: 2, noShow: 1 })).map((i) => i.kind)).toContain('highLoss');
    expect(branchIssues(branch(), insight({}, { bookings: 3, cancelled: 2, noShow: 1 })).map((i) => i.kind)).not.toContain('highLoss');
  });

  it('only surfaces a closure within 14 days', () => {
    const closures = [{ id: 'c', date: '2026-10-01', reason: 'Holiday', companyWide: true }];
    expect(branchIssues(branch(), insight({ closures }), '2026-09-25').map((i) => i.kind)).toContain('closureSoon');
    expect(branchIssues(branch(), insight({ closures }), '2026-09-01').map((i) => i.kind)).not.toContain('closureSoon');
  });
});

describe('setupChecks', () => {
  it('counts what is missing', () => {
    const checks = setupChecks(branch({ email: null, amenities: [] }), insight({ roomCount: 0 }));
    expect(checks.filter((c) => !c.ok).map((c) => c.key).sort()).toEqual(['amenities', 'email', 'rooms']);
  });
});

describe('networkTotals', () => {
  it('sums money, weights rating by reviews and utilisation by staff', () => {
    const a = insight({ staffCount: 2, rating: { avg: 5, count: 1 } }, { utilization: 1, daily: [1, 2] });
    const b = insight({ branchId: 'b2', staffCount: 6, rating: { avg: 4, count: 3 } }, { utilization: 0.5, daily: [3, 4] });
    const t = networkTotals([a, b]);
    expect(t.revenue).toBe(2000);
    expect(t.rating).toBeCloseTo(4.25);
    expect(t.utilization).toBeCloseTo((2 * 1 + 6 * 0.5) / 8);
    expect(t.daily).toEqual([4, 6]);
  });
});

describe('sortRows', () => {
  it('sorts by metric desc, missing insights last', () => {
    const rows: Row[] = [
      { branch: branch({ id: 'a', name: 'A' }), insight: insight({}, { revenue: 5 }), issues: [] },
      { branch: branch({ id: 'b', name: 'B' }), insight: undefined, issues: [] },
      { branch: branch({ id: 'c', name: 'C' }), insight: insight({}, { revenue: 50 }), issues: [] },
    ];
    expect(sortRows(rows, 'revenue').map((r) => r.branch.id)).toEqual(['c', 'a', 'b']);
    expect(sortRows(rows, 'name').map((r) => r.branch.id)).toEqual(['a', 'b', 'c']);
  });
});
