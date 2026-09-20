import {
  ArrowDownUp,
  BarChart3,
  Bookmark,
  PieChart as PieIcon,
  RotateCcw,
  SlidersHorizontal,
  Table as TableIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DashboardStats } from '@/types/models';

import { downloadCsv, type CsvRow } from '../lib/csv';
import { LabeledBars } from './LabeledBars';
import { CellBar, LedgerTable, type LedgerColumn } from './LedgerTable';
import { MiniDonut } from './MiniDonut';
import { ReportDocHeader } from './ReportDocHeader';
import { ReportStatCard } from './ReportStatCard';

type Dimension = 'service' | 'staff' | 'branch' | 'status' | 'day' | 'dow' | 'hour';
type Measure = 'count' | 'revenue' | 'avg' | 'share';
type ChartMode = 'table' | 'bars' | 'donut';

const DIMENSIONS: Dimension[] = ['service', 'staff', 'branch', 'status', 'day', 'dow', 'hour'];
const REVENUE_DIMS: Dimension[] = ['staff', 'branch', 'day', 'dow'];
const LIMITS = [0, 5, 10, 20];

const STORE_KEY = 'aura.reports.customView';

interface Config {
  dimension: Dimension;
  measures: Measure[];
  sortKey: string;
  sortDir: 'asc' | 'desc';
  limit: number;
  chart: ChartMode;
  totals: boolean;
}

const DEFAULTS: Config = {
  dimension: 'service',
  measures: ['count', 'share'],
  sortKey: 'count',
  sortDir: 'desc',
  limit: 0,
  chart: 'bars',
  totals: true,
};

function loadConfig(): Config {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<Config>;
    return {
      ...DEFAULTS,
      ...p,
      measures: Array.isArray(p.measures) && p.measures.length ? p.measures : DEFAULTS.measures,
    };
  } catch {
    return DEFAULTS;
  }
}

interface Row {
  label: string;
  raw: string | number;
  count: number;
  revenue: number;
}

interface Props {
  stats?: DashboardStats;
  branchName?: string;
}

/** Custom report designer — pick a dimension, the columns to measure, how to
 *  sort / limit / visualise, then read it back as a live document. Config is
 *  remembered per browser. */
