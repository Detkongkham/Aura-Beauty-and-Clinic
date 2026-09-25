import type { PaymentView } from '@abcp/shared-types';
import { HandCoins, Percent, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { CurrencyText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useAddGratuity } from '@/features/accounting/accounting.api';
import { NormalizedApiError } from '@/services/apiError';

type TipMethod = 'CASH' | 'BANK_QR' | 'BANK_TRANSFER' | 'CREDIT_CARD';

/**
 * Wave 11 — the parts of a bill that are not plain tenders: service charge (inside the total),
 * deposit kept as a no-show / late-cancel fee, and tips (outside the total, owed to staff).
 */
export function BillExtrasPanel({ payment }: { payment: PaymentView }) {
  const { t } = useTranslation();
  const add = useAddGratuity();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<TipMethod>('CASH');
  const [note, setNote] = useState('');

  const sc = payment.serviceChargeAmount ?? 0;
  const forfeited = payment.forfeitedAmount ?? 0;
  const tips = payment.gratuityAmount ?? 0;
  const canTip = payment.paymentStatus !== 'VOIDED' && payment.paymentStatus !== 'PENDING';

  if (!sc && !forfeited && !tips && !canTip) return null;

  const submit = () => {
    const n = Math.round(Number(amount));
    if (!(n > 0)) return;
    add.mutate(
      { paymentId: payment.id, body: { amount: n, method, ...(note.trim() ? { note: note.trim() } : {}) } },
      {
        onSuccess: () => {
          toast.success(t('accounting.payment.tipSaved'));
          setOpen(false);
          setAmount('');
          setNote('');
        },
        onError: (e) => toast.error(e instanceof NormalizedApiError ? e.message : t('common.saveError')),
      },
    );
  };

  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <dl className="divide-y divide-border text-xs">
        {sc > 0 ? (
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <Percent className="h-3.5 w-3.5" aria-hidden="true" />
              {t('accounting.payment.serviceCharge', { rate: Math.round((payment.serviceChargeRate ?? 0) * 100) })}
            </dt>
            <dd className="font-medium">
              <CurrencyText amount={sc} />
            </dd>
          </div>
        ) : null}
        {forfeited > 0 ? (
          <div className="flex items-center justify-between gap-3 bg-warning-soft px-3 py-2.5">
            <dt className="flex items-center gap-2 text-warning">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              {t('accounting.payment.forfeited')}
              {payment.forfeitKind ? ` · ${t(`accounting.payment.forfeitKind.${payment.forfeitKind}`)}` : ''}
            </dt>
            <dd className="font-medium text-warning">
              <CurrencyText amount={forfeited} />
            </dd>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <dt className="flex items-center gap-2 text-muted-foreground">
            <HandCoins className="h-3.5 w-3.5" aria-hidden="true" />
            {t('accounting.payment.tips')}
          </dt>
          <dd className="flex items-center gap-2 font-medium">
            <CurrencyText amount={tips} />
            {canTip && !open ? (
              <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
                {t('accounting.payment.addTip')}
              </Button>
            ) : null}
          </dd>
        </div>
      </dl>
      {open ? (
        <div className="space-y-2 border-t border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">{t('accounting.payment.tipHint')}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="tip-amount">{t('accounting.payment.tipAmount')}</Label>
              <Input id="tip-amount" className="mt-1" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="tip-method">{t('accounting.payment.tipMethod')}</Label>
              <Select
                id="tip-method"
                className="mt-1"
                value={method}
                onChange={(e) => setMethod(e.target.value as TipMethod)}
                options={(['CASH', 'BANK_QR', 'BANK_TRANSFER', 'CREDIT_CARD'] as const).map((m) => ({
                  value: m,
                  label: t(`finance.method.${m}`, { defaultValue: m }),
                }))}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="tip-note">{t('accounting.payment.tipNote')}</Label>
            <Input id="tip-note" className="mt-1" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={submit} disabled={add.isPending || !(Number(amount) > 0)}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
