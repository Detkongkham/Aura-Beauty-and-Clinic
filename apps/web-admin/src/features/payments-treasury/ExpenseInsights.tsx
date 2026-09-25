import type { ExpenseCategoryView, ExpenseSummaryView, ProfitLossView } from '@abcp/shared-types';
import { Activity, Building2, Crown, PieChart as PieIcon, Scale, Store, Target, Trophy } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  Bar,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CurrencyText } from '@/components/shared';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CHART_AXIS_TICK,
  CHART_CURSOR_FILL,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from '@/features/dashboard/chartTheme';
import { SectionCard } from '@/features/payroll/payroll.parts';
import { TONE } from '@/features/payroll/payroll.lib';
import { Button } from '@/components/ui/button';
import { monthLabel } from '@/features/payroll/payroll.lib';
import { formatCompactNumber, formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { CategoryGlyph } from './expense.parts';
import { budgetTone, bucketTrend, categoryColor, categoryName, dayAxisLabel } from './expenses.lib';

interface Props {
  summary: ExpenseSummaryView | undefined;
  pnl: ProfitLossView | undefined;
  loading: boolean;
  pnlLoading: boolean;
  categories: ExpenseCategoryView[];
  lang: 'lo' | 'en';
  showBranches: boolean;
  activeCategoryId: string;
  onCategory: (id: string) => void;
  onOpenExpense: (id: string) => void;
  onSetBudgets?: () => void;
}

/**
 * Insights view — where the money went and whether that is normal.
 * Trend vs the previous period · category mix · real P&L · branch / supplier / largest-item ranks.
 * Every chart carries a numeric legend or direct labels; nothing is readable by hue alone.
 */
export function ExpenseInsights(p: Props) {
  if (p.loading || !p.summary) {
    return (
      <div className="grid gap-3 lg:grid-cols-3">
        <Skeleton className="h-[320px] rounded-xl lg:col-span-2" />
        <Skeleton className="h-[320px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-3">
        <TrendCard summary={p.summary} lang={p.lang} className="lg:col-span-2" />
        <CategoryMix {...p} summary={p.summary} />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <ProfitLossCard pnl={p.pnl} loading={p.pnlLoading} lang={p.lang} />
        {p.showBranches && p.summary.byBranch.length > 1 ? (
          <BranchCard summary={p.summary} />
        ) : (
          <SupplierCard summary={p.summary} />
        )}
        <LargestCard summary={p.summary} categories={p.categories} onOpen={p.onOpenExpense} />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <BudgetCard summary={p.summary} categories={p.categories} lang={p.lang} onSetBudgets={p.onSetBudgets} className="lg:col-span-2" />
        {p.showBranches && p.summary.byBranch.length > 1 ? <SupplierCard summary={p.summary} /> : null}
      </div>
    </div>
  );
}

// ── trend ────────────────────────────────────────────────────────────

function TrendCard({ summary: s, lang, className }: { summary: ExpenseSummaryView; lang: 'lo' | 'en'; className?: string }) {
  const { t } = useTranslation();
  const gradientId = useId().replace(/:/g, '');
  const [mode, setMode] = useState<'daily' | 'cumulative'>('cumulative');
  const data = useMemo(() => bucketTrend(s.byDay, s.previous.byDay), [s.byDay, s.previous.byDay]);
  const weekly = s.byDay.length > 62;
  const peak = data.reduce((m, d) => (d.amount > m.amount ? d : m), data[0] ?? { amount: 0, date: '' });
  const avg = s.byDay.length ? s.recognisedTotal / s.byDay.length : 0;

  return (
    <SectionCard
      icon={Activity}
      title={t('payTreasury.exp.ins.trend')}
      meta={weekly ? t('payTreasury.exp.ins.weekly') : t('payTreasury.exp.ins.daily')}
      className={className}
      action={
        <div role="group" aria-label={t('payTreasury.exp.ins.trendMode')} className="flex rounded-md border border-border p-0.5">
          {(['cumulative', 'daily'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'h-6 rounded px-2 text-2xs font-medium transition-colors',
                mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t(`payTreasury.exp.ins.mode.${m}`)}
            </button>
          ))}
        </div>
      }
    >
      {data.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t('payTreasury.exp.ins.rangeTooLong')}</p>
      ) : (
        <>
          <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-2xs text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm bg-[hsl(var(--chart-1))]" aria-hidden="true" />
              {t('payTreasury.exp.ins.thisPeriod')} <CurrencyText amount={s.recognisedTotal} className="font-semibold text-foreground" />
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="h-0 w-3 border-t-2 border-dashed border-muted-foreground" aria-hidden="true" />
              {t('payTreasury.exp.ins.prevPeriod')} <CurrencyText amount={s.previous.recognisedTotal} className="font-semibold text-foreground" />
            </li>
            <li>
              {t('payTreasury.exp.ins.avgDay')} <CurrencyText amount={avg} className="font-semibold text-foreground" />
            </li>
            {peak && peak.amount > 0 ? (
              <li>
                {t('payTreasury.exp.ins.peak')} <span className="font-semibold text-foreground">{dayAxisLabel(peak.date, lang)}</span> ·{' '}
                <CurrencyText amount={peak.amount} className="font-semibold text-foreground" />
              </li>
            ) : null}
          </ul>
          <div className="h-[240px]" role="img" aria-label={t('payTreasury.exp.ins.trendAria')}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} minTickGap={24} tickFormatter={(v: string) => dayAxisLabel(v, lang)} />
                <YAxis tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => formatCompactNumber(v)} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                  cursor={{ fill: CHART_CURSOR_FILL }}
                  labelFormatter={(v) => (weekly ? t('payTreasury.exp.ins.weekOf', { date: formatDate(String(v)) }) : formatDate(String(v)))}
                  formatter={(value: number, key) => [
                    formatCurrency(value),
                    String(key).startsWith('prev') || key === 'previous' ? t('payTreasury.exp.ins.prevPeriod') : t('payTreasury.exp.ins.thisPeriod'),
                  ]}
                />
                {mode === 'cumulative' ? (
                  <>
                    <Area type="monotone" dataKey="cumulative" stroke="hsl(var(--chart-1))" strokeWidth={2} fill={`url(#${gradientId})`} />
                    <Line type="monotone" dataKey="prevCumulative" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </>
                ) : (
                  <>
                    <Bar dataKey="amount" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} maxBarSize={18} />
                    <Line type="monotone" dataKey="previous" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </SectionCard>
  );
}

