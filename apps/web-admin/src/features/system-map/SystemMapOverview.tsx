import {
  Activity,
  BarChart3,
  ChevronDown,
  Clock,
  Code2,
  Layers,
  LayoutGrid,
  PieChart as PieIcon,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { Skeleton } from '@/components/ui/skeleton';
import {
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from '@/features/dashboard/chartTheme';
import { cn } from '@/lib/utils';

import { machineKey, type StatusCounts } from './systemMap.api';
import { FLOWS } from './systemMap.layout';
import { ACTOR_LANES, flowStats, HTTP_METHODS, stateColors, SYSTEM_STATS } from './systemMap.stats';
import { LANE_STYLE } from './systemMap.styles';
import type { Flow } from './systemMap.types';

type Lang = 'lo' | 'en';

const COLLAPSE_KEY = 'systemMap.insightsCollapsed';

const METHOD_COLOR: Record<(typeof HTTP_METHODS)[number], string> = {
  GET: 'hsl(var(--chart-1))',
  POST: 'hsl(var(--chart-4))',
  PUT: 'hsl(var(--chart-3))',
  PATCH: 'hsl(var(--chart-6))',
  DELETE: 'hsl(var(--destructive))',
};

const fmt = (n: number) => n.toLocaleString('en-US');

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The insight band above the map: whole-system KPIs, who does the work (lane mix + API
 * verbs), how heavy each module is, and — for SUPER_ADMIN — live record counts per state
 * of every status machine. Every chart doubles as navigation into the matching flow.
 */
export function SystemMapOverview({
  lang,
  activeFlow,
  counts,
  countsLoading,
  countsError,
  onRefresh,
  refreshing,
  onSelectFlow,
}: {
  lang: Lang;
  activeFlow: string;
  counts: StatusCounts | undefined;
  countsLoading: boolean;
  /** true when live counts are unavailable (no permission / request failed) */
  countsError: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  onSelectFlow: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const liveTotal = counts ? Object.values(counts.machines).reduce((s, m) => s + m.total, 0) : null;

  const toggle = () => {
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? '0' : '1');
      } catch {
        /* storage blocked — state still toggles for this visit */
      }
      return !v;
    });
  };

  const s = SYSTEM_STATS;
  const tiles: TileProps[] = [
    { icon: Workflow, label: t('systemMap.stats.modules'), value: s.modules, hint: t('systemMap.stats.modulesHint', { steps: s.steps }), tone: 'primary' },
    { icon: Code2, label: t('systemMap.stats.apis'), value: s.apis, hint: t('systemMap.stats.apisHint', { get: s.byMethod.GET }), tone: 'chart-1' },
    { icon: Smartphone, label: t('systemMap.stats.screens'), value: s.screens, hint: t('systemMap.stats.screensHint', { pages: s.pages }), tone: 'chart-5' },
    { icon: Clock, label: t('systemMap.stats.jobs'), value: s.jobs, hint: t('systemMap.stats.jobsHint'), tone: 'chart-4' },
    { icon: Layers, label: t('systemMap.stats.machines'), value: s.machines, hint: t('systemMap.stats.machinesHint', { states: s.states }), tone: 'chart-3' },
    {
      icon: Activity,
      label: t('systemMap.stats.records'),
      value: liveTotal,
      hint: counts ? t('systemMap.stats.recordsHint', { count: sumLast30(counts) }) : t('systemMap.live.locked'),
      tone: 'chart-6',
      loading: countsLoading,
    },
  ];

  return (
    <section aria-labelledby="sm-insights" className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 id="sm-insights" className="text-sm font-semibold text-foreground">
          {t('systemMap.insights')}
        </h2>
        {counts ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            {t('systemMap.live.badge')}
          </span>
        ) : null}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? t('systemMap.showInsights') : t('systemMap.hideInsights')}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', !collapsed && 'rotate-180')} />
        </button>
      </div>

      {collapsed ? null : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {tiles.map((tile, i) => (
              <StatTile key={tile.label} {...tile} index={i} />
            ))}
          </div>

          <div className="grid gap-3 xl:grid-cols-12">
            <LaneMixCard className="xl:col-span-4" />
            <ComplexityCard className="xl:col-span-8" lang={lang} activeFlow={activeFlow} onSelectFlow={onSelectFlow} />
          </div>

          <StatusHealthCard
            lang={lang}
            activeFlow={activeFlow}
            counts={counts}
            loading={countsLoading}
            unavailable={countsError}
            onRefresh={onRefresh}
            refreshing={refreshing}
            onSelectFlow={onSelectFlow}
          />
        </>
      )}
    </section>
  );
}

