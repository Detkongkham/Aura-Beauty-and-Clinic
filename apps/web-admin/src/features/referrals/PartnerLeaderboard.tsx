import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { AffiliateView } from '@abcp/shared-types';

import { CurrencyText } from '@/components/shared';
import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { cn } from '@/lib/utils';

const MEDAL: Record<number, { chip: string; ring: string }> = {
  0: { chip: 'bg-amber-400/15 text-amber-600 dark:text-amber-400', ring: 'ring-amber-400/40' },
  1: { chip: 'bg-slate-400/15 text-slate-500 dark:text-slate-300', ring: 'ring-slate-400/40' },
  2: { chip: 'bg-orange-400/15 text-orange-600 dark:text-orange-400', ring: 'ring-orange-400/40' },
};

interface PartnerLeaderboardProps {
  partners: AffiliateView[];
  loading?: boolean;
  onSelect?: (partner: AffiliateView) => void;
}

/**
 * Ranked "top partners by lifetime commission" panel — medal-toned rank badges for
 * the top 3, a proportional bar per row (relative to the #1 partner) and the open
 * balance beside it, so the ranking doubles as a shortlist of who to pay next.
 * Mirrors the Inventory `SupplierLeaderboard` card treatment, this page's template.
 */
export function PartnerLeaderboard({ partners, loading = false, onSelect }: PartnerLeaderboardProps) {
  const { t } = useTranslation();
  const ranked = [...partners]
    .filter((p) => p.totalEarnings > 0)
    .sort((a, b) => b.totalEarnings - a.totalEarnings);
  const max = ranked[0]?.totalEarnings ?? 0;

  if (loading) {
    return <div className="h-full min-h-[168px] w-full animate-pulse rounded-lg border border-border bg-card" />;
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
            <Trophy className="h-3 w-3" aria-hidden="true" />
          </span>
          <p className="text-xs font-medium text-foreground">{t('referrals.leaderboard.title')}</p>
        </div>
        <p className="text-2xs text-muted-foreground">
          {t('referrals.leaderboard.hint', { count: ranked.length })}
        </p>
      </div>

      {ranked.length === 0 ? (
        <p className="mt-3 py-3 text-center text-xs text-muted-foreground">
          {t('referrals.leaderboard.empty')}
        </p>
      ) : (
        <ol className="mt-2 space-y-1">
          {ranked.slice(0, 5).map((p, i) => {
            const medal = MEDAL[i];
            const pct = max > 0 ? Math.max((p.totalEarnings / max) * 100, 4) : 0;
            const row = (
              <>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-2xs font-semibold tabular-nums ring-1',
                      medal ? cn(medal.chip, medal.ring) : 'bg-muted text-muted-foreground ring-border',
                    )}
                  >
                    {i + 1}
                  </span>
                  <PersonAvatar name={p.userName} size={24} />
                  <div className="min-w-0 flex-1 space-y-0.5 text-left">
                    <p className="truncate text-xs font-medium leading-snug text-foreground">{p.userName}</p>
                    <p className="truncate text-2xs leading-snug text-muted-foreground">
                      {t('referrals.leaderboard.meta', {
                        rate: Math.round(p.commissionRate * 100),
                        count: p.referredCount,
                      })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <CurrencyText
                      amount={p.totalEarnings}
                      className="block text-xs font-semibold text-foreground"
                    />
                    {p.unpaidBalance > 0 ? (
                      <span className="text-2xs text-warning">
                        {t('referrals.leaderboard.owing')}{' '}
                        <CurrencyText amount={p.unpaidBalance} className="font-medium" />
                      </span>
                    ) : (
                      <span className="text-2xs text-muted-foreground">
                        {t('referrals.leaderboard.settled')}
                      </span>
                    )}
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
                    aria-label={t('referrals.leaderboard.openPayouts', { name: p.userName })}
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
