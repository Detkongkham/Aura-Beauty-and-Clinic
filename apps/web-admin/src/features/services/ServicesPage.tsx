import {
  AlertTriangle,
  FolderOpen,
  ImageOff,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { CurrencyText } from '@/components/shared/CurrencyText';
import { EmptyState } from '@/components/shared/EmptyState';
import { Pagination } from '@/components/shared/Pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { toast } from '@/components/ui/sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuth } from '@/features/auth/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { useDebounce } from '@/hooks/useDebounce';
import { usePagination } from '@/hooks/usePagination';
import { cn } from '@/lib/utils';
import type { Service } from '@/types/models';

import { ServiceFormDialog } from './ServiceFormDialog';
import { ServicesStats } from './ServicesStats';
import { ServicesTabs } from './ServicesTabs';
import { useDeleteService, useServiceCategories, useServices } from './services.api';

export function ServicesPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('services:manage');

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [active, setActive] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const pagination = usePagination();

  const { data: categories = [] } = useServiceCategories();
  const { data, isLoading, isError, refetch, isFetching } = useServices({
    q: debouncedSearch || undefined,
    categoryId: categoryId || undefined,
    isActive: active === '' ? undefined : (active as 'true' | 'false'),
    page: pagination.page,
    pageSize: pagination.pageSize,
  });

  const confirm = useConfirm();
  const del = useDeleteService();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (svc: Service) => {
    setEditing(svc);
    setFormOpen(true);
  };
  const onDelete = async (svc: Service) => {
    const okToDelete = await confirm({
      title: t('services.deleteTitle'),
      description: t('services.deleteBody', { name: svc.name }),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!okToDelete) return;
    del.mutate(svc.id, {
      onSuccess: () => toast.success(t('services.deleted')),
      onError: () => toast.error(t('services.saveError')),
    });
  };

  const rows = data?.items ?? [];
  const hasFilters = Boolean(search || categoryId || active);
  const colCount = canManage ? 8 : 7;
  const rowOffset = (pagination.page - 1) * pagination.pageSize;

  const clearFilters = () => {
    setSearch('');
    setCategoryId('');
    setActive('');
  };

  return (
    <div className="space-y-5">
      <StickyPageHeader>
        <div>
          <h1
            className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]"
            data-testid="text-page-title"
          >
            {t('nav.services')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('services.subtitle')}</p>
        </div>
        <ServicesTabs active="services" />
      </StickyPageHeader>

      <ServicesStats activeFilter={active} onActiveFilterChange={setActive} />

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
                placeholder={t('services.searchPlaceholder')}
                aria-label={t('services.searchPlaceholder')}
                data-testid="input-search-services"
                className="h-10 w-full rounded-lg border border-input bg-muted/40 pl-10 pr-3 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <Select
              className="h-10 w-44 rounded-lg"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              placeholder={t('services.allCategories')}
              aria-label={t('nav.categories')}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Select
              className="h-10 w-36 rounded-lg"
              value={active}
              onChange={(e) => setActive(e.target.value)}
              placeholder={t('services.allStatuses')}
              aria-label={t('services.status')}
              options={[
                { value: 'true', label: t('services.active') },
                { value: 'false', label: t('services.inactive') },
              ]}
            />
            {data ? (
              <span className="ml-1 text-xs text-muted-foreground">
                · {t('services.count', { count: data.total })}
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
            {canManage ? (
              <Button
                size="lg"
                className="gap-2 rounded-lg"
                onClick={openCreate}
                data-testid="btn-create-service"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('services.createTitle')}
              </Button>
            ) : null}
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
          <Table containerClassName="w-full" className="min-w-[960px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 text-xs">#</TableHead>
                <TableHead>{t('services.name')}</TableHead>
                <TableHead>{t('nav.categories')}</TableHead>
                <TableHead className="text-right">{t('services.price')}</TableHead>
                <TableHead className="text-right">{t('services.duration')}</TableHead>
                <TableHead className="text-center">{t('services.bom')}</TableHead>
                <TableHead className="text-center">{t('services.status')}</TableHead>
                {canManage ? (
                  <TableHead className="w-24 text-center">{t('common.edit')}</TableHead>
                ) : null}
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
                    <EmptyState
                      title={t('services.empty')}
                      className="border-0"
                      action={
                        canManage ? (
                          <Button size="sm" onClick={openCreate}>
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            {t('services.createTitle')}
                          </Button>
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((s, i) => (
                  <TableRow
                    key={s.id}
                    className="even:bg-transparent hover:bg-primary-subtle/40 animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
                    style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                    data-testid={`row-service-${s.id}`}
                  >
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {rowOffset + i + 1}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <ServiceThumb url={s.imageUrl} name={s.name} />
                        <div className="min-w-0">
                          <span className="text-[13px] font-semibold text-foreground">{s.name}</span>
                          {s.highlights.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {s.highlights.slice(0, 2).map((h) => (
                                <span
                                  key={h}
                                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                                >
                                  <Tag className="h-2.5 w-2.5" aria-hidden="true" />
                                  {h}
                                </span>
                              ))}
                            </div>
                          ) : s.description ? (
                            <p className="mt-0.5 max-w-[260px] truncate text-[11px] text-muted-foreground">
                              {s.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      <div>{s.categoryName}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {s.branchName ?? t('branch.all')}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        {s.compareAtPrice && s.compareAtPrice > s.price ? (
                          <span className="text-[11px] text-muted-foreground line-through">
                            <CurrencyText amount={s.compareAtPrice} currency={s.currency} />
                          </span>
                        ) : null}
                        <CurrencyText amount={s.price} currency={s.currency} />
                        {s.compareAtPrice && s.compareAtPrice > s.price ? (
                          <span className="mt-0.5 inline-flex items-center rounded-full bg-destructive-soft px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                            -{Math.round((1 - s.price / s.compareAtPrice) * 100)}%
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {s.durationMinutes}′
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold tabular-nums',
                          s.consumables.some((c) => c.lowStock)
                            ? 'bg-warning-soft text-warning'
                            : 'bg-primary/10 text-primary',
                        )}
                        title={
                          s.consumables.some((c) => c.lowStock)
                            ? t('services.lowStockHint')
                            : undefined
                        }
                      >
                        {s.consumables.some((c) => c.lowStock) ? (
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <FolderOpen className="h-3 w-3" aria-hidden="true" />
                        )}
                        {s.consumables.length}
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
                        {s.isActive ? t('services.active') : t('services.inactive')}
                      </Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(s)}
                            aria-label={t('common.edit')}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-muted hover:text-primary active:scale-90 motion-reduce:active:scale-100"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDelete(s)}
                            aria-label={t('common.delete')}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-destructive-soft hover:text-destructive active:scale-90 motion-reduce:active:scale-100"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
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

      <ServiceFormDialog open={formOpen} onOpenChange={setFormOpen} service={editing} />
    </div>
  );
}

/** 40×40 catalog thumbnail — falls back to a tinted placeholder when a
 *  service has no `imageUrl` or the image fails to load, never a blank gap. */
function ServiceThumb({ url, name }: { url: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  const show = url && !broken;
  return (
    <span
      className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-primary/5 text-primary/50"
      title={show ? undefined : name}
    >
      {show ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <ImageOff className="h-4 w-4" aria-hidden="true" />
      )}
    </span>
  );
}
