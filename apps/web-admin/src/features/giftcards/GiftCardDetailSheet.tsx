import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CalendarClock,
  Check,
  Copy,
  FileText,
  HandCoins,
  Hourglass,
  Mail,
  Receipt,
  ShoppingBag,
  User,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { GiftCardView } from '@abcp/shared-types';

import { CurrencyText, DateTimeText, EmptyState } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';

import { useGiftCardLookup } from './giftcards.api';
import { useCopyCode } from './useCopyCode';
import {
  EXPIRING_WINDOW_DAYS,
  STATE_BADGE,
  STATE_DOT,
  cardCurrency,
  cardSource,
  cardState,
  daysUntil,
} from './giftCardModel';
import { GiftCardVisual } from './GiftCardVisual';

interface GiftCardDetailSheetProps {
  /** Code to open; `null` closes the sheet. */
  code: string | null;
  /** Row already in memory — rendered instantly while the ledger loads. */
  seed?: GiftCardView | null;
  onClose: () => void;
}

/**
 * Card detail drawer — physical card face, usage meter, three summary tiles, the
 * provenance facts (who bought / who issued and why, branch, payment ref) and the
 * ledger from `/gift-cards/lookup`. Also the landing spot for the header's quick
 * balance check, so a code typed at the counter and a row click look identical.
 */
