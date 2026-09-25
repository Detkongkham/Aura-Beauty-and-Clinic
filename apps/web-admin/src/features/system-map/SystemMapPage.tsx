import '@xyflow/react/dist/style.css';

import {
  Background,
  BackgroundVariant,
  ControlButton,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
} from '@xyflow/react';
import {
  ArrowUpRight,
  ChevronDown,
  CircleDot,
  Clock,
  Code2,
  GitBranch,
  Layers,
  Lock,
  Maximize,
  Monitor,
  Search,
  Smartphone,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsDark } from '@/hooks/useIsDark';
import { cn } from '@/lib/utils';

import { LaneNode, StepNode } from './SystemMapNodes';
import { SystemMapOverview } from './SystemMapOverview';
import { machineKey, useStatusCounts, type MachineCounts } from './systemMap.api';
import { ACTOR_LANES, flowStats, stateColors } from './systemMap.stats';
import { LANE_STYLE } from './systemMap.styles';
import {
  buildGraph,
  EDGE_STYLE,
  FLOWS,
  flowLanes,
  graphSize,
  NODE_W,
  nodeMatches,
} from './systemMap.layout';
import type { EdgeKind, Flow, FlowGroup, MapNode } from './systemMap.types';

type Lang = 'lo' | 'en';

const MIN_READABLE_ZOOM = 0.72;

const NODE_TYPES = { step: StepNode, lane: LaneNode };

const GROUPS: FlowGroup[] = ['overview', 'module', 'status'];

const METHOD_TONE: Record<string, string> = {
  GET: 'bg-chart-1/10 text-chart-1',
  POST: 'bg-chart-4/10 text-chart-4',
  PUT: 'bg-chart-6/10 text-chart-6',
  PATCH: 'bg-chart-6/10 text-chart-6',
  DELETE: 'bg-destructive/10 text-destructive',
};

function useLang(): Lang {
  const { i18n } = useTranslation();
  return i18n.language.startsWith('lo') ? 'lo' : 'en';
}

