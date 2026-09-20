import type { AdminUser } from '@abcp/shared-types';
import { Clock, KeyRound, Search, ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PageHeader } from '@/components/layout/PageHeader';
import { RoleBadge } from '@/components/shared/RoleBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useBranches } from '@/features/branches/branches.api';
import { ModuleStatCard } from '@/features/settings/components/ModuleStatCard';
import { formatDateTime, formatRelative } from '@/lib/format';

import { PinField, type PinFieldStatus } from './PinField';
import { isWeakPin } from './pinStrength';
import { UserCell } from './UserCell';
import { useDisableQuickLogin, useSetQuickLoginPin, useUsers } from './users.api';

type StatusFilter = 'ALL' | 'ENABLED' | 'NEVER';

function QuickLoginSwitch({
  user,
  locked,
  onEnable,
  onDisable,
}: {
  user: Pick<AdminUser, 'quickLoginEnabled'>;
  locked: boolean;
  onEnable: () => void;
  onDisable: () => void;
}) {
  const { t } = useTranslation();
  const el = (
    <Switch
      checked={user.quickLoginEnabled}
      disabled={locked}
      onCheckedChange={(checked) => (checked ? onEnable() : onDisable())}
      aria-label={user.quickLoginEnabled ? t('users.quickLoginEnabled') : t('users.quickLoginDisabled')}
    />
  );
  if (!locked) return el;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-not-allowed">{el}</span>
      </TooltipTrigger>
      <TooltipContent>{t('users.quickLoginInactiveHint')}</TooltipContent>
    </Tooltip>
  );
}

