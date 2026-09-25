import { describe, expect, it } from 'vitest';

import { buildGraph, FLOWS } from './systemMap.layout';

describe('system map flows', () => {
  it('has unique flow ids', () => {
    expect(new Set(FLOWS.map((f) => f.id)).size).toBe(FLOWS.length);
  });

  it.each(FLOWS.map((f) => [f.id, f] as const))('%s: unique nodes, edges point at real nodes, no overlaps', (_, flow) => {
    const ids = flow.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of flow.edges) {
      expect(ids, `${e.from} -> ${e.to}`).toContain(e.from);
      expect(ids, `${e.from} -> ${e.to}`).toContain(e.to);
    }
    const slots = flow.nodes.map((n) => `${n.lane}:${n.col}:${n.row ?? 0}`);
    expect(new Set(slots).size, slots.join(', ')).toBe(slots.length);
  });

  it('builds a graph for every flow', () => {
    for (const f of FLOWS) {
      const g = buildGraph(f, { lang: 'lo', focusId: null, matches: null });
      expect(g.edges).toHaveLength(f.edges.length);
    }
  });
});
