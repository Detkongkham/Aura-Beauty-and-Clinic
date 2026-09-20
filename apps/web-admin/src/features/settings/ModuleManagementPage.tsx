import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  LayoutGrid,
  ListChecks,
  Lock,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { NAV_GROUPS, type NavGroup, type NavItem } from '@/components/layout/nav-items';
import { useNavGroups } from '@/components/layout/useNavGroups';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/features/auth/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { cn } from '@/lib/utils';
import { applyOrder, arrayMove, useModuleConfigStore } from '@/store/moduleConfig.store';

import { ModuleStatCard, type ModuleStatTone } from './components/ModuleStatCard';
import { SettingsTabs } from './SettingsTabs';

const GROUP_TONES: ModuleStatTone[] = ['primary', 'info', 'success', 'accent'];

/** Whether a group is hidden from the real sidebar — locked groups can never be. */
function isGroupHidden(group: NavGroup, hiddenGroups: string[]): boolean {
  return !group.locked && hiddenGroups.includes(group.labelKey);
}

/** Whether an item is hidden — either directly, or because its whole group is. */
function isItemHidden(group: NavGroup, item: NavItem, hiddenGroups: string[], hiddenItems: string[]): boolean {
  if (item.locked) return false;
  return hiddenItems.includes(item.to) || isGroupHidden(group, hiddenGroups);
}

/**
 * Settings ▸ ຈັດການໂມດູນ — the control room for the sidebar: hide/show and
 * reorder every module (group) and menu item, drag-and-drop or via buttons,
 * search across both, and watch the change land in a live preview immediately.
 * Reads `NAV_GROUPS` (source list); writes only order/visibility overrides to
 * `moduleConfig.store`, which `useNavGroups` applies for the real Sidebar and
 * Topbar mobile nav — so this page never drifts from what actually ships.
 *
 * `locked` entries (Dashboard, the whole Settings module, this page itself)
 * can be reordered but never hidden, so an admin can never lock themself out.
 */
