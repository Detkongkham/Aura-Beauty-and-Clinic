import { CalendarClock, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StockLotView } from '@abcp/shared-types';

import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

interface LotExpiryWatchCardProps {
  /** Lots already expired or expiring within `days`, soonest first (API order). */
  lots: StockLotView[];
  total: number;
  days: number;
  loading?: boolean;
  onSelect: (lot: StockLotView) => void;
}

function urgency(daysLeft: number) {
  if (daysLeft <= 7) return { pill: 'bg-destructive-soft text-destructive' };
  if (daysLeft <= 30) return { pill: 'bg-warning-soft text-warning' };
  return { pill: 'bg-muted text-muted-foreground' };
}

/**
 * C5 — "Expiring soon" watch for lot-tracked stock. Same shape as the gift-card ExpiryWatchCard
 * (countdown pill red ≤7d / amber ≤30d, ordered by urgency) but rows are lots; a row opens the
 * recall report (which appointments/customers the lot was used on).
 */
export function LotExpiryWatchCard({ lots, total, days, loading = false, onSelect }: LotExpiryWatchCardProps) {
  const { t } = useTranslation();

  if (loading) {
    return <div className="h-[200px] w-full animate-pulse rounded-lg border border-border bg-card" />;
  }

  const expired = lots.filter((l) => (l.daysLeft ?? 0) < 0).length;

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border border-border bg-card p-3 shadow-sm',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-warning-soft text-warning">
            <CalendarClock className="h-3 w-3" aria-hidden="true" />
          </span>
          <p className="text-xs font-medium text-foreground">{t('inventory.lot.watchTitle')}</p>
        </div>
        <p className="text-2xs text-muted-foreground">{t('inventory.lot.watchHint', { count: total, days })}</p>
      </div>

      {expired > 0 ? (
        <div className="mt-2 rounded-md bg-destructive-soft px-2.5 py-1.5 text-2xs text-destructive">
          {t('inventory.lot.expiredBanner', { count: expired })}
        </div>
      ) : null}

      {lots.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-center">
          <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">{t('inventory.lot.watchEmpty')}</p>
        </div>
      ) : (
        <ol className="mt-2 grid gap-x-3 gap-y-1 md:grid-cols-2">
          {lots.slice(0, 6).map((l, i) => {
            const d = l.daysLeft ?? 0;
            const u = urgency(d);
            return (
              <li
                key={l.id}
                style={{ animationDelay: `${120 + i * 45}ms` }}
                className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
              >
                <button
                  type="button"
                  onClick={() => onSelect(l)}
                  aria-label={t('inventory.lot.open', { lot: l.lotNumber })}
                  className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors duration-150 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      'flex h-9 min-w-[42px] shrink-0 flex-col items-center justify-center rounded-md px-1 leading-none tabular-nums',
                      u.pill,
                    )}
                  >
                    <span className="text-sm font-semibold">{d < 0 ? '!' : d}</span>
                    <span className="text-2xs">{t('inventory.lot.daysShort')}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{l.productName}</p>
                    <p className="truncate text-2xs text-muted-foreground">
                      <span className="font-mono">{l.lotNumber}</span> · {l.expiryDate ? formatDate(l.expiryDate) : '—'}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                    {l.qtyOnHand.toLocaleString()} {l.unit}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
