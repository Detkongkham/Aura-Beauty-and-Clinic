import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  ClipboardList,
  Download,
  Fingerprint,
  Layers,
  RefreshCw,
  Scissors,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Store,
  UserCog,
  Users,
  UserSquare2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { EmptyState } from '@/components/shared/EmptyState';
import { Pagination } from '@/components/shared/Pagination';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsTabs } from '@/features/settings/SettingsTabs';
import { downloadCsv } from '@/features/reports/lib/csv';
import { useDebounce } from '@/hooks/useDebounce';
import { useDisclosure } from '@/hooks/useDisclosure';
import { usePagination } from '@/hooks/usePagination';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { http } from '@/services/http';

type Category =
  | 'appointment'
  | 'service'
  | 'staff'
  | 'timeoff'
  | 'walkin'
  | 'customer'
  | 'settings'
  | 'users'
  | 'branch'
  | 'auth';
type Severity = 'info' | 'warning' | 'critical';
type RangeKey = 'today' | 'd7' | 'd30' | 'all';

interface AuditChange {
  field: string;
  before: string;
  after: string;
}

interface AuditEntry {
  id: string;
  action: string;
  category: Category;
  severity: Severity;
  actorId: string;
  actor: string;
  actorRole: string;
  branchId: string;
  branchName: string;
  targetType: string;
  target: string;
  ip: string;
  device: string;
  at: string;
  changes: AuditChange[] | null;
}

interface AuditFacets {
  categories: Array<{ key: Category; count: number }>;
  actors: Array<{ id: string; name: string; count: number }>;
  totalAll: number;
  totalToday: number;
  totalCritical: number;
}

const CATEGORY_META: Record<Category, { icon: LucideIcon; variant: NonNullable<BadgeProps['variant']> }> = {
  appointment: { icon: CalendarClock, variant: 'primary' },
  service: { icon: Scissors, variant: 'accent' },
  staff: { icon: UserSquare2, variant: 'info' },
  timeoff: { icon: ClipboardList, variant: 'warning' },
  walkin: { icon: Store, variant: 'success' },
  customer: { icon: Users, variant: 'neutral' },
  settings: { icon: Settings, variant: 'neutral' },
  users: { icon: UserCog, variant: 'danger' },
  branch: { icon: Store, variant: 'info' },
  auth: { icon: ShieldAlert, variant: 'danger' },
};

const SEVERITY_VARIANT: Record<Severity, NonNullable<BadgeProps['variant']>> = {
  info: 'neutral',
  warning: 'warning',
  critical: 'danger',
};

const RANGE_TO_MS: Record<RangeKey, number | null> = {
  today: 24 * 3_600_000,
  d7: 7 * 24 * 3_600_000,
  d30: 30 * 24 * 3_600_000,
  all: null,
};

