import type { PackageView } from '@abcp/shared-types';
import { CalendarClock, Package, Pencil, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { CurrencyText, EmptyState } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { NormalizedApiError } from '@/services/apiError';
import { useUiStore } from '@/store/ui.store';

import { useAdminPackages, useSavePackage } from './packages.api';
import { PackageFormDialog } from './PackageFormDialog';
import { ServicesTabs } from './ServicesTabs';

/** Catalog ▸ Packages — the prepaid service bundles customers buy in the app or at the desk. */
export function PackagesPage() {
  const { t } = useTranslation();
  const { role, user, hasPermission } = useAuth();
  const { data: branches = [] } = useBranches();
  const activeBranch = useUiStore((s) => s.activeBranchId);
  const lockedBranch = role === 'BRANCH_ADMIN' ? (user?.branchId ?? null) : null;
  const canEdit = hasPermission('services:manage') && (role === 'SUPER_ADMIN' || role === 'BRANCH_ADMIN');
  const [filter, setFilter] = useState<string>(lockedBranch ?? 'all');
  const scope = lockedBranch ?? (filter === 'all' ? undefined : filter);
  const { data = [], isLoading } = useAdminPackages(scope);
  const save = useSavePackage();
  const [editing, setEditing] = useState<PackageView | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';
  const defaultBranch = lockedBranch ?? (filter !== 'all' ? filter : activeBranch && activeBranch !== 'all' ? activeBranch : branches[0]?.id ?? '');

  const toggle = (p: PackageView, isActive: boolean) =>
    save.mutate(
      { id: p.id, update: { isActive } },
      { onError: (e) => toast.error(e instanceof NormalizedApiError ? e.message : t('common.saveError')) },
    );

  return (
    <div className="space-y-5">
      <StickyPageHeader>
        <div>
          <h1 data-testid="text-page-title">{t('packagesAdmin.title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('packagesAdmin.subtitle')}</p>
        </div>
        <ServicesTabs active="packages" />
      </StickyPageHeader>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
        <div className="w-56">
          <Select
            aria-label={t('packagesAdmin.branch')}
            value={lockedBranch ?? filter}
            disabled={Boolean(lockedBranch)}
            onChange={(e) => setFilter(e.target.value)}
            options={[{ value: 'all', label: t('packagesAdmin.allBranches') }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
          />
        </div>
        {canEdit ? (
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            {t('packagesAdmin.create')}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={Package} title={t('packagesAdmin.empty')} description={t('packagesAdmin.emptyHint')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((p, i) => (
            <article
              key={p.id}
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              className={`flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 hover:shadow-md motion-reduce:animate-none ${p.isActive ? '' : 'opacity-70'}`}
            >
              {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-28 w-full object-cover" loading="lazy" /> : null}
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">{p.name}</h2>
                    <p className="text-xs text-muted-foreground">{branchName(p.branchId)}</p>
                  </div>
                  <Badge variant={p.isActive ? 'success' : 'neutral'}>{p.isActive ? t('packagesAdmin.onSale') : t('packagesAdmin.offSale')}</Badge>
                </div>
                <div className="flex items-baseline gap-2">
                  <CurrencyText amount={p.totalPrice} className="text-xl font-bold" />
                  {p.savings > 0 ? (
                    <span className="text-xs text-muted-foreground line-through">
                      <CurrencyText amount={p.valuePrice} />
                    </span>
                  ) : null}
                  {p.savingsPct > 0 ? <Badge variant="accent">−{p.savingsPct}%</Badge> : null}
                </div>
                <ul className="space-y-1 text-sm">
                  {p.items.map((it) => (
                    <li key={it.serviceId} className="flex justify-between gap-2">
                      <span className="truncate">{it.serviceName}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">× {it.totalUnits}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('packagesAdmin.validDays', { count: p.validityDays })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('packagesAdmin.holders', { count: p.activeHolders })}
                  </span>
                  <span>{t('packagesAdmin.perSessionShort', { amount: p.perSessionPrice.toLocaleString() })}</span>
                  {canEdit ? (
                    <span className="ml-auto flex items-center gap-1">
                      <Switch checked={p.isActive} aria-label={t('packagesAdmin.toggle', { name: p.name })} onCheckedChange={(v) => toggle(p, v)} />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('packagesAdmin.editNamed', { name: p.name })}
                        onClick={() => {
                          setEditing(p);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </span>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <PackageFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        pkg={editing}
        branches={lockedBranch ? branches.filter((b) => b.id === lockedBranch) : branches}
        defaultBranchId={defaultBranch}
        lockBranch={Boolean(lockedBranch)}
      />
    </div>
  );
}
