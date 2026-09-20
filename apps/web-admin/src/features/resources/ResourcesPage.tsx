import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Building2,
  CheckCircle2,
  DoorOpen,
  Plus,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { EquipmentView, RoomView } from '@abcp/shared-types';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { DataTable, FilterBar, Pagination, StatusPill } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { NormalizedApiError } from '@/services/apiError';

import { ResourceStatCard } from './ResourceStatCard';
import {
  useCreateEquipment,
  useCreateRoom,
  useDeleteEquipment,
  useDeleteRoom,
  useEquipmentList,
  useRooms,
  useUpdateEquipment,
  useUpdateRoom,
} from './resources.api';

type Branch = { id: string; name: string };
type Availability = 'all' | 'available' | 'unavailable';

const onError = (t: (k: string) => string) => (err: unknown) =>
  toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));

export function ResourcesPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('queue:manage');
  const { data: branches = [] } = useBranches();
  const [tab, setTab] = useState<'rooms' | 'equipment'>('rooms');

  return (
    <div className="space-y-4">
      <StickyPageHeader>
        <div>
          <h1 className="text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
            {t('nav.resources')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('resources.subtitle')}</p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="mt-3">
          <TabsList className="h-auto rounded-xl border border-border bg-card p-1">
            <TabsTrigger
              value="rooms"
              className="rounded-lg border-0 px-4 py-1.5 data-[state=active]:border-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <DoorOpen className="h-4 w-4" aria-hidden="true" />
              {t('resources.tabRooms')}
            </TabsTrigger>
            <TabsTrigger
              value="equipment"
              className="rounded-lg border-0 px-4 py-1.5 data-[state=active]:border-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              <Wrench className="h-4 w-4" aria-hidden="true" />
              {t('resources.tabEquipment')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </StickyPageHeader>

      {tab === 'rooms' ? (
        <RoomsTab branches={branches} canManage={canManage} />
      ) : (
        <EquipmentTab branches={branches} canManage={canManage} />
      )}
    </div>
  );
}

// ---- Shared bits --------------------------------------------------------

