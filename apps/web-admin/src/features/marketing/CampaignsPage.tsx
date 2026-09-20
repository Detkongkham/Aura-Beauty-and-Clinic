import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  CheckCircle2,
  Download,
  Megaphone,
  Pencil,
  Play,
  Plus,
  Send,
  SendHorizontal,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { CampaignType, CampaignView } from '@abcp/shared-types';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { ConfirmDialog, DataTable, DateTimeText, FilterBar, Pagination } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { ReferralStatCard } from '@/features/referrals/ReferralStatCard';
import { downloadCsv } from '@/features/reports/lib/csv';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';
import { useUiStore } from '@/store/ui.store';

import { CampaignDetailSheet } from './CampaignDetailSheet';
import { CampaignFormDialog } from './CampaignFormDialog';
import {
  CAMPAIGN_TYPES,
  TYPE_META,
  audienceRule,
  campaignTotals,
  conversionRate,
  formatRate,
  rateTone,
  typeBreakdown,
} from './campaigns.lib';
import { ConversionFunnelCard } from './ConversionFunnelCard';
import { useCampaigns, useDeleteCampaign, useRunCampaign, useUpdateCampaign } from './marketing.api';
import { TopCampaignsCard } from './TopCampaignsCard';

/**
 * Campaigns held in memory for the overview layer. The list endpoint only filters by
 * branch + type, so search / status / sorting and every summary figure (tiles, funnel,
 * leaderboard) are derived from one fetch and paginated client-side — the same
 * trade-off the Referrals page makes. Clinics run a handful of campaigns, not hundreds.
 */
const CAMPAIGN_LIMIT = 200;

type SortKey = 'converted' | 'rate' | 'reached' | 'updated' | 'newest' | 'name';
type StatusFilter = 'all' | 'active' | 'paused';

const RATE_PILL: Record<ReturnType<typeof rateTone>, string> = {
  success: 'bg-success-soft text-success',
  primary: 'bg-primary/10 text-primary',
  warning: 'bg-warning-soft text-warning',
  neutral: 'bg-muted text-muted-foreground',
};

