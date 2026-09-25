import { Building2, Check, ChevronsUpDown, Clock, Globe2, MapPin, Search, Settings2, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { PROVINCE_BY_ID, provinceName } from '@/features/branches/lao-provinces';
import { dayjs } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import { useUiStore } from '@/store/ui.store';
import type { Branch } from '@/types/models';

/** Open right now in the branch's local (Vientiane) clock — handles past-midnight hours. */
function isOpenAt(b: Branch, now: string): boolean {
  if (!b.isActive || !b.openTime || !b.closeTime) return false;
  const { openTime: open, closeTime: close } = b;
  return open === close ? true : open < close ? now >= open && now < close : now >= open || now < close;
}

/** Case/whitespace-insensitive haystack: name, code, address, phone and both province names. */
function searchText(b: Branch): string {
  const p = PROVINCE_BY_ID[b.province];
  return [b.name, b.code, b.address, b.phone, p?.nameLo, p?.nameEn].filter(Boolean).join(' ').toLowerCase();
}

type Option = { id: 'all' } | { id: string; branch: Branch; open: boolean };

/**
 * Branch scope selector (design.md §8 topbar). SUPER_ADMIN can pick "all" or any
 * branch; a BRANCH_ADMIN is pinned to their own branch.
 *
 * Styled as a bordered *scope chip* rather than a bare ghost button: this control
 * silently re-filters every number on every page, so it has to read as a
 * persistent state indicator, not as one more icon in the utility row.
 *
 * The panel is a searchable listbox (name / code / address / phone / province) with
 * per-branch province, hours and live open state, so a growing branch list stays
 * scannable without leaving the page.
 */
export function BranchSwitcher() {
  const { t, i18n } = useTranslation();
  const { user, role, hasPermission } = useAuth();
  const { data: branches = [] } = useBranches();
  const activeBranchId = useUiStore((s) => s.activeBranchId);
  const setActiveBranch = useUiStore((s) => s.setActiveBranch);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const isSuper = role === 'SUPER_ADMIN';
  // Re-evaluated on every open so the open/closed dots never go stale on a long session.
  const nowHhmm = useMemo(() => dayjs().tz().format('HH:mm'), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleBranches = useMemo(() => {
    const list = isSuper ? branches : branches.filter((b) => b.id === user?.branchId);
    return [...list].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  }, [branches, isSuper, user?.branchId]);

  const openCount = visibleBranches.filter((b) => isOpenAt(b, nowHhmm)).length;
  const activeCount = visibleBranches.filter((b) => b.isActive).length;

  const currentBranch = visibleBranches.find((b) => b.id === activeBranchId) ?? null;
  const isAll = isSuper && !currentBranch;
  const current = currentBranch ?? (isSuper ? null : visibleBranches[0] ?? null);
  const currentLabel = current?.name ?? (isSuper ? t('branch.all') : '—');
  const Icon = isAll ? Globe2 : Building2;

  const q = query.trim().toLowerCase();
  const options: Option[] = useMemo(() => {
    const rows = visibleBranches
      .filter((b) => !q || searchText(b).includes(q))
      .map((b) => ({ id: b.id, branch: b, open: isOpenAt(b, nowHhmm) }));
    // "All" stays pinned on top unless the search clearly targets a specific branch.
    return isSuper && !q ? [{ id: 'all' as const }, ...rows] : rows;
  }, [visibleBranches, q, isSuper, nowHhmm]);

  // Reset the cursor to the active scope (or the first hit) whenever the list changes.
  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.id === activeBranchId);
    setCursor(q ? 0 : Math.max(idx, 0));
  }, [open, q, options, activeBranchId]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const pick = (id: string) => {
    setActiveBranch(id);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!options.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => (c + 1) % options.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => (c - 1 + options.length) % options.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setCursor(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setCursor(options.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = options[cursor];
      if (o) pick(o.id);
    }
  };

  const currentOpen = current ? isOpenAt(current, nowHhmm) : false;

  // Single-branch user: the scope is a fact, not a choice — show it, don't fake a menu.
  if (visibleBranches.length <= 1 && !isSuper) {
    return (
      <span className="hidden h-8 shrink-0 items-center gap-1.5 rounded-full border border-border/80 bg-muted/50 px-2.5 text-xs font-semibold text-muted-foreground sm:inline-flex">
        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="max-w-[140px] truncate">{currentLabel}</span>
        {current && <OpenDot open={currentOpen} />}
      </span>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery('');
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`${t('nav.branches')}: ${currentLabel}`}
              className={cn(
                'h-8 shrink-0 gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors',
                'data-[state=open]:border-primary/40 data-[state=open]:bg-primary-subtle/60',
                isAll
                  ? 'border-border/80 bg-muted/50 text-muted-foreground hover:bg-muted'
                  : 'border-primary/25 bg-primary-subtle/60 text-primary hover:bg-primary-subtle',
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="max-w-[100px] truncate xl:max-w-[160px]">{currentLabel}</span>
              {isAll ? (
                <span className="hidden rounded-full bg-background/70 px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground lg:inline">
                  {activeCount}
                </span>
              ) : (
                current && <OpenDot open={currentOpen} />
              )}
              <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {current ? (
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold">{current.name}</span>
              <span className="opacity-80">
                {provinceName(current.province, i18n.language)} · {current.openTime}–{current.closeTime}
              </span>
            </span>
          ) : (
            t('branch.scopeHint')
          )}
        </TooltipContent>
      </Tooltip>

      <PopoverContent
        align="end"
        className="flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).querySelector('input')?.focus();
        }}
      >
        {/* Header — what this control does + a live pulse of the network. */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold">{t('branch.scopeHint')}</p>
            <p className="text-xs text-muted-foreground">{t('branch.scopeBody')}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold tabular-nums text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
            {t('branch.openCount', { open: openCount, total: activeCount })}
          </span>
        </div>

        {/* Search */}
        <div className="relative border-b border-border p-2">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('branch.searchPlaceholder')}
            aria-label={t('branch.searchPlaceholder')}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={options[cursor] ? `${listId}-${options[cursor].id}` : undefined}
            className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-8 text-sm placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('branch.clearSearch')}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} id={listId} role="listbox" className="max-h-[min(22rem,60vh)] overflow-y-auto p-1">
          {options.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
              <Search className="h-5 w-5 text-muted-foreground/60" aria-hidden="true" />
              <p className="text-sm font-medium">{t('branch.noResults')}</p>
              <p className="text-xs text-muted-foreground">{t('branch.noResultsHint')}</p>
            </div>
          ) : (
            options.map((o, i) => {
              const selected = o.id === 'all' ? isAll : o.id === activeBranchId;
              const highlighted = i === cursor;
              return (
                <div
                  key={o.id}
                  id={`${listId}-${o.id}`}
                  role="option"
                  aria-selected={selected}
                  data-index={i}
                  onMouseMove={() => setCursor(i)}
                  onClick={() => pick(o.id)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 transition-colors',
                    highlighted && 'bg-muted',
                    selected && 'bg-primary-subtle/50',
                    'branch' in o && !o.branch.isActive && 'opacity-60',
                  )}
                >
                  {'branch' in o ? (
                    <BranchRow branch={o.branch} open={o.open} selected={selected} lang={i18n.language} />
                  ) : (
                    <>
                      <span
                        className={cn(
                          'grid h-8 w-8 shrink-0 place-items-center rounded-md',
                          selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <Globe2 className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm font-medium', selected && 'text-primary')}>
                          {t('branch.all')}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {t('branch.allMeta', { count: activeCount, open: openCount })}
                        </span>
                      </span>
                    </>
                  )}
                  <Check
                    className={cn('h-4 w-4 shrink-0 text-primary', selected ? 'opacity-100' : 'opacity-0')}
                    aria-hidden="true"
                  />
                </div>
              );
            })
          )}
        </div>

        {/* Footer — result count + shortcut to branch management. */}
        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {t('branch.resultCount', { count: options.filter((o) => o.id !== 'all').length, total: visibleBranches.length })}
          </span>
          {hasPermission('branches:view') && (
            <Link
              to={ROUTES.branches}
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              {t('branch.manage')}
            </Link>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function OpenDot({ open }: { open: boolean }) {
  return (
    <span
      className={cn('h-1.5 w-1.5 shrink-0 rounded-full', open ? 'bg-success' : 'bg-muted-foreground/40')}
      aria-hidden="true"
    />
  );
}

function BranchRow({ branch, open, selected, lang }: { branch: Branch; open: boolean; selected: boolean; lang: string }) {
  const { t } = useTranslation();
  return (
    <>
      <span
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-md font-mono text-[10px] font-semibold',
          selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
        aria-hidden="true"
      >
        {branch.code.slice(0, 4) || <Building2 className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={cn('truncate text-sm font-medium', selected && 'text-primary')}>{branch.name}</span>
          {!branch.isActive && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
              {t('branch.inactive')}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{provinceName(branch.province, lang)}</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {branch.openTime}–{branch.closeTime}
          </span>
          {branch.isActive && (
            <span className={cn('inline-flex shrink-0 items-center gap-1', open ? 'text-success' : '')}>
              <OpenDot open={open} />
              {open ? t('branch.openNow') : t('branch.closedNow')}
            </span>
          )}
        </span>
      </span>
    </>
  );
}
