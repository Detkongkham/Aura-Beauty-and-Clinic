import { useState, type ReactNode } from 'react';
import dayjs from 'dayjs';
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarCheck2,
  CalendarPlus,
  Check,
  CheckCircle2,
  CircleDashed,
  Coins,
  Copy,
  Hash,
  Hourglass,
  Layers,
  MapPin,
  PiggyBank,
  ReceiptText,
  Timer,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import type { PaymentStatus, PaymentView } from '@abcp/shared-types';

import { CurrencyText, DateTimeText } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/useAuth';
import { ROUTES } from '@/router/paths';
import { cn } from '@/lib/utils';

import { usePayment } from './finance.api';
import { ReceiptDialog } from './ReceiptDialog';
import { RecordPaymentPanel } from './RecordPaymentPanel';
import { RefundPanel } from './RefundPanel';
import { PAYMENT_STATUS_VARIANT, paymentMethodKey, paymentMethodsOf, paymentStatusKey } from './finance.lib';
import { METHOD_COLOR, METHOD_ICON } from './finance.methods';

interface Props {
  paymentId: string | null;
  onClose: () => void;
}

type Money = 'LAK' | 'THB' | 'USD';

/** Hero wash per status — the badge still spells the status out. */
const STATUS_HERO: Record<PaymentStatus, string> = {
  FULLY_PAID: 'from-success/15',
  DEPOSIT_PAID: 'from-info/15',
  PENDING: 'from-warning/15',
  REFUNDED: 'from-muted-foreground/15',
  FAILED: 'from-destructive/15',
  VOIDED: 'from-muted-foreground/10',
};

/** Status the stored amounts imply — used to flag bills whose status drifted from their tenders. */
function impliedStatus(p: PaymentView): PaymentStatus | null {
  if (p.paymentStatus === 'REFUNDED' || p.paymentStatus === 'FAILED' || p.paymentStatus === 'VOIDED') return null;
  if (p.totalAmount > 0 && p.balanceAmount <= 0) return 'FULLY_PAID';
  if (p.paidAmount > 0) return 'DEPOSIT_PAID';
  return 'PENDING';
}

function useCopy() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy(key: string, text: string) {
      if (!navigator.clipboard) return;
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopied(key);
          toast.success(t('finance.detail.copied'));
          window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
        })
        .catch(() => undefined);
    },
  };
}

