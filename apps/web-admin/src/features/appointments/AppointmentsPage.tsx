import type { AppointmentFlag, AppointmentSortField, AppointmentStatus } from '@abcp/shared-types';
import { X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { Pagination } from '@/components/shared/Pagination';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { WalkInSheet } from '@/features/queue/WalkInSheet';
import { useServices } from '@/features/services/services.api';
import { useStaffList } from '@/features/staff/staff.api';
import { useConfirm } from '@/hooks/useConfirm';
import { useDebounce } from '@/hooks/useDebounce';
import { dayjs, formatDateTime } from '@/lib/format';
import { useUiStore } from '@/store/ui.store';
import type { AppointmentListItem } from '@/types/models';

import { AppointmentDetailSheet } from './AppointmentDetailSheet';
import { BookingSheet } from './BookingSheet';
import { AppointmentsBoard } from './AppointmentsBoard';
import { AppointmentsCommandBar } from './AppointmentsCommandBar';
import { AppointmentsInsights } from './AppointmentsInsights';
import { AppointmentsOverview } from './AppointmentsOverview';
import { AppointmentsTable } from './AppointmentsTable';
import { AppointmentsTimeline, type TimelineLayout } from './AppointmentsTimeline';
import {
  appointmentsApi,
  useAppointmentSummary,
  useAppointments,
  useBulkAppointmentStatus,
  useSetAppointmentStatus,
  type AppointmentFilterParams,
} from './appointments.api';
import {
  DESTRUCTIVE_STATUS,
  RANGE_PRESETS,
  VIEW_MODES,
  balanceOf,
  downloadCsv,
  rangeOf,
  usePref,
  useTicker,
  type DateRange,
  type RangePreset,
  type ViewMode,
} from './appointments.lib';

/** Hard cap on a CSV export, mirroring what the server will page out in one call. */
const EXPORT_LIMIT = 2_000;

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

/**
 * /appointments — the booking command center.
 *
 * Structure: a sticky command bar owns every control that narrows the page; the
 * overview band summarises the *whole* filtered set from the server; below it a
 * single view (table / board / timeline / insights) renders that set. Opening a
 * record is a sheet, not a navigation, so the working context survives.
 *
 * Filter state lives in the URL, which makes a filtered view shareable and
 * survives a reload — the previous version kept it in component state and lost
 * it on every refresh.
 */
export function AppointmentsPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('appointments:manage');
  const confirm = useConfirm();
  const activeBranch = useUiStore((s) => s.activeBranchId);
  const now = useTicker(60_000);

  const [params, setParams] = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);

  // ── URL-backed state ─────────────────────────────────────────────
  const read = useCallback((key: string) => params.get(key) ?? undefined, [params]);

  const patchParams = useCallback(
    (patch: Record<string, string | undefined>, opts: { resetPage?: boolean } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === '') next.delete(k);
            else next.set(k, v);
          }
          if (opts.resetPage !== false) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const view = (VIEW_MODES as readonly string[]).includes(read('view') ?? '')
    ? (read('view') as ViewMode)
    : 'table';
  const preset = (RANGE_PRESETS as readonly string[]).includes(read('range') ?? '')
    ? (read('range') as RangePreset)
    : 'next7';
  const page = Math.max(1, Number(read('page') ?? 1) || 1);
  const pageSize = Math.max(1, Number(read('size') ?? 25) || 25);
  const sort = (read('sort') ?? 'startAt') as AppointmentSortField;
  const order = read('order') === 'asc' ? 'asc' : 'desc';
  const openId = read('id') ?? null;

  const custom: DateRange = useMemo(
    () => ({ from: read('from'), to: read('to') }),
    [read],
  );

  const [search, setSearch] = useState(() => read('q') ?? '');
  const debouncedSearch = useDebounce(search, 300);
  const [density, setDensity] = usePref<'comfortable' | 'compact'>(
    'appointments:density',
    ['comfortable', 'compact'],
    'comfortable',
  );
  const [timelineLayout, setTimelineLayout] = usePref<TimelineLayout>(
    'appointments:timelineLayout',
    ['time', 'staff'],
    'time',
  );
  const [walkInOpen, setWalkInOpen] = useState(false);
  /** null = closed; { item: null } = create; { item } = reschedule that booking. */
  const [booking, setBooking] = useState<{ item: AppointmentListItem | null } | null>(null);

  // ?new=1 (portal quick action) opens the booking dialog once, then drops the flag.
  useEffect(() => {
    if (params.get('new') !== '1') return;
    if (canManage) setBooking({ item: null });
    setParams(
      (p) => {
        p.delete('new');
        return p;
      },
      { replace: true },
    );
  }, [params, setParams, canManage]);
  const [exporting, setExporting] = useState(false);

  // Search is typed locally and mirrored into the URL once it settles, so the
  // address bar doesn't churn on every keystroke.
  useEffect(() => {
    if ((read('q') ?? '') === debouncedSearch) return;
    patchParams({ q: debouncedSearch || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `read` changes on every param write
  }, [debouncedSearch]);

  // ── effective filters ────────────────────────────────────────────
  const range = useMemo(() => rangeOf(preset, custom), [preset, custom]);

  const filters: AppointmentFilterParams = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      status: read('status') as AppointmentStatus | undefined,
      branchId: read('branchId') ?? (activeBranch === 'all' ? undefined : activeBranch),
      staffId: read('staffId'),
      serviceId: read('serviceId'),
      deliveryType: read('deliveryType') as AppointmentFilterParams['deliveryType'],
      source: read('source') as AppointmentFilterParams['source'],
      payment: read('payment') as AppointmentFilterParams['payment'],
      flag: read('flag') as AppointmentFlag | undefined,
      from: range.from,
      to: range.to,
    }),
    [debouncedSearch, read, activeBranch, range],
  );

  const list = useAppointments({ ...filters, page, pageSize, sort, order });
  const summaryQuery = useAppointmentSummary(filters);
  const summary = summaryQuery.data;
  const rows = useMemo(() => list.data?.items ?? [], [list.data]);

  const setStatus = useSetAppointmentStatus();
  const bulkStatus = useBulkAppointmentStatus();

  // ── option lists for the filter drawer ───────────────────────────
  const { data: branches = [] } = useBranches();
  const { data: staffPage } = useStaffList({ page: 1, pageSize: 100 });
  const { data: servicesPage } = useServices({ page: 1, pageSize: 100 });
  const options = useMemo(
    () => ({
      branches: branches.map((b) => ({ id: b.id, name: b.name })),
      staff: (staffPage?.items ?? []).map((s) => ({ id: s.id, name: s.name })),
      services: (servicesPage?.items ?? []).map((s) => ({ id: s.id, name: s.name })),
    }),
    [branches, staffPage, servicesPage],
  );

  const nameOf = (list_: { id: string; name: string }[], id?: string) =>
    list_.find((x) => x.id === id)?.name ?? id ?? '';

  // ── chips ────────────────────────────────────────────────────────
  const chipDefs: { key: string; node: ReactNode }[] = [];
  if (filters.status) {
    chipDefs.push({
      key: 'status',
      node: <StatusPill status={filters.status} label={t(`status.${filters.status}`)} />,
    });
  }
  if (filters.flag) chipDefs.push({ key: 'flag', node: t(`appointments.flag${cap(filters.flag)}`) });
  if (read('branchId')) chipDefs.push({ key: 'branchId', node: nameOf(options.branches, filters.branchId) });
  if (filters.staffId) chipDefs.push({ key: 'staffId', node: nameOf(options.staff, filters.staffId) });
  if (filters.serviceId) chipDefs.push({ key: 'serviceId', node: nameOf(options.services, filters.serviceId) });
  if (filters.payment) chipDefs.push({ key: 'payment', node: t(`appointments.pay${cap(filters.payment)}`) });
  if (filters.source) {
    chipDefs.push({
      key: 'source',
      node:
        filters.source === 'WALK_IN'
          ? t('appointments.walkIn')
          : filters.source === 'ADMIN'
            ? t('appointments.sourceAdmin')
            : t('appointments.sourceOnline'),
    });
  }
  if (filters.deliveryType) {
    chipDefs.push({
      key: 'deliveryType',
      node: filters.deliveryType === 'HOME_SERVICE' ? t('appointments.homeService') : t('appointments.inStore'),
    });
  }
  if (preset !== 'all') {
    chipDefs.push({
      key: 'range',
      node:
        preset === 'custom'
          ? `${custom.from ? dayjs(custom.from).format('DD/MM') : '…'} – ${custom.to ? dayjs(custom.to).format('DD/MM') : '…'}`
          : t(`appointments.range_${preset}`),
    });
  }
  if (search) chipDefs.push({ key: 'q', node: `“${search}”` });

  const activeCount = chipDefs.length;

  const clearChip = (key: string) => {
    if (key === 'q') {
      setSearch('');
      patchParams({ q: undefined });
      return;
    }
    if (key === 'range') {
      patchParams({ range: 'all', from: undefined, to: undefined });
      return;
    }
    patchParams({ [key]: undefined });
  };

  const clearAll = () => {
    setSearch('');
    setParams(
      (prev) => {
        const next = new URLSearchParams();
        // The view and the open record are workspace state, not filters.
        const view_ = prev.get('view');
        if (view_) next.set('view', view_);
        next.set('range', 'all');
        return next;
      },
      { replace: true },
    );
  };

  // ── actions ──────────────────────────────────────────────────────
  const changeStatus = async (id: string, next: AppointmentStatus, label: string) => {
    if (DESTRUCTIVE_STATUS.includes(next)) {
      const okToGo = await confirm({
        title: t('appointments.confirmStatusTitle', { status: t(`status.${next}`) }),
        description: t('appointments.confirmStatusBody', { name: label, status: t(`status.${next}`) }),
        confirmLabel: t(`status.${next}`),
        destructive: true,
      });
      if (!okToGo) return;
    }
    setStatus.mutate(
      { id, status: next },
      {
        onSuccess: () => toast.success(t('appointments.statusUpdated')),
        onError: () => toast.error(t('services.saveError')),
      },
    );
  };

  const changeBulk = async (ids: string[], next: AppointmentStatus, clear: () => void) => {
    const okToGo = await confirm({
      title: t('appointments.confirmBulkTitle', { count: ids.length, status: t(`status.${next}`) }),
      description: t('appointments.confirmBulkBody', { count: ids.length, status: t(`status.${next}`) }),
      confirmLabel: t('common.confirm'),
      destructive: DESTRUCTIVE_STATUS.includes(next),
    });
    if (!okToGo) return;
    bulkStatus.mutate(
      { ids, status: next },
      {
        onSuccess: (res) => {
          clear();
          if (res.failed.length === 0) {
            toast.success(t('appointments.bulkDone', { count: res.updated.length }));
          } else {
            toast.error(
              t('appointments.bulkPartial', { done: res.updated.length, failed: res.failed.length }),
            );
          }
        },
        onError: () => toast.error(t('services.saveError')),
      },
    );
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await appointmentsApi.list({ ...filters, page: 1, pageSize: EXPORT_LIMIT, sort, order });
      const csvRows = res.items.map((a) => ({
        code: a.code,
        customer: a.customerName,
        phone: a.customerPhone,
        service: a.serviceName,
        staff: a.staffName,
        branch: a.branchName,
        room: a.roomName ?? '',
        startAt: formatDateTime(a.startAt),
        endAt: formatDateTime(a.endAt),
        durationMin: a.durationMin,
        status: t(`status.${a.status}`),
        channel: a.source,
        delivery: a.deliveryType,
        price: a.price,
        deposit: a.depositPaid,
        balance: balanceOf(a),
        paymentStatus: a.paymentStatus ?? '',
        paidAt: a.paidAt ? formatDateTime(a.paidAt) : '',
        rating: a.rating ?? '',
      }));
      downloadCsv(`appointments-${dayjs().format('YYYY-MM-DD')}.csv`, csvRows);
      toast.success(
        res.total > res.items.length
          ? t('appointments.exportedCapped', { count: csvRows.length, total: res.total })
          : t('appointments.exported', { count: csvRows.length }),
      );
    } catch {
      toast.error(t('dashboard.loadError'));
    } finally {
      setExporting(false);
    }
  };

  // ── keyboard ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.tagName === 'SELECT' || el?.isContentEditable;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (typing) return;
      const idx = Number(e.key);
      if (idx >= 1 && idx <= VIEW_MODES.length) {
        patchParams({ view: VIEW_MODES[idx - 1] }, { resetPage: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [patchParams]);

  const labelOf = (id: string) => rows.find((r) => r.id === id)?.customerName ?? id;

  return (
    <div className="space-y-4 pb-4">
      <AppointmentsCommandBar
        view={view}
        onView={(v) => patchParams({ view: v }, { resetPage: false })}
        search={search}
        onSearch={setSearch}
        searchRef={searchRef}
        preset={preset}
        onPreset={(p) => patchParams({ range: p, ...(p === 'custom' ? {} : { from: undefined, to: undefined }) })}
        custom={custom}
        onCustom={(r) => patchParams({ from: r.from, to: r.to })}
        filters={filters}
        onFilter={(patch) =>
          patchParams(Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v as string | undefined])))
        }
        options={options}
        activeCount={activeCount}
        onClear={clearAll}
        total={summary?.total ?? list.data?.total ?? null}
        isFetching={list.isFetching || summaryQuery.isFetching}
        onRefresh={() => {
          void list.refetch();
          void summaryQuery.refetch();
        }}
        onExport={() => void exportCsv()}
        exporting={exporting}
        canExport={(list.data?.total ?? 0) > 0}
        onWalkIn={() => setWalkInOpen(true)}
        onNewBooking={() => setBooking({ item: null })}
        canManage={canManage}
        density={density}
        onToggleDensity={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
        chips={
          chipDefs.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {chipDefs.map((c) => (
                <FilterChip key={c.key} onRemove={() => clearChip(c.key)} removeLabel={t('common.cancel')}>
                  {c.node}
                </FilterChip>
              ))}
              <Button variant="ghost" size="sm" className="h-6 px-2 text-2xs" onClick={clearAll}>
                {t('appointments.clearFilters')}
              </Button>
            </div>
          ) : null
        }
      />

      <AppointmentsOverview
        summary={summary}
        loading={summaryQuery.isLoading}
        activeStatus={filters.status}
        onPickStatus={(s) => patchParams({ status: s })}
        activeFlag={filters.flag}
        onPickFlag={(f) => patchParams({ flag: f })}
      />

      {list.isError ? (
        <div className="rounded-xl border border-border p-6 text-center text-sm">
          <p className="text-muted-foreground">{t('dashboard.loadError')}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void list.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : view === 'table' ? (
        <AppointmentsTable
          rows={rows}
          loading={list.isLoading}
          now={now}
          compact={density === 'compact'}
          sort={sort}
          order={order}
          onSort={(f) =>
            patchParams({ sort: f, order: sort === f && order === 'desc' ? 'asc' : 'desc' })
          }
          onOpen={(id) => patchParams({ id }, { resetPage: false })}
          onStatus={(item, next) => void changeStatus(item.id, next, item.customerName)}
          onReschedule={(item) => setBooking({ item })}
          onBulkStatus={(ids, next, clear) => void changeBulk(ids, next, clear)}
          canManage={canManage}
          page={page}
          pageSize={pageSize}
          total={list.data?.total ?? 0}
          onPage={(p) => patchParams({ page: String(p) }, { resetPage: false })}
          onPageSize={(n) => patchParams({ size: String(n) })}
        />
      ) : view === 'board' || view === 'timeline' ? (
        <div className="space-y-3">
          {view === 'board' ? (
            <AppointmentsBoard
              rows={rows}
              loading={list.isLoading}
              now={now}
              onOpen={(id) => patchParams({ id }, { resetPage: false })}
              onPickStatus={(s) => patchParams({ status: filters.status === s ? undefined : s })}
              byStatus={summary?.byStatus}
            />
          ) : (
            <AppointmentsTimeline
              rows={rows}
              loading={list.isLoading}
              now={now}
              onOpen={(id) => patchParams({ id }, { resetPage: false })}
              layout={timelineLayout}
              onLayout={setTimelineLayout}
            />
          )}
          {/* Board and timeline show one server page at a time, so they need the
              same pager as the table — otherwise anything past row 25 is
              unreachable in these views. */}
          <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={list.data?.total ?? 0}
              onPageChange={(p) => patchParams({ page: String(p) }, { resetPage: false })}
              onPageSizeChange={(n) => patchParams({ size: String(n) })}
            />
          </div>
        </div>
      ) : (
        <AppointmentsInsights
          summary={summary}
          loading={summaryQuery.isLoading}
          onPickStaff={(id) => patchParams({ staffId: filters.staffId === id ? undefined : id })}
          onPickService={(id) => patchParams({ serviceId: filters.serviceId === id ? undefined : id })}
          onPickBranch={(id) => patchParams({ branchId: read('branchId') === id ? undefined : id })}
          activeStaffId={filters.staffId}
          activeServiceId={filters.serviceId}
          activeBranchId={read('branchId')}
        />
      )}

      <AppointmentDetailSheet
        id={openId}
        onOpenChange={(open) => {
          if (!open) patchParams({ id: undefined }, { resetPage: false });
        }}
        onStatus={(id, next) => void changeStatus(id, next, labelOf(id))}
        onReschedule={(id) => {
          const item = rows.find((r) => r.id === id) ?? null;
          patchParams({ id: undefined }, { resetPage: false });
          setBooking({ item });
        }}
        canManage={canManage}
        pending={setStatus.isPending}
      />

      <BookingSheet
        open={booking !== null}
        onOpenChange={(v) => {
          if (!v) setBooking(null);
        }}
        appointment={booking?.item ?? null}
        defaultBranchId={activeBranch === 'all' ? undefined : activeBranch}
        onDone={(newId) => patchParams({ id: newId }, { resetPage: false })}
      />

      <WalkInSheet
        open={walkInOpen}
        onOpenChange={setWalkInOpen}
        defaultBranchId={activeBranch === 'all' ? undefined : activeBranch}
      />
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
