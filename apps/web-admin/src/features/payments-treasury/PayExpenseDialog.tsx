import { Banknote, Building2, Coins, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CurrencyText } from '@/components/shared';
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
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

import { useCashFunds } from './expenses.api';
import { useBankAccounts } from './treasury.api';
import { maskAccount } from './treasury.lib';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Branch the money leaves from. `null` = the selection spans branches, so only cash is offered. */
  branchId: string | null;
  /** Account currency must match — `null` for a mixed-currency selection (cash only). */
  currency: string | null;
  count: number;
  amount: number;
  busy: boolean;
  onConfirm: (input: { paidFromAccountId: string | null; cashFundId?: string | null; paidReference?: string }) => void;
}

/**
 * Record a payment for one or many approved expenses. The source is picked from cards (cash or one of
 * the branch's active accounts in the same currency) rather than a dropdown, so the choice — and the
 * account it will be booked against in reconciliation — is visible before confirming.
 */
export function PayExpenseDialog({ open, onClose, branchId, currency, count, amount, busy, onConfirm }: Props) {
  const { t } = useTranslation();
  const { data: accounts = [] } = useBankAccounts(branchId ?? undefined);
  const [accountId, setAccountId] = useState('');
  const [reference, setReference] = useState('');

  const payable = branchId && currency ? accounts.filter((a) => a.isActive && a.branchId === branchId && a.currency === currency) : [];
  const { data: funds = [] } = useCashFunds(branchId ?? undefined, { enabled: Boolean(open && branchId) });
  const cashBoxes = branchId && currency ? funds.filter((f) => f.isActive && f.branchId === branchId && f.currency === currency) : [];

  useEffect(() => {
    if (!open) return;
    setReference('');
    setAccountId(payable.find((a) => a.isDefault)?.id ?? '');
    // Only when the dialog opens — re-running on every accounts refetch would clobber the user's choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const option = (id: string, icon: typeof Wallet, title: string, sub: string, disabled = false) => {
    const Icon = icon;
    const active = accountId === id;
    return (
      <button
        key={id || 'cash'}
        type="button"
        role="radio"
        aria-checked={active}
        disabled={disabled}
        onClick={() => setAccountId(id)}
        className={cn(
          'flex min-w-0 items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
          active ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card hover:bg-muted/50',
        )}
      >
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block truncate text-2xs text-muted-foreground">{sub}</span>
        </span>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{count > 1 ? t('payTreasury.exp.payBulkTitle', { count }) : t('payTreasury.exp.payTitle')}</DialogTitle>
          <DialogDescription>{t('payTreasury.exp.payBody')}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          <p className="text-2xs text-muted-foreground">{t('payTreasury.exp.payTotal', { count })}</p>
          <p className="text-2xl font-bold tabular-nums">
            <CurrencyText amount={amount} currency={(currency ?? 'LAK') as 'LAK'} />
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label id="pay-src">{t('payTreasury.exp.paidFrom')}</Label>
          <div role="radiogroup" aria-labelledby="pay-src" className="grid gap-2 sm:grid-cols-2">
            {cashBoxes.map((f) =>
              option(
                `fund:${f.id}`,
                Coins,
                f.name,
                f.balance < amount
                  ? t('payTreasury.exp.fundShort', { balance: formatCurrency(f.balance, f.currency as 'LAK') })
                  : t('payTreasury.exp.fundBalance', { balance: formatCurrency(f.balance, f.currency as 'LAK') }),
                f.balance < amount,
              ),
            )}
            {option('', Wallet, t('payTreasury.exp.cash'), cashBoxes.length ? t('payTreasury.exp.cashOutsideBox') : t('payTreasury.exp.cashHint'))}
            {payable.map((a) => option(a.id, Building2, `${a.bank.code} · ${a.accountName}`, maskAccount(a.accountNumber)))}
          </div>
          {!branchId || !currency ? (
            <p className="text-2xs text-muted-foreground">{t('payTreasury.exp.payMixed')}</p>
          ) : payable.length === 0 ? (
            <p className="text-2xs text-muted-foreground">{t('payTreasury.exp.payNoAccounts')}</p>
          ) : null}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="pay-ref">{t('payTreasury.exp.reference')}</Label>
          <Input id="pay-ref" maxLength={120} value={reference} placeholder={t('payTreasury.exp.referencePh')} onChange={(e) => setReference(e.target.value)} />
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={busy}
            onClick={() =>
              onConfirm(
                accountId.startsWith('fund:')
                  ? { paidFromAccountId: null, cashFundId: accountId.slice(5), paidReference: reference.trim() || undefined }
                  : { paidFromAccountId: accountId || null, paidReference: reference.trim() || undefined },
              )
            }
          >
            <Banknote className="mr-1 h-4 w-4" aria-hidden="true" />
            {t('payTreasury.exp.markPaid')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