function useAvailabilityFilter<T extends { isAvailable: boolean; branchId: string; name: string }>(
  list: T[],
  availability: Availability,
  q: string,
  codeOf?: (item: T) => string,
) {
  return useMemo(() => {
    const query = q.trim().toLowerCase();
    return list.filter((item) => {
      if (availability === 'available' && !item.isAvailable) return false;
      if (availability === 'unavailable' && item.isAvailable) return false;
      if (!query) return true;
      const haystack = `${item.name} ${codeOf?.(item) ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [list, availability, q, codeOf]);
}

function StatsRow({
  loading,
  total,
  available,
  unavailable,
  branchCount,
  totalLabel,
  totalHint,
  availableHint,
  unavailableHint,
  branchHint,
  availability,
  onToggleAvailability,
}: {
  loading: boolean;
  total: number;
  available: number;
  unavailable: number;
  branchCount: number;
  totalLabel: string;
  totalHint: string;
  availableHint: string;
  unavailableHint: string;
  branchHint: string;
  availability: Availability;
  onToggleAvailability: (v: Availability) => void;
}) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[62px] w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <ResourceStatCard
        index={0}
        icon={DoorOpen}
        tone="primary"
        label={totalLabel}
        value={total}
        hint={totalHint}
      />
      <ResourceStatCard
        index={1}
        icon={CheckCircle2}
        tone="success"
        label={t('resources.stat.available')}
        value={available}
        hint={availableHint}
        onClick={() => onToggleAvailability(availability === 'available' ? 'all' : 'available')}
        active={availability === 'available'}
      />
      <ResourceStatCard
        index={2}
        icon={XCircle}
        tone="danger"
        label={t('resources.stat.unavailable')}
        value={unavailable}
        hint={unavailableHint}
        onClick={() => onToggleAvailability(availability === 'unavailable' ? 'all' : 'unavailable')}
        active={availability === 'unavailable'}
      />
      <ResourceStatCard
        index={3}
        icon={Building2}
        tone="neutral"
        label={t('resources.stat.branches')}
        value={branchCount}
        hint={branchHint}
      />
    </div>
  );
}

function AvailabilityCell({
  isAvailable,
  disabled,
  onToggle,
  label,
}: {
  isAvailable: boolean;
  disabled: boolean;
  onToggle: (v: boolean) => void;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2.5">
      <Switch checked={isAvailable} disabled={disabled} onCheckedChange={onToggle} aria-label={label} />
      <StatusPill
        variant={isAvailable ? 'success' : 'neutral'}
        status={isAvailable ? 'available' : 'unavailable'}
        label={isAvailable ? t('resources.badge.available') : t('resources.badge.unavailable')}
      />
    </div>
  );
}

// ---- Rooms -------------------------------------------------------------

function RoomsTab({ branches, canManage }: { branches: Branch[]; canManage: boolean }) {
  const { t } = useTranslation();
  const [branchId, setBranchId] = useState('');
  const [availability, setAvailability] = useState<Availability>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [editing, setEditing] = useState<RoomView | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<RoomView | null>(null);

  const { data: rooms = [], isLoading } = useRooms({ branchId: branchId || undefined });
  const createM = useCreateRoom();
  const updateM = useUpdateRoom();
  const deleteM = useDeleteRoom();

  const filtered = useAvailabilityFilter(rooms, availability, q);
  const availableCount = rooms.filter((r) => r.isAvailable).length;
  const branchCount = new Set(rooms.map((r) => r.branchId)).size;
  const hasActiveFilters = Boolean(branchId) || availability !== 'all' || Boolean(q);

  useEffect(() => setPage(1), [branchId, availability, q]);
  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [filtered, page, pageSize],
  );

  const columns = useMemo<ColumnDef<RoomView, unknown>[]>(
    () => [
      {
        header: t('resources.col.name'),
        accessorKey: 'name',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <DoorOpen className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.name}</div>
              <div className="truncate text-xs text-muted-foreground">{row.original.branchName}</div>
            </div>
          </div>
        ),
      },
      {
        header: t('resources.col.available'),
        id: 'available',
        cell: ({ row }) => {
          const r = row.original;
          return (
            <AvailabilityCell
              isAvailable={r.isAvailable}
              disabled={!canManage || updateM.isPending}
              onToggle={(v) =>
                updateM.mutate({ id: r.id, input: { isAvailable: v } }, { onError: onError(t) })
              }
              label={t('resources.col.available')}
            />
          );
        },
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) =>
          canManage ? (
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleting(row.original);
                }}
              >
                <Trash2 className="h-3 w-3 text-destructive" aria-hidden="true" />
                {t('common.delete')}
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, canManage, updateM],
  );

  return (
    <div className="space-y-4">
      <StatsRow
        loading={isLoading}
        total={rooms.length}
        available={availableCount}
        unavailable={rooms.length - availableCount}
        branchCount={branchCount}
        totalLabel={t('resources.stat.totalRooms')}
        totalHint={t('resources.stat.totalRoomsHint')}
        availableHint={t('resources.stat.availableRoomsHint')}
        unavailableHint={t('resources.stat.unavailableRoomsHint')}
        branchHint={t('resources.stat.branchesHint')}
        availability={availability}
        onToggleAvailability={setAvailability}
      />

      <FilterBar
        search={q}
        onSearchChange={setQ}
        searchPlaceholder={t('resources.searchRooms')}
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setBranchId('');
          setAvailability('all');
          setQ('');
        }}
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
          value={availability}
          onChange={(e) => setAvailability(e.target.value as Availability)}
          options={[
            { value: 'all', label: t('resources.filter.all') },
            { value: 'available', label: t('resources.badge.available') },
            { value: 'unavailable', label: t('resources.badge.unavailable') },
          ]}
          aria-label={t('resources.col.available')}
        />
        {canManage ? (
          <Button className="ml-auto" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('resources.newRoom')}
          </Button>
        ) : null}
      </FilterBar>

      <Card className="overflow-hidden">
        <div className="p-2 sm:p-3">
          <DataTable
            columns={columns}
            data={paged}
            loading={isLoading}
            getRowId={(r) => r.id}
            onRowClick={canManage ? (r) => setEditing(r) : undefined}
            emptyTitle={hasActiveFilters ? t('resources.emptyFilteredRooms') : t('resources.emptyRooms')}
            emptyDescription={
              hasActiveFilters ? t('resources.emptyFilteredHint') : t('resources.emptyRoomsHint')
            }
          />
        </div>
        {filtered.length > 0 ? (
          <div className="border-t border-border px-4 py-3">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          </div>
        ) : null}
      </Card>

      <RoomDialog
        open={creating || Boolean(editing)}
        room={editing}
        branches={branches}
        pending={createM.isPending || updateM.isPending}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSubmit={(branchIdVal, name) => {
          const onSuccess = () => {
            toast.success(t('common.saved'));
            setCreating(false);
            setEditing(null);
          };
          if (editing) {
            updateM.mutate({ id: editing.id, input: { name } }, { onSuccess, onError: onError(t) });
          } else {
            createM.mutate(
              { branchId: branchIdVal, name, isAvailable: true },
              { onSuccess, onError: onError(t) },
            );
          }
        }}
      />

      <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('resources.deleteRoomTitle')}</DialogTitle>
            <DialogDescription>{t('resources.deleteHint')}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <DoorOpen className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{deleting?.name}</p>
              <p className="truncate text-xs text-muted-foreground">{deleting?.branchName}</p>
            </div>
          </div>
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
                  onError: onError(t),
                });
              }}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoomDialog({
  open,
  room,
  branches,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  room: RoomView | null;
  branches: Branch[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (branchId: string, name: string) => void;
}) {
  const { t } = useTranslation();
  const [branchId, setBranchId] = useState('');
  const [name, setName] = useState('');
  const [initedFor, setInitedFor] = useState<string | null>(null);

  const targetKey = room?.id ?? (open ? 'new' : null);
  if (open && targetKey !== initedFor) {
    setInitedFor(targetKey);
    setBranchId(room?.branchId ?? branches[0]?.id ?? '');
    setName(room?.name ?? '');
  }
  if (!open && initedFor !== null) setInitedFor(null);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <DoorOpen className="h-4 w-4" aria-hidden="true" />
            </span>
            {room ? t('resources.editRoom') : t('resources.newRoom')}
          </DialogTitle>
          <DialogDescription>{t('resources.roomFormHint')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!branchId || !name.trim()) {
              toast.error(t('resources.formInvalid'));
              return;
            }
            onSubmit(branchId, name.trim());
          }}
        >
          <div className="space-y-1.5">
            <Label>{t('inventory.col.branch')}</Label>
            <Select
              value={branchId}
              disabled={Boolean(room)}
              onChange={(e) => setBranchId(e.target.value)}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="room-name">{t('resources.col.name')}</Label>
            <Input
              id="room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('resources.roomNamePlaceholder')}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Equipment ---------------------------------------------------------

function EquipmentTab({ branches, canManage }: { branches: Branch[]; canManage: boolean }) {
  const { t } = useTranslation();
  const [branchId, setBranchId] = useState('');
  const [availability, setAvailability] = useState<Availability>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [editing, setEditing] = useState<EquipmentView | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<EquipmentView | null>(null);

  const { data: items = [], isLoading } = useEquipmentList({ branchId: branchId || undefined });
  const createM = useCreateEquipment();
  const updateM = useUpdateEquipment();
  const deleteM = useDeleteEquipment();

  const filtered = useAvailabilityFilter(items, availability, q, (i) => i.code);
  const availableCount = items.filter((i) => i.isAvailable).length;
  const branchCount = new Set(items.map((i) => i.branchId)).size;
  const hasActiveFilters = Boolean(branchId) || availability !== 'all' || Boolean(q);

  useEffect(() => setPage(1), [branchId, availability, q]);
  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize),
    [filtered, page, pageSize],
  );

  const columns = useMemo<ColumnDef<EquipmentView, unknown>[]>(
    () => [
      {
        header: t('resources.col.name'),
        accessorKey: 'name',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-foreground">
              <Wrench className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium">{row.original.name}</div>
              <div className="truncate text-xs text-muted-foreground">{row.original.branchName}</div>
            </div>
          </div>
        ),
      },
      {
        header: t('resources.col.code'),
        accessorKey: 'code',
        cell: ({ row }) => (
          <Badge variant="neutral" className="font-mono">
            {row.original.code}
          </Badge>
        ),
      },
      {
        header: t('resources.col.available'),
        id: 'available',
        cell: ({ row }) => {
          const r = row.original;
          return (
            <AvailabilityCell
              isAvailable={r.isAvailable}
              disabled={!canManage || updateM.isPending}
              onToggle={(v) =>
                updateM.mutate({ id: r.id, input: { isAvailable: v } }, { onError: onError(t) })
              }
              label={t('resources.col.available')}
            />
          );
        },
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row }) =>
          canManage ? (
            <div className="flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleting(row.original);
                }}
              >
                <Trash2 className="h-3 w-3 text-destructive" aria-hidden="true" />
                {t('common.delete')}
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, canManage, updateM],
  );

  return (
    <div className="space-y-4">
      <StatsRow
        loading={isLoading}
        total={items.length}
        available={availableCount}
        unavailable={items.length - availableCount}
        branchCount={branchCount}
        totalLabel={t('resources.stat.totalEquipment')}
        totalHint={t('resources.stat.totalEquipmentHint')}
        availableHint={t('resources.stat.availableEquipmentHint')}
        unavailableHint={t('resources.stat.unavailableEquipmentHint')}
        branchHint={t('resources.stat.branchesHint')}
        availability={availability}
        onToggleAvailability={setAvailability}
      />

      <FilterBar
        search={q}
        onSearchChange={setQ}
        searchPlaceholder={t('resources.searchEquipment')}
        hasActiveFilters={hasActiveFilters}
        onClear={() => {
          setBranchId('');
          setAvailability('all');
          setQ('');
        }}
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
          value={availability}
          onChange={(e) => setAvailability(e.target.value as Availability)}
          options={[
            { value: 'all', label: t('resources.filter.all') },
            { value: 'available', label: t('resources.badge.available') },
            { value: 'unavailable', label: t('resources.badge.unavailable') },
          ]}
          aria-label={t('resources.col.available')}
        />
        {canManage ? (
          <Button className="ml-auto" onClick={() => setCreating(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('resources.newEquipment')}
          </Button>
        ) : null}
      </FilterBar>

      <Card className="overflow-hidden">
        <div className="p-2 sm:p-3">
          <DataTable
            columns={columns}
            data={paged}
            loading={isLoading}
            getRowId={(r) => r.id}
            onRowClick={canManage ? (r) => setEditing(r) : undefined}
            emptyTitle={
              hasActiveFilters ? t('resources.emptyFilteredEquipment') : t('resources.emptyEquipment')
            }
            emptyDescription={
              hasActiveFilters ? t('resources.emptyFilteredHint') : t('resources.emptyEquipmentHint')
            }
          />
        </div>
        {filtered.length > 0 ? (
          <div className="border-t border-border px-4 py-3">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          </div>
        ) : null}
      </Card>

      <EquipmentDialog
        open={creating || Boolean(editing)}
        item={editing}
        branches={branches}
        pending={createM.isPending || updateM.isPending}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSubmit={(branchIdVal, name, code) => {
          const onSuccess = () => {
            toast.success(t('common.saved'));
            setCreating(false);
            setEditing(null);
          };
          if (editing) {
            updateM.mutate(
              { id: editing.id, input: { name, code } },
              { onSuccess, onError: onError(t) },
            );
          } else {
            createM.mutate(
              { branchId: branchIdVal, name, code, isAvailable: true },
              { onSuccess, onError: onError(t) },
            );
          }
        }}
      />

      <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('resources.deleteEquipmentTitle')}</DialogTitle>
            <DialogDescription>{t('resources.deleteHint')}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-foreground">
              <Wrench className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{deleting?.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {deleting?.branchName} · {deleting?.code}
              </p>
            </div>
          </div>
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
                  onError: onError(t),
                });
              }}
            >
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EquipmentDialog({
  open,
  item,
  branches,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  item: EquipmentView | null;
  branches: Branch[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (branchId: string, name: string, code: string) => void;
}) {
  const { t } = useTranslation();
  const [branchId, setBranchId] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [initedFor, setInitedFor] = useState<string | null>(null);

  const targetKey = item?.id ?? (open ? 'new' : null);
  if (open && targetKey !== initedFor) {
    setInitedFor(targetKey);
    setBranchId(item?.branchId ?? branches[0]?.id ?? '');
    setName(item?.name ?? '');
    setCode(item?.code ?? '');
  }
  if (!open && initedFor !== null) setInitedFor(null);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-foreground">
              <Wrench className="h-4 w-4" aria-hidden="true" />
            </span>
            {item ? t('resources.editEquipment') : t('resources.newEquipment')}
          </DialogTitle>
          <DialogDescription>{t('resources.equipmentFormHint')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!branchId || !name.trim() || !code.trim()) {
              toast.error(t('resources.formInvalid'));
              return;
            }
            onSubmit(branchId, name.trim(), code.trim());
          }}
        >
          <div className="space-y-1.5">
            <Label>{t('inventory.col.branch')}</Label>
            <Select
              value={branchId}
              disabled={Boolean(item)}
              onChange={(e) => setBranchId(e.target.value)}
              options={branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-name">{t('resources.col.name')}</Label>
            <Input
              id="eq-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('resources.equipmentNamePlaceholder')}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-code">{t('resources.col.code')}</Label>
            <Input
              id="eq-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('resources.equipmentCodePlaceholder')}
              className="font-mono"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={pending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
