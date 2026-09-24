import type { AdminUser, ManageableRole } from '@abcp/shared-types';
import {
  ChevronRight,
  Clock,
  Crown,
  Search,
  ShieldCheck,
  UserCheck,
  Users as UsersIcon,
  UserX,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';
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
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { ModuleStatCard } from '@/features/settings/components/ModuleStatCard';
import { formatDate, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

import { RoleIcon } from './RoleIcon';
import { useRoles } from './roles.api';
import { UserCell } from './UserCell';
import { UserSecurityDialog } from './UserSecurityDialog';
import { useCreateUser, useUpdateUser, useUsers } from './users.api';

const TIERS: ManageableRole[] = ['SUPER_ADMIN', 'BRANCH_ADMIN'];
const EMPTY_FORM = { name: '', phone: '', email: '', role: 'BRANCH_ADMIN' as ManageableRole, roleId: '', branchId: '' };
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';

function RoleBadge({ user }: { user: Pick<AdminUser, 'role' | 'roleName' | 'roleColor' | 'roleIcon'> }) {
  if (user.roleName && user.roleColor) {
    return (
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ background: `${user.roleColor}1a`, color: user.roleColor }}
      >
        {user.roleIcon ? <RoleIcon icon={user.roleIcon} className="h-3 w-3" /> : null}
        {user.roleName}
      </span>
    );
  }
  return (
    <Badge variant={user.role === 'SUPER_ADMIN' ? 'primary' : 'neutral'} className="whitespace-nowrap">
      {user.role}
    </Badge>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function SheetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-b border-border py-4 first:pt-0 last:border-b-0">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

export function UsersPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en' : 'lo';
  const { user: me, hasPermission } = useAuth();
  const canManage = hasPermission('users:manage');
  const { data: branches = [] } = useBranches();
  const { data = [], isLoading } = useUsers();
  const { data: roles = [] } = useRoles();

  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | ManageableRole>('ALL');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
  const [nextRole, setNextRole] = useState<ManageableRole>('BRANCH_ADMIN');
  const [statusTarget, setStatusTarget] = useState<AdminUser | null>(null);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [securityOpen, setSecurityOpen] = useState(false);
  const selectedUser = data.find((u) => u.id === selectedUserId) ?? null;
  const [profileDraft, setProfileDraft] = useState({ name: '', email: '' });

  useEffect(() => {
    if (selectedUser) setProfileDraft({ name: selectedUser.name, email: selectedUser.email ?? '' });
  }, [selectedUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (branchFilter && u.branchId !== branchFilter) return false;
      if (statusFilter === 'ACTIVE' && !u.isActive) return false;
      if (statusFilter === 'INACTIVE' && u.isActive) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
      );
    });
  }, [data, search, roleFilter, branchFilter, statusFilter]);

  const counts = useMemo(
    () => ({
      ALL: data.length,
      SUPER_ADMIN: data.filter((u) => u.role === 'SUPER_ADMIN').length,
      BRANCH_ADMIN: data.filter((u) => u.role === 'BRANCH_ADMIN').length,
    }),
    [data],
  );
  const activeCount = useMemo(() => data.filter((u) => u.isActive).length, [data]);
  const quickLoginCount = useMemo(() => data.filter((u) => u.quickLoginEnabled).length, [data]);

  const submit = () => {
    createUser.mutate(
      {
        name: form.name,
        phone: form.phone,
        role: form.role,
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.roleId ? { roleId: form.roleId } : {}),
        ...(form.branchId ? { branchId: form.branchId } : {}),
      },
      {
        onSuccess: () => {
          toast.success(t('users.invited'));
          setOpen(false);
          setForm(EMPTY_FORM);
        },
        onError: () => toast.error(t('users.createError')),
      },
    );
  };

  const confirmRoleChange = () => {
    if (!roleTarget) return;
    updateUser.mutate(
      { id: roleTarget.id, input: { role: nextRole } },
      {
        onSuccess: () => {
          toast.success(t('users.roleChanged'));
          setRoleTarget(null);
        },
        onError: () => toast.error(t('users.roleChangeError')),
      },
    );
  };

  const confirmStatusChange = () => {
    if (!statusTarget) return;
    const nextActive = !statusTarget.isActive;
    updateUser.mutate(
      { id: statusTarget.id, input: { isActive: nextActive } },
      {
        onSuccess: () => {
          toast.success(t(nextActive ? 'users.activated' : 'users.deactivated'));
          setStatusTarget(null);
        },
        onError: () => toast.error(t('users.statusChangeError')),
      },
    );
  };

  const profileDirty = Boolean(
    selectedUser &&
      (profileDraft.name.trim() !== selectedUser.name ||
        (profileDraft.email.trim() || null) !== (selectedUser.email ?? null)),
  );

  const saveProfile = () => {
    if (!selectedUser || !profileDraft.name.trim()) return;
    updateUser.mutate(
      {
        id: selectedUser.id,
        input: { name: profileDraft.name.trim(), email: profileDraft.email.trim() ? profileDraft.email.trim() : null },
      },
      {
        onSuccess: () => toast.success(t('users.profileUpdated')),
        onError: () => toast.error(t('users.profileUpdateError')),
      },
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav.usersRoles')}
        description={t('users.subtitle')}
        actions={
          canManage ? (
            <Button onClick={() => setOpen(true)}>
              <UsersIcon className="h-4 w-4" aria-hidden="true" />
              {t('users.invite')}
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ModuleStatCard
          icon={UsersIcon}
          tone="primary"
          label={t('users.overviewTotal')}
          value={counts.ALL}
          index={0}
          onClick={() => setRoleFilter('ALL')}
          active={roleFilter === 'ALL'}
        />
        <ModuleStatCard
          icon={UserCheck}
          tone="success"
          label={t('users.overviewActive')}
          value={activeCount}
          index={1}
          onClick={() => setStatusFilter(statusFilter === 'ACTIVE' ? 'ALL' : 'ACTIVE')}
          active={statusFilter === 'ACTIVE'}
        />
        <ModuleStatCard
          icon={Crown}
          tone="accent"
          label={t('users.overviewSuperAdmins')}
          value={counts.SUPER_ADMIN}
          index={2}
          onClick={() => setRoleFilter(roleFilter === 'SUPER_ADMIN' ? 'ALL' : 'SUPER_ADMIN')}
          active={roleFilter === 'SUPER_ADMIN'}
        />
        <ModuleStatCard
          icon={Zap}
          tone="info"
          label={t('users.overviewQuickLogin')}
          value={quickLoginCount}
          index={3}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
            {(['ALL', ...TIERS] as const).map((r) => {
              const isActive = roleFilter === r;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={cn(
                    'flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {r === 'ALL' ? t('users.filterAll') : r}
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                      isActive ? 'bg-white/20' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {counts[r]}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1 rounded-xl border border-border bg-card p-1">
            {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((s) => {
              const isActive = statusFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {s === 'ALL' ? t('users.filterAll') : s === 'ACTIVE' ? t('users.active') : t('users.inactive')}
                </button>
              );
            })}
          </div>

          <Select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            placeholder={t('users.noBranch')}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
            className="h-9 w-auto min-w-[160px]"
          />
        </div>

        <div className="relative w-full lg:w-[260px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('users.search')}
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border py-16 text-center">
          <Search className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">{t('users.noResults')}</p>
          <p className="text-sm text-muted-foreground">{t('users.noResultsDesc')}</p>
        </div>
      ) : (
        <Table containerClassName="rounded-md border border-border">
          <TableHeader>
            <TableRow>
              <TableHead>{t('users.name')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('users.branch')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('users.lastActive')}</TableHead>
              <TableHead>{t('users.role')}</TableHead>
              <TableHead>{t('users.status')}</TableHead>
              <TableHead className="w-8" aria-hidden="true" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => (
              <TableRow
                key={u.id}
                className="h-14 cursor-pointer transition-colors hover:bg-muted/50"
                onClick={() => setSelectedUserId(u.id)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <UserCell user={u} />
                    {u.quickLoginEnabled ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-info-soft text-info">
                            <Zap className="h-3 w-3" aria-hidden="true" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{t('users.quickLoginStatusOn')}</TooltipContent>
                      </Tooltip>
                    ) : null}
                    {me?.id === u.id ? (
                      <Badge variant="neutral" className="shrink-0">
                        {t('users.you')}
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {u.branchName ?? t('users.noBranch')}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {u.lastLoginAt ? (
                    <div className="flex flex-col gap-0.5 leading-tight">
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground">
                        <Clock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                        {formatRelative(u.lastLoginAt, locale)}
                      </span>
                      {u.lastLoginDevice ? (
                        <span className="text-[11px] text-muted-foreground">{u.lastLoginDevice}</span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">{t('users.never')}</span>
                  )}
                </TableCell>
                <TableCell>
                  <RoleBadge user={u} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {canManage ? (
                    <Switch
                      checked={u.isActive}
                      onCheckedChange={() => setStatusTarget(u)}
                      aria-label={u.isActive ? t('users.active') : t('users.inactive')}
                    />
                  ) : (
                    <Badge variant={u.isActive ? 'primary' : 'neutral'}>
                      {u.isActive ? t('users.active') : t('users.inactive')}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('users.invite')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="u-name">{t('users.name')}</Label>
              <Input id="u-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-phone">{t('auth.phone')}</Label>
              <Input id="u-phone" type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="u-email">{t('users.email')}</Label>
              <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('users.accountTier')}</Label>
              <Select
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as ManageableRole }))}
                options={TIERS.map((r) => ({ value: r, label: r }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('users.role')}</Label>
              <Select
                value={form.roleId}
                onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
                placeholder={t('users.selectRolePlaceholder')}
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('nav.branches')}</Label>
              <Select
                value={form.branchId}
                onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                placeholder={t('branch.all')}
                options={branches.map((b) => ({ value: b.id, label: b.name }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={createUser.isPending || !form.name.trim() || !form.phone.trim()}>
              {t('users.sendInvite')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={selectedUser != null} onOpenChange={(v) => !v && setSelectedUserId(null)}>
        <SheetContent className="max-w-md">
          {selectedUser ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    <UserCell
                      user={selectedUser}
                      onAvatarChange={
                        canManage
                          ? (dataUrl) => updateUser.mutate({ id: selectedUser.id, input: { avatarUrl: dataUrl } })
                          : undefined
                      }
                    />
                  </div>
                </SheetTitle>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <RoleBadge user={selectedUser} />
                  <Badge variant={selectedUser.isActive ? 'primary' : 'neutral'}>
                    {selectedUser.isActive ? t('users.active') : t('users.inactive')}
                  </Badge>
                  {me?.id === selectedUser.id ? <Badge variant="neutral">{t('users.you')}</Badge> : null}
                </div>
              </SheetHeader>

              <SheetBody>
                <SheetSection title={t('users.profileSection')}>
                  {canManage ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="p-name">{t('users.name')}</Label>
                        <Input
                          id="p-name"
                          value={profileDraft.name}
                          onChange={(e) => setProfileDraft((f) => ({ ...f, name: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="p-email">{t('users.email')}</Label>
                        <Input
                          id="p-email"
                          type="email"
                          value={profileDraft.email}
                          onChange={(e) => setProfileDraft((f) => ({ ...f, email: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t('auth.phone')}</Label>
                        <Input value={selectedUser.phone} disabled />
                      </div>
                      {profileDirty ? (
                        <Button size="sm" onClick={saveProfile} disabled={updateUser.isPending || !profileDraft.name.trim()}>
                          {updateUser.isPending ? t('common.saving') : t('common.save')}
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <div>
                      <InfoRow label={t('auth.phone')} value={selectedUser.phone} />
                      <InfoRow label={t('users.email')} value={selectedUser.email ?? t('users.noEmail')} />
                    </div>
                  )}
                </SheetSection>

                <SheetSection title={t('users.accessSection')}>
                  {canManage ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>{t('users.accountTier')}</Label>
                        <Select
                          value={selectedUser.role}
                          onChange={(e) => {
                            setNextRole(e.target.value as ManageableRole);
                            setRoleTarget(selectedUser);
                          }}
                          options={TIERS.map((r) => ({ value: r, label: r }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t('users.role')}</Label>
                        <Select
                          value={selectedUser.roleId ?? ''}
                          onChange={(e) =>
                            updateUser.mutate(
                              { id: selectedUser.id, input: { roleId: e.target.value || null } },
                              {
                                onSuccess: () => toast.success(t('users.roleChanged')),
                                onError: () => toast.error(t('users.roleChangeError')),
                              },
                            )
                          }
                          placeholder={t('users.selectRolePlaceholder')}
                          options={roles.map((r) => ({ value: r.id, label: r.name }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t('nav.branches')}</Label>
                        <Select
                          value={selectedUser.branchId ?? ''}
                          onChange={(e) =>
                            updateUser.mutate({ id: selectedUser.id, input: { branchId: e.target.value || null } })
                          }
                          placeholder={t('branch.all')}
                          options={branches.map((b) => ({ value: b.id, label: b.name }))}
                        />
                      </div>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`${ROUTES.userPermissions}?userId=${selectedUser.id}`}>
                          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                          {t('users.manageAccess')}
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <InfoRow label={t('users.accountTier')} value={selectedUser.role} />
                      <InfoRow label={t('users.role')} value={selectedUser.roleName ?? t('users.roleDefault')} />
                      <InfoRow label={t('nav.branches')} value={selectedUser.branchName ?? t('users.noBranch')} />
                    </div>
                  )}
                </SheetSection>

                <SheetSection title={t('nav.quickLoginManagement')}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className={cn(
                          'flex h-6 w-6 items-center justify-center rounded-full',
                          selectedUser.quickLoginEnabled ? 'bg-info-soft text-info' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span>
                        {selectedUser.quickLoginEnabled ? t('users.quickLoginStatusOn') : t('users.quickLoginStatusOff')}
                      </span>
                    </div>
                    {canManage ? (
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={ROUTES.quickLoginManagement}>{t('users.openQuickLogin')}</Link>
                      </Button>
                    ) : null}
                  </div>
                </SheetSection>

                <SheetSection title={t('users.activitySection')}>
                  <InfoRow
                    label={t('users.lastActive')}
                    value={selectedUser.lastLoginAt ? formatRelative(selectedUser.lastLoginAt, locale) : t('users.never')}
                  />
                  {selectedUser.lastLoginDevice ? (
                    <InfoRow label={selectedUser.lastLoginDevice} value="" />
                  ) : null}
                  <InfoRow label={t('users.memberSince', { date: formatDate(selectedUser.createdAt) })} value="" />
                </SheetSection>

                {canManage ? (
                  <SheetSection title={t('users.accountSection')}>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setSecurityOpen(true)}>
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        {t('userSecurity.open')}
                      </Button>
                      <Button
                        variant={selectedUser.isActive ? 'danger' : 'primary'}
                        size="sm"
                        onClick={() => setStatusTarget(selectedUser)}
                      >
                        <UserX className="h-4 w-4" aria-hidden="true" />
                        {selectedUser.isActive ? t('users.confirmDeactivateTitle') : t('users.confirmActivateTitle')}
                      </Button>
                    </div>
                  </SheetSection>
                ) : null}
              </SheetBody>

              <SheetFooter>
                <Button variant="secondary" onClick={() => setSelectedUserId(null)}>
                  {t('common.cancel')}
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <UserSecurityDialog
        userId={selectedUser?.id ?? null}
        name={selectedUser?.name ?? ''}
        open={securityOpen && selectedUser != null}
        onClose={() => setSecurityOpen(false)}
      />

      <Dialog open={roleTarget != null} onOpenChange={(v) => !v && setRoleTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('users.changeTier')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('users.changeTierDesc', { name: roleTarget?.name })}
          </p>
          <div className="space-y-1.5">
            <Label>{t('users.accountTier')}</Label>
            <Select
              value={nextRole}
              onChange={(e) => setNextRole(e.target.value as ManageableRole)}
              options={TIERS.map((r) => ({ value: r, label: r }))}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRoleTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={confirmRoleChange} disabled={updateUser.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statusTarget != null} onOpenChange={(v) => !v && setStatusTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {statusTarget?.isActive ? t('users.confirmDeactivateTitle') : t('users.confirmActivateTitle')}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t(statusTarget?.isActive ? 'users.confirmDeactivateDesc' : 'users.confirmActivateDesc', {
              name: statusTarget?.name,
            })}
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setStatusTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={statusTarget?.isActive ? 'danger' : 'primary'}
              onClick={confirmStatusChange}
              disabled={updateUser.isPending}
            >
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
