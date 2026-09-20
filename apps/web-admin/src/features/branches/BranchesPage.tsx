import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/useAuth';
import type { Branch, LaoProvinceId } from '@/types/models';

import { BranchDetailPanel } from './BranchDetailPanel';
import { BranchFormDialog } from './BranchFormDialog';
import { BranchListPanel } from './BranchListPanel';
import { BranchStatsRow, type BranchStatusFilter } from './BranchStatsRow';
import { LaoProvinceMap } from './LaoProvinceMap';
import { useBranches } from './branches.api';

export function BranchesPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('branches:manage');
  const { data = [], isLoading } = useBranches();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [selectedProvince, setSelectedProvince] = useState<LaoProvinceId | null>(null);
  const [statusFilter, setStatusFilter] = useState<BranchStatusFilter>('all');
  const [query, setQuery] = useState('');

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (b: Branch) => {
    setEditing(b);
    setFormOpen(true);
  };

  const summary = useMemo(() => {
    const active = data.filter((b) => b.isActive).length;
    return {
      total: data.length,
      provinces: new Set(data.map((b) => b.province)).size,
      active,
      inactive: data.length - active,
    };
  }, [data]);

  const statusFiltered = useMemo(() => {
    if (statusFilter === 'active') return data.filter((b) => b.isActive);
    if (statusFilter === 'inactive') return data.filter((b) => !b.isActive);
    return data;
  }, [data, statusFilter]);

  const countsByProvince = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const b of statusFiltered) counts[b.province] = (counts[b.province] ?? 0) + 1;
    return counts;
  }, [statusFiltered]);

  const listBranches = useMemo(
    () =>
      selectedProvince
        ? statusFiltered.filter((b) => b.province === selectedProvince)
        : statusFiltered,
    [statusFiltered, selectedProvince],
  );

  const selectedBranch = useMemo(
    () => data.find((b) => b.id === selectedBranchId) ?? null,
    [data, selectedBranchId],
  );

  const selectBranch = (id: string) => {
    setSelectedBranchId(id);
    const b = data.find((x) => x.id === id);
    if (b && selectedProvince && b.province !== selectedProvince) setSelectedProvince(null);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('branches.title')}
        description={t('branches.subtitle')}
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t('branches.createTitle')}
            </Button>
          ) : null
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Skeleton className="h-[520px] w-full" />
            <Skeleton className="h-[520px] w-full" />
          </div>
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          title={t('branches.empty')}
          action={
            canManage ? (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('branches.createTitle')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <BranchStatsRow
            total={summary.total}
            provinces={summary.provinces}
            active={summary.active}
            inactive={summary.inactive}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />

          <div className="grid gap-4 lg:grid-cols-[minmax(280px,320px)_1fr] xl:grid-cols-[320px_1fr_minmax(300px,340px)]">
            <BranchListPanel
              className="max-h-[60vh] self-start lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)]"
              branches={listBranches}
              query={query}
              onQueryChange={setQuery}
              selectedProvince={selectedProvince}
              onSelectProvince={setSelectedProvince}
              activeBranchId={selectedBranchId}
              onSelectBranch={selectBranch}
            />

            <Card className="min-w-0 self-start p-4 sm:p-5">
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-foreground">{t('branches.map.title')}</h2>
                <p className="text-xs text-muted-foreground">{t('branches.map.caption')}</p>
              </div>
              <LaoProvinceMap
                branches={statusFiltered}
                countsByProvince={countsByProvince}
                selectedProvince={selectedProvince}
                activeBranchId={selectedBranchId}
                onSelectProvince={setSelectedProvince}
                onSelectBranch={selectBranch}
              />
            </Card>

            <div className="self-start lg:col-span-2 xl:col-span-1">
              <BranchDetailPanel branch={selectedBranch} canManage={canManage} onEdit={openEdit} />
            </div>
          </div>
        </>
      )}

      <BranchFormDialog open={formOpen} onOpenChange={setFormOpen} branch={editing} />
    </div>
  );
}
