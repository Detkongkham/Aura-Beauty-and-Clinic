import { useEffect, useState } from 'react';
import { Gift, HandCoins, PieChart as PieIcon, ShoppingBag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import type { GiftCardView } from '@abcp/shared-types';

import { CurrencyText } from '@/components/shared';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CHART_TOOLTIP_STYLE } from '@/features/dashboard/chartTheme';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

import {
  CARD_STATES,
  STATE_DOT,
  cardSource,
  cardState,
  valueSplit,
  type CardSource,
  type CardState,
} from './giftCardModel';

const SEGMENTS = [
  { key: 'redeemed', bar: 'bg-success', text: 'text-success', hsl: 'hsl(var(--success))' },
  { key: 'outstanding', bar: 'bg-primary', text: 'text-primary', hsl: 'hsl(var(--primary))' },
  { key: 'breakage', bar: 'bg-destructive', text: 'text-destructive', hsl: 'hsl(var(--destructive))' },
  { key: 'voided', bar: 'bg-muted-foreground/60', text: 'text-muted-foreground', hsl: 'hsl(var(--muted-foreground))' },
] as const;

type SegmentKey = (typeof SEGMENTS)[number]['key'];

interface GiftCardValueCardProps {
  cards: GiftCardView[];
  loading?: boolean;
  /** Currently applied status filter — highlights the matching chip. */
  activeState: CardState | 'all';
  onStateSelect: (state: CardState | 'all') => void;
}

/**
 * "Where the gift-card value sits" — every kip ever loaded onto a paid/issued card,
 * split into redeemed (service delivered), outstanding (a liability the clinic still
 * owes), breakage (expired unused) and voided. The donut centre carries the
 * redemption rate, which is the figure owners actually ask about. Underneath: a
 * clickable status census (doubles as a status filter) and the complimentary vs
 * purchased split — complimentary cards are pure cost, so they deserve their own line.
 * Card shell and motion follow the Referrals `CommissionFlowCard` (this page's template).
 */
