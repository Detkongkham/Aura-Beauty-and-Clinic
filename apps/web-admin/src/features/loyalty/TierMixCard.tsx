import { useEffect, useState } from 'react';
import { ArrowUpCircle, Check, Coins, Gem, Gift, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import {
  LOYALTY_EARN_DIVISOR_LAK,
  LOYALTY_POINT_VALUE_LAK,
  LOYALTY_TIER_THRESHOLDS,
  type LoyaltyAccountView,
  type LoyaltyTier,
} from '@abcp/shared-types';

import { CHART_TOOLTIP_STYLE } from '@/features/dashboard/chartTheme';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

import { NEAR_UPGRADE_POINTS, TIER_STYLE, TIERS, isNearUpgrade } from './tiers';

interface TierMixCardProps {
  /** Search-scoped roster — deliberately NOT tier-filtered, so the mix stays meaningful while a tier is selected. */
  members: LoyaltyAccountView[];
  /** Currently selected tier filter ('' = all) — highlights that row. */
  selected: LoyaltyTier | '';
  onSelect: (tier: LoyaltyTier | '') => void;
  loading?: boolean;
}

/**
 * "How the membership is spread" panel for the Loyalty overview — a direct sibling
 * of the Referrals `CommissionFlowCard`: same card shell, donut + ratio bar + legend
 * grammar, same fill-in reveal. Underneath, each tier gets a clickable row (members,
 * share of outstanding points, entry threshold) that doubles as the tier filter, and
 * a footer spells out the programme rules so staff never have to guess how points
 * are earned or what they are worth.
 */
export function TierMixCard({ members, selected, onSelect, loading = false }: TierMixCardProps) {
  const { t } = useTranslation();
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    if (loading) return;
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, [loading]);

  const total = members.length;
  const rows = TIERS.map((tier) => {
    const inTier = members.filter((m) => m.tierLevel === tier);
    const points = inTier.reduce((sum, m) => sum + m.points, 0);
    return {
      tier,
      label: t(`loyalty.tier.${tier}`),
      count: inTier.length,
      points,
      avg: inTier.length > 0 ? Math.round(points / inTier.length) : 0,
      pct: total > 0 ? (inTier.length / total) * 100 : 0,
    };
  });
  const pipeline = (
    [
      { from: 'SILVER', to: 'GOLD' },
      { from: 'GOLD', to: 'PLATINUM' },
    ] as const
  ).map((step) => {
    const climbing = members.filter((m) => m.tierLevel === step.from && m.nextTier === step.to);
    const gapSum = climbing.reduce((sum, m) => sum + (m.pointsToNextTier ?? 0), 0);
    return {
      ...step,
      near: climbing.filter(isNearUpgrade).length,
      avgGap: climbing.length > 0 ? Math.round(gapSum / climbing.length) : 0,
    };
  });
  const maxPoints = Math.max(...rows.map((r) => r.points), 1);
  const pieData = rows
    .filter((r) => r.count > 0)
    .map((r) => ({ name: r.label, value: r.count, color: TIER_STYLE[r.tier].fill }));

  if (loading) {
    return <div className="h-full min-h-[260px] w-full animate-pulse rounded-lg border border-border bg-card" />;
  }

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
          <p className="text-sm font-medium text-foreground">{t('loyalty.mix.title')}</p>
          <p className="text-xs text-muted-foreground">
            {t('loyalty.mix.totalHint', { count: total })}
          </p>
        </div>

        <div className="mt-3 flex items-center gap-4">
          {total > 0 ? (
            <div className="relative h-16 w-16 shrink-0" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    innerRadius="68%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                    isAnimationActive
                    animationDuration={700}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => [value.toLocaleString(), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <Gem className="pointer-events-none absolute inset-0 m-auto h-4 w-4 text-muted-foreground" />
            </div>
          ) : null}

          <div className="min-w-0 flex-1">
            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={rows.map((r) => `${r.label}: ${r.count}`).join(', ')}
            >
              {total === 0
                ? null
                : rows.map((r) =>
                    r.pct <= 0 ? null : (
                      <Tooltip key={r.tier}>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              'h-full transition-[width] duration-700 ease-out first:rounded-l-full last:rounded-r-full',
                              TIER_STYLE[r.tier].bar,
                            )}
                            style={{ width: `${filled ? r.pct : 0}%` }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {r.label}: {r.count.toLocaleString()} ({Math.round(r.pct)}%)
                        </TooltipContent>
                      </Tooltip>
                    ),
                  )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
              {rows.map((r) => (
                <div key={r.tier} className="flex items-center gap-1.5 text-xs">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', TIER_STYLE[r.tier].dot)} aria-hidden="true" />
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className={cn('font-semibold tabular-nums', TIER_STYLE[r.tier].text)}>
                    {r.count.toLocaleString()}
                  </span>
                  <span className="text-2xs text-muted-foreground">({Math.round(r.pct)}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex-1 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-2xs font-medium text-muted-foreground">{t('loyalty.mix.byTier')}</p>
            <p className="text-2xs text-muted-foreground">{t('loyalty.mix.clickToFilter')}</p>
          </div>
          <div className="mt-2 space-y-1">
            {rows.map((r) => {
              const active = selected === r.tier;
              const s = TIER_STYLE[r.tier];
              return (
                <button
                  key={r.tier}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect(active ? '' : r.tier)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active ? cn('bg-muted/60 ring-1', s.ring) : 'hover:bg-muted/50',
                  )}
                >
                  <span
                    className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1', s.chip, s.ring)}
                  >
                    {active ? <Check className="h-3 w-3" aria-hidden="true" /> : <Gem className="h-3 w-3" aria-hidden="true" />}
                  </span>
                  <span className="w-24 shrink-0">
                    <span className="block truncate text-xs font-medium text-foreground">{r.label}</span>
                    <span className="block truncate text-2xs text-muted-foreground">
                      {t('loyalty.mix.threshold', { points: LOYALTY_TIER_THRESHOLDS[r.tier].toLocaleString() })}
                    </span>
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <span
                      className={cn('block h-full rounded-full transition-[width] duration-700 ease-out', s.bar)}
                      style={{ width: filled ? `${Math.max(2, (r.points / maxPoints) * 100)}%` : 0 }}
                    />
                  </span>
                  <span className="w-24 shrink-0 whitespace-nowrap text-right">
                    <span className="block text-xs font-medium tabular-nums text-foreground">
                      {r.points.toLocaleString()}
                    </span>
                    <span className="block text-2xs tabular-nums text-muted-foreground">
                      {t('loyalty.mix.avg', { points: r.avg.toLocaleString() })}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Upgrade pipeline — who is about to cross into Gold / Platinum. */}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {pipeline.map((p) => (
              <div
                key={p.to}
                className="flex min-w-0 items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2"
              >
                <ArrowUpCircle className={cn('h-4 w-4 shrink-0', TIER_STYLE[p.to].text)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-2xs text-muted-foreground">
                    {t('loyalty.mix.pipeline', {
                      from: t(`loyalty.tier.${p.from}`),
                      to: t(`loyalty.tier.${p.to}`),
                    })}
                  </p>
                  <p className="truncate text-xs text-foreground">
                    <span className="font-semibold tabular-nums">{p.near.toLocaleString()}</span>{' '}
                    <span className="text-muted-foreground">
                      {t('loyalty.mix.pipelineNear', { points: NEAR_UPGRADE_POINTS })}
                    </span>
                  </p>
                </div>
                <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                  {t('loyalty.mix.pipelineAvg', { points: p.avgGap.toLocaleString() })}
                </span>
              </div>
            ))}
          </div>
        </div>

        <ul className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-3">
          <RuleChip
            icon={TrendingUp}
            label={t('loyalty.rules.earn')}
            value={t('loyalty.rules.earnValue', { amount: formatCurrency(LOYALTY_EARN_DIVISOR_LAK) })}
          />
          <RuleChip
            icon={Gift}
            label={t('loyalty.rules.redeem')}
            value={t('loyalty.rules.redeemValue', { amount: formatCurrency(LOYALTY_POINT_VALUE_LAK) })}
          />
          <RuleChip icon={Coins} label={t('loyalty.rules.tierBasis')} value={t('loyalty.rules.tierBasisValue')} />
        </ul>
      </div>
    </TooltipProvider>
  );
}

function RuleChip({ icon: Icon, label, value }: { icon: typeof Gift; label: string; value: string }) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate text-2xs text-muted-foreground">{label}</span>
        <span className="block truncate text-xs font-medium text-foreground">{value}</span>
      </span>
    </li>
  );
}
