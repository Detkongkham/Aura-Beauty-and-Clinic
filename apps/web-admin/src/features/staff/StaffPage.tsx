import { RefreshCw, Scissors, Search, UserCheck, Users, UserX, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Pagination } from '@/components/shared/Pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useBranches } from '@/features/branches/branches.api';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import type { StaffProfile } from '@/types/models';

import { StaffByBranchCard } from './StaffByBranchCard';
import { StaffStatCard } from './StaffStatCard';
import { StaffTabs } from './StaffTabs';
import { useStaffList } from './staff.api';

export function StaffPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: branches = [] } = useBranches();

  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('');
  const [active, setActive] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const pagination = usePagination();

  const { data, isLoading, isError, refetch, isFetching } = useStaffList({
    q: debouncedSearch || undefined,
    branchId: branchId || undefined,
    page: pagination.page,
    pageSize: pagination.pageSize,
  });

  const rows = useMemo(() => {
    const items = data?.items ?? [];
    return active === '' ? items : items.filter((s) => String(s.isActive) === active);
  }, [data?.items, active]);

  // Branch-scoped totals for the summary cards. Client-side aggregation over a
  // wide page for now — should move to a server-side count when the admin
  // `/staff` endpoint lands.
  const { data: summary, isLoading: summaryLoading } = useStaffList({
    branchId: branchId || undefined,
    page: 1,
    pageSize: 500,
  });
  const stats = useMemo(() => {
    const items = summary?.items ?? [];
    const total = summary?.total ?? items.length;
    const activeCount = items.filter((s) => s.isActive).length;
    const counts = items.map((s) => s.serviceIds.length);
    const serviceSum = counts.reduce((n, v) => n + v, 0);
    const branchCount = new Set(items.map((s) => s.branchName || '—')).size;
    return {
      total,
      active: activeCount,
      inactive: Math.max(total - activeCount, 0),
      pct: (n: number) => (total ? Math.round((n / total) * 100) : 0),
      branchCount,
      avgServices: counts.length ? Math.round(serviceSum / counts.length) : 0,
      svcMin: counts.length ? Math.min(...counts) : 0,
      svcMax: counts.length ? Math.max(...counts) : 0,
    };
  }, [summary]);

  const toggleActive = (val: 'true' | 'false') => setActive((cur) => (cur === val ? '' : val));

  const hasFilters = Boolean(search || branchId || active);
  const shownCount = active === '' ? (data?.total ?? 0) : rows.length;
  const rowOffset = (pagination.page - 1) * pagination.pageSize;
  const colCount = 6;

  const clearFilters = () => {
    setSearch('');
    setBranchId('');
    setActive('');
  };

  return (
    <div className="space-y-6">
      <StickyPageHeader>
        <div>
          <h1
            className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]"
            data-testid="text-page-title"
          >
            {t('nav.staff')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('staff.subtitle')}</p>
        </div>
        <StaffTabs active="staff" />
      </StickyPageHeader>

      {/* Overview band — summary cards (click Active / On leave to filter) + branch split */}
      <div className="grid gap-4 pt-2 lg:grid-cols-3">
        {summaryLoading ? (
          <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:content-start">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[74px] w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:content-start">
            <StaffStatCard
              icon={Users}
              tone="primary"
              label={t('staff.total')}
              value={stats.total}
              hint={t('staff.acrossBranches', { count: stats.branchCount })}
              active={active === ''}
              onClick={() => setActive('')}
              index={0}
            />
            <StaffStatCard
              icon={UserCheck}
              tone="success"
              label={t('staff.active')}
              value={stats.active}
              hint={t('staff.pctOfAll', { pct: stats.pct(stats.active) })}
              active={active === 'true'}
              onClick={() => toggleActive('true')}
              index={1}
            />
            <StaffStatCard
              icon={UserX}
              tone="neutral"
              label={t('staff.inactive')}
              value={stats.inactive}
              hint={t('staff.pctOfAll', { pct: stats.pct(stats.inactive) })}
              active={active === 'false'}
              onClick={() => toggleActive('false')}
              index={2}
            />
            <StaffStatCard
              icon={Scissors}
              tone="info"
              label={t('staff.avgServices')}
              value={stats.avgServices}
              hint={t('staff.svcRange', { min: stats.svcMin, max: stats.svcMax })}
              index={3}
            />
          </div>
        )}

        <StaffByBranchCard />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out motion-reduce:animate-none">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-border px-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('staff.searchPlaceholder')}
                aria-label={t('staff.searchPlaceholder')}
                data-testid="input-search-staff"
                className="h-10 w-full rounded-lg border border-input bg-muted/40 pl-10 pr-3 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <Select
              className="h-10 w-44 rounded-lg"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              placeholder={t('branch.all')}
              aria-label={t('nav.branches')}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
            {active !== '' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {active === 'true' ? t('staff.active') : t('staff.inactive')}
                <button
                  type="button"
                  onClick={() => setActive('')}
                  aria-label={t('common.cancel')}
                  className="-mr-1 rounded-full p-0.5 hover:bg-primary/20"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ) : null}
            {data ? (
              <span className="ml-1 text-xs text-muted-foreground">
                · {t('staff.count', { count: shownCount })}
              </span>
            ) : null}
            {hasFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground animate-in fade-in slide-in-from-left-1 duration-200 motion-reduce:animate-none"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                {t('common.cancel')}
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="h-9 gap-2 rounded-lg"
              onClick={() => void refetch()}
              disabled={isFetching}
              title={t('common.reload')}
            >
              <RefreshCw
                className={cn('h-4 w-4 text-primary', isFetching && 'animate-spin')}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">{t('common.reload')}</span>
            </Button>
          </div>
        </div>

        {/* Table */}
        {isError ? (
          <div className="px-6 py-12 text-center text-sm">
            <p className="text-muted-foreground">{t('dashboard.loadError')}</p>
            <Button variant="secondary" className="mt-3" onClick={() => void refetch()}>
              {t('common.confirm')}
            </Button>
          </div>
        ) : (
          <Table containerClassName="w-full" className="min-w-[780px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 text-xs">#</TableHead>
                <TableHead>{t('staff.name')}</TableHead>
                <TableHead>{t('nav.branches')}</TableHead>
                <TableHead>{t('staff.phone')}</TableHead>
                <TableHead className="text-center">{t('staff.services')}</TableHead>
                <TableHead className="text-center">{t('staff.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, r) => (
                  <TableRow key={`sk-${r}`} className="even:bg-transparent hover:bg-transparent">
                    {Array.from({ length: colCount }).map((__, c) => (
                      <TableCell key={c}>
                        <div className="h-4 w-full max-w-[140px] animate-pulse rounded bg-muted" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={colCount} className="p-0">
                    <EmptyState title={t('staff.empty')} className="border-0" />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((s, i) => (
                  <StaffRow
                    key={s.id}
                    staff={s}
                    index={i}
                    number={rowOffset + i + 1}
                    onClick={() => navigate(ROUTES.staffDetail(s.id))}
                    activeLabel={t('staff.active')}
                    inactiveLabel={t('staff.inactive')}
                  />
                ))
              )}
            </TableBody>
          </Table>
        )}

        {!isError ? (
          <div className="border-t border-border px-3 py-4 sm:px-6">
            <Pagination
              page={pagination.page}
              pageSize={pagination.pageSize}
              total={data?.total ?? 0}
              onPageChange={pagination.setPage}
              onPageSizeChange={pagination.setPageSize}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

interface StaffRowProps {
  staff: StaffProfile;
  index: number;
  number: number;
  onClick: () => void;
  activeLabel: string;
  inactiveLabel: string;
}

function StaffRow({ staff: s, index, number, onClick, activeLabel, inactiveLabel }: StaffRowProps) {
  return (
    <TableRow
      onClick={onClick}
      className="cursor-pointer even:bg-transparent hover:bg-primary-subtle/40 animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      data-testid={`row-staff-${s.id}`}
    >
      <TableCell className="text-xs tabular-nums text-muted-foreground">{number}</TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <PersonAvatar name={s.name} size={36} />

          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-foreground">{s.name}</p>
            {s.jobTitle ? (
              <p className="truncate text-[11px] text-muted-foreground">{s.jobTitle}</p>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-sm text-foreground">{s.branchName}</TableCell>
      <TableCell className="tabular-nums text-sm text-muted-foreground">{s.phone}</TableCell>
      <TableCell className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-primary">
          <Scissors className="h-3 w-3" aria-hidden="true" />
          {s.serviceIds.length}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant={s.isActive ? 'success' : 'neutral'}>
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              s.isActive ? 'bg-success' : 'bg-muted-foreground',
            )}
            aria-hidden="true"
          />
          {s.isActive ? activeLabel : inactiveLabel}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
