import { useEffect, useState } from 'react';
import { AlertCircle, ArrowDown, Filter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CampaignView } from '@abcp/shared-types';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

import { TYPE_META, campaignTotals, formatRate, typeBreakdown } from './campaigns.lib';

interface ConversionFunnelCardProps {
  /** Currently filtered campaigns — every figure here matches the table below. */
  campaigns: CampaignView[];
  loading?: boolean;
  /** Jump the table to campaigns that have never reached anyone. */
  onShowNeverSent?: () => void;
}

/**
 * "Did the outreach bring anyone back?" panel for the Marketing overview.
 *
 * Deliberately *not* the donut + ratio bar used by `CommissionFlowCard` /
 * `PaymentMethodBreakdown`: a campaign's story is a drop-off, so the top half is a
 * two-stage funnel (reached → converted, the second bar tapered to the real rate)
 * with the lost customers spelled out, and the bottom half repeats that funnel per
 * campaign type as an overlaid track (soft = reached, solid = converted).
 * Shares the Referrals card shell, fill-in reveal and legend grammar so the two
 * growth pages still read as one system.
 */
export function ConversionFunnelCard({ campaigns, loading = false, onShowNeverSent }: ConversionFunnelCardProps) {
  const { t } = useTranslation();
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    if (loading) return;
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, [loading]);

  if (loading) {
    return <div className="h-full min-h-[260px] w-full animate-pulse rounded-lg border border-border bg-card" />;
  }

  const totals = campaignTotals(campaigns);
  const lost = Math.max(0, totals.reached - totals.converted);
  const convertedPct = totals.rate === null ? 0 : totals.rate * 100;
  const rows = typeBreakdown(campaigns);
  const maxReached = Math.max(...rows.map((r) => r.reached), 1);
  const neverSentActive = campaigns.filter((c) => c.isActive && c.recipientCount === 0).length;

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          'flex h-full flex-col rounded-lg border border-border bg-card p-4 shadow-sm',
          'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
        )}
        style={{ animationDelay: '180ms' }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Filter className="h-3 w-3" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-foreground">{t('campaigns.funnel.title')}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('campaigns.funnel.overall')}{' '}
            <span className="font-semibold tabular-nums text-foreground">{formatRate(totals.rate)}</span>
          </p>
        </div>

        {/* Stage bars — reached is the full track, converted tapers to the actual rate. */}
        <div className="mt-3 space-y-1.5">
          <FunnelStage
            label={t('campaigns.funnel.reached')}
            value={totals.reached}
            widthPct={totals.reached > 0 ? 100 : 0}
            filled={filled}
            barClass="bg-gradient-to-r from-info/70 to-info"
          />
          <div className="flex items-center gap-2 pl-1 text-2xs text-muted-foreground">
            <ArrowDown className="h-3 w-3" aria-hidden="true" />
            {totals.reached > 0 ? (
              <span>{t('campaigns.funnel.lost', { count: lost })}</span>
            ) : (
              <span>{t('campaigns.funnel.noReach')}</span>
            )}
          </div>
          <FunnelStage
            label={t('campaigns.funnel.converted')}
            value={totals.converted}
            widthPct={totals.converted > 0 ? Math.max(convertedPct, 3) : 0}
            filled={filled}
            barClass="bg-gradient-to-r from-success/70 to-success"
            suffix={formatRate(totals.rate)}
          />
        </div>

        <div className="mt-4 flex-1 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">{t('campaigns.funnel.byType')}</p>
            <div className="flex items-center gap-3 text-2xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="h-2 w-3 rounded-sm bg-muted-foreground/25" aria-hidden="true" />
                {t('campaigns.funnel.reached')}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-3 rounded-sm bg-muted-foreground/70" aria-hidden="true" />
                {t('campaigns.funnel.converted')}
              </span>
            </div>
          </div>

          <div className="mt-2.5 space-y-2.5">
            {rows.map((r) => {
              const meta = TYPE_META[r.type];
              const Icon = meta.icon;
              const reachPct = (r.reached / maxReached) * 100;
              const convPct = r.reached > 0 ? (r.converted / r.reached) * 100 : 0;
              return (
                <div key={r.type} className={cn('flex items-center gap-2.5', r.campaigns === 0 && 'opacity-60')}>
                  <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', meta.chip)}>
                    <Icon className="h-3 w-3" aria-hidden="true" />
                  </span>
                  <span className="w-24 shrink-0 truncate text-xs text-foreground">
                    {t(`campaigns.type.${r.type}`)}
                    <span className="ml-1 text-2xs tabular-nums text-muted-foreground">×{r.campaigns}</span>
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted"
                        role="img"
                        aria-label={t('campaigns.funnel.rowAria', {
                          type: t(`campaigns.type.${r.type}`),
                          reached: r.reached,
                          converted: r.converted,
                        })}
                      >
                        <span
                          className={cn(
                            'absolute inset-y-0 left-0 overflow-hidden rounded-full transition-[width] duration-700 ease-out',
                            meta.soft,
                          )}
                          style={{ width: filled && r.reached > 0 ? `${Math.max(reachPct, 3)}%` : 0 }}
                        >
                          <span
                            className={cn(
                              'block h-full rounded-full transition-[width] delay-150 duration-700 ease-out',
                              meta.solid,
                            )}
                            style={{ width: filled ? `${convPct}%` : 0 }}
                          />
                        </span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t('campaigns.funnel.tooltip', {
                        reached: r.reached.toLocaleString(),
                        converted: r.converted.toLocaleString(),
                        rate: formatRate(r.rate),
                      })}
                    </TooltipContent>
                  </Tooltip>
                  <span className="w-20 shrink-0 text-right text-2xs tabular-nums text-muted-foreground">
                    {r.converted.toLocaleString()}/{r.reached.toLocaleString()}
                  </span>
                  <span className="w-11 shrink-0 text-right text-xs font-semibold tabular-nums">
                    {formatRate(r.rate)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {neverSentActive > 0 ? (
          <button
            type="button"
            onClick={onShowNeverSent}
            disabled={!onShowNeverSent}
            className="mt-3 flex w-full items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-left text-xs text-warning transition-colors hover:bg-warning/15 disabled:cursor-default"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{t('campaigns.funnel.neverSent', { count: neverSentActive })}</span>
            {onShowNeverSent ? <span className="font-medium underline-offset-2 hover:underline">{t('campaigns.funnel.review')}</span> : null}
          </button>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function FunnelStage({
  label,
  value,
  widthPct,
  filled,
  barClass,
  suffix,
}: {
  label: string;
  value: number;
  widthPct: number;
  filled: boolean;
  barClass: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{label}</span>
      <div className="relative h-7 flex-1 overflow-hidden rounded-md bg-muted/60">
        <div
          className={cn('h-full rounded-md transition-[width] duration-700 ease-out', barClass)}
          style={{ width: filled ? `${widthPct}%` : 0 }}
        />
        <span className="absolute inset-y-0 left-2.5 flex items-center text-sm font-semibold tabular-nums text-foreground mix-blend-normal">
          <span className="rounded bg-card/85 px-1.5 leading-5 shadow-sm">{value.toLocaleString()}</span>
        </span>
      </div>
      {suffix ? (
        <span className="w-11 shrink-0 text-right text-xs font-semibold tabular-nums text-success">{suffix}</span>
      ) : (
        <span className="w-11 shrink-0" aria-hidden="true" />
      )}
    </div>
  );
}