export function ModuleManagementPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const confirm = useConfirm();
  const canManage = hasPermission('settings:manage');

  const {
    groupOrder,
    itemOrder,
    hiddenGroups,
    hiddenItems,
    moveGroup,
    moveItem,
    setGroupOrder,
    setItemOrder,
    toggleGroup,
    toggleItem,
    reset,
  } = useModuleConfigStore();

  const [search, setSearch] = useState('');
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const [dragGroup, setDragGroup] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<{ group: string; to: string } | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [dragOverItem, setDragOverItem] = useState<string | null>(null);

  const allGroupKeys = useMemo(() => NAV_GROUPS.map((g) => g.labelKey), []);
  const orderedGroups = useMemo(
    () =>
      applyOrder(allGroupKeys, groupOrder)
        .map((key) => NAV_GROUPS.find((g) => g.labelKey === key))
        .filter((g): g is NavGroup => g != null),
    [allGroupKeys, groupOrder],
  );

  const previewGroups = useNavGroups(hasPermission);

  const totalItems = NAV_GROUPS.reduce((sum, g) => sum + g.items.length, 0);
  const activeGroupCount = NAV_GROUPS.filter((g) => !isGroupHidden(g, hiddenGroups)).length;
  const hiddenItemCount = NAV_GROUPS.reduce(
    (sum, g) => sum + g.items.filter((it) => isItemHidden(g, it, hiddenGroups, hiddenItems)).length,
    0,
  );
  const isCustomized =
    groupOrder.length > 0 ||
    Object.keys(itemOrder).length > 0 ||
    hiddenGroups.length > 0 ||
    hiddenItems.length > 0;

  const searchLower = search.trim().toLowerCase();

  const sections = orderedGroups
    .map((group) => {
      const groupLabel = t(`nav.${group.labelKey}`);
      const groupNameMatches = !searchLower || groupLabel.toLowerCase().includes(searchLower);
      const orderedItems = applyOrder(
        group.items.map((it) => it.to),
        itemOrder[group.labelKey] ?? [],
      )
        .map((to) => group.items.find((it) => it.to === to))
        .filter((it): it is NavItem => it != null);

      const items = orderedItems.filter((item) => {
        const itemLabel = t(`nav.${item.labelKey}`);
        const nameMatches = groupNameMatches || itemLabel.toLowerCase().includes(searchLower);
        const hiddenOk = !hiddenOnly || isItemHidden(group, item, hiddenGroups, hiddenItems);
        return nameMatches && hiddenOk;
      });

      return { group, groupLabel, items };
    })
    .filter(({ items }) => items.length > 0);

  const handleReset = async () => {
    const ok = await confirm({
      title: t('settings.modules.resetTitle'),
      description: t('settings.modules.resetDesc'),
      confirmLabel: t('settings.modules.resetLayout'),
      destructive: true,
    });
    if (!ok) return;
    reset();
    toast.success(t('settings.modules.resetToast'));
  };

  const onGroupDrop = (targetKey: string) => {
    setDragOverGroup(null);
    if (!dragGroup || dragGroup === targetKey) return;
    const keys = orderedGroups.map((g) => g.labelKey);
    const from = keys.indexOf(dragGroup);
    const to = keys.indexOf(targetKey);
    setGroupOrder(arrayMove(keys, from, to));
    setDragGroup(null);
  };

  const onItemDrop = (group: NavGroup, targetTo: string) => {
    setDragOverItem(null);
    if (!dragItem || dragItem.group !== group.labelKey || dragItem.to === targetTo) return;
    const keys = applyOrder(
      group.items.map((it) => it.to),
      itemOrder[group.labelKey] ?? [],
    );
    const from = keys.indexOf(dragItem.to);
    const to = keys.indexOf(targetTo);
    setItemOrder(group.labelKey, arrayMove(keys, from, to));
    setDragItem(null);
  };

  return (
    <div className="space-y-5">
      <StickyPageHeader>
        <div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
            {t('nav.settingsModules')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('settings.modules.subtitle')}</p>
        </div>
        <SettingsTabs active="modules" />
      </StickyPageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ModuleStatCard
          index={0}
          tone="primary"
          icon={LayoutGrid}
          label={t('settings.modules.stat.total')}
          value={NAV_GROUPS.length}
        />
        <ModuleStatCard
          index={1}
          tone="info"
          icon={ListChecks}
          label={t('settings.modules.stat.active')}
          value={activeGroupCount}
          hint={t('settings.modules.stat.activeHint', { count: totalItems })}
        />
        <ModuleStatCard
          index={2}
          tone="warning"
          icon={EyeOff}
          label={t('settings.modules.stat.hidden')}
          value={hiddenItemCount}
          onClick={() => setHiddenOnly((v) => !v)}
          active={hiddenOnly}
        />
        <ModuleStatCard
          index={3}
          tone="accent"
          icon={SlidersHorizontal}
          label={t('settings.modules.stat.layout')}
          value={isCustomized ? t('settings.modules.customized') : t('settings.modules.default')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_264px] lg:items-start">
        <div className="space-y-3 lg:min-w-0">
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('settings.modules.searchPlaceholder')}
                aria-label={t('settings.modules.searchPlaceholder')}
                className="h-10 rounded-lg border-input bg-muted/40 pl-10 pr-8 focus:bg-card"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label={t('settings.modules.clearSearch')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            {hiddenOnly ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setHiddenOnly(false)}
                className="gap-1.5 shrink-0"
              >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                {t('settings.modules.showAll')}
              </Button>
            ) : null}
            {canManage ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="shrink-0 gap-1.5 text-muted-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                {t('settings.modules.resetLayout')}
              </Button>
            ) : null}
          </div>

          {sections.length === 0 ? (
            <EmptyState
              icon={Search}
              title={t('settings.modules.emptyTitle')}
              description={t('settings.modules.emptyDesc')}
            />
          ) : (
            <div className="space-y-3">
              {sections.map(({ group, groupLabel, items }, groupIndex) => {
                const groupHidden = isGroupHidden(group, hiddenGroups);
                const tone = GROUP_TONES[groupIndex % GROUP_TONES.length] ?? 'primary';

                return (
                  <section
                    key={group.labelKey}
                    draggable={canManage}
                    onDragStart={() => setDragGroup(group.labelKey)}
                    onDragOver={(e) => {
                      if (!dragGroup) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverGroup(group.labelKey);
                    }}
                    onDragLeave={() => setDragOverGroup((k) => (k === group.labelKey ? null : k))}
                    onDrop={() => onGroupDrop(group.labelKey)}
                    onDragEnd={() => {
                      setDragGroup(null);
                      setDragOverGroup(null);
                    }}
                    className={cn(
                      'overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all',
                      'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
                      groupHidden && 'opacity-60',
                      dragGroup === group.labelKey && 'opacity-40',
                      dragOverGroup === group.labelKey && dragGroup !== group.labelKey && 'ring-2 ring-primary/50',
                    )}
                    style={{ animationDelay: `${Math.min(groupIndex, 8) * 50}ms` }}
                  >
                    <header className="flex items-center gap-2 px-3 py-3">
                      {canManage ? (
                        <GripVertical
                          className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/60 active:cursor-grabbing"
                          aria-hidden="true"
                        />
                      ) : null}
                      <span
                        className={cn(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                          tone === 'primary' && 'bg-primary/10 text-primary',
                          tone === 'info' && 'bg-info-soft text-info',
                          tone === 'success' && 'bg-success-soft text-success',
                          tone === 'accent' && 'bg-accent-soft text-accent',
                        )}
                      >
                        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h2 className="truncate font-display text-[15px] font-semibold leading-tight text-foreground">
                            {groupLabel}
                          </h2>
                          {group.locked ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                              </TooltipTrigger>
                              <TooltipContent>{t('settings.modules.lockedGroupHint')}</TooltipContent>
                            </Tooltip>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t('settings.modules.itemCount_other', { count: items.length })}
                        </p>
                      </div>
                      {canManage ? (
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={groupIndex === 0}
                            aria-label={t('settings.modules.moveUp')}
                            onClick={() => moveGroup(allGroupKeys, group.labelKey, 'up')}
                          >
                            <ChevronUp className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={groupIndex === sections.length - 1}
                            aria-label={t('settings.modules.moveDown')}
                            onClick={() => moveGroup(allGroupKeys, group.labelKey, 'down')}
                          >
                            <ChevronDown className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          {group.locked ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="ml-1 inline-flex">
                                  <Switch checked disabled onCheckedChange={() => {}} aria-label={groupLabel} />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{t('settings.modules.lockedGroupHint')}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Switch
                              className="ml-1"
                              checked={!groupHidden}
                              aria-label={t('settings.modules.showGroup', { name: groupLabel })}
                              onCheckedChange={() => toggleGroup(group.labelKey)}
                            />
                          )}
                        </div>
                      ) : null}
                    </header>

                    <div className="divide-y divide-border/70 border-t border-border/70 px-3">
                      {items.map((item, itemIndex) => {
                        const Icon = item.icon;
                        const itemHidden = isItemHidden(group, item, hiddenGroups, hiddenItems);
                        const itemLabel = t(`nav.${item.labelKey}`);

                        return (
                          <div
                            key={item.to}
                            draggable={canManage}
                            onDragStart={(e) => {
                              e.stopPropagation();
                              setDragItem({ group: group.labelKey, to: item.to });
                            }}
                            onDragOver={(e) => {
                              if (!dragItem || dragItem.group !== group.labelKey) return;
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = 'move';
                              setDragOverItem(item.to);
                            }}
                            onDragLeave={() => setDragOverItem((k) => (k === item.to ? null : k))}
                            onDrop={(e) => {
                              e.stopPropagation();
                              onItemDrop(group, item.to);
                            }}
                            onDragEnd={(e) => {
                              e.stopPropagation();
                              setDragItem(null);
                              setDragOverItem(null);
                            }}
                            className={cn(
                              'flex items-center gap-2.5 py-2.5 pl-1 pr-1 first:pt-3 last:pb-3 transition-opacity',
                              itemHidden && 'opacity-55',
                              dragItem?.to === item.to && 'opacity-40',
                              dragOverItem === item.to && dragItem?.to !== item.to && 'rounded-lg ring-2 ring-primary/40',
                            )}
                          >
                            {canManage ? (
                              <GripVertical
                                className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground/50 active:cursor-grabbing"
                                aria-hidden="true"
                              />
                            ) : (
                              <span className="w-3.5 shrink-0" />
                            )}
                            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                              {itemLabel}
                            </span>
                            {item.permission ? (
                              <span className="hidden shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground sm:inline-flex">
                                <ShieldCheck className="h-2.5 w-2.5" aria-hidden="true" />
                                {item.permission}
                              </span>
                            ) : null}
                            {item.locked ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                </TooltipTrigger>
                                <TooltipContent>{t('settings.modules.lockedItemHint')}</TooltipContent>
                              </Tooltip>
                            ) : null}
                            {canManage ? (
                              <div className="flex shrink-0 items-center gap-0.5">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled={itemIndex === 0}
                                  aria-label={t('settings.modules.moveUp')}
                                  onClick={() =>
                                    moveItem(
                                      group.labelKey,
                                      group.items.map((it) => it.to),
                                      item.to,
                                      'up',
                                    )
                                  }
                                >
                                  <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  disabled={itemIndex === items.length - 1}
                                  aria-label={t('settings.modules.moveDown')}
                                  onClick={() =>
                                    moveItem(
                                      group.labelKey,
                                      group.items.map((it) => it.to),
                                      item.to,
                                      'down',
                                    )
                                  }
                                >
                                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                                </Button>
                                {item.locked ? (
                                  <span className="ml-1 inline-flex">
                                    <Switch checked disabled onCheckedChange={() => {}} aria-label={itemLabel} />
                                  </span>
                                ) : (
                                  <Switch
                                    className="ml-1"
                                    checked={!itemHidden}
                                    disabled={groupHidden}
                                    aria-label={t('settings.modules.showItem', { name: itemLabel })}
                                    onCheckedChange={() => toggleItem(item.to)}
                                  />
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <SidebarPreview groups={previewGroups} />
      </div>
    </div>
  );
}

/** Compact, live-updating replica of the real sidebar — always reflects the store above. */
function SidebarPreview({ groups }: { groups: NavGroup[] }) {
  const { t } = useTranslation();
  return (
    <aside className="sticky top-24 hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:block">
      <div className="flex items-center gap-1.5 border-b border-border/70 bg-muted/40 px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-destructive/40" aria-hidden="true" />
        <span className="h-2 w-2 rounded-full bg-warning/40" aria-hidden="true" />
        <span className="h-2 w-2 rounded-full bg-success/40" aria-hidden="true" />
        <p className="ml-1 truncate text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('settings.modules.previewTitle')}
        </p>
      </div>
      <nav className="max-h-[560px] space-y-3 overflow-y-auto p-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {groups.map((group) => (
          <div key={group.labelKey}>
            <p className="px-1.5 pb-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground/80">
              {t(`nav.${group.labelKey}`)}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.to}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-primary-subtle/60"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{t(`nav.${item.labelKey}`)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
