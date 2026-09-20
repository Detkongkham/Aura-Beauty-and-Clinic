import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  CircleSlash,
  Clock3,
  CreditCard,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { AffiliatePayoutView, AffiliateView } from '@abcp/shared-types';

import { CurrencyText, DateTimeText, EmptyState, StatusPill } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { useAffiliatePayouts, useCreatePayout, useSetPayoutStatus } from './referrals.api';

/** Common Lao settlement rails — bank brands stay untranslated, the generic ones are i18n keys. */
const METHOD_PRESETS = ['BCEL One', 'LDB Trust', 'JDB Yes', 'Maruhan Japan Bank'] as const;
const OTHER = '__other__';

type StatusFilter = 'ALL' | AffiliatePayoutView['status'];

const STATUS_VARIANT: Record<AffiliatePayoutView['status'], 'success' | 'danger' | 'warning' | 'info'> = {
  PAID: 'success',
  REJECTED: 'danger',
  PENDING: 'warning',
  PROCESSING: 'info',
};

const STATUS_ICON = {
  PAID: CheckCircle2,
  REJECTED: CircleSlash,
  PENDING: Clock3,
  PROCESSING: Clock3,
} as const;

interface PayoutsSheetProps {
  affiliate: AffiliateView | null;
  onClose: () => void;
  canManage: boolean;
}

/**
 * Per-partner payout console — opens from a table row action or the leaderboard.
 * Top half is the money state (open balance, lifetime earnings, already settled),
 * middle is the "pay this partner" form with quick-fill chips and a live
 * remaining-balance readout, bottom is the payout history as a status timeline
 * with the approve / reject actions inline on anything still pending.
 */
