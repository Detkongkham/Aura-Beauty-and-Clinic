import { provinceName } from '@/features/branches/lao-provinces';
import { dayjs } from '@/lib/format';
import type { Branch, DashboardStats, LaoProvinceId } from '@/types/models';

export type Metric = 'branches' | 'bookings' | 'revenue';
export const METRICS: Metric[] = ['branches', 'bookings', 'revenue'];

export type Region = 'north' | 'central' | 'south';
export const REGIONS: Region[] = ['north', 'central', 'south'];
export const REGION_OF: Record<LaoProvinceId, Region> = {
  phongsaly: 'north',
  louangnamtha: 'north',
  oudomxay: 'north',
  bokeo: 'north',
  louangprabang: 'north',
  houaphanh: 'north',
  xayaboury: 'north',
  xiangkhouang: 'north',
  'vientiane-capital': 'central',
  vientiane: 'central',
  xaisomboun: 'central',
  bolikhamxai: 'central',
  khammouane: 'central',
  savannakhet: 'central',
  salavan: 'south',
  sekong: 'south',
  champasak: 'south',
  attapeu: 'south',
};

/** Choropleth steps — muted → full primary. */
export const STEPS = [
  'hsl(var(--muted))',
  'hsl(var(--primary) / 0.22)',
  'hsl(var(--primary) / 0.5)',
  'hsl(var(--primary))',
];

type Perf = DashboardStats['branchPerformance'][number];

export interface BranchRow {
  branch: Branch;
  perf: Perf;
  openNow: boolean;
}

export interface Agg {
  branches: number;
  active: number;
  openNow: number;
  bookings: number;
  prevBookings: number;
  revenue: number;
  prevRevenue: number;
  completed: number;
  lost: number;
  todayBookings: number;
  todayRevenue: number;
  upcoming7d: number;
  customers: number;
  walkins: number;
  homeService: number;
  staff: number;
  ratingSum: number;
  ratingCount: number;
  spark: number[];
}

export interface ProvinceRow extends Agg {
  id: LaoProvinceId;
  name: string;
  region: Region;
  rows: BranchRow[];
}

const SPARK_DAYS = 7;

export function emptyAgg(): Agg {
  return {
    branches: 0,
    active: 0,
    openNow: 0,
    bookings: 0,
    prevBookings: 0,
    revenue: 0,
    prevRevenue: 0,
    completed: 0,
    lost: 0,
    todayBookings: 0,
    todayRevenue: 0,
    upcoming7d: 0,
    customers: 0,
    walkins: 0,
    homeService: 0,
    staff: 0,
    ratingSum: 0,
    ratingCount: 0,
    spark: Array.from({ length: SPARK_DAYS }, () => 0),
  };
}

function emptyPerf(b: Branch): Perf {
  return {
    branchId: b.id,
    name: b.name,
    revenue: 0,
    bookings: 0,
    completed: 0,
    lost: 0,
    prevRevenue: 0,
    prevBookings: 0,
    todayBookings: 0,
    todayRevenue: 0,
    upcoming7d: 0,
    customers: 0,
    walkins: 0,
    homeService: 0,
    topService: null,
    staffCount: 0,
    ratingAvg: 0,
    ratingCount: 0,
    spark: [],
  };
}

export function addInto(a: Agg, row: BranchRow) {
  const p = row.perf;
  a.branches += 1;
  if (row.branch.isActive) a.active += 1;
  if (row.openNow) a.openNow += 1;
  a.bookings += p.bookings;
  a.prevBookings += p.prevBookings;
  a.revenue += p.revenue;
  a.prevRevenue += p.prevRevenue;
  a.completed += p.completed;
  a.lost += p.lost;
  a.todayBookings += p.todayBookings;
  a.todayRevenue += p.todayRevenue;
  a.upcoming7d += p.upcoming7d;
  a.customers += p.customers;
  a.walkins += p.walkins;
  a.homeService += p.homeService;
  a.staff += p.staffCount;
  a.ratingSum += p.ratingAvg * p.ratingCount;
  a.ratingCount += p.ratingCount;
  (p.spark ?? []).forEach((v, i) => {
    if (i < a.spark.length) a.spark[i]! += v;
  });
}

/** Open right now (Vientiane clock) — inactive branches are never open. */
export function isOpenNow(b: Branch, nowMs: number): boolean {
  if (!b.isActive) return false;
  const hm = dayjs(nowMs).tz().format('HH:mm');
  return hm >= b.openTime && hm < b.closeTime;
}

export function buildProvinces(
  branches: Branch[],
  performance: Perf[],
  lang: string,
  nowMs: number,
): Map<LaoProvinceId, ProvinceRow> {
  const perf = new Map(performance.map((p) => [p.branchId, p]));
  const map = new Map<LaoProvinceId, ProvinceRow>();
  for (const b of branches) {
    const row: BranchRow = {
      branch: b,
      // Tolerate an older API that lacks the newer fields.
      perf: { ...emptyPerf(b), ...perf.get(b.id) },
      openNow: isOpenNow(b, nowMs),
    };
    let prov = map.get(b.province);
    if (!prov) {
      prov = {
        ...emptyAgg(),
        id: b.province,
        name: provinceName(b.province, lang),
        region: REGION_OF[b.province] ?? 'central',
        rows: [],
      };
      map.set(b.province, prov);
    }
    prov.rows.push(row);
    addInto(prov, row);
  }
  for (const p of map.values()) p.rows.sort((a, b) => b.perf.revenue - a.perf.revenue);
  return map;
}

export function metricOf(a: Agg, m: Metric): number {
  return m === 'branches' ? a.branches : m === 'bookings' ? a.bookings : a.revenue;
}

/** 0 → empty, otherwise one of three steps relative to the top value. */
export function stepFor(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  const r = value / max;
  return r <= 1 / 3 ? 1 : r <= 2 / 3 ? 2 : 3;
}

export function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

export interface Change {
  label: string;
  direction: 'up' | 'down' | 'flat';
}

/** Signed % change vs the previous window; `new` when there was nothing before. */
export function changeOf(curr: number, prev: number): Change | null {
  if (curr === 0 && prev === 0) return null;
  if (prev === 0) return { label: 'new', direction: 'up' };
  const r = (curr - prev) / prev;
  if (Math.abs(r) < 0.005) return { label: '0%', direction: 'flat' };
  return { label: `${r > 0 ? '+' : ''}${Math.round(r * 100)}%`, direction: r > 0 ? 'up' : 'down' };
}

export function ratingOf(a: Pick<Agg, 'ratingSum' | 'ratingCount'>): number {
  return a.ratingCount ? Math.round((a.ratingSum / a.ratingCount) * 10) / 10 : 0;
}
