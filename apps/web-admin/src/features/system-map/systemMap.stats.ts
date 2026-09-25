import { FLOWS } from './systemMap.layout';
import type { Flow, Lane, MapNode } from './systemMap.types';

export const ACTOR_LANES: Lane[] = ['customer', 'staff', 'admin', 'system', 'external'];
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export interface FlowStats {
  steps: number;
  apis: number;
  screens: number;
  jobs: number;
  pages: number;
  edges: number;
  guarded: number;
  byLane: Partial<Record<Lane, number>>;
}

const uniq = (xs: (string | undefined)[]) => new Set(xs.filter(Boolean) as string[]).size;

/** `A → B · C` screen strings name several components; count each once. */
const screensOf = (nodes: MapNode[]) =>
  nodes.flatMap((n) => (n.screen ? n.screen.split(/\s*(?:·|→)\s*/) : []));

export function flowStats(flow: Flow): FlowStats {
  const byLane: Partial<Record<Lane, number>> = {};
  for (const n of flow.nodes) byLane[n.lane] = (byLane[n.lane] ?? 0) + 1;
  return {
    steps: flow.nodes.length,
    apis: uniq(flow.nodes.flatMap((n) => n.apis ?? [])),
    screens: uniq(screensOf(flow.nodes)),
    jobs: uniq(flow.nodes.map((n) => n.job)),
    pages: uniq(flow.nodes.map((n) => n.route)),
    edges: flow.edges.length,
    guarded: flow.nodes.filter((n) => n.permission).length,
    byLane,
  };
}

export interface SystemStats {
  modules: number;
  machines: number;
  states: number;
  steps: number;
  apis: number;
  screens: number;
  jobs: number;
  pages: number;
  byLane: Record<Lane, number>;
  byMethod: Record<(typeof HTTP_METHODS)[number], number>;
}

/** Whole-map totals — static, so computed once at module load. */
export const SYSTEM_STATS: SystemStats = (() => {
  const modules = FLOWS.filter((f) => f.group === 'module');
  const machines = FLOWS.filter((f) => f.group === 'status');
  const nodes = modules.flatMap((f) => f.nodes);
  const apis = [...new Set(nodes.flatMap((n) => n.apis ?? []))];
  const byLane = Object.fromEntries(ACTOR_LANES.map((l) => [l, 0])) as Record<Lane, number>;
  for (const n of nodes) byLane[n.lane] = (byLane[n.lane] ?? 0) + 1;
  const byMethod = Object.fromEntries(HTTP_METHODS.map((m) => [m, 0])) as SystemStats['byMethod'];
  for (const a of apis) {
    const m = a.split(' ')[0] as keyof typeof byMethod;
    if (m in byMethod) byMethod[m] += 1;
  }
  return {
    modules: modules.length,
    machines: machines.length,
    states: machines.reduce((s, f) => s + f.nodes.length, 0),
    steps: nodes.length,
    apis: apis.length,
    screens: uniq(screensOf(nodes)),
    jobs: uniq(nodes.map((n) => n.job)),
    pages: uniq(nodes.map((n) => n.route)),
    byLane,
    byMethod,
  };
})();

/** Terminal-state bucket used to colour live status bars. */
export type StateBucket = 'open' | 'success' | 'warning' | 'danger';

export function stateBucket(n: MapNode): StateBucket {
  if (n.tone) return n.tone;
  return n.lane === 'exception' ? 'danger' : 'open';
}

export const BUCKET_COLOR: Record<StateBucket, string> = {
  open: 'hsl(var(--chart-1))',
  success: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  danger: 'hsl(var(--destructive))',
};

/**
 * Distinct per-state colours for one machine: open states step through sky/violet/teal,
 * terminal ones keep their semantic colour so red always means a failed exit.
 */
export function stateColors(flow: Flow): Record<string, string> {
  const open = ['hsl(var(--chart-1))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-2))', 'hsl(var(--chart-5))'];
  let i = 0;
  const out: Record<string, string> = {};
  for (const n of [...flow.nodes].sort((a, b) => a.col - b.col)) {
    const b = stateBucket(n);
    out[n.id] = b === 'open' ? open[i++ % open.length]! : BUCKET_COLOR[b];
  }
  return out;
}
