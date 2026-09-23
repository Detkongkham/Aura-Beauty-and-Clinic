import type { BankAccountView, UnassignedTransfer } from '@abcp/shared-types';
import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDateTime } from '@/lib/format';
import { NormalizedApiError } from '@/services/apiError';

import { asCur } from './banks.lib';
import { maskAccount } from './treasury.lib';
import { useAssignTransferAccount, useUnassignedTransfers } from './treasury.api';

/**
 * Bank transfers booked without a receiving account (slips approved before the account was required).
 * Each needs one assignment so its day can be reconciled; the server only allows null → account, once.
 * The suggestion (matching receiver number, or the branch's only account) is preselected, never auto-applied.
 */
export function UnassignedTransfersSheet({
  open,
  onClose,
  accounts,
  branchId,
}: {
  open: boolean;
  onClose: () => void;
  accounts: BankAccountView[];
  branchId?: string;
}) {
  const { t } = useTranslation();
  const q = useUnassignedTransfers(open, branchId);
  const rows = q.data ?? [];
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>{t('payTreasury.banks.unassigned.title')}</SheetTitle>
          <SheetDescription>{t('payTreasury.banks.unassigned.hint')}</SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-2 py-4">
          {q.isLoading ? (
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('payTreasury.banks.unassigned.empty')}</p>
          ) : (
            rows.map((r) => (
              <UnassignedRow key={r.id} row={r} accounts={accounts.filter((a) => a.branchId === r.branchId && a.isActive)} />
            ))
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function UnassignedRow({ row: r, accounts }: { row: UnassignedTransfer; accounts: BankAccountView[] }) {
  const { t } = useTranslation();
  const assign = useAssignTransferAccount();
  const [pick, setPick] = useState(r.suggestedAccountId ?? '');
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold tabular-nums">{formatCurrency(r.amount, asCur(r.currency))}</p>
          <p className="truncate text-2xs text-muted-foreground">
            {formatDateTime(r.createdAt)} · {r.branchName} · {r.reference ?? '—'}
          </p>
          {r.receiverAccount ? (
            <p className="text-2xs text-muted-foreground">
              {t('payTreasury.banks.unassigned.slipSays', { account: r.receiverAccount })}
            </p>
          ) : null}
        </div>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-2xs text-muted-foreground">{r.method}</span>
      </div>
      <div className="mt-2 flex gap-2">
        <Select
          className="h-9 flex-1"
          value={pick}
          aria-label={t('payTreasury.banks.unassigned.pick')}
          placeholder={t('payTreasury.banks.unassigned.pick')}
          onChange={(e) => setPick(e.target.value)}
          options={accounts.map((a) => ({
            value: a.id,
            label: `${a.bank.code} · ${a.accountName} · ${maskAccount(a.accountNumber)}${a.id === r.suggestedAccountId ? ` (${t('payTreasury.banks.unassigned.suggested')})` : ''}`,
          }))}
        />
        <Button
          size="sm"
          className="h-9"
          disabled={!pick || assign.isPending}
          onClick={() =>
            assign.mutate(
              { id: r.id, input: { bankAccountId: pick } },
              {
                onSuccess: () => toast.success(t('payTreasury.banks.unassigned.done')),
                onError: (err) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
              },
            )
          }
        >
          <Link2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          {t('payTreasury.banks.unassigned.assign')}
        </Button>
      </div>
    </div>
  );
}