export function GiftCardDetailSheet({ code, seed, onClose }: GiftCardDetailSheetProps) {
  const { t } = useTranslation();
  const lookup = useGiftCardLookup(code);
  const { copied, copy } = useCopyCode();

  const card = lookup.data ?? (seed && seed.code === code ? seed : null);
  const state = card ? cardState(card) : null;
  const currency = card ? cardCurrency(card) : 'LAK';
  const used = card ? Math.max(0, card.initialBalance - card.currentBalance) : 0;
  const usedPct = card && card.initialBalance > 0 ? Math.round((used / card.initialBalance) * 100) : 0;
  const days = card ? daysUntil(card.expireDate) : 0;

  return (
    <Sheet open={Boolean(code)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[520px]">
        <SheetHeader>
          <div className="flex items-center gap-3 pr-8">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Receipt className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate font-mono text-base">{code ?? '—'}</SheetTitle>
              <p className="truncate text-xs text-muted-foreground">
                {card ? card.recipientEmail : t('common.loading')}
              </p>
            </div>
            {state ? (
              <Badge variant={STATE_BADGE[state]} className="shrink-0">
                <span className={cn('h-1.5 w-1.5 rounded-full', STATE_DOT[state])} aria-hidden="true" />
                {t(`giftCards.status.${state}`)}
              </Badge>
            ) : null}
          </div>
        </SheetHeader>

        <SheetBody className="space-y-4 py-4">
          {!card && lookup.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="aspect-[1.586] w-full rounded-2xl" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-40 w-full rounded-lg" />
            </div>
          ) : !card ? (
            <EmptyState
              icon={Receipt}
              title={t('giftCards.detail.notFound')}
              description={
                lookup.error instanceof NormalizedApiError ? lookup.error.message : t('giftCards.detail.notFoundHint')
              }
            />
          ) : (
            <>
              <GiftCardVisual
                code={card.code}
                balance={card.currentBalance}
                initialBalance={card.initialBalance}
                currency={currency}
                recipient={card.recipientEmail}
                branchName={card.branchName}
                expireDate={card.expireDate}
                state={state ?? 'active'}
                className="animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none"
              />

              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t('giftCards.detail.usage')}</span>
                  <span className="tabular-nums text-foreground">{usedPct}%</span>
                </div>
                <div
                  className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={usedPct}
                  aria-label={t('giftCards.detail.usage')}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-success/70 to-success transition-[width] duration-700 ease-out"
                    style={{ width: `${usedPct}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <SummaryTile
                  icon={Wallet}
                  tone="primary"
                  label={t('giftCards.detail.remaining')}
                  value={<CurrencyText amount={card.currentBalance} currency={currency} />}
                />
                <SummaryTile
                  icon={ArrowUpRight}
                  tone="success"
                  label={t('giftCards.detail.used')}
                  value={<CurrencyText amount={used} currency={currency} />}
                />
                <SummaryTile
                  icon={Hourglass}
                  tone={state === 'active' && days <= EXPIRING_WINDOW_DAYS ? 'warning' : 'info'}
                  label={t('giftCards.detail.daysLeft')}
                  value={
                    <span className="tabular-nums">
                      {days >= 0 ? days : t('giftCards.expiresIn.expiredShort')}
                    </span>
                  }
                />
              </div>

              <section className="rounded-lg border border-border">
                <h3 className="border-b border-border px-3 py-2 text-xs font-semibold text-foreground">
                  {t('giftCards.detail.facts')}
                </h3>
                <dl className="divide-y divide-border text-xs">
                  <Fact icon={Mail} label={t('giftCards.col.recipient')} value={card.recipientEmail} />
                  <Fact
                    icon={cardSource(card) === 'purchased' ? ShoppingBag : HandCoins}
                    label={t('giftCards.col.source')}
                    value={
                      cardSource(card) === 'purchased'
                        ? `${t('giftCards.source.purchased')}${card.buyerName ? ` · ${card.buyerName}` : ''}`
                        : t('giftCards.source.complimentary')
                    }
                  />
                  {card.issueReason ? (
                    <Fact icon={FileText} label={t('giftCards.detail.reason')} value={card.issueReason} />
                  ) : null}
                  <Fact icon={Building2} label={t('giftCards.col.branch')} value={card.branchName} />
                  <Fact
                    icon={User}
                    label={t('giftCards.col.issued')}
                    value={<DateTimeText value={card.createdAt} mode="datetime" />}
                  />
                  <Fact
                    icon={CalendarClock}
                    label={t('giftCards.col.expires')}
                    value={formatDate(card.expireDate)}
                  />
                  {card.purchasePaymentId ? (
                    <Fact
                      icon={Receipt}
                      label={t('giftCards.detail.paymentRef')}
                      value={<span className="font-mono">{card.purchasePaymentId.slice(0, 8)}…</span>}
                    />
                  ) : null}
                </dl>
              </section>

              <section>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-foreground">{t('giftCards.detail.ledger')}</h3>
                  <span className="text-2xs text-muted-foreground">{t('giftCards.detail.ledgerHint')}</span>
                </div>
                {lookup.isLoading ? (
                  <Skeleton className="mt-2 h-24 w-full rounded-lg" />
                ) : (card.transactions ?? []).length === 0 ? (
                  <p className="mt-2 rounded-lg border border-dashed border-border py-5 text-center text-xs text-muted-foreground">
                    {t('giftCards.detail.noLedger')}
                  </p>
                ) : (
                  <ol className="relative mt-3 space-y-3 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border">
                    {(card.transactions ?? []).map((tx) => {
                      const credit = tx.amount >= 0;
                      const Icon = credit ? ArrowDownLeft : ArrowUpRight;
                      return (
                        <li key={tx.id} className="relative flex items-start gap-3">
                          <span
                            className={cn(
                              'relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-background',
                              credit ? 'bg-primary/10 text-primary' : 'bg-success-soft text-success',
                            )}
                          >
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <p className="text-xs font-medium text-foreground">
                                {credit ? t('giftCards.detail.loaded') : t('giftCards.detail.redeemed')}
                              </p>
                              <span
                                className={cn(
                                  'text-xs font-semibold tabular-nums',
                                  credit ? 'text-primary' : 'text-success',
                                )}
                              >
                                {credit ? '+' : '−'}
                                <CurrencyText amount={Math.abs(tx.amount)} currency={currency} />
                              </span>
                            </div>
                            <div className="flex items-baseline justify-between gap-2 text-2xs text-muted-foreground">
                              <DateTimeText value={tx.createdAt} mode="datetime" />
                              <span>
                                {t('giftCards.detail.balanceAfter')}{' '}
                                <CurrencyText amount={tx.balanceAfter} currency={currency} />
                              </span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </>
          )}
        </SheetBody>

        <SheetFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
          {code ? (
            <Button onClick={() => copy(code)}>
              {copied === code ? (
                <Check className="mr-1 h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="mr-1 h-4 w-4" aria-hidden="true" />
              )}
              {t('giftCards.copyCode')}
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

const TILE_TONE = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
} as const;

function SummaryTile({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: LucideIcon;
  tone: keyof typeof TILE_TONE;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-card p-2.5">
      <span className={cn('flex h-6 w-6 items-center justify-center rounded-md', TILE_TONE[tone])}>
        <Icon className="h-3 w-3" aria-hidden="true" />
      </span>
      <p className="mt-1.5 truncate text-2xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Fact({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-foreground">{value}</dd>
    </div>
  );
}
