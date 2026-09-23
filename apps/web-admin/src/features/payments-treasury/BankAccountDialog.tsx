import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { BankAccountView } from '@abcp/shared-types';

import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/features/auth/useAuth';
import { NormalizedApiError } from '@/services/apiError';

import { ReauthField } from './banks.parts';

import { useBanks, useCreateBankAccount, useUpdateBankAccount, type BankMutationResult } from './treasury.api';

const CURRENCIES = ['LAK', 'THB', 'USD'];

interface Props {
  open: boolean;
  onClose: () => void;
  /** null = create. */
  account: BankAccountView | null;
  branches: { id: string; name: string }[];
  defaultBranchId?: string;
}

/** Create / edit one receiving bank account. Bank + branch are fixed once created. */
export function BankAccountDialog({ open, onClose, account, branches, defaultBranchId }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'lo';
  const { data: banks = [] } = useBanks();
  const create = useCreateBankAccount();
  const update = useUpdateBankAccount();
  const editing = Boolean(account);

  const [branchId, setBranchId] = useState('');
  const [bankId, setBankId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [currency, setCurrency] = useState('LAK');
  const [isDefault, setIsDefault] = useState(false);
  const [password, setPassword] = useState('');
  const { user } = useAuth();
  const needsApproval = user?.role !== 'SUPER_ADMIN';

  useEffect(() => {
    if (!open) return;
    setBranchId(account?.branchId ?? defaultBranchId ?? branches[0]?.id ?? '');
    setBankId(account?.bankId ?? '');
    setAccountName(account?.accountName ?? '');
    setAccountNumber(account?.accountNumber ?? '');
    setCurrency(account?.currency ?? 'LAK');
    setIsDefault(account?.isDefault ?? false);
    setPassword('');
  }, [open, account, defaultBranchId, branches]);

  const busy = create.isPending || update.isPending;
  // Payee details (who the money goes to) need the password, and a branch admin's go to the owner first.
  const payeeChanged =
    !account ||
    accountName.trim() !== account.accountName ||
    accountNumber.trim() !== account.accountNumber ||
    currency !== account.currency;
  const valid =
    accountName.trim().length > 0 &&
    accountNumber.trim().length >= 4 &&
    (editing || (bankId && branchId)) &&
    (!payeeChanged || password.length > 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    const onError = (err: unknown) =>
      toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError'));
    const onSuccess = (r: BankMutationResult) => {
      toast.success(t(r.pending ? 'payTreasury.banks.change.sent' : 'common.saved'));
      onClose();
    };
    const pw = payeeChanged ? { currentPassword: password } : {};
    if (account) {
      update.mutate(
        {
          id: account.id,
          input: {
            accountName: accountName.trim(),
            accountNumber: accountNumber.trim(),
            currency,
            ...(isDefault !== account.isDefault ? { isDefault } : {}),
            ...pw,
          },
        },
        { onSuccess, onError },
      );
    } else {
      create.mutate(
        { bankId, branchId, accountName: accountName.trim(), accountNumber: accountNumber.trim(), currency, isDefault, ...pw },
        { onSuccess, onError },
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t(editing ? 'payTreasury.banks.editAccount' : 'payTreasury.banks.addAccount')}</DialogTitle>
            <DialogDescription>{t('payTreasury.banks.accountHint')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ba-branch">{t('payTreasury.col.branch')}</Label>
              <Select
                id="ba-branch"
                value={branchId}
                disabled={editing || branches.length <= 1}
                onChange={(e) => setBranchId(e.target.value)}
                options={branches.map((b) => ({ value: b.id, label: b.name }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ba-bank">{t('payTreasury.col.bank')}</Label>
              <Select
                id="ba-bank"
                value={bankId || account?.bankId || ''}
                disabled={editing}
                placeholder={t('payTreasury.banks.pickBank')}
                onChange={(e) => setBankId(e.target.value)}
                options={banks.map((b) => ({ value: b.id, label: `${b.code} · ${lang === 'en' ? b.nameEn : b.nameLo}` }))}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ba-name">{t('payTreasury.banks.accountName')}</Label>
            <Input id="ba-name" value={accountName} maxLength={120} onChange={(e) => setAccountName(e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div className="grid gap-1.5">
              <Label htmlFor="ba-number">{t('payTreasury.banks.accountNumber')}</Label>
              <Input
                id="ba-number"
                inputMode="numeric"
                className="tabular-nums"
                value={accountNumber}
                maxLength={40}
                onChange={(e) => setAccountNumber(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ba-currency">{t('payTreasury.col.currency')}</Label>
              <Select
                id="ba-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
            <div>
              <Label htmlFor="ba-default">{t('payTreasury.banks.makeDefault')}</Label>
              <p className="text-2xs text-muted-foreground">{t('payTreasury.banks.makeDefaultHint')}</p>
            </div>
            <Switch
              id="ba-default"
              checked={isDefault}
              disabled={account?.isDefault}
              onCheckedChange={setIsDefault}
              aria-label={t('payTreasury.banks.makeDefault')}
            />
          </div>

          {payeeChanged ? (
            <ReauthField
              id="ba-password"
              value={password}
              onChange={setPassword}
              hint={t(needsApproval ? 'payTreasury.banks.change.approvalHint' : 'payTreasury.banks.change.ownerHint')}
              tone={needsApproval ? 'warning' : 'info'}
            />
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || busy}>
              {t(payeeChanged && needsApproval ? 'payTreasury.banks.change.submit' : 'common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
