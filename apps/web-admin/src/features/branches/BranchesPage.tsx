import {
  Building2,
  CalendarCheck,
  CalendarOff,
  Download,
  Gauge,
  LayoutGrid,
  Map as MapIcon,
  MapPinned,
  Plus,
  Search,
  Star,
  Table2,
  Users,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/useAuth';
import { StatTile } from '@/features/payroll/payroll.parts';
import { downloadCsv } from '@/features/reports/lib/csv';
import { dayjs, formatDate } from '@/lib/format';
import { isAdminRole } from '@/lib/rbac';
import { ROUTES } from '@/router/paths';
import type { Branch, LaoProvinceId } from '@/types/models';

import { BranchCard } from './BranchCard';
import { BranchCompareTable } from './BranchCompareTable';
import { BranchDetailPanel, BranchDetailSheet } from './BranchDetailPanel';
import { ArchivedBranchesList } from './BranchDetailExtras';
import { BranchFormDialog } from './BranchFormDialog';
import { BranchListPanel } from './BranchListPanel';
import { AttentionCard, NetworkHeroCard } from './BranchNetworkBand';
import { LaoProvinceMap } from './LaoProvinceMap';
import { SegButton, Segmented } from './branches.parts';
import {
  PERIODS,
  branchIssues,
  deltaPct,
  healthOf,
  lossRate,
  matchesQuery,
  networkTotals,
  openState,
  sortRows,
  type BranchView,
  type Period,
  type Row,
  type SortKey,
  type StatusFilter,
} from './branches.lib';
import { LAO_PROVINCES, provinceName } from './lao-provinces';
import { useBranchInsights, useBranches } from './branches.api';

const VIEWS: { id: BranchView; icon: typeof LayoutGrid }[] = [
  { id: 'map', icon: MapIcon },
  { id: 'cards', icon: LayoutGrid },
  { id: 'compare', icon: Table2 },
];
const SORTS: SortKey[] = ['revenue', 'bookings', 'utilization', 'rating', 'issues', 'name'];

const parsePeriod = (v: string | null): Period => (PERIODS.includes(Number(v) as Period) ? (Number(v) as Period) : 30);
// The province map is the page's home view; cards and compare are opt-in.
const parseView = (v: string | null): BranchView => (v === 'cards' || v === 'compare' ? v : 'map');
const parseStatus = (v: string | null): StatusFilter =>
  v === 'open' || v === 'closed' || v === 'attention' ? v : 'all';
const parseSort = (v: string | null): SortKey => (SORTS.includes(v as SortKey) ? (v as SortKey) : 'revenue');

/**
 * /branches — the branch network command center. Band 1: network money (hero) + attention list.
 * Band 2: KPI tiles. Band 3: three views of the same filtered set — cards, map (province list +
 * choropleth + inline detail) and a compare/league table. View, period, filters, sort and the
 * open branch all live in the URL so every state is linkable.
 */
export function BranchesPage() {
  const { t, i18n } = useTranslation();
  const { hasPermission, role } = useAuth();
  const canManage = hasPermission('branches:manage');
  const canCreate = role === 'SUPER_ADMIN';
  const showInsights = isAdminRole(role);

  const [params, setParams] = useSearchParams();
  const days = parsePeriod(params.get('days'));
  const view = parseView(params.get('view'));
  const status = parseStatus(params.get('status'));
  const sort = parseSort(params.get('sort'));
  const q = params.get('q') ?? '';
  const openId = params.get('b');

  const setParam = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          for (const [k, v] of Object.entries(patch)) {
            if (v == null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const { data: branches = [], isLoading } = useBranches();
  const insightsQuery = useBranchInsights(days, showInsights);
  const insights = insightsQuery.data;
  const insightsLoading = showInsights && insightsQuery.isLoading;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<LaoProvinceId | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (b: Branch) => {
    setEditing(b);
    setFormOpen(true);
  };

  const nowHhmm = dayjs().tz().format('HH:mm');
  const todayKey = insights?.to;

  const rows: Row[] = useMemo(() => {
    const byId = new Map(insights?.items.map((i) => [i.branchId, i]) ?? []);
    return branches.map((b) => {
      const insight = byId.get(b.id);
      return { branch: b, insight, issues: branchIssues(b, insight, todayKey) };
    });
  }, [branches, insights, todayKey]);

  // BRANCH_ADMIN insights cover only their branch — scope the network band to rows that have data.
  const scopedRows = useMemo(
    () => (showInsights && insights ? rows.filter((r) => r.insight) : rows),
    [rows, insights, showInsights],
  );
  const totals = useMemo(() => (insights ? networkTotals(insights.items) : null), [insights]);

  const counts = useMemo(() => {
    const open = branches.filter((b) => b.isActive).length;
    return {
      all: branches.length,
      open,
      closed: branches.length - open,
      attention: rows.filter((r) => healthOf(r.issues) !== 'good').length,
      openNow: branches.filter((b) => b.isActive && openState(b.openTime, b.closeTime, nowHhmm).isOpen).length,
      provinces: new Set(branches.map((b) => b.province)).size,
    };
  }, [branches, rows, nowHhmm]);

  const filtered = useMemo(() => {
    const byStatus = rows.filter((r) =>
      status === 'open'
        ? r.branch.isActive
        : status === 'closed'
          ? !r.branch.isActive
          : status === 'attention'
            ? healthOf(r.issues) !== 'good'
            : true,
    );
    return sortRows(byStatus.filter((r) => matchesQuery(r.branch, q)), showInsights ? sort : 'name');
  }, [rows, status, q, sort, showInsights]);

  const openRow = rows.find((r) => r.branch.id === openId) ?? null;
  const openBranch = (id: string) => setParam({ b: id });

  const exportCsv = () => {
    downloadCsv(`branches-${formatDate(new Date()).replace(/\//g, '-')}`, [
      [
        t('branches.code'),
        t('branches.name'),
        t('branches.province'),
        t('branches.col.status'),
        t('branches.hours'),
        t('branches.phone'),
        t('branches.email'),
        t('branches.col.revenue'),
        t('branches.col.bookings'),
        t('branches.col.avgTicket'),
        t('branches.col.utilization'),
        t('branches.col.loss'),
        t('branches.col.rating'),
        t('branches.col.staff'),
        t('branches.res.rooms'),
        t('branches.col.unpaid'),
        t('branches.detail.lowStock'),
        t('branches.col.health'),
      ],
      ...filtered.map(({ branch: b, insight: i, issues }) => [
        b.code,
        b.name,
        provinceName(b.province, i18n.language),
        b.isActive ? t('branches.active') : t('branches.inactive'),
        `${b.openTime}-${b.closeTime}`,
        b.phone,
        b.email ?? '',
        i?.period.revenue ?? '',
        i?.period.bookings ?? '',
        i?.period.avgTicket ?? '',
        i?.period.utilization != null ? `${Math.round(i.period.utilization * 100)}%` : '',
        i && lossRate(i) != null ? `${Math.round((lossRate(i) ?? 0) * 100)}%` : '',
        i?.rating.avg ?? '',
        i?.staffCount ?? '',
        i?.roomCount ?? '',
        i?.outstandingAmount ?? '',
        i?.lowStock ?? '',
        t(`branches.health.${healthOf(issues)}`),
      ]),
    ]);
  };

  const bookingsDelta = totals ? deltaPct(totals.bookings, totals.bookingsPrev) : null;

  // Map view data
  const countsByProvince = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of filtered) c[r.branch.province] = (c[r.branch.province] ?? 0) + 1;
    return c;
  }, [filtered]);
  const mapBranches = filtered.map((r) => r.branch);
  const listBranches = selectedProvince ? mapBranches.filter((b) => b.province === selectedProvince) : mapBranches;

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">{t('branches.title')}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('branches.subtitle')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showInsights ? (
              <Segmented label={t('branches.period')}>
                {PERIODS.map((d) => (
                  <SegButton key={d} active={days === d} onClick={() => setParam({ days: d === 30 ? null : String(d) })}>
                    {t('branches.periodDays', { count: d })}
                  </SegButton>
                ))}
              </Segmented>
            ) : null}
            <Button variant="secondary" asChild>
              <Link to={ROUTES.branchClosures}>
                <CalendarOff className="h-4 w-4" aria-hidden="true" />
                {t('branches.closuresLink')}
              </Link>
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {t('branches.export')}
            </Button>
            {canCreate ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('branches.createTitle')}
              </Button>
            ) : null}
          </div>
        </div>
      </StickyPageHeader>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-5">
            <Skeleton className="h-[360px] lg:col-span-3" />
            <Skeleton className="h-[360px] lg:col-span-2" />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </div>
      ) : branches.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t('branches.empty')}
          description={t('branches.emptyHint')}
          action={
            canCreate ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('branches.createTitle')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {showInsights ? (
            <div className="grid items-stretch gap-3 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <NetworkHeroCard insights={insights} totals={totals} rows={scopedRows} loading={insightsLoading} />
              </div>
              <div className="lg:col-span-2">
                <AttentionCard rows={scopedRows} loading={insightsLoading} onOpen={openBranch} />
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
            <StatTile
              index={0}
              icon={Building2}
              tone="primary"
              label={t('branches.stat.openNow')}
              value={`${counts.openNow}/${counts.all}`}
              hint={t('branches.summary.openClosed', { open: counts.open, closed: counts.closed })}
              onClick={() => setParam({ status: status === 'open' ? null : 'open' })}
              active={status === 'open'}
            />
            <StatTile
              index={1}
              icon={MapPinned}
              tone="info"
              label={t('branches.summary.provinces')}
              value={`${counts.provinces}/${LAO_PROVINCES.length}`}
              hint={t('branches.summary.coverage', { pct: Math.round((counts.provinces / LAO_PROVINCES.length) * 100) })}
              onClick={() => setParam({ view: null })}
            />
            <StatTile
              index={2}
              icon={Users}
              tone="accent"
              loading={insightsLoading}
              label={t('branches.stat.staff')}
              value={totals?.staff ?? '—'}
              hint={totals ? t('branches.stat.staffHint', { count: totals.customers }) : undefined}
            />
            <StatTile
              index={3}
              icon={Gauge}
              tone="success"
              loading={insightsLoading}
              label={t('branches.util.label')}
              value={totals?.utilization != null ? `${Math.round(totals.utilization * 100)}%` : '—'}
              hint={t('branches.stat.utilHint')}
            />
            <StatTile
              index={4}
              icon={Star}
              tone="warning"
              loading={insightsLoading}
              label={t('branches.col.rating')}
              value={totals?.rating != null ? totals.rating.toFixed(2) : '—'}
              hint={totals ? t('branches.card.reviews', { count: totals.ratingCount }) : undefined}
            />
            <StatTile
              index={5}
              icon={CalendarCheck}
              tone="primary"
              loading={insightsLoading}
              label={t('branches.col.bookings')}
              value={totals?.bookings ?? '—'}
              delta={totals ? { pct: bookingsDelta == null ? null : Math.round(bookingsDelta * 100), good: bookingsDelta == null ? null : bookingsDelta >= 0 } : null}
              hint={t('branches.periodDays', { count: days })}
              onClick={showInsights ? () => setParam({ view: 'compare', sort: 'bookings' }) : undefined}
            />
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label={t('branches.viewLabel')}>
              {VIEWS.map((v) => (
                <SegButton key={v.id} icon={v.icon} active={view === v.id} onClick={() => setParam({ view: v.id === 'map' ? null : v.id })}>
                  {t(`branches.view.${v.id}`)}
                </SegButton>
              ))}
            </Segmented>
            <Segmented label={t('branches.col.status')} className="overflow-x-auto">
              {(['all', 'open', 'closed', ...(showInsights ? ['attention'] : [])] as StatusFilter[]).map((s) => (
                <SegButton key={s} active={status === s} count={counts[s]} onClick={() => setParam({ status: s === 'all' ? null : s })}>
                  {t(`branches.status.${s}`)}
                </SegButton>
              ))}
            </Segmented>
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={q}
                onChange={(e) => setParam({ q: e.target.value })}
                placeholder={t('branches.searchPlaceholder')}
                aria-label={t('branches.searchPlaceholder')}
                className="h-9 pl-8"
              />
            </div>
            {showInsights && view === 'cards' ? (
              <Select
                value={sort}
                onChange={(e) => setParam({ sort: e.target.value === 'revenue' ? null : e.target.value })}
                aria-label={t('branches.sortLabel')}
                className="h-9 w-auto"
                options={SORTS.map((s) => ({ value: s, label: t(`branches.sort.${s}`) }))}
              />
            ) : null}
            <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
              {t('branches.branchCount', { count: filtered.length })}
            </p>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Search}
              title={t('branches.noResults')}
              action={
                <Button variant="secondary" onClick={() => setParam({ q: null, status: null })}>
                  {t('branches.clearFilters')}
                </Button>
              }
            />
          ) : view === 'cards' ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filtered.map((r, idx) => (
                <BranchCard
                  key={r.branch.id}
                  row={r}
                  index={idx}
                  nowHhmm={nowHhmm}
                  insightsLoading={insightsLoading}
                  active={openId === r.branch.id}
                  onOpen={() => openBranch(r.branch.id)}
                />
              ))}
            </div>
          ) : view === 'compare' ? (
            showInsights ? (
              <BranchCompareTable
                rows={filtered}
                sort={sort}
                onSort={(k) => setParam({ sort: k === 'revenue' ? null : k })}
                activeId={openId}
                onOpen={openBranch}
                days={days}
              />
            ) : (
              <EmptyState icon={Table2} title={t('branches.compare.adminOnly')} />
            )
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(280px,320px)_1fr] xl:grid-cols-[300px_1fr_minmax(340px,400px)]">
              <BranchListPanel
                className="max-h-[60vh] self-start lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)]"
                branches={listBranches}
                query=""
                onQueryChange={(v) => setParam({ q: v })}
                selectedProvince={selectedProvince}
                onSelectProvince={setSelectedProvince}
                activeBranchId={openId}
                onSelectBranch={(id) => {
                  openBranch(id);
                  const b = branches.find((x) => x.id === id);
                  if (b && selectedProvince && b.province !== selectedProvince) setSelectedProvince(null);
                }}
                hideSearch
              />
              <Card className="min-w-0 self-start p-4 sm:p-5">
                <div className="mb-3">
                  <h2 className="text-sm font-semibold text-foreground">{t('branches.map.title')}</h2>
                  <p className="text-xs text-muted-foreground">{t('branches.map.caption')}</p>
                </div>
                <LaoProvinceMap
                  branches={mapBranches}
                  countsByProvince={countsByProvince}
                  selectedProvince={selectedProvince}
                  activeBranchId={openId}
                  onSelectProvince={setSelectedProvince}
                  onSelectBranch={openBranch}
                />
              </Card>
              <div className="self-start lg:col-span-2 xl:col-span-1">
                <BranchDetailPanel
                  branch={openRow?.branch ?? null}
                  insight={openRow?.insight}
                  issues={openRow?.issues ?? []}
                  days={days}
                  fromKey={insights?.from}
                  canManage={canManage}
                  onEdit={openEdit}
                />
              </div>
            </div>
          )}
        </>
      )}

      {view !== 'map' ? (
        <BranchDetailSheet
          branch={openRow?.branch ?? null}
          insight={openRow?.insight}
          issues={openRow?.issues ?? []}
          days={days}
          fromKey={insights?.from}
          canManage={canManage}
          onEdit={openEdit}
          onClose={() => setParam({ b: null })}
        />
      ) : null}

      <ArchivedBranchesList />

      <BranchFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        branch={editing}
        upcomingAppointments={editing ? rows.find((r) => r.branch.id === editing.id)?.insight?.upcomingAppointments : undefined}
      />
    </div>
  );
}
