import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Home,
  LayoutGrid,
  MapPin,
  MapPinned,
  Radar,
  RefreshCw,
  Route,
  Table2,
  Timer,
  UserRoundX,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { HomeServiceJobStatus, HomeServiceTripView } from '@abcp/shared-types';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { DataTable, DateTimeText, FilterBar } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Pagination } from '@/components/shared/Pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { useStaffList } from '@/features/staff/staff.api';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';
import { connectAppSocket } from '@/services/socket';

import { HomeServiceActivityFeed } from './HomeServiceActivityFeed';
import { HomeServiceDispatchMap } from './HomeServiceDispatchMap';
import { HomeServicePendingChart } from './HomeServicePendingChart';
import { HomeServiceStatCard, type HomeServiceStatTone } from './HomeServiceStatCard';
import { HomeServiceStaffLoadRail } from './HomeServiceStaffLoadRail';
import { HomeServiceStatusChart } from './HomeServiceStatusChart';
import { HomeServiceThroughputChart } from './HomeServiceThroughputChart';
import { HomeServiceTripDetailSheet } from './HomeServiceTripDetailSheet';
import { HOME_SERVICE_TRIPS_KEY, useAssignTrip, useHomeServiceTrips } from './home-service.api';
import { isLive, slaBreached, STATUS_DOT, STATUS_VARIANT } from './home-service.status';

const STATUSES: HomeServiceJobStatus[] = [
  'MATCHING',
  'ASSIGNED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_MATCH',
];

const REASSIGNABLE: ReadonlyArray<HomeServiceJobStatus> = ['NO_MATCH', 'ASSIGNED', 'EN_ROUTE'];
const VIEW_KEY = 'home-service-dispatch:view';

type ViewMode = 'table' | 'board' | 'map';

function readView(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'board' || v === 'map' ? v : 'table';
  } catch {
    return 'table';
  }
}

const BOARD_LANES: { key: string; statuses: HomeServiceJobStatus[] }[] = [
  { key: 'needsAttention', statuses: ['NO_MATCH'] },
  { key: 'matching', statuses: ['MATCHING'] },
  { key: 'onTheWay', statuses: ['ASSIGNED', 'EN_ROUTE'] },
  { key: 'onSite', statuses: ['ARRIVED', 'IN_PROGRESS'] },
  { key: 'completedToday', statuses: ['COMPLETED'] },
];

