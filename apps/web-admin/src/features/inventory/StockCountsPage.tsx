import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Hourglass,
  Play,
  Printer,
  Plus,
  Save,
  Search,
  Send,
  Store,
  XCircle,
} from 'lucide-react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type {
  StockCountLineView,
  StockCountStatusValue,
  StockCountTypeValue,
  StockCountView,
} from '@abcp/shared-types';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { CurrencyText, DataTable, DateTimeText, FilterBar, Pagination, StatusPill } from '@/components/shared';
import { DateField } from '@/components/shared/DateField';
import type { BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { useConfirm } from '@/hooks/useConfirm';
import { NormalizedApiError } from '@/services/apiError';

import { InventoryExportButton } from './InventoryExportButton';
import { InventoryStatCard } from './InventoryStatCard';
import { InventoryTabs } from './InventoryTabs';
import { ScanInput } from './ScanInput';
import {
  useAdjustSettings,
  useCreateStockCount,
  useProducts,
  useSaveStockCountLines,
  useStockCount,
  useStockCountAction,
  useStockCounts,
  type StockCountAction,
} from './inventory.api';

const STATUS_VARIANT: Record<StockCountStatusValue, NonNullable<BadgeProps['variant']>> = {
  DRAFT: 'neutral',
  COUNTING: 'info',
  PENDING_APPROVAL: 'warning',
  POSTED: 'success',
  CANCELLED: 'neutral',
};
const STATUSES: StockCountStatusValue[] = ['DRAFT', 'COUNTING', 'PENDING_APPROVAL', 'POSTED', 'CANCELLED'];
const TYPES: StockCountTypeValue[] = ['FULL', 'CYCLE', 'SPOT'];

const errMsg = (err: unknown, fallback: string) => (err instanceof NormalizedApiError ? err.message : fallback);

function VarianceText({ value, money }: { value: number | null; money?: boolean }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const cls = cn('tabular-nums font-medium', value < 0 ? 'text-destructive' : value > 0 ? 'text-success' : 'text-muted-foreground');
  if (money) return <CurrencyText amount={value} className={cls} />;
  return (
    <span className={cls}>
      {value > 0 ? '+' : value < 0 ? '−' : ''}
      {Math.abs(value).toLocaleString()}
    </span>
  );
}

/** H3 — Inventory ▸ Stock count: list + create + count sheet (enter counts, submit, approve/reject/cancel, print). */
export function StockCountsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: branches } = useBranches();

  const [status, setStatus] = useState<StockCountStatusValue | ''>('');
  const [type, setType] = useState<StockCountTypeValue | ''>('');
  const [branchId, setBranchId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const scope = { branchId: branchId || undefined };
  const { data, isLoading } = useStockCounts({
    ...scope,
    status: status || undefined,
    type: type || undefined,
    page,
    pageSize,
  });
  const counting = useStockCounts({ ...scope, status: 'COUNTING', page: 1, pageSize: 1 });
  const pending = useStockCounts({ ...scope, status: 'PENDING_APPROVAL', page: 1, pageSize: 1 });
  const posted = useStockCounts({ ...scope, status: 'POSTED', page: 1, pageSize: 1 });

  const columns = useMemo<ColumnDef<StockCountView, unknown>[]>(
    () => [
      {
        header: t('inventory.count.number'),
        accessorKey: 'countNumber',
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.countNumber}</span>,
      },
      {
        header: t('inventory.col.branch'),
        accessorKey: 'branchName',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <Store className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {row.original.branchName}
          </span>
        ),
      },
      {
        header: t('inventory.count.type'),
        accessorKey: 'type',
        cell: ({ getValue }) => t(`inventory.count.typeName.${getValue() as StockCountTypeValue}`),
      },
      {
        header: t('inventory.count.status'),
        accessorKey: 'status',
        cell: ({ getValue }) => {
          const v = getValue() as StockCountStatusValue;
          return <StatusPill status={v} variant={STATUS_VARIANT[v]} label={t(`inventory.count.st.${v}`)} />;
        },
      },
      {
        header: t('inventory.count.progress'),
        id: 'progress',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">
            {row.original.countedLineCount}/{row.original.lineCount}
          </span>
        ),
      },
      {
        header: t('inventory.count.netValue'),
        accessorKey: 'netVarianceValue',
        meta: { align: 'right' },
        cell: ({ getValue }) => <VarianceText value={getValue() as number} money />,
      },
      {
        header: t('inventory.count.absValue'),
        accessorKey: 'absVarianceValue',
        meta: { align: 'right' },
        cell: ({ getValue }) => <CurrencyText amount={getValue() as number} className="text-muted-foreground" />,
      },
      {
        header: t('inventory.transfer.createdAt'),
        accessorKey: 'createdAt',
        cell: ({ getValue }) => <DateTimeText value={getValue() as string} />,
      },
    ],
    [t],
  );

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">{t('nav.inventory')}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('inventory.count.subtitle')}</p>
          </div>
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('inventory.count.new')}
          </Button>
        </div>
        <InventoryTabs active="counts" />
      </StickyPageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <InventoryStatCard index={0} icon={ClipboardList} tone="primary" label={t('inventory.count.stat.total')} value={data?.total ?? '—'} />
        <InventoryStatCard
          index={1}
          icon={ClipboardCheck}
          tone="neutral"
          label={t('inventory.count.st.COUNTING')}
          value={counting.data?.total ?? '—'}
          onClick={() => {
            setStatus((s) => (s === 'COUNTING' ? '' : 'COUNTING'));
            setPage(1);
          }}
          active={status === 'COUNTING'}
        />
        <InventoryStatCard
          index={2}
          icon={Hourglass}
          tone="warning"
          label={t('inventory.count.st.PENDING_APPROVAL')}
          value={pending.data?.total ?? '—'}
          onClick={() => {
            setStatus((s) => (s === 'PENDING_APPROVAL' ? '' : 'PENDING_APPROVAL'));
            setPage(1);
          }}
          active={status === 'PENDING_APPROVAL'}
        />
        <InventoryStatCard index={3} icon={CheckCircle2} tone="success" label={t('inventory.count.st.POSTED')} value={posted.data?.total ?? '—'} />
      </div>

      <FilterBar
        hasActiveFilters={Boolean(status) || Boolean(type) || Boolean(branchId)}
        onClear={() => {
          setStatus('');
          setType('');
          setBranchId('');
          setPage(1);
        }}
      >
        <Select
          className="h-9 w-[180px]"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as StockCountStatusValue | '');
            setPage(1);
          }}
          options={[
            { value: '', label: t('inventory.transfer.allStatus') },
            ...STATUSES.map((x) => ({ value: x, label: t(`inventory.count.st.${x}`) })),
          ]}
          aria-label={t('inventory.count.status')}
        />
        <Select
          className="h-9 w-[160px]"
          value={type}
          onChange={(e) => {
            setType(e.target.value as StockCountTypeValue | '');
            setPage(1);
          }}
          options={[
            { value: '', label: t('inventory.count.allTypes') },
            ...TYPES.map((x) => ({ value: x, label: t(`inventory.count.typeName.${x}`) })),
          ]}
          aria-label={t('inventory.count.type')}
        />
        {!user?.branchId ? (
          <Select
            className="h-9 w-[170px]"
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setPage(1);
            }}
            options={[
              { value: '', label: t('inventory.allBranches') },
              ...(branches ?? []).map((b) => ({ value: b.id, label: b.name })),
            ]}
            aria-label={t('inventory.col.branch')}
          />
        ) : null}
      </FilterBar>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <ClipboardCheck className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{t('inventory.tab.counts')}</h2>
            <span className="text-xs text-muted-foreground">
              {t('inventory.showing', { shown: data?.items.length ?? 0, total: data?.total ?? 0 })}
            </span>
          </div>
          <InventoryExportButton<StockCountView>
            base="/stock-counts"
            params={{ branchId: branchId || undefined, status: status || undefined, type: type || undefined }}
            filename="stock-counts"
            columns={[
              { header: t('inventory.count.number'), value: (c) => c.countNumber },
              { header: t('inventory.col.branch'), value: (c) => c.branchName },
              { header: t('inventory.count.type'), value: (c) => t(`inventory.count.typeName.${c.type}`) },
              { header: t('inventory.count.status'), value: (c) => t(`inventory.count.st.${c.status}`) },
              { header: t('inventory.count.lines'), value: (c) => c.lineCount },
              { header: t('inventory.count.countedLines'), value: (c) => c.countedLineCount },
              { header: t('inventory.count.netValue'), value: (c) => c.netVarianceValue },
              { header: t('inventory.count.absValue'), value: (c) => c.absVarianceValue },
              { header: t('inventory.transfer.createdAt'), value: (c) => c.createdAt },
              { header: t('inventory.count.startedAt'), value: (c) => c.startedAt ?? '' },
              { header: t('inventory.count.postedAt'), value: (c) => c.postedAt ?? '' },
              { header: t('inventory.count.countedBy'), value: (c) => c.countedByUserName ?? '' },
              { header: t('inventory.count.approvedBy'), value: (c) => c.approvedByUserName ?? '' },
            ]}
          />
        </div>
        <div className="p-2 sm:p-3">
          <DataTable
            columns={columns}
            data={data?.items ?? []}
            loading={isLoading}
            getRowId={(r) => r.id}
            onRowClick={(r) => setDetailId(r.id)}
            emptyTitle={t('inventory.count.empty')}
          />
        </div>
        <div className="border-t border-border px-4 py-3">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data?.total ?? 0}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        </div>
      </div>

      <CreateCountDialog
        open={creating}
        branches={(branches ?? []).map((b) => ({ id: b.id, name: b.name }))}
        defaultBranchId={user?.branchId ?? ''}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          setDetailId(id);
        }}
      />
      <CountSheetDialog id={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ create

function CreateCountDialog({
  open,
  branches,
  defaultBranchId,
  onClose,
  onCreated,
}: {
  open: boolean;
  branches: Array<{ id: string; name: string }>;
  defaultBranchId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateStockCount();
  const [branchId, setBranchId] = useState(defaultBranchId);
  const [type, setType] = useState<StockCountTypeValue>('CYCLE');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [scheduled, setScheduled] = useState('');
  const [notes, setNotes] = useState('');
  const effectiveBranch = branchId || branches[0]?.id || '';
  const { data: products } = useProducts({ branchId: effectiveBranch || undefined, isActive: 'true', page: 1, pageSize: 2000 });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = products?.items ?? [];
    return q ? all.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) : all;
  }, [products, search]);

  function reset() {
    setPicked(new Set());
    setSearch('');
    setScheduled('');
    setNotes('');
    setType('CYCLE');
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function submit() {
    if (!effectiveBranch) return;
    if (type !== 'FULL' && picked.size === 0) {
      toast.error(t('inventory.count.pickProducts'));
      return;
    }
    create.mutate(
      {
        branchId: effectiveBranch,
        type,
        ...(type !== 'FULL' ? { productIds: [...picked] } : {}),
        // DateField gives a Vientiane calendar day — anchor it at local midnight.
        scheduledAt: scheduled ? `${scheduled}T00:00:00+07:00` : null,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (c) => {
          toast.success(t('inventory.count.created', { number: c.countNumber }));
          reset();
          onCreated(c.id);
        },
        onError: (err) => toast.error(errMsg(err, t('common.saveError'))),
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-start gap-4 border-b border-border bg-gradient-to-br from-primary/[0.06] to-transparent px-7 py-5 pr-14">
          <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <div className="space-y-1">
            <DialogTitle className="text-xl">{t('inventory.count.new')}</DialogTitle>
            <DialogDescription className="text-[13px]">{t('inventory.count.formSubtitle')}</DialogDescription>
          </div>
        </DialogHeader>
        <div className="flex max-h-[calc(100vh-9rem)] flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-7 py-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sc-branch">{t('inventory.col.branch')}</Label>
                <Select
                  id="sc-branch"
                  className="h-10"
                  value={effectiveBranch}
                  disabled={Boolean(defaultBranchId)}
                  onChange={(e) => {
                    setBranchId(e.target.value);
                    setPicked(new Set());
                  }}
                  options={branches.map((b) => ({ value: b.id, label: b.name }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="block">{t('inventory.count.scheduledAt')}</Label>
                <DateField
                  value={scheduled}
                  onChange={setScheduled}
                  onClear={() => setScheduled('')}
                  clearLabel={t('inventory.ledger.clearDate')}
                  aria-label={t('inventory.count.scheduledAt')}
                  placeholder={t('inventory.count.scheduledAt')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t('inventory.count.type')}</Label>
              <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t('inventory.count.type')}>
                {TYPES.map((x) => (
                  <button
                    key={x}
                    type="button"
                    role="radio"
                    aria-checked={type === x}
                    onClick={() => setType(x)}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-left transition-colors',
                      type === x ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-muted/50',
                    )}
                  >
                    <span className="block text-sm font-medium">{t(`inventory.count.typeName.${x}`)}</span>
                    <span className="block text-xs text-muted-foreground">{t(`inventory.count.typeHint.${x}`)}</span>
                  </button>
                ))}
              </div>
            </div>

            {type === 'FULL' ? (
              <p className="rounded-xl border border-border bg-muted/30 px-3.5 py-2.5 text-sm text-muted-foreground">
                {t('inventory.count.fullHint', { count: products?.items.length ?? 0 })}
              </p>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>{t('inventory.count.products')}</Label>
                  <span className="text-xs text-muted-foreground">{t('inventory.count.pickedCount', { count: picked.size })}</span>
                </div>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    className="h-9 pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('inventory.transfer.searchProduct')}
                    aria-label={t('inventory.transfer.searchProduct')}
                  />
                </div>
                <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                  {visible.length === 0 ? (
                    <li className="px-3 py-4 text-center text-xs text-muted-foreground">{t('inventory.transfer.noProductMatch')}</li>
                  ) : (
                    visible.map((p) => (
                      <li key={p.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
                          <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{p.name}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">{p.sku}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                            {p.stockQty.toLocaleString()} {p.unit}
                          </span>
                        </label>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="sc-notes">{t('inventory.transfer.notes')}</Label>
              <Input id="sc-notes" className="h-10" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-card px-7 py-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={submit} disabled={create.isPending}>
              {create.isPending ? t('common.saving') : t('inventory.count.create')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ count sheet

function CountSheetDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { role } = useAuth();
  const confirm = useConfirm();
  const { data: c, isLoading } = useStockCount(id);
  const { data: settings } = useAdjustSettings();
  const save = useSaveStockCountLines();
  const action = useStockCountAction();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reasonFor, setReasonFor] = useState<'reject' | 'cancel' | null>(null);

  useEffect(() => setDraft({}), [id]);

  const lines = c?.lines ?? [];
  const editable = c?.status === 'COUNTING';
  const dirty = Object.keys(draft).filter((k) => {
    const l = lines.find((x) => x.id === k);
    const v = draft[k]!.trim();
    return l && (v === '' ? l.countedQty != null : Number(v) !== l.countedQty);
  });
  const threshold = settings?.approvalThresholdLak ?? Infinity;
  const canApprove = c?.status === 'PENDING_APPROVAL' && (role === 'SUPER_ADMIN' || c.absVarianceValue <= threshold);

  /** Live preview while typing: counted − expected (server recomputes on save). */
  function preview(l: StockCountLineView): { counted: number | null; variance: number | null; value: number | null } {
    const raw = draft[l.id];
    const counted = raw === undefined ? l.countedQty : raw.trim() === '' ? null : Number(raw);
    if (counted == null || Number.isNaN(counted) || l.expectedQty == null) return { counted, variance: null, value: null };
    const variance = Math.round((counted - l.expectedQty) * 1000) / 1000;
    return { counted, variance, value: Math.round(variance * l.unitCost * 100) / 100 };
  }

  async function saveDraft(): Promise<boolean> {
    if (!c || dirty.length === 0) return true;
    const payload = dirty.map((lineId) => {
      const v = draft[lineId]!.trim();
      return { lineId, countedQty: v === '' ? null : Number(v) };
    });
    if (payload.some((p) => p.countedQty != null && (Number.isNaN(p.countedQty) || p.countedQty < 0))) {
      toast.error(t('inventory.count.invalidQty'));
      return false;
    }
    try {
      await save.mutateAsync({ id: c.id, input: { lines: payload } });
      setDraft({});
      return true;
    } catch (err) {
      toast.error(errMsg(err, t('common.saveError')));
      return false;
    }
  }

  function run(a: StockCountAction, reason?: string, okKey?: string) {
    if (!c) return;
    action.mutate(
      { id: c.id, action: a, reason },
      {
        onSuccess: () => {
          toast.success(t(okKey ?? `inventory.count.done.${a}`));
          setReasonFor(null);
        },
        onError: (err) => toast.error(errMsg(err, t('common.saveError'))),
      },
    );
  }

  return (
    <Dialog open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-start gap-4 border-b border-border bg-gradient-to-br from-primary/[0.06] to-transparent px-7 py-5 pr-14">
          <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <DialogTitle className="text-xl tabular-nums">{c?.countNumber ?? t('inventory.count.sheet')}</DialogTitle>
            <DialogDescription className="text-[13px]">
              {c ? `${c.branchName} · ${t(`inventory.count.typeName.${c.type}`)}` : t('common.loading')}
            </DialogDescription>
          </div>
        </DialogHeader>

        {isLoading || !c ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="max-h-[calc(100vh-13rem)] space-y-4 overflow-y-auto px-7 py-5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusPill status={c.status} variant={STATUS_VARIANT[c.status]} label={t(`inventory.count.st.${c.status}`)} />
              <Chip label={t('inventory.count.progress')}>
                {c.countedLineCount}/{c.lineCount}
              </Chip>
              {c.startedAt ? (
                <Chip label={t('inventory.count.startedAt')}>
                  <DateTimeText value={c.startedAt} />
                </Chip>
              ) : null}
              {c.postedAt ? (
                <Chip label={t('inventory.count.postedAt')}>
                  <DateTimeText value={c.postedAt} />
                </Chip>
              ) : null}
              {c.countedByUserName ? <Chip label={t('inventory.count.countedBy')}>{c.countedByUserName}</Chip> : null}
              {c.approvedByUserName ? <Chip label={t('inventory.count.approvedBy')}>{c.approvedByUserName}</Chip> : null}
              <Chip label={t('inventory.count.netValue')}>
                <VarianceText value={c.netVarianceValue} money />
              </Chip>
            </div>

            {c.status === 'DRAFT' ? (
              <Banner tone="info">{t('inventory.count.draftHint')}</Banner>
            ) : null}
            {c.movementsDuringCount > 0 && c.status !== 'POSTED' && c.status !== 'CANCELLED' ? (
              <Banner tone="warning">{t('inventory.count.movedWarning', { count: c.movementsDuringCount })}</Banner>
            ) : null}
            {c.rejectReason && c.status === 'COUNTING' ? (
              <Banner tone="danger">{t('inventory.count.rejectedBanner', { reason: c.rejectReason })}</Banner>
            ) : null}
            {c.status === 'PENDING_APPROVAL' && !canApprove ? (
              <Banner tone="warning">{t('inventory.count.needsSuperAdmin')}</Banner>
            ) : null}
            {c.cancelReason && c.status === 'CANCELLED' ? <Banner tone="neutral">{c.cancelReason}</Banner> : null}
            {c.notes ? <p className="text-sm text-muted-foreground">{c.notes}</p> : null}

            {editable ? (
              /* M2 — ສະແກນ barcode/GTIN → ໄປທີ່ແຖວຂອງສິນຄ້າ (ແຖວທີ່ຍັງບໍ່ນັບກ່ອນ) ແລ້ວ focus ຊ່ອງຈຳນວນ */
              <ScanInput
                className="max-w-xs"
                branchId={c.branchId}
                accept={(r) =>
                  lines.some((l) => l.productId === r.product.id) ? true : t('inventory.scan.notInDocument', { name: r.product.name })
                }
                onFound={(r) => {
                  const mine = lines.filter((l) => l.productId === r.product.id);
                  const target = mine.find((l) => (draft[l.id] ?? '') === '' && l.countedQty == null) ?? mine[0];
                  const el = target ? (document.getElementById(`sc-count-${target.id}`) as HTMLInputElement | null) : null;
                  el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                  el?.focus();
                  el?.select();
                }}
              />
            ) : null}

            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">{t('inventory.col.product')}</th>
                    <th className="p-3">{t('inventory.lot.title')}</th>
                    <th className="p-3 text-right">{t('inventory.count.system')}</th>
                    <th className="p-3 text-right">{t('inventory.count.moved')}</th>
                    <th className="p-3 text-right">{t('inventory.count.expected')}</th>
                    <th className="p-3 text-right">{t('inventory.count.counted')}</th>
                    <th className="p-3 text-right">{t('inventory.count.variance')}</th>
                    <th className="p-3 text-right">{t('inventory.count.varianceValue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const pv = preview(l);
                    return (
                      <tr key={l.id} className="border-t border-border">
                        <td className="p-3">
                          <p className="font-medium">{l.productName}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">{l.sku}</p>
                        </td>
                        <td className="p-3 text-xs">
                          {l.lotNumber ? (
                            <>
                              <span className="font-mono">{l.lotNumber}</span>
                              <span className="block text-muted-foreground">{l.expiryDate ?? '—'}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">{c.status === 'DRAFT' ? '—' : t('inventory.count.unlotted')}</span>
                          )}
                        </td>
                        <td className="p-3 text-right tabular-nums">{l.systemQty?.toLocaleString() ?? '—'}</td>
                        <td className="p-3 text-right">
                          {l.movedSinceStart ? <VarianceText value={l.movedSinceStart} /> : <span className="text-muted-foreground">0</span>}
                        </td>
                        <td className="p-3 text-right tabular-nums">{l.expectedQty?.toLocaleString() ?? '—'}</td>
                        <td className="p-3 text-right">
                          {editable ? (
                            <Input
                              id={`sc-count-${l.id}`}
                              type="number"
                              min="0"
                              step="0.001"
                              inputMode="decimal"
                              className="ml-auto h-8 w-24 text-right tabular-nums"
                              value={draft[l.id] ?? (l.countedQty != null ? String(l.countedQty) : '')}
                              onChange={(e) => setDraft((d) => ({ ...d, [l.id]: e.target.value }))}
                              aria-label={t('inventory.count.countedFor', { product: l.productName })}
                            />
                          ) : (
                            <span className="tabular-nums">{l.countedQty?.toLocaleString() ?? '—'}</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <VarianceText value={pv.variance} />
                        </td>
                        <td className="p-3 text-right">
                          <VarianceText value={pv.value} money />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {c ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-card px-7 py-4">
            <Button variant="ghost" onClick={() => printCountSheet(c, t)}>
              <Printer className="mr-1 h-4 w-4" />
              {t('inventory.count.print')}
            </Button>
            <div className="flex flex-wrap justify-end gap-2">
              {c.status !== 'POSTED' && c.status !== 'CANCELLED' ? (
                <Button variant="ghost" onClick={() => setReasonFor('cancel')} disabled={action.isPending}>
                  <Ban className="mr-1 h-4 w-4" />
                  {t('inventory.count.cancel')}
                </Button>
              ) : null}
              {c.status === 'DRAFT' ? (
                <Button onClick={() => run('start')} disabled={action.isPending}>
                  <Play className="mr-1 h-4 w-4" />
                  {t('inventory.count.start')}
                </Button>
              ) : null}
              {editable ? (
                <>
                  <Button variant="secondary" onClick={() => void saveDraft().then((ok) => ok && dirty.length > 0 && toast.success(t('common.saved')))} disabled={save.isPending || dirty.length === 0}>
                    <Save className="mr-1 h-4 w-4" />
                    {t('inventory.count.save')}
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!(await saveDraft())) return;
                      if (!(await confirm({ title: t('inventory.count.submitConfirm'), description: t('inventory.count.submitConfirmHint') }))) return;
                      run('submit');
                    }}
                    disabled={action.isPending || save.isPending}
                  >
                    <Send className="mr-1 h-4 w-4" />
                    {t('inventory.count.submit')}
                  </Button>
                </>
              ) : null}
              {c.status === 'PENDING_APPROVAL' ? (
                <>
                  <Button variant="secondary" onClick={() => setReasonFor('reject')} disabled={action.isPending}>
                    <XCircle className="mr-1 h-4 w-4" />
                    {t('inventory.count.reject')}
                  </Button>
                  <Button
                    disabled={!canApprove || action.isPending}
                    onClick={async () => {
                      if (!(await confirm({ title: t('inventory.count.approveConfirm'), description: t('inventory.count.approveConfirmHint') }))) return;
                      run('approve');
                    }}
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    {t('inventory.count.approve')}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        <ReasonDialog
          open={reasonFor != null}
          title={reasonFor === 'reject' ? t('inventory.count.rejectTitle') : t('inventory.count.cancelTitle')}
          required={reasonFor === 'reject'}
          busy={action.isPending}
          onClose={() => setReasonFor(null)}
          onSubmit={(reason) => run(reasonFor!, reason || undefined)}
        />
      </DialogContent>
    </Dialog>
  );
}

function Chip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
      {label}: <span className="font-medium text-foreground">{children}</span>
    </span>
  );
}

function Banner({ tone, children }: { tone: 'info' | 'warning' | 'danger' | 'neutral'; children: ReactNode }) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm',
        tone === 'warning' && 'border-warning/40 bg-warning-soft/60 text-foreground',
        tone === 'danger' && 'border-destructive/40 bg-destructive/5 text-foreground',
        tone === 'info' && 'border-info/30 bg-info/5 text-foreground',
        tone === 'neutral' && 'border-border bg-muted/30 text-muted-foreground',
      )}
    >
      {tone === 'warning' || tone === 'danger' ? (
        <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', tone === 'danger' ? 'text-destructive' : 'text-warning')} aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </p>
  );
}

function ReasonDialog({
  open,
  title,
  required,
  busy,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  required: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason('');
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="sc-reason">{t('inventory.count.reason')}</Label>
          <Input id="sc-reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={busy || (required && !reason.trim())} onClick={() => onSubmit(reason.trim())}>
            {t('common.confirm')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ print

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

/**
 * Printable count sheet — blind while counting (no system qty, so counters don't anchor on it);
 * once submitted/posted it prints the counted qty and variance for sign-off.
 */
function printCountSheet(c: StockCountView, t: TFunction) {
  const blind = c.status === 'DRAFT' || c.status === 'COUNTING';
  const rows = (c.lines ?? [])
    .map(
      (l, i) => `<tr>
        <td>${i + 1}</td><td>${esc(l.productName)}<div class="muted">${esc(l.sku)}</div></td>
        <td>${esc(l.lotNumber ?? '')}<div class="muted">${esc(l.expiryDate ?? '')}</div></td>
        <td>${esc(l.unit)}</td>
        ${blind ? '<td class="box"></td><td class="box"></td>' : `<td class="num">${esc(l.expectedQty ?? '')}</td><td class="num">${esc(l.countedQty ?? '')}</td><td class="num">${esc(l.variance ?? '')}</td>`}
      </tr>`,
    )
    .join('');
  const head = blind
    ? `<th>${esc(t('inventory.count.counted'))}</th><th>${esc(t('inventory.ledger.note'))}</th>`
    : `<th>${esc(t('inventory.count.expected'))}</th><th>${esc(t('inventory.count.counted'))}</th><th>${esc(t('inventory.count.variance'))}</th>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.countNumber)}</title>
    <style>
      body{font-family:"Noto Sans Lao","Phetsarath OT",system-ui,sans-serif;font-size:12px;margin:24px;color:#111}
      h1{font-size:18px;margin:0 0 4px} .muted{color:#666;font-size:11px}
      table{width:100%;border-collapse:collapse;margin-top:12px} th,td{border:1px solid #999;padding:6px;text-align:left;vertical-align:top}
      th{background:#f2f2f2} .num{text-align:right} .box{width:90px}
      .sign{display:flex;gap:48px;margin-top:36px} .sign div{flex:1;border-top:1px solid #333;padding-top:4px}
    </style></head><body>
    <h1>${esc(t('inventory.count.sheet'))} ${esc(c.countNumber)}</h1>
    <div class="muted">${esc(c.branchName)} · ${esc(t(`inventory.count.typeName.${c.type}`))} · ${esc(t(`inventory.count.st.${c.status}`))}${c.startedAt ? ` · ${esc(new Date(c.startedAt).toLocaleString())}` : ''}</div>
    <table><thead><tr><th>#</th><th>${esc(t('inventory.col.product'))}</th><th>${esc(t('inventory.lot.title'))}</th><th>${esc(t('inventory.col.unit'))}</th>${head}</tr></thead>
    <tbody>${rows}</tbody></table>
    <div class="sign"><div>${esc(t('inventory.count.countedBy'))}</div><div>${esc(t('inventory.count.approvedBy'))}</div></div>
    <script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open('', '_blank', 'noopener=no,width=900,height=700');
  if (!w) {
    toast.error(t('inventory.count.popupBlocked'));
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
