import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  ArrowRight,
  Copy,
  Pencil,
  Percent,
  Plus,
  Radio,
  Store,
  Tag,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PricingRuleView } from '@abcp/shared-types';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { CurrencyText, DataTable, FilterBar, StatusPill } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { useServices } from '@/features/services/services.api';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { PricingRuleDialog, type RuleDraft } from './PricingRuleDialog';
import { PricingStatCard } from './PricingStatCard';
import { PricingWeekGrid } from './PricingWeekGrid';
import {
  MINUTES_PER_DAY,
  conflictIdSet,
  conflictPairs,
  isLiveNow,
  nowContext,
  previewPrice,
  ruleEffect,
  toMinutes,
} from './pricingRules';
import {
  useCreatePricingRule,
  useDeletePricingRule,
  usePricingRules,
  useUpdatePricingRule,
} from './pricing.api';

type EffectFilter = '' | 'discount' | 'surge';
type StatusFilter = '' | 'true' | 'false';

/** ຄວາມຖີ່ໃນການປັບ "ດຽວນີ້" — ໄຟສົດຂອງກົດທີ່ກຳລັງໃຊ້ຢູ່ຕ້ອງບໍ່ຄ້າງ. */
const NOW_TICK_MS = 30_000;

export function PricingPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('finance:manage');
  const { data: branches = [] } = useBranches();
  const { data: servicesPage } = useServices({ page: 1, pageSize: 200 });
  const services = useMemo(() => servicesPage?.items ?? [], [servicesPage]);

  const [branchId, setBranchId] = useState('');
  const [q, setQ] = useState('');
  const [day, setDay] = useState('');
  const [effectFilter, setEffectFilter] = useState<EffectFilter>('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [liveOnly, setLiveOnly] = useState(false);
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [editing, setEditing] = useState<PricingRuleView | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PricingRuleView | null>(null);

  // ດຶງທຸກກົດຂອງສາຂາທີ່ເລືອກ (ບໍ່ກັ່ນຕອງສະຖານະຢູ່ server) ເພື່ອໃຫ້ຕົວເລກສະຫຼຸບ
  // ແລະ ຕາຕະລາງອາທິດເຫັນພາບເຕັມ — ການກັ່ນຕອງທີ່ເຫຼືອເຮັດຢູ່ client.
  const { data: rules = [], isLoading } = usePricingRules({ branchId: branchId || undefined });

  const createM = useCreatePricingRule();
  const updateM = useUpdatePricingRule();
  const deleteM = useDeletePricingRule();

  const [now, setNow] = useState(() => nowContext());
  useEffect(() => {
    const id = setInterval(() => setNow(nowContext()), NOW_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const servicePrice = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of services) map.set(s.id, s.price);
    return map;
  }, [services]);

  const conflicts = useMemo(() => conflictPairs(rules), [rules]);
  const conflicted = useMemo(() => conflictIdSet(rules), [rules]);
  const liveRules = useMemo(() => rules.filter((r) => isLiveNow(r, now)), [rules, now]);

  const stats = useMemo(() => {
    const active = rules.filter((r) => r.isActive);
    const effects = active.map((r) => ruleEffect(r));
    const discounts = effects.filter((e) => e.kind === 'discount');
    const surges = effects.filter((e) => e.kind === 'surge');
    return {
      total: rules.length,
      active: active.length,
      paused: rules.length - active.length,
      deepest: discounts.length ? Math.max(...discounts.map((e) => e.netPercent)) : 0,
      avgDiscount: discounts.length
        ? Math.round((discounts.reduce((s, e) => s + e.netPercent, 0) / discounts.length) * 10) / 10
        : 0,
      surgeCount: surges.length,
      peakSurge: surges.length ? Math.max(...surges.map((e) => Math.abs(e.netPercent))) : 0,
    };
  }, [rules]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rules.filter((r) => {
      if (needle) {
        const haystack = `${r.ruleName} ${r.branchName} ${r.serviceName ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (day !== '' && r.dayOfWeek !== Number(day)) return false;
      if (status === 'true' && !r.isActive) return false;
      if (status === 'false' && r.isActive) return false;
      if (effectFilter && ruleEffect(r).kind !== effectFilter) return false;
      if (liveOnly && !isLiveNow(r, now)) return false;
      if (conflictsOnly && !conflicted.has(r.id)) return false;
      return true;
    });
  }, [rules, q, day, status, effectFilter, liveOnly, conflictsOnly, conflicted, now]);

  const hasActiveFilters = Boolean(q || branchId || day || status || effectFilter || liveOnly || conflictsOnly);
  const clearFilters = () => {
    setQ('');
    setBranchId('');
    setDay('');
    setStatus('');
    setEffectFilter('');
    setLiveOnly(false);
    setConflictsOnly(false);
  };

  const onMutationError = (err: unknown) =>
    toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));

  const duplicate = (r: PricingRuleView) => {
    createM.mutate(
      {
        branchId: r.branchId,
        serviceId: r.serviceId,
        ruleName: t('pricing.copyName', { name: r.ruleName }),
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        discountPercent: r.discountPercent,
        priceMultiplier: r.priceMultiplier,
        isActive: false,
      },
      { onSuccess: () => toast.success(t('pricing.duplicated')), onError: onMutationError },
    );
  };

  const columns = useMemo<ColumnDef<PricingRuleView, unknown>[]>(
    () => [
      {
        header: t('pricing.col.rule'),
        accessorKey: 'ruleName',
        cell: ({ row }) => {
          const r = row.original;
          const live = isLiveNow(r, now);
          return (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium" title={r.ruleName}>
                  {r.ruleName}
                </span>
                {live ? (
                  <Badge variant="success" className="gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-success motion-safe:animate-pulse" aria-hidden="true" />
                    {t('pricing.liveTag')}
                  </Badge>
                ) : null}
                {!r.isActive ? (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground">
                    {t('pricing.pausedTag')}
                  </span>
                ) : null}
                {conflicted.has(r.id) && r.isActive ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex" aria-label={t('pricing.conflictTag')}>
                        <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{t('pricing.conflictTag')}</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Store className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  {r.branchName}
                  {r.serviceName ? ` · ${r.serviceName}` : ` · ${t('pricing.allServices')}`}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        header: t('pricing.col.when'),
        id: 'when',
        accessorFn: (r) => r.dayOfWeek * MINUTES_PER_DAY + toMinutes(r.startTime),
        cell: ({ row }) => {
          const r = row.original;
          const start = toMinutes(r.startTime);
          const end = toMinutes(r.endTime);
          const kind = ruleEffect(r).kind;
          return (
            <div className="space-y-1">
              <span className="flex items-center gap-1.5 text-sm">
                <Badge variant="neutral">{t(`pricing.dowShort.${r.dayOfWeek}`)}</Badge>
                <span className="tabular-nums">
                  {r.startTime}–{r.endTime}
                </span>
                <span className="text-2xs tabular-nums text-muted-foreground">
                  {t('pricing.hoursShort', { hours: ((end - start) / 60).toFixed(1) })}
                </span>
              </span>
              {/* ຕຳແໜ່ງຂອງຊ່ວງພາຍໃນ 24 ຊົ່ວໂມງ — ອ່ານຮູບແບບເວລາໄດ້ໄວກວ່າຕົວເລກ */}
              <span
                className="relative block h-1 w-28 overflow-hidden rounded-full bg-muted"
                aria-hidden="true"
              >
                <span
                  className={cn(
                    'absolute inset-y-0 rounded-full',
                    !r.isActive
                      ? 'bg-muted-foreground/40'
                      : kind === 'surge'
                        ? 'bg-warning'
                        : kind === 'discount'
                          ? 'bg-success'
                          : 'bg-muted-foreground/60',
                  )}
                  style={{
                    left: `${(start / MINUTES_PER_DAY) * 100}%`,
                    width: `${Math.max(3, ((end - start) / MINUTES_PER_DAY) * 100)}%`,
                  }}
                />
              </span>
            </div>
          );
        },
      },
      {
        header: t('pricing.col.effect'),
        id: 'effect',
        accessorFn: (r) => ruleEffect(r).netPercent,
        cell: ({ row }) => {
          const r = row.original;
          const e = ruleEffect(r);
          return (
            <div className="flex flex-wrap items-center gap-1">
              <Badge variant={e.kind === 'discount' ? 'success' : e.kind === 'surge' ? 'warning' : 'neutral'}>
                {e.kind === 'flat'
                  ? t('pricing.effect.none')
                  : `${e.netPercent > 0 ? '−' : '+'}${Math.abs(e.netPercent)}%`}
              </Badge>
              {r.discountPercent > 0 && r.priceMultiplier !== 1 ? (
                <span className="text-2xs tabular-nums text-muted-foreground">
                  −{r.discountPercent}% · ×{r.priceMultiplier}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        header: t('pricing.col.preview'),
        id: 'preview',
        meta: { align: 'right' },
        cell: ({ row }) => {
          const r = row.original;
          const base = r.serviceId ? servicePrice.get(r.serviceId) : undefined;
          if (base == null) {
            return (
              <span className="text-xs text-muted-foreground" title={t('pricing.previewAllServices')}>
                –
              </span>
            );
          }
          const p = previewPrice(base, r);
          return (
            <span className="inline-flex items-center justify-end gap-1.5 tabular-nums">
              <span className="text-xs text-muted-foreground line-through">
                <CurrencyText amount={p.base} />
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              <span className="font-medium">
                <CurrencyText amount={p.final} />
              </span>
            </span>
          );
        },
      },
      {
        header: t('pricing.col.active'),
        id: 'active',
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Switch
                checked={r.isActive}
                disabled={!canManage || updateM.isPending}
                onCheckedChange={(v) => {
                  updateM.mutate(
                    { id: r.id, input: { isActive: v } },
                    {
                      onSuccess: () => toast.success(v ? t('pricing.resumed') : t('pricing.paused')),
                      onError: onMutationError,
                    },
                  );
                }}
                aria-label={`${t('pricing.col.active')} — ${r.ruleName}`}
              />
              <StatusPill
                status={r.isActive ? 'on' : 'off'}
                variant={r.isActive ? 'success' : 'neutral'}
                label={r.isActive ? t('pricing.filterActive') : t('pricing.pausedTag')}
                className="hidden lg:inline-flex"
              />
            </div>
          );
        },
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) => {
          if (!canManage) return null;
          const r = row.original;
          return (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setEditing(r)}
                    aria-label={`${t('common.edit')} — ${r.ruleName}`}
                  >
                    <Pencil className="h-3 w-3" aria-hidden="true" />
                    {t('common.edit')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('common.edit')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 px-0"
                    disabled={createM.isPending}
                    onClick={() => duplicate(r)}
                    aria-label={`${t('pricing.duplicate')} — ${r.ruleName}`}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('pricing.duplicate')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 px-0"
                    onClick={() => setDeleting(r)}
                    aria-label={`${t('common.delete')} — ${r.ruleName}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t('common.delete')}</TooltipContent>
              </Tooltip>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, canManage, updateM, createM.isPending, conflicted, now, servicePrice],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        <StickyPageHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
                {t('nav.pricing')}
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{t('pricing.subtitle')}</p>
            </div>
            {canManage ? (
              <Button onClick={() => setCreating(true)}>
                <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('pricing.newRule')}
              </Button>
            ) : null}
          </div>
        </StickyPageHeader>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[62px] w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <PricingStatCard
              index={0}
              icon={Tag}
              tone="primary"
              label={t('pricing.stat.rules')}
              value={stats.total}
              hint={t('pricing.stat.rulesHint', { active: stats.active, paused: stats.paused })}
            />
            <PricingStatCard
              index={1}
              icon={Radio}
              tone="success"
              label={t('pricing.stat.live')}
              value={liveRules.length}
              hint={t('pricing.stat.liveHint')}
              onClick={() => setLiveOnly((v) => !v)}
              active={liveOnly}
              pulse={liveRules.length > 0}
            />
            <PricingStatCard
              index={2}
              icon={Percent}
              tone="primary"
              label={t('pricing.stat.deepest')}
              value={stats.deepest > 0 ? `−${stats.deepest}%` : '—'}
              hint={t('pricing.stat.deepestHint', { avg: stats.avgDiscount })}
              onClick={() => setEffectFilter((v) => (v === 'discount' ? '' : 'discount'))}
              active={effectFilter === 'discount'}
            />
            <PricingStatCard
              index={3}
              icon={TrendingUp}
              tone="warning"
              label={t('pricing.stat.surge')}
              value={stats.surgeCount}
              hint={
                stats.peakSurge > 0
                  ? t('pricing.stat.surgeHint', { peak: stats.peakSurge })
                  : t('pricing.stat.surgeNone')
              }
              onClick={() => setEffectFilter((v) => (v === 'surge' ? '' : 'surge'))}
              active={effectFilter === 'surge'}
            />
          </div>
        )}

        <PricingWeekGrid
          rules={rules}
          now={now}
          conflictIds={conflicted}
          loading={isLoading}
          onSelect={canManage ? (r) => setEditing(r) : undefined}
        />

        {conflicts.length > 0 ? (
          <div
            className={cn(
              'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning-soft/60 px-4 py-3 shadow-sm',
              'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
            )}
            role="status"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium text-foreground">
                  {t('pricing.conflictTitle', { count: conflicts.length })}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {t('pricing.conflictHint', {
                    rule: conflicts[0]?.winner.ruleName ?? '',
                  })}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConflictsOnly((v) => !v)}
              aria-pressed={conflictsOnly}
            >
              {conflictsOnly ? t('pricing.conflictShowAll') : t('pricing.conflictReview')}
            </Button>
          </div>
        ) : null}

        <FilterBar
          search={q}
          onSearchChange={setQ}
          searchPlaceholder={t('pricing.searchPlaceholder')}
          hasActiveFilters={hasActiveFilters}
          onClear={clearFilters}
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
            className="h-9 w-[150px]"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            options={[
              { value: '', label: t('pricing.allDays') },
              ...[0, 1, 2, 3, 4, 5, 6].map((d) => ({ value: String(d), label: t(`pricing.dow.${d}`) })),
            ]}
            aria-label={t('pricing.field.day')}
          />
          <Select
            className="h-9 w-[150px]"
            value={effectFilter}
            onChange={(e) => setEffectFilter(e.target.value as EffectFilter)}
            options={[
              { value: '', label: t('pricing.allEffects') },
              { value: 'discount', label: t('pricing.grid.legendDiscount') },
              { value: 'surge', label: t('pricing.grid.legendSurge') },
            ]}
            aria-label={t('pricing.col.effect')}
          />
          <Select
            className="h-9 w-[150px]"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            options={[
              { value: '', label: t('pricing.filterAll') },
              { value: 'true', label: t('pricing.filterActive') },
              { value: 'false', label: t('pricing.filterInactive') },
            ]}
            aria-label={t('pricing.col.active')}
          />
        </FilterBar>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Percent className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-sm font-semibold">{t('pricing.tableTitle')}</h2>
              <span className="text-xs text-muted-foreground">
                {t('pricing.showing', { shown: filtered.length, total: rules.length })}
              </span>
            </div>
            {liveOnly || conflictsOnly ? (
              <Badge variant={conflictsOnly ? 'warning' : 'success'}>
                {conflictsOnly ? t('pricing.conflictTag') : t('pricing.liveTag')}
              </Badge>
            ) : null}
          </div>
          <div className="p-2 sm:p-3">
            <DataTable
              columns={columns}
              data={filtered}
              loading={isLoading}
              getRowId={(r) => r.id}
              onRowClick={canManage ? (r) => setEditing(r) : undefined}
              emptyTitle={hasActiveFilters ? t('pricing.emptyFiltered') : t('pricing.empty')}
              emptyDescription={hasActiveFilters ? undefined : t('pricing.emptyHint')}
              emptyAction={
                canManage && !hasActiveFilters ? (
                  <Button size="sm" onClick={() => setCreating(true)}>
                    <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                    {t('pricing.newRule')}
                  </Button>
                ) : hasActiveFilters ? (
                  <Button size="sm" variant="secondary" onClick={clearFilters}>
                    {t('pricing.clearFilters')}
                  </Button>
                ) : null
              }
            />
          </div>
        </div>

        <PricingRuleDialog
          open={creating || Boolean(editing)}
          rule={editing}
          branches={branches}
          services={services}
          existingRules={rules}
          pending={createM.isPending || updateM.isPending}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSubmit={(draft: RuleDraft) => {
            const base = {
              ruleName: draft.ruleName.trim(),
              startTime: draft.startTime,
              endTime: draft.endTime,
              serviceId: draft.serviceId || null,
              discountPercent: Number(draft.discountPercent) || 0,
              priceMultiplier: Number(draft.priceMultiplier) || 1,
              isActive: draft.isActive,
            };
            const close = () => {
              setCreating(false);
              setEditing(null);
            };

            if (editing) {
              updateM.mutate(
                { id: editing.id, input: { ...base, dayOfWeek: draft.days[0] ?? editing.dayOfWeek } },
                {
                  onSuccess: () => {
                    toast.success(t('common.saved'));
                    close();
                  },
                  onError: onMutationError,
                },
              );
              return;
            }

            // ສ້າງໃໝ່: 1 ກົດຕໍ່ 1 ວັນທີ່ເລືອກ.
            let done = 0;
            let failed = 0;
            draft.days.forEach((dayOfWeek) => {
              createM.mutate(
                { branchId: draft.branchId, dayOfWeek, ...base },
                {
                  onSuccess: () => {
                    done += 1;
                    if (done + failed === draft.days.length) {
                      toast.success(t('pricing.createdCount', { count: done }));
                      close();
                    }
                  },
                  onError: (err) => {
                    failed += 1;
                    onMutationError(err);
                    if (done + failed === draft.days.length && done > 0) {
                      toast.success(t('pricing.createdCount', { count: done }));
                      close();
                    }
                  },
                },
              );
            });
          }}
        />

        <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t('pricing.deleteTitle')}</DialogTitle>
              <DialogDescription>{t('pricing.deleteHint')}</DialogDescription>
            </DialogHeader>
            {deleting ? (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                <p className="text-sm font-medium">{deleting.ruleName}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {t(`pricing.dow.${deleting.dayOfWeek}`)} · {deleting.startTime}–{deleting.endTime}
                </p>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deleteM.isPending}
                onClick={() => {
                  if (!deleting) return;
                  deleteM.mutate(deleting.id, {
                    onSuccess: () => {
                      toast.success(t('common.deleted'));
                      setDeleting(null);
                    },
                    onError: onMutationError,
                  });
                }}
              >
                {t('common.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
