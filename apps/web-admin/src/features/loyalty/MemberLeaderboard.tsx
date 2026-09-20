import { Crown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LoyaltyAccountView } from '@abcp/shared-types';

import { PersonAvatar } from '@/components/shared/PersonAvatar';
import { cn } from '@/lib/utils';

import { TIER_STYLE, tierProgress } from './tiers';

const MEDAL: Record<number, { chip: string; ring: string }> = {
  0: { chip: 'bg-amber-400/15 text-amber-600 dark:text-amber-400', ring: 'ring-amber-400/40' },
  1: { chip: 'bg-slate-400/15 text-slate-500 dark:text-slate-300', ring: 'ring-slate-400/40' },
  2: { chip: 'bg-orange-400/15 text-orange-600 dark:text-orange-400', ring: 'ring-orange-400/40' },
};

interface MemberLeaderboardProps {
  members: LoyaltyAccountView[];
  loading?: boolean;
  onSelect?: (member: LoyaltyAccountView) => void;
}

/**
 * Ranked "top members by lifetime points" panel — the Referrals `PartnerLeaderboard`
 * treatment (medal-toned ranks, avatar, figure on the right) with the proportional bar
 * swapped for each member's progress towards their next tier, tinted in that tier's
 * colour, so the ranking also shows who is about to level up.
 */
export function MemberLeaderboard({ members, loading = false, onSelect }: MemberLeaderboardProps) {
  const { t } = useTranslation();
  const ranked = [...members]
    .filter((m) => m.lifetimePoints > 0)
    .sort((a, b) => b.lifetimePoints - a.lifetimePoints);

  if (loading) {
    return <div className="h-full min-h-[260px] w-full animate-pulse rounded-lg border border-border bg-card" />;
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
            <Crown className="h-3 w-3" aria-hidden="true" />
          </span>
          <p className="text-xs font-medium text-foreground">{t('loyalty.leaderboard.title')}</p>
        </div>
        <p className="text-2xs text-muted-foreground">{t('loyalty.leaderboard.hint', { count: ranked.length })}</p>
      </div>

      {ranked.length === 0 ? (
        <p className="mt-3 flex flex-1 items-center justify-center py-3 text-center text-xs text-muted-foreground">
          {t('loyalty.leaderboard.empty')}
        </p>
      ) : (
        <ol className="mt-2 space-y-1">
          {ranked.slice(0, 6).map((m, i) => {
            const medal = MEDAL[i];
            const tier = TIER_STYLE[m.tierLevel];
            const pct = Math.round(tierProgress(m) * 100);
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
                  <PersonAvatar name={m.userName} size={24} />
                  <div className="min-w-0 flex-1 space-y-0.5 text-left">
                    <p className="truncate text-xs font-medium leading-snug text-foreground">{m.userName}</p>
                    <p className={cn('truncate text-2xs leading-snug', tier.text)}>
                      {t(`loyalty.tier.${m.tierLevel}`)}
                      <span className="text-muted-foreground">
                        {' · '}
                        {m.nextTier
                          ? t('loyalty.toNext', {
                              points: m.pointsToNextTier?.toLocaleString(),
                              tier: t(`loyalty.tier.${m.nextTier}`),
                            })
                          : t('loyalty.topTier')}
                      </span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block text-xs font-semibold tabular-nums text-foreground">
                      {m.lifetimePoints.toLocaleString()}
                    </span>
                    <span className="text-2xs tabular-nums text-muted-foreground">
                      {t('loyalty.leaderboard.balance', { points: m.points.toLocaleString() })}
                    </span>
                  </div>
                </div>
                <div className="ml-[26px] mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-700 ease-out', tier.bar)}
                    style={{ width: `${Math.max(pct, 4)}%` }}
                  />
                </div>
              </>
            );
            const innerClass = cn(
              'block w-full rounded-md px-1.5 py-1.5 transition-colors duration-150',
              onSelect && 'cursor-pointer hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            );
            return (
              <li
                key={m.id}
                style={{ animationDelay: `${260 + i * 45}ms` }}
                className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
              >
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(m)}
                    className={innerClass}
                    aria-label={t('loyalty.openMember', { name: m.userName })}
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
