import {
  Building2,
  CalendarRange,
  ChevronRight,
  CircleDollarSign,
  MapPinned,
  Star,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LaoProvinceMap } from '@/features/branches/LaoProvinceMap';
import { useBranches } from '@/features/branches/branches.api';
import { LAO_PROVINCES, provinceName } from '@/features/branches/lao-provinces';
import { formatCompactNumber, formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import type { DashboardStats, LaoProvinceId } from '@/types/models';

import { DashboardPanel as Panel } from './DashboardPanel';
import {
  type Agg,
  type Metric,
  METRICS,
  type ProvinceRow,
  REGION_OF,
  REGIONS,
  STEPS,
  addInto,
  buildProvinces,
  changeOf,
  emptyAgg,
  metricOf,
  pct,
  ratingOf,
  stepFor,
} from './provinceMap.model';
import {
  BranchCard,
  DeltaBadge,
  Fact,
  OutcomeBar,
  Ring,
  Stars,
  StripStat,
} from './provinceMap.parts';

const TOTAL_PROVINCES = LAO_PROVINCES.length;

interface Props {
  data: DashboardStats | undefined;
  days: number;
  now: number;
  /** Header branch scope — its pin is highlighted until the user picks another. */
  scopeBranchId: string;
  index?: number;
}

/**
 * Lao province choropleth + network strip + per-province drill-down. Branch
 * locations come from `/branches`; performance from `branchPerformance`.
 */
export function ProvinceMapCard({ data, days, now, scopeBranchId, index }: Props) {
  const { t, i18n } = useTranslation();
  const { data: branches, isLoading } = useBranches();
  const [metric, setMetric] = useState<Metric>('revenue');
  const [selectedProvince, setSelectedProvince] = useState<LaoProvinceId | null>(null);
  const [hovered, setHovered] = useState<LaoProvinceId | null>(null);
  const [pickedBranchId, setPickedBranchId] = useState<string | null>(null);

  // Minute resolution is enough for "open now" — avoids rebuilding on every tick.
  const minute = Math.floor(now / 60_000);
  const provinces = useMemo(
    () =>
      buildProvinces(branches ?? [], data?.branchPerformance ?? [], i18n.language, minute * 60_000),
    [branches, data, i18n.language, minute],
  );

  const { network, regions } = useMemo(() => {
    const network = emptyAgg();
    const regions = Object.fromEntries(REGIONS.map((r) => [r, emptyAgg()])) as Record<
      (typeof REGIONS)[number],
      Agg
    >;
    for (const p of provinces.values()) {
      for (const row of p.rows) {
        addInto(network, row);
        addInto(regions[p.region], row);
      }
    }
    return { network, regions };
  }, [provinces]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of provinces.values()) out[p.id] = p.branches;
    return out;
  }, [provinces]);

  const list = [...provinces.values()];
  const max = Math.max(0, ...list.map((p) => metricOf(p, metric)));
  const ranked = list.sort(
    (a, b) => metricOf(b, metric) - metricOf(a, metric) || b.revenue - a.revenue,
  );
  const rankOf = (id: LaoProvinceId) => ranked.findIndex((p) => p.id === id) + 1;
  const selected = selectedProvince ? provinces.get(selectedProvince) : undefined;
  const activeBranchId = pickedBranchId ?? (scopeBranchId !== 'all' ? scopeBranchId : null);
  const hoveredRow = hovered ? provinces.get(hovered) : undefined;
  const coverage = pct(provinces.size, TOTAL_PROVINCES);
  const settled = network.completed + network.lost;

  const formatMetric = (v: number) =>
    metric === 'revenue' ? formatCompactNumber(v) : v.toLocaleString();

  const fillForProvince = (id: LaoProvinceId, count: number, isSelected: boolean) => {
    if (isSelected) return 'hsl(var(--primary-strong))';
    if (metric === 'branches') return STEPS[Math.min(count, 3)]!;
    const p = provinces.get(id);
    return STEPS[p ? stepFor(metricOf(p, metric), max) : 0]!;
  };

  const selectProvince = (id: LaoProvinceId | null) => {
    setSelectedProvince(id);
    setPickedBranchId(null);
  };
  const selectBranch = (id: string) => {
    const b = branches?.find((x) => x.id === id);
    if (b) setSelectedProvince(b.province);
    setPickedBranchId((cur) => (cur === id ? null : id));
  };

  const loading = isLoading || !data;

  return (
    <Panel
      title={t('dashboard.provinceMap.title')}
      subtitle={`${t('dashboard.provinceMap.caption')} · ${t('dashboard.periodLabel', { days })}`}
      icon={<MapPinned aria-hidden="true" />}
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to={ROUTES.branches}>{t('nav.branches')}</Link>
        </Button>
      }
      index={index}
    >
      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[86px] rounded-xl" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,1fr)]">
            <Skeleton className="aspect-square w-full rounded-2xl" />
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* ── Network strip ───────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StripStat
              icon={<MapPinned />}
              label={t('dashboard.provinceMap.coverage')}
              value={`${provinces.size}/${TOTAL_PROVINCES}`}
              foot={t('dashboard.provinceMap.coverageHint', { pct: coverage })}
              ring={coverage}
              index={0}
            />
            <StripStat
              icon={<Building2 />}
              label={t('dashboard.provinceMap.branches')}
              value={network.branches}
              foot={t('dashboard.provinceMap.openNowCount', {
                open: network.openNow,
                active: network.active,
              })}
              ring={pct(network.openNow, network.branches)}
              index={1}
            />
            <StripStat
              icon={<CircleDollarSign />}
              label={t('dashboard.provinceMap.metric.revenue')}
              value={formatCompactNumber(network.revenue)}
              delta={changeOf(network.revenue, network.prevRevenue)}
              foot={t('dashboard.provinceMap.todayRevenue', {
                value: formatCompactNumber(network.todayRevenue),
              })}
              index={2}
            />
            <StripStat
              icon={<CalendarRange />}
              label={t('dashboard.provinceMap.metric.bookings')}
              value={network.bookings.toLocaleString()}
              delta={changeOf(network.bookings, network.prevBookings)}
              foot={t('dashboard.provinceMap.completionFoot', {
                pct: pct(network.completed, settled),
              })}
              index={3}
            />
            <StripStat
              icon={<Star />}
              label={t('dashboard.provinceMap.rating')}
              value={network.ratingCount ? ratingOf(network).toFixed(1) : '—'}
              foot={t('dashboard.provinceMap.staffCustomers', {
                staff: network.staff,
                customers: network.customers,
              })}
              index={4}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,1fr)]">
            {/* ── Map ─────────────────────────────────────────────── */}
            <div className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-primary/[0.06] via-card to-card p-3 sm:p-4">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
              />
              <div className="relative flex flex-wrap items-center justify-between gap-2">
                <div
                  role="radiogroup"
                  aria-label={t('dashboard.provinceMap.metricAria')}
                  className="inline-flex items-center rounded-xl border border-border bg-card/80 p-1 shadow-sm backdrop-blur"
                >
                  {METRICS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={metric === m}
                      onClick={() => setMetric(m)}
                      className={cn(
                        'h-8 rounded-lg px-3 text-xs font-semibold transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        metric === m
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t(`dashboard.provinceMap.metric.${m}`)}
                    </button>
                  ))}
                </div>
                {selectedProvince ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 gap-1 rounded-lg text-xs"
                    onClick={() => selectProvince(null)}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('dashboard.provinceMap.clear')}
                  </Button>
                ) : null}
              </div>

              <div className="relative mt-2 flex-1">
                <HoverCard row={hoveredRow} rank={hovered ? rankOf(hovered) : 0} />
                <LaoProvinceMap
                  branches={branches ?? []}
                  countsByProvince={counts}
                  selectedProvince={selectedProvince}
                  activeBranchId={activeBranchId}
                  onSelectProvince={selectProvince}
                  onSelectBranch={selectBranch}
                  onHoverProvince={setHovered}
                  fillForProvince={fillForProvince}
                  maxWidthClass="max-w-[560px]"
                  provinceAriaLabel={(id, name, count) => {
                    const p = provinces.get(id);
                    return t('dashboard.provinceMap.provinceAria', {
                      province: name,
                      count,
                      bookings: p?.bookings ?? 0,
                      revenue: formatCurrency(p?.revenue ?? 0),
                    });
                  }}
                  legend={
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {t(`dashboard.provinceMap.metric.${metric}`)}
                      </span>
                      <span>{t('dashboard.provinceMap.legendNone')}</span>
                      <span className="inline-flex overflow-hidden rounded-full border border-border">
                        {STEPS.map((c) => (
                          <span key={c} className="h-2.5 w-7" style={{ backgroundColor: c }} />
                        ))}
                      </span>
                      <span className="tabular-nums">
                        {metric === 'branches'
                          ? '3+'
                          : t('dashboard.provinceMap.legendMax', { value: formatMetric(max) })}
                      </span>
                    </div>
                  }
                />
              </div>

              {/* Regions */}
              <div className="relative mt-3 grid grid-cols-3 gap-2">
                {REGIONS.map((r) => {
                  const a = regions[r];
                  const share = pct(metricOf(a, metric), metricOf(network, metric));
                  return (
                    <div key={r} className="rounded-xl border border-border bg-card/80 px-2.5 py-2">
                      <div className="flex items-center justify-between gap-1 text-[11px]">
                        <span className="font-semibold">
                          {t(`dashboard.provinceMap.region.${r}`)}
                        </span>
                        <span className="tabular-nums text-muted-foreground">{share}%</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <p className="mt-1 truncate text-[10px] tabular-nums text-muted-foreground">
                        {t('dashboard.provinceMap.regionFoot', {
                          branches: a.branches,
                          revenue: formatCompactNumber(a.revenue),
                        })}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Detail ─────────────────────────────────────────── */}
            <div className="min-w-0">
              {selectedProvince ? (
                <ProvinceDetail
                  key={selectedProvince}
                  id={selectedProvince}
                  row={selected}
                  network={network}
                  rank={selected ? rankOf(selectedProvince) : 0}
                  rankTotal={ranked.length}
                  activeBranchId={activeBranchId}
                  onPickBranch={selectBranch}
                />
              ) : (
                <Ranking
                  ranked={ranked}
                  metric={metric}
                  max={max}
                  networkValue={metricOf(network, metric)}
                  uncovered={TOTAL_PROVINCES - provinces.size}
                  hovered={hovered}
                  onHover={setHovered}
                  onSelect={selectProvince}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function HoverCard({ row, rank }: { row: ProvinceRow | undefined; rank: number }) {
  const { t } = useTranslation();
  if (!row) return null;
  return (
    <div className="pointer-events-none absolute right-0 top-0 z-10 w-52 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold">{row.name}</p>
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
          #{rank}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t(`dashboard.provinceMap.region.${row.region}`)} ·{' '}
        {t('dashboard.provinceMap.branchesSummary', { count: row.branches, active: row.active })}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <dt className="text-muted-foreground">{t('dashboard.provinceMap.metric.revenue')}</dt>
        <dd className="text-right font-semibold tabular-nums">
          {formatCompactNumber(row.revenue)}
        </dd>
        <dt className="text-muted-foreground">{t('dashboard.provinceMap.metric.bookings')}</dt>
        <dd className="text-right font-semibold tabular-nums">{row.bookings}</dd>
        <dt className="text-muted-foreground">{t('dashboard.provinceMap.today')}</dt>
        <dd className="text-right font-semibold tabular-nums">{row.todayBookings}</dd>
        <dt className="text-muted-foreground">{t('dashboard.provinceMap.rating')}</dt>
        <dd className="text-right">
          <Stars value={ratingOf(row)} count={row.ratingCount} />
        </dd>
      </dl>
    </div>
  );
}

function Ranking({
  ranked,
  metric,
  max,
  networkValue,
  uncovered,
  hovered,
  onHover,
  onSelect,
}: {
  ranked: ProvinceRow[];
  metric: Metric;
  max: number;
  networkValue: number;
  uncovered: number;
  hovered: LaoProvinceId | null;
  onHover: (id: LaoProvinceId | null) => void;
  onSelect: (id: LaoProvinceId) => void;
}) {
  const { t, i18n } = useTranslation();
  const missing = LAO_PROVINCES.filter((p) => !ranked.some((r) => r.id === p.id));

  return (
    <div className="flex h-full flex-col animate-in fade-in duration-200 motion-reduce:animate-none">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {t('dashboard.provinceMap.ranking', {
            metric: t(`dashboard.provinceMap.metric.${metric}`),
          })}
        </h3>
        <span className="text-[11px] text-muted-foreground">
          {t('dashboard.provinceMap.tapHint')}
        </span>
      </div>

      {ranked.length === 0 ? (
        <p className="rounded-xl bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
          {t('dashboard.provinceMap.noBranches')}
        </p>
      ) : (
        <ol className="-mx-1 max-h-[520px] flex-1 space-y-1 overflow-y-auto px-1">
          {ranked.map((p, i) => {
            const v = metricOf(p, metric);
            const medal =
              i === 0
                ? 'bg-accent text-accent-foreground'
                : i === 1
                  ? 'bg-muted-foreground/25 text-foreground'
                  : i === 2
                    ? 'bg-accent-soft text-accent-foreground'
                    : 'bg-muted text-muted-foreground';
            return (
              <li
                key={p.id}
                className="animate-in fade-in slide-in-from-right-1 fill-mode-both duration-300 motion-reduce:animate-none"
                style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  onMouseEnter={() => onHover(p.id)}
                  onMouseLeave={() => onHover(null)}
                  className={cn(
                    'group w-full rounded-xl border px-2.5 py-2 text-left transition-[background-color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    hovered === p.id
                      ? 'border-primary/30 bg-primary/[0.04]'
                      : 'border-transparent hover:bg-muted/50',
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        'grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold tabular-nums',
                        medal,
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">{p.name}</span>
                        <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                          {t(`dashboard.provinceMap.region.${p.region}`)}
                        </span>
                      </div>
                      <p className="truncate text-[11px] tabular-nums text-muted-foreground">
                        {t('dashboard.provinceMap.rowMeta', {
                          branches: p.branches,
                          bookings: p.bookings,
                          customers: p.customers,
                        })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {metric === 'revenue' ? formatCompactNumber(v) : v.toLocaleString()}
                      </p>
                      <DeltaBadge
                        change={
                          metric === 'bookings'
                            ? changeOf(p.bookings, p.prevBookings)
                            : changeOf(p.revenue, p.prevRevenue)
                        }
                      />
                    </div>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="ml-8 mr-6 mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary/60 to-primary transition-[width] duration-700 ease-out"
                        style={{ width: `${max > 0 ? Math.max((v / max) * 100, v ? 3 : 0) : 0}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
                      {pct(v, networkValue)}%
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {uncovered > 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-border px-3 py-2.5">
          <p className="text-xs font-medium">
            {t('dashboard.provinceMap.uncovered', { count: uncovered })}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {missing.map((p) => (
              <span
                key={p.id}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {provinceName(p.id, i18n.language)}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProvinceDetail({
  id,
  row,
  network,
  rank,
  rankTotal,
  activeBranchId,
  onPickBranch,
}: {
  id: LaoProvinceId;
  row: ProvinceRow | undefined;
  network: Agg;
  rank: number;
  rankTotal: number;
  activeBranchId: string | null;
  onPickBranch: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const name = row?.name ?? provinceName(id, i18n.language);
  const region = row?.region ?? REGION_OF[id];

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-200 motion-reduce:animate-none">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary-strong p-4 text-primary-foreground shadow-md">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-2xl"
        />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] opacity-80">
              {t(`dashboard.provinceMap.region.${region}`)}
              {row ? ` · ${t('dashboard.provinceMap.rankOf', { rank, total: rankTotal })}` : ''}
            </p>
            <h3 className="truncate text-lg font-semibold">{name}</h3>
            <p className="text-[11px] opacity-80">
              {row
                ? t('dashboard.provinceMap.branchesOpenSummary', {
                    count: row.branches,
                    open: row.openNow,
                  })
                : t('dashboard.provinceMap.noBranchesHere')}
            </p>
          </div>
          {row ? (
            <div className="shrink-0 text-right">
              <p className="text-xl font-semibold tabular-nums">
                {formatCompactNumber(row.revenue)}
              </p>
              <p className="text-[11px] opacity-80">
                {t('dashboard.provinceMap.shareHint', { pct: pct(row.revenue, network.revenue) })}
              </p>
            </div>
          ) : null}
        </div>
        {row ? (
          <div className="relative mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-700 ease-out"
                style={{ width: `${pct(row.revenue, network.revenue)}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {row ? (
        <>
          <dl className="grid grid-cols-3 gap-2">
            <Fact
              label={t('dashboard.provinceMap.metric.revenue')}
              value={
                <>
                  {formatCompactNumber(row.revenue)}
                  <DeltaBadge change={changeOf(row.revenue, row.prevRevenue)} />
                </>
              }
              foot={t('dashboard.provinceMap.prevValue', {
                value: formatCompactNumber(row.prevRevenue),
              })}
            />
            <Fact
              label={t('dashboard.provinceMap.metric.bookings')}
              value={
                <>
                  {row.bookings}
                  <DeltaBadge change={changeOf(row.bookings, row.prevBookings)} />
                </>
              }
              foot={t('dashboard.provinceMap.prevValue', { value: row.prevBookings })}
            />
            <Fact
              label={t('dashboard.provinceMap.avgTicket')}
              value={
                row.completed ? formatCompactNumber(Math.round(row.revenue / row.completed)) : '—'
              }
              foot={t('dashboard.provinceMap.completedCount', { count: row.completed })}
            />
            <Fact
              label={t('dashboard.provinceMap.today')}
              value={row.todayBookings}
              foot={formatCompactNumber(row.todayRevenue)}
            />
            <Fact
              label={t('dashboard.provinceMap.next7')}
              value={row.upcoming7d}
              foot={t('dashboard.provinceMap.bookingsUnit')}
            />
            <Fact
              label={t('dashboard.provinceMap.rating')}
              value={<Stars value={ratingOf(row)} count={row.ratingCount} />}
            />
          </dl>

          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">{t('dashboard.provinceMap.outcomeTitle')}</p>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Users className="h-3 w-3" aria-hidden="true" />
                {t('dashboard.provinceMap.staffCustomers', {
                  staff: row.staff,
                  customers: row.customers,
                })}
              </div>
            </div>
            <OutcomeBar bookings={row.bookings} completed={row.completed} lost={row.lost} />
            <div className="mt-2 flex items-center gap-3 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
              <Ring value={pct(row.walkins, row.bookings)} size={22} />
              <span className="tabular-nums">
                {t('dashboard.provinceMap.channelMix', {
                  walkins: pct(row.walkins, row.bookings),
                  home: pct(row.homeService, row.bookings),
                })}
              </span>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold">
              {t('dashboard.provinceMap.branchList', { count: row.branches })}
            </p>
            <ul className="max-h-[440px] space-y-2 overflow-y-auto pr-0.5">
              {row.rows.map((r, i) => (
                <BranchCard
                  key={r.branch.id}
                  row={r}
                  index={i}
                  active={r.branch.id === activeBranchId}
                  maxRevenue={Math.max(1, ...row.rows.map((x) => x.perf.revenue))}
                  onPick={() => onPickBranch(r.branch.id)}
                />
              ))}
            </ul>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <MapPinned className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium">{t('dashboard.provinceMap.noBranchesHere')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('dashboard.provinceMap.noBranchesHereHint')}
          </p>
          <Button asChild variant="secondary" size="sm" className="mt-3">
            <Link to={ROUTES.branches}>{t('nav.branches')}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
