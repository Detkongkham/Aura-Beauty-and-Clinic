import { useState, type FormEvent } from 'react';
import { Banknote, QrCode } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PaymentView } from '@abcp/shared-types';

import { CurrencyText } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import { useRecordTender } from './finance.api';

type Method = 'CASH' | 'BCEL_ONE_QR';
type Money = 'LAK' | 'THB' | 'USD';

const METHODS: { value: Method; icon: typeof Banknote }[] = [
  { value: 'CASH', icon: Banknote },
  { value: 'BCEL_ONE_QR', icon: QrCode },
];

/** ບັນທຶກການຮັບເງິນໜ້າຮ້ານ — ສະແດງເມື່ອບິນຍັງມີຍອດຄ້າງ ແລະ ຜູ້ໃຊ້ມີສິດ finance:manage. */
export function RecordPaymentPanel({ payment: p }: { payment: PaymentView }) {
  const { t } = useTranslation();
  const record = useRecordTender(p.id);
  const currency = (p.currency ?? 'LAK') as Money;

  const [method, setMethod] = useState<Method>('CASH');
  const [amount, setAmount] = useState<string>(String(p.balanceAmount));
  const [reference, setReference] = useState('');

  const value = Number(amount.replace(/[^0-9.]/g, ''));
  const overpay = value > p.balanceAmount + 0.01;
  const needsRef = method === 'BCEL_ONE_QR' && !reference.trim();
  // ເງິນສົດເກີນ = ທອນເງິນ (ບັນທຶກແຕ່ຍອດຄ້າງ); QR ເກີນ = ຜິດ.
  const invalid = !(value > 0) || (overpay && method !== 'CASH') || needsRef;
  const change = method === 'CASH' && overpay ? value - p.balanceAmount : 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (invalid) return;
    record.mutate(
      {
        method,
        amount: method === 'CASH' ? Math.min(value, p.balanceAmount) : value,
        ...(method === 'BCEL_ONE_QR' ? { qrReference: reference.trim() } : {}),
      },
      {
        onSuccess: (next) => {
          toast.success(t('finance.record.success'));
          setAmount(String(next.balanceAmount));
          setReference('');
        },
        onError: () => toast.error(t('finance.record.error')),
      },
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-4"
      aria-labelledby="record-payment-title"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p id="record-payment-title" className="text-sm font-semibold text-foreground">
          {t('finance.record.title')}
        </p>
        <span className="text-xs text-muted-foreground">
          {t('finance.record.balance')}{' '}
          <CurrencyText amount={p.balanceAmount} currency={currency} className="font-semibold text-foreground" />
        </span>
      </div>

      <div role="radiogroup" aria-label={t('finance.record.method')} className="grid grid-cols-2 gap-2">
        {METHODS.map(({ value: m, icon: Icon }) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={method === m}
            onClick={() => setMethod(m)}
            className={cn(
              'flex min-h-10 items-center justify-center gap-2 rounded-sm border px-3 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              method === m
                ? 'border-primary bg-card text-foreground shadow-sm'
                : 'border-border bg-transparent text-muted-foreground hover:bg-card',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {t(`finance.method.${m}`)}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="record-amount">{t('finance.record.amount')}</Label>
          <div className="flex gap-2">
            <Input
              id="record-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={overpay && method !== 'CASH'}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAmount(String(p.balanceAmount))}
              className="shrink-0"
            >
              {t('finance.record.full')}
            </Button>
          </div>
        </div>
        {method === 'BCEL_ONE_QR' ? (
          <div className="space-y-1.5">
            <Label htmlFor="record-ref">{t('finance.record.reference')}</Label>
            <Input
              id="record-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="BCEL-…"
              maxLength={64}
              aria-invalid={needsRef}
            />
          </div>
        ) : null}
      </div>

      {overpay ? (
        <p className="text-xs text-warning" role="status">
          {method === 'CASH'
            ? t('finance.record.changeDue', { amount: change.toLocaleString('en-US') })
            : t('finance.record.overpay')}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{t('finance.record.hint')}</p>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={invalid || record.isPending}
      >
        {record.isPending ? t('common.saving') : t('finance.record.submit')}
      </Button>
    </form>
  );
}
