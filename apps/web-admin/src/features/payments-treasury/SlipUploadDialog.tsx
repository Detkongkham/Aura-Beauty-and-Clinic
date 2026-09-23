import type { PaymentSlipView, PaymentView } from '@abcp/shared-types';
import { ArrowLeft, ImagePlus, Loader2, ReceiptText, Search, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

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
import { Select } from '@/components/ui/select';
import { usePayments } from '@/features/finance/finance.api';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { maskAccount } from './treasury.lib';
import { usePaymentBankAccounts, useUploadSlip } from './treasury.api';

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'] as const;
type Accepted = (typeof ACCEPT)[number];
/** Server cap is 8MB of image bytes; base64 inflates ~1.33× and the slip route accepts that. */
const MAX_BYTES = 8 * 1024 * 1024;

/** Raw base64 of the original file — not re-encoded, so the server still sees EXIF (edited-photo check). */
function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('read-failed'));
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.readAsDataURL(file);
  });
}

/**
 * S12 — staff upload a transfer slip for a bill: the customer sent a screenshot on LINE/WhatsApp or showed
 * it at the counter. Pick the bill (search by name / receipt no.), say how much was sent, attach the image
 * (choose, drop or paste), and it enters the same OCR + review queue as customer uploads.
 */
export function SlipUploadDialog({
  open,
  onOpenChange,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onUploaded: (slip: PaymentSlipView) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const debounced = useDebounce(q.trim(), 300);
  const [bill, setBill] = useState<PaymentView | null>(null);
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUploadSlip();

  useEffect(() => {
    if (!open) {
      setQ('');
      setBill(null);
      setFile(null);
    }
  }, [open]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (bill) {
      setAmount(String(bill.balanceAmount));
      setAccountId('');
    }
  }, [bill]);

  const list = usePayments({ branchId: 'all', q: debounced || undefined, page: 1, pageSize: 20 });
  const bills = useMemo(
    () =>
      (list.data?.items ?? []).filter(
        (p) => p.balanceAmount > 0 && p.paymentStatus !== 'VOIDED' && p.paymentStatus !== 'REFUNDED',
      ),
    [list.data],
  );
  const accountsQ = usePaymentBankAccounts(bill?.id ?? null);
  const accounts = accountsQ.data ?? [];
  const depositLeft = bill ? Math.max(0, bill.depositAmount - bill.paidAmount) : 0;

  function take(f: File | null | undefined) {
    if (!f) return;
    if (!(ACCEPT as readonly string[]).includes(f.type)) {
      toast.error(t('payTreasury.slips.upload.badType'));
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error(t('payTreasury.slips.upload.tooBig'));
      return;
    }
    setFile(f);
  }

  const amountNum = Number(amount);
  const amountOk = Number.isFinite(amountNum) && amountNum > 0 && (!bill || amountNum <= bill.balanceAmount + 0.01);

  async function submit() {
    if (!bill || !file || !amountOk) return;
    try {
      const dataBase64 = await readBase64(file);
      upload.mutate(
        {
          paymentId: bill.id,
          input: {
            contentType: file.type as Accepted,
            dataBase64,
            amount: amountNum,
            ...(accountId ? { bankAccountId: accountId } : {}),
          },
        },
        {
          onSuccess: (slip) => {
            toast.success(t('payTreasury.slips.upload.done'));
            onUploaded(slip);
            onOpenChange(false);
          },
          onError: (err) => toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
        },
      );
    } catch {
      toast.error(t('payTreasury.slips.upload.readFailed'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[560px]"
        onPaste={(e) => {
          const item = [...e.clipboardData.items].find((i) => i.type.startsWith('image/'));
          if (item && bill) take(item.getAsFile());
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('payTreasury.slips.upload.title')}</DialogTitle>
          <DialogDescription>
            {t(bill ? 'payTreasury.slips.upload.stepSlip' : 'payTreasury.slips.upload.stepBill')}
          </DialogDescription>
        </DialogHeader>

        {!bill ? (
          <div className="grid gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                autoFocus
                className="h-9 pl-8"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('payTreasury.slips.upload.search')}
                aria-label={t('payTreasury.slips.upload.search')}
              />
            </div>
            <ul className="max-h-[320px] overflow-y-auto rounded-lg border border-border" aria-label={t('payTreasury.slips.upload.bills')}>
              {list.isLoading ? (
                <li className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                </li>
              ) : bills.length === 0 ? (
                <li className="p-6 text-center text-sm text-muted-foreground">{t('payTreasury.slips.upload.noBills')}</li>
              ) : (
                bills.map((p) => (
                  <li key={p.id} className="border-b border-border/70 last:border-0">
                    <button
                      type="button"
                      onClick={() => setBill(p)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none hover:bg-muted/50 focus-visible:bg-muted/60"
                    >
                      <ReceiptText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.customerName ?? '—'}</span>
                        <span className="block truncate text-2xs text-muted-foreground">
                          {p.branchName} · {formatDate(p.createdAt)} · {t(`payTreasury.slips.upload.status.${p.paymentStatus}`)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <CurrencyText amount={p.balanceAmount} currency={p.currency as 'LAK'} className="block text-sm font-semibold tabular-nums" />
                        <span className="text-[10px] text-muted-foreground">
                          {t('payTreasury.slips.upload.ofTotal', { total: formatCurrency(p.totalAmount, p.currency as 'LAK') })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setBill(null)} aria-label={t('common.back')}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </Button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{bill.customerName ?? '—'}</p>
                <p className="truncate text-2xs text-muted-foreground">
                  {bill.branchName} · {t('payTreasury.slips.billBalance')}{' '}
                  {formatCurrency(bill.balanceAmount, bill.currency as 'LAK')}
                </p>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="su-amount">{t('payTreasury.slips.upload.amount')}</Label>
              <Input
                id="su-amount"
                type="number"
                inputMode="decimal"
                className="h-9 tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={!amountOk}
              />
              <div className="flex flex-wrap gap-1.5">
                <QuickAmount label={t('payTreasury.slips.upload.fullOwed')} value={bill.balanceAmount} currency={bill.currency} onPick={setAmount} active={amountNum === bill.balanceAmount} />
                {depositLeft > 0 && depositLeft !== bill.balanceAmount ? (
                  <QuickAmount label={t('payTreasury.slips.bill.deposit')} value={depositLeft} currency={bill.currency} onPick={setAmount} active={amountNum === depositLeft} />
                ) : null}
              </div>
              {!amountOk ? <p className="text-2xs text-destructive">{t('payTreasury.slips.upload.amountInvalid')}</p> : null}
            </div>

            {accounts.length > 1 ? (
              <div className="grid gap-1.5">
                <Label htmlFor="su-acct">{t('payTreasury.slips.targetPick')}</Label>
                <Select
                  id="su-acct"
                  className="h-9"
                  value={accountId}
                  placeholder={t('payTreasury.slips.upload.anyAccount')}
                  onChange={(e) => setAccountId(e.target.value)}
                  options={accounts.map((a) => ({ value: a.id, label: `${a.bank.code} · ${a.accountName} · ${maskAccount(a.accountNumber)}` }))}
                />
              </div>
            ) : null}

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                take(e.dataTransfer.files[0]);
              }}
              className={cn(
                'relative flex min-h-[180px] items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors',
                dragging ? 'border-primary bg-primary/5' : 'border-border',
              )}
            >
              {preview ? (
                <>
                  <img src={preview} alt={t('payTreasury.slips.imageAlt')} className="max-h-[260px] object-contain" />
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-card/90 shadow outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={t('payTreasury.slips.upload.remove')}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex flex-col items-center gap-1.5 p-6 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ImagePlus className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm font-medium">{t('payTreasury.slips.upload.drop')}</span>
                  <span className="text-2xs text-muted-foreground">{t('payTreasury.slips.upload.dropHint')}</span>
                </button>
              )}
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT.join(',')}
                className="sr-only"
                aria-label={t('payTreasury.slips.upload.drop')}
                onChange={(e) => take(e.target.files?.[0])}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!bill || !file || !amountOk || upload.isPending} onClick={() => void submit()}>
            {upload.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Upload className="mr-1 h-4 w-4" aria-hidden="true" />
            )}
            {t('payTreasury.slips.upload.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuickAmount({
  label,
  value,
  currency,
  onPick,
  active,
}: {
  label: string;
  value: number;
  currency: string;
  onPick: (v: string) => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onPick(String(value))}
      className={cn(
        'rounded-full border px-2.5 py-1 text-2xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted',
      )}
    >
      {label} · {formatCurrency(value, currency as 'LAK')}
    </button>
  );
}
