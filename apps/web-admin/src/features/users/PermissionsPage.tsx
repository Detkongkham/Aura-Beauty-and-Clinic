import {
  PERMISSIONS,
  ROLE_COLORS,
  ROLE_ICONS,
  type Permission,
  type Role,
  type RoleIconKey,
} from '@abcp/shared-types';
import { ChevronRight, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

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
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

import { PermissionMatrix } from './PermissionMatrix';
import { RoleIcon } from './RoleIcon';
import { useDeleteRole, useCreateRole, useUpdateRole, useRoles } from './roles.api';
import { UserCell } from './UserCell';
import { useSetUserPermissions, useUpdateUser, useUserPermissions, useUsers } from './users.api';

interface RoleForm {
  name: string;
  icon: RoleIconKey;
  color: string;
  permissions: Permission[];
}

const EMPTY_ROLE_FORM: RoleForm = { name: '', icon: 'UsersRound', color: ROLE_COLORS[0], permissions: [] };

export function PermissionsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { data: users = [], isLoading: usersLoading } = useUsers();
  const { data: roles = [], isLoading: rolesLoading } = useRoles();
  const updateUser = useUpdateUser();

  const userId = params.get('userId');
  const selected = users.find((u) => u.id === userId) ?? null;
  const [roleFilter, setRoleFilter] = useState<string | null>(selected?.roleId ?? null);

  useEffect(() => {
    if (selected) setRoleFilter(selected.roleId);
  }, [selected]);
  useEffect(() => {
    if (!roleFilter && roles.length > 0) setRoleFilter(roles[0]!.id);
  }, [roles, roleFilter]);

  const { data: perms, isLoading: permsLoading } = useUserPermissions(userId);
  const setPermissions = useSetUserPermissions(userId);

  // permission -> override granted value; absent = follow role default
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const o of perms?.overrides ?? []) next[o.permission] = o.granted;
    setDraft(next);
  }, [perms]);

  const roleSet = useMemo(() => new Set(perms?.rolePermissions ?? []), [perms]);

  const isChecked = (p: Permission) => (p in draft ? Boolean(draft[p]) : roleSet.has(p));
  const isOverridden = (p: Permission) => p in draft && Boolean(draft[p]) !== roleSet.has(p);

  const grantedCount = PERMISSIONS.filter((p) => isChecked(p)).length;

  const toggle = (p: Permission) => {
    const current = isChecked(p);
    const next = !current;
    setDraft((d) => {
      const copy = { ...d };
      if (next === roleSet.has(p)) delete copy[p];
      else copy[p] = next;
      return copy;
    });
  };

  const dirty = perms
    ? JSON.stringify([...perms.overrides].sort((a, b) => a.permission.localeCompare(b.permission))) !==
      JSON.stringify(
        Object.entries(draft)
          .map(([permission, granted]) => ({ permission, granted }))
          .sort((a, b) => a.permission.localeCompare(b.permission)),
      )
    : false;

  const save = () => {
    const overrides = Object.entries(draft).map(([permission, granted]) => ({
      permission: permission as Permission,
      granted,
    }));
    setPermissions.mutate(overrides, {
      onSuccess: () => toast.success(t('users.permissionsSaved')),
      onError: () => toast.error(t('users.permissionsSaveError')),
    });
  };

  const [memberSearch, setMemberSearch] = useState('');
  const usersInRole = users
    .filter((u) => u.roleId === roleFilter)
    .filter((u) => {
      const q = memberSearch.trim().toLowerCase();
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.phone.toLowerCase().includes(q);
    });
  const activeRole = roles.find((r) => r.id === roleFilter) ?? null;

  // --- Role create/edit/delete ---
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const [roleDialog, setRoleDialog] = useState<Role | 'new' | null>(null);
  const [roleForm, setRoleForm] = useState<RoleForm>(EMPTY_ROLE_FORM);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  const openRoleDialog = (role: Role | 'new') => {
    setRoleDialog(role);
    setRoleForm(
      role === 'new'
        ? EMPTY_ROLE_FORM
        : { name: role.name, icon: role.icon as RoleIconKey, color: role.color, permissions: role.permissions },
    );
  };

  const toggleRoleFormPermission = (p: Permission) => {
    setRoleForm((f) => ({
      ...f,
      permissions: f.permissions.includes(p) ? f.permissions.filter((x) => x !== p) : [...f.permissions, p],
    }));
  };

  const saveRole = () => {
    if (!roleForm.name.trim()) return;
    const payload = { name: roleForm.name.trim(), icon: roleForm.icon, color: roleForm.color, permissions: roleForm.permissions };
    if (roleDialog === 'new') {
      createRole.mutate(payload, {
        onSuccess: (created) => {
          toast.success(t('users.roleCreated'));
          setRoleDialog(null);
          setRoleFilter(created.id);
        },
        onError: () => toast.error(t('users.roleSaveError')),
      });
    } else if (roleDialog) {
      updateRole.mutate(
        { id: roleDialog.id, input: payload },
        {
          onSuccess: () => {
            toast.success(t('users.roleUpdated'));
            setRoleDialog(null);
          },
          onError: () => toast.error(t('users.roleSaveError')),
        },
      );
    }
  };

  const confirmDeleteRole = () => {
    if (!deleteTarget) return;
    deleteRole.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast.success(t('users.roleDeleted'));
        setDeleteTarget(null);
        if (roleFilter === deleteTarget.id) setRoleFilter(null);
      },
      onError: (err: unknown) => {
        const message =
          (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ??
          t('users.roleDeleteError');
        toast.error(message);
      },
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t('nav.userPermissions')} description={t('users.permissionsSubtitle')} />

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex w-full shrink-0 flex-col gap-2 lg:w-[210px]">
          <Button variant="secondary" size="sm" className="w-full" onClick={() => openRoleDialog('new')}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t('users.createRole')}
          </Button>

          <p className="mt-0.5 px-0.5 text-[10px] font-bold text-muted-foreground">
            {t('users.internalRoles', { count: roles.length })}
          </p>

          {rolesLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="flex flex-col gap-1 overflow-y-auto">
              {roles.map((role) => {
                const isActive = roleFilter === role.id;
                return (
                  <div key={role.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => setRoleFilter(role.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-all duration-150',
                        isActive ? 'border-current shadow-sm' : 'border-transparent hover:bg-muted',
                      )}
                      style={isActive ? { background: `${role.color}14`, borderColor: role.color } : undefined}
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl transition-colors"
                        style={
                          isActive
                            ? { background: role.color, color: 'white' }
                            : { background: `${role.color}20`, color: role.color }
                        }
                      >
                        <RoleIcon icon={role.icon} className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn('block truncate text-[11px] font-semibold', !isActive && 'text-foreground')}
                          style={isActive ? { color: role.color } : undefined}
                        >
                          {role.name}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          {t('users.membersCount', { count: role.memberCount })}
                        </span>
                      </span>
                      {isActive ? (
                        <ChevronRight
                          className="h-3 w-3 shrink-0"
                          style={{ color: role.color }}
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                    <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        title={t('common.edit')}
                        onClick={() => openRoleDialog(role)}
                        className="flex h-5 w-5 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-sm hover:border-primary hover:text-primary"
                      >
                        <Pencil className="h-2.5 w-2.5" aria-hidden="true" />
                      </button>
                      {!role.isSystem ? (
                        <button
                          type="button"
                          title={t('common.delete')}
                          onClick={() => setDeleteTarget(role)}
                          className="flex h-5 w-5 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-sm hover:border-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-2.5 w-2.5" aria-hidden="true" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder={t('users.searchMembersPlaceholder')}
              className="h-8 pl-8 text-[12px]"
            />
          </div>

          <div className="flex flex-col gap-1">
            {usersInRole.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => setParams({ userId: u.id })}
                className={cn(
                  'rounded-lg px-2 py-1 text-left transition-colors',
                  u.id === userId ? 'bg-primary-subtle' : 'hover:bg-muted',
                )}
              >
                <UserCell user={u} size="sm" />
              </button>
            ))}
            {usersInRole.length === 0 && !usersLoading ? (
              <p className="px-2 py-1.5 text-[12px] text-muted-foreground">{t('users.noResults')}</p>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          {activeRole ? (
            <div
              className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 shadow-sm"
              style={{ background: `${activeRole.color}12`, borderColor: `${activeRole.color}40` }}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white"
                style={{ background: activeRole.color }}
              >
                <RoleIcon icon={activeRole.icon} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold">{activeRole.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {t('users.membersCount', { count: activeRole.memberCount })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => openRoleDialog(activeRole)}
                  className="flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition-colors hover:bg-card"
                  style={{ borderColor: `${activeRole.color}40`, color: activeRole.color, background: `${activeRole.color}0d` }}
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                  {t('common.edit')}
                </button>
                {!activeRole.isSystem ? (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(activeRole)}
                    className="flex items-center gap-1 rounded-lg border border-destructive/30 bg-destructive-soft px-2 py-1 text-[10px] font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    {t('common.delete')}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {!selected ? (
            <p className="text-sm text-muted-foreground">{t('users.selectUserHint')}</p>
          ) : permsLoading || !perms ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <UserCell user={selected} />
                  <Select
                    className="h-8 w-auto min-w-[160px] text-[13px]"
                    value={selected.roleId ?? ''}
                    onChange={(e) =>
                      updateUser.mutate(
                        { id: selected.id, input: { roleId: e.target.value || null } },
                        {
                          onSuccess: () => {
                            toast.success(t('users.roleChanged'));
                            setRoleFilter(e.target.value || null);
                          },
                          onError: () => toast.error(t('users.roleChangeError')),
                        },
                      )
                    }
                    options={roles.map((r) => ({ value: r.id, label: r.name }))}
                  />
                  <Badge variant="neutral">{t('users.grantedOf', { granted: grantedCount, total: PERMISSIONS.length })}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setDraft({})} disabled={Object.keys(draft).length === 0}>
                    {t('users.resetToRoleDefault')}
                  </Button>
                  <Button size="sm" onClick={save} disabled={!dirty || setPermissions.isPending}>
                    {t('common.save')}
                  </Button>
                </div>
              </div>

              <PermissionMatrix isChecked={isChecked} onToggle={toggle} isOverridden={isOverridden} />
            </div>
          )}
        </div>
      </div>

      <Dialog open={roleDialog != null} onOpenChange={(v) => !v && setRoleDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{roleDialog === 'new' ? t('users.createRole') : t('users.editRole')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="role-name">{t('users.roleName')}</Label>
              <Input id="role-name" value={roleForm.name} onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>{t('users.roleIconLabel')}</Label>
              <div className="flex flex-wrap gap-2">
                {ROLE_ICONS.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setRoleForm((f) => ({ ...f, icon }))}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
                      roleForm.icon === icon ? 'border-primary bg-primary-subtle text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                    aria-label={icon}
                  >
                    <RoleIcon icon={icon} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t('users.roleColorLabel')}</Label>
              <div className="flex flex-wrap gap-2">
                {ROLE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setRoleForm((f) => ({ ...f, color }))}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform',
                      roleForm.color === color ? 'scale-110 border-foreground' : 'border-transparent',
                    )}
                    style={{ background: color }}
                    aria-label={color}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('users.rolePermissionsLabel')}</Label>
              <PermissionMatrix
                isChecked={(p) => roleForm.permissions.includes(p)}
                onToggle={toggleRoleFormPermission}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRoleDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={saveRole} disabled={!roleForm.name.trim() || createRole.isPending || updateRole.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget != null} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('users.confirmDeleteRoleTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('users.confirmDeleteRoleDesc', { name: deleteTarget?.name })}
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={confirmDeleteRole} disabled={deleteRole.isPending}>
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