export function SystemMapPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const flow = FLOWS.find((f) => f.id === params.get('flow')) ?? FLOWS[0]!;
  const nodeId = params.get('node');
  const detail = nodeId ? (flow.nodes.find((n) => n.id === nodeId) ?? null) : null;

  const select = (flowId: string, id: string | null) => {
    const next = new URLSearchParams(params);
    next.set('flow', flowId);
    if (id) next.set('node', id);
    else next.delete('node');
    setParams(next, { replace: true });
  };

  const countsQ = useStatusCounts();
  const counts = countsQ.data;
  const key = machineKey(flow.id);
  const machine = key && counts ? counts.machines[key] : undefined;

  return (
    <div className="space-y-4">
      <PageHeader title={t('systemMap.title')} description={t('systemMap.subtitle')} />

      <SystemMapOverview
        lang={lang}
        activeFlow={flow.id}
        counts={counts}
        countsLoading={countsQ.isLoading}
        countsError={!countsQ.data && (countsQ.isError || countsQ.fetchStatus === 'idle')}
        onRefresh={() => void countsQ.refetch()}
        refreshing={countsQ.isFetching}
        onSelectFlow={(id) => {
          select(id, null);
          document.getElementById('sm-canvas')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />

      <div id="sm-canvas" className="grid scroll-mt-20 gap-4 lg:grid-cols-[288px_minmax(0,1fr)]">
        <FlowList active={flow.id} lang={lang} counts={counts?.machines} onSelect={(id) => select(id, null)} />
        <ReactFlowProvider>
          <Canvas flow={flow} lang={lang} focusId={detail?.id ?? null} machine={machine} onSelect={select} />
        </ReactFlowProvider>
      </div>

      <NodeSheet
        flow={flow}
        node={detail}
        lang={lang}
        machine={machine}
        onClose={() => select(flow.id, null)}
        onJump={(id) => select(flow.id, id)}
      />
    </div>
  );
}

const GROUP_ICON: Record<FlowGroup, LucideIcon> = { overview: GitBranch, module: Layers, status: CircleDot };

function FlowList({
  active,
  lang,
  counts,
  onSelect,
}: {
  active: string;
  lang: Lang;
  counts: Record<string, MachineCounts> | undefined;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('systemMap.title')}
      className="max-h-[22rem] overflow-y-auto rounded-2xl border border-border bg-card p-2 shadow-sm lg:max-h-[calc(100dvh-16rem)]"
    >
      {GROUPS.map((g) => (
        <div key={g} className="mb-2 last:mb-0">
          <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">
            {(() => {
              const GIcon = GROUP_ICON[g];
              return <GIcon className="h-3.5 w-3.5" aria-hidden="true" />;
            })()}
            {t(`systemMap.groups.${g}`)}
            <span className="ml-auto tabular-nums">{FLOWS.filter((f) => f.group === g).length}</span>
          </div>
          <ul className="space-y-0.5">
            {FLOWS.filter((f) => f.group === g).map((f) => {
              const on = f.id === active;
              const live = counts?.[machineKey(f.id) ?? ''];
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(f.id)}
                    aria-current={on ? 'page' : undefined}
                    className={cn(
                      'relative flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      on ? 'bg-primary/10' : 'hover:bg-muted/60',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-sm font-medium leading-snug', on ? 'text-primary' : 'text-foreground')}>
                        {f.title[lang]}
                      </span>
                      {lang === 'lo' ? (
                        <span className="block truncate text-[11px] text-muted-foreground">{f.title.en}</span>
                      ) : null}
                      {f.group === 'status' ? null : <LaneStrip flow={f} />}
                    </span>
                    <span
                      title={live ? t('systemMap.live.rows') : t('systemMap.stats.steps')}
                      className={cn(
                        'grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                        on ? 'bg-primary text-primary-foreground' : live ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {live ? compact(live.total) : f.nodes.length}
                    </span>
                    {on ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** Tiny stacked bar of which actor lanes a flow touches. */
function LaneStrip({ flow }: { flow: Flow }) {
  const { byLane, steps } = flowStats(flow);
  return (
    <span className="mt-1 flex h-1 w-full max-w-[140px] overflow-hidden rounded-full bg-muted" aria-hidden="true">
      {ACTOR_LANES.map((l) =>
        byLane[l] ? <span key={l} className="h-full" style={{ width: `${(byLane[l]! / steps) * 100}%`, background: LANE_STYLE[l].color }} /> : null,
      )}
    </span>
  );
}

interface Hit {
  flow: Flow;
  node: MapNode;
}

function Canvas({
  flow,
  lang,
  focusId,
  machine,
  onSelect,
}: {
  flow: Flow;
  lang: Lang;
  focusId: string | null;
  machine: MachineCounts | undefined;
  onSelect: (flowId: string, nodeId: string | null) => void;
}) {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const rf = useReactFlow();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const paneRef = useRef<HTMLDivElement>(null);
  const q = query.trim().toLowerCase();

  const matches = useMemo(
    () => (q ? new Set(flow.nodes.filter((n) => nodeMatches(n, q)).map((n) => n.id)) : null),
    [flow, q],
  );
  const hits = useMemo<Hit[]>(
    () =>
      q
        ? FLOWS.flatMap((f) => f.nodes.filter((n) => nodeMatches(n, q)).map((node) => ({ flow: f, node }))).slice(0, 40)
        : [],
    [q],
  );

  const colors = useMemo(() => stateColors(flow), [flow]);
  const graph = useMemo(
    () => buildGraph(flow, { lang, focusId, matches, live: machine?.states ?? null, liveColors: colors }),
    [flow, lang, focusId, matches, machine, colors],
  );


  // Re-frame whenever the flow changes; centre on a node picked from search or a deep link.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const target = focusId ? graph.nodes.find((n) => n.id === focusId) : null;
      if (target) rf.setCenter(target.position.x + NODE_W / 2, target.position.y + 36, { zoom: 1.05, duration: 400 });
      else frame();
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on flow/focus change, not every re-dim
  }, [flow.id, focusId]);

  /**
   * Fit-to-view shrinks wide flows until the boxes are unreadable, so the zoom is floored at
   * MIN_READABLE_ZOOM; when the floor kicks in, the flow starts from its left edge (the lane
   * labels) and the user pans right, like reading a timeline.
   */
  const frame = () => {
    const el = paneRef.current;
    if (!el) return;
    const { width: gw, height: gh } = graphSize(flow);
    const W = el.clientWidth;
    const H = el.clientHeight;
    const zoom = Math.min(1, Math.max(MIN_READABLE_ZOOM, Math.min(W / gw, H / gh) * 0.94));
    const x = gw * zoom < W ? (W - gw * zoom) / 2 : 12;
    const y = gh * zoom < H ? (H - gh * zoom) / 2 : 12;
    void rf.setViewport({ x, y, zoom }, { duration: 300 });
  };

  const onNodeClick = (_: unknown, n: Node) => {
    if (n.type === 'step') onSelect(flow.id, n.id);
  };

  const lanes = flowLanes(flow);

  return (
    <section className="relative flex h-[calc(100dvh-12rem)] min-h-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 motion-reduce:animate-none">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-sm shadow-primary/30">
          <Workflow className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-tight text-foreground">{flow.title[lang]}</h2>
          <p className="truncate text-xs text-muted-foreground">{flow.summary[lang]}</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            placeholder={t('systemMap.search')}
            aria-label={t('systemMap.search')}
            className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
          {query ? (
            <button
              type="button"
              aria-label={t('common.clear', { defaultValue: 'Clear' })}
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          {searchOpen && q ? (
            <div className="absolute right-0 top-11 z-20 max-h-80 w-full overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg sm:w-96">
              {hits.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">{t('systemMap.noResults')}</p>
              ) : (
                hits.map(({ flow: f, node: n }) => {
                  const s = LANE_STYLE[n.lane];
                  return (
                    <button
                      key={`${f.id}:${n.id}`}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onSelect(f.id, n.id);
                        setSearchOpen(false);
                      }}
                      className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-muted"
                    >
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', s.dot)} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">{n.title[lang]}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{f.title[lang]}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      </div>

      <FlowInsightStrip flow={flow} lang={lang} machine={machine} onPick={(id) => onSelect(flow.id, id)} />

      <div ref={paneRef} className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={NODE_TYPES}
          onNodeClick={onNodeClick}
          onPaneClick={() => focusId && onSelect(flow.id, null)}
          colorMode={isDark ? 'dark' : 'light'}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          minZoom={0.2}
          maxZoom={1.8}
          proOptions={{ hideAttribution: true }}
          style={{ background: 'transparent', ['--xy-background-color' as string]: 'transparent' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="hsl(var(--border))" />
          <Controls showInteractive={false} showFitView={false} position="top-right">
            <ControlButton onClick={frame} title={t('systemMap.fit')} aria-label={t('systemMap.fit')}>
              <Maximize className="h-3 w-3" />
            </ControlButton>
          </Controls>
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            className="!hidden !rounded-lg !border !border-border !bg-card md:!block"
            maskColor={isDark ? 'rgba(0,0,0,0.45)' : 'rgba(240,242,250,0.65)'}
            nodeColor={(n) => (n.type === 'lane' ? 'transparent' : LANE_STYLE[(n.data as { node: MapNode }).node.lane].color)}
            nodeStrokeWidth={0}
          />
        </ReactFlow>

        <Legend open={legendOpen} onToggle={() => setLegendOpen((v) => !v)} lanes={lanes} />

        {matches ? (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-foreground/85 px-3 py-1 text-xs text-background shadow-lg backdrop-blur animate-in fade-in zoom-in-95 motion-reduce:animate-none">
            {t('systemMap.matchCount', { count: matches.size })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function FlowInsightStrip({
  flow,
  lang,
  machine,
  onPick,
}: {
  flow: Flow;
  lang: Lang;
  machine: MachineCounts | undefined;
  onPick: (nodeId: string) => void;
}) {
  const { t } = useTranslation();
  const st = useMemo(() => flowStats(flow), [flow]);

  if (flow.group === 'status') {
    const colors = stateColors(flow);
    const states = [...flow.nodes].sort((a, b) => a.col - b.col || (a.lane === 'main' ? -1 : 1));
    const total = machine?.total ?? 0;
    const done = machine ? flow.nodes.filter((n) => n.tone === 'success').reduce((s, n) => s + (machine.states[n.id] ?? 0), 0) : 0;
    const exits = machine ? flow.nodes.filter((n) => n.lane === 'exception').reduce((s, n) => s + (machine.states[n.id] ?? 0), 0) : 0;
    return (
      <div className="space-y-2 border-b border-border bg-muted/20 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Metric icon={CircleDot} label={t('systemMap.stats.states')} value={flow.nodes.length} />
          <Metric icon={GitBranch} label={t('systemMap.stats.transitions')} value={flow.edges.length} />
          {machine ? (
            <>
              <Metric icon={Layers} label={t('systemMap.live.rows')} value={total} strong />
              <Metric label={t('systemMap.live.successRate')} value={total ? `${Math.round((done / total) * 100)}%` : '—'} tone="success" />
              <Metric label={t('systemMap.live.exitRate')} value={total ? `${Math.round((exits / total) * 100)}%` : '—'} tone="danger" />
              <Metric label={t('systemMap.live.last30')} value={`+${machine.last30d.toLocaleString('en-US')}`} />
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">{t('systemMap.live.locked')}</span>
          )}
        </div>
        {machine && total > 0 ? (
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            {states.map((n) => {
              const v = machine.states[n.id] ?? 0;
              return v ? (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onPick(n.id)}
                  title={`${n.id} · ${v.toLocaleString('en-US')} (${Math.round((v / total) * 100)}%)`}
                  aria-label={`${n.id} ${v}`}
                  className="h-full border-r-2 border-card transition-opacity last:border-r-0 hover:opacity-80"
                  style={{ width: `${(v / total) * 100}%`, background: colors[n.id] }}
                />
              ) : null;
            })}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-4 py-2.5">
      <Metric icon={Layers} label={t('systemMap.stats.steps')} value={st.steps} strong />
      <Metric icon={Code2} label="API" value={st.apis} />
      <Metric icon={Smartphone} label={t('systemMap.stats.screensShort')} value={st.screens} />
      <Metric icon={Monitor} label={t('systemMap.stats.pages')} value={st.pages} />
      <Metric icon={Clock} label={t('systemMap.stats.jobsShort')} value={st.jobs} />
      <Metric icon={Lock} label={t('systemMap.stats.guarded')} value={st.guarded} />
      <span className="ml-auto hidden h-2 w-40 overflow-hidden rounded-full bg-muted md:flex" role="img" aria-label={t('systemMap.charts.laneMix')}>
        {ACTOR_LANES.map((l) =>
          st.byLane[l] ? (
            <span
              key={l}
              title={`${t(`systemMap.lanes.${l}`)} · ${st.byLane[l]}`}
              className="h-full border-r-2 border-card last:border-r-0"
              style={{ width: `${(st.byLane[l]! / st.steps) * 100}%`, background: LANE_STYLE[l].color }}
            />
          ) : null,
        )}
      </span>
      <span className="sr-only">{flow.title[lang]}</span>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  strong,
  tone,
}: {
  icon?: LucideIcon;
  label: string;
  value: number | string;
  strong?: boolean;
  tone?: 'success' | 'danger';
}) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11px]',
        tone === 'success'
          ? 'border-success/25 bg-success/10 text-success'
          : tone === 'danger'
            ? 'border-destructive/25 bg-destructive/10 text-destructive'
            : 'border-border bg-card text-muted-foreground',
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {label}
      <span className={cn('font-semibold tabular-nums', !tone && 'text-foreground', strong && 'text-[12px]')}>
        {typeof value === 'number' ? value.toLocaleString('en-US') : value}
      </span>
    </span>
  );
}

function Legend({ open, onToggle, lanes }: { open: boolean; onToggle: () => void; lanes: MapNode['lane'][] }) {
  const { t } = useTranslation();
  const kinds: EdgeKind[] = ['data', 'status', 'auto'];
  return (
    <div className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-1.5rem)] rounded-xl border border-border/70 bg-card/80 shadow-lg shadow-foreground/5 backdrop-blur-md sm:max-w-md">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-6 px-3 py-2 text-xs font-semibold text-foreground"
      >
        {t('systemMap.legend.title')}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border px-3 py-2.5 text-[11px] text-muted-foreground">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {lanes.map((l) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', LANE_STYLE[l].dot)} />
                {t(`systemMap.lanes.${l}`)}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {kinds.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5">
                <svg width="22" height="6" aria-hidden="true">
                  <line
                    x1="0"
                    y1="3"
                    x2="22"
                    y2="3"
                    stroke={EDGE_STYLE[k].color}
                    strokeWidth="2"
                    strokeDasharray={EDGE_STYLE[k].dash}
                  />
                </svg>
                {t(`systemMap.legend.${k}`)}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Lock className="h-3 w-3" /> {t('systemMap.legend.locked')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3 text-chart-4" /> {t('systemMap.legend.job')}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NodeSheet({
  flow,
  node,
  lang,
  machine,
  onClose,
  onJump,
}: {
  flow: Flow;
  node: MapNode | null;
  lang: Lang;
  machine: MachineCounts | undefined;
  onClose: () => void;
  onJump: (id: string) => void;
}) {
  const { t } = useTranslation();
  const byId = useMemo(() => new Map(flow.nodes.map((n) => [n.id, n])), [flow]);
  const incoming = node ? flow.edges.filter((e) => e.to === node.id) : [];
  const outgoing = node ? flow.edges.filter((e) => e.from === node.id) : [];
  const s = node ? LANE_STYLE[node.lane] : null;

  return (
    <Sheet open={node != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        {node && s ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <span className={cn('grid h-7 w-7 place-items-center rounded-lg', s.chipSoft)}>
                  <s.icon className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-semibold', s.pill)}>{s.chip}</span>
                <span className="text-xs text-muted-foreground">{t(`systemMap.lanes.${node.lane}`)}</span>
                <span className="ml-auto truncate text-[11px] text-muted-foreground">{flow.title[lang]}</span>
              </div>
              <SheetTitle>{node.title[lang]}</SheetTitle>
              {lang === 'lo' ? <p className="text-xs text-muted-foreground">{node.title.en}</p> : null}
              <SheetDescription>{node.desc[lang]}</SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-5">
              <div className="grid grid-cols-3 gap-2">
                <Fact label="API" value={node.apis?.length ?? 0} />
                <Fact label={t('systemMap.detail.in')} value={incoming.length} />
                <Fact label={t('systemMap.detail.out')} value={outgoing.length} />
              </div>

              {machine ? (
                <LiveStateCard node={node} flow={flow} machine={machine} />
              ) : null}

              {node.route ? (
                <Button asChild className="w-full justify-between">
                  <Link to={node.route}>
                    {t('systemMap.detail.openPage')}
                    <span className="inline-flex items-center gap-1 font-mono text-xs opacity-80">
                      {node.route}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                </Button>
              ) : null}

              {node.apis?.length ? (
                <Section title={t('systemMap.detail.apis')} hint="/api/v1">
                  <ul className="space-y-1">
                    {node.apis.map((a) => {
                      const [method = '', ...rest] = a.split(' ');
                      return (
                        <li key={a} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2 py-1.5">
                          <span
                            className={cn(
                              'w-14 shrink-0 rounded px-1 py-0.5 text-center font-mono text-[10px] font-semibold',
                              METHOD_TONE[method] ?? 'bg-muted text-muted-foreground',
                            )}
                          >
                            {method}
                          </span>
                          <code className="min-w-0 break-all font-mono text-[11.5px] text-foreground">{rest.join(' ')}</code>
                        </li>
                      );
                    })}
                  </ul>
                </Section>
              ) : null}

              {node.screen ? (
                <Section title={t('systemMap.detail.screen')}>
                  <p className="flex items-start gap-2 text-sm text-foreground">
                    <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <code className="font-mono text-xs">{node.screen}</code>
                  </p>
                </Section>
              ) : null}

              {node.job ? (
                <Section title={t('systemMap.detail.job')}>
                  <p className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-chart-4" />
                    <code className="font-mono text-xs text-foreground">{node.job}</code>
                  </p>
                </Section>
              ) : null}

              {node.statuses?.length ? (
                <Section title={t('systemMap.detail.statuses')}>
                  <div className="flex flex-wrap gap-1.5">
                    {node.statuses.map((st) => (
                      <span key={st} className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px]">
                        {st}
                      </span>
                    ))}
                  </div>
                </Section>
              ) : null}

              {node.permission ? (
                <Section title={t('systemMap.detail.permission')}>
                  <p className="flex items-center gap-2 text-sm">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    <code className="font-mono text-xs text-foreground">{node.permission}</code>
                  </p>
                </Section>
              ) : null}

              {incoming.length || outgoing.length ? (
                <Section title={t('systemMap.detail.connections')}>
                  <ul className="space-y-1">
                    {[...incoming.map((e) => ({ e, dir: 'in' as const, other: e.from })), ...outgoing.map((e) => ({ e, dir: 'out' as const, other: e.to }))].map(
                      ({ e, dir, other }, i) => {
                        const o = byId.get(other);
                        if (!o) return null;
                        return (
                          <li key={`${dir}-${other}-${i}`}>
                            <button
                              type="button"
                              onClick={() => onJump(other)}
                              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                            >
                              <span className="w-4 text-center text-muted-foreground">{dir === 'in' ? '←' : '→'}</span>
                              <span className={cn('h-2 w-2 shrink-0 rounded-full', LANE_STYLE[o.lane].dot)} />
                              <span className="min-w-0 flex-1 truncate text-foreground">
                                {o.lane === 'main' || o.lane === 'exception' ? o.title.en : o.title[lang]}
                              </span>
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {e.label?.[lang] ?? t(`systemMap.legend.${e.kind}`)}
                              </span>
                            </button>
                          </li>
                        );
                      },
                    )}
                  </ul>
                </Section>
              ) : null}
            </SheetBody>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2">
      <div className="text-lg font-semibold leading-none tabular-nums text-foreground">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

/** Live share of rows sitting in this state, against the rest of its machine. */
function LiveStateCard({ node, flow, machine }: { node: MapNode; flow: Flow; machine: MachineCounts }) {
  const { t } = useTranslation();
  const colors = stateColors(flow);
  const count = machine.states[node.id] ?? 0;
  const pct = machine.total ? count / machine.total : 0;
  const rank = [...flow.nodes].sort((a, b) => (machine.states[b.id] ?? 0) - (machine.states[a.id] ?? 0));
  return (
    <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/[0.06] to-card p-3.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">{t('systemMap.live.inState')}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {Math.round(pct * 100)}% · {t('systemMap.live.ofTotal', { total: machine.total.toLocaleString('en-US') })}
        </span>
      </div>
      <div className="mt-1 text-3xl font-semibold leading-none tabular-nums text-foreground">{count.toLocaleString('en-US')}</div>
      <ul className="mt-3 space-y-1.5">
        {rank.map((n) => {
          const v = machine.states[n.id] ?? 0;
          const w = machine.total ? (v / machine.total) * 100 : 0;
          return (
            <li key={n.id} className={cn('text-[11px]', n.id === node.id ? 'text-foreground' : 'text-muted-foreground')}>
              <div className="flex items-center gap-2">
                <span className={cn('w-32 shrink-0 truncate font-mono', n.id === node.id && 'font-semibold')}>{n.id}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${w}%`, background: colors[n.id], opacity: n.id === node.id ? 1 : 0.55 }} />
                </span>
                <span className="w-10 text-right tabular-nums">{v.toLocaleString('en-US')}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <p className="flex items-baseline justify-between text-xs font-semibold text-muted-foreground">
        {title}
        {hint ? <span className="font-mono text-[10px] font-normal">{hint}</span> : null}
      </p>
      {children}
    </section>
  );
}

