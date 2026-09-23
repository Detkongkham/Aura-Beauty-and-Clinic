import { useState } from 'react';
import { Ban, Check, RotateCcw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { PaymentView, RefundView } from '@abcp/shared-types';

import { CurrencyText, DateTimeText } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { NormalizedApiError } from '@/services/apiError';
import { useAuth } from '@/features/auth/useAuth';

import { useCreateRefund, useRefundAction, useRefunds, useVoidPayment } from './finance.api';

type Money = 'LAK' | 'THB' | 'USD';
const errMsg = (e: unknown, fallback: string) => (e instanceof NormalizedApiError ? e.message : fallback);

const STATUS_VARIANT = { PENDING: 'warning', APPROVED: 'info', PAID: 'success', REJECTED: 'neutral' } as const;

/**
 * Wave 10B — ຂໍຄືນເງິນ / ອະນຸມັດ / ຈ່າຍ / void ໃນ PaymentDetailSheet (ສິດ payments:refund).
 * ຮອງຮັບບິນຊື້ບັດຂອງຂວັນ/ແພັກເກັດ (ຂອບເຂດກວດຢູ່ server) + ຄືນສິດແພັກເກັດ 1 ຄັ້ງ ສຳລັບນັດທີ່ຈ່າຍດ້ວຍຄອສ.
 */
export function RefundPanel({ payment: p }: { payment: PaymentView }) {
  const { t } = useTranslation();
  const { hasPermission, user } = useAuth();
  const canRefund = hasPermission('payments:refund');
  const currency = (p.currency ?? 'LAK') as Money;
  const list = useRefunds({ paymentId: p.id, page: 1, pageSize: 50 });
  const create = useCreateRefund(p.id);
  const act = useRefundAction();
  const voidM = useVoidPayment(p.id);

  const [open, setOpen] = useState<'refund' | 'void' | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<'ORIGINAL_TENDER' | 'CASH' | 'BANK_TRANSFER'>('ORIGINAL_TENDER');
  const [returnUnit, setReturnUnit] = useState(false);

  const refunds = list.data?.items ?? [];
  const paid = p.paymentStatus === 'FULLY_PAID' || p.paymentStatus === 'DEPOSIT_PAID';
  const canVoid = p.paymentStatus === 'PENDING' && p.paidAmount === 0;
  // ຄືນສິດແພັກເກັດ: ບິນຄ່າບໍລິການ (ນັດ) — server ກວດວ່ານັດໃຊ້ສິດແພັກເກັດ/ຈ່າຍດ້ວຍຄອສແທ້ບໍ່.
  const canReturnUnit = Boolean(p.appointmentId) || p.transactions.some((x) => x.method === 'PACKAGE_CREDIT');
  if (!canRefund && refunds.length === 0) return null;
  if (!paid && !canVoid && refunds.length === 0) return null;

  function submitRefund() {
    const value = Number(amount.replace(/[^0-9.]/g, '')) || 0;
    if (!(value > 0 || returnUnit) || reason.trim().length < 3) return;
    create.mutate(
      { amount: value, reason: reason.trim(), method, returnPackageUnit: returnUnit },
      {
        onSuccess: () => {
          toast.success(t('finance.refund.requested'));
          setOpen(null);
          setAmount('');
          setReason('');
          setReturnUnit(false);
        },
        onError: (e) => toast.error(errMsg(e, t('common.saveError'))),
      },
    );
  }

  function submitVoid() {
    if (reason.trim().length < 3) return;
    voidM.mutate(reason.trim(), {
      onSuccess: () => {
        toast.success(t('finance.refund.voided'));
        setOpen(null);
        setReason('');
      },
      onError: (e) => toast.error(errMsg(e, t('common.saveError'))),
    });
  }

  function run(r: RefundView, action: 'approve' | 'reject' | 'pay') {
    let rejectReason: string | undefined;
    if (action === 'reject') {
      rejectReason = window.prompt(t('finance.refund.rejectPrompt')) ?? undefined;
      if (!rejectReason || rejectReason.trim().length < 3) return;
    }
    act.mutate(
      { id: r.id, action, reason: rejectReason?.trim() },
      {
        onSuccess: () => toast.success(t(`finance.refund.done.${action}`)),
        onError: (e) => toast.error(errMsg(e, t('common.saveError'))),
      },
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <h3 className="text-xs font-semibold">{t('finance.refund.title')}</h3>
        {canRefund ? (
          <div className="flex gap-1.5">
            {paid ? (
              <Button size="sm" variant="secondary" className="h-7 gap-1 px-2 text-xs" onClick={() => setOpen(open === 'refund' ? null : 'refund')}>
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                {t('finance.refund.request')}
              </Button>
            ) : null}
            {canVoid ? (
              <Button size="sm" variant="secondary" className="h-7 gap-1 px-2 text-xs text-destructive" onClick={() => setOpen(open === 'void' ? null : 'void')}>
                <Ban className="h-3 w-3" aria-hidden="true" />
                {t('finance.refund.void')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {p.refundedAmount > 0 ? (
        <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          {t('finance.refund.refundedSoFar')}: <CurrencyText amount={p.refundedAmount} currency={currency} className="font-semibold text-foreground" />
        </p>
      ) : null}

      {open === 'refund' ? (
        <div className="space-y-2 border-b border-border p-3">
          <Input inputMode="numeric" placeholder={t('finance.refund.amount')} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t('finance.refund.amount')} />
          <Select
            value={method}
            onChange={(e) => setMethod(e.target.value as typeof method)}
            options={[
              { value: 'ORIGINAL_TENDER', label: t('finance.refund.method.ORIGINAL_TENDER') },
              { value: 'CASH', label: t('finance.refund.method.CASH') },
              { value: 'BANK_TRANSFER', label: t('finance.refund.method.BANK_TRANSFER') },
            ]}
            aria-label={t('finance.refund.methodLabel')}
          />
          <Input placeholder={t('finance.refund.reason')} value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('finance.refund.reason')} />
          {canReturnUnit ? (
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={returnUnit} onChange={(e) => setReturnUnit(e.target.checked)} />
              {t('finance.refund.returnPackageUnit')}
            </label>
          ) : null}
          <p className="text-2xs text-muted-foreground">{t('finance.refund.hint')}</p>
          <p className="text-2xs text-muted-foreground">{t('finance.refund.saleHint')}</p>
          <Button size="sm" onClick={submitRefund} disabled={create.isPending}>{t('finance.refund.submit')}</Button>
        </div>
      ) : null}

      {open === 'void' ? (
        <div className="space-y-2 border-b border-border p-3">
          <Input placeholder={t('finance.refund.reason')} value={reason} onChange={(e) => setReason(e.target.value)} aria-label={t('finance.refund.reason')} />
          <p className="text-2xs text-muted-foreground">{t('finance.refund.voidHint')}</p>
          <Button size="sm" variant="danger" onClick={submitVoid} disabled={voidM.isPending}>{t('finance.refund.voidConfirm')}</Button>
        </div>
      ) : null}

      <ul className="divide-y divide-border">
        {refunds.map((r) => (
          <li key={r.id} className="space-y-1.5 px-3 py-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold tabular-nums">
                <CurrencyText amount={r.totalAmount} currency={currency} />
              </span>
              <Badge variant={STATUS_VARIANT[r.status]}>{t(`finance.refund.status.${r.status}`)}</Badge>
            </div>
            <p className="text-muted-foreground">
              {r.reason} · {r.requestedByName ?? '—'} · <DateTimeText value={r.createdAt} mode="datetime" />
            </p>
            {r.storeCreditAmount > 0 ? (
              <p className="text-2xs text-muted-foreground">
                {t('finance.refund.split', { store: r.storeCreditAmount.toLocaleString(), payout: r.amount.toLocaleString() })}
              </p>
            ) : null}
            {r.packageUnitReturned ? <p className="text-2xs text-muted-foreground">{t('finance.refund.unitReturned')}</p> : null}
            {r.billKind !== 'SERVICE' ? <p className="text-2xs text-muted-foreground">{t(`finance.refund.billKind.${r.billKind}`)}</p> : null}
            {r.creditNoteNo ? <p className="font-mono text-2xs text-muted-foreground">{r.creditNoteNo}</p> : null}
            {r.rejectedReason ? <p className="text-2xs text-destructive">{r.rejectedReason}</p> : null}
            {canRefund && (r.status === 'PENDING' || r.status === 'APPROVED') ? (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {r.status === 'PENDING' ? (
                  <Button
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={act.isPending || (r.requestedById === user?.id && user?.role !== 'SUPER_ADMIN')}
                    title={r.requestedById === user?.id && user?.role !== 'SUPER_ADMIN' ? t('finance.refund.selfApprove') : undefined}
                    onClick={() => run(r, 'approve')}
                  >
                    <Check className="h-3 w-3" aria-hidden="true" />
                    {t('finance.refund.approve')}
                  </Button>
                ) : (
                  <Button size="sm" className="h-7 px-2 text-xs" disabled={act.isPending} onClick={() => run(r, 'pay')}>
                    {t('finance.refund.markPaid')}
                  </Button>
                )}
                <Button size="sm" variant="secondary" className="h-7 gap-1 px-2 text-xs" disabled={act.isPending} onClick={() => run(r, 'reject')}>
                  <X className="h-3 w-3" aria-hidden="true" />
                  {t('finance.refund.reject')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
