import type { PayrollReport, PayrollRow } from '@abcp/shared-types';
import { Activity, BarChart3, PieChart as PieIcon, Target } from 'lucide-react';
import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CurrencyText, EmptyState } from '@/components/shared';
import {
  CHART_AXIS_TICK,
  CHART_CURSOR_FILL,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from '@/features/dashboard/chartTheme';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCompactNumber, formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { TONE } from './payroll.lib';
import { SectionCard } from './payroll.parts';

/** Attainment bands — a histogram is more honest than a mean when targets vary. */
const BANDS = [
  { key: 'under50', max: 50, tone: 'danger' as const },
  { key: 'to80', max: 80, tone: 'warning' as const },
  { key: 'to100', max: 100, tone: 'info' as const },
  { key: 'over100', max: Infinity, tone: 'success' as const },
];

interface Props {
  rows: PayrollRow[];
  report: PayrollReport | undefined;
  loading: boolean;
}

/**
 * Insights view — the four questions the table can't answer at a glance:
 * how revenue landed across the month, who carries it, how the payroll splits,
 * and whether targets are set at a realistic level.
 *
 * Every chart is paired with the figure it encodes (axis labels, direct values
 * or a legend with numbers) so none of them relies on colour alone.
 */
export function PayrollInsights({ rows, report, loading }: Props) {
  const { t } = useTranslation();
  const gradientId = useId().replace(/:/g, '');

  const topStaff = useMemo(
    () =>
      rows
        .filter((r) => r.grossRevenue > 0)
        .slice(0, 10)
        .map((r) => ({
          name: r.staffName,
          revenue: r.grossRevenue,
          target: r.targetRevenue,
          met: r.targetMet,
        })),
    [rows],
  );

  const bands = useMemo(() => {
    const withTarget = rows.filter((r) => r.targetRevenue > 0);
    return BANDS.map((b, i) => {
      const min = i === 0 ? -Infinity : BANDS[i - 1]!.max;
      return {
        key: b.key,
        tone: b.tone,
        label: t(`payroll.band.${b.key}`),
        count: withTarget.filter((r) => r.attainmentPct > min && r.attainmentPct <= b.max).length,
      };
    });
  }, [rows, t]);

  if (loading || !report) {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[300px] rounded-xl" />
        ))}
      </div>
    );
  }

  const { totals, daily } = report;
  const composition = [
    {
      key: 'commissionPaid',
      label: t('payroll.split.commissionPaid'),
      value: totals.commissionPaid,
      color: 'hsl(var(--success))',
    },
    {
      key: 'commissionDue',
      label: t('payroll.split.commissionDue'),
      value: totals.commissionUnpaid,
      color: 'hsl(var(--warning))',
    },
    {
      key: 'bonusPaid',
      label: t('payroll.split.bonusPaid'),
      value: totals.bonusTotal - totals.bonusUnpaid,
      color: 'hsl(var(--chart-4))',
    },
    {
      key: 'bonusDue',
      label: t('payroll.split.bonusDue'),
      value: totals.bonusUnpaid,
      color: 'hsl(var(--info))',
    },
  ].filter((s) => s.value > 0);

  const noTarget = totals.staff - totals.staffWithTarget;
  const hasDaily = daily.some((d) => d.revenue > 0);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {/* ── revenue across the month ── */}
      <SectionCard
        icon={Activity}
        title={t('payroll.insights.dailyTitle')}
        meta={t('payroll.insights.dailyMeta', { jobs: totals.completedJobs })}
        className="lg:col-span-2"
      >
        {hasDaily ? (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={CHART_AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  tickFormatter={(v: string) => formatDate(v).replace(/\/\d{4}$/, '')}
                />
                <YAxis
                  tick={CHART_AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tickFormatter={(v: number) => formatCompactNumber(v)}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                  cursor={{ fill: CHART_CURSOR_FILL }}
                  labelFormatter={(v) => formatDate(String(v))}
                  formatter={(value: number, _n, item) => [
                    `${formatCurrency(value)} · ${t('payroll.jobsCount', {
                      count: (item?.payload as { jobs?: number } | undefined)?.jobs ?? 0,
                    })}`,
                    t('payroll.col.gross'),
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState icon={Activity} title={t('payroll.empty')} description={t('payroll.emptyHint')} />
        )}
      </SectionCard>

      {/* ── who carries the revenue, against their own target ── */}
      <SectionCard
        icon={BarChart3}
        title={t('payroll.insights.byStaffTitle')}
        meta={t('payroll.insights.byStaffMeta')}
      >
        {topStaff.length > 0 ? (
          <div style={{ height: Math.max(180, topStaff.length * 30) }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topStaff}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 0, left: 4 }}
                barCategoryGap={6}
              >
                <XAxis
                  type="number"
                  tick={CHART_AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => formatCompactNumber(v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={CHART_AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={92}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                  cursor={{ fill: CHART_CURSOR_FILL }}
                  formatter={(value: number, key) => [
                    formatCurrency(value),
                    key === 'target' ? t('payroll.col.target') : t('payroll.col.gross'),
                  ]}
                />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={16}>
                  {topStaff.map((s) => (
                    <Cell
                      key={s.name}
                      fill={s.met ? 'hsl(var(--success))' : 'hsl(var(--chart-1))'}
                    />
                  ))}
                </Bar>
                {/* Target markers: one reference line per distinct target keeps the
                    "did they clear the bar" question answerable inside the chart. */}
                {topStaff
                  .filter((s) => s.target > 0)
                  .map((s) => (
                    <ReferenceLine
                      key={`t-${s.name}`}
                      x={s.target}
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="3 3"
                      strokeOpacity={0.4}
                    />
                  ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState icon={BarChart3} title={t('payroll.empty')} />
        )}
        <p className="mt-2 text-2xs text-muted-foreground">
          {t('payroll.insights.byStaffLegend')}
        </p>
      </SectionCard>

      {/* ── what the payroll is made of ── */}
      <SectionCard
        icon={PieIcon}
        title={t('payroll.insights.compositionTitle')}
        meta={<CurrencyText amount={totals.payable} />}
      >
        {composition.length > 0 ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="h-[180px] w-[180px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={composition}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {composition.map((s) => (
                      <Cell key={s.key} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5">
              {composition.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-3 text-xs">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: s.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-muted-foreground">{s.label}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    <CurrencyText amount={s.value} />
                  </span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 border-t border-border pt-1.5 text-xs">
                <span className="text-muted-foreground">{t('payroll.payRun.labourRatio')}</span>
                <span className="font-semibold tabular-nums">
                  {Math.round(totals.labourCostRatio * 100)}%
                </span>
              </li>
            </ul>
          </div>
        ) : (
          <EmptyState icon={PieIcon} title={t('payroll.empty')} />
        )}
      </SectionCard>

      {/* ── are targets set at a level anyone can hit? ── */}
      <SectionCard
        icon={Target}
        title={t('payroll.insights.attainmentTitle')}
        meta={t('payroll.targetsMet', {
          count: totals.targetMetCount,
          total: totals.staffWithTarget,
        })}
        className="lg:col-span-2"
      >
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {bands.map((b) => {
            const pct =
              totals.staffWithTarget > 0
                ? Math.round((b.count / totals.staffWithTarget) * 100)
                : 0;
            return (
              <li
                key={b.key}
                className="rounded-lg border border-border bg-background/50 p-3"
              >
                <p className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">{b.label}</span>
                  <span className={cn('text-sm font-semibold tabular-nums', TONE[b.tone].text)}>
                    {b.count}
                  </span>
                </p>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn(
                      'block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none',
                      TONE[b.tone].bar,
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <p className="mt-1 text-2xs tabular-nums text-muted-foreground">{pct}%</p>
              </li>
            );
          })}
        </ul>
        {noTarget > 0 ? (
          <p className="mt-3 flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
            <Target className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('payroll.insights.noTargetWarning', { count: noTarget })}
          </p>
        ) : null}
      </SectionCard>
    </div>
  );
}
