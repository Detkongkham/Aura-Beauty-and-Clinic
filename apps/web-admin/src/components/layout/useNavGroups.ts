import type { Permission } from '@/lib/rbac';
import { applyOrder, useModuleConfigStore } from '@/store/moduleConfig.store';

import { NAV_GROUPS, type NavGroup } from './nav-items';

/**
 * Sidebar/mobile-nav source of truth: `NAV_GROUPS` filtered by permission,
 * then reordered/filtered again by the admin's Settings ▸ ຈັດການໂມດູນ overrides
 * (`moduleConfig.store`). Keep Sidebar.tsx and Topbar.tsx's mobile nav both
 * calling this instead of `NAV_GROUPS` directly so the two never drift.
 *
 * `locked` groups/items (nav-items.ts) are never hidden here even if a stale
 * persisted value says otherwise — that's what guarantees an admin can always
 * navigate back to Settings ▸ ຈັດການໂມດູນ to undo a mistake.
 */
export function useNavGroups(hasPermission: (p: Permission) => boolean): NavGroup[] {
  const { groupOrder, itemOrder, hiddenGroups, hiddenItems } = useModuleConfigStore();

  const allGroupKeys = NAV_GROUPS.map((g) => g.labelKey);
  const orderedGroupKeys = applyOrder(allGroupKeys, groupOrder);

  return orderedGroupKeys
    .map((key) => NAV_GROUPS.find((g) => g.labelKey === key))
    .filter((g): g is NavGroup => g != null)
    .filter((g) => g.locked || !hiddenGroups.includes(g.labelKey))
    .map((group) => {
      const visible = group.items
        .filter(
          (it) =>
            (!it.permission || hasPermission(it.permission)) && (it.locked || !hiddenItems.includes(it.to)),
        )
        .map((it) =>
          it.children
            ? { ...it, children: it.children.filter((c) => !c.permission || hasPermission(c.permission)) }
            : it,
        )
        .filter((it) => !it.children || it.children.length > 0);
      const order = applyOrder(
        visible.map((it) => it.to),
        itemOrder[group.labelKey] ?? [],
      );
      const items = order
        .map((to) => visible.find((it) => it.to === to))
        .filter((it): it is NavGroup['items'][number] => it != null);
      return { ...group, items };
    })
    .filter((g) => g.items.length > 0);
}
