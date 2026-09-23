import type { ReconciliationStatus } from '@abcp/shared-types';
import {
  BellRing,
  CalendarCheck2,
  CalendarDays,
  Coins,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Landmark,
  PenLine,
  Rows3,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { DateField } from '@/components/shared/DateField';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { TONE } from '@/features/payroll/payroll.lib';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import {
  MAX_RANGE_DAYS,
  RANGE_PRESETS,
  RECON_STATUSES,
  RECON_VIEWS,
  STATUS_TONE,
  daysBetween,
  matchPreset,
  presetRange,
  type RangePreset,
  type ReconView,
} from './reconciliation.lib';
import { shiftDays, todayKey } from './treasury.lib';

const VIEW_ICON: Record<ReconView, LucideIcon> = {
  ledger: Rows3,
  calendar: CalendarDays,
  accounts: Landmark,
  cash: Coins,
};

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
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium',
        'transition-colors duration-150 ease-out motion-reduce:transition-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-primary text-primary-foreground shadow-xs'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

interface Props {
  from: string;
  to: string;
  onRange: (from: string, to: string) => void;
  onShift: (dir: -1 | 1) => void;
  isSuper: boolean;
  branchId: string;
  onBranch: (id: string) => void;
  branches: { id: string; name: string }[];
  bankAccountId: string;
  onAccount: (id: string) => void;
  accounts: { id: string; label: string }[];
  view: ReconView;
  onView: (v: ReconView) => void;
  status: ReconciliationStatus | '';
  onStatus: (s: ReconciliationStatus | '') => void;
  counts: Record<ReconciliationStatus, number> & { all: number };
  onClearFilters: () => void;
  canManage: boolean;
  /** Opens the oldest account-day that still has no statement. */
  onEnterNext: (() => void) | null;
  onExport: () => void;
  exportDisabled: boolean;
  /** G1 — null when the user cannot import. */
  onImport: (() => void) | null;
  /** G5 — month close dialog. */
  onPeriods: () => void;
  /** G9 — reminder settings (everyone can view; SUPER_ADMIN edits). */
  onSettings: () => void;
  /** G6 — shown only when accounts hold more than one currency. */
  currencies: string[];
  currency: string | null;
  onCurrency: (c: string) => void;
}

/**
 * Sticky command bar for /payments/reconciliation.
 *
 * Row 1: title, what the range covers, and the page actions (export, and the
 *   "next missing statement" action that takes the reconciler straight to the
 *   oldest unchecked day).
 * Row 2: the period (presets, a ◀ ▶ stepper that slides the window by its own
 *   length, and exact dates), plus branch and account scope.
 * Row 3: status chips with live counts, applied-filter chips, and the view
 *   switch. The chips act as filters and show what is filtered, so a narrowed
 *   ledger is always visible as narrowed.
 */
export function ReconCommandBar(props: Props) {
  const { t } = useTranslation();
  const {
    from,
    to,
    onRange,
    onShift,
    isSuper,
    branchId,
    onBranch,
    branches,
    bankAccountId,
    onAccount,
    accounts,
    view,
    onView,
    status,
    onStatus,
    counts,
    onClearFilters,
    canManage,
    onEnterNext,
    onExport,
    exportDisabled,
    onImport,
    onPeriods,
    onSettings,
    currencies,
    currency,
    onCurrency,
  } = props;
  const today = todayKey();
  const preset = matchPreset(from, to, today);
  const span = daysBetween(from, to);
  const atToday = to >= today;
  const branchName = branches.find((b) => b.id === branchId)?.name;
  const accountLabel = accounts.find((a) => a.id === bankAccountId)?.label;
  const hasFilters = Boolean(branchId || bankAccountId || status);

  const clampFrom = (f: string, tt: string) => (daysBetween(f, tt) > MAX_RANGE_DAYS ? shiftDays(tt, -(MAX_RANGE_DAYS - 1)) : f);

  return (
    <StickyPageHeader className="pb-3">
      <div className="space-y-2.5">
        {/* ── row 1 ── */}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 lg:flex-nowrap">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
              {t('nav.paymentsReconciliation')}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t('payTreasury.recon.subtitle')}
              <span className="ml-2 whitespace-nowrap text-xs tabular-nums">
                {t('payTreasury.recon.rangeCaption', { from: formatDate(from), to: formatDate(to), count: span })}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onSettings} aria-label={t('payTreasury.recon.settings.title')} title={t('payTreasury.recon.settings.title')}>
              <BellRing className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button variant="secondary" onClick={onPeriods}>
              <CalendarCheck2 className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('payTreasury.recon.period.button')}
            </Button>
            {onImport ? (
              <Button variant="secondary" onClick={onImport}>
                <FileSpreadsheet className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('payTreasury.recon.import.button')}
              </Button>
            ) : null}
            <Button variant="secondary" onClick={onExport} disabled={exportDisabled}>
              <Download className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('payTreasury.recon.exportCsv')}
            </Button>
            {canManage && onEnterNext ? (
              <Button onClick={onEnterNext}>
                <PenLine className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('payTreasury.recon.enterNext')}
              </Button>
            ) : null}
          </div>
        </div>

        {/* ── row 2 ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label={t('payTreasury.recon.period')}
            className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-xs"
          >
            {RANGE_PRESETS.map((p: RangePreset) => (
              <SegButton
                key={p}
                active={preset === p}
                onClick={() => {
                  const r = presetRange(p, today);
                  onRange(r.from, r.to);
                }}
              >
                {t(`payTreasury.recon.preset.${p}`)}
              </SegButton>
            ))}
          </div>

          <div className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-xs">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onShift(-1)}
              aria-label={t('payTreasury.recon.prevPeriod')}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <DateField
              value={from}
              onChange={(v) => v && onRange(clampFrom(v, to < v ? v : to), to < v ? v : to)}
              max={to}
              aria-label={t('payTreasury.from')}
              className="h-8 w-[128px] border-0 shadow-none"
            />
            <span className="text-muted-foreground" aria-hidden="true">
              –
            </span>
            <DateField
              value={to}
              onChange={(v) => v && onRange(clampFrom(from > v ? v : from, v), v)}
              min={from}
              max={today}
              aria-label={t('payTreasury.to')}
              className="h-8 w-[128px] border-0 shadow-none"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={atToday}
              onClick={() => onShift(1)}
              aria-label={t('payTreasury.recon.nextPeriod')}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {isSuper ? (
            <Select
              className="h-9 w-[150px]"
              value={branchId}
              onChange={(e) => onBranch(e.target.value)}
              placeholder={t('payTreasury.allBranches')}
              aria-label={t('payTreasury.col.branch')}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          ) : null}
          {currencies.length > 1 ? (
            <div role="group" aria-label={t('payTreasury.recon.currency')} className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-xs">
              {currencies.map((c) => (
                <SegButton key={c} active={currency === c} onClick={() => onCurrency(c)}>
                  {c}
                </SegButton>
              ))}
            </div>
          ) : null}
          <Select
            className="h-9 w-[190px]"
            value={bankAccountId}
            onChange={(e) => onAccount(e.target.value)}
            placeholder={t('payTreasury.recon.allAccounts')}
            aria-label={t('payTreasury.recon.account')}
            options={accounts.map((a) => ({ value: a.id, label: a.label }))}
          />

        </div>

        {/* ── row 3: status chips + applied filters ── */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onStatus('')}
            aria-pressed={status === ''}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
              status === ''
                ? 'border-foreground/20 bg-foreground text-background'
                : 'border-border bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {t('payTreasury.recon.allDays')}
            <span className="tabular-nums opacity-80">{counts.all}</span>
          </button>
          {RECON_STATUSES.map((s) => {
            const tone = TONE[STATUS_TONE[s]];
            const active = status === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => onStatus(active ? '' : s)}
                aria-pressed={active}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
                  active ? cn(tone.chip, 'border-transparent ring-1', tone.ring) : 'border-border bg-card text-muted-foreground hover:text-foreground',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', tone.bar)} aria-hidden="true" />
                {t(`payTreasury.recon.status.${s}`)}
                <span className="tabular-nums opacity-80">{counts[s]}</span>
              </button>
            );
          })}

          {branchName || accountLabel ? <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" /> : null}
          {branchName ? (
            <FilterChip onRemove={() => onBranch('')} removeLabel={t('payTreasury.recon.removeFilter', { name: branchName })}>
              {branchName}
            </FilterChip>
          ) : null}
          {accountLabel ? (
            <FilterChip onRemove={() => onAccount('')} removeLabel={t('payTreasury.recon.removeFilter', { name: accountLabel })}>
              {accountLabel}
            </FilterChip>
          ) : null}
          {hasFilters ? (
            <button
              type="button"
              onClick={onClearFilters}
              className="ml-1 text-2xs font-medium text-primary underline-offset-2 hover:underline"
            >
              {t('payTreasury.recon.clearFilters')}
            </button>
          ) : null}
          <div
            role="group"
            aria-label={t('payTreasury.recon.viewLabel')}
            className="ml-auto flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-xs"
          >
            {RECON_VIEWS.map((v) => {
              const Icon = VIEW_ICON[v];
              return (
                <SegButton key={v} active={view === v} onClick={() => onView(v)} title={t(`payTreasury.recon.view.${v}`)}>
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="hidden sm:inline">{t(`payTreasury.recon.view.${v}`)}</span>
                  <span className="sr-only sm:hidden">{t(`payTreasury.recon.view.${v}`)}</span>
                </SegButton>
              );
            })}
          </div>
        </div>
      </div>
    </StickyPageHeader>
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
