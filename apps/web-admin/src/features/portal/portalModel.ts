import type { NavGroup, NavItem } from '@/components/layout/nav-items';

/**
 * Portal launcher state — pins, recently opened modules and the view preference
 * all live in localStorage (per browser, per user of that browser). Everything
 * is wrapped so private mode / blocked storage just means "no memory".
 */

const PINS_KEY = 'aura.portal.pins';
const RECENT_KEY = 'aura.portal.recent';
const VIEW_KEY = 'aura.portal.view';
const RECENT_MAX = 40;

export type PortalView = 'grid' | 'list';

/** One tint per group, cycled from the chart palette so groups read apart at a glance. */
export const TONES = [
  { chip: 'bg-chart-1/10 text-chart-1 ring-chart-1/20', dot: 'bg-chart-1' },
  { chip: 'bg-chart-3/10 text-chart-3 ring-chart-3/20', dot: 'bg-chart-3' },
  { chip: 'bg-chart-4/10 text-chart-4 ring-chart-4/20', dot: 'bg-chart-4' },
  { chip: 'bg-chart-2/15 text-accent-foreground ring-chart-2/30 dark:text-chart-2', dot: 'bg-chart-2' },
  { chip: 'bg-chart-5/10 text-chart-5 ring-chart-5/20', dot: 'bg-chart-5' },
  { chip: 'bg-chart-6/10 text-chart-6 ring-chart-6/20', dot: 'bg-chart-6' },
] as const;

export type Tone = (typeof TONES)[number];

export interface Tile {
  item: NavItem;
  group: string;
  tone: Tone;
}

export interface Section {
  group: NavGroup;
  tone: Tone;
  tiles: Tile[];
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — just won't persist */
  }
}

export function readPins(): string[] {
  const v = readJson(PINS_KEY);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function writePins(pins: string[]) {
  writeJson(PINS_KEY, pins);
}

export function readView(): PortalView {
  return readJson(VIEW_KEY) === 'list' ? 'list' : 'grid';
}

export function writeView(v: PortalView) {
  writeJson(VIEW_KEY, v);
}

export interface Visit {
  path: string;
  at: number;
}

export function readVisits(): Visit[] {
  const v = readJson(RECENT_KEY);
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is Visit =>
      x != null && typeof x === 'object' && typeof x.path === 'string' && typeof x.at === 'number',
  );
}

export function writeVisits(visits: Visit[]) {
  writeJson(RECENT_KEY, visits.slice(0, RECENT_MAX));
}

/** Union of two visit logs, one row per path at its newest time, newest first. */
export function mergeVisits(a: Visit[], b: Visit[]): Visit[] {
  const best = new Map<string, number>();
  for (const v of [...a, ...b]) best.set(v.path, Math.max(best.get(v.path) ?? 0, v.at));
  return [...best.entries()]
    .map(([path, at]) => ({ path, at }))
    .sort((x, y) => y.at - x.at)
    .slice(0, RECENT_MAX);
}

/** Called by AppShell on every route change — newest first, one row per path. */
export function recordVisit(path: string) {
  if (path === '/portal') return;
  const next = [{ path, at: Date.now() }, ...readVisits().filter((v) => v.path !== path)].slice(
    0,
    RECENT_MAX,
  );
  writeJson(RECENT_KEY, next);
}

/** Nested groups (e.g. User settings) open up so each sub-page gets its own tile. */
export function flatten(groups: NavGroup[]): Section[] {
  return groups.map((group, gi) => {
    const tone = TONES[gi % TONES.length] ?? TONES[0];
    const tiles = group.items.flatMap((item) =>
      (item.children?.length ? item.children : [item]).map((it) => ({
        item: it,
        group: group.labelKey,
        tone,
      })),
    );
    return { group, tone, tiles };
  });
}

/** Which module a pathname belongs to — the longest nav path that is it or its parent. */
export function matchTile(path: string, tiles: Tile[]): Tile | undefined {
  let best: Tile | undefined;
  for (const tile of tiles) {
    const to = tile.item.to;
    const hit = to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`);
    if (hit && (!best || to.length > best.item.to.length)) best = tile;
  }
  return best;
}

/** Recent visits folded to one entry per module, newest first. */
export function recentModules(
  visits: Visit[],
  tiles: Tile[],
  limit = 6,
): Array<{ tile: Tile; at: number }> {
  const seen = new Set<string>();
  const out: Array<{ tile: Tile; at: number }> = [];
  for (const v of visits) {
    const tile = matchTile(v.path, tiles);
    if (!tile || tile.item.to === '/portal' || seen.has(tile.item.to)) continue;
    seen.add(tile.item.to);
    out.push({ tile, at: v.at });
    if (out.length >= limit) break;
  }
  return out;
}

/** Hour of day in Asia/Vientiane (UTC+7, no DST) — independent of the viewer's clock zone. */
export function vientianeHour(now = new Date()) {
  return (now.getUTCHours() + 7) % 24;
}
