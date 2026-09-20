import { ChevronDown, Crosshair, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Branch, LaoProvinceId } from '@/types/models';

import { LAO_PROVINCES, provinceName } from './lao-provinces';

interface BranchListPanelProps {
  /** Already status-filtered by the page; this panel adds free-text filtering. */
  branches: Branch[];
  className?: string;
  query: string;
  onQueryChange: (v: string) => void;
  selectedProvince: LaoProvinceId | null;
  onSelectProvince: (id: LaoProvinceId | null) => void;
  activeBranchId: string | null;
  onSelectBranch: (id: string) => void;
}

const PROVINCE_ORDER = LAO_PROVINCES.map((p) => p.id);

export function BranchListPanel({
  branches,
  className,
  query,
  onQueryChange,
  selectedProvince,
  onSelectProvince,
  activeBranchId,
  onSelectBranch,
}: BranchListPanelProps) {
  const { t, i18n } = useTranslation();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const textFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) =>
      [b.name, b.code, b.address].some((v) => v.toLowerCase().includes(q)),
    );
  }, [branches, query]);

  const groups = useMemo(() => {
    const byProvince = new Map<LaoProvinceId, Branch[]>();
    for (const b of textFiltered) {
      const list = byProvince.get(b.province) ?? [];
      list.push(b);
      byProvince.set(b.province, list);
    }
    return [...byProvince.entries()]
      .map(([province, list]) => ({
        province,
        list: list.slice().sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort(
        (a, b) =>
          b.list.length - a.list.length ||
          PROVINCE_ORDER.indexOf(a.province) - PROVINCE_ORDER.indexOf(b.province),
      );
  }, [textFiltered]);

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-md border border-border bg-card',
        className,
      )}
    >
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={t('branches.searchPlaceholder')}
            aria-label={t('branches.searchPlaceholder')}
            className="h-9 pl-8"
          />
        </div>
        {selectedProvince ? (
          <button
            type="button"
            onClick={() => onSelectProvince(null)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            {t('branches.allProvinces')} · {provinceName(selectedProvince, i18n.language)} ✕
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t('branches.noResults')}
          </p>
        ) : (
          <ul className="space-y-1">
            {groups.map(({ province, list }) => {
              const isCollapsed = collapsed[province] ?? false;
              const isSelected = selectedProvince === province;
              return (
                <li key={province}>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      data-testid={`branch-group-toggle-${province}`}
                      onClick={() =>
                        setCollapsed((c) => ({ ...c, [province]: !isCollapsed }))
                      }
                      className="flex flex-1 items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left hover:bg-muted/60"
                      aria-expanded={!isCollapsed}
                    >
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none',
                          isCollapsed && '-rotate-90',
                        )}
                        aria-hidden="true"
                      />
                      <span
                        className={cn(
                          'flex-1 truncate text-[13px] font-semibold',
                          isSelected ? 'text-primary' : 'text-foreground',
                        )}
                      >
                        {provinceName(province, i18n.language)}
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {list.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectProvince(isSelected ? null : province)}
                      aria-pressed={isSelected}
                      aria-label={`${t('branches.map.title')} · ${provinceName(province, i18n.language)}`}
                      className={cn(
                        'shrink-0 rounded-md p-1.5',
                        isSelected
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted/60',
                      )}
                    >
                      <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>

                  {isCollapsed ? null : (
                    <ul className="mt-0.5 space-y-0.5 pl-2">
                      {list.map((b) => {
                        const active = b.id === activeBranchId;
                        return (
                          <li key={b.id}>
                            <button
                              type="button"
                              data-testid={`branch-list-item-${b.id}`}
                              onClick={() => onSelectBranch(b.id)}
                              className={cn(
                                'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150 motion-reduce:transition-none',
                                active
                                  ? 'bg-primary/10 ring-1 ring-primary'
                                  : 'hover:bg-muted/60',
                              )}
                              aria-current={active ? 'true' : undefined}
                            >
                              <span
                                className={cn(
                                  'mt-1 h-2 w-2 shrink-0 rounded-full',
                                  b.isActive ? 'bg-success' : 'bg-muted-foreground/40',
                                )}
                                aria-hidden="true"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-medium text-foreground">
                                  {b.name}
                                </span>
                                <span className="block truncate text-[11px] text-muted-foreground">
                                  {b.code} · {provinceName(b.province, i18n.language)}
                                </span>
                              </span>
                              <Badge
                                variant={b.isActive ? 'success' : 'neutral'}
                                className="shrink-0 px-1.5 py-0 text-[10px]"
                              >
                                {b.isActive ? t('branches.active') : t('branches.inactive')}
                              </Badge>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
