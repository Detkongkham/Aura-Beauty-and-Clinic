import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GiftCardView } from '@abcp/shared-types';

import { CurrencyText } from '@/components/shared';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { EXPIRING_WINDOW_DAYS, cardCurrency, cardState, daysUntil, isExpiringSoon } from './giftCardModel';

interface ExpiryWatchCardProps {
  cards: GiftCardView[];
  loading?: boolean;
  onSelect: (card: GiftCardView) => void;
}

function urgency(days: number) {
  if (days <= 7) return { pill: 'bg-destructive-soft text-destructive', bar: 'bg-destructive' };
  if (days <= EXPIRING_WINDOW_DAYS) return { pill: 'bg-warning-soft text-warning', bar: 'bg-warning' };
  return { pill: 'bg-muted text-muted-foreground', bar: 'bg-primary/40' };
}

/**
 * "Expiry watch" — live cards that still hold value, ordered by how soon they lapse.
 * Where the Referrals leaderboard ranks by size, this ranks by urgency: a countdown
 * pill (red ≤7d, amber ≤30d), the value at risk, and a bar showing how much of the
 * card is still unspent — so front desk knows whom to nudge before the value turns
 * into breakage. Rows open the card detail sheet.
 */
export function ExpiryWatchCard({ cards, loading = false, onSelect }: ExpiryWatchCardProps) {
  const { t } = useTranslation();

  if (loading) {
    return <div className="h-full min-h-[260px] w-full animate-pulse rounded-lg border border-border bg-card" />;
  }

  const now = Date.now();
  const live = cards
    .filter((c) => cardState(c) === 'active' && c.currentBalance > 0)
    .sort((a, b) => a.expireDate.localeCompare(b.expireDate));
  const soon = live.filter((c) => isExpiringSoon(c, now));
  const atRisk = soon.reduce((s, c) => s + c.currentBalance, 0);

  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-lg border border-border bg-card p-3 shadow-sm',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
      )}
      style={{ animationDelay: '220ms' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-warning-soft text-warning">
            <CalendarClock className="h-3 w-3" aria-hidden="true" />
          </span>
          <p className="text-xs font-medium text-foreground">{t('giftCards.expiry.title')}</p>
        </div>
        <p className="text-2xs text-muted-foreground">
          {t('giftCards.expiry.hint', { count: soon.length, days: EXPIRING_WINDOW_DAYS })}
        </p>
      </div>

      {soon.length > 0 ? (
        <div className="mt-2 flex items-center justify-between rounded-md bg-warning-soft/60 px-2.5 py-1.5 text-2xs text-warning">
          <span>{t('giftCards.expiry.atRisk')}</span>
          <CurrencyText amount={atRisk} className="text-xs font-semibold" />
        </div>
      ) : null}

      {live.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-6 text-center">
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">{t('giftCards.expiry.empty')}</p>
        </div>
      ) : (
        <ol className="mt-2 space-y-1">
          {live.slice(0, 5).map((c, i) => {
            const days = daysUntil(c.expireDate, now);
            const u = urgency(days);
            const remaining = c.initialBalance > 0 ? (c.currentBalance / c.initialBalance) * 100 : 0;
            return (
              <li
                key={c.id}
                style={{ animationDelay: `${260 + i * 45}ms` }}
                className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
              >
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  aria-label={t('giftCards.expiry.open', { code: c.code })}
                  className="block w-full cursor-pointer rounded-md px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex h-9 min-w-[42px] shrink-0 flex-col items-center justify-center rounded-md px-1 leading-none tabular-nums',
                        u.pill,
                      )}
                    >
                      <span className="text-sm font-semibold">{Math.max(0, days)}</span>
                      <span className="text-2xs">{t('giftCards.expiry.daysShort')}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs font-medium text-foreground">{c.code}</p>
                      <p className="truncate text-2xs text-muted-foreground">
                        {c.recipientEmail} · {formatDate(c.expireDate)}
                      </p>
                    </div>
                    <CurrencyText
                      amount={c.currentBalance}
                      currency={cardCurrency(c)}
                      className="shrink-0 text-xs font-semibold text-foreground"
                    />
                  </div>
                  <div className="ml-[50px] mt-1 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div
                      className={cn('h-full rounded-full transition-[width] duration-700 ease-out', u.bar)}
                      style={{ width: `${Math.max(4, remaining)}%` }}
                    />
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
