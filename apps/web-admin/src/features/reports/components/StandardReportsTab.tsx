import { useQuery } from '@tanstack/react-query';
import {
  Boxes,
  Building2,
  CalendarCheck,
  CalendarDays,
  Clock,
  Hourglass,
  Layers,
  ListChecks,
  RefreshCw,
  FlaskConical,
  Percent,
  Scale,
  Scissors,
  ShoppingBag,
  Split,
  Timer,
  TrendingDown,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AbcBasis,
  AbcView,
  InventoryReportGroupBy,
  InventoryTurnoverView,
  ProfitLossView,
  ServiceMarginView,
  RetailMarginView,
  ServiceUsageView,
  StockAgingView,
  StockShrinkageView,
  StockValuationView,
} from '@abcp/shared-types';

import { DateField } from '@/components/shared/DateField';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { http } from '@/services/http';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DashboardStats } from '@/types/models';

import { downloadCsv, type CsvRow } from '../lib/csv';
import { HourHistogram } from './HourHistogram';
import { AbcReportBody, CategoryGroupsTable } from './InventoryReportExtras';
import { abcCsv, categoryGroupsCsv } from './inventoryReportCsv';
import { CellBar, LedgerTable } from './LedgerTable';
import { ReportDocHeader } from './ReportDocHeader';
import { ReportRevenueBars } from './ReportRevenueBars';
import { ReportStatCard, type StatTone } from './ReportStatCard';
import { SplitMeter } from './SplitMeter';
import { StatusStackBar } from './StatusStackBar';

interface EndOfDay {
  date: string;
  branchId: string;
  totals: {
    bookings: number;
    completed: number;
    cancelled: number;
    walkIns: number;
    revenue: number;
    deposits: number;
  };
  topServices: { name: string; count: number; revenue: number }[];
}

type ReportId =
  | 'end-of-day'
  | 'sales-by-day'
  | 'revenue-by-service'
  | 'staff-performance'
  | 'branch-performance'
  | 'status'
  | 'peak-hours'
  | 'channel'
  | 'queue'
  | 'profit-loss'
  | 'service-margin'
  | 'stock-valuation'
  | 'shrinkage'
  | 'inventory-turnover'
  | 'stock-aging'
  | 'service-usage'
  | 'abc-analysis'
  | 'retail-margin';

/** 9D — ລາຍງານທີ່ໃຊ້ຊ່ວງວັນ from/to ຮ່ວມກັນ (ຄ່າວ່າງ = 30 ວັນຫຼ້າສຸດ). */
const RANGE_REPORTS: ReportId[] = ['shrinkage', 'inventory-turnover', 'service-usage', 'abc-analysis', 'retail-margin'];
/** 9C — M3: ລາຍງານທີ່ຈັດກຸ່ມຕາມໝວດສິນຄ້າໄດ້ (groupBy=category). */
const GROUPABLE_REPORTS: ReportId[] = ['stock-valuation', 'inventory-turnover', 'stock-aging'];

/** Finance reports load their own data (not the 14-day dashboard stats). */
const SELF_LOADING: ReportId[] = [
  'end-of-day',
  'profit-loss',
  'service-margin',
  'stock-valuation',
  'shrinkage',
  'inventory-turnover',
  'stock-aging',
  'service-usage',
  'abc-analysis',
  'retail-margin',
];

const CATALOG: { groupKey: string; items: { id: ReportId; icon: LucideIcon }[] }[] = [
  { groupKey: 'daily', items: [{ id: 'end-of-day', icon: CalendarCheck }] },
  {
    groupKey: 'sales',
    items: [
      { id: 'sales-by-day', icon: CalendarDays },
      { id: 'revenue-by-service', icon: Scissors },
    ],
  },
  {
    groupKey: 'people',
    items: [
      { id: 'staff-performance', icon: Users },
      { id: 'branch-performance', icon: Building2 },
    ],
  },
  {
    groupKey: 'ops',
    items: [
      { id: 'status', icon: ListChecks },
      { id: 'peak-hours', icon: Clock },
      { id: 'channel', icon: Split },
      { id: 'queue', icon: Timer },
    ],
  },
  {
    groupKey: 'finance',
    items: [
      { id: 'profit-loss', icon: Scale },
      { id: 'service-margin', icon: Percent },
      { id: 'retail-margin', icon: ShoppingBag },
      { id: 'stock-valuation', icon: Boxes },
      { id: 'shrinkage', icon: TrendingDown },
      { id: 'inventory-turnover', icon: RefreshCw },
      { id: 'stock-aging', icon: Hourglass },
      { id: 'service-usage', icon: FlaskConical },
      { id: 'abc-analysis', icon: Layers },
    ],
  },
];
const FLAT_IDS = CATALOG.flatMap((g) => g.items.map((i) => i.id));
const camel = (id: string) => id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

interface Props {
  branchId: string;
  branchName: string;
  stats?: DashboardStats;
}

/** Standard reports — a catalogue on the left, the selected report rendered as a
 *  print-ready document on the right (masthead, KPIs, a chart, and a sortable
 *  ledger). Its own master–detail layout, distinct from the Overview scroll. */
