import type { AppointmentStatus } from '@abcp/shared-types';
import {
  BarChart3,
  CalendarRange,
  Columns3,
  Download,
  Footprints,
  LayoutGrid,
  Loader2,
  Plus,
  RefreshCw,
  Rows2,
  Rows3,
  Search,
  SlidersHorizontal,
  Table2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { DateField } from '@/components/shared/DateField';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

import {
  RANGE_PRESETS,
  VIEW_MODES,
  type DateRange,
  type RangePreset,
  type ViewMode,
} from './appointments.lib';
import type { AppointmentFilterParams } from './appointments.api';

const VIEW_ICON: Record<ViewMode, typeof Table2> = {
  table: Table2,
  board: LayoutGrid,
  timeline: Rows3,
  insights: BarChart3,
};

/** Option lists the bar renders as plain `<Select>`s — kept here so the page stays lean. */
export interface FilterOptions {
  branches: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  services: { id: string; name: string }[];
}

interface Props {
  view: ViewMode;
  onView: (v: ViewMode) => void;
  search: string;
  onSearch: (v: string) => void;
  searchRef: RefObject<HTMLInputElement>;
  preset: RangePreset;
  onPreset: (p: RangePreset) => void;
  custom: DateRange;
  onCustom: (r: DateRange) => void;
  filters: AppointmentFilterParams;
  onFilter: (patch: Partial<AppointmentFilterParams>) => void;
  options: FilterOptions;
  activeCount: number;
  onClear: () => void;
  total: number | null;
  isFetching: boolean;
  onRefresh: () => void;
  onExport: () => void;
  exporting: boolean;
  canExport: boolean;
  onWalkIn: () => void;
  onNewBooking: () => void;
  canManage: boolean;
  density: 'comfortable' | 'compact';
  onToggleDensity: () => void;
  /** Row of removable chips for whatever is currently filtered. */
  chips: ReactNode;
}

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
  showLabel = true,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: typeof Table2;
  hint?: string;
  showLabel?: boolean;
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
      {showLabel ? <span className="hidden sm:inline">{label}</span> : <span className="sr-only">{label}</span>}
    </button>
  );
}

/**
 * Sticky command bar for /appointments.
 *
 * Row 1 — identity (title + what the current filter matches) and the actions that
 * create or take data out of the page.
 * Row 2 — the view switcher, search, the date-range rail and the advanced filter
 * drawer trigger. Everything that narrows the page lives on this row so the eye
 * only has one place to look.
 * Row 3 — removable chips for the filters that are actually on, so the state of
 * the page is always legible without opening the drawer.
 */