export function PaymentDetailSheet({ paymentId, onClose }: Props) {
  const { t } = useTranslation();
  const { data, isLoading } = usePayment(paymentId);
  const { copied, copy } = useCopy();
  const canRecord = useAuth().hasPermission('finance:manage');
  const [receiptId, setReceiptId] = useState<string | null>(null);

  return (
    <Sheet open={Boolean(paymentId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="gap-0 p-0">
        <SheetHeader className="pr-10">
          <SheetTitle>{t('finance.detail.title')}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex items-center gap-1.5">
              {data ? (
                <button
                  type="button"
                  onClick={() => copy('id', data.id)}
                  className="inline-flex min-h-6 items-center gap-1 rounded-md px-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={t('finance.detail.copyId')}
                >
                  <Hash className="h-3 w-3" aria-hidden="true" />
                  {data.id.slice(0, 8).toUpperCase()}
                  {copied === 'id' ? (
                    <Check className="h-3 w-3 text-success" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3 w-3" aria-hidden="true" />
                  )}
                </button>
              ) : (
                <span className="h-4" />
              )}
            </div>
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="py-5">
          {isLoading || !data ? (
            <div className="space-y-3">
              <Skeleton className="h-44 w-full rounded-xl" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-28 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <div className="space-y-5">
              {canRecord && data.balanceAmount > 0 && data.paymentStatus !== 'REFUNDED' && data.paymentStatus !== 'FAILED' && data.paymentStatus !== 'VOIDED' ? (
                <RecordPaymentPanel key={data.id} payment={data} />
              ) : null}
              <DetailBody payment={data} copied={copied} copy={copy} />
              <RefundPanel key={`r-${data.id}`} payment={data} />
            </div>
          )}
        </SheetBody>

        {data?.appointmentId || data?.invoiceNo ? (
          <SheetFooter>
            {data.invoiceNo ? (
              <Button variant="secondary" onClick={() => setReceiptId(data.id)}>
                <ReceiptText className="mr-1 h-4 w-4" aria-hidden="true" />
                {t('finance.receipt.open')}
              </Button>
            ) : null}
            {data.appointmentId ? (
            <Button asChild variant="secondary">
              <Link to={ROUTES.appointmentDetail(data.appointmentId)} onClick={onClose}>
                {t('finance.detail.openAppointment')}
                <ArrowUpRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            ) : null}
          </SheetFooter>
        ) : null}
        <ReceiptDialog paymentId={receiptId} onClose={() => setReceiptId(null)} />
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  payment: p,
  copied,
  copy,
}: {
  payment: PaymentView;
  copied: string | null;
  copy: (key: string, text: string) => void;
}) {
  const { t } = useTranslation();
  const currency = (p.currency ?? 'LAK') as Money;
  const name = p.customerName ?? t('finance.recent.walkIn');
  const hero = STATUS_HERO[p.paymentStatus];

  const pct = (n: number) => (p.totalAmount > 0 ? Math.min(100, Math.round((n / p.totalAmount) * 100)) : 0);
  const paidPct = pct(p.paidAmount);
  const depositPct = pct(p.depositAmount);
  const depositCovered = Math.min(p.paidAmount, p.depositAmount);
  const depositSeg = pct(depositCovered);
  const restSeg = Math.max(0, paidPct - depositSeg);

  const implied = impliedStatus(p);
  const statusDrift = implied !== null && implied !== p.paymentStatus;
  const settleDays = p.paidAt ? Math.max(0, dayjs(p.paidAt).diff(dayjs(p.createdAt), 'day')) : null;
  const methods = paymentMethodsOf(p);
  const successTx = p.transactions.filter((tx) => tx.status === 'SUCCESS');

  let running = 0;
  const timeline = p.transactions.map((tx) => {
    if (tx.status === 'SUCCESS') running += tx.amount;
    return { tx, cumulative: running };
  });

  return (
    <div className="space-y-5">
      {/* Hero ---------------------------------------------------------- */}
      <section
        className={cn(
          'relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br via-card to-card p-4 shadow-sm',
          'animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out motion-reduce:animate-none',
          hero,
        )}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl"
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-3">
          <PersonAvatar name={name} size={44} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
            <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
              {p.branchName}
            </p>
          </div>
          <Badge variant={PAYMENT_STATUS_VARIANT[p.paymentStatus]} className="shrink-0">
            {t(paymentStatusKey(p.paymentStatus))}
          </Badge>
        </div>

        <div className="relative mt-5 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t('finance.detail.total')}</p>
            <CurrencyText
              amount={p.totalAmount}
              currency={currency}
              className="block text-[28px] font-semibold leading-tight tracking-tight text-foreground"
            />
          </div>
          <span className="shrink-0 rounded-md border border-border bg-card/70 px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">
            {currency}
          </span>
        </div>

        {/* Segmented progress: deposit part · rest paid · still owed */}
        <div className="relative mt-4 space-y-2">
          <div
            className="relative flex h-2.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={paidPct}
            aria-label={t('finance.detail.progress', { pct: paidPct })}
          >
            <span
              className="h-full bg-info transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${depositSeg}%` }}
            />
            <span
              className="h-full bg-success transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${restSeg}%` }}
            />
            {depositPct > 0 && depositPct < 100 ? (
              <span
                className="absolute inset-y-0 w-0.5 bg-card"
                style={{ left: `${depositPct}%` }}
                aria-hidden="true"
              />
            ) : null}
          </div>
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
            <LegendDot className="bg-info" label={t('finance.detail.legendDeposit', { pct: depositPct })} />
            <LegendDot className="bg-success" label={t('finance.detail.legendPaid', { pct: paidPct })} />
            {p.balanceAmount > 0 ? (
              <LegendDot className="bg-muted-foreground/40" label={t('finance.detail.legendOwed', { pct: 100 - paidPct })} />
            ) : null}
          </ul>
        </div>
      </section>

      {statusDrift && implied ? (
        <div
          role="status"
          className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-xs text-warning"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t('finance.detail.driftTitle')}</p>
            <p className="mt-0.5 text-foreground/80">
              {t('finance.detail.driftBody', {
                status: t(paymentStatusKey(p.paymentStatus)),
                implied: t(paymentStatusKey(implied)),
              })}
            </p>
          </div>
        </div>
      ) : null}

      {/* Money figures ------------------------------------------------- */}
      <div className="grid grid-cols-3 gap-2">
        <Figure icon={Wallet} label={t('finance.detail.paid')} amount={p.paidAmount} currency={currency} tone="success" />
        <Figure icon={PiggyBank} label={t('finance.detail.deposit')} amount={p.depositAmount} currency={currency} tone="info" />
        <Figure
          icon={Hourglass}
          label={t('finance.detail.balance')}
          amount={p.balanceAmount}
          currency={currency}
          tone={p.balanceAmount > 0 ? 'warning' : 'muted'}
        />
      </div>

      {/* Bill facts ---------------------------------------------------- */}
      <section className="overflow-hidden rounded-xl border border-border">
        <SectionTitle>{t('finance.detail.info')}</SectionTitle>
        <dl className="divide-y divide-border">
          <InfoRow icon={CalendarPlus} label={t('finance.detail.created')}>
            <DateTimeText value={p.createdAt} mode="datetime" />
          </InfoRow>
          <InfoRow icon={CalendarCheck2} label={t('finance.detail.settled')}>
            {p.paidAt ? <DateTimeText value={p.paidAt} mode="datetime" /> : <span className="text-muted-foreground">—</span>}
          </InfoRow>
          {settleDays !== null ? (
            <InfoRow icon={Timer} label={t('finance.detail.settleTime')}>
              {settleDays === 0 ? t('finance.detail.sameDay') : t('finance.detail.days', { count: settleDays })}
            </InfoRow>
          ) : null}
          <InfoRow icon={p.bookingGroupId ? Users : ReceiptText} label={t('finance.detail.source')}>
            {p.bookingGroupId ? t('finance.detail.sourceGroup') : t('finance.detail.sourceAppointment')}
          </InfoRow>
          <InfoRow icon={Layers} label={t('finance.detail.methodsUsed')}>
            {methods.length === 0 ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span className="inline-flex flex-wrap justify-end gap-1">
                {methods.map((m) => {
                  const Icon = METHOD_ICON[m];
                  return (
                    <span
                      key={m}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-2xs"
                    >
                      <Icon className={cn('h-3 w-3', METHOD_COLOR[m].text)} aria-hidden="true" />
                      {t(paymentMethodKey(m))}
                    </span>
                  );
                })}
              </span>
            )}
          </InfoRow>
          <InfoRow icon={Coins} label={t('finance.detail.tenderCount')}>
            {t('finance.detail.tenderCountValue', { ok: successTx.length, total: p.transactions.length })}
          </InfoRow>
        </dl>
      </section>

      {/* Tender timeline ----------------------------------------------- */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <ReceiptText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            {t('finance.detail.tenders')}
            <span className="font-normal text-muted-foreground">({p.transactions.length})</span>
          </p>
          {p.transactions.length > 0 ? (
            <span className="text-2xs text-muted-foreground">{t('finance.detail.oldestFirst')}</span>
          ) : null}
        </div>

        {p.transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-border px-3 py-6 text-center">
            <CircleDashed className="h-5 w-5 text-muted-foreground/60" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t('finance.detail.noTenders')}</p>
          </div>
        ) : (
          <ol className="relative space-y-3 pl-6 before:absolute before:bottom-3 before:left-[9px] before:top-3 before:w-px before:bg-border">
            {timeline.map(({ tx, cumulative }, i) => {
              const Icon = METHOD_ICON[tx.method];
              const ok = tx.status === 'SUCCESS';
              const share = p.totalAmount > 0 ? Math.round((tx.amount / p.totalAmount) * 100) : 0;
              return (
                <li
                  key={tx.id}
                  className="relative animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
                  style={{ animationDelay: `${80 + i * 50}ms` }}
                >
                  <span
                    className={cn(
                      'absolute -left-6 top-3 flex h-[19px] w-[19px] items-center justify-center rounded-full bg-card ring-4 ring-card',
                      ok ? 'text-success' : 'text-warning',
                    )}
                    aria-hidden="true"
                  >
                    {ok ? <CheckCircle2 className="h-[18px] w-[18px]" /> : <CircleDashed className="h-[18px] w-[18px]" />}
                  </span>

                  <div className="rounded-xl border border-border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted',
                            METHOD_COLOR[tx.method].text,
                          )}
                        >
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                            {t(paymentMethodKey(tx.method))}
                            <Badge variant={ok ? 'success' : 'warning'} className="text-[10px]">
                              {ok ? t('finance.detail.txSuccess') : tx.status}
                            </Badge>
                          </p>
                          <p className="text-2xs text-muted-foreground">
                            <DateTimeText value={tx.createdAt} mode="datetime" />
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <CurrencyText
                          amount={tx.amount}
                          currency={(tx.currency ?? currency) as Money}
                          className={cn('block text-sm font-semibold', !ok && 'text-muted-foreground line-through')}
                        />
                        <span className="text-2xs tabular-nums text-muted-foreground">
                          {t('finance.detail.shareOfBill', { pct: share })}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-border pt-2 text-2xs text-muted-foreground">
                      <span>
                        {t('finance.detail.runningTotal')}{' '}
                        <CurrencyText amount={cumulative} currency={currency} className="font-medium text-foreground" />
                        {' / '}
                        <CurrencyText amount={p.totalAmount} currency={currency} />
                      </span>
                      {tx.qrReference ? (
                        <button
                          type="button"
                          onClick={() => copy(tx.id, tx.qrReference!)}
                          className="inline-flex min-h-6 items-center gap-1 rounded-md px-1 font-mono transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={t('finance.detail.copyRef')}
                        >
                          {tx.qrReference}
                          {copied === tx.id ? (
                            <Check className="h-3 w-3 text-success" aria-hidden="true" />
                          ) : (
                            <Copy className="h-3 w-3" aria-hidden="true" />
                          )}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span className={cn('h-2 w-2 rounded-full', className)} aria-hidden="true" />
      {label}
    </li>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <p className="border-b border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground">{children}</p>
  );
}

function InfoRow({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-xs">
      <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </dt>
      <dd className="min-w-0 text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}

const FIGURE_TONE = {
  success: { chip: 'bg-success-soft text-success', value: 'text-success', box: 'border-border' },
  info: { chip: 'bg-info-soft text-info', value: 'text-foreground', box: 'border-border' },
  warning: { chip: 'bg-warning/15 text-warning', value: 'text-warning', box: 'border-warning/30 bg-warning-soft' },
  muted: { chip: 'bg-muted text-muted-foreground', value: 'text-muted-foreground', box: 'border-border' },
} as const;

function Figure({
  icon: Icon,
  label,
  amount,
  currency,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  amount: number;
  currency: Money;
  tone: keyof typeof FIGURE_TONE;
}) {
  const c = FIGURE_TONE[tone];
  return (
    <div className={cn('rounded-xl border p-2.5', c.box)}>
      <div className="flex items-center gap-1.5">
        <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded-md', c.chip)}>
          <Icon className="h-3 w-3" aria-hidden="true" />
        </span>
        <p className="truncate text-2xs text-muted-foreground">{label}</p>
      </div>
      <CurrencyText amount={amount} currency={currency} className={cn('mt-1 block truncate text-sm font-semibold', c.value)} />
    </div>
  );
}