export function CustomReportTab({ stats, branchName }: Props) {
  const { t } = useTranslation();
  const [cfg, setCfg] = useState<Config>(() => loadConfig());
  const [restored, setRestored] = useState(() => {
    try {
      return Boolean(localStorage.getItem(STORE_KEY));
    } catch {
      return false;
    }
  });

  const revenueOk = REVENUE_DIMS.includes(cfg.dimension);

  // Drop revenue columns / sort when the dimension can't support them.
  useEffect(() => {
    if (!revenueOk && (cfg.measures.includes('revenue') || cfg.measures.includes('avg'))) {
      setCfg((c) => ({
        ...c,
        measures: c.measures.filter((m) => m !== 'revenue' && m !== 'avg'),
        sortKey: c.sortKey === 'revenue' || c.sortKey === 'avg' ? 'count' : c.sortKey,
      }));
    }
  }, [revenueOk, cfg.measures]);

  const set = (patch: Partial<Config>) => setCfg((c) => ({ ...c, ...patch }));
  const toggleMeasure = (m: Measure) =>
    setCfg((c) => {
      const has = c.measures.includes(m);
      const next = has ? c.measures.filter((x) => x !== m) : [...c.measures, m];
      return { ...c, measures: next.length ? next : c.measures };
    });

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
      setRestored(true);
      toast.success(t('reports.custom.saved'));
    } catch {
      /* storage unavailable — silently ignore */
    }
  }
  function reset() {
    setCfg(DEFAULTS);
    setRestored(false);
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* ignore */
    }
    toast.success(t('reports.custom.reset'));
  }

  // ---- base rows for the chosen dimension ----
  const base: Row[] = useMemo(() => {
    if (!stats) return [];
    switch (cfg.dimension) {
      case 'service':
        return stats.serviceMix.map((d) => ({ label: d.name, raw: d.name, count: d.value, revenue: 0 }));
      case 'staff':
        return stats.staffLeaderboard.map((d) => ({
          label: d.name,
          raw: d.name,
          count: d.completed,
          revenue: d.revenue,
        }));
      case 'branch':
        return stats.branchPerformance.map((d) => ({
          label: d.name,
          raw: d.name,
          count: d.bookings,
          revenue: d.revenue,
        }));
      case 'status':
        return stats.statusBreakdown.map((d) => ({
          label: t(`status.${d.status}`),
          raw: d.status,
          count: d.count,
          revenue: 0,
        }));
      case 'day':
        return stats.revenueSeries.map((d) => ({
          label: formatDate(d.date),
          raw: d.date,
          count: d.bookings,
          revenue: d.revenue,
        }));
      case 'dow': {
        const agg = Array.from({ length: 7 }, () => ({ count: 0, revenue: 0 }));
        for (const d of stats.revenueSeries) {
          const i = new Date(`${d.date}T00:00:00`).getDay();
          agg[i]!.count += d.bookings;
          agg[i]!.revenue += d.revenue;
        }
        return [1, 2, 3, 4, 5, 6, 0].map((i) => ({
          label: t(`reports.dow.${i}`),
          raw: i === 0 ? 7 : i,
          count: agg[i]!.count,
          revenue: agg[i]!.revenue,
        }));
      }
      case 'hour':
        return stats.hoursToday.map((d) => ({
          label: `${String(d.hour).padStart(2, '0')}:00`,
          raw: d.hour,
          count: d.count,
          revenue: 0,
        }));
      default:
        return [];
    }
  }, [stats, cfg.dimension, t]);

  const countTotal = base.reduce((s, r) => s + r.count, 0);
  const revenueTotal = base.reduce((s, r) => s + r.revenue, 0);
  const maxCount = Math.max(1, ...base.map((r) => r.count));

  const valueOf = (r: Row, key: string): number | string => {
    switch (key) {
      case 'label':
        return r.raw;
      case 'revenue':
        return r.revenue;
      case 'avg':
        return r.count ? r.revenue / r.count : 0;
      case 'share':
        return countTotal ? r.count / countTotal : 0;
      default:
        return r.count;
    }
  };

  const rows = useMemo(() => {
    const sorted = [...base].sort((a, b) => {
      const av = valueOf(a, cfg.sortKey);
      const bv = valueOf(b, cfg.sortKey);
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return cfg.sortDir === 'asc' ? cmp : -cmp;
    });
    return cfg.limit > 0 ? sorted.slice(0, cfg.limit) : sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, cfg.sortKey, cfg.sortDir, cfg.limit, countTotal]);

  const primary: Measure = cfg.measures.includes('revenue') && revenueOk ? 'revenue' : 'count';
  const primarySum = primary === 'revenue' ? revenueTotal : countTotal;
  const topRow = rows[0];
  const topShare = topRow && countTotal ? Math.round((topRow.count / countTotal) * 100) : 0;

  const dimLabel = t(`reports.custom.dim.${cfg.dimension}`);
  const colLabel = cfg.measures.map((m) => t(`reports.custom.met.${m}`)).join(', ');

  // ---- table columns ----
  const columns: LedgerColumn<Row>[] = [
    {
      key: 'label',
      label: dimLabel,
      render: (r) => <span className="font-medium">{r.label}</span>,
      sortValue: (r) => r.raw,
    },
  ];
  if (cfg.measures.includes('count')) {
    columns.push({
      key: 'count',
      label: t('reports.custom.met.count'),
      align: 'right',
      render: (r) => (
        <span className="inline-flex items-center justify-end">
          {r.count}
          <CellBar value={r.count} max={maxCount} />
        </span>
      ),
      sortValue: (r) => r.count,
    });
  }
  if (cfg.measures.includes('revenue') && revenueOk) {
    columns.push({
      key: 'revenue',
      label: t('reports.custom.met.revenue'),
      align: 'right',
      render: (r) => formatCurrency(r.revenue),
      sortValue: (r) => r.revenue,
    });
  }
  if (cfg.measures.includes('avg') && revenueOk) {
    columns.push({
      key: 'avg',
      label: t('reports.custom.met.avg'),
      align: 'right',
      render: (r) => (
        <span className="text-muted-foreground">
          {formatCurrency(r.count ? Math.round(r.revenue / r.count) : 0)}
        </span>
      ),
      sortValue: (r) => (r.count ? r.revenue / r.count : 0),
    });
  }
  if (cfg.measures.includes('share')) {
    columns.push({
      key: 'share',
      label: t('reports.custom.met.share'),
      align: 'right',
      render: (r) => `${countTotal ? Math.round((r.count / countTotal) * 100) : 0}%`,
      sortValue: (r) => r.count,
    });
  }

  const totalRow: ReactNode[] | undefined = cfg.totals
    ? columns.map((c) => {
        if (c.key === 'label') return t('reports.total');
        if (c.key === 'count') return countTotal;
        if (c.key === 'revenue') return formatCurrency(revenueTotal);
        if (c.key === 'share') return '100%';
        return '';
      })
    : undefined;

  function handleExport() {
    const rowsCsv: CsvRow[] = rows.map((r) => {
      const cells: CsvRow = [r.label];
      if (cfg.measures.includes('count')) cells.push(r.count);
      if (cfg.measures.includes('revenue') && revenueOk) cells.push(r.revenue);
      if (cfg.measures.includes('avg') && revenueOk)
        cells.push(r.count ? Math.round(r.revenue / r.count) : 0);
      if (cfg.measures.includes('share'))
        cells.push(`${countTotal ? Math.round((r.count / countTotal) * 100) : 0}%`);
      return cells;
    });
    downloadCsv(`custom-${cfg.dimension}-${new Date().toISOString().slice(0, 10)}`, [
      [t('reports.businessName'), t('reports.title'), t('reports.custom.builderTitle')],
      [t('reports.custom.dimension'), dimLabel],
      [t('reports.custom.columns'), colLabel],
      [t('reports.branch'), branchName ?? t('branch.all')],
      [],
      columns.map((c) => c.label),
      ...rowsCsv,
    ]);
  }

  const donutData = rows.map((r) => ({ label: r.label, value: r.count }));
  const barItems = rows.map((r) => {
    const v = primary === 'revenue' ? r.revenue : r.count;
    return {
      label: r.label,
      value: v,
      display: primary === 'revenue' ? formatCurrency(v) : String(v),
    };
  });

  return (
    <div className="space-y-4">
      {/* designer */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm print:hidden">
        <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="font-display text-sm font-semibold text-foreground">
            {t('reports.custom.builderTitle')}
          </span>
          {restored ? (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {t('reports.custom.restored')}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              {t('reports.custom.reset')}
            </button>
            <button
              type="button"
              onClick={save}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              <Bookmark className="h-3 w-3" aria-hidden="true" />
              {t('reports.custom.save')}
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('reports.custom.dimension')}>
            <Select
              className="h-9 text-sm"
              value={cfg.dimension}
              onChange={(e) => set({ dimension: e.target.value as Dimension })}
              options={DIMENSIONS.map((d) => ({ value: d, label: t(`reports.custom.dim.${d}`) }))}
            />
          </Field>

          <Field label={t('reports.custom.columns')}>
            <div className="flex flex-wrap gap-1.5">
              {(['count', 'revenue', 'avg', 'share'] as Measure[]).map((m) => {
                const disabled = (m === 'revenue' || m === 'avg') && !revenueOk;
                const on = cfg.measures.includes(m) && !disabled;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={disabled}
                    aria-pressed={on}
                    onClick={() => toggleMeasure(m)}
                    className={cn(
                      'rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
                      disabled && 'cursor-not-allowed opacity-40',
                      on
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t(`reports.custom.met.${m}`)}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label={t('reports.custom.sortBy')}>
            <div className="flex gap-1.5">
              <Select
                className="h-9 flex-1 text-sm"
                value={cfg.sortKey}
                onChange={(e) => set({ sortKey: e.target.value })}
                options={[
                  { value: 'label', label: dimLabel },
                  { value: 'count', label: t('reports.custom.met.count') },
                  ...(revenueOk
                    ? [
                        { value: 'revenue', label: t('reports.custom.met.revenue') },
                        { value: 'avg', label: t('reports.custom.met.avg') },
                      ]
                    : []),
                ]}
              />
              <button
                type="button"
                onClick={() => set({ sortDir: cfg.sortDir === 'desc' ? 'asc' : 'desc' })}
                aria-label={cfg.sortDir === 'desc' ? t('reports.custom.sortDesc') : t('reports.custom.sortAsc')}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-input text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </Field>

          <Field label={t('reports.custom.limit')}>
            <Seg
              value={String(cfg.limit)}
              onChange={(v) => set({ limit: Number(v) })}
              options={LIMITS.map((n) => ({
                value: String(n),
                label: n === 0 ? t('reports.custom.limitAll') : String(n),
              }))}
            />
          </Field>

          <Field label={t('reports.custom.chart')}>
            <Seg
              value={cfg.chart}
              onChange={(v) => set({ chart: v as ChartMode })}
              options={[
                { value: 'table', label: <TableIcon className="h-3.5 w-3.5" />, aria: t('reports.custom.chartTable') },
                { value: 'bars', label: <BarChart3 className="h-3.5 w-3.5" />, aria: t('reports.custom.chartBars') },
                { value: 'donut', label: <PieIcon className="h-3.5 w-3.5" />, aria: t('reports.custom.chartDonut') },
              ]}
            />
          </Field>

          <Field label={t('reports.custom.totals')}>
            <button
              type="button"
              role="switch"
              aria-checked={cfg.totals}
              onClick={() => set({ totals: !cfg.totals })}
              className={cn(
                'inline-flex h-6 w-11 items-center rounded-full border transition-colors',
                cfg.totals ? 'border-primary bg-primary' : 'border-input bg-muted',
              )}
            >
              <span
                className={cn(
                  'ml-0.5 inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
                  cfg.totals && 'translate-x-5',
                )}
                aria-hidden="true"
              />
            </button>
          </Field>
        </div>
      </div>

      {/* result document */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="space-y-4 p-4 sm:p-5">
          <ReportDocHeader
            title={t('reports.tab.custom')}
            desc={`${dimLabel} × ${colLabel}`}
            scope={[t('dashboard.last14Window'), branchName ?? t('branch.all')]}
            onPrint={() => window.print()}
            onExport={handleExport}
          />

          {!stats || base.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border py-10 text-center text-xs text-muted-foreground">
              {t('reports.empty')}
            </p>
          ) : (
            <>
              <p className="border-l-2 border-primary/40 pl-3 text-xs leading-relaxed text-muted-foreground">
                {t('reports.custom.summary', {
                  count: rows.length,
                  total:
                    primary === 'revenue' ? formatCurrency(primarySum) : String(primarySum),
                  name: topRow?.label ?? '—',
                  pct: topShare,
                })}
              </p>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <ReportStatCard
                  label={t('reports.custom.rows')}
                  value={rows.length}
                  icon={<TableIcon className="h-4 w-4" aria-hidden="true" />}
                  tone="primary"
                  sub={dimLabel}
                  index={0}
                />
                <ReportStatCard
                  label={t(`reports.custom.met.${primary}`)}
                  value={primary === 'revenue' ? formatCurrency(primarySum) : primarySum}
                  icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
                  tone="info"
                  sub={t('reports.total')}
                  index={1}
                />
                <ReportStatCard
                  label={t('reports.custom.topService')}
                  value={topRow?.label ?? '—'}
                  icon={<PieIcon className="h-4 w-4" aria-hidden="true" />}
                  tone="success"
                  sub={`${topShare}%`}
                  index={2}
                />
              </div>

              {cfg.chart === 'bars' ? (
                <LabeledBars
                  items={barItems}
                  ariaLabel={`${dimLabel} × ${colLabel}`}
                  variant={cfg.dimension === 'dow' || cfg.dimension === 'hour' ? 'compact' : 'wide'}
                />
              ) : cfg.chart === 'donut' ? (
                <MiniDonut data={donutData} ariaLabel={`${dimLabel} × ${colLabel}`} />
              ) : null}

              <LedgerTable
                rows={rows}
                rowKey={(r) => String(r.raw)}
                columns={columns}
                total={totalRow}
                empty={t('reports.empty')}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-[11px] font-semibold text-muted-foreground">{label}</legend>
      {children}
    </fieldset>
  );
}

function Seg({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: ReactNode; aria?: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          aria-label={o.aria}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center justify-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors',
            value === o.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