export function PayoutsSheet({ affiliate, onClose, canManage }: PayoutsSheetProps) {
  const { t } = useTranslation();
  const { data: payouts = [], isLoading } = useAffiliatePayouts(affiliate?.id ?? null);
  const createM = useCreatePayout();
  const statusM = useSetPayoutStatus();

  const [amount, setAmount] = useState('');
  const [methodChoice, setMethodChoice] = useState<string>(METHOD_PRESETS[0]);
  const [customMethod, setCustomMethod] = useState('');
  const [account, setAccount] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('ALL');

  // Reset the draft whenever the sheet is pointed at a different partner.
  useEffect(() => {
    setAmount('');
    setAccount('');
    setCustomMethod('');
    setMethodChoice(METHOD_PRESETS[0]);
    setFilter('ALL');
  }, [affiliate?.id]);

  const balance = affiliate?.unpaidBalance ?? 0;
  const parsedAmount = Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const exceeds = amountValid && parsedAmount > balance;
  const remaining = amountValid ? Math.max(0, balance - parsedAmount) : balance;
  const method = methodChoice === OTHER ? customMethod.trim() : methodChoice;

  const settled = useMemo(
    () => payouts.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + p.amount, 0),
    [payouts],
  );
  const pendingCount = payouts.filter((p) => p.status === 'PENDING' || p.status === 'PROCESSING').length;
  const shown = filter === 'ALL' ? payouts : payouts.filter((p) => p.status === filter);

  const FILTERS: StatusFilter[] = ['ALL', 'PENDING', 'PAID', 'REJECTED'];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!affiliate) return;
    if (!amountValid) {
      toast.error(t('referrals.amountInvalid'));
      return;
    }
    if (exceeds) {
      toast.error(t('referrals.payout.exceeds'));
      return;
    }
    if (!method || !account.trim()) {
      toast.error(t('referrals.payout.missingDetails'));
      return;
    }
    createM.mutate(
      { id: affiliate.id, input: { amount: parsedAmount, payoutMethod: method, accountDetails: account.trim() } },
      {
        onSuccess: () => {
          toast.success(t('referrals.payoutCreated'));
          setAmount('');
          setAccount('');
        },
        onError: (err) =>
          toast.error(err instanceof NormalizedApiError ? err.message : t('common.saveError')),
      },
    );
  }

  return (
    <Sheet open={Boolean(affiliate)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[560px]">
        <SheetHeader>
          <div className="flex items-center gap-3 pr-8">
            <PersonAvatar name={affiliate?.userName ?? '—'} size={40} />
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base">{affiliate?.userName ?? '—'}</SheetTitle>
              <p className="truncate text-xs text-muted-foreground">{affiliate?.userPhone}</p>
            </div>
            <Badge variant="primary" className="shrink-0">
              {t('referrals.ratePct', { rate: Math.round((affiliate?.commissionRate ?? 0) * 100) })}
            </Badge>
          </div>
        </SheetHeader>

        <SheetBody className="space-y-4 py-4">
          <div className="grid grid-cols-3 gap-2">
            <SummaryTile
              tone="warning"
              icon={Wallet}
              label={t('referrals.col.unpaid')}
              value={<CurrencyText amount={balance} />}
            />
            <SummaryTile
              tone="success"
              icon={Banknote}
              label={t('referrals.flow.paidOut')}
              value={<CurrencyText amount={settled} />}
            />
            <SummaryTile
              tone="primary"
              icon={CalendarClock}
              label={t('referrals.payout.count')}
              value={<span className="tabular-nums">{payouts.length}</span>}
              hint={pendingCount > 0 ? t('referrals.payout.pendingCount', { count: pendingCount }) : undefined}
            />
          </div>

          {canManage ? (
            <form
              className="space-y-3 rounded-lg border border-border bg-muted/30 p-3"
              onSubmit={submit}
            >
              <div className="flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <p className="text-xs font-semibold text-foreground">{t('referrals.newPayout')}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="payout-amount">{t('referrals.amount')}</Label>
                <Input
                  id="payout-amount"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={exceeds || undefined}
                  aria-describedby="payout-amount-hint"
                  disabled={balance <= 0}
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  {[0.25, 0.5, 1].map((f) => (
                    <button
                      key={f}
                      type="button"
                      disabled={balance <= 0}
                      onClick={() => setAmount(String(Math.round(balance * f)))}
                      className="cursor-pointer rounded-full border border-border bg-card px-2 py-0.5 text-2xs font-medium text-muted-foreground transition-colors duration-150 hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {f === 1 ? t('referrals.payout.full') : `${f * 100}%`}
                    </button>
                  ))}
                  <span
                    id="payout-amount-hint"
                    className={cn('text-2xs', exceeds ? 'text-destructive' : 'text-muted-foreground')}
                    role={exceeds ? 'alert' : undefined}
                  >
                    {exceeds
                      ? t('referrals.payout.exceeds')
                      : t('referrals.payout.remaining', { amount: formatCurrency(remaining) })}
                  </span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="payout-method">{t('referrals.methodLabel')}</Label>
                  <Select
                    id="payout-method"
                    className="h-9"
                    value={methodChoice}
                    onChange={(e) => setMethodChoice(e.target.value)}
                    options={[
                      ...METHOD_PRESETS.map((m) => ({ value: m, label: m })),
                      { value: t('referrals.payout.cash'), label: t('referrals.payout.cash') },
                      { value: OTHER, label: t('referrals.payout.otherMethod') },
                    ]}
                  />
                  {methodChoice === OTHER ? (
                    <Input
                      value={customMethod}
                      onChange={(e) => setCustomMethod(e.target.value)}
                      placeholder={t('referrals.method')}
                      aria-label={t('referrals.methodLabel')}
                    />
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="payout-account">{t('referrals.accountLabel')}</Label>
                  <Input
                    id="payout-account"
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                    placeholder={t('referrals.accountPlaceholder')}
                  />
                </div>
              </div>

              <Button
                type="submit"
                size="sm"
                className="w-full"
                disabled={createM.isPending || balance <= 0 || exceeds || !amountValid}
              >
                {t('referrals.createPayout')}
              </Button>
              {balance <= 0 ? (
                <p className="text-2xs text-muted-foreground">{t('referrals.payout.noBalance')}</p>
              ) : null}
            </form>
          ) : null}

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">{t('referrals.payout.history')}</p>
              <div className="flex items-center gap-1">
                {FILTERS.map((f) => {
                  const isActive = filter === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      aria-pressed={isActive}
                      className={cn(
                        'cursor-pointer rounded-full px-2 py-0.5 text-2xs font-medium transition-colors duration-150',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {f === 'ALL' ? t('referrals.filter.all') : t(`referrals.status.${f}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-[74px] animate-pulse rounded-lg border border-border bg-muted/40" />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <EmptyState icon={Wallet} title={t('referrals.noPayouts')} className="py-8" />
            ) : (
              <ol className="space-y-2">
                {shown.map((p, i) => {
                  const Icon = STATUS_ICON[p.status];
                  const variant = STATUS_VARIANT[p.status];
                  return (
                    <li
                      key={p.id}
                      className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <span
                              className={cn(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
                                variant === 'success' && 'bg-success-soft text-success',
                                variant === 'danger' && 'bg-destructive-soft text-destructive',
                                variant === 'warning' && 'bg-warning-soft text-warning',
                                variant === 'info' && 'bg-info-soft text-info',
                              )}
                            >
                              <Icon className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                              <CurrencyText amount={p.amount} className="block text-sm font-semibold" />
                              <p className="truncate text-xs text-muted-foreground">
                                {p.payoutMethod} · {p.accountDetails}
                              </p>
                            </div>
                          </div>
                          <StatusPill
                            status={p.status}
                            variant={variant}
                            label={t(`referrals.status.${p.status}`)}
                            className="shrink-0"
                          />
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" aria-hidden="true" />
                            {t('referrals.payout.requestedOn')}{' '}
                            <DateTimeText value={p.createdAt} mode="datetime" />
                          </span>
                          {p.paidAt ? (
                            <span className="inline-flex items-center gap-1 text-success">
                              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                              {t('referrals.payout.paidOn')} <DateTimeText value={p.paidAt} mode="datetime" />
                            </span>
                          ) : null}
                        </div>

                        {canManage && (p.status === 'PENDING' || p.status === 'PROCESSING') ? (
                          <div className="mt-2.5 flex gap-2 border-t border-border pt-2.5">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="h-7 flex-1 gap-1 px-2 text-xs border-success/25 bg-success/5 text-success hover:border-success/40 hover:bg-success/10"
                              disabled={statusM.isPending}
                              onClick={() =>
                                statusM.mutate(
                                  { payoutId: p.id, input: { status: 'PAID' } },
                                  {
                                    onSuccess: () => toast.success(t('referrals.markedPaid')),
                                    onError: (err) =>
                                      toast.error(
                                        err instanceof NormalizedApiError
                                          ? err.message
                                          : t('common.saveError'),
                                      ),
                                  },
                                )
                              }
                            >
                              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                              {t('referrals.markPaid')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 px-2 text-xs text-destructive hover:bg-destructive-soft"
                              disabled={statusM.isPending}
                              onClick={() =>
                                statusM.mutate(
                                  { payoutId: p.id, input: { status: 'REJECTED' } },
                                  {
                                    onSuccess: () => toast.success(t('referrals.rejected')),
                                    onError: (err) =>
                                      toast.error(
                                        err instanceof NormalizedApiError
                                          ? err.message
                                          : t('common.saveError'),
                                      ),
                                  },
                                )
                              }
                            >
                              <CircleSlash className="h-3 w-3" aria-hidden="true" />
                              {t('referrals.reject')}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SummaryTile({
  icon: Icon,
  tone,
  label,
  value,
  hint,
}: {
  icon: typeof Wallet;
  tone: 'warning' | 'success' | 'primary';
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-2.5 shadow-sm">
      <span
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-md',
          tone === 'warning' && 'bg-warning-soft text-warning',
          tone === 'success' && 'bg-success-soft text-success',
          tone === 'primary' && 'bg-primary/10 text-primary',
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <p className="mt-1.5 truncate text-2xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold tabular-nums text-foreground">{value}</p>
      {hint ? <p className="truncate text-2xs text-warning">{hint}</p> : null}
    </div>
  );
}