export function GiftCardValueCard({ cards, loading = false, activeState, onStateSelect }: GiftCardValueCardProps) {
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

  const split = valueSplit(cards);
  const amounts: Record<SegmentKey, number> = {
    redeemed: split.redeemed,
    outstanding: split.outstanding,
    breakage: split.breakage,
    voided: split.voided,
  };
  const label = (k: SegmentKey) => t(`giftCards.value.${k}`);
  const pieData = SEGMENTS.map((s) => ({ name: label(s.key), value: amounts[s.key], color: s.hsl })).filter(
    (d) => d.value > 0,
  );
  const ratePct = Math.round(split.redemptionRate * 100);

  const stateCounts = CARD_STATES.map((s) => ({ key: s, count: cards.filter((c) => cardState(c) === s).length }));

  const sources = (['purchased', 'complimentary'] as CardSource[]).map((key) => {
    const members = cards.filter((c) => cardSource(c) === key && cardState(c) !== 'pendingPayment');
    return { key, count: members.length, value: members.reduce((sum, c) => sum + c.initialBalance, 0) };
  });
  const sourceTotal = sources.reduce((s, x) => s + x.value, 0);

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          'flex h-full flex-col rounded-lg border border-border bg-card p-4 shadow-sm',
          'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
        )}
        style={{ animationDelay: '180ms' }}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <PieIcon className="h-3 w-3" aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-foreground">{t('giftCards.value.title')}</p>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('giftCards.value.totalHint')}{' '}
            <CurrencyText amount={split.total} className="font-medium text-foreground" />
          </p>
        </div>

        <div className="mt-3 flex items-center gap-4">
          <div className="relative h-[88px] w-[88px] shrink-0">
            {split.total > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    innerRadius="72%"
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
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full rounded-full border-[7px] border-muted" aria-hidden="true" />
            )}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-semibold leading-none tabular-nums text-foreground">{ratePct}%</span>
              <span className="mt-0.5 text-2xs text-muted-foreground">{t('giftCards.value.rateShort')}</span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={SEGMENTS.map((s) => `${label(s.key)}: ${formatCurrency(amounts[s.key])}`).join(', ')}
            >
              {split.total === 0
                ? null
                : SEGMENTS.map((s) => {
                    const pct = (amounts[s.key] / split.total) * 100;
                    if (pct <= 0) return null;
                    return (
                      <Tooltip key={s.key}>
                        <TooltipTrigger asChild>
                          <span
                            className={cn(
                              'h-full transition-[width] duration-700 ease-out first:rounded-l-full last:rounded-r-full',
                              s.bar,
                            )}
                            style={{ width: `${filled ? pct : 0}%` }}
                          />
                        </TooltipTrigger>
                        <TooltipContent>
                          {label(s.key)}: {formatCurrency(amounts[s.key])} ({Math.round(pct)}%)
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              {SEGMENTS.map((s) => {
                const pct = split.total > 0 ? Math.round((amounts[s.key] / split.total) * 100) : 0;
                return (
                  <div key={s.key} className="min-w-0">
                    <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                      <span
                        className={cn(
                          'h-2 w-2 shrink-0 rounded-full',
                          s.bar,
                          s.key === 'outstanding' && amounts.outstanding > 0 && 'motion-safe:animate-pulse',
                        )}
                        aria-hidden="true"
                      />
                      <span className="truncate">{label(s.key)}</span>
                      <span className="tabular-nums">({pct}%)</span>
                    </div>
                    <CurrencyText amount={amounts[s.key]} className={cn('block truncate text-xs font-semibold', s.text)} />
                  </div>
                );
              })}
            </div>
            {split.pending > 0 ? (
              <p className="mt-2 text-2xs text-warning">
                {t('giftCards.value.pendingNote')} <CurrencyText amount={split.pending} className="font-medium" />
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid flex-1 gap-4 border-t border-border pt-3 sm:grid-cols-2">
          <div>
            <p className="text-2xs font-medium text-muted-foreground">{t('giftCards.value.byStatus')}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {stateCounts.map((s) => {
                const active = activeState === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onStateSelect(active ? 'all' : s.key)}
                    className={cn(
                      'inline-flex min-h-[30px] cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', STATE_DOT[s.key])} aria-hidden="true" />
                    {t(`giftCards.status.${s.key}`)}
                    <span className="font-semibold tabular-nums text-foreground">{s.count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-2xs font-medium text-muted-foreground">{t('giftCards.value.bySource')}</p>
            <div className="mt-2 space-y-2.5">
              {sources.map((s) => {
                const Icon = s.key === 'purchased' ? ShoppingBag : HandCoins;
                const pct = sourceTotal > 0 ? (s.value / sourceTotal) * 100 : 0;
                return (
                  <div key={s.key} className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md',
                        s.key === 'purchased' ? 'bg-success-soft text-success' : 'bg-accent-soft text-accent-foreground',
                      )}
                    >
                      <Icon className="h-3 w-3" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs text-foreground">
                          {t(`giftCards.source.${s.key}`)}{' '}
                          <span className="text-2xs tabular-nums text-muted-foreground">×{s.count}</span>
                        </span>
                        <CurrencyText amount={s.value} className="shrink-0 text-xs font-medium" />
                      </div>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <span
                          className={cn(
                            'block h-full rounded-full transition-[width] duration-700 ease-out',
                            s.key === 'purchased' ? 'bg-success' : 'bg-accent',
                          )}
                          style={{ width: filled ? `${Math.max(pct > 0 ? 2 : 0, pct)}%` : 0 }}
                        />
                      </span>
                    </div>
                  </div>
                );
              })}
              {cards.length === 0 ? (
                <p className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <Gift className="h-3 w-3" aria-hidden="true" />
                  {t('giftCards.empty')}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
