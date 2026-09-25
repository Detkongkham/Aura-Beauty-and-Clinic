import { MarkerType, type Edge, type Node } from '@xyflow/react';

import { adminFlow, marketingFlow, messagingFlow, rewardsFlow } from './flows.growth';
import { authFlow, bookingFlow, homeServiceFlow, overviewFlow, queueFlow, treatmentFlow } from './flows.core';
import { expensesFlow, inventoryFlow, paymentsFlow, slipsFlow, treasuryFlow } from './flows.money';
import { statusFlows } from './flows.status';
import type { EdgeKind, Flow, Lane, MapEdge, MapNode } from './systemMap.types';

export const FLOWS: Flow[] = [
  overviewFlow,
  authFlow,
  bookingFlow,
  queueFlow,
  treatmentFlow,
  homeServiceFlow,
  paymentsFlow,
  slipsFlow,
  treasuryFlow,
  expensesFlow,
  inventoryFlow,
  rewardsFlow,
  marketingFlow,
  messagingFlow,
  adminFlow,
  ...statusFlows,
];

export const LANE_ORDER: Lane[] = ['customer', 'staff', 'admin', 'system', 'external', 'main', 'exception'];

export const LABEL_W = 150;
export const COL_W = 240;
export const NODE_W = 204;
export const LANE_H = 168;
const ROW_Y = [20, 94] as const;

export interface StepNodeData extends Record<string, unknown> {
  node: MapNode;
  dim: boolean;
  focused: boolean;
  /** Status machines with live counts: rows currently in this state. */
  live?: { count: number; pct: number; color: string };
}

export interface LaneNodeData extends Record<string, unknown> {
  lane: Lane;
  index: number;
}

/** Edge colours are CSS vars so they follow theme tone + dark mode. */
export const EDGE_STYLE: Record<EdgeKind, { color: string; dash?: string }> = {
  data: { color: 'hsl(var(--primary))' },
  status: { color: 'hsl(var(--chart-6))', dash: '6 4' },
  auto: { color: 'hsl(var(--chart-4))', dash: '2 4' },
};

/** Lanes a flow actually uses, in canonical order — empty lanes are dropped so the canvas stays compact. */
export function flowLanes(flow: Flow): Lane[] {
  const used = new Set(flow.nodes.map((n) => n.lane));
  return LANE_ORDER.filter((l) => used.has(l));
}

function position(n: MapNode, lanes: Lane[]) {
  return { x: LABEL_W + n.col * COL_W, y: lanes.indexOf(n.lane) * LANE_H + ROW_Y[n.row ?? 0] };
}

/** Picks the handle pair so an edge leaves/enters on the side facing its partner. */
function handles(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dy) < 10) return dx > 0 ? { s: 'sr', t: 'tl' } : { s: 'sb', t: 'tb' };
  if (dx > COL_W * 0.6) return { s: 'sr', t: 'tl' };
  if (dx < -COL_W * 0.6) return { s: 'sl', t: 'tr' };
  return dy > 0 ? { s: 'sb', t: 'tt' } : { s: 'st', t: 'tb' };
}

export function graphSize(flow: Flow): { width: number; height: number } {
  const maxCol = Math.max(0, ...flow.nodes.map((n) => n.col));
  return { width: LABEL_W + (maxCol + 1) * COL_W + 20, height: flowLanes(flow).length * LANE_H };
}

export function neighbours(flow: Flow, id: string): Set<string> {
  const set = new Set([id]);
  for (const e of flow.edges) {
    if (e.from === id) set.add(e.to);
    if (e.to === id) set.add(e.from);
  }
  return set;
}

export function buildGraph(
  flow: Flow,
  opts: {
    lang: 'lo' | 'en';
    focusId: string | null;
    matches: Set<string> | null;
    /** state code → live row count (status machines only) */
    live?: Record<string, number> | null;
    liveColors?: Record<string, string>;
  },
): { nodes: Node[]; edges: Edge[] } {
  const lanes = flowLanes(flow);
  const { width } = graphSize(flow);
  const lit = opts.focusId ? neighbours(flow, opts.focusId) : opts.matches;
  const liveTotal = opts.live ? Object.values(opts.live).reduce((a, b) => a + b, 0) : 0;
  const liveOf = (id: string) => {
    if (!opts.live) return undefined;
    const count = opts.live[id] ?? 0;
    return { count, pct: liveTotal ? count / liveTotal : 0, color: opts.liveColors?.[id] ?? 'hsl(var(--primary))' };
  };

  const laneNodes: Node[] = lanes.map((lane, index) => ({
    id: `lane:${lane}`,
    type: 'lane',
    position: { x: 0, y: index * LANE_H },
    data: { lane, index } satisfies LaneNodeData,
    style: { width, height: LANE_H },
    // Controlled nodes never get `measured` written back without onNodesChange; the minimap
    // skips nodes with no known size, so declare it up front.
    initialWidth: width,
    initialHeight: LANE_H,
    draggable: false,
    selectable: false,
    focusable: false,
    zIndex: -1,
  }));

  const pos = new Map(flow.nodes.map((n) => [n.id, position(n, lanes)]));

  const stepNodes: Node[] = flow.nodes.map((n) => ({
    id: n.id,
    type: 'step',
    position: pos.get(n.id)!,
    data: {
      node: n,
      dim: lit ? !lit.has(n.id) : false,
      focused: opts.focusId === n.id,
      live: liveOf(n.id),
    } satisfies StepNodeData,
    style: { width: NODE_W },
    initialWidth: NODE_W,
    initialHeight: 60,
  }));

  const edges: Edge[] = flow.edges.map((e: MapEdge, i) => {
    const a = pos.get(e.from)!;
    const b = pos.get(e.to)!;
    const h = handles(a, b);
    const s = EDGE_STYLE[e.kind];
    const on = opts.focusId ? e.from === opts.focusId || e.to === opts.focusId : !lit || (lit.has(e.from) && lit.has(e.to));
    return {
      id: `${e.from}->${e.to}#${i}`,
      source: e.from,
      target: e.to,
      sourceHandle: h.s,
      targetHandle: h.t,
      type: 'smoothstep',
      animated: e.kind === 'auto' && on,
      label: e.label?.[opts.lang],
      labelStyle: { fontSize: 10, fill: 'hsl(var(--muted-foreground))' },
      labelBgStyle: { fill: 'hsl(var(--card))', fillOpacity: 0.92 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      style: {
        stroke: s.color,
        strokeWidth: opts.focusId && on ? 2.2 : 1.5,
        strokeDasharray: s.dash,
        opacity: on ? 1 : 0.15,
      },
      markerEnd: { type: MarkerType.ArrowClosed, color: s.color, width: 16, height: 16 },
      zIndex: on ? 1 : 0,
    };
  });

  return { nodes: [...laneNodes, ...stepNodes], edges };
}

/** Case-insensitive search over both languages, APIs, screens and status codes. */
export function nodeMatches(n: MapNode, q: string): boolean {
  const hay = [
    n.title.lo,
    n.title.en,
    n.desc.lo,
    n.desc.en,
    n.route,
    n.screen,
    n.job,
    ...(n.apis ?? []),
    ...(n.statuses ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}