export function AuditLogPage() {
  const { t } = useTranslation();
  const pagination = usePagination();

  const [rawQuery, setRawQuery] = useState('');
  const query = useDebounce(rawQuery, 300);
  const [category, setCategory] = useState<'ALL' | Category>('ALL');
  const [actorId, setActorId] = useState<string>('');
  const [range, setRange] = useState<RangeKey>('d7');
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const detail = useDisclosure(false);
  const [exporting, setExporting] = useState(false);

  // Anchored once per range selection (not recomputed every render) so the
  // query key stays stable and doesn't refetch in a tight loop.
  const from = useMemo(() => {
    const rangeMs = RANGE_TO_MS[range];
    return rangeMs ? new Date(Date.now() - rangeMs).toISOString() : undefined;
  }, [range]);

  const hasActiveFilters = Boolean(query) || category !== 'ALL' || Boolean(actorId) || range !== 'd7';

  const params = {
    page: pagination.page,
    pageSize: pagination.pageSize,
    q: query || undefined,
    category: category !== 'ALL' ? category : undefined,
    actorId: actorId || undefined,
    from,
  };

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['audit-logs', params],
    queryFn: async () => {
      const res = await http.get<{
        data: { items: AuditEntry[]; total: number; facets: AuditFacets };
      }>('/audit-logs', { params });
      return res.data.data;
    },
  });

  const facets = data?.facets;

  const categoryOptions = useMemo(() => {
    const known = new Set<Category>(Object.keys(CATEGORY_META) as Category[]);
    return (facets?.categories ?? []).filter((c) => known.has(c.key));
  }, [facets]);

  const resetFilters = () => {
    setRawQuery('');
    setCategory('ALL');
    setActorId('');
    setRange('d7');
    pagination.setPage(1);
  };

  const openDetail = (entry: AuditEntry) => {
    setSelected(entry);
    detail.open();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await http.get<{ data: { items: AuditEntry[] } }>('/audit-logs', {
        params: { ...params, page: 1, pageSize: 5000 },
      });
      const rows = res.data.data.items;
      downloadCsv(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, [
        [t('audit.when'), t('audit.actor'), t('audit.action'), t('audit.target'), t('audit.branch'), 'IP'],
        ...rows.map((r) => [formatDateTime(r.at), r.actor, r.action, r.target, r.branchName, r.ip]),
      ]);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <StickyPageHeader>
        <div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
            {t('audit.title')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('audit.subtitle')}</p>
        </div>
        <SettingsTabs active="audit" />
      </StickyPageHeader>

      {/* Overview band */}
      <div className="grid gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Layers}
          tone="primary"
          label={t('audit.stats.total')}
          value={isLoading ? '–' : (facets?.totalAll ?? 0)}
          hint={t('audit.stats.totalHint')}
          index={0}
        />
        <StatTile
          icon={CalendarClock}
          tone="info"
          label={t('audit.stats.today')}
          value={isLoading ? '–' : (facets?.totalToday ?? 0)}
          hint={t('audit.stats.todayHint')}
          index={1}
        />
        <StatTile
          icon={Fingerprint}
          tone="success"
          label={t('audit.stats.actors')}
          value={isLoading ? '–' : (facets?.actors.length ?? 0)}
          hint={t('audit.stats.actorsHint')}
          index={2}
        />
        <StatTile
          icon={AlertTriangle}
          tone="danger"
          label={t('audit.stats.critical')}
          value={isLoading ? '–' : (facets?.totalCritical ?? 0)}
          hint={t('audit.stats.criticalHint')}
          index={3}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500 ease-out motion-reduce:animate-none">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-border px-3 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="text"
                value={rawQuery}
                onChange={(e) => {
                  setRawQuery(e.target.value);
                  pagination.setPage(1);
                }}
                placeholder={t('audit.searchPlaceholder')}
                aria-label={t('audit.searchPlaceholder')}
                className="h-10 w-full rounded-lg border border-input bg-muted/40 pl-10 pr-3 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Select
                value={actorId}
                onChange={(e) => {
                  setActorId(e.target.value);
                  pagination.setPage(1);
                }}
                className="h-9 min-w-[170px] text-sm"
                placeholder={t('audit.actorFilterAll')}
                options={(facets?.actors ?? []).map((a) => ({ value: a.id, label: `${a.name} (${a.count})` }))}
              />
              <Button
                variant="secondary"
                size="sm"
                className="h-9 gap-2 rounded-lg"
                onClick={() => void handleExport()}
                disabled={exporting}
                title={t('audit.export')}
              >
                <Download className="h-4 w-4 text-primary" aria-hidden="true" />
                <span className="hidden sm:inline">{t('audit.export')}</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-9 gap-2 rounded-lg"
                onClick={() => void refetch()}
                disabled={isFetching}
                title={t('audit.reload')}
              >
                <RefreshCw
                  className={cn('h-4 w-4 text-primary', isFetching && 'animate-spin')}
                  aria-hidden="true"
                />
                <span className="hidden sm:inline">{t('audit.reload')}</span>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* Category segmented filter */}
            <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-background p-1">
              <button
                type="button"
                onClick={() => {
                  setCategory('ALL');
                  pagination.setPage(1);
                }}
                aria-pressed={category === 'ALL'}
                className={cn(
                  'whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                  category === 'ALL'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {t('audit.all')}
              </button>
              {categoryOptions.map(({ key, count }) => {
                const meta = CATEGORY_META[key];
                const Icon = meta.icon;
                const isActive = category === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setCategory((c) => (c === key ? 'ALL' : key));
                      pagination.setPage(1);
                    }}
                    aria-pressed={isActive}
                    className={cn(
                      'flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                      isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {t(`audit.category.${key}`)}
                    <span
                      className={cn(
                        'rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                        isActive ? 'bg-primary-foreground/20' : 'bg-muted-foreground/10',
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Date range segmented filter */}
            <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1">
              {(['today', 'd7', 'd30', 'all'] as RangeKey[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    setRange(r);
                    pagination.setPage(1);
                  }}
                  aria-pressed={range === r}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-medium tabular-nums transition-colors',
                    range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {t(`audit.range.${r}`)}
                </button>
              ))}
            </div>

            {!isLoading && !isError ? (
              <span className="text-xs text-muted-foreground">{t('audit.count', { count: data?.total ?? 0 })}</span>
            ) : null}

            {hasActiveFilters ? (
              <Button variant="ghost" size="sm" className="ml-auto gap-1.5" onClick={resetFilters}>
                <X className="h-4 w-4" aria-hidden="true" />
                {t('audit.clearFilters')}
              </Button>
            ) : null}
          </div>
        </div>

        {isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive-soft text-destructive">
              <RefreshCw className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm text-muted-foreground">{t('audit.loadError')}</p>
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              {t('common.reload')}
            </Button>
          </div>
        ) : isLoading ? (
          <AuditSkeleton />
        ) : (data?.total ?? 0) === 0 && !hasActiveFilters ? (
          <EmptyState icon={ShieldCheck} title={t('audit.empty')} description={t('audit.emptyHint')} className="border-0" />
        ) : (data?.items.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <p className="text-sm text-muted-foreground">{t('audit.noMatch')}</p>
            <Button variant="secondary" size="sm" onClick={resetFilters}>
              {t('audit.clearFilters')}
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <Th className="text-left">{t('audit.when')}</Th>
                  <Th className="text-left">{t('audit.actor')}</Th>
                  <Th className="text-left">{t('audit.action')}</Th>
                  <Th className="text-left">{t('audit.target')}</Th>
                  <Th className="text-left">{t('audit.branch')}</Th>
                  <Th className="text-center">{t('services.status')}</Th>
                </tr>
              </thead>
              <tbody>
                {(data?.items ?? []).map((e, i) => {
                  const meta = CATEGORY_META[e.category];
                  const Icon = meta.icon;
                  return (
                    <tr
                      key={e.id}
                      onClick={() => openDetail(e)}
                      className="group cursor-pointer animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
                      style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
                    >
                      <td className="border-b border-border/60 px-3 py-3 align-middle text-[13px] text-muted-foreground transition-colors group-hover:bg-primary-subtle/15">
                        <DateTimeText value={e.at} mode="relative" />
                      </td>
                      <td className="border-b border-border/60 px-3 py-3 align-middle transition-colors group-hover:bg-primary-subtle/15">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-foreground">{e.actor}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{e.actorRole}</p>
                        </div>
                      </td>
                      <td className="border-b border-border/60 px-3 py-3 align-middle transition-colors group-hover:bg-primary-subtle/15">
                        <Badge variant={meta.variant} className="whitespace-nowrap">
                          <Icon className="h-3 w-3" aria-hidden="true" />
                          {t(`audit.category.${e.category}`)}
                        </Badge>
                      </td>
                      <td className="max-w-[220px] truncate border-b border-border/60 px-3 py-3 align-middle text-[13px] text-foreground/80 transition-colors group-hover:bg-primary-subtle/15">
                        {e.target}
                      </td>
                      <td className="border-b border-border/60 px-3 py-3 align-middle text-[13px] text-muted-foreground transition-colors group-hover:bg-primary-subtle/15">
                        {e.branchName}
                      </td>
                      <td className="border-b border-border/60 px-3 py-3 text-center align-middle transition-colors group-hover:bg-primary-subtle/15">
                        <Badge variant={SEVERITY_VARIANT[e.severity]}>{t(`audit.severity.${e.severity}`)}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isLoading && !isError && (data?.total ?? 0) > 0 ? (
        <Pagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={data?.total ?? 0}
          onPageChange={pagination.setPage}
          onPageSizeChange={pagination.setPageSize}
        />
      ) : null}

      <Sheet open={detail.isOpen} onOpenChange={detail.setIsOpen}>
        <SheetContent>
          {selected ? <AuditDetail entry={selected} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AuditDetail({ entry }: { entry: AuditEntry }) {
  const { t } = useTranslation();
  const meta = CATEGORY_META[entry.category];
  const Icon = meta.icon;

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <SheetTitle className="truncate">{entry.action}</SheetTitle>
            <p className="truncate text-xs text-muted-foreground">
              <DateTimeText value={entry.at} mode="datetime" />
            </p>
          </div>
        </div>
      </SheetHeader>
      <SheetBody className="space-y-5 py-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant={meta.variant}>
            <Icon className="h-3 w-3" aria-hidden="true" />
            {t(`audit.category.${entry.category}`)}
          </Badge>
          <Badge variant={SEVERITY_VARIANT[entry.severity]}>{t(`audit.severity.${entry.severity}`)}</Badge>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <DetailRow label={t('audit.detail.actor')} value={entry.actor} />
          <DetailRow label={t('audit.detail.role')} value={entry.actorRole} />
          <DetailRow label={t('audit.detail.branch')} value={entry.branchName} />
          <DetailRow label={t('audit.detail.target')} value={entry.target} />
          <DetailRow label={t('audit.detail.ip')} value={entry.ip} mono />
          <DetailRow label={t('audit.detail.device')} value={entry.device} />
        </dl>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('audit.detail.changes')}
          </p>
          {entry.changes && entry.changes.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/60 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">{t('audit.action')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('audit.detail.before')}</th>
                    <th className="px-3 py-2 text-left font-medium">{t('audit.detail.after')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.changes.map((c) => (
                    <tr key={c.field} className="border-t border-border/60">
                      <td className="px-3 py-2 font-medium text-foreground">{c.field}</td>
                      <td className="px-3 py-2 text-destructive/80 line-through decoration-destructive/40">
                        {c.before}
                      </td>
                      <td className="px-3 py-2 font-medium text-success">{c.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('audit.detail.noChanges')}</p>
          )}
        </div>

        <details className="group rounded-lg border border-border">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('audit.detail.raw')}
          </summary>
          <pre className="overflow-x-auto border-t border-border bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-foreground/80">
            {JSON.stringify(entry, null, 2)}
          </pre>
        </details>
      </SheetBody>
    </>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('truncate font-medium text-foreground', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}

function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
  index,
}: {
  icon: LucideIcon;
  tone: 'primary' | 'info' | 'success' | 'danger';
  label: string;
  value: ReactNode;
  hint: string;
  index: number;
}) {
  const toneClass: Record<typeof tone, string> = {
    primary: 'bg-primary/10 text-primary',
    info: 'bg-info-soft text-info',
    success: 'bg-success-soft text-success',
    danger: 'bg-destructive-soft text-destructive',
  };
  return (
    <div
      className="rounded-2xl border border-border bg-card p-4 shadow-sm animate-in fade-in zoom-in-95 slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <div className="flex items-center gap-3">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', toneClass[tone])}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function Th({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <th
      scope="col"
      className={cn(
        'sticky top-0 z-10 border-b border-border bg-muted px-3 py-3 text-[13px] font-semibold text-muted-foreground',
        className,
      )}
    >
      {children}
    </th>
  );
}

function AuditSkeleton() {
  return (
    <div className="divide-y divide-border/60">
      {Array.from({ length: 6 }).map((_, r) => (
        <div key={r} className="flex items-center gap-3 px-3 py-3.5 sm:px-6">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-28" />
          <div className="ml-auto flex items-center gap-3">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}