export function StandardReportsTab({ branchId, branchName, stats }: Props) {
  const { t } = useTranslation();
  const [active, setActive] = useState<ReportId>('end-of-day');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const navRefs = useRef<Partial<Record<ReportId, HTMLButtonElement | null>>>({});

  const { data: eod, isLoading: eodLoading } = useQuery({
    queryKey: ['reports', 'end-of-day', date, branchId],
    queryFn: async () => {
      const res = await http.get<{ data: EndOfDay }>('/reports/end-of-day', {
        params: { date, branchId },
      });
      return res.data.data;
    },
    enabled: active === 'end-of-day',
  });

  const branchParam = branchId && branchId !== 'all' ? { branchId } : {};
  // M12-lite — P&L ເດືອນນີ້ (COGS ຈາກ valued ledger + shrinkage) ແລະ ກຳໄລຂັ້ນຕົ້ນຕໍ່ບໍລິການ (30 ວັນ).
  const pnlQ = useQuery({
    queryKey: ['reports', 'profit-loss', branchId],
    queryFn: async () =>
      (await http.get<{ data: ProfitLossView }>('/expenses/profit-loss', { params: branchParam })).data.data,
    enabled: active === 'profit-loss',
    retry: false,
  });
  const marginQ = useQuery({
    queryKey: ['reports', 'service-margin', branchId],
    queryFn: async () =>
      (await http.get<{ data: ServiceMarginView }>('/stock-movements/service-margin', { params: branchParam })).data
        .data,
    enabled: active === 'service-margin',
    retry: false,
  });

  // Inventory wave 9B — stock value as of a Vientiane day (from the valued ledger) + shrinkage by reason/product.
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  // 9C — M3: ຈັດກຸ່ມຕາມໝວດ (valuation/turnover/aging) + basis ຂອງ ABC.
  const [groupBy, setGroupBy] = useState<InventoryReportGroupBy>('product');
  const [abcBasis, setAbcBasis] = useState<AbcBasis>('consumptionValue');
  const groupParam = groupBy === 'category' ? { groupBy } : {};
  const [shrinkFrom, setShrinkFrom] = useState('');
  const [shrinkTo, setShrinkTo] = useState('');
  const valuationQ = useQuery({
    queryKey: ['reports', 'stock-valuation', branchId, asOf, groupBy],
    queryFn: async () =>
      (
        await http.get<{ data: StockValuationView }>('/stock-movements/valuation', {
          params: { ...branchParam, ...(asOf ? { asOf } : {}), ...groupParam },
        })
      ).data.data,
    enabled: active === 'stock-valuation',
    retry: false,
  });
  const shrinkQ = useQuery({
    queryKey: ['reports', 'shrinkage', branchId, shrinkFrom, shrinkTo],
    queryFn: async () =>
      (
        await http.get<{ data: StockShrinkageView }>('/stock-movements/shrinkage', {
          params: { ...branchParam, ...(shrinkFrom ? { from: shrinkFrom } : {}), ...(shrinkTo ? { to: shrinkTo } : {}) },
        })
      ).data.data,
    enabled: active === 'shrinkage',
    retry: false,
  });
  // Inventory wave 9D — turnover / days on hand, stock aging, consumable usage per service.
  const rangeParams = { ...branchParam, ...(shrinkFrom ? { from: shrinkFrom } : {}), ...(shrinkTo ? { to: shrinkTo } : {}) };
  const turnoverQ = useQuery({
    queryKey: ['reports', 'inventory-turnover', branchId, shrinkFrom, shrinkTo, groupBy],
    queryFn: async () =>
      (await http.get<{ data: InventoryTurnoverView }>('/stock-movements/turnover', { params: { ...rangeParams, ...groupParam } }))
        .data.data,
    enabled: active === 'inventory-turnover',
    retry: false,
  });
  const agingQ = useQuery({
    queryKey: ['reports', 'stock-aging', branchId, groupBy],
    queryFn: async () =>
      (await http.get<{ data: StockAgingView }>('/stock-movements/aging', { params: { ...branchParam, ...groupParam } })).data.data,
    enabled: active === 'stock-aging',
    retry: false,
  });
  const usageQ = useQuery({
    queryKey: ['reports', 'service-usage', branchId, shrinkFrom, shrinkTo],
    queryFn: async () =>
      (await http.get<{ data: ServiceUsageView }>('/stock-movements/service-usage', { params: rangeParams })).data.data,
    enabled: active === 'service-usage',
    retry: false,
  });
  const abcQ = useQuery({
    queryKey: ['reports', 'abc-analysis', branchId, shrinkFrom, shrinkTo, abcBasis],
    queryFn: async () =>
      (await http.get<{ data: AbcView }>('/stock-movements/abc', { params: { ...rangeParams, basis: abcBasis } })).data.data,
    enabled: active === 'abc-analysis',
    retry: false,
  });

  // M13 — ກຳໄລຂັ້ນຕົ້ນຕໍ່ສິນຄ້າ (ຂາຍໜ້າຮ້ານ).
  const retailQ = useQuery({
    queryKey: ['reports', 'retail-margin', branchId, shrinkFrom, shrinkTo],
    queryFn: async () => (await http.get<{ data: RetailMarginView }>('/retail-sales/margin', { params: rangeParams })).data.data,
    enabled: active === 'retail-margin',
    retry: false,
  });

  const onNavKey = (e: KeyboardEvent, id: ReportId) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = FLAT_IDS.indexOf(id);
    const next =
      e.key === 'ArrowDown' ? (i + 1) % FLAT_IDS.length : (i - 1 + FLAT_IDS.length) % FLAT_IDS.length;
    const nid = FLAT_IDS[next]!;
    setActive(nid);
    navRefs.current[nid]?.focus();
  };

  const win = t('dashboard.last14Window');
  const today = t('dashboard.today');

  // ---- derived datasets ----
  const svc = useMemo(() => {
    const rows = stats?.serviceMix ?? [];
    const total = rows.reduce((s, d) => s + d.value, 0);
    return { rows, total, max: Math.max(1, ...rows.map((d) => d.value)), top: rows[0] };
  }, [stats]);

  const daily = useMemo(() => {
    const src = stats?.revenueSeries ?? [];
    let run = 0;
    const rows = src.map((d) => ({ ...d, running: (run += d.revenue) }));
    const revenue = src.reduce((s, d) => s + d.revenue, 0);
    const bookings = src.reduce((s, d) => s + d.bookings, 0);
    const best = src.reduce<DashboardStats['revenueSeries'][number] | null>(
      (a, b) => (!a || b.revenue > a.revenue ? b : a),
      null,
    );
    return { rows, revenue, bookings, avg: src.length ? Math.round(revenue / src.length) : 0, best };
  }, [stats]);

  const staff = useMemo(() => {
    const rows = stats?.staffLeaderboard ?? [];
    return {
      rows,
      completed: rows.reduce((s, d) => s + d.completed, 0),
      revenue: rows.reduce((s, d) => s + d.revenue, 0),
    };
  }, [stats]);

  const branch = useMemo(() => {
    const rows = stats?.branchPerformance ?? [];
    return {
      rows,
      revenue: rows.reduce((s, d) => s + d.revenue, 0),
      bookings: rows.reduce((s, d) => s + d.bookings, 0),
    };
  }, [stats]);

  const status = useMemo(() => {
    const rows = stats?.statusBreakdown ?? [];
    const total = rows.reduce((s, d) => s + d.count, 0);
    const done = rows.find((r) => r.status === 'COMPLETED')?.count ?? 0;
    const cancel =
      (rows.find((r) => r.status === 'CANCELLED')?.count ?? 0) +
      (rows.find((r) => r.status === 'NO_SHOW')?.count ?? 0);
    return {
      rows,
      total,
      done,
      cancel,
      rate: done + cancel > 0 ? Math.round((done / (done + cancel)) * 100) : 0,
    };
  }, [stats]);

  const hours = useMemo(() => {
    const rows = stats?.hoursToday ?? [];
    return {
      rows,
      total: rows.reduce((s, d) => s + d.count, 0),
      peak: rows.reduce<DashboardStats['hoursToday'][number] | undefined>(
        (a, b) => (b.count > (a?.count ?? -1) ? b : a),
        undefined,
      ),
    };
  }, [stats]);

  const meta = {
    label: t(`reports.std.${camel(active)}`),
    desc: t(`reports.std.${camel(active)}Desc`),
  };
  const scope =
    active === 'end-of-day'
      ? [formatDate(date), branchName]
      : active === 'profit-loss'
        ? [pnlQ.data?.from ?? '—', branchName]
        : active === 'service-margin'
          ? [marginQ.data ? `${formatDate(marginQ.data.from)} – ${formatDate(marginQ.data.to)}` : '—', branchName]
          : active === 'stock-valuation'
            ? [t('reports.inv.asOfScope', { date: formatDate(asOf) }), branchName]
            : active === 'shrinkage'
              ? [shrinkQ.data ? `${formatDate(shrinkQ.data.from)} – ${formatDate(shrinkQ.data.to)}` : '—', branchName]
              : active === 'inventory-turnover'
                ? [turnoverQ.data ? `${formatDate(turnoverQ.data.from)} – ${formatDate(turnoverQ.data.to)}` : '—', branchName]
                : active === 'service-usage'
                  ? [usageQ.data ? `${formatDate(usageQ.data.from)} – ${formatDate(usageQ.data.to)}` : '—', branchName]
                  : active === 'retail-margin'
                  ? [retailQ.data ? `${formatDate(retailQ.data.from)} – ${formatDate(retailQ.data.to)}` : '—', branchName]
                  : active === 'abc-analysis'
                    ? [
                        abcQ.data?.from && abcQ.data.to
                          ? `${formatDate(abcQ.data.from)} – ${formatDate(abcQ.data.to)}`
                          : t('reports.inv.basis.stockValue'),
                        branchName,
                      ]
                  : active === 'stock-aging'
                    ? [t('reports.inv.asOfScope', { date: formatDate(agingQ.data?.asOf ?? new Date().toISOString().slice(0, 10)) }), branchName]
                    : [win, branchName];
  const loadingStats = !stats && !SELF_LOADING.includes(active);
  const busy =
    loadingStats ||
    (active === 'end-of-day' && eodLoading) ||
    (active === 'profit-loss' && pnlQ.isLoading) ||
    (active === 'service-margin' && marginQ.isLoading) ||
    (active === 'stock-valuation' && valuationQ.isLoading) ||
    (active === 'shrinkage' && shrinkQ.isLoading) ||
    (active === 'inventory-turnover' && turnoverQ.isLoading) ||
    (active === 'stock-aging' && agingQ.isLoading) ||
    (active === 'service-usage' && usageQ.isLoading) ||
    (active === 'abc-analysis' && abcQ.isLoading) ||
    (active === 'retail-margin' && retailQ.isLoading);

  const pnlLines = useMemo(() => {
    const p = pnlQ.data;
    if (!p) return [];
    return [
      { k: 'revenue', label: t('reports.fin.revenue'), amount: p.revenue, kind: 'line' as const },
      { k: 'refunds', label: t('reports.fin.refunds'), amount: -p.refunds, kind: 'line' as const },
      { k: 'netRevenue', label: t('reports.fin.netRevenue'), amount: p.netRevenue, kind: 'sub' as const },
      { k: 'retailRevenue', label: t('reports.fin.retailRevenue'), amount: p.retailRevenue, kind: 'memo' as const },
      { k: 'cogs', label: t('reports.fin.cogs'), amount: -p.cogs, kind: 'line' as const },
      { k: 'retailCogs', label: t('reports.fin.retailCogs'), amount: -p.retailCogs, kind: 'memo' as const },
      { k: 'gross', label: t('reports.fin.grossProfit'), amount: p.grossProfit, kind: 'sub' as const },
      { k: 'shrinkage', label: t('reports.fin.shrinkage'), amount: -p.shrinkage, kind: 'line' as const },
      { k: 'labour', label: t('reports.fin.labour'), amount: -p.labour.total, kind: 'line' as const },
      { k: 'operating', label: t('reports.fin.operating'), amount: -p.operating.total, kind: 'line' as const },
      { k: 'net', label: t('reports.fin.netProfit'), amount: p.netProfit, kind: 'sub' as const },
    ];
  }, [pnlQ.data, t]);

  function handleExport() {
    let body: CsvRow[] = [];
    if (active === 'end-of-day' && eod) {
      body = [
        [t('reports.std.date'), formatDate(date)],
        [t('reports.bookings'), eod.totals.bookings],
        [t('reports.completed'), eod.totals.completed],
        [t('status.CANCELLED'), eod.totals.cancelled],
        [t('reports.std.walkIns'), eod.totals.walkIns],
        [t('reports.revenue'), eod.totals.revenue],
        [t('reports.deposits'), eod.totals.deposits],
        [],
        [t('reports.col.service'), t('reports.col.count'), t('reports.col.revenue')],
        ...eod.topServices.map((s): CsvRow => [s.name, s.count, s.revenue]),
      ];
    } else if (active === 'sales-by-day') {
      body = [
        [
          t('reports.col.date'),
          t('reports.col.bookings'),
          t('reports.col.revenue'),
          t('reports.col.runningTotal'),
        ],
        ...daily.rows.map((d): CsvRow => [d.date, d.bookings, d.revenue, d.running]),
        [t('reports.total'), daily.bookings, daily.revenue, daily.revenue],
      ];
    } else if (active === 'revenue-by-service') {
      body = [
        [t('reports.col.service'), t('reports.col.count'), t('reports.col.share')],
        ...svc.rows.map((s): CsvRow => [
          s.name,
          s.value,
          `${svc.total ? Math.round((s.value / svc.total) * 100) : 0}%`,
        ]),
      ];
    } else if (active === 'staff-performance') {
      body = [
        [
          t('reports.col.staff'),
          t('reports.col.completed'),
          t('reports.col.revenue'),
          t('reports.col.perVisit'),
        ],
        ...staff.rows.map((s): CsvRow => [
          s.name,
          s.completed,
          s.revenue,
          s.completed ? Math.round(s.revenue / s.completed) : 0,
        ]),
      ];
    } else if (active === 'branch-performance') {
      body = [
        [t('reports.col.branch'), t('reports.col.bookings'), t('reports.col.revenue')],
        ...branch.rows.map((b): CsvRow => [b.name, b.bookings, b.revenue]),
      ];
    } else if (active === 'status') {
      body = [
        [t('reports.col.status'), t('reports.col.count'), t('reports.col.share')],
        ...status.rows.map((r): CsvRow => [
          t(`status.${r.status}`),
          r.count,
          `${status.total ? Math.round((r.count / status.total) * 100) : 0}%`,
        ]),
      ];
    } else if (active === 'peak-hours') {
      body = [
        [t('reports.col.hour'), t('reports.col.count')],
        ...hours.rows.map((h): CsvRow => [`${String(h.hour).padStart(2, '0')}:00`, h.count]),
      ];
    } else if (active === 'channel' && stats) {
      body = [
        [t('reports.channel.bookingType'), t('reports.col.count')],
        [t('reports.channel.booked'), Math.max(0, stats.bookingsToday - stats.walkinsToday)],
        [t('reports.channel.walkIn'), stats.walkinsToday],
        [],
        [t('reports.channel.delivery'), t('reports.col.count')],
        [t('reports.channel.inStore'), Math.max(0, stats.bookingsToday - stats.homeServiceToday)],
        [t('reports.channel.homeService'), stats.homeServiceToday],
      ];
    } else if (active === 'queue' && stats) {
      body = [
        [t('reports.metric'), t('reports.value')],
        [t('reports.queue.waiting'), stats.queueWaiting],
        [t('reports.queue.inService'), stats.queueInService],
        [t('reports.queue.called'), stats.queueCalled],
        [t('reports.queue.longestWait'), stats.queueLongestWaitMin],
        [t('reports.queue.nextNumber'), stats.queueNextNumber ?? '—'],
      ];
    } else if (active === 'profit-loss' && pnlQ.data) {
      body = [
        [t('reports.metric'), t('reports.value')],
        ...pnlLines.map((l): CsvRow => [l.label, l.amount]),
      ];
    } else if (active === 'service-margin' && marginQ.data) {
      const m = marginQ.data;
      body = [
        [t('reports.col.service'), t('reports.col.completed'), t('reports.col.revenue'), t('reports.fin.cogs'), t('reports.fin.grossMargin'), t('reports.fin.marginPct')],
        ...m.rows.map((r): CsvRow => [r.serviceName, r.completed, r.revenue, r.cogs, r.grossMargin, `${(r.marginPct * 100).toFixed(1)}%`]),
        [t('reports.total'), m.totals.completed, m.totals.revenue, m.totals.cogs, m.totals.grossMargin, `${(m.totals.marginPct * 100).toFixed(1)}%`],
      ];
    } else if (active === 'stock-valuation' && valuationQ.data) {
      const v = valuationQ.data;
      body = [
        [t('reports.inv.asOf'), v.asOf],
        [],
        ...categoryGroupsCsv('valuation', v.groups, t),
        [t('reports.inv.product'), t('reports.inv.sku'), t('reports.col.branch'), t('reports.inv.qty'), t('reports.inv.unit'), t('reports.inv.avgCost'), t('reports.inv.value'), t('reports.inv.fallback')],
        ...v.rows.map((r): CsvRow => [r.productName, r.sku, r.branchName, r.qty, r.unit, r.avgCost, r.value, r.fallbackUsed ? `${r.fallbackRows} @ ${r.fallbackCost ?? ''}` : '']),
        [t('reports.total'), '', '', '', '', '', v.totals.value, v.totals.fallbackProducts || ''],
      ];
    } else if (active === 'shrinkage' && shrinkQ.data) {
      const d = shrinkQ.data;
      body = [
        [t('reports.inv.reason'), t('reports.inv.events'), t('reports.inv.qty'), t('reports.inv.lossValue')],
        ...d.byReason.map((r): CsvRow => [t(`inventory.adjReason.${r.reason}`), r.count, r.qty, r.value]),
        [t('reports.total'), d.totals.count, '', d.totals.value],
        [],
        [t('reports.inv.product'), t('reports.inv.sku'), t('reports.col.branch'), t('reports.inv.events'), t('reports.inv.qty'), t('reports.inv.unit'), t('reports.inv.lossValue')],
        ...d.byProduct.map((r): CsvRow => [r.productName, r.sku, r.branchName, r.count, r.qty, r.unit, r.value]),
      ];
    } else if (active === 'inventory-turnover' && turnoverQ.data) {
      const d = turnoverQ.data;
      body = [
        [t('reports.inv.days'), d.days],
        [],
        ...categoryGroupsCsv('turnover', d.groups, t),
        [t('reports.inv.product'), t('reports.inv.sku'), t('reports.col.branch'), t('reports.fin.cogs'), t('reports.inv.openingValue'), t('reports.inv.closingValue'), t('reports.inv.avgValue'), t('reports.inv.turnover'), t('reports.inv.daysOnHand')],
        ...d.rows.map((r): CsvRow => [r.productName, r.sku, r.branchName, r.cogs, r.openingValue, r.closingValue, r.avgValue, r.turnover, r.daysOnHand ?? '']),
        [t('reports.total'), '', '', d.totals.cogs, d.totals.openingValue, d.totals.closingValue, d.totals.avgValue, d.totals.turnover, d.totals.daysOnHand ?? ''],
      ];
    } else if (active === 'stock-aging' && agingQ.data) {
      const d = agingQ.data;
      body = [
        [t('reports.inv.bucket'), t('reports.inv.lines'), t('reports.inv.qty'), t('reports.inv.value')],
        ...d.buckets.map((b): CsvRow => [t('reports.inv.bucketDays', { range: b.bucket }), b.lines, b.qty, b.value]),
        [],
        ...categoryGroupsCsv('aging', d.groups, t),
        [t('reports.inv.product'), t('reports.inv.sku'), t('reports.col.branch'), t('reports.inv.lot'), t('reports.inv.receivedAt'), t('reports.inv.ageDays'), t('reports.inv.qty'), t('reports.inv.unit'), t('reports.inv.value')],
        ...d.rows.map((r): CsvRow => [r.productName, r.sku, r.branchName, r.lotNumber ?? '', r.receivedAt.slice(0, 10), r.ageDays, r.qty, r.unit, r.value]),
      ];
    } else if (active === 'service-usage' && usageQ.data) {
      const d = usageQ.data;
      body = [
        [t('reports.col.service'), t('reports.inv.appointments'), t('reports.inv.value'), t('reports.inv.perAppointment')],
        ...d.byService.map((r): CsvRow => [r.serviceName, r.appointments, r.value, r.valuePerAppointment]),
        [],
        [t('reports.col.service'), t('reports.inv.product'), t('reports.inv.appointments'), t('reports.inv.qty'), t('reports.inv.unit'), t('reports.inv.perAppointment'), t('reports.inv.value')],
        ...d.rows.map((r): CsvRow => [r.serviceName, r.productName, r.appointments, r.qty, r.unit, r.qtyPerAppointment, r.value]),
      ];
    } else if (active === 'abc-analysis' && abcQ.data) {
      body = abcCsv(abcQ.data, t);
    } else if (active === 'retail-margin' && retailQ.data) {
      const m = retailQ.data;
      body = [
        [t('reports.inv.product'), t('reports.inv.sku'), t('reports.retail.qtySold'), t('reports.retail.qtyReturned'), t('reports.col.revenue'), t('reports.fin.cogs'), t('reports.fin.grossMargin'), t('reports.fin.marginPct')],
        ...m.rows.map((r): CsvRow => [r.productName, r.sku, r.qtySold, r.qtyReturned, r.revenue, r.cogs, r.grossMargin, `${(r.marginPct * 100).toFixed(1)}%`]),
        [t('reports.total'), '', m.totals.qtySold, m.totals.qtyReturned, m.totals.revenue, m.totals.cogs, m.totals.grossMargin, `${(m.totals.marginPct * 100).toFixed(1)}%`],
      ];
    }
    const stamp = active === 'end-of-day' ? date : new Date().toISOString().slice(0, 10);
    downloadCsv(`${active}-${stamp}`, [
      [t('reports.businessName'), t('reports.title'), meta.label],
      [t('reports.branch'), branchName],
      [],
      ...body,
    ]);
  }

  const kpi = (p: {
    label: string;
    value: ReactNode;
    icon: LucideIcon;
    tone: StatTone;
    sub?: string;
    loading?: boolean;
    index: number;
  }) => (
    <ReportStatCard
      label={p.label}
      value={p.value}
      icon={<p.icon className="h-4 w-4" aria-hidden="true" />}
      tone={p.tone}
      sub={p.sub}
      loading={p.loading}
      index={p.index}
    />
  );

  function renderBody(): ReactNode {
    if (active === 'end-of-day') {
      const tot = eod?.totals;
      const svcTotal = eod?.topServices.reduce((s, x) => s + x.count, 0) ?? 0;
      const revTotal = eod?.topServices.reduce((s, x) => s + x.revenue, 0) ?? 0;
      const avgTicket = tot && tot.completed ? Math.round(tot.revenue / tot.completed) : 0;
      const closeRate =
        tot && tot.completed + tot.cancelled > 0
          ? Math.round((tot.completed / (tot.completed + tot.cancelled)) * 100)
          : 0;
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.bookings'), value: tot?.bookings ?? '—', icon: CalendarCheck, tone: 'primary', loading: eodLoading, index: 0 })}
            {kpi({ label: t('reports.completed'), value: tot?.completed ?? '—', icon: ListChecks, tone: 'success', loading: eodLoading, index: 1 })}
            {kpi({ label: t('reports.revenue'), value: tot ? formatCurrency(tot.revenue) : '—', icon: CalendarDays, tone: 'info', loading: eodLoading, index: 2 })}
            {kpi({ label: t('reports.deposits'), value: tot ? formatCurrency(tot.deposits) : '—', icon: Timer, tone: 'violet', loading: eodLoading, index: 3 })}
          </KpiRow>

          {tot ? (
            <LedgerTable
              rows={[
                { k: t('status.CANCELLED'), v: String(tot.cancelled) },
                { k: t('reports.std.walkIns'), v: String(tot.walkIns) },
                { k: t('reports.kpi.avgTicket'), v: formatCurrency(avgTicket) },
                { k: t('reports.kpi.completionRate'), v: `${closeRate}%` },
              ]}
              rowKey={(r) => r.k}
              columns={[
                { key: 'k', label: t('reports.metric'), render: (r) => r.k },
                { key: 'v', label: t('reports.value'), align: 'right', render: (r) => r.v },
              ]}
            />
          ) : null}

          <TableWrap title={t('reports.topServices')}>
            {eodLoading || !eod ? (
              <Skeleton className="h-40 w-full" />
            ) : eod.topServices.length === 0 ? (
              <Empty label={t('reports.empty')} />
            ) : (
              <LedgerTable
                rows={eod.topServices}
                rowKey={(r) => r.name}
                columns={[
                  { key: 'name', label: t('reports.col.service'), render: (r) => <span className="font-medium">{r.name}</span>, sortValue: (r) => r.name },
                  { key: 'count', label: t('reports.col.count'), align: 'right', render: (r) => r.count, sortValue: (r) => r.count },
                  { key: 'revenue', label: t('reports.col.revenue'), align: 'right', render: (r) => formatCurrency(r.revenue), sortValue: (r) => r.revenue },
                  { key: 'share', label: t('reports.col.share'), align: 'right', render: (r) => `${svcTotal ? Math.round((r.count / svcTotal) * 100) : 0}%` },
                ]}
                total={[t('reports.total'), svcTotal, formatCurrency(revTotal), '100%']}
              />
            )}
          </TableWrap>
        </div>
      );
    }

    if (active === 'sales-by-day') {
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.kpi.revenue'), value: formatCurrency(daily.revenue), icon: CalendarDays, tone: 'primary', sub: win, index: 0 })}
            {kpi({ label: t('reports.kpi.bookings'), value: daily.bookings, icon: CalendarCheck, tone: 'info', sub: win, index: 1 })}
            {kpi({ label: t('reports.col.avgPerDay'), value: formatCurrency(daily.avg), icon: Timer, tone: 'violet', sub: win, index: 2 })}
            {kpi({ label: t('reports.std.bestDay'), value: daily.best ? formatCurrency(daily.best.revenue) : '—', sub: daily.best ? formatDate(daily.best.date) : undefined, icon: ListChecks, tone: 'success', index: 3 })}
          </KpiRow>
          <ReportRevenueBars data={stats?.revenueSeries ?? []} />
          <LedgerTable
            rows={daily.rows}
            rowKey={(r) => r.date}
            defaultSort={{ key: 'date', dir: 'asc' }}
            columns={[
              { key: 'date', label: t('reports.col.date'), render: (r) => formatDate(r.date), sortValue: (r) => r.date },
              { key: 'bookings', label: t('reports.col.bookings'), align: 'right', render: (r) => r.bookings, sortValue: (r) => r.bookings },
              { key: 'revenue', label: t('reports.col.revenue'), align: 'right', render: (r) => formatCurrency(r.revenue), sortValue: (r) => r.revenue },
              { key: 'running', label: t('reports.col.runningTotal'), align: 'right', render: (r) => <span className="text-muted-foreground">{formatCurrency(r.running)}</span> },
            ]}
            total={[t('reports.total'), daily.bookings, formatCurrency(daily.revenue), formatCurrency(daily.revenue)]}
          />
        </div>
      );
    }

    if (active === 'revenue-by-service') {
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.col.count'), value: svc.total, icon: Scissors, tone: 'primary', sub: win, index: 0 })}
            {kpi({ label: t('reports.std.serviceCount'), value: svc.rows.length, icon: ListChecks, tone: 'info', sub: win, index: 1 })}
            {kpi({ label: t('reports.std.topService'), value: svc.top?.name ?? '—', sub: svc.top && svc.total ? `${Math.round((svc.top.value / svc.total) * 100)}%` : undefined, icon: CalendarCheck, tone: 'success', index: 2 })}
          </KpiRow>
          <LedgerTable
            rows={svc.rows}
            rowKey={(r) => r.name}
            empty={t('reports.empty')}
            columns={[
              { key: 'name', label: t('reports.col.service'), render: (r) => <span className="font-medium">{r.name}</span>, sortValue: (r) => r.name },
              {
                key: 'value',
                label: t('reports.col.count'),
                align: 'right',
                render: (r) => (
                  <span className="inline-flex items-center justify-end">
                    {r.value}
                    <CellBar value={r.value} max={svc.max} />
                  </span>
                ),
                sortValue: (r) => r.value,
              },
              { key: 'share', label: t('reports.col.share'), align: 'right', render: (r) => `${svc.total ? Math.round((r.value / svc.total) * 100) : 0}%`, sortValue: (r) => r.value },
            ]}
            total={[t('reports.total'), svc.total, '100%']}
          />
        </div>
      );
    }

    if (active === 'staff-performance') {
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.std.staffCount'), value: staff.rows.length, icon: Users, tone: 'primary', sub: win, index: 0 })}
            {kpi({ label: t('reports.col.completed'), value: staff.completed, icon: ListChecks, tone: 'success', sub: win, index: 1 })}
            {kpi({ label: t('reports.col.revenue'), value: formatCurrency(staff.revenue), icon: CalendarDays, tone: 'info', sub: win, index: 2 })}
            {kpi({ label: t('reports.kpi.avgTicket'), value: formatCurrency(staff.completed ? Math.round(staff.revenue / staff.completed) : 0), icon: Timer, tone: 'violet', sub: win, index: 3 })}
          </KpiRow>
          <LedgerTable
            rows={staff.rows}
            rowKey={(r) => r.name}
            empty={t('reports.empty')}
            columns={[
              { key: 'name', label: t('reports.col.staff'), render: (r) => <span className="font-medium">{r.name}</span>, sortValue: (r) => r.name },
              { key: 'completed', label: t('reports.col.completed'), align: 'right', render: (r) => r.completed, sortValue: (r) => r.completed },
              { key: 'revenue', label: t('reports.col.revenue'), align: 'right', render: (r) => formatCurrency(r.revenue), sortValue: (r) => r.revenue },
              {
                key: 'avg',
                label: t('reports.col.perVisit'),
                align: 'right',
                render: (r) => <span className="text-muted-foreground">{formatCurrency(r.completed ? Math.round(r.revenue / r.completed) : 0)}</span>,
                sortValue: (r) => (r.completed ? r.revenue / r.completed : 0),
              },
            ]}
            total={[t('reports.total'), staff.completed, formatCurrency(staff.revenue), '']}
          />
        </div>
      );
    }

    if (active === 'branch-performance') {
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.std.branchCount'), value: branch.rows.length, icon: Building2, tone: 'primary', sub: win, index: 0 })}
            {kpi({ label: t('reports.col.revenue'), value: formatCurrency(branch.revenue), icon: CalendarDays, tone: 'info', sub: win, index: 1 })}
            {kpi({ label: t('reports.col.bookings'), value: branch.bookings, icon: CalendarCheck, tone: 'success', sub: win, index: 2 })}
          </KpiRow>
          <LedgerTable
            rows={branch.rows}
            rowKey={(r) => r.name}
            empty={t('reports.empty')}
            columns={[
              { key: 'name', label: t('reports.col.branch'), render: (r) => <span className="font-medium">{r.name}</span>, sortValue: (r) => r.name },
              { key: 'bookings', label: t('reports.col.bookings'), align: 'right', render: (r) => r.bookings, sortValue: (r) => r.bookings },
              { key: 'revenue', label: t('reports.col.revenue'), align: 'right', render: (r) => formatCurrency(r.revenue), sortValue: (r) => r.revenue },
              { key: 'share', label: t('reports.col.share'), align: 'right', render: (r) => `${branch.revenue ? Math.round((r.revenue / branch.revenue) * 100) : 0}%`, sortValue: (r) => r.revenue },
            ]}
            total={[t('reports.total'), branch.bookings, formatCurrency(branch.revenue), '100%']}
          />
        </div>
      );
    }

    if (active === 'status') {
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.kpi.completionRate'), value: `${status.rate}%`, icon: ListChecks, tone: 'success', sub: win, index: 0 })}
            {kpi({ label: t('reports.kpi.cancellations'), value: status.cancel, icon: Timer, tone: 'violet', sub: win, index: 1 })}
            {kpi({ label: t('reports.col.count'), value: status.total, icon: CalendarCheck, tone: 'primary', sub: win, index: 2 })}
          </KpiRow>
          {status.rows.length === 0 ? <Empty label={t('reports.empty')} /> : <StatusStackBar data={status.rows} />}
        </div>
      );
    }

    if (active === 'peak-hours') {
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.col.count'), value: hours.total, icon: CalendarCheck, tone: 'primary', sub: today, index: 0 })}
            {kpi({
              label: t('reports.std.peakHour'),
              value: hours.peak && hours.peak.count > 0 ? `${String(hours.peak.hour).padStart(2, '0')}:00` : '—',
              sub: hours.peak && hours.peak.count > 0 ? t('reports.countItems', { count: hours.peak.count }) : undefined,
              icon: Clock,
              tone: 'info',
              index: 1,
            })}
          </KpiRow>
          {hours.total === 0 ? (
            <Empty label={t('reports.empty')} />
          ) : (
            <>
              <HourHistogram data={hours.rows} />
              <LedgerTable
                rows={hours.rows.filter((h) => h.count > 0)}
                rowKey={(r) => String(r.hour)}
                columns={[
                  { key: 'hour', label: t('reports.col.hour'), render: (r) => `${String(r.hour).padStart(2, '0')}:00` },
                  { key: 'count', label: t('reports.col.count'), align: 'right', render: (r) => r.count, sortValue: (r) => r.count },
                  { key: 'share', label: t('reports.col.share'), align: 'right', render: (r) => `${hours.total ? Math.round((r.count / hours.total) * 100) : 0}%` },
                ]}
                total={[t('reports.total'), hours.total, '100%']}
              />
            </>
          )}
        </div>
      );
    }

    if (active === 'channel' && stats) {
      const booked = Math.max(0, stats.bookingsToday - stats.walkinsToday);
      const inStore = Math.max(0, stats.bookingsToday - stats.homeServiceToday);
      const rate = Math.round(stats.walkinRate14d * 100);
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.channel.walkInRate', { pct: rate }), value: `${rate}%`, icon: Split, tone: 'primary', sub: win, index: 0 })}
            {kpi({ label: t('reports.channel.walkIn'), value: stats.walkinsToday, icon: Users, tone: 'info', sub: today, index: 1 })}
            {kpi({ label: t('reports.channel.homeService'), value: stats.homeServiceToday, icon: Building2, tone: 'violet', sub: today, index: 2 })}
          </KpiRow>
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
                {t('reports.channel.bookingType')}
              </p>
              <SplitMeter
                ariaLabel={t('reports.channel.bookingType')}
                parts={[
                  { label: t('reports.channel.booked'), value: booked, color: 'hsl(var(--info))' },
                  { label: t('reports.channel.walkIn'), value: stats.walkinsToday, color: 'hsl(var(--chart-2))' },
                ]}
              />
            </div>
            <div>
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">
                {t('reports.channel.delivery')}
              </p>
              <SplitMeter
                ariaLabel={t('reports.channel.delivery')}
                parts={[
                  { label: t('reports.channel.inStore'), value: inStore, color: 'hsl(var(--primary))' },
                  { label: t('reports.channel.homeService'), value: stats.homeServiceToday, color: 'hsl(var(--chart-3))' },
                ]}
              />
            </div>
          </div>
        </div>
      );
    }

    if (active === 'queue' && stats) {
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.queue.waiting'), value: stats.queueWaiting, icon: Timer, tone: 'primary', sub: today, index: 0 })}
            {kpi({ label: t('reports.queue.longestWait'), value: t('reports.minutes', { count: stats.queueLongestWaitMin }), icon: Clock, tone: 'violet', sub: today, index: 1 })}
          </KpiRow>
          <LedgerTable
            rows={[
              { k: t('reports.queue.waiting'), v: String(stats.queueWaiting) },
              { k: t('reports.queue.inService'), v: String(stats.queueInService) },
              { k: t('reports.queue.called'), v: String(stats.queueCalled) },
              { k: t('reports.queue.longestWait'), v: t('reports.minutes', { count: stats.queueLongestWaitMin }) },
              { k: t('reports.queue.nextNumber'), v: stats.queueNextNumber ?? '—' },
            ]}
            rowKey={(r) => r.k}
            columns={[
              { key: 'k', label: t('reports.metric'), render: (r) => r.k },
              { key: 'v', label: t('reports.value'), align: 'right', render: (r) => r.v },
            ]}
          />
        </div>
      );
    }

    if (active === 'profit-loss') {
      const p = pnlQ.data;
      if (pnlQ.isError) return <Empty label={t('reports.fin.noAccess')} />;
      if (!p) return <Skeleton className="h-56 w-full" />;
      const pct = (n: number) => (p.netRevenue > 0 ? `${Math.round((n / p.netRevenue) * 1000) / 10}%` : '—');
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.fin.netRevenue'), value: formatCurrency(p.netRevenue), icon: CalendarDays, tone: 'primary', index: 0 })}
            {kpi({ label: t('reports.fin.cogs'), value: formatCurrency(p.cogs), icon: Scissors, tone: 'violet', sub: t('reports.fin.cogsSub'), index: 1 })}
            {kpi({ label: t('reports.fin.grossProfit'), value: formatCurrency(p.grossProfit), icon: Scale, tone: 'info', sub: pct(p.grossProfit), index: 2 })}
            {kpi({ label: t('reports.fin.netProfit'), value: formatCurrency(p.netProfit), icon: ListChecks, tone: p.netProfit >= 0 ? 'success' : 'violet', sub: pct(p.netProfit), index: 3 })}
          </KpiRow>
          <LedgerTable
            rows={pnlLines}
            rowKey={(r) => r.k}
            columns={[
              {
                key: 'label',
                label: t('reports.metric'),
                render: (r) => (
                  <span
                    className={cn(
                      r.kind === 'sub' ? 'font-semibold text-foreground' : r.kind === 'memo' ? 'pl-6 text-xs italic text-muted-foreground' : 'pl-3 text-muted-foreground',
                    )}
                  >
                    {r.label}
                  </span>
                ),
              },
              {
                key: 'amount',
                label: t('reports.value'),
                align: 'right',
                render: (r) => (
                  <span className={cn(r.kind === 'sub' && 'font-semibold', r.amount < 0 && 'text-destructive')}>
                    {formatCurrency(r.amount)}
                  </span>
                ),
              },
              { key: 'share', label: t('reports.col.share'), align: 'right', render: (r) => <span className="text-muted-foreground">{pct(Math.abs(r.amount))}</span> },
            ]}
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t('reports.fin.pnlNote')}</p>
        </div>
      );
    }

    if (active === 'service-margin') {
      const m = marginQ.data;
      if (marginQ.isError) return <Empty label={t('reports.fin.noAccess')} />;
      if (!m) return <Skeleton className="h-56 w-full" />;
      const maxRev = Math.max(1, ...m.rows.map((r) => r.revenue));
      const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.col.revenue'), value: formatCurrency(m.totals.revenue), icon: CalendarDays, tone: 'primary', index: 0 })}
            {kpi({ label: t('reports.fin.cogs'), value: formatCurrency(m.totals.cogs), icon: Scissors, tone: 'violet', index: 1 })}
            {kpi({ label: t('reports.fin.grossMargin'), value: formatCurrency(m.totals.grossMargin), icon: Scale, tone: 'success', sub: fmtPct(m.totals.marginPct), index: 2 })}
            {kpi({ label: t('reports.col.completed'), value: m.totals.completed, icon: ListChecks, tone: 'info', index: 3 })}
          </KpiRow>
          <LedgerTable
            rows={m.rows}
            rowKey={(r) => r.serviceId}
            empty={t('reports.empty')}
            defaultSort={{ key: 'revenue', dir: 'desc' }}
            columns={[
              { key: 'name', label: t('reports.col.service'), render: (r) => <span className="font-medium">{r.serviceName}</span>, sortValue: (r) => r.serviceName },
              { key: 'completed', label: t('reports.col.completed'), align: 'right', render: (r) => r.completed, sortValue: (r) => r.completed },
              {
                key: 'revenue',
                label: t('reports.col.revenue'),
                align: 'right',
                render: (r) => (
                  <span className="inline-flex items-center justify-end">
                    {formatCurrency(r.revenue)}
                    <CellBar value={r.revenue} max={maxRev} />
                  </span>
                ),
                sortValue: (r) => r.revenue,
              },
              { key: 'cogs', label: t('reports.fin.cogs'), align: 'right', render: (r) => <span className="text-muted-foreground">{formatCurrency(r.cogs)}</span>, sortValue: (r) => r.cogs },
              { key: 'margin', label: t('reports.fin.grossMargin'), align: 'right', render: (r) => formatCurrency(r.grossMargin), sortValue: (r) => r.grossMargin },
              {
                key: 'pct',
                label: t('reports.fin.marginPct'),
                align: 'right',
                render: (r) => <span className={cn(r.marginPct < 0.5 && 'text-destructive')}>{fmtPct(r.marginPct)}</span>,
                sortValue: (r) => r.marginPct,
              },
            ]}
            total={[
              t('reports.total'),
              m.totals.completed,
              formatCurrency(m.totals.revenue),
              formatCurrency(m.totals.cogs),
              formatCurrency(m.totals.grossMargin),
              fmtPct(m.totals.marginPct),
            ]}
          />
        </div>
      );
    }

    if (active === 'retail-margin') {
      const m = retailQ.data;
      if (retailQ.isError) return <Empty label={t('reports.fin.noAccess')} />;
      if (!m) return <Skeleton className="h-56 w-full" />;
      const maxRev = Math.max(1, ...m.rows.map((r) => r.revenue));
      const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.col.revenue'), value: formatCurrency(m.totals.revenue), icon: CalendarDays, tone: 'primary', sub: t('reports.retail.exVat'), index: 0 })}
            {kpi({ label: t('reports.fin.cogs'), value: formatCurrency(m.totals.cogs), icon: Boxes, tone: 'violet', index: 1 })}
            {kpi({ label: t('reports.fin.grossMargin'), value: formatCurrency(m.totals.grossMargin), icon: Scale, tone: 'success', sub: fmtPct(m.totals.marginPct), index: 2 })}
            {kpi({ label: t('reports.retail.sales'), value: m.totals.saleCount, icon: ShoppingBag, tone: 'info', index: 3 })}
          </KpiRow>
          <LedgerTable
            rows={m.rows}
            rowKey={(r) => r.productId}
            empty={t('reports.empty')}
            defaultSort={{ key: 'margin', dir: 'desc' }}
            columns={[
              {
                key: 'name',
                label: t('reports.inv.product'),
                render: (r) => (
                  <span>
                    <span className="font-medium">{r.productName}</span>
                    <span className="block text-[11px] text-muted-foreground">{r.sku}</span>
                  </span>
                ),
                sortValue: (r) => r.productName,
              },
              { key: 'qty', label: t('reports.retail.netQty'), align: 'right', render: (r) => `${r.netQty.toLocaleString()} ${r.unit}`, sortValue: (r) => r.netQty },
              {
                key: 'revenue',
                label: t('reports.col.revenue'),
                align: 'right',
                render: (r) => (
                  <span className="inline-flex items-center justify-end">
                    {formatCurrency(r.revenue)}
                    <CellBar value={r.revenue} max={maxRev} />
                  </span>
                ),
                sortValue: (r) => r.revenue,
              },
              { key: 'cogs', label: t('reports.fin.cogs'), align: 'right', render: (r) => <span className="text-muted-foreground">{formatCurrency(r.cogs)}</span>, sortValue: (r) => r.cogs },
              { key: 'margin', label: t('reports.fin.grossMargin'), align: 'right', render: (r) => formatCurrency(r.grossMargin), sortValue: (r) => r.grossMargin },
              {
                key: 'pct',
                label: t('reports.fin.marginPct'),
                align: 'right',
                render: (r) => <span className={cn(r.marginPct < 0.2 && 'text-destructive')}>{fmtPct(r.marginPct)}</span>,
                sortValue: (r) => r.marginPct,
              },
            ]}
            total={[
              t('reports.total'),
              m.totals.qtySold - m.totals.qtyReturned,
              formatCurrency(m.totals.revenue),
              formatCurrency(m.totals.cogs),
              formatCurrency(m.totals.grossMargin),
              fmtPct(m.totals.marginPct),
            ]}
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t('reports.retail.note')}</p>
        </div>
      );
    }

    if (active === 'stock-valuation') {
      const v = valuationQ.data;
      if (valuationQ.isError) return <Empty label={t('reports.fin.noAccess')} />;
      if (!v) return <Skeleton className="h-56 w-full" />;
      const maxVal = Math.max(1, ...v.rows.map((r) => r.value));
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.inv.totalValue'), value: formatCurrency(v.totals.value), icon: Boxes, tone: 'primary', sub: formatDate(v.asOf), index: 0 })}
            {kpi({ label: t('reports.inv.products'), value: v.totals.products, icon: ListChecks, tone: 'info', index: 1 })}
            {kpi({ label: t('reports.inv.fallbackProducts'), value: v.totals.fallbackProducts, icon: Scale, tone: v.totals.fallbackProducts ? 'violet' : 'success', sub: t('reports.inv.fallbackSub'), index: 2 })}
          </KpiRow>
          {v.groups ? <CategoryGroupsTable kind="valuation" groups={v.groups} t={t} /> : null}
          <LedgerTable
            rows={v.rows}
            rowKey={(r) => r.productId}
            empty={t('reports.empty')}
            defaultSort={{ key: 'value', dir: 'desc' }}
            columns={[
              {
                key: 'name',
                label: t('reports.inv.product'),
                render: (r) => (
                  <span>
                    <span className="font-medium">{r.productName}</span>
                    <span className="block text-[11px] text-muted-foreground">{r.sku} · {r.branchName}</span>
                  </span>
                ),
                sortValue: (r) => r.productName,
              },
              { key: 'qty', label: t('reports.inv.qty'), align: 'right', render: (r) => `${r.qty.toLocaleString()} ${r.unit}`, sortValue: (r) => r.qty },
              { key: 'avg', label: t('reports.inv.avgCost'), align: 'right', render: (r) => <span className="text-muted-foreground">{formatCurrency(r.avgCost)}</span>, sortValue: (r) => r.avgCost },
              {
                key: 'value',
                label: t('reports.inv.value'),
                align: 'right',
                render: (r) => (
                  <span className="inline-flex items-center justify-end">
                    {formatCurrency(r.value)}
                    {r.fallbackUsed ? (
                      <span className="ml-1 text-warning" title={t('reports.inv.fallbackTitle', { rows: r.fallbackRows, cost: formatCurrency(r.fallbackCost ?? 0) })}>
                        *
                      </span>
                    ) : null}
                    <CellBar value={Math.max(0, r.value)} max={maxVal} />
                  </span>
                ),
                sortValue: (r) => r.value,
              },
            ]}
            total={[t('reports.total'), '', '', formatCurrency(v.totals.value)]}
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t('reports.inv.valuationNote')}</p>
        </div>
      );
    }

    if (active === 'shrinkage') {
      const d = shrinkQ.data;
      if (shrinkQ.isError) return <Empty label={t('reports.fin.noAccess')} />;
      if (!d) return <Skeleton className="h-56 w-full" />;
      const maxReason = Math.max(1, ...d.byReason.map((r) => r.value));
      const top = d.byReason[0];
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.inv.lossValue'), value: formatCurrency(d.totals.value), icon: TrendingDown, tone: 'violet', index: 0 })}
            {kpi({ label: t('reports.inv.events'), value: d.totals.count, icon: ListChecks, tone: 'info', index: 1 })}
            {kpi({ label: t('reports.inv.topReason'), value: top ? t(`inventory.adjReason.${top.reason}`) : '—', sub: top ? formatCurrency(top.value) : undefined, icon: Scale, tone: 'primary', index: 2 })}
          </KpiRow>
          <TableWrap title={t('reports.inv.byReason')}>
            <LedgerTable
              rows={d.byReason}
              rowKey={(r) => r.reason}
              empty={t('reports.empty')}
              columns={[
                { key: 'reason', label: t('reports.inv.reason'), render: (r) => <span className="font-medium">{t(`inventory.adjReason.${r.reason}`)}</span> },
                { key: 'count', label: t('reports.inv.events'), align: 'right', render: (r) => r.count, sortValue: (r) => r.count },
                { key: 'qty', label: t('reports.inv.qty'), align: 'right', render: (r) => r.qty.toLocaleString(), sortValue: (r) => r.qty },
                {
                  key: 'value',
                  label: t('reports.inv.lossValue'),
                  align: 'right',
                  render: (r) => (
                    <span className="inline-flex items-center justify-end">
                      {formatCurrency(r.value)}
                      <CellBar value={r.value} max={maxReason} />
                    </span>
                  ),
                  sortValue: (r) => r.value,
                },
              ]}
              total={[t('reports.total'), d.totals.count, '', formatCurrency(d.totals.value)]}
            />
          </TableWrap>
          <TableWrap title={t('reports.inv.byProduct')}>
            <LedgerTable
              rows={d.byProduct}
              rowKey={(r) => r.productId}
              empty={t('reports.empty')}
              defaultSort={{ key: 'value', dir: 'desc' }}
              columns={[
                {
                  key: 'name',
                  label: t('reports.inv.product'),
                  render: (r) => (
                    <span>
                      <span className="font-medium">{r.productName}</span>
                      <span className="block text-[11px] text-muted-foreground">{r.sku} · {r.branchName}</span>
                    </span>
                  ),
                  sortValue: (r) => r.productName,
                },
                { key: 'count', label: t('reports.inv.events'), align: 'right', render: (r) => r.count, sortValue: (r) => r.count },
                { key: 'qty', label: t('reports.inv.qty'), align: 'right', render: (r) => `${r.qty.toLocaleString()} ${r.unit}`, sortValue: (r) => r.qty },
                { key: 'value', label: t('reports.inv.lossValue'), align: 'right', render: (r) => formatCurrency(r.value), sortValue: (r) => r.value },
              ]}
            />
          </TableWrap>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t('reports.inv.shrinkageNote')}</p>
        </div>
      );
    }

    if (active === 'inventory-turnover') {
      const d = turnoverQ.data;
      if (turnoverQ.isError) return <Empty label={t('reports.fin.noAccess')} />;
      if (!d) return <Skeleton className="h-56 w-full" />;
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.inv.turnover'), value: `${d.totals.turnover}×`, sub: t('reports.inv.daysWindow', { days: d.days }), icon: RefreshCw, tone: 'primary', index: 0 })}
            {kpi({ label: t('reports.inv.daysOnHand'), value: d.totals.daysOnHand ?? '—', icon: Hourglass, tone: 'info', index: 1 })}
            {kpi({ label: t('reports.fin.cogs'), value: formatCurrency(d.totals.cogs), icon: TrendingDown, tone: 'violet', index: 2 })}
            {kpi({ label: t('reports.inv.avgValue'), value: formatCurrency(d.totals.avgValue), icon: Boxes, tone: 'success', index: 3 })}
          </KpiRow>
          {d.groups ? <CategoryGroupsTable kind="turnover" groups={d.groups} t={t} /> : null}
          <TableWrap title={t('reports.inv.byProduct')}>
            <LedgerTable
              rows={d.rows}
              rowKey={(r) => r.productId}
              empty={t('reports.empty')}
              defaultSort={{ key: 'cogs', dir: 'desc' }}
              columns={[
                {
                  key: 'name',
                  label: t('reports.inv.product'),
                  render: (r) => (
                    <span>
                      <span className="font-medium">{r.productName}</span>
                      <span className="block text-[11px] text-muted-foreground">{r.sku} · {r.branchName}</span>
                    </span>
                  ),
                  sortValue: (r) => r.productName,
                },
                { key: 'cogs', label: t('reports.fin.cogs'), align: 'right', render: (r) => formatCurrency(r.cogs), sortValue: (r) => r.cogs },
                { key: 'avg', label: t('reports.inv.avgValue'), align: 'right', render: (r) => formatCurrency(r.avgValue), sortValue: (r) => r.avgValue },
                { key: 'turn', label: t('reports.inv.turnover'), align: 'right', render: (r) => `${r.turnover}×`, sortValue: (r) => r.turnover },
                { key: 'doh', label: t('reports.inv.daysOnHand'), align: 'right', render: (r) => r.daysOnHand ?? '—', sortValue: (r) => r.daysOnHand ?? Number.MAX_SAFE_INTEGER },
              ]}
              total={[t('reports.total'), formatCurrency(d.totals.cogs), formatCurrency(d.totals.avgValue), `${d.totals.turnover}×`, d.totals.daysOnHand ?? '—']}
            />
          </TableWrap>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t('reports.inv.turnoverNote')}</p>
        </div>
      );
    }

    if (active === 'stock-aging') {
      const d = agingQ.data;
      if (agingQ.isError) return <Empty label={t('reports.fin.noAccess')} />;
      if (!d) return <Skeleton className="h-56 w-full" />;
      const maxBucket = Math.max(1, ...d.buckets.map((b) => b.value));
      const old = d.buckets.find((b) => b.bucket === '90+');
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.inv.value'), value: formatCurrency(d.totals.value), icon: Boxes, tone: 'primary', index: 0 })}
            {kpi({ label: t('reports.inv.lines'), value: d.totals.lines, icon: ListChecks, tone: 'info', index: 1 })}
            {kpi({ label: t('reports.inv.over90'), value: formatCurrency(old?.value ?? 0), icon: Hourglass, tone: 'violet', index: 2 })}
          </KpiRow>
          {d.groups ? <CategoryGroupsTable kind="aging" groups={d.groups} t={t} /> : null}
          <TableWrap title={t('reports.inv.byBucket')}>
            <LedgerTable
              rows={d.buckets}
              rowKey={(r) => r.bucket}
              columns={[
                { key: 'bucket', label: t('reports.inv.bucket'), render: (r) => <span className="font-medium">{t('reports.inv.bucketDays', { range: r.bucket })}</span> },
                { key: 'lines', label: t('reports.inv.lines'), align: 'right', render: (r) => r.lines },
                { key: 'qty', label: t('reports.inv.qty'), align: 'right', render: (r) => r.qty.toLocaleString() },
                {
                  key: 'value',
                  label: t('reports.inv.value'),
                  align: 'right',
                  render: (r) => (
                    <span className="inline-flex items-center justify-end">
                      {formatCurrency(r.value)}
                      <CellBar value={r.value} max={maxBucket} />
                    </span>
                  ),
                },
              ]}
              total={[t('reports.total'), d.totals.lines, d.totals.qty.toLocaleString(), formatCurrency(d.totals.value)]}
            />
          </TableWrap>
          <TableWrap title={t('reports.inv.byProduct')}>
            <LedgerTable
              rows={d.rows}
              rowKey={(r, i) => `${r.productId}-${r.lotNumber ?? '-'}-${i}`}
              empty={t('reports.empty')}
              defaultSort={{ key: 'age', dir: 'desc' }}
              columns={[
                {
                  key: 'name',
                  label: t('reports.inv.product'),
                  render: (r) => (
                    <span>
                      <span className="font-medium">{r.productName}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {r.sku} · {r.branchName}
                        {r.lotNumber ? ` · ${t('reports.inv.lot')} ${r.lotNumber}` : ''}
                      </span>
                    </span>
                  ),
                  sortValue: (r) => r.productName,
                },
                {
                  key: 'age',
                  label: t('reports.inv.ageDays'),
                  align: 'right',
                  render: (r) => (
                    <span title={t(`reports.inv.ageSource.${r.ageSource}`)}>
                      {r.ageDays} · {formatDate(r.receivedAt)}
                    </span>
                  ),
                  sortValue: (r) => r.ageDays,
                },
                { key: 'qty', label: t('reports.inv.qty'), align: 'right', render: (r) => `${r.qty.toLocaleString()} ${r.unit}`, sortValue: (r) => r.qty },
                { key: 'value', label: t('reports.inv.value'), align: 'right', render: (r) => formatCurrency(r.value), sortValue: (r) => r.value },
              ]}
            />
          </TableWrap>
        </div>
      );
    }

    if (active === 'abc-analysis') {
      const d = abcQ.data;
      if (abcQ.isError) return <Empty label={t('reports.fin.noAccess')} />;
      if (!d) return <Skeleton className="h-56 w-full" />;
      return <AbcReportBody d={d} t={t} />;
    }

    if (active === 'service-usage') {
      const d = usageQ.data;
      if (usageQ.isError) return <Empty label={t('reports.fin.noAccess')} />;
      if (!d) return <Skeleton className="h-56 w-full" />;
      const maxSvc = Math.max(1, ...d.byService.map((r) => r.value));
      return (
        <div className="space-y-4">
          <KpiRow>
            {kpi({ label: t('reports.inv.value'), value: formatCurrency(d.totals.value), icon: FlaskConical, tone: 'primary', index: 0 })}
            {kpi({ label: t('reports.inv.appointments'), value: d.totals.appointments, icon: ListChecks, tone: 'info', index: 1 })}
            {kpi({
              label: t('reports.inv.perAppointment'),
              value: formatCurrency(d.totals.appointments ? Math.round(d.totals.value / d.totals.appointments) : 0),
              icon: Scale,
              tone: 'violet',
              index: 2,
            })}
          </KpiRow>
          <TableWrap title={t('reports.inv.byService')}>
            <LedgerTable
              rows={d.byService}
              rowKey={(r) => r.serviceId}
              empty={t('reports.empty')}
              defaultSort={{ key: 'value', dir: 'desc' }}
              columns={[
                { key: 'name', label: t('reports.col.service'), render: (r) => <span className="font-medium">{r.serviceName}</span>, sortValue: (r) => r.serviceName },
                { key: 'appts', label: t('reports.inv.appointments'), align: 'right', render: (r) => r.appointments, sortValue: (r) => r.appointments },
                { key: 'per', label: t('reports.inv.perAppointment'), align: 'right', render: (r) => formatCurrency(r.valuePerAppointment), sortValue: (r) => r.valuePerAppointment },
                {
                  key: 'value',
                  label: t('reports.inv.value'),
                  align: 'right',
                  render: (r) => (
                    <span className="inline-flex items-center justify-end">
                      {formatCurrency(r.value)}
                      <CellBar value={r.value} max={maxSvc} />
                    </span>
                  ),
                  sortValue: (r) => r.value,
                },
              ]}
              total={[t('reports.total'), d.totals.appointments, '', formatCurrency(d.totals.value)]}
            />
          </TableWrap>
          <TableWrap title={t('reports.inv.byServiceProduct')}>
            <LedgerTable
              rows={d.rows}
              rowKey={(r) => `${r.serviceId}-${r.productId}`}
              empty={t('reports.empty')}
              columns={[
                {
                  key: 'name',
                  label: t('reports.inv.product'),
                  render: (r) => (
                    <span>
                      <span className="font-medium">{r.productName}</span>
                      <span className="block text-[11px] text-muted-foreground">{r.serviceName}</span>
                    </span>
                  ),
                  sortValue: (r) => `${r.serviceName} ${r.productName}`,
                },
                { key: 'qty', label: t('reports.inv.qty'), align: 'right', render: (r) => `${r.qty.toLocaleString()} ${r.unit}`, sortValue: (r) => r.qty },
                { key: 'per', label: t('reports.inv.perAppointment'), align: 'right', render: (r) => r.qtyPerAppointment.toLocaleString(), sortValue: (r) => r.qtyPerAppointment },
                { key: 'value', label: t('reports.inv.value'), align: 'right', render: (r) => formatCurrency(r.value), sortValue: (r) => r.value },
              ]}
            />
          </TableWrap>
        </div>
      );
    }

    return <Empty label={t('reports.empty')} />;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[248px_1fr]">
      {/* catalogue */}
      <nav
        aria-label={t('reports.std.pick')}
        className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-20 lg:flex-col lg:gap-4 lg:self-start lg:overflow-visible lg:pb-0"
      >
        {CATALOG.map((group) => (
          <div key={group.groupKey} className="lg:space-y-1.5">
            <p className="hidden px-1 text-[10px] font-semibold text-muted-foreground lg:block">
              {t(`reports.std.group.${group.groupKey}`)}
            </p>
            <div className="flex gap-2 lg:flex-col lg:gap-1">
              {group.items.map(({ id, icon: Icon }) => {
                const on = active === id;
                return (
                  <button
                    key={id}
                    ref={(el) => {
                      navRefs.current[id] = el;
                    }}
                    type="button"
                    aria-current={on ? 'true' : undefined}
                    tabIndex={on ? 0 : -1}
                    onClick={() => setActive(id)}
                    onKeyDown={(e) => onNavKey(e, id)}
                    className={cn(
                      'relative flex shrink-0 items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                      on
                        ? 'border-primary/40 bg-primary/[0.07]'
                        : 'border-border hover:border-primary/30 hover:bg-muted/50',
                    )}
                  >
                    {on ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-primary"
                      />
                    ) : null}
                    <Icon
                      className={cn('mt-0.5 h-4 w-4 shrink-0', on ? 'text-primary' : 'text-muted-foreground')}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className={cn('block text-sm font-medium', on ? 'text-primary' : 'text-foreground')}>
                        {t(`reports.std.${camel(id)}`)}
                      </span>
                      <span className="mt-0.5 hidden text-[11px] leading-snug text-muted-foreground lg:block">
                        {t(`reports.std.${camel(id)}Desc`)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* document */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="space-y-4 p-4 sm:p-5" aria-busy={busy}>
          <ReportDocHeader
            title={meta.label}
            desc={meta.desc}
            scope={scope}
            onPrint={() => window.print()}
            onExport={handleExport}
            control={
              <div className="flex flex-wrap items-end gap-2">
                {GROUPABLE_REPORTS.includes(active) ? (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('reports.inv.groupBy')}</label>
                    <Select
                      className="h-9 w-[150px]"
                      value={groupBy}
                      onChange={(e) => setGroupBy(e.target.value as InventoryReportGroupBy)}
                      options={[
                        { value: 'product', label: t('reports.inv.groupProduct') },
                        { value: 'category', label: t('reports.inv.groupCategory') },
                      ]}
                      aria-label={t('reports.inv.groupBy')}
                    />
                  </div>
                ) : null}
                {active === 'abc-analysis' ? (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('reports.inv.abcBasis')}</label>
                    <Select
                      className="h-9 w-[170px]"
                      value={abcBasis}
                      onChange={(e) => setAbcBasis(e.target.value as AbcBasis)}
                      options={[
                        { value: 'consumptionValue', label: t('reports.inv.basis.consumptionValue') },
                        { value: 'stockValue', label: t('reports.inv.basis.stockValue') },
                      ]}
                      aria-label={t('reports.inv.abcBasis')}
                    />
                  </div>
                ) : null}
                {active === 'end-of-day' ? (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      {t('reports.std.date')}
                    </label>
                    <DateField value={date} onChange={setDate} aria-label={t('reports.std.date')} />
                  </div>
                ) : active === 'stock-valuation' ? (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('reports.inv.asOf')}</label>
                    <DateField value={asOf} onChange={setAsOf} aria-label={t('reports.inv.asOf')} />
                  </div>
                ) : RANGE_REPORTS.includes(active) ? (
                  <div className="flex flex-wrap gap-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('reports.inv.from')}</label>
                      <DateField
                        value={shrinkFrom}
                        max={shrinkTo || undefined}
                        onChange={setShrinkFrom}
                        onClear={() => setShrinkFrom('')}
                        clearLabel={t('inventory.ledger.clearDate')}
                        placeholder={t('reports.inv.last30')}
                        aria-label={t('reports.inv.from')}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">{t('reports.inv.to')}</label>
                      <DateField
                        value={shrinkTo}
                        min={shrinkFrom || undefined}
                        onChange={setShrinkTo}
                        onClear={() => setShrinkTo('')}
                        clearLabel={t('inventory.ledger.clearDate')}
                        placeholder={t('reports.inv.today')}
                        aria-label={t('reports.inv.to')}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            }
          />

          {loadingStats ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
              <Skeleton className="h-56 w-full" />
            </div>
          ) : (
            renderBody()
          )}
        </div>
      </div>
    </div>
  );
}

function KpiRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

function TableWrap({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 font-display text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
      {label}
    </p>
  );
}
