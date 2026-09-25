import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Table2,
  Trophy,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import {
  PAYROLL_FLAGS,
  SORT_KEYS,
  VIEW_MODES,
  isFutureMonth,
  monthLabel,
  recentMonths,
  shiftMonth,
  type PayrollFlag,
  type SortKey,
  type ViewMode,
} from './payroll.lib';

const VIEW_ICON: Record<ViewMode, LucideIcon> = {
  roster: Table2,
  leaderboard: Trophy,
  insights: BarChart3,
  runs: FileSpreadsheet,
};

function Segmented({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-xs"
    >
      {children}
    </div>
  );
}

function SegButton({
  active,
  onClick,
  label,
  icon: Icon,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: LucideIcon;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={hint ?? label}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium',
        'transition-colors duration-150 ease-out motion-reduce:transition-none',
        active
          ? 'bg-primary text-primary-foreground shadow-xs'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden sr-only">{label}</span>
    </button>
  );
}

/** Removable pill for one applied filter. */
function FilterChip({
  children,
  onRemove,
  removeLabel,
}: {
  children: ReactNode;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-2 pr-1 text-2xs">
      <span className="max-w-[180px] truncate">{children}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
    </span>
  );
}

interface Props {
  monthYear: string;
  onMonth: (m: string) => void;
  branchId: string;
  onBranch: (id: string) => void;
  branches: { id: string; name: string }[];
  search: string;
  onSearch: (v: string) => void;
  searchRef?: RefObject<HTMLInputElement>;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  flags: PayrollFlag[];
  onToggleFlag: (f: PayrollFlag) => void;
  onClearFilters: () => void;
  /** Rows matched by the current filters, out of the whole month. */
  matched: number;
  total: number;
  canManage: boolean;
  onRecompute: () => void;
  recomputing: boolean;
  onExport: () => void;
  exporting: boolean;
}

/**
 * Sticky command bar for /staff/payroll.
 *
 * Row 1 — identity (title + what the current filter matches) and the actions
 * that recalculate or take data out of the page.
 * Row 2 — the period stepper, branch scope, view switcher, search and sort.
 * Row 3 — applied filters as removable chips, so a narrowed page never lies
 * about what it is showing (the old page could be filtered with no visible
 * trace beyond the select itself).
 *
 * The month stepper is a `◀ label ▶` group rather than a bare select: payroll
 * is read month-by-month and stepping is the dominant motion, while the select
 * behind the label still allows a direct jump.
 */
export function PayrollCommandBar({
  monthYear,
  onMonth,
  branchId,
  onBranch,
  branches,
  search,
  onSearch,
  searchRef,
  view,
  onView,
  sort,
  onSort,
  flags,
  onToggleFlag,
  onClearFilters,
  matched,
  total,
  canManage,
  onRecompute,
  recomputing,
  onExport,
  exporting,
}: Props) {
  const { t, i18n } = useTranslation();
  const months = recentMonths(24);
  const atLatest = isFutureMonth(monthYear);
  const branchName = branches.find((b) => b.id === branchId)?.name;
  const hasFilters = Boolean(search) || Boolean(branchId) || flags.length > 0;

  return (
    <StickyPageHeader className="pb-3">
      <div className="space-y-2.5">
        {/* ── row 1: identity + page-level actions ── */}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
              {t('nav.payroll')}
            </h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {t('payroll.subtitle')}
              <span className="ml-2 text-xs">
                {t('payroll.showing', { shown: matched, total })}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canManage ? (
              <Button variant="secondary" disabled={recomputing} onClick={onRecompute}>
                <RefreshCw
                  className={cn('mr-1 h-4 w-4', recomputing && 'animate-spin motion-reduce:animate-none')}
                  aria-hidden="true"
                />
                {t('payroll.recompute')}
              </Button>
            ) : null}
            <Button variant="secondary" disabled={exporting} onClick={onExport}>
              <Download className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('payroll.exportCsv')}
            </Button>
          </div>
        </div>

        {/* ── row 2: period · scope · view · search · sort ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-xs">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onMonth(shiftMonth(monthYear, -1))}
              aria-label={t('payroll.prevMonth')}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            {/* The label is what you read; the transparent native select on top of
                it is what you click for a direct jump to any of the last 24 months. */}
            <div className="relative">
              <span className="pointer-events-none flex h-8 min-w-[132px] items-center justify-center px-2 text-xs font-semibold tabular-nums">
                {monthLabel(monthYear, i18n.language)}
              </span>
              <div className="absolute inset-0 [&>div]:h-full">
                <Select
                  className="h-full w-full cursor-pointer opacity-0"
                  value={monthYear}
                  onChange={(e) => onMonth(e.target.value)}
                  options={months.map((m) => ({ value: m, label: monthLabel(m, i18n.language) }))}
                  aria-label={t('payroll.month')}
                />
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={atLatest}
              onClick={() => onMonth(shiftMonth(monthYear, 1))}
              aria-label={t('payroll.nextMonth')}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <Select
            className="h-9 w-[168px]"
            value={branchId}
            onChange={(e) => onBranch(e.target.value)}
            options={[
              { value: '', label: t('inventory.allBranches') },
              ...branches.map((b) => ({ value: b.id, label: b.name })),
            ]}
            aria-label={t('inventory.col.branch')}
          />

          <Segmented label={t('payroll.viewMode')}>
            {VIEW_MODES.map((m) => (
              <SegButton
                key={m}
                active={view === m}
                onClick={() => onView(m)}
                label={t(`payroll.view_${m}`)}
                icon={VIEW_ICON[m]}
              />
            ))}
          </Segmented>

          <div className="relative min-w-[170px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={t('payroll.searchPlaceholder')}
              aria-label={t('payroll.searchPlaceholder')}
              className="h-9 w-full rounded-sm border border-input bg-card pl-9 pr-9 text-sm transition-colors duration-150 ease-out placeholder:text-muted-foreground"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1 text-2xs text-muted-foreground sm:block">
              /
            </kbd>
          </div>

          {view !== 'insights' ? (
            <Select
              className="h-9 w-[182px]"
              value={sort}
              onChange={(e) => onSort(e.target.value as SortKey)}
              options={SORT_KEYS.map((k) => ({ value: k, label: t(`payroll.sort.${k}`) }))}
              aria-label={t('payroll.sort.label')}
            />
          ) : null}
        </div>

        {/* ── row 3: attention filters + applied-filter chips ── */}
        <div className="flex flex-wrap items-center gap-1.5">
          {PAYROLL_FLAGS.map((f) => {
            const active = flags.includes(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => onToggleFlag(f)}
                aria-pressed={active}
                className={cn(
                  'inline-flex h-7 items-center rounded-full border px-2.5 text-2xs font-medium',
                  'transition-colors duration-150 ease-out motion-reduce:transition-none',
                  active
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {t(`payroll.flag.${f}`)}
              </button>
            );
          })}

          {hasFilters ? (
            <>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
              {search ? (
                <FilterChip
                  onRemove={() => onSearch('')}
                  removeLabel={t('payroll.removeFilter', { name: search })}
                >
                  {t('payroll.searchChip', { q: search })}
                </FilterChip>
              ) : null}
              {branchName ? (
                <FilterChip
                  onRemove={() => onBranch('')}
                  removeLabel={t('payroll.removeFilter', { name: branchName })}
                >
                  {branchName}
                </FilterChip>
              ) : null}
              <Button variant="ghost" size="sm" className="h-7 px-2 text-2xs" onClick={onClearFilters}>
                {t('payroll.clearFilters')}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </StickyPageHeader>
  );
}