export function QuickLoginPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en' : 'lo';
  const { data = [], isLoading } = useUsers();
  const { data: branches = [] } = useBranches();
  const setPin = useSetQuickLoginPin();
  const disable = useDisableQuickLogin();

  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [pin, setPinValue] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinVisible, setPinVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const enabledCount = useMemo(() => data.filter((u) => u.quickLoginEnabled).length, [data]);
  const neverSetCount = data.length - enabledCount;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((u) => {
      if (branchFilter !== 'ALL' && u.branchId !== branchFilter) return false;
      if (statusFilter === 'ENABLED' && !u.quickLoginEnabled) return false;
      if (statusFilter === 'NEVER' && u.quickLoginEnabled) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.phone.toLowerCase().includes(q);
    });
  }, [data, search, branchFilter, statusFilter]);

  const closeDialog = () => {
    setTarget(null);
    setPinValue('');
    setConfirmPin('');
    setPinVisible(false);
    setConfirmVisible(false);
  };

  const pinWeak = isWeakPin(pin);
  const pinStatus: PinFieldStatus = pin.length >= 4 && pinWeak ? 'warning' : 'idle';
  const pinMessage =
    pin.length === 0 || pin.length < 4 ? t('users.quickLoginPinLengthHint') : pinWeak ? t('users.quickLoginPinWeak') : '';

  const readyToCompare = confirmPin.length > 0 && pin.length >= 4;
  const pinsMatch = readyToCompare && pin === confirmPin;
  const confirmStatus: PinFieldStatus = !readyToCompare
    ? 'idle'
    : pinsMatch
      ? 'success'
      : confirmPin.length >= pin.length
        ? 'error'
        : 'idle';
  const confirmMessage = !readyToCompare
    ? t('users.quickLoginPinLengthHint')
    : pinsMatch
      ? t('users.quickLoginPinMatch')
      : confirmPin.length >= pin.length
        ? t('users.quickLoginPinNoMatch')
        : '';

  const canSave = pin.length >= 4 && pin.length <= 6 && pin === confirmPin;

  const save = () => {
    if (!target || !canSave) return;
    setPin.mutate(
      { id: target.id, pin },
      {
        onSuccess: () => {
          toast.success(t('users.pinSaved'));
          closeDialog();
        },
        onError: () => toast.error(t('users.pinSaveError')),
      },
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t('nav.quickLoginManagement')} description={t('users.quickLoginSubtitle')} />

      <div className="grid gap-3 sm:grid-cols-3">
        <ModuleStatCard
          icon={Users}
          tone="primary"
          label={t('users.quickLoginStatTotal')}
          value={data.length}
          index={0}
          onClick={() => setStatusFilter('ALL')}
          active={statusFilter === 'ALL'}
        />
        <ModuleStatCard
          icon={ShieldCheck}
          tone="success"
          label={t('users.quickLoginStatEnabled')}
          value={enabledCount}
          hint={data.length > 0 ? t('users.pctOfAll', { pct: Math.round((enabledCount / data.length) * 100) }) : undefined}
          index={1}
          onClick={() => setStatusFilter((f) => (f === 'ENABLED' ? 'ALL' : 'ENABLED'))}
          active={statusFilter === 'ENABLED'}
        />
        <ModuleStatCard
          icon={ShieldAlert}
          tone="warning"
          label={t('users.quickLoginStatNever')}
          value={neverSetCount}
          hint={data.length > 0 ? t('users.pctOfAll', { pct: Math.round((neverSetCount / data.length) * 100) }) : undefined}
          index={2}
          onClick={() => setStatusFilter((f) => (f === 'NEVER' ? 'ALL' : 'NEVER'))}
          active={statusFilter === 'NEVER'}
        />
      </div>

      <Card className="flex items-start gap-3 p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">{t('users.quickLoginSecurityTitle')}</p>
          <p className="text-sm text-muted-foreground">{t('users.quickLoginSecurityDesc')}</p>
        </div>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {branches.length > 1 ? (
          <div className="w-full sm:w-[180px]">
            <Select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              options={[{ value: 'ALL', label: t('branch.all') }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
            />
          </div>
        ) : null}
        <div className="relative w-full sm:w-[240px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('users.search')} className="pl-9" />
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
              <TableHead>{t('users.role')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('users.lastActive')}</TableHead>
              <TableHead>{t('users.status')}</TableHead>
              <TableHead className="text-right">{t('users.manage')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((u) => {
              const locked = !u.isActive;
              return (
                <TableRow key={u.id} className="h-14">
                  <TableCell>
                    <UserCell user={u} />
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {u.branchName ?? t('users.noBranch')}
                  </TableCell>
                  <TableCell>
                    <RoleBadge user={u} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {u.lastLoginAt ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex flex-col gap-0.5 leading-tight">
                            <span className="inline-flex items-center gap-1.5 text-[12px] text-foreground">
                              <Clock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                              {formatRelative(u.lastLoginAt, locale)}
                            </span>
                            {u.lastLoginDevice ? (
                              <span className="truncate text-[11px] text-muted-foreground">{u.lastLoginDevice}</span>
                            ) : null}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{formatDateTime(u.lastLoginAt)}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">{t('users.never')}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <QuickLoginSwitch
                        user={u}
                        locked={locked}
                        onEnable={() => setTarget(u)}
                        onDisable={() =>
                          disable.mutate(u.id, { onSuccess: () => toast.success(t('users.quickLoginDisabledToast')) })
                        }
                      />
                      <span className="text-[12px] text-muted-foreground">
                        {locked ? (
                          <Badge variant="neutral">{t('users.inactive')}</Badge>
                        ) : u.quickLoginEnabled ? (
                          t('users.pinSetAgo', { time: formatRelative(u.quickLoginUpdatedAt, locale) })
                        ) : (
                          t('users.pinNeverSet')
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" disabled={locked} onClick={() => setTarget(u)}>
                      {u.quickLoginEnabled ? t('users.changePin') : t('users.setPin')}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={target != null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
              {target?.quickLoginEnabled ? t('users.changePin') : t('users.setPin')} — {target?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <PinField
              id="ql-pin"
              label={t('users.pin')}
              value={pin}
              onChange={setPinValue}
              visible={pinVisible}
              onToggleVisible={() => setPinVisible((v) => !v)}
              toggleLabel={{ show: t('users.quickLoginShowPin'), hide: t('users.quickLoginHidePin') }}
              autoFocus
              status={pinStatus}
              message={pinMessage}
            />
            <PinField
              id="ql-pin-confirm"
              label={t('users.confirmPin')}
              value={confirmPin}
              onChange={setConfirmPin}
              visible={confirmVisible}
              onToggleVisible={() => setConfirmVisible((v) => !v)}
              toggleLabel={{ show: t('users.quickLoginShowPin'), hide: t('users.quickLoginHidePin') }}
              status={confirmStatus}
              message={confirmMessage}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={closeDialog}>
              {t('common.cancel')}
            </Button>
            <Button onClick={save} disabled={setPin.isPending || !canSave}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
