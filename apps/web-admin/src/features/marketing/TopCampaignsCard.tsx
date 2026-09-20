import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CampaignView } from '@abcp/shared-types';

import { cn } from '@/lib/utils';

import { TYPE_META, conversionRate, formatRate, rankCampaigns } from './campaigns.lib';

const MEDAL: Record<number, { chip: string; ring: string }> = {
  0: { chip: 'bg-amber-400/15 text-amber-600 dark:text-amber-400', ring: 'ring-amber-400/40' },
  1: { chip: 'bg-slate-400/15 text-slate-500 dark:text-slate-300', ring: 'ring-slate-400/40' },
  2: { chip: 'bg-orange-400/15 text-orange-600 dark:text-orange-400', ring: 'ring-orange-400/40' },
};

interface TopCampaignsCardProps {
  campaigns: CampaignView[];
  loading?: boolean;
  onSelect?: (campaign: CampaignView) => void;
}

/**
 * Ranked "which outreach actually brought customers back" panel — the Marketing
 * sibling of `PartnerLeaderboard`: medal-toned ranks for the top 3, the campaign's
 * type chip in place of an avatar, and a bar showing its *conversion rate* (not
 * its share of the #1 row) so a small campaign with a great hit-rate is visible.
 */
export function TopCampaignsCard({ campaigns, loading = false, onSelect }: TopCampaignsCardProps) {
  const { t } = useTranslation();
  const ranked = rankCampaigns(campaigns);

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
            <Trophy className="h-3 w-3" aria-hidden="true" />
          </span>
          <p className="text-xs font-medium text-foreground">{t('campaigns.top.title')}</p>
        </div>
        <p className="text-2xs text-muted-foreground">{t('campaigns.top.hint', { count: ranked.length })}</p>
      </div>

      {ranked.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-6 text-center">
          <Trophy className="h-6 w-6 text-muted-foreground/40" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">{t('campaigns.top.empty')}</p>
          <p className="max-w-[220px] text-2xs text-muted-foreground/80">{t('campaigns.top.emptyHint')}</p>
        </div>
      ) : (
        <ol className="mt-2 space-y-1">
          {ranked.slice(0, 5).map((c, i) => {
            const medal = MEDAL[i];
            const meta = TYPE_META[c.type];
            const Icon = meta.icon;
            const rate = conversionRate(c.recipientCount, c.convertedCount) ?? 0;
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
                  <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', meta.chip)}>
                    <Icon className="h-3 w-3" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-0.5 text-left">
                    <p className="truncate text-xs font-medium leading-snug text-foreground">{c.name}</p>
                    <p className="truncate text-2xs leading-snug text-muted-foreground">
                      {t(`campaigns.type.${c.type}`)} · {c.branchName}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block text-xs font-semibold tabular-nums text-success">
                      {t('campaigns.top.converted', { count: c.convertedCount })}
                    </span>
                    <span className="text-2xs tabular-nums text-muted-foreground">
                      {t('campaigns.top.ofReached', {
                        rate: formatRate(rate),
                        reached: c.recipientCount.toLocaleString(),
                      })}
                    </span>
                  </div>
                </div>
                <div className="ml-[26px] mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-700 ease-out',
                      i === 0 ? 'bg-gradient-to-r from-success/70 to-success' : 'bg-success/45',
                    )}
                    style={{ width: `${Math.max(rate * 100, 4)}%` }}
                  />
                </div>
              </>
            );
            const innerClass = cn(
              'block w-full rounded-md px-1.5 py-1.5 transition-colors duration-150',
              i === 0 && 'bg-success-soft/40',
              onSelect && 'cursor-pointer hover:bg-muted/50',
            );
            return (
              <li
                key={c.id}
                style={{ animationDelay: `${260 + i * 45}ms` }}
                className="animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
              >
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(c)}
                    className={innerClass}
                    aria-label={t('campaigns.top.open', { name: c.name })}
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