export function CampaignsPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('marketing:manage');
  const { data: branches = [] } = useBranches();
  const activeBranch = useUiStore((s) => s.activeBranchId);

  const [branchId, setBranchId] = useState<string | 'all'>(activeBranch);
  const [type, setType] = useState<CampaignType | 'all'>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [neverSentOnly, setNeverSentOnly] = useState(false);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('converted');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignView | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [running, setRunning] = useState<CampaignView | null>(null);
  const [deleting, setDeleting] = useState<CampaignView | null>(null);

  const { data, isLoading } = useCampaigns({ branchId, page: 1, pageSize: CAMPAIGN_LIMIT });
  const all = useMemo(() => data?.items ?? [], [data]);
  const runM = useRunCampaign();
  const delM = useDeleteCampaign();
  const updateM = useUpdateCampaign();

  // Type chips count against everything else that's filtered, so each chip shows what clicking it yields.
  const beforeType = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((c) => {
      if (status === 'active' && !c.isActive) return false;
      if (status === 'paused' && c.isActive) return false;
      if (neverSentOnly && c.recipientCount > 0) return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        (c.discountCode ?? '').toLowerCase().includes(needle) ||
        (c.message?.title ?? '').toLowerCase().includes(needle)
      );
    });
  }, [all, q, status, neverSentOnly]);

  const filtered = useMemo(() => {
    const rows = type === 'all' ? beforeType : beforeType.filter((c) => c.type === type);
    const rateOf = (c: CampaignView) => conversionRate(c.recipientCount, c.convertedCount) ?? -1;
    const sorters: Record<SortKey, (a: CampaignView, b: CampaignView) => number> = {
      converted: (a, b) => b.convertedCount - a.convertedCount || b.recipientCount - a.recipientCount,
      rate: (a, b) => rateOf(b) - rateOf(a),
      reached: (a, b) => b.recipientCount - a.recipientCount,
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...rows].sort(sorters[sort]);
  }, [beforeType, type, sort]);

  const totals = useMemo(() => campaignTotals(filtered), [filtered]);
  const bestType = useMemo(
    () =>
      typeBreakdown(filtered)
        .filter((r) => r.rate !== null && r.converted > 0)
        .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0))[0],
    [filtered],
  );
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: beforeType.length };
    for (const c of beforeType) counts[c.type] = (counts[c.type] ?? 0) + 1;
    return counts;
  }, [beforeType]);
  const maxReached = filtered.reduce((m, c) => Math.max(m, c.recipientCount), 0);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const detail = detailId ? (all.find((c) => c.id === detailId) ?? null) : null;
  const hasActiveFilters =
    Boolean(q) || type !== 'all' || status !== 'all' || neverSentOnly || sort !== 'converted';

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(c: CampaignView) {
    setEditing(c);
    setFormOpen(true);
  }

  function confirmRun() {
    if (!running) return;
    runM.mutate(running.id, {
      onSuccess: (r) => {
        toast.success(t('campaigns.ran', { sent: r.sent, matched: r.matched }), {
          description:
            r.skippedAlreadySent > 0 ? t('campaigns.skipped', { count: r.skippedAlreadySent }) : undefined,
        });
        setRunning(null);
      },
      onError: (err) =>
        toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
    });
  }

  function toggleActive(c: CampaignView, next: boolean) {
    updateM.mutate(
      { id: c.id, input: { isActive: next } },
      {
        onSuccess: () => toast.success(next ? t('campaigns.resumed') : t('campaigns.paused')),
        onError: (err) =>
          toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
      },
    );
  }

  function exportCsv() {
    downloadCsv(`campaigns-${formatDate(new Date()).replace(/\//g, '-')}`, [
      [
        t('campaigns.col.campaign'),
        t('campaigns.typeLabel'),
        t('campaigns.branch'),
        t('campaigns.col.audience'),
        t('campaigns.discountCode'),
        t('campaigns.col.status'),
        t('campaigns.col.reached'),
        t('campaigns.col.converted'),
        t('campaigns.col.rate'),
        t('campaigns.col.updated'),
      ],
      ...filtered.map((c) => {
        const rule = audienceRule(c);
        return [
          c.name,
          t(`campaigns.type.${c.type}`),
          c.branchName,
          t(rule.key, rule.params),
          c.discountCode ?? '',
          c.isActive ? t('campaigns.status.active') : t('campaigns.inactiveTag'),
          c.recipientCount,
          c.convertedCount,
          formatRate(conversionRate(c.recipientCount, c.convertedCount)),
          formatDate(c.updatedAt),
        ];
      }),
    ]);
  }

  const columns = useMemo<ColumnDef<CampaignView, unknown>[]>(
    () => [
      {
        header: t('campaigns.col.campaign'),
        accessorKey: 'name',
        cell: ({ row }) => {
          const c = row.original;
          const meta = TYPE_META[c.type];
          const Icon = meta.icon;
          return (
            <div className="flex min-w-0 max-w-[320px] items-center gap-2.5">
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta.chip)}>
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{c.name}</span>
                  {c.discountCode ? (
                    <code className="shrink-0 rounded border border-dashed border-primary/40 bg-primary/5 px-1 font-mono text-2xs font-semibold text-primary">
                      {c.discountCode}
                    </code>
                  ) : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {c.message?.title ?? t('campaigns.detail.noMessage')}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        header: t('campaigns.col.audience'),
        id: 'audience',
        cell: ({ row }) => {
          const c = row.original;
          const rule = audienceRule(c);
          return (
            <div className="min-w-0">
              <div className="text-xs font-medium">{t(`campaigns.type.${c.type}`)}</div>
              <div className="truncate text-2xs text-muted-foreground">
                {t(rule.key, rule.params)} · {c.branchName}
              </div>
            </div>
          );
        },
      },
      {
        header: t('campaigns.col.status'),
        accessorKey: 'isActive',
        cell: ({ row }) => {
          const c = row.original;
          if (!canManage) {
            return (
              <Badge variant={c.isActive ? 'success' : 'neutral'}>
                {c.isActive ? t('campaigns.status.active') : t('campaigns.inactiveTag')}
              </Badge>
            );
          }
          return (
            <label
              className="inline-flex cursor-pointer items-center gap-2"
              onClick={(e) => e.stopPropagation()}
            >
              <Switch
                checked={c.isActive}
                disabled={updateM.isPending && updateM.variables?.id === c.id}
                onCheckedChange={(v) => toggleActive(c, v)}
                aria-label={t('campaigns.toggleAria', { name: c.name })}
              />
              <span className={cn('text-xs', c.isActive ? 'text-success' : 'text-muted-foreground')}>
                {c.isActive ? t('campaigns.status.active') : t('campaigns.inactiveTag')}
              </span>
            </label>
          );
        },
      },
      {
        header: t('campaigns.col.reached'),
        accessorKey: 'recipientCount',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const n = row.original.recipientCount;
          const ratio = maxReached > 0 ? n / maxReached : 0;
          if (n === 0) {
            return <span className="text-xs text-warning">{t('campaigns.neverSent')}</span>;
          }
          return (
            <div className="inline-flex w-full flex-col items-end gap-1">
              <span className="tabular-nums">{n.toLocaleString()}</span>
              <span className="h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span
                  className="block h-full rounded-full bg-info transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.round(ratio * 100)}%` }}
                />
              </span>
            </div>
          );
        },
      },
      {
        header: t('campaigns.col.converted'),
        accessorKey: 'convertedCount',
        meta: { align: 'right' },
        cell: ({ getValue }) => {
          const n = getValue() as number;
          return (
            <span className={cn('tabular-nums', n > 0 ? 'font-semibold text-success' : 'text-muted-foreground')}>
              {n.toLocaleString()}
            </span>
          );
        },
      },
      {
        header: t('campaigns.col.rate'),
        id: 'rate',
        accessorFn: (c) => conversionRate(c.recipientCount, c.convertedCount) ?? -1,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const rate = conversionRate(row.original.recipientCount, row.original.convertedCount);
          return (
            <span
              className={cn(
                'inline-flex min-w-[48px] justify-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
                RATE_PILL[rateTone(rate)],
              )}
            >
              {formatRate(rate)}
            </span>
          );
        },
      },
      {
        header: t('campaigns.col.updated'),
        accessorKey: 'updatedAt',
        cell: ({ getValue }) => (
          <DateTimeText value={getValue() as string} className="text-xs text-muted-foreground" />
        ),
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) => {
          if (!canManage) return null;
          const c = row.original;
          return (
            <div className="flex justify-end gap-1">
              <Button
                variant="secondary"
                size="sm"
                className="h-7 gap-1 border-primary/25 bg-primary/5 px-2 text-xs text-primary hover:border-primary/40 hover:bg-primary/10"
                onClick={(e) => {
                  e.stopPropagation();
                  setRunning(c);
                }}
              >
                <Play className="h-3 w-3" aria-hidden="true" />
                {t('campaigns.run')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit(c);
                }}
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
                {t('common.edit')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-destructive hover:bg-destructive-soft"
                aria-label={t('campaigns.deleteAria', { name: c.name })}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleting(c);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage, maxReached, updateM.isPending, updateM.variables],
  );

  const runRule = running ? audienceRule(running) : null;

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
              {t('campaigns.title')}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('campaigns.subtitle')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Select
              className="hidden h-9 w-[160px] sm:block"
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setPage(1);
              }}
              options={[
                { value: 'all', label: t('branch.all') },
                ...branches.map((b) => ({ value: b.id, label: b.name })),
              ]}
              aria-label={t('campaigns.branch')}
            />
            <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('common.export')}
            </Button>
            {canManage ? (
              <Button onClick={openNew}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('campaigns.new')}
              </Button>
            ) : null}
          </div>
        </div>
      </StickyPageHeader>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[62px] w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <ReferralStatCard
            index={0}
            icon={Megaphone}
            tone="primary"
            label={t('campaigns.stat.campaigns')}
            value={totals.campaigns}
            hint={t('campaigns.stat.campaignsHint', { active: totals.active, paused: totals.paused })}
          />
          <ReferralStatCard
            index={1}
            icon={Send}
            tone="info"
            label={t('campaigns.stat.reached')}
            value={totals.reached}
            hint={t('campaigns.stat.reachedHint')}
          />
          <ReferralStatCard
            index={2}
            icon={CheckCircle2}
            tone="success"
            label={t('campaigns.stat.converted')}
            value={totals.converted}
            hint={t('campaigns.stat.convertedHint')}
          />
          <ReferralStatCard
            index={3}
            icon={TrendingUp}
            tone="accent"
            label={t('campaigns.stat.rate')}
            value={formatRate(totals.rate)}
            hint={
              bestType
                ? t('campaigns.stat.bestType', { type: t(`campaigns.type.${bestType.type}`) })
                : t('campaigns.stat.rateHint')
            }
          />
          <ReferralStatCard
            index={4}
            icon={SendHorizontal}
            tone="warning"
            label={t('campaigns.stat.neverSent')}
            value={totals.neverSent}
            hint={t('campaigns.stat.neverSentHint')}
            onClick={() => {
              setNeverSentOnly((v) => !v);
              setPage(1);
            }}
            active={neverSentOnly}
          />
        </div>
      )}

      <div className="grid items-stretch gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ConversionFunnelCard
            loading={isLoading}
            campaigns={filtered}
            onShowNeverSent={() => {
              setNeverSentOnly(true);
              setStatus('active');
              setPage(1);
            }}
          />
        </div>
        <TopCampaignsCard
          loading={isLoading}
          campaigns={filtered}
          onSelect={(c) => setDetailId(c.id)}
        />
      </div>

      <FilterBar
        search={q}
        onSearchChange={resetPage(setQ)}
        searchPlaceholder={t('campaigns.searchPlaceholder')}
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setQ('');
          setType('all');
          setStatus('all');
          setNeverSentOnly(false);
          setSort('converted');
          setPage(1);
        }}
      >
        <Select
          className="h-9 w-[150px] sm:hidden"
          value={branchId}
          onChange={(e) => resetPage(setBranchId)(e.target.value)}
          options={[
            { value: 'all', label: t('branch.all') },
            ...branches.map((b) => ({ value: b.id, label: b.name })),
          ]}
          aria-label={t('campaigns.branch')}
        />
        <Select
          className="h-9 w-[140px]"
          value={status}
          onChange={(e) => resetPage(setStatus)(e.target.value as StatusFilter)}
          options={[
            { value: 'all', label: t('campaigns.status.all') },
            { value: 'active', label: t('campaigns.status.active') },
            { value: 'paused', label: t('campaigns.inactiveTag') },
          ]}
          aria-label={t('campaigns.col.status')}
        />
        <Select
          className="h-9 w-[190px]"
          value={sort}
          onChange={(e) => resetPage(setSort)(e.target.value as SortKey)}
          options={(['converted', 'rate', 'reached', 'updated', 'newest', 'name'] as const).map((k) => ({
            value: k,
            label: t(`campaigns.sort.${k}`),
          }))}
          aria-label={t('campaigns.sort.label')}
        />
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-sm border border-input px-3 text-sm">
          <input
            type="checkbox"
            checked={neverSentOnly}
            onChange={(e) => resetPage(setNeverSentOnly)(e.target.checked)}
          />
          {t('campaigns.filter.neverSentOnly')}
        </label>
      </FilterBar>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Megaphone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{t('campaigns.tableTitle')}</h2>
            <span className="text-xs text-muted-foreground">
              {t('campaigns.showing', { shown: pageRows.length, total: filtered.length })}
            </span>
          </div>

          <div role="tablist" aria-label={t('campaigns.typeLabel')} className="flex flex-wrap gap-1.5">
            {(['all', ...CAMPAIGN_TYPES] as const).map((key) => {
              const selected = type === key;
              const Icon = key === 'all' ? null : TYPE_META[key].icon;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => resetPage(setType)(key)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors duration-150',
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {Icon ? <Icon className="h-3 w-3" aria-hidden="true" /> : null}
                  {key === 'all' ? t('campaigns.allTypes') : t(`campaigns.type.${key}`)}
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-2xs tabular-nums',
                      selected ? 'bg-primary-foreground/20' : 'bg-muted',
                    )}
                  >
                    {typeCounts[key] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="p-2 sm:p-3">
          <DataTable
            columns={columns}
            data={pageRows}
            loading={isLoading}
            getRowId={(r) => r.id}
            onRowClick={(r) => setDetailId(r.id)}
            emptyTitle={all.length === 0 ? t('campaigns.empty') : t('campaigns.noMatch')}
            emptyDescription={all.length === 0 ? t('campaigns.emptyHint') : t('campaigns.noMatchHint')}
            emptyAction={
              canManage && all.length === 0 ? (
                <Button size="sm" onClick={openNew}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                  {t('campaigns.new')}
                </Button>
              ) : undefined
            }
          />
        </div>
        <div className="border-t border-border px-4 py-3">
          <Pagination
            page={safePage}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </div>
      </div>

      <CampaignFormDialog
        open={formOpen}
        editing={editing}
        defaultBranchId={branchId}
        onClose={() => setFormOpen(false)}
      />

      <CampaignDetailSheet
        campaign={detail}
        canManage={canManage}
        onClose={() => setDetailId(null)}
        onRun={(c) => setRunning(c)}
        onEdit={(c) => openEdit(c)}
      />

      <ConfirmDialog
        open={Boolean(running)}
        onCancel={() => setRunning(null)}
        title={t('campaigns.runTitle', { name: running?.name ?? '' })}
        description={
          running && runRule
            ? t('campaigns.runDescription', {
                audience: t(runRule.key, runRule.params),
                branch: running.branchName,
              })
            : ''
        }
        confirmLabel={t('campaigns.run')}
        busy={runM.isPending}
        onConfirm={confirmRun}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onCancel={() => setDeleting(null)}
        title={t('campaigns.deleteTitle')}
        description={
          deleting
            ? t('campaigns.deleteDescription', { name: deleting.name, count: deleting.recipientCount })
            : ''
        }
        confirmLabel={t('common.delete')}
        destructive
        busy={delM.isPending}
        onConfirm={() => {
          if (!deleting) return;
          delM.mutate(deleting.id, {
            onSuccess: () => {
              toast.success(t('campaigns.deleted'));
              if (detailId === deleting.id) setDetailId(null);
              setDeleting(null);
            },
            onError: () => toast.error(t('common.saveError')),
          });
        }}
      />
    </div>
  );
}