function sumLast30(c: StatusCounts) {
  return Object.values(c.machines).reduce((s, m) => s + m.last30d, 0);
}

/* ─── KPI tile ─────────────────────────────────────────────────────────── */

interface TileProps {
  icon: LucideIcon;
  label: string;
  value: number | null;
  hint: string;
  /** Token name: `primary` or `chart-N`. */
  tone: string;
  loading?: boolean;
  index?: number;
}

function StatTile({ icon: Icon, label, value, hint, tone, loading, index = 0 }: TileProps) {
  const color = `hsl(var(--${tone}))`;
  return (
    <div
      style={{ animationDelay: `${index * 55}ms`, '--tile': color } as CSSProperties}
      className="group relative overflow-hidden rounded-2xl border border-border bg-card p-3.5 shadow-sm transition-[transform,box-shadow] duration-200 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 fill-mode-both hover:-translate-y-0.5 hover:shadow-md motion-reduce:animate-none motion-reduce:hover:translate-y-0"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-[0.12] blur-xl transition-opacity group-hover:opacity-20"
        style={{ background: color }}
      />
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ background: `hsl(var(--${tone}) / 0.12)`, color }}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 truncate text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2.5 text-2xl font-semibold leading-none tabular-nums text-foreground">
        {loading ? <Skeleton className="h-6 w-14" /> : value == null ? '—' : fmt(value)}
      </div>
      <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

/* ─── Card frame ───────────────────────────────────────────────────────── */

function CardFrame({
  icon: Icon,
  title,
  subtitle,
  action,
  className,
  delay = 0,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        'flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 motion-reduce:animate-none',
        className,
      )}
    >
      <div className="mb-3 flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold leading-tight text-foreground">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/* ─── Lane mix donut + API verbs ───────────────────────────────────────── */

function LaneMixCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const rows = ACTOR_LANES.map((l) => ({
    key: l,
    label: t(`systemMap.lanes.${l}`),
    value: SYSTEM_STATS.byLane[l] ?? 0,
    color: LANE_STYLE[l].color,
  }));
  const total = rows.reduce((s, r) => s + r.value, 0);
  const methods = HTTP_METHODS.map((m) => ({ m, n: SYSTEM_STATS.byMethod[m] })).filter((x) => x.n > 0);
  const apiTotal = methods.reduce((s, x) => s + x.n, 0);

  return (
    <CardFrame icon={PieIcon} title={t('systemMap.charts.laneMix')} subtitle={t('systemMap.charts.laneMixHint')} className={className} delay={80}>
      <div className="flex flex-1 items-center gap-4">
        <div className="relative h-32 w-32 shrink-0" role="img" aria-label={t('systemMap.charts.laneMix')}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={rows} dataKey="value" nameKey="label" innerRadius={42} outerRadius={62} paddingAngle={3} cornerRadius={5} stroke="none">
                {rows.map((r) => (
                  <Cell key={r.key} fill={r.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number, name: string) => [`${v} · ${Math.round((v / total) * 100)}%`, name]}
                contentStyle={CHART_TOOLTIP_STYLE}
                itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold leading-none tabular-nums text-foreground">{total}</span>
            <span className="mt-1 text-[10px] text-muted-foreground">{t('systemMap.stats.steps')}</span>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-1.5">
          {rows.map((r) => {
            const pct = total ? Math.round((r.value / total) * 100) : 0;
            return (
              <li key={r.key}>
                <div className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: r.color }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{r.label}</span>
                  <span className="tabular-nums text-muted-foreground">{r.value}</span>
                  <span className="w-8 text-right tabular-nums text-muted-foreground">{pct}%</span>
                </div>
                <div className="ml-[18px] mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${pct}%`, background: r.color }} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
          <span className="font-medium text-muted-foreground">{t('systemMap.charts.apiVerbs')}</span>
          <span className="tabular-nums text-muted-foreground">{apiTotal} API</span>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={methods.map((x) => `${x.m} ${x.n}`).join(', ')}>
          {methods.map((x) => (
            <div key={x.m} title={`${x.m} · ${x.n}`} className="h-full border-r-2 border-card last:border-r-0" style={{ width: `${(x.n / apiTotal) * 100}%`, background: METHOD_COLOR[x.m] }} />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {methods.map((x) => (
            <span key={x.m} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: METHOD_COLOR[x.m] }} aria-hidden="true" />
              <span className="font-mono">{x.m}</span>
              <span className="tabular-nums text-foreground">{x.n}</span>
            </span>
          ))}
        </div>
      </div>
    </CardFrame>
  );
}

/* ─── Module complexity stacked bars ───────────────────────────────────── */

function ComplexityCard({
  className,
  lang,
  activeFlow,
  onSelectFlow,
}: {
  className?: string;
  lang: Lang;
  activeFlow: string;
  onSelectFlow: (id: string) => void;
}) {
  const { t } = useTranslation();
  const data = FLOWS.filter((f) => f.group === 'module').map((f) => {
    const st = flowStats(f);
    return { id: f.id, name: f.title[lang], steps: st.steps, apis: st.apis, byLane: st.byLane };
  });
  const max = Math.max(1, ...data.map((d) => d.steps));

  return (
    <CardFrame
      icon={BarChart3}
      title={t('systemMap.charts.complexity')}
      subtitle={t('systemMap.charts.complexityHint')}
      className={className}
      delay={140}
      action={
        <div className="hidden flex-wrap justify-end gap-x-2.5 gap-y-1 text-[10.5px] text-muted-foreground sm:flex">
          {ACTOR_LANES.map((l) => (
            <span key={l} className="inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-[3px]" style={{ background: LANE_STYLE[l].color }} aria-hidden="true" />
              {t(`systemMap.lanes.${l}`)}
            </span>
          ))}
        </div>
      }
    >
      <ul className="flex flex-1 flex-col justify-between gap-1">
        {data.map((d, i) => {
          const on = d.id === activeFlow;
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelectFlow(d.id)}
                aria-current={on ? 'true' : undefined}
                aria-label={`${d.name}: ${d.steps} ${t('systemMap.stats.steps')}, ${d.apis} API`}
                style={{ animationDelay: `${Math.min(i, 14) * 30}ms` }}
                className={cn(
                  'group grid w-full grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_3.5rem] items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors animate-in fade-in slide-in-from-left-1 fill-mode-both motion-reduce:animate-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_4.5rem]',
                  on ? 'bg-primary/[0.07]' : 'hover:bg-muted/60',
                )}
              >
                <span className={cn('truncate text-xs', on ? 'font-semibold text-primary' : 'font-medium text-foreground')} title={d.name}>
                  {d.name}
                </span>
                <span className="flex h-3 overflow-hidden rounded-full bg-muted/60">
                  <span className="flex h-full overflow-hidden rounded-full transition-[width] duration-700" style={{ width: `${(d.steps / max) * 100}%` }}>
                    {ACTOR_LANES.map((l) =>
                      d.byLane[l] ? (
                        <span
                          key={l}
                          title={`${t(`systemMap.lanes.${l}`)} · ${d.byLane[l]}`}
                          className="h-full border-r-2 border-card last:border-r-0 group-hover:brightness-110"
                          style={{ width: `${(d.byLane[l]! / d.steps) * 100}%`, background: LANE_STYLE[l].color }}
                        />
                      ) : null,
                    )}
                  </span>
                </span>
                <span className="text-right text-[11px] tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">{d.steps}</span> · {d.apis} API
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </CardFrame>
  );
}

/* ─── Live status health ───────────────────────────────────────────────── */

function StatusHealthCard({
  lang,
  activeFlow,
  counts,
  loading,
  unavailable,
  onRefresh,
  refreshing,
  onSelectFlow,
}: {
  lang: Lang;
  activeFlow: string;
  counts: StatusCounts | undefined;
  loading: boolean;
  unavailable: boolean;
  onRefresh: () => void;
  refreshing: boolean;
  onSelectFlow: (id: string) => void;
}) {
  const { t } = useTranslation();
  const machines = FLOWS.filter((f) => f.group === 'status');

  return (
    <CardFrame
      icon={ShieldCheck}
      title={t('systemMap.charts.statusHealth')}
      subtitle={counts ? t('systemMap.charts.statusHealthHint') : t('systemMap.live.lockedLong')}
      delay={200}
      action={
        counts ? (
          <button
            type="button"
            onClick={onRefresh}
            aria-label={t('systemMap.live.refresh')}
            title={t('systemMap.live.refresh')}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
          </button>
        ) : null
      }
    >
      <div className="grid gap-x-6 gap-y-3 lg:grid-cols-2">
        {machines.map((f, i) => (
          <MachineRow
            key={f.id}
            flow={f}
            lang={lang}
            active={f.id === activeFlow}
            counts={counts?.machines[machineKey(f.id) ?? '']}
            loading={loading && !unavailable}
            index={i}
            onClick={() => onSelectFlow(f.id)}
          />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
        <LegendDot color="hsl(var(--chart-1))" label={t('systemMap.live.open')} />
        <LegendDot color="hsl(var(--success))" label={t('systemMap.live.success')} />
        <LegendDot color="hsl(var(--warning))" label={t('systemMap.live.warning')} />
        <LegendDot color="hsl(var(--destructive))" label={t('systemMap.live.danger')} />
        {counts ? (
          <span className="ml-auto inline-flex items-center gap-1">
            <LayoutGrid className="h-3 w-3" aria-hidden="true" />
            {t('systemMap.live.updated', { time: new Date(counts.generatedAt).toLocaleTimeString(lang === 'lo' ? 'lo-LA' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) })}
          </span>
        ) : null}
      </div>
    </CardFrame>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

function MachineRow({
  flow,
  lang,
  active,
  counts,
  loading,
  index,
  onClick,
}: {
  flow: Flow;
  lang: Lang;
  active: boolean;
  counts: { states: Record<string, number>; total: number; last30d: number } | undefined;
  loading: boolean;
  index: number;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const colors = stateColors(flow);
  const states = [...flow.nodes].sort((a, b) => a.col - b.col || (a.lane === 'main' ? -1 : 1));
  const total = counts?.total ?? 0;
  const title = flow.title[lang].replace(/^(ສະຖານະ|Status):\s*/, '');
  const summary = counts
    ? states.map((n) => `${n.id} ${counts.states[n.id] ?? 0}`).join(', ')
    : states.map((n) => n.id).join(', ');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      aria-label={`${title}: ${summary}`}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      className={cn(
        'group w-full rounded-xl px-2.5 py-2 text-left transition-colors animate-in fade-in slide-in-from-bottom-1 fill-mode-both motion-reduce:animate-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-primary/[0.07] ring-1 ring-primary/30' : 'hover:bg-muted/60',
      )}
    >
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className={cn('min-w-0 flex-1 truncate text-[13px] font-medium', active ? 'text-primary' : 'text-foreground')}>{title}</span>
        {counts ? (
          <>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              +{fmt(counts.last30d)} <span className="hidden sm:inline">/ 30d</span>
            </span>
            <span className="text-[13px] font-semibold tabular-nums text-foreground">{fmt(total)}</span>
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">{t('systemMap.stats.statesCount', { count: flow.nodes.length })}</span>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-2.5 w-full rounded-full" />
      ) : (
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
          {states.map((n) => {
            const v = counts ? (counts.states[n.id] ?? 0) : 1;
            const denom = counts ? total : flow.nodes.length;
            if (!v || !denom) return null;
            return (
              <div
                key={n.id}
                title={counts ? `${n.id} · ${fmt(v)} (${Math.round((v / denom) * 100)}%)` : n.id}
                className={cn('h-full border-r-2 border-card transition-[width,opacity] duration-700 last:border-r-0', !counts && 'opacity-40')}
                style={{ width: `${(v / denom) * 100}%`, background: colors[n.id] }}
              />
            );
          })}
        </div>
      )}
      {counts && total === 0 ? <p className="mt-1 text-[10.5px] text-muted-foreground">{t('systemMap.live.empty')}</p> : null}
    </button>
  );
}