export function AppointmentsCommandBar(props: Props) {
  const { t } = useTranslation();
  const {
    view,
    onView,
    search,
    onSearch,
    searchRef,
    preset,
    onPreset,
    custom,
    onCustom,
    filters,
    onFilter,
    options,
    activeCount,
    onClear,
    total,
    isFetching,
    onRefresh,
    onExport,
    exporting,
    canExport,
    onWalkIn,
    onNewBooking,
    canManage,
    density,
    onToggleDensity,
    chips,
  } = props;

  const [drawer, setDrawer] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  // Advanced filters are a disclosure, not a modal — Esc closes, click-away closes.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const statusValue = filters.status ?? '';

  return (
    <StickyPageHeader>
      <div className="flex flex-col gap-3 pt-4">
        {/* ── identity + page actions ─────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h1 className="truncate font-sans text-2xl font-semibold leading-tight">
              {t('nav.appointments')}
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="truncate">{t('appointments.subtitle')}</span>
              {total != null ? (
                <span className="shrink-0 tabular-nums">
                  · {t('appointments.matchCount', { count: total })}
                </span>
              ) : null}
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={isFetching}
              aria-label={t('common.refresh')}
              title={t('common.refresh')}
            >
              <RefreshCw
                className={cn('h-4 w-4', isFetching && 'animate-spin motion-reduce:animate-none')}
                aria-hidden="true"
              />
            </Button>
            <Button variant="secondary" size="sm" onClick={onExport} disabled={exporting || !canExport}>
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{t('appointments.export')}</span>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to={ROUTES.calendar}>
                <CalendarRange className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t('appointments.viewCalendar')}</span>
              </Link>
            </Button>
            {canManage ? (
              <>
                <Button variant="secondary" size="sm" onClick={onWalkIn}>
                  <Footprints className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{t('appointments.newWalkIn')}</span>
                </Button>
                <Button size="sm" onClick={onNewBooking}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {t('appointments.newAppointment')}
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {/* ── view switcher + search + range rail ─────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label={t('appointments.viewMode')}>
            {VIEW_MODES.map((m, i) => (
              <SegButton
                key={m}
                active={view === m}
                onClick={() => onView(m)}
                label={t(`appointments.view_${m}`)}
                icon={VIEW_ICON[m]}
                hint={`${t(`appointments.view_${m}`)} · ${i + 1}`}
              />
            ))}
          </Segmented>

          <div className="relative min-w-[180px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              ref={searchRef}
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={t('appointments.searchPlaceholder')}
              aria-label={t('appointments.searchPlaceholder')}
              className="h-9 w-full rounded-sm border border-input bg-card pl-9 pr-9 text-sm transition-colors duration-150 ease-out placeholder:text-muted-foreground"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1 text-2xs text-muted-foreground sm:block">
              /
            </kbd>
          </div>

          <Segmented label={t('appointments.dateRange')}>
            {RANGE_PRESETS.filter((p) => p !== 'custom').map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPreset(p)}
                aria-pressed={preset === p}
                className={cn(
                  'h-8 rounded-md px-2.5 text-xs font-medium whitespace-nowrap',
                  'transition-colors duration-150 ease-out motion-reduce:transition-none',
                  preset === p
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {t(`appointments.range_${p}`)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                onPreset('custom');
                setDrawer(true);
              }}
              aria-pressed={preset === 'custom'}
              className={cn(
                'h-8 rounded-md px-2.5 text-xs font-medium whitespace-nowrap',
                'transition-colors duration-150 ease-out motion-reduce:transition-none',
                preset === 'custom'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t('appointments.range_custom')}
            </button>
          </Segmented>

          <Button
            variant={drawer || activeCount > 0 ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setDrawer((v) => !v)}
            aria-expanded={drawer}
            aria-controls="appointment-filter-drawer"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t('appointments.filters')}</span>
            {activeCount > 0 ? (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold tabular-nums text-primary-foreground">
                {activeCount}
              </span>
            ) : null}
          </Button>

          {view === 'table' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleDensity}
              aria-label={t('appointments.density')}
              title={t('appointments.density')}
            >
              {density === 'compact' ? (
                <Rows2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Rows3 className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
          ) : null}
        </div>

        {/* ── advanced filter drawer ──────────────────────────────── */}
        {drawer ? (
          <div
            id="appointment-filter-drawer"
            ref={drawerRef}
            className={cn(
              'grid gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4',
              'animate-in fade-in slide-in-from-top-1 fill-mode-both duration-200 ease-out motion-reduce:animate-none',
            )}
          >
            <Field label={t('appointments.status')}>
              <Select
                value={statusValue}
                onChange={(e) => onFilter({ status: (e.target.value || undefined) as AppointmentStatus | undefined })}
                placeholder={t('appointments.allStatuses')}
                options={(
                  ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as AppointmentStatus[]
                ).map((s) => ({ value: s, label: t(`status.${s}`) }))}
              />
            </Field>

            <Field label={t('branch.title')}>
              <Select
                value={filters.branchId ?? ''}
                onChange={(e) => onFilter({ branchId: e.target.value || undefined })}
                placeholder={t('branch.all')}
                options={options.branches.map((b) => ({ value: b.id, label: b.name }))}
              />
            </Field>

            <Field label={t('appointments.staff')}>
              <Select
                value={filters.staffId ?? ''}
                onChange={(e) => onFilter({ staffId: e.target.value || undefined })}
                placeholder={t('appointments.allStaff')}
                options={options.staff.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Field>

            <Field label={t('appointments.service')}>
              <Select
                value={filters.serviceId ?? ''}
                onChange={(e) => onFilter({ serviceId: e.target.value || undefined })}
                placeholder={t('appointments.allServices')}
                options={options.services.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Field>

            <Field label={t('appointments.payment')}>
              <Select
                value={filters.payment ?? ''}
                onChange={(e) =>
                  onFilter({ payment: (e.target.value || undefined) as AppointmentFilterParams['payment'] })
                }
                placeholder={t('appointments.allPayments')}
                options={[
                  { value: 'unpaid', label: t('appointments.payUnpaid') },
                  { value: 'partial', label: t('appointments.payPartial') },
                  { value: 'paid', label: t('appointments.payPaid') },
                ]}
              />
            </Field>

            <Field label={t('appointments.channel')}>
              <Select
                value={filters.source ?? ''}
                onChange={(e) =>
                  onFilter({ source: (e.target.value || undefined) as AppointmentFilterParams['source'] })
                }
                placeholder={t('appointments.allChannels')}
                options={[
                  { value: 'ONLINE', label: t('appointments.sourceOnline') },
                  { value: 'WALK_IN', label: t('appointments.walkIn') },
                  { value: 'ADMIN', label: t('appointments.sourceAdmin') },
                ]}
              />
            </Field>

            <Field label={t('appointments.type')}>
              <Select
                value={filters.deliveryType ?? ''}
                onChange={(e) =>
                  onFilter({
                    deliveryType: (e.target.value || undefined) as AppointmentFilterParams['deliveryType'],
                  })
                }
                placeholder={t('appointments.allTypes')}
                options={[
                  { value: 'IN_STORE', label: t('appointments.inStore') },
                  { value: 'HOME_SERVICE', label: t('appointments.homeService') },
                ]}
              />
            </Field>

            <Field label={t('appointments.range_custom')}>
              <div className="flex items-center gap-1.5">
                <DateField
                  value={custom.from?.slice(0, 10) ?? ''}
                  onChange={(v) => {
                    onPreset('custom');
                    onCustom({ ...custom, from: v || undefined });
                  }}
                  aria-label={t('appointments.rangeFrom')}
                  placeholder={t('appointments.rangeFrom')}
                  className="w-full"
                />
                <span className="text-xs text-muted-foreground" aria-hidden="true">
                  –
                </span>
                <DateField
                  value={custom.to?.slice(0, 10) ?? ''}
                  onChange={(v) => {
                    onPreset('custom');
                    onCustom({ ...custom, to: v || undefined });
                  }}
                  aria-label={t('appointments.rangeTo')}
                  placeholder={t('appointments.rangeTo')}
                  className="w-full"
                />
              </div>
            </Field>

            <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-4">
              <Button variant="ghost" size="sm" onClick={onClear} disabled={activeCount === 0}>
                <X className="h-4 w-4" aria-hidden="true" />
                {t('appointments.clearFilters')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDrawer(false)}>
                <Columns3 className="h-4 w-4" aria-hidden="true" />
                {t('common.close')}
              </Button>
            </div>
          </div>
        ) : null}

        {chips}
      </div>
    </StickyPageHeader>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-2xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
