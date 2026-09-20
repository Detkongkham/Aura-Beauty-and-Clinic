import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/lib/constants';

interface ModuleConfigState {
  /** Custom order of nav group keys (`NavGroup.labelKey`); missing keys fall back to source order. */
  groupOrder: string[];
  /** Custom order of item keys (`NavItem.to`) within each group. */
  itemOrder: Record<string, string[]>;
  /** Group keys hidden from the sidebar entirely. Locked groups are always ignored here. */
  hiddenGroups: string[];
  /** Item keys (`NavItem.to`) hidden from the sidebar. Locked items are always ignored here. */
  hiddenItems: string[];
  moveGroup: (allKeys: string[], key: string, direction: 'up' | 'down') => void;
  moveItem: (groupKey: string, allKeys: string[], key: string, direction: 'up' | 'down') => void;
  /** Drag-and-drop: replace the full group order in one shot. */
  setGroupOrder: (order: string[]) => void;
  /** Drag-and-drop: replace the full item order for one group in one shot. */
  setItemOrder: (groupKey: string, order: string[]) => void;
  /** No-ops when `locked` is true — locked modules/items can never be hidden. */
  toggleGroup: (key: string, locked?: boolean) => void;
  toggleItem: (key: string, locked?: boolean) => void;
  reset: () => void;
}

/** Reorders `source` per `order`, appending anything in `source` that `order` doesn't mention. */
export function applyOrder<T extends string>(source: T[], order: string[]): T[] {
  const known = new Set(source);
  const ordered = order.filter((k): k is T => known.has(k as T));
  const rest = source.filter((k) => !ordered.includes(k));
  return [...ordered, ...rest];
}

/** Moves `key` one slot up/down within `order`; no-op at either edge. */
function move(order: string[], key: string, direction: 'up' | 'down'): string[] {
  const from = order.indexOf(key);
  if (from < 0) return order;
  const to = direction === 'up' ? from - 1 : from + 1;
  return arrayMove(order, from, to);
}

/** Moves the entry at `from` to `to`, shifting the rest — used by both drag-drop and the up/down buttons. */
export function arrayMove<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return list;
  next.splice(to, 0, moved);
  return next;
}

/**
 * Admin-configurable sidebar layout (Settings ▸ ຈັດການໂມດູນ) — persisted per-device.
 * `nav-items.ts` still owns the actual module/menu definitions (icons, routes,
 * permissions, `locked`); this store only holds *order* + *visibility* overrides
 * that `useNavGroups` applies on top of it. Locked keys are rejected here too
 * (not just disabled in the UI) so a stale/tampered persisted value can never
 * hide the admin's own way back into Settings.
 */
export const useModuleConfigStore = create<ModuleConfigState>()(
  persist(
    (set) => ({
      groupOrder: [],
      itemOrder: {},
      hiddenGroups: [],
      hiddenItems: [],
      moveGroup: (allKeys, key, direction) =>
        set((s) => ({ groupOrder: move(applyOrder(allKeys, s.groupOrder), key, direction) })),
      moveItem: (groupKey, allKeys, key, direction) =>
        set((s) => ({
          itemOrder: {
            ...s.itemOrder,
            [groupKey]: move(applyOrder(allKeys, s.itemOrder[groupKey] ?? []), key, direction),
          },
        })),
      setGroupOrder: (order) => set({ groupOrder: order }),
      setItemOrder: (groupKey, order) => set((s) => ({ itemOrder: { ...s.itemOrder, [groupKey]: order } })),
      toggleGroup: (key, locked) => {
        if (locked) return;
        set((s) => ({
          hiddenGroups: s.hiddenGroups.includes(key)
            ? s.hiddenGroups.filter((k) => k !== key)
            : [...s.hiddenGroups, key],
        }));
      },
      toggleItem: (key, locked) => {
        if (locked) return;
        set((s) => ({
          hiddenItems: s.hiddenItems.includes(key)
            ? s.hiddenItems.filter((k) => k !== key)
            : [...s.hiddenItems, key],
        }));
      },
      reset: () => set({ groupOrder: [], itemOrder: {}, hiddenGroups: [], hiddenItems: [] }),
    }),
    { name: STORAGE_KEYS.moduleConfig },
  ),
);
