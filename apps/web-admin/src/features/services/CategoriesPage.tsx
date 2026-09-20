import { FolderOpen, Pencil, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Pagination } from '@/components/shared/Pagination';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { usePagination } from '@/hooks/usePagination';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';
import type { ServiceCategory } from '@/types/models';

import { ServicesTabs } from './ServicesTabs';
import { useDeleteCategory, useSaveCategory, useServiceCategories } from './services.api';

export function CategoriesPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('services:manage');
  const { data: categories = [], isLoading, isError, refetch, isFetching } = useServiceCategories();
  const confirm = useConfirm();

  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceCategory | null>(null);
  const [name, setName] = useState('');

  const save = useSaveCategory(editing?.id);
  const del = useDeleteCategory();
  const { page, pageSize, setPage, setPageSize } = usePagination();

  const q = search.trim().toLowerCase();
  const rows = q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;
  const colCount = canManage ? 4 : 3;

  const rowOffset = (page - 1) * pageSize;
  const pageRows = rows.slice(rowOffset, rowOffset + pageSize);

  // A narrower filter can leave the current page out of range — snap back to page 1.
  useEffect(() => {
    setPage(1);
  }, [q, setPage]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setOpen(true);
  };
  const openEdit = (cat: ServiceCategory) => {
    setEditing(cat);
    setName(cat.name);
    setOpen(true);
  };

  const submit = () => {
    if (!name.trim()) return;
    save.mutate(
      { name: name.trim() },
      {
        onSuccess: () => {
          toast.success(t('services.categorySaved'));
          setName('');
          setEditing(null);
          setOpen(false);
        },
        onError: () => toast.error(t('services.saveError')),
      },
    );
  };

  const onDelete = async (cat: ServiceCategory) => {
    const okToDelete = await confirm({
      title: t('services.deleteCategoryTitle'),
      description: t('services.deleteCategoryBody', { name: cat.name }),
      confirmLabel: t('common.delete'),
      destructive: true,
    });
    if (!okToDelete) return;
    del.mutate(cat.id, {
      onSuccess: () => toast.success(t('services.categoryDeleted')),
      onError: (err) =>
        toast.error(
          err instanceof NormalizedApiError && err.status === 409
            ? t('services.categoryInUse')
            : t('services.saveError'),
        ),
    });
  };

  return (
    <div className="space-y-5">
      <StickyPageHeader>
        <div>
          <h1
            className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]"
            data-testid="text-page-title"
          >
            {t('nav.categories')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('services.categoriesSubtitle')}</p>
        </div>
        <ServicesTabs active="categories" />
      </StickyPageHeader>

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
                placeholder={t('common.search')}
                aria-label={t('common.search')}
                data-testid="input-search-categories"
                className="h-10 w-full rounded-lg border border-input bg-muted/40 pl-10 pr-3 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
            {!isLoading ? (
              <span className="ml-1 text-xs text-muted-foreground">
                · {t('services.categoryCount', { count: categories.length })}
              </span>
            ) : null}
            {q ? (
              <button
                type="button"
                onClick={() => setSearch('')}
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
                data-testid="btn-create-category"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('services.newCategory')}
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
          <Table className="min-w-[560px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 text-xs">#</TableHead>
                <TableHead>{t('services.name')}</TableHead>
                <TableHead className="text-center">{t('services.serviceCount')}</TableHead>
                {canManage ? (
                  <TableHead className="w-24 text-center">{t('common.edit')}</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, r) => (
                  <TableRow key={`sk-${r}`} className="even:bg-transparent hover:bg-transparent">
                    {Array.from({ length: colCount }).map((__, c) => (
                      <TableCell key={c}>
                        <div className="h-4 w-full max-w-[160px] animate-pulse rounded bg-muted" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={colCount} className="p-0">
                    <EmptyState
                      title={q ? t('table.empty') : t('services.noCategories')}
                      className="border-0"
                      action={
                        canManage && !q ? (
                          <Button size="sm" onClick={openCreate}>
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            {t('services.newCategory')}
                          </Button>
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                pageRows.map((c, i) => (
                  <TableRow
                    key={c.id}
                    className="even:bg-transparent hover:bg-primary-subtle/40 animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
                    style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                    data-testid={`row-category-${c.id}`}
                  >
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {rowOffset + i + 1}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-[13px] font-semibold text-primary">
                        {c.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-primary">
                        <FolderOpen className="h-3 w-3" aria-hidden="true" />
                        {c.serviceCount}
                      </span>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            aria-label={t('common.edit')}
                            data-testid={`btn-edit-category-${c.id}`}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-muted hover:text-primary active:scale-90 motion-reduce:active:scale-100"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDelete(c)}
                            aria-label={t('common.delete')}
                            data-testid={`btn-delete-category-${c.id}`}
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
              page={page}
              pageSize={pageSize}
              total={rows.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        ) : null}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setEditing(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('services.editCategory') : t('services.newCategory')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">{t('services.name')}</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={save.isPending || !name.trim()}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