export function HomeServiceDispatchPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('queue:manage');
  const { data: branches = [] } = useBranches();
  const qc = useQueryClient();

  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState<'' | HomeServiceJobStatus>('');
  const [query, setQuery] = useState('');
  const q = useDebounce(query.trim().toLowerCase(), 200);
  const [assigning, setAssigning] = useState<HomeServiceTripView[] | null>(null);
  const [detailTrip, setDetailTrip] = useState<HomeServiceTripView | null>(null);
  const [view, setView] = useState<ViewMode>(readView);
  const pagination = usePagination();

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* private mode — best effort */
    }
  }, [view]);

  const { data: trips = [], isLoading, isFetching, dataUpdatedAt } = useHomeServiceTrips({
    branchId: branchId || undefined,
  });
  const assignM = useAssignTrip();

  // Live updates — dispatch console joins a single admin room and patches the react-query cache
  // in place (mirrors ChatPanel.tsx's socket pattern). The 15s poll stays on as a fallback.
  useEffect(() => {
    const socket = connectAppSocket();
    socket.emit('join-home-service-admin');
    socket.on('home-service:trip-update', (trip: HomeServiceTripView) => {
      qc.setQueriesData<HomeServiceTripView[]>({ queryKey: HOME_SERVICE_TRIPS_KEY }, (old) => {
        if (!old) return old;
        const idx = old.findIndex((t) => t.id === trip.id);
        if (idx === -1) return [trip, ...old];
        const next = [...old];
        next[idx] = trip;
        return next;
      });
    });
    return () => {
      socket.emit('leave-home-service-admin');
      socket.disconnect();
    };
  }, [qc]);

  const now = dataUpdatedAt || Date.now();

  const counts = useMemo(() => {
    const c: Record<HomeServiceJobStatus, number> = {
      MATCHING: 0,
      ASSIGNED: 0,
      EN_ROUTE: 0,
      ARRIVED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      NO_MATCH: 0,
    };
    for (const trip of trips) c[trip.status] += 1;
    return c;
  }, [trips]);

  const onTheWay = counts.ASSIGNED + counts.EN_ROUTE;
  const onSite = counts.ARRIVED + counts.IN_PROGRESS;

  const filtered = useMemo(() => {
    return trips.filter((trip) => {
      if (status && trip.status !== status) return false;
      if (!q) return true;
      return (
        trip.customerName.toLowerCase().includes(q) ||
        (trip.matchedStaffName ?? '').toLowerCase().includes(q) ||
        (trip.homeAddress ?? '').toLowerCase().includes(q)
      );
    });
  }, [trips, status, q]);

  useEffect(() => {
    pagination.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, status, q]);

  const pagedTrips = useMemo(() => {
    const start = (pagination.page - 1) * pagination.pageSize;
    return filtered.slice(start, start + pagination.pageSize);
  }, [filtered, pagination.page, pagination.pageSize]);

  const activeTrips = useMemo(
    () => trips.filter((t) => ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(t.status)),
    [trips],
  );
  const { data: branchStaffPage } = useStaffList(
    { branchId, page: 1, pageSize: 100 },
    { enabled: Boolean(branchId) },
  );
  const rosterNames = useMemo(
    () => (branchId ? (branchStaffPage?.items ?? []).filter((s) => s.isActive).map((s) => s.name) : []),
    [branchId, branchStaffPage],
  );

  const statCards: { key: string; icon: typeof Radar; tone: HomeServiceStatTone; label: string; value: number; hint?: string; status?: HomeServiceJobStatus }[] = [
    {
      key: 'needsAttention',
      icon: AlertTriangle,
      tone: 'danger',
      label: t('homeServiceDispatch.stat.needsAttention'),
      value: counts.NO_MATCH,
      status: 'NO_MATCH',
    },
    {
      key: 'matching',
      icon: Radar,
      tone: 'warning',
      label: t('homeServiceDispatch.stat.matching'),
      value: counts.MATCHING,
      status: 'MATCHING',
    },
    {
      key: 'onTheWay',
      icon: Route,
      tone: 'primary',
      label: t('homeServiceDispatch.stat.onTheWay'),
      value: onTheWay,
      hint: t('homeServiceDispatch.stat.onTheWayHint', { assigned: counts.ASSIGNED, enRoute: counts.EN_ROUTE }),
    },
    {
      key: 'onSite',
      icon: Home,
      tone: 'accent',
      label: t('homeServiceDispatch.stat.onSite'),
      value: onSite,
    },
    {
      key: 'completedToday',
      icon: CheckCircle2,
      tone: 'success',
      label: t('homeServiceDispatch.stat.completedToday'),
      value: counts.COMPLETED,
      status: 'COMPLETED',
    },
  ];

  const columns = useMemo<ColumnDef<HomeServiceTripView, unknown>[]>(
    () => [
      {
        header: t('homeServiceDispatch.col.customer'),
        accessorKey: 'customerName',
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.customerName}</div>
            {row.original.homeAddress ? (
              <div className="mt-0.5 flex items-center gap-1 text-2xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{row.original.homeAddress}</span>
              </div>
            ) : null}
          </div>
        ),
      },
      {
        header: t('homeServiceDispatch.col.stylist'),
        id: 'stylist',
        cell: ({ row }) =>
          row.original.matchedStaffName ? (
            <div className="flex min-w-0 items-center gap-2">
              <PersonAvatar name={row.original.matchedStaffName} size={26} />
              <span className="truncate text-sm">{row.original.matchedStaffName}</span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <UserRoundX className="h-3.5 w-3.5" aria-hidden="true" />
              {t('homeServiceDispatch.noStylist')}
            </span>
          ),
      },
      {
        header: t('homeServiceDispatch.col.status'),
        id: 'status',
        cell: ({ row }) => {
          const variant = STATUS_VARIANT[row.original.status];
          const live = isLive(row.original, now);
          const breach = slaBreached(row.original, now);
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={variant}>
                <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[variant])} aria-hidden="true" />
                {t(`homeServiceDispatch.status.${row.original.status}`)}
              </Badge>
              {breach ? (
                <span
                  className="inline-flex items-center gap-1 text-2xs font-medium text-destructive"
                  title={t('homeServiceDispatch.slaBreach')}
                >
                  <Timer className="h-3 w-3" aria-hidden="true" />
                  {t('homeServiceDispatch.slaBreach')}
                </span>
              ) : null}
              {live ? (
                <span
                  className="inline-flex items-center gap-1 text-2xs font-medium text-success"
                  title={t('homeServiceDispatch.gpsLive')}
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
                  </span>
                  {t('homeServiceDispatch.gpsLive')}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        header: t('homeServiceDispatch.col.startAt'),
        id: 'startAt',
        cell: ({ row }) => <DateTimeText value={row.original.startAt} mode="datetime" />,
      },
      {
        header: t('homeServiceDispatch.col.eta'),
        id: 'eta',
        cell: ({ row }) =>
          row.original.etaMinutes != null ? (
            <span className="inline-flex items-center gap-1 text-sm tabular-nums">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {t('homeServiceDispatch.etaMinutes', { count: row.original.etaMinutes })}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) => {
          if (!canManage || !REASSIGNABLE.includes(row.original.status)) return null;
          return (
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setAssigning([row.original]);
                }}
              >
                <Route className="h-3 w-3" aria-hidden="true" />
                {t('homeServiceDispatch.reassign')}
              </Button>
            </div>
          );
        },
      },
    ],
    [t, canManage, now],
  );

  const boardLanes = useMemo(
    () =>
      BOARD_LANES.map((lane) => ({
        ...lane,
        trips: filtered.filter((trip) => lane.statuses.includes(trip.status)),
      })),
    [filtered],
  );

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-sans text-2xl text-foreground">
              {t('nav.homeServiceDispatch')}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('homeServiceDispatch.subtitle')}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-2xs font-medium text-muted-foreground">
            <RefreshCw className={cn('h-3 w-3', isFetching && 'animate-spin')} aria-hidden="true" />
            {isFetching
              ? t('homeServiceDispatch.updating')
              : t('homeServiceDispatch.liveUpdated', {
                  time: dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—',
                })}
          </span>
        </div>
      </StickyPageHeader>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[68px] w-full" />)
              : statCards.map((c, i) => (
                  <HomeServiceStatCard
                    key={c.key}
                    index={i}
                    icon={c.icon}
                    tone={c.tone}
                    label={c.label}
                    value={c.value}
                    hint={c.hint}
                    active={c.status ? status === c.status : false}
                    onClick={c.status ? () => setStatus((cur) => (cur === c.status ? '' : c.status!)) : undefined}
                  />
                ))}
          </div>

          {branchId && !isLoading ? (
            <HomeServiceStaffLoadRail activeTrips={activeTrips} rosterNames={rosterNames} />
          ) : null}

          <Card className="flex flex-1 flex-col overflow-hidden">
            <CardHeader className="border-b border-border bg-muted/40 p-3">
              <h2 className="text-xs font-semibold">{t('homeServiceDispatch.recentActivity')}</h2>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-2">
              {isLoading ? (
                <Skeleton className="h-full min-h-[160px] w-full" />
              ) : (
                <HomeServiceActivityFeed trips={filtered} onSelect={setDetailTrip} />
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="flex flex-col divide-y divide-border self-start overflow-hidden">
          {isLoading ? (
            <CardContent className="flex-1 p-4">
              <Skeleton className="h-full min-h-[240px] w-full" />
            </CardContent>
          ) : (
            <>
              <CardContent className="p-4">
                <p className="mb-2 text-2xs font-semibold text-muted-foreground">
                  {t('homeServiceDispatch.statusBreakdown')}
                </p>
                <HomeServiceStatusChart counts={counts} />
              </CardContent>
              <CardContent className="p-4">
                <HomeServiceThroughputChart trips={trips} />
              </CardContent>
              <CardContent className="p-4">
                <HomeServicePendingChart trips={trips} />
              </CardContent>
            </>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterBar
          search={query}
          onSearchChange={setQuery}
          searchPlaceholder={t('homeServiceDispatch.searchPlaceholder')}
          hasActiveFilters={Boolean(branchId || status || query)}
          onClear={() => {
            setBranchId('');
            setStatus('');
            setQuery('');
          }}
        >
          <Select
            className="h-9 w-[170px]"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            options={[
              { value: '', label: t('inventory.allBranches') },
              ...branches.map((b) => ({ value: b.id, label: b.name })),
            ]}
            aria-label={t('inventory.col.branch')}
          />
          <Select
            className="h-9 w-[170px]"
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | HomeServiceJobStatus)}
            options={[
              { value: '', label: t('homeServiceDispatch.filterAll') },
              ...STATUSES.map((s) => ({ value: s, label: t(`homeServiceDispatch.status.${s}`) })),
            ]}
            aria-label={t('homeServiceDispatch.col.status')}
          />
        </FilterBar>

        <div className="flex shrink-0 items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5">
          {(
            [
              { mode: 'table' as const, icon: Table2, label: t('homeServiceDispatch.viewTable') },
              { mode: 'board' as const, icon: LayoutGrid, label: t('homeServiceDispatch.viewBoard') },
              { mode: 'map' as const, icon: MapPinned, label: t('homeServiceDispatch.viewMap') },
            ]
          ).map((v) => (
            <button
              key={v.mode}
              type="button"
              onClick={() => setView(v.mode)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium transition-colors',
                view === v.mode ? 'bg-card shadow-xs' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={view === v.mode}
            >
              <v.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'table' ? (
        <Card className="overflow-hidden">
          <div className="p-2 sm:p-3">
            <DataTable
              columns={columns}
              data={pagedTrips}
              loading={isLoading}
              getRowId={(r) => r.id}
              onRowClick={(row) => setDetailTrip(row)}
              enableSelection={canManage}
              renderBulkActions={(ids, clear) => (
                <Button
                  size="sm"
                  onClick={() => {
                    const rows = filtered.filter((r) => ids.includes(r.id) && REASSIGNABLE.includes(r.status));
                    if (rows.length === 0) {
                      toast.error(t('homeServiceDispatch.bulkNoneEligible'));
                      return;
                    }

                    setAssigning(rows);
                    clear();
                  }}
                >
                  {t('homeServiceDispatch.bulkReassign', { count: ids.length })}
                </Button>
              )}
              emptyTitle={q || status || branchId ? t('homeServiceDispatch.noMatch') : t('homeServiceDispatch.empty')}
            />
          </div>
          {filtered.length > 0 ? (
            <div className="border-t border-border px-4 py-3">
              <Pagination
                page={pagination.page}
                pageSize={pagination.pageSize}
                total={filtered.length}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
              />
            </div>
          ) : null}
        </Card>
      ) : view === 'board' ? (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          {boardLanes.map((lane) => (
            <Card key={lane.key} className="overflow-hidden">
              <CardHeader className="flex-row items-center justify-between bg-muted/40 p-3">
                <h2 className="text-xs font-semibold">{t(`homeServiceDispatch.stat.${lane.key}`)}</h2>
                <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold tabular-nums">
                  {lane.trips.length}
                </span>
              </CardHeader>
              <CardContent className="max-h-[28rem] space-y-2 overflow-y-auto p-2">
                {lane.trips.length === 0 ? (
                  <p className="py-6 text-center text-2xs text-muted-foreground">
                    {t('homeServiceDispatch.laneEmpty')}
                  </p>
                ) : (
                  lane.trips.map((trip) => {
                    const variant = STATUS_VARIANT[trip.status];
                    return (
                      <button
                        key={trip.id}
                        type="button"
                        onClick={() => setDetailTrip(trip)}
                        className="w-full rounded-md border border-border bg-card p-2.5 text-left shadow-xs transition-colors hover:bg-muted/30"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-medium">{trip.customerName}</span>
                          {slaBreached(trip, now) ? (
                            <Timer className="h-3 w-3 shrink-0 text-destructive" aria-hidden="true" />
                          ) : null}
                        </div>
                        <p className="mt-1 truncate text-2xs text-muted-foreground">
                          {trip.matchedStaffName ?? t('homeServiceDispatch.noStylist')}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1">
                          <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[variant])} aria-hidden="true" />
                          <DateTimeText value={trip.startAt} mode="datetime" className="text-2xs text-muted-foreground" />
                        </div>
                      </button>
                    );
                  })
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <HomeServiceDispatchMap trips={filtered} onSelectTrip={setDetailTrip} />
      )}

      <HomeServiceTripDetailSheet
        trip={detailTrip}
        now={now}
        onClose={() => setDetailTrip(null)}
        canManage={canManage}
        onReassign={(trip) => {
          setDetailTrip(null);
          setAssigning([trip]);
        }}
      />

      <AssignDialog
        trips={assigning}
        pending={assignM.isPending}
        onClose={() => setAssigning(null)}
        onSubmit={(staffProfileId) => {
          if (!assigning || assigning.length === 0) return;
          Promise.all(
            assigning.map((trip) =>
              assignM.mutateAsync({ appointmentId: trip.appointmentId, staffProfileId }),
            ),
          )
            .then(() => {
              toast.success(t('common.saved'));
              setAssigning(null);
            })
            .catch((err) =>
              toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
            );
        }}
      />
    </div>
  );
}

function AssignDialog({
  trips,
  pending,
  onClose,
  onSubmit,
}: {
  trips: HomeServiceTripView[] | null;
  pending: boolean;
  onClose: () => void;
  onSubmit: (staffProfileId: string) => void;
}) {
  const { t } = useTranslation();
  const [staffProfileId, setStaffProfileId] = useState('');
  const [initedFor, setInitedFor] = useState<string | null>(null);
  const branchId = trips?.[0]?.branchId ?? '';
  const { data: staffPage } = useStaffList({
    branchId,
    page: 1,
    pageSize: 100,
  });
  const staff = staffPage?.items ?? [];

  const targetKey = trips?.map((t) => t.id).join(',') ?? null;
  if (trips && targetKey !== initedFor) {
    setInitedFor(targetKey);
    setStaffProfileId(trips.length === 1 ? (trips[0]!.matchedStaffId ?? '') : '');
  }
  if (!trips && initedFor !== null) setInitedFor(null);

  return (
    <Dialog open={Boolean(trips)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {trips && trips.length > 1
              ? t('homeServiceDispatch.bulkReassignTitle', { count: trips.length })
              : t('homeServiceDispatch.reassignTitle')}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!staffProfileId) {
              toast.error(t('homeServiceDispatch.staffRequired'));
              return;
            }
            onSubmit(staffProfileId);
          }}
        >
          <div className="space-y-1.5">
            <Label>{t('homeServiceDispatch.col.stylist')}</Label>
            <Select
              value={staffProfileId}
              onChange={(e) => setStaffProfileId(e.target.value)}
              options={[
                { value: '', label: t('homeServiceDispatch.pickStylist') },
                ...staff.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
