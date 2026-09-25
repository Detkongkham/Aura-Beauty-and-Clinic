import { type ReactNode, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  Building2,
  ClipboardList,
  Clock,
  Landmark,
  ListOrdered,
  Receipt,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Truck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { supplierWriteSchema, type SupplierView, type SupplierWriteInput } from '@abcp/shared-types';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { DataTable, FilterBar, Pagination } from '@/components/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useBranches } from '@/features/branches/branches.api';
import { useAuth } from '@/features/auth/useAuth';
import { useConfirm } from '@/hooks/useConfirm';
import { NormalizedApiError } from '@/services/apiError';
import { cn } from '@/lib/utils';

import { InventoryStatCard } from './InventoryStatCard';
import { InventoryTabs } from './InventoryTabs';
import { SupplierLeaderboard } from './SupplierLeaderboard';
import { SupplierPriceListDialog } from './SupplierPriceListDialog';
import { useDeleteSupplier, useSaveSupplier, useSuppliers } from './inventory.api';

export function SuppliersPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('inventory:manage');
  const confirm = useConfirm();
  const del = useDeleteSupplier();

  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [editing, setEditing] = useState<SupplierView | null>(null);
  const [creating, setCreating] = useState(false);
  const [priceListFor, setPriceListFor] = useState<SupplierView | null>(null);

  const { data, isLoading } = useSuppliers({ q: q || undefined, page, pageSize });
  const items = data?.items ?? [];

  const { data: topData, isLoading: topLoading } = useSuppliers({
    page: 1,
    pageSize: 5,
    sort: 'purchaseOrders',
  });

  // No dedicated /suppliers/stats endpoint — these figures summarize the
  // currently loaded page rather than every supplier on file.
  const withOrders = items.filter((s) => s.purchaseOrderCount > 0).length;
  const totalPos = items.reduce((sum, s) => sum + s.purchaseOrderCount, 0);
  const missingEmail = items.filter((s) => !s.email).length;

  const columns = useMemo<ColumnDef<SupplierView, unknown>[]>(
    () => [
      {
        header: t('inventory.supplier.name'),
        accessorKey: 'name',
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
              aria-hidden="true"
            >
              <Building2 className="h-4 w-4" />
            </span>
            <div className="min-w-0 max-w-[140px]">
              <p className="truncate font-medium text-foreground">{row.original.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {row.original.contactPerson || t('inventory.supplier.noContact')}
              </p>
              <div className="mt-0.5 flex flex-wrap gap-1">
                <span className="rounded-full bg-muted px-1.5 py-px text-[11px] text-muted-foreground">
                  {row.original.branchName ?? t('inventory.supplier.shared')}
                </span>
                {row.original.currency !== 'LAK' ? (
                  <span className="rounded-full bg-primary/10 px-1.5 py-px text-[11px] text-primary">{row.original.currency}</span>
                ) : null}
                {!row.original.isActive ? (
                  <span className="rounded-full bg-warning/15 px-1.5 py-px text-[11px] text-warning">
                    {t('inventory.supplier.inactive')}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        ),
      },
      {
        header: t('inventory.supplier.phone'),
        accessorKey: 'phone',
        cell: ({ getValue }) => (
          <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
            <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            {getValue() as string}
          </span>
        ),
      },
      {
        header: t('inventory.supplier.email'),
        accessorKey: 'email',
        cell: ({ getValue }) => {
          const email = getValue() as string | null;
          return email ? (
            <a
              href={`mailto:${email}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex max-w-[140px] items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{email}</span>
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t('inventory.supplier.noEmail')}
            </span>
          );
        },
      },
      {
        header: t('inventory.supplier.address'),
        accessorKey: 'address',
        cell: ({ getValue }) => {
          const address = getValue() as string | null;
          return (
            <span
              className="inline-flex max-w-[120px] items-center gap-1.5 truncate text-sm text-muted-foreground"
              title={address ?? undefined}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{address || t('inventory.supplier.noAddress')}</span>
            </span>
          );
        },
      },
      {
        header: t('inventory.supplier.pos'),
        accessorKey: 'purchaseOrderCount',
        meta: { align: 'right' },
        cell: ({ getValue }) => {
          const count = getValue() as number;
          return (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
                count > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              {count.toLocaleString()}
            </span>
          );
        },
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) =>
          canManage ? (
            <div className="flex justify-end gap-1">
              <Button
                variant="secondary"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setPriceListFor(row.original);
                }}
              >
                <ListOrdered className="h-3 w-3" aria-hidden="true" />
                {t('inventory.supplier.priceList')}
                <span className="tabular-nums text-muted-foreground">{row.original.priceListCount}</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(row.original);
                }}
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
                {t('common.edit')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="h-7 gap-1 px-2 text-xs border-destructive/25 bg-destructive/5 text-destructive hover:border-destructive/40 hover:bg-destructive/10"
                onClick={async (e) => {
                  e.stopPropagation();
                  if (
                    !(await confirm({
                      title: t('inventory.supplier.deleteConfirm'),
                      description:
                        row.original.purchaseOrderCount > 0 ? t('inventory.supplier.softDeleteHint') : undefined,
                    }))
                  )
                    return;
                  del.mutate(row.original.id, {
                    onSuccess: () => toast.success(t('common.deleted')),
                    onError: (err) =>
                      toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
                  });
                }}
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
                {t('common.delete')}
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, canManage, confirm, del],
  );

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
              {t('nav.inventory')}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('inventory.supplier.subtitle')}</p>
          </div>
          {canManage ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t('inventory.supplier.new')}
            </Button>
          ) : null}
        </div>
        <InventoryTabs active="suppliers" />
      </StickyPageHeader>

      {isLoading && !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[62px] w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <InventoryStatCard
            index={0}
            icon={Truck}
            tone="primary"
            label={t('inventory.supplier.stat.total')}
            value={data?.total ?? '—'}
          />
          <InventoryStatCard
            index={1}
            icon={Building2}
            tone="success"
            label={t('inventory.supplier.stat.withOrders')}
            value={withOrders}
          />
          <InventoryStatCard
            index={2}
            icon={ClipboardList}
            tone="neutral"
            label={t('inventory.supplier.stat.totalPos')}
            value={totalPos}
            hint={t('inventory.supplier.stat.totalPosHint')}
          />
          <InventoryStatCard
            index={3}
            icon={AlertTriangle}
            tone="warning"
            label={t('inventory.supplier.stat.missingEmail')}
            value={missingEmail}
            hint={t('inventory.supplier.stat.missingEmailHint')}
          />
        </div>
      )}

      <SupplierLeaderboard suppliers={topData?.items ?? []} loading={topLoading && !topData} />

      <FilterBar
        search={q}
        onSearchChange={(v) => {
          setQ(v);
          setPage(1);
        }}
        searchPlaceholder={t('inventory.supplier.searchPlaceholder')}
        hasActiveFilters={false}
        onClear={() => {
          setQ('');
          setPage(1);
        }}
      />

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <Truck className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">{t('inventory.tab.suppliers')}</h2>
            <span className="text-xs text-muted-foreground">
              {t('inventory.showing', { shown: data?.items.length ?? 0, total: data?.total ?? 0 })}
            </span>
          </div>
        </div>
        <div className="p-2 sm:p-3">
          <DataTable
            columns={columns}
            data={items}
            loading={isLoading}
            getRowId={(r) => r.id}
            emptyTitle={t('inventory.supplier.empty')}
            emptyDescription={t('inventory.supplier.emptyDescription')}
            emptyAction={
              canManage ? (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t('inventory.supplier.new')}
                </Button>
              ) : undefined
            }
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

      <SupplierDialog
        open={creating || Boolean(editing)}
        supplier={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
      <SupplierPriceListDialog
        supplier={priceListFor}
        canManage={canManage}
        onClose={() => setPriceListFor(null)}
      />
    </div>
  );
}

function SupplierDialog({
  open,
  supplier,
  onClose,
}: {
  open: boolean;
  supplier: SupplierView | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { role, user } = useAuth();
  const isSuperAdmin = role === 'SUPER_ADMIN';
  const { data: branches } = useBranches();
  const save = useSaveSupplier();
  const isEdit = Boolean(supplier);

  const form = useForm<SupplierWriteInput>({
    resolver: zodResolver(supplierWriteSchema),
    values: {
      name: supplier?.name ?? '',
      contactPerson: supplier?.contactPerson ?? '',
      phone: supplier?.phone ?? '',
      email: supplier?.email ?? '',
      address: supplier?.address ?? '',
      taxId: supplier?.taxId ?? '',
      paymentTermsDays: supplier?.paymentTermsDays ?? null,
      leadTimeDays: supplier?.leadTimeDays ?? null,
      currency: (supplier?.currency as SupplierWriteInput['currency']) ?? 'LAK',
      bankName: supplier?.bankName ?? '',
      bankAccountName: supplier?.bankAccountName ?? '',
      bankAccountNo: supplier?.bankAccountNo ?? '',
      isActive: supplier?.isActive ?? true,
      // M9 — BRANCH_ADMIN ສ້າງໄດ້ສະເພາະສາຂາຕົນ (backend ບັງຄັບ); SUPER_ADMIN ເລືອກ "ໃຊ້ຮ່ວມ" ຫຼື ສາຂາ.
      branchId: supplier ? supplier.branchId : isSuperAdmin ? null : (user?.branchId ?? null),
    },
  });
  const errors = form.formState.errors;
  const isActive = form.watch('isActive') ?? true;
  const branchValue = form.watch('branchId');
  const optionalInt = { setValueAs: (v: unknown) => (v === '' || v == null ? null : Number(v)) };

  function submit(values: SupplierWriteInput) {
    save.mutate(
      { id: supplier?.id, input: values },
      {
        onSuccess: () => {
          toast.success(t('common.saved'));
          onClose();
        },
        onError: (err) =>
          toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <DialogHeader className="flex-row items-start gap-3 border-b border-border px-6 py-4 pr-12">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <Truck className="h-[18px] w-[18px]" />
          </span>
          <div className="space-y-0.5">
            <DialogTitle>{isEdit ? t('inventory.supplier.edit') : t('inventory.supplier.new')}</DialogTitle>
            <DialogDescription>
              {isEdit ? t('inventory.supplier.form.subtitleEdit') : t('inventory.supplier.form.subtitleNew')}
            </DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(submit)} noValidate className="flex max-h-[calc(100vh-13rem)] flex-col">
          <div className="flex-1 space-y-7 overflow-y-auto px-6 py-5">
            <section className="space-y-4">
              <SectionLabel>{t('inventory.supplier.form.sectionBasic')}</SectionLabel>
              <Field
                htmlFor="s-name"
                label={t('inventory.supplier.name')}
                icon={Building2}
                error={errors.name?.message}
              >
                <Input id="s-name" {...form.register('name')} aria-invalid={Boolean(errors.name)} />
              </Field>
              <Field
                htmlFor="s-contact"
                label={t('inventory.supplier.contact')}
                icon={UserRound}
                error={errors.contactPerson?.message}
              >
                <Input id="s-contact" {...form.register('contactPerson')} />
              </Field>
            </section>

            <section className="space-y-4">
              <SectionLabel>{t('inventory.supplier.form.sectionContact')}</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  htmlFor="s-phone"
                  label={t('inventory.supplier.phone')}
                  icon={Phone}
                  error={errors.phone?.message}
                >
                  <Input id="s-phone" {...form.register('phone')} aria-invalid={Boolean(errors.phone)} />
                </Field>
                <Field
                  htmlFor="s-email"
                  label={t('inventory.supplier.email')}
                  icon={Mail}
                  error={errors.email?.message}
                >
                  <Input
                    id="s-email"
                    type="email"
                    {...form.register('email')}
                    aria-invalid={Boolean(errors.email)}
                  />
                </Field>
              </div>
              <Field
                htmlFor="s-address"
                label={t('inventory.supplier.address')}
                icon={MapPin}
                error={errors.address?.message}
              >
                <Input id="s-address" {...form.register('address')} />
              </Field>
            </section>

            <section className="space-y-4">
              <SectionLabel>{t('inventory.supplier.form.sectionPurchasing')}</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field htmlFor="s-tax" label={t('inventory.supplier.taxId')} icon={Receipt}>
                  <Input id="s-tax" {...form.register('taxId')} />
                </Field>
                <Field htmlFor="s-currency" label={t('inventory.supplier.currency')}>
                  <Select
                    id="s-currency"
                    {...form.register('currency')}
                    options={['LAK', 'THB', 'USD'].map((c) => ({ value: c, label: c }))}
                  />
                </Field>
                <Field
                  htmlFor="s-terms"
                  label={t('inventory.supplier.paymentTerms')}
                  icon={Clock}
                  error={errors.paymentTermsDays?.message}
                >
                  <Input id="s-terms" type="number" min={0} inputMode="numeric" {...form.register('paymentTermsDays', optionalInt)} />
                </Field>
                <Field
                  htmlFor="s-lead"
                  label={t('inventory.supplier.leadTime')}
                  icon={Truck}
                  error={errors.leadTimeDays?.message}
                >
                  <Input id="s-lead" type="number" min={0} inputMode="numeric" {...form.register('leadTimeDays', optionalInt)} />
                </Field>
              </div>
              <Field htmlFor="s-branch" label={t('inventory.col.branch')} icon={Building2}>
                <Select
                  id="s-branch"
                  disabled={!isSuperAdmin}
                  value={branchValue ?? ''}
                  onChange={(e) => form.setValue('branchId', e.target.value || null, { shouldDirty: true })}
                  options={[
                    ...(isSuperAdmin || branchValue == null ? [{ value: '', label: t('inventory.supplier.shared') }] : []),
                    ...(branches ?? []).map((b) => ({ value: b.id, label: b.name })),
                  ]}
                />
              </Field>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                <Label htmlFor="s-active" className="text-sm">
                  {t('inventory.supplier.activeLabel')}
                </Label>
                <Switch
                  id="s-active"
                  checked={isActive}
                  onCheckedChange={(v) => form.setValue('isActive', v, { shouldDirty: true })}
                />
              </div>
            </section>

            <section className="space-y-4">
              <SectionLabel>{t('inventory.supplier.form.sectionBank')}</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field htmlFor="s-bank" label={t('inventory.supplier.bankName')} icon={Landmark}>
                  <Input id="s-bank" {...form.register('bankName')} />
                </Field>
                <Field htmlFor="s-bank-no" label={t('inventory.supplier.bankAccountNo')}>
                  <Input id="s-bank-no" {...form.register('bankAccountNo')} />
                </Field>
              </div>
              <Field htmlFor="s-bank-name" label={t('inventory.supplier.bankAccountName')}>
                <Input id="s-bank-name" {...form.register('bankAccountName')} />
              </Field>
            </section>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-border bg-card px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1 text-sm font-semibold text-foreground">{children}</p>;
}

function Field({
  label,
  htmlFor,
  icon: Icon,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  icon?: LucideIcon;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
        {label}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
