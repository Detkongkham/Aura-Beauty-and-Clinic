import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PaymentView } from '@abcp/shared-types';

import { CurrencyText, DateTimeText } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { PAYMENT_STATUS_VARIANT, paymentStatusKey } from './finance.lib';

interface RecentPaymentsFeedProps {
  payments: PaymentView[];
  loading?: boolean;
  onSelect?: (payment: PaymentView) => void;
}

/**
 * "What just happened" panel for the Finance overview — the latest payments in
 * the selected range, each with a proportional bar (relative to the largest
 * amount shown) so the feed doubles as a quick read on which transactions moved
 * the most money. Mirrors the Referrals `PartnerLeaderboard` card treatment
 * (this page's design template): same shell, same medal-less ranked rows, same
 * fill-in bar and stagger, so the two overviews read as one system.
 */
export function RecentPaymentsFeed({ payments, loading = false, onSelect }: RecentPaymentsFeedProps) {
  const { t } = useTranslation();
  const rows = payments.slice(0, 5);
  const max = rows.reduce((m, p) => Math.max(m, p.totalAmount), 0);

  if (loading) {
    return <div className="h-full min-h-[220px] w-full animate-pulse rounded-lg border border-border bg-card" />;
  }

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
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Clock className="h-3 w-3" aria-hidden="true" />
          </span>
          <p className="text-xs font-medium text-foreground">{t('finance.recent.title')}</p>
        </div>
        <p className="text-2xs text-muted-foreground">{t('finance.recent.hint', { count: rows.length })}</p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 py-3 text-center text-xs text-muted-foreground">{t('finance.recent.empty')}</p>
      ) : (
        <ol className="mt-2 space-y-1">
          {rows.map((p, i) => {
            const name = p.customerName ?? t('finance.recent.walkIn');
            const pct = max > 0 ? Math.max((p.totalAmount / max) * 100, 4) : 0;
            const row = (
              <>
                <div className="flex items-center gap-2">
                  <PersonAvatar name={name} size={24} />
                  <div className="min-w-0 flex-1 space-y-0.5 text-left">
                    <p className="truncate text-xs font-medium leading-snug text-foreground">{name}</p>
                    <p className="truncate text-2xs leading-snug text-muted-foreground">
                      {p.branchName} · <DateTimeText value={p.createdAt} mode="relative" />
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <CurrencyText amount={p.totalAmount} className="block text-xs font-semibold text-foreground" />
                    <Badge variant={PAYMENT_STATUS_VARIANT[p.paymentStatus]} className="mt-0.5 text-[10px]">
                      {t(paymentStatusKey(p.paymentStatus))}
                    </Badge>
                  </div>
                </div>
                <div className="ml-[26px] mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-700 ease-out',
                      i === 0 ? 'bg-gradient-to-r from-primary/70 to-primary' : 'bg-primary/40',
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </>
            );
            const innerClass = cn(
              'block w-full rounded-md px-1.5 py-1.5 transition-colors duration-150',
              onSelect && 'cursor-pointer hover:bg-muted/50',
            );
            return (
              <li
                key={p.id}
                style={{ animationDelay: `${260 + i * 45}ms` }}
                className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
              >
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    className={innerClass}
                    aria-label={t('finance.recent.openAria', { name })}
                  >
                    {row}
                  </button>
                ) : (
                  <div className={innerClass}>{row}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