// ── category mix ─────────────────────────────────────────────────────

function CategoryMix({
  summary: s,
  categories,
  lang,
  activeCategoryId,
  onCategory,
}: Props & { summary: ExpenseSummaryView }) {
  const { t } = useTranslation();
  const rows = s.byCategory;
  const total = s.recognisedTotal;
  const leader = rows[0];

  return (
    <SectionCard icon={PieIcon} title={t('payTreasury.exp.byCategory')} meta={t('payTreasury.exp.byCategoryHint')}>
      {rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t('payTreasury.exp.noSpend')}</p>
      ) : (
        <div className="space-y-3">
          <div className="relative mx-auto h-[150px] w-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={rows} dataKey="amount" nameKey="nameEn" innerRadius={52} outerRadius={72} paddingAngle={2} stroke="none" isAnimationActive={false}>
                  {rows.map((r) => (
                    <Cell
                      key={r.categoryId}
                      fill={categoryColor(r.categoryId, categories)}
                      opacity={activeCategoryId && activeCategoryId !== r.categoryId ? 0.3 : 1}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-2xs text-muted-foreground">{t('payTreasury.exp.ins.total')}</span>
              <span className="text-sm font-bold tabular-nums">{formatCompactNumber(total)}</span>
              <span className="text-2xs text-muted-foreground">{t('payTreasury.exp.ins.categories', { count: rows.length })}</span>
            </div>
          </div>
          {leader ? (
            <p className="flex items-center justify-center gap-1 text-2xs text-muted-foreground">
              <Crown className="h-3 w-3 text-accent" aria-hidden="true" />
              {t('payTreasury.exp.ins.leader', { name: categoryName(leader, lang), pct: total > 0 ? Math.round((leader.amount / total) * 100) : 0 })}
            </p>
          ) : null}
          <ul className="space-y-1">
            {rows.map((r) => {
              const pct = total > 0 ? Math.round((r.amount / total) * 100) : 0;
              const active = activeCategoryId === r.categoryId;
              return (
                <li key={r.categoryId}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => onCategory(active ? '' : r.categoryId)}
                    className={cn(
                      'w-full rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60',
                      active && 'bg-primary/5 ring-1 ring-primary/30',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: categoryColor(r.categoryId, categories) }} aria-hidden="true" />
                        <span className="truncate">{categoryName(r, lang)}</span>
                        {r.kind !== 'OPERATING' ? (
                          <span className="shrink-0 rounded bg-muted px-1 text-2xs text-muted-foreground" title={t(`payTreasury.exp.kindHint.${r.kind}`)}>
                            {t(`payTreasury.exp.kind.${r.kind}`)}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-baseline gap-2">
                        <span className="w-8 text-right text-2xs tabular-nums text-muted-foreground">{pct}%</span>
                        <CurrencyText amount={r.amount} className="text-sm font-semibold" />
                      </span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div
                        className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                        style={{ width: `${Math.max(2, pct)}%`, background: categoryColor(r.categoryId, categories) }}
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

// ── P&L ──────────────────────────────────────────────────────────────

function ProfitLossCard({ pnl, loading, lang }: { pnl: ProfitLossView | undefined; loading: boolean; lang: 'lo' | 'en' }) {
  const { t } = useTranslation();
  if (loading || !pnl) return <Skeleton className="h-full min-h-[300px] rounded-xl" />;

  const base = Math.max(pnl.revenue, 1);
  const lines: { key: string; label: string; amount: number; hint?: string; tone: string }[] = [
    { key: 'refunds', label: t('payTreasury.exp.pnl.refunds'), amount: pnl.refunds, tone: 'bg-muted-foreground/40' },
    { key: 'cogs', label: t('payTreasury.exp.pnl.cogs'), amount: pnl.cogs, hint: t('payTreasury.exp.pnl.cogsHint'), tone: 'bg-[hsl(var(--chart-6))]' },
    { key: 'shrinkage', label: t('payTreasury.exp.pnl.shrinkage'), amount: pnl.shrinkage, hint: t('payTreasury.exp.pnl.shrinkageHint'), tone: 'bg-[hsl(var(--chart-4))]' },
    { key: 'labour', label: t('payTreasury.exp.pnl.labourShort'), amount: pnl.labour.total, tone: 'bg-[hsl(var(--chart-3))]' },
    { key: 'operating', label: t('payTreasury.exp.pnl.operating'), amount: pnl.operating.total, tone: 'bg-[hsl(var(--chart-2))]' },
  ];
  const profit = pnl.netProfit >= 0;
  const period = pnl.from === pnl.to ? monthLabel(pnl.from, lang) : `${monthLabel(pnl.from, lang)} – ${monthLabel(pnl.to, lang)}`;
  const opsRatio = pnl.revenue > 0 ? Math.round((pnl.operating.total / pnl.revenue) * 100) : null;

  return (
    <SectionCard icon={Scale} title={t('payTreasury.exp.pnl.title')} meta={period}>
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-2">
          <div>
            <p className="text-2xs text-muted-foreground">{t('payTreasury.exp.pnl.net')}</p>
            <p className={cn('text-2xl font-bold tabular-nums leading-tight', profit ? 'text-success' : 'text-destructive')}>
              <CurrencyText amount={pnl.netProfit} />
            </p>
          </div>
          <span
            className={cn('rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', profit ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive')}
            title={t('payTreasury.exp.pnl.margin')}
          >
            {t('payTreasury.exp.pnl.marginShort')} {(pnl.netMargin * 100).toFixed(1)}%
          </span>
        </div>

        {/* Revenue as the 100% track; each cost eats a slice of it — a waterfall read left to right. */}
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span>{t('payTreasury.exp.pnl.revenue')}</span>
            <CurrencyText amount={pnl.revenue} className="font-semibold" />
          </div>
          <div className="mt-1 flex h-2.5 overflow-hidden rounded-full bg-success/25" role="img" aria-label={t('payTreasury.exp.pnl.waterfallAria')}>
            {lines.map((l) => (
              <span key={l.key} className={cn('h-full', l.tone)} style={{ width: `${Math.min(100, (l.amount / base) * 100)}%` }} title={l.label} />
            ))}
          </div>
        </div>

        <dl className="divide-y divide-border/60 text-sm">
          {lines.map((l) => (
            <div key={l.key} className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="flex min-w-0 items-center gap-1.5">
                <span className={cn('h-2 w-2 shrink-0 rounded-sm', l.tone)} aria-hidden="true" />
                <span className="truncate">− {l.label}</span>
                {l.hint ? <span className="shrink-0 text-2xs text-muted-foreground">{l.hint}</span> : null}
              </dt>
              <dd className="flex shrink-0 items-baseline gap-2">
                <span className="text-2xs tabular-nums text-muted-foreground">{pnl.revenue > 0 ? `${Math.round((l.amount / pnl.revenue) * 100)}%` : '—'}</span>
                <CurrencyText amount={l.amount} />
              </dd>
            </div>
          ))}
        </dl>
        {opsRatio != null ? (
          <p className="text-2xs text-muted-foreground">{t('payTreasury.exp.pnl.opsRatio', { pct: opsRatio })}</p>
        ) : null}
        {pnl.inventoryPurchasesMemo > 0 ? (
          <p className="rounded-md bg-muted/60 px-2 py-1.5 text-2xs text-muted-foreground">
            {t('payTreasury.exp.pnl.memoAmount')} <CurrencyText amount={pnl.inventoryPurchasesMemo} className="font-medium text-foreground" />
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

// ── ranks ────────────────────────────────────────────────────────────

function RankList({ rows, empty }: { rows: { key: string; label: string; sub?: string; amount: number; onClick?: () => void; lead?: ReactNode }[]; empty: string }) {
  const max = rows.reduce((m, r) => Math.max(m, r.amount), 0);
  if (rows.length === 0) return <p className="py-12 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="space-y-2">
      {rows.map((r, i) => {
        const body = (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                {r.lead ?? <span className="w-4 text-right text-2xs tabular-nums text-muted-foreground">{i + 1}</span>}
                <span className="min-w-0">
                  <span className="block truncate text-sm">{r.label}</span>
                  {r.sub ? <span className="block truncate text-2xs text-muted-foreground">{r.sub}</span> : null}
                </span>
              </span>
              <CurrencyText amount={r.amount} className="shrink-0 text-sm font-semibold" />
            </div>
            <div className="ml-6 mt-1 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className={cn('h-full rounded-full', i === 0 ? 'bg-primary' : 'bg-primary/45')} style={{ width: `${max > 0 ? Math.max(3, (r.amount / max) * 100) : 0}%` }} />
            </div>
          </>
        );
        return (
          <li key={r.key}>
            {r.onClick ? (
              <button type="button" onClick={r.onClick} className="w-full rounded-md px-1 py-0.5 text-left transition-colors hover:bg-muted/60">
                {body}
              </button>
            ) : (
              <div className="px-1 py-0.5">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function BranchCard({ summary: s }: { summary: ExpenseSummaryView }) {
  const { t } = useTranslation();
  return (
    <SectionCard icon={Building2} title={t('payTreasury.exp.ins.byBranch')}>
      <RankList
        empty={t('payTreasury.exp.noSpend')}
        rows={s.byBranch.map((b) => ({
          key: b.branchId,
          label: b.branchName,
          sub: t('payTreasury.exp.ins.items', { count: b.count }),
          amount: b.amount,
        }))}
      />
    </SectionCard>
  );
}

function SupplierCard({ summary: s }: { summary: ExpenseSummaryView }) {
  const { t } = useTranslation();
  return (
    <SectionCard icon={Store} title={t('payTreasury.exp.ins.suppliers')}>
      <RankList
        empty={t('payTreasury.exp.ins.noSuppliers')}
        rows={s.topSuppliers.map((x) => ({
          key: x.supplierId,
          label: x.name,
          sub: t('payTreasury.exp.ins.items', { count: x.count }),
          amount: x.amount,
        }))}
      />
    </SectionCard>
  );
}

function LargestCard({
  summary: s,
  categories,
  onOpen,
}: {
  summary: ExpenseSummaryView;
  categories: ExpenseCategoryView[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const codeOf = (id: string) => categories.find((c) => c.id === id)?.code;
  return (
    <SectionCard icon={Trophy} title={t('payTreasury.exp.ins.largest')}>
      <RankList
        empty={t('payTreasury.exp.noSpend')}
        rows={s.largest.map((x) => ({
          key: x.id,
          label: x.title,
          sub: formatDate(x.expenseDate),
          amount: x.amount,
          onClick: () => onOpen(x.id),
          lead: <CategoryGlyph code={codeOf(x.categoryId)} color={categoryColor(x.categoryId, categories)} size="sm" />,
        }))}
      />
    </SectionCard>
  );
}

// ── E2 ງົບປະມານ ───────────────────────────────────────────────────────

/**
 * Budget vs actual as bullet bars — one row per budgeted category, the budget is the 100% tick,
 * overspend runs past it in red. Sorted by how far over (or close to) budget each line is, so the
 * problem rows are on top.
 */
function BudgetCard({
  summary: s,
  categories,
  lang,
  onSetBudgets,
  className,
}: {
  summary: ExpenseSummaryView;
  categories: ExpenseCategoryView[];
  lang: 'lo' | 'en';
  onSetBudgets?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const b = s.budget;
  const rows = b
    ? [...b.byCategory].sort((x, y) => y.actual / Math.max(1, y.budget) - x.actual / Math.max(1, x.budget))
    : [];
  const actual = rows.reduce((a, r) => a + r.actual, 0);
  // Recognised spend in categories that have no budget line at all.
  const unbudgeted = b ? s.byCategory.filter((c) => !b.byCategory.some((x) => x.categoryId === c.categoryId)) : [];
  return (
    <SectionCard
      icon={Target}
      title={t('payTreasury.exp.ins.budget')}
      meta={b ? t('payTreasury.exp.ins.budgetMeta', { count: b.months.length }) : undefined}
      className={className}
      action={
        onSetBudgets ? (
          <Button size="sm" variant="ghost" className="h-7 text-2xs" onClick={onSetBudgets}>
            {t('payTreasury.exp.ins.editBudgets')}
          </Button>
        ) : null
      }
    >
      {!b ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-sm text-muted-foreground">{t('payTreasury.exp.ins.noBudget')}</p>
          {onSetBudgets ? (
            <Button size="sm" onClick={onSetBudgets}>
              {t('payTreasury.exp.ins.setBudgets')}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-2xs text-muted-foreground">
            <span>
              {t('payTreasury.exp.ins.budgetTotal')} <CurrencyText amount={b.total} className="font-semibold text-foreground" />
            </span>
            <span>
              {t('payTreasury.exp.ins.actual')} <CurrencyText amount={actual} className="font-semibold text-foreground" />
            </span>
            <span className={TONE[budgetTone(actual, b.total)].text}>
              {b.total > 0 ? Math.round((actual / b.total) * 100) : 0}%
            </span>
          </div>
          <ul className="space-y-2.5">
            {rows.map((r) => {
              const c = categories.find((x) => x.id === r.categoryId);
              const pct = r.budget > 0 ? (r.actual / r.budget) * 100 : 0;
              const tone = TONE[budgetTone(r.actual, r.budget)];
              return (
                <li key={r.categoryId}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: categoryColor(r.categoryId, categories) }} aria-hidden="true" />
                      <span className="truncate">{c ? categoryName(c, lang) : '—'}</span>
                    </span>
                    <span className="flex shrink-0 items-baseline gap-2 text-2xs">
                      <span className={cn('font-semibold tabular-nums', tone.text)}>{Math.round(pct)}%</span>
                      <span className="tabular-nums text-muted-foreground">
                        <CurrencyText amount={r.actual} className="font-medium text-foreground" /> / <CurrencyText amount={r.budget} />
                      </span>
                    </span>
                  </div>
                  {/* bullet: track = 125% of budget so overspend has room; tick at the budget */}
                  <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={t('payTreasury.exp.ins.budgetRowAria', { pct: Math.round(pct) })}>
                    <span className={cn('absolute inset-y-0 left-0 rounded-full', tone.bar)} style={{ width: `${Math.min(100, (pct / 125) * 100)}%` }} />
                    <span className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ left: '80%' }} aria-hidden="true" />
                  </div>
                  {r.actual > r.budget ? (
                    <p className="mt-0.5 text-2xs text-destructive">
                      {t('payTreasury.exp.ins.over')} <CurrencyText amount={r.actual - r.budget} />
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {unbudgeted.length > 0 ? (
            <p className="rounded-md bg-muted/60 px-2 py-1.5 text-2xs text-muted-foreground">
              {t('payTreasury.exp.ins.unbudgeted', { list: unbudgeted.map((u) => categoryName(u, lang)).join(', ') })}
            </p>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
