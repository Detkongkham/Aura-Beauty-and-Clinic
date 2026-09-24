import type { SlipFlag } from '@abcp/shared-types';
import {
  CheckCheck,
  Download,
  Eye,
  EyeOff,
  Keyboard,
  Loader2,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

import {
  SLIP_FLAGS,
  SLIP_RANGES,
  SLIP_SORTS,
  SLIP_VIEWS,
  type SlipRange,
  type SlipSort,
  type SlipView,
} from './slipModel';

interface Props {
  live: boolean;
  view: SlipView;
  onView: (v: SlipView) => void;
  /** Count per tab; `null` = unknown (only the active tab's total is known for past tabs). */
  counts: Record<SlipView, number | null>;
  q: string;
  onQ: (q: string) => void;
  range: SlipRange;
  onRange: (r: SlipRange) => void;
  sort: SlipSort;
  onSort: (s: SlipSort) => void;
  flag: SlipFlag | '';
  onFlag: (f: SlipFlag | '') => void;
  isSuper: boolean;
  branchId: string;
  onBranch: (id: string) => void;
  branches: { id: string; name: string }[];
  onClear: () => void;
  focus: boolean;
  onFocus: () => void;
  onShortcuts: () => void;
  /** S10 — download the current filter as CSV. */
  onExport: () => void;
  exporting: boolean;
  /** S12 — staff upload; null when the user can't review. */
  onUpload: (() => void) | null;
  /** Bulk confirm of ready slips — null when the user can't review. */
  bulk: {
    selected: number;
    ready: number;
    onConfirm: () => void;
    onSelectAll: () => void;
    pending: boolean;
  } | null;
}

/**
 * Sticky command bar for /payments/slips.
 *
 * Row 1: title, live state, focus toggle, shortcuts, bulk confirm of ready slips.
 * Row 2: queue tabs with counts · search (`/`) · upload date · sort · branch (SUPER_ADMIN).
 * Row 3: "failed check" flags as toggle chips + clear — a narrowed queue always looks narrowed.
 */
export const SlipsCommandBar = forwardRef<HTMLInputElement, Props>(
  function SlipsCommandBar(p, searchRef) {
    const { t } = useTranslation();
    const filtered = Boolean(p.q || p.flag || p.range !== 'all' || p.branchId);

    return (
      <StickyPageHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
                {t('nav.paymentsSlips')}
              </h1>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium',
                  p.live ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground',
                )}
                title={t(p.live ? 'payTreasury.slips.liveOn' : 'payTreasury.slips.liveOff')}
              >
                <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                  {p.live ? (
                    <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
                  ) : null}
                  <span
                    className={cn(
                      'relative inline-flex h-1.5 w-1.5 rounded-full',
                      p.live ? 'bg-success' : 'bg-muted-foreground/60',
                    )}
                  />
                </span>
                {t(p.live ? 'payTreasury.slips.live' : 'payTreasury.slips.offline')}
              </span>
            </div>
            <p className="mt-0.5 hidden max-w-2xl text-sm text-muted-foreground sm:block">
              {t('payTreasury.slips.subtitle')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={p.onFocus}
              aria-pressed={p.focus}
              title={t('payTreasury.slips.focusHint')}
              aria-label={t(p.focus ? 'payTreasury.slips.showInsights' : 'payTreasury.slips.focus')}
            >
              {p.focus ? (
                <Eye className="mr-1 h-4 w-4" aria-hidden="true" />
              ) : (
                <EyeOff className="mr-1 h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">
                {t(p.focus ? 'payTreasury.slips.showInsights' : 'payTreasury.slips.focus')}
              </span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={p.onShortcuts}
              aria-label={t('payTreasury.slips.shortcuts.title')}
            >
              <Keyboard className="h-4 w-4" aria-hidden="true" />
              <Kbd aria-hidden="true" className="ml-1.5 hidden sm:inline-flex">
                ?
              </Kbd>
            </Button>
            <Button variant="ghost" size="sm" onClick={p.onExport} disabled={p.exporting}>
              {p.exporting ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="mr-1 h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{t('payTreasury.slips.export')}</span>
              <span className="sr-only sm:hidden">{t('payTreasury.slips.export')}</span>
            </Button>
            {p.onUpload ? (
              <Button variant="secondary" size="sm" onClick={p.onUpload}>
                <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('payTreasury.slips.upload.open')}
              </Button>
            ) : null}
            {p.bulk ? (
              p.bulk.selected > 0 ? (
                <Button size="sm" onClick={p.bulk.onConfirm} disabled={p.bulk.pending}>
                  <CheckCheck className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t('payTreasury.slips.bulk.confirm', { count: p.bulk.selected })}
                </Button>
              ) : p.bulk.ready > 0 ? (
                <Button size="sm" variant="secondary" onClick={p.bulk.onSelectAll}>
                  <CheckCheck className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t('payTreasury.slips.bulk.selectReady', { count: p.bulk.ready })}
                </Button>
              ) : null
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label={t('payTreasury.slips.views')}
            className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5"
          >
            {SLIP_VIEWS.map((v) => (
              <button
                key={v}
                role="tab"
                type="button"
                aria-selected={p.view === v}
                onClick={() => p.onView(v)}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium outline-none',
                  'transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                  p.view === v
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t(`payTreasury.slips.view.${v}`)}
                {p.counts[v] != null ? (
                  <span
                    className={cn(
                      'min-w-[1.25rem] rounded-full px-1.5 text-center text-2xs tabular-nums',
                      v === 'action' && (p.counts[v] ?? 0) > 0
                        ? 'bg-warning-soft text-warning'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {p.counts[v]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="relative w-full min-w-[200px] flex-1 sm:w-auto">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              ref={searchRef}
              className="h-9 pl-8 pr-10"
              value={p.q}
              onChange={(e) => p.onQ(e.target.value)}
              placeholder={t('payTreasury.slips.search')}
              aria-label={t('payTreasury.slips.search')}
            />
            {p.q ? (
              <button
                type="button"
                onClick={() => p.onQ('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                aria-label={t('payTreasury.slips.clearSearch')}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : (
              <Kbd
                aria-hidden="true"
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
              >
                /
              </Kbd>
            )}
          </div>

          <div className="-mx-4 flex w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 sm:mx-0 sm:w-auto sm:overflow-visible sm:px-0">
            <Select
              className="h-9 w-[140px] shrink-0"
              value={p.range}
              onChange={(e) => p.onRange(e.target.value as SlipRange)}
              aria-label={t('payTreasury.slips.rangeLabel')}
              options={SLIP_RANGES.map((r) => ({
                value: r,
                label: t(`payTreasury.slips.range.${r}`),
              }))}
            />
            <Select
              className="h-9 w-[150px] shrink-0"
              value={p.sort}
              onChange={(e) => p.onSort(e.target.value as SlipSort)}
              aria-label={t('payTreasury.slips.sortLabel')}
              options={SLIP_SORTS.map((s) => ({
                value: s,
                label: t(`payTreasury.slips.sort.${s}`),
              }))}
            />
            {p.isSuper ? (
              <Select
                className="h-9 w-[150px] shrink-0"
                value={p.branchId}
                onChange={(e) => p.onBranch(e.target.value)}
                placeholder={t('payTreasury.allBranches')}
                aria-label={t('payTreasury.col.branch')}
                options={p.branches.map((b) => ({ value: b.id, label: b.name }))}
              />
            ) : null}
          </div>
        </div>

        <div
          className="-mx-4 mt-2 flex items-center gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
          role="group"
          aria-label={t('payTreasury.slips.flagsLabel')}
        >
          <span className="mr-1 shrink-0 text-2xs text-muted-foreground">
            {t('payTreasury.slips.flagsLabel')}
          </span>
          {SLIP_FLAGS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={p.flag === f}
              onClick={() => p.onFlag(p.flag === f ? '' : f)}
              className={cn(
                'inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-2xs font-medium outline-none',
                'transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                p.flag === f
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {t(`payTreasury.slips.flag.${f}`)}
              {p.flag === f ? <X className="h-3 w-3" aria-hidden="true" /> : null}
            </button>
          ))}
          {filtered ? (
            <button
              type="button"
              onClick={p.onClear}
              className="ml-1 shrink-0 whitespace-nowrap text-2xs font-medium text-primary underline-offset-2 hover:underline"
            >
              {t('payTreasury.slips.clearFilters')}
            </button>
          ) : null}
        </div>
      </StickyPageHeader>
    );
  },
);
