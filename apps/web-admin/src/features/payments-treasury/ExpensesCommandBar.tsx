import type { ExpenseCategoryView, ExpenseStatus } from '@abcp/shared-types';
import {
  BarChart3,
  Columns3,
  Download,
  Plus,
  Search,
  Settings2,
  Table2,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { DateField } from '@/components/shared/DateField';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { TONE } from '@/features/payroll/payroll.lib';
import { cn } from '@/lib/utils';

import {
  EXPENSE_LIST_FLAGS,
  EXPENSE_LIST_SORTS,
  EXPENSE_STATUSES,
  EXPENSE_STATUS_TONE,
  EXPENSE_VIEWS,
  PERIOD_PRESETS,
  categoryName,
  detectPreset,
  type ExpenseListFlag,
  type ExpenseListSort,
  type ExpenseViewMode,
  type PeriodPreset,
} from './expenses.lib';
import { todayKey } from './treasury.lib';

const VIEW_ICON: Record<ExpenseViewMode, LucideIcon> = { list: Table2, board: Columns3, insights: BarChart3 };

function Segmented({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={cn('flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-xs', className)}>
      {children}
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-medium',
        'transition-colors duration-150 ease-out motion-reduce:transition-none',
        active ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function FilterChip({ children, onRemove, removeLabel }: { children: ReactNode; onRemove: () => void; removeLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-2 pr-1 text-2xs">
      <span className="max-w-[200px] truncate">{children}</span>
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
  from: string;
  to: string;
  onPeriod: (from: string, to: string) => void;
  onPreset: (p: PeriodPreset) => void;
  branchId: string;
  onBranch: (id: string) => void;
  branches: { id: string; name: string }[];
  showBranch: boolean;
  view: ExpenseViewMode;
  onView: (v: ExpenseViewMode) => void;
  search: string;
  onSearch: (v: string) => void;
  searchRef?: RefObject<HTMLInputElement>;
  sort: ExpenseListSort;
  onSort: (s: ExpenseListSort) => void;
  status: ExpenseStatus | '';
  onStatus: (s: ExpenseStatus | '') => void;
  statusCounts: Partial<Record<ExpenseStatus, number>>;
  flag: ExpenseListFlag | '';
  onFlag: (f: ExpenseListFlag | '') => void;
  categoryId: string;
  onCategory: (id: string) => void;
  categories: ExpenseCategoryView[];
  lang: 'lo' | 'en';
  onClearFilters: () => void;
  total: number | undefined;
  canManage: boolean;
  onNew: () => void;
  onSettings: () => void;
  onExport: () => void;
  exporting: boolean;
}

/**
 * Sticky command bar for /payments/expenses.
 *
 * Row 1 — identity + the three page-level actions (export · settings · new).
 * Row 2 — period (preset switch + exact dates), branch scope, view switch, search, sort.
 * Row 3 — status tabs with live counts, then attention flags and removable chips for everything
 * else that narrows the page, so a filtered list never hides why it is short.
 */
export function ExpensesCommandBar(p: Props) {
  const { t } = useTranslation();
  const preset = detectPreset(p.from, p.to);
  const branchName = p.branches.find((b) => b.id === p.branchId)?.name;
  const category = p.categories.find((c) => c.id === p.categoryId);
  const allCount = Object.values(p.statusCounts).reduce((s, n) => s + (n ?? 0), 0);
  const hasFilters = Boolean(p.search || p.branchId || p.status || p.flag || p.categoryId) || preset !== 'month';

  return (
    <StickyPageHeader className="pb-3">
      <div className="space-y-2.5">
        {/* ── row 1 ── */}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">{t('nav.paymentsExpenses')}</h1>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {t('payTreasury.exp.subtitleShort')}
              {p.total != null ? <span className="ml-2 text-xs">{t('payTreasury.exp.matching', { count: p.total })}</span> : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={p.onExport} disabled={p.exporting || !p.total}>
              <Download className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('common.export')}
            </Button>
            <Button variant="secondary" onClick={p.onSettings}>
              <Settings2 className="mr-1 h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('payTreasury.exp.settings')}</span>
              <span className="sr-only sm:hidden">{t('payTreasury.exp.settings')}</span>
            </Button>
            {p.canManage ? (
              <Button onClick={p.onNew}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('payTreasury.exp.new')}
                <kbd className="ml-2 hidden rounded border border-primary-foreground/30 px-1 text-2xs font-normal opacity-80 lg:inline">N</kbd>
              </Button>
            ) : null}
          </div>
        </div>

        {/* ── row 2 ── */}
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label={t('payTreasury.exp.period')} className="max-w-full overflow-x-auto [scrollbar-width:none]">
            {PERIOD_PRESETS.map((k) => (
              <SegButton key={k} active={preset === k} onClick={() => p.onPreset(k)}>
                {t(`payTreasury.exp.preset.${k}`)}
              </SegButton>
            ))}
          </Segmented>
          <div className="flex items-center gap-1.5">
            <DateField
              value={p.from}
              onChange={(v) => v && p.onPeriod(v, p.to < v ? v : p.to)}
              max={p.to}
              aria-label={t('payTreasury.from')}
              className="h-9 w-[140px]"
            />
            <span className="text-muted-foreground" aria-hidden="true">–</span>
            <DateField
              value={p.to}
              onChange={(v) => v && p.onPeriod(p.from > v ? v : p.from, v)}
              min={p.from}
              max={todayKey()}
              aria-label={t('payTreasury.to')}
              className="h-9 w-[140px]"
            />
          </div>
          {p.showBranch ? (
            <Select
              className="h-9 w-[160px]"
              value={p.branchId}
              onChange={(e) => p.onBranch(e.target.value)}
              options={[{ value: '', label: t('payTreasury.allBranches') }, ...p.branches.map((b) => ({ value: b.id, label: b.name }))]}
              aria-label={t('payTreasury.col.branch')}
            />
          ) : null}
          <Segmented label={t('payTreasury.exp.viewMode')}>
            {EXPENSE_VIEWS.map((v) => {
              const Icon = VIEW_ICON[v];
              return (
                <SegButton key={v} active={p.view === v} onClick={() => p.onView(v)} title={t(`payTreasury.exp.view.${v}`)}>
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="hidden sm:inline">{t(`payTreasury.exp.view.${v}`)}</span>
                  <span className="sr-only sm:hidden">{t(`payTreasury.exp.view.${v}`)}</span>
                </SegButton>
              );
            })}
          </Segmented>
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              ref={p.searchRef}
              type="search"
              value={p.search}
              onChange={(e) => p.onSearch(e.target.value)}
              placeholder={t('payTreasury.exp.searchPlaceholder')}
              aria-label={t('payTreasury.exp.searchPlaceholder')}
              className="h-9 w-full rounded-sm border border-input bg-card pl-9 pr-9 text-sm transition-colors duration-150 ease-out placeholder:text-muted-foreground"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1 text-2xs text-muted-foreground sm:block">/</kbd>
          </div>
          <Select
            className="h-9 w-[150px]"
            value={p.categoryId}
            onChange={(e) => p.onCategory(e.target.value)}
            options={[{ value: '', label: t('payTreasury.exp.allCategories') }, ...p.categories.map((c) => ({ value: c.id, label: categoryName(c, p.lang) }))]}
            aria-label={t('payTreasury.exp.category')}
          />
          {p.view === 'list' ? (
            <Select
              className="h-9 w-[150px]"
              value={p.sort}
              onChange={(e) => p.onSort(e.target.value as ExpenseListSort)}
              options={EXPENSE_LIST_SORTS.map((s) => ({ value: s, label: t(`payTreasury.exp.sort.${s}`) }))}
              aria-label={t('payTreasury.exp.sortLabel')}
            />
          ) : null}
        </div>

        {/* ── row 3 ── */}
        <div className="flex flex-wrap items-center gap-1.5">
          {p.view !== 'board' ? (
            <div role="tablist" aria-label={t('payTreasury.col.status')} className="flex flex-wrap items-center gap-1">
              {(['', ...EXPENSE_STATUSES] as const).map((s) => {
                const active = p.status === s;
                const count = s === '' ? allCount : (p.statusCounts[s] ?? 0);
                const tone = s ? TONE[EXPENSE_STATUS_TONE[s]] : null;
                return (
                  <button
                    key={s || 'all'}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => p.onStatus(s)}
                    className={cn(
                      'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-2xs font-medium',
                      'transition-colors duration-150 ease-out motion-reduce:transition-none',
                      active ? 'border-foreground/20 bg-foreground text-background' : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {tone ? <span className={cn('h-1.5 w-1.5 rounded-full', tone.bar)} aria-hidden="true" /> : null}
                    {s ? t(`payTreasury.exp.status.${s}`) : t('payTreasury.exp.allStatuses')}
                    <span className={cn('tabular-nums', active ? 'opacity-80' : 'text-muted-foreground/80')}>{count}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {p.view !== 'board' ? <span className="mx-1 hidden h-4 w-px bg-border sm:block" aria-hidden="true" /> : null}

          {EXPENSE_LIST_FLAGS.map((f) => {
            const active = p.flag === f;
            return (
              <button
                key={f}
                type="button"
                onClick={() => p.onFlag(active ? '' : f)}
                aria-pressed={active}
                className={cn(
                  'inline-flex h-7 items-center rounded-full border px-2.5 text-2xs font-medium',
                  'transition-colors duration-150 ease-out motion-reduce:transition-none',
                  active ? 'border-primary/40 bg-primary/10 text-primary' : 'border-dashed border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {t(`payTreasury.exp.flag.${f}`)}
              </button>
            );
          })}

          {hasFilters ? (
            <>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
              {p.search ? (
                <FilterChip onRemove={() => p.onSearch('')} removeLabel={t('payTreasury.exp.removeFilter', { name: p.search })}>
                  “{p.search}”
                </FilterChip>
              ) : null}
              {branchName ? (
                <FilterChip onRemove={() => p.onBranch('')} removeLabel={t('payTreasury.exp.removeFilter', { name: branchName })}>
                  {branchName}
                </FilterChip>
              ) : null}
              {category ? (
                <FilterChip onRemove={() => p.onCategory('')} removeLabel={t('payTreasury.exp.removeFilter', { name: categoryName(category, p.lang) })}>
                  {categoryName(category, p.lang)}
                </FilterChip>
              ) : null}
              <Button variant="ghost" size="sm" className="h-7 px-2 text-2xs" onClick={p.onClearFilters}>
                {t('payTreasury.exp.clearFilters')}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </StickyPageHeader>
  );
}
