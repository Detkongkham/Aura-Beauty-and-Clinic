import { useEffect, useState, type ReactNode } from 'react';
import {
  Crown,
  Layers,
  Receipt,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import type { PaymentMethod } from '@abcp/shared-types';

import { CurrencyText } from '@/components/shared';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CHART_TOOLTIP_STYLE } from '@/features/dashboard/chartTheme';
import { formatCompactNumber, formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

import { paymentMethodKey } from './finance.lib';
import { METHOD_COLOR, METHOD_ICON } from './finance.methods';

interface MethodRow {
  method: PaymentMethod;
  amount: number;
  count: number;
}

interface PaymentMethodBreakdownProps {
  rows: MethodRow[];
  loading?: boolean;
}

/** Rank-1 medal ring, echoing `PartnerLeaderboard`'s gold/silver/bronze system. */
const MEDAL: Record<number, string> = {
  0: 'ring-amber-400/50',
  1: 'ring-slate-400/50',
  2: 'ring-orange-400/50',
};

/**
 * Revenue-by-method spotlight for the Finance overview — its own signature, not
 * a copy of `StockHealthBar` / `CommissionFlowCard`: a donut with the grand
 * total set *inside* the ring (read the number without leaving the shape), a
 * "leading method" crown callout in the header, and ranked rows that carry a
 * medal tint on the icon chip plus an explicit share-of-total badge next to
 * the amount — so the split-tender mix reads as a ranking, not just a bar list.
 */
export function PaymentMethodBreakdown({ rows, loading = false }: PaymentMethodBreakdownProps) {
  const { t } = useTranslation();
  const [filled, setFilled] = useState(false);

  const sorted = rows.slice().sort((a, b) => b.amount - a.amount);
  const total = sorted.reduce((s, r) => s + r.amount, 0);
  const totalCount = sorted.reduce((s, r) => s + r.count, 0);
  const max = Math.max(...sorted.map((r) => r.amount), 1);
  const leader = sorted[0];
  const leaderShare = leader && total > 0 ? Math.round((leader.amount / total) * 100) : 0;
  const avgTicket = totalCount > 0 ? total / totalCount : 0;
  const busiest = sorted.reduce<MethodRow | null>(
    (best, r) => (!best || r.count > best.count ? r : best),
    null,
  );

  useEffect(() => {
    if (loading) return;
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, [loading]);

  const pieData = sorted.map((r) => ({
    name: t(paymentMethodKey(r.method)),
    value: r.amount,
    color: METHOD_COLOR[r.method].hsl,
  }));

  if (loading) {
    return <div className="h-full min-h-[220px] w-full animate-pulse rounded-xl border border-border bg-card" />;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className={cn(
          'relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm',
          'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
        )}
        style={{ animationDelay: '180ms' }}
      >
        <span
          className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-primary/[0.06] blur-2xl"
          aria-hidden="true"
        />

        <div className="relative flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">{t('finance.byMethod')}</p>
              <p className="text-2xs text-muted-foreground">
                {t('finance.byMethodCount', { count: totalCount })}
              </p>
            </div>
          </div>
          {leader ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-2xs font-medium text-primary">
              <Crown className="h-3 w-3 shrink-0" aria-hidden="true" />
              {t('finance.byMethodLeader', { method: t(paymentMethodKey(leader.method)), pct: leaderShare })}
            </span>
          ) : null}
        </div>

        {sorted.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-6 text-center text-xs text-muted-foreground">
            {t('finance.byMethodEmpty')}
          </div>
        ) : (
          <div className="relative mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="relative mx-auto h-32 w-32 shrink-0 sm:mx-0" aria-label={formatCurrency(total, 'LAK')}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    innerRadius="70%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                    isAnimationActive
                    animationDuration={700}
                    paddingAngle={pieData.length > 1 ? 3 : 0}
                  >
                    {pieData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    formatter={(value: number) => formatCurrency(value, 'LAK')}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div
                className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
                aria-hidden="true"
              >
                <p className="text-2xs uppercase tracking-wide text-muted-foreground">
                  {t('finance.byMethodTotal')}
                </p>
                <p className="text-base font-bold tabular-nums leading-tight text-foreground">
                  ₭{formatCompactNumber(total)}
                </p>
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-2">
              {sorted.map((r, i) => {
                const Icon = METHOD_ICON[r.method];
                const color = METHOD_COLOR[r.method];
                const barPct = total > 0 ? (r.amount / max) * 100 : 0;
                const sharePct = total > 0 ? Math.round((r.amount / total) * 100) : 0;
                const medal = MEDAL[i];
                return (
                  <Tooltip key={r.method}>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          'group flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition-colors duration-150',
                          i === 0 && 'bg-primary/[0.03]',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/90 ring-2 ring-offset-2 ring-offset-card transition-transform duration-200 group-hover:scale-105',
                            color.bar,
                            medal ?? 'ring-transparent',
                          )}
                          aria-hidden="true"
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <span className="w-24 shrink-0 truncate text-sm text-muted-foreground">
                          {t(paymentMethodKey(r.method))}
                        </span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <span
                            className={cn(
                              'block h-full rounded-full transition-[width] duration-700 ease-out',
                              i === 0 ? cn('bg-gradient-to-r from-primary/25', color.to) : color.bar,
                            )}
                            style={{ width: `${filled ? barPct : 0}%` }}
                          />
                        </span>
                        <span
                          className={cn(
                            'w-9 shrink-0 rounded-full py-0.5 text-center text-2xs font-semibold tabular-nums',
                            i === 0 ? cn('bg-primary/10', color.text) : 'text-muted-foreground',
                          )}
                        >
                          {sharePct}%
                        </span>
                        <span className="w-24 shrink-0 text-right text-sm tabular-nums font-medium">
                          <CurrencyText amount={r.amount} />
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t(paymentMethodKey(r.method))}: {formatCurrency(r.amount, 'LAK')} ·{' '}
                      {t('finance.byMethodCount', { count: r.count })}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        )}

        {sorted.length > 0 ? (
          <div className="relative mt-4 flex-1 border-t border-border pt-3">
            <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('finance.byMethodInsights')}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-6 gap-y-2.5">
              <InsightItem
                icon={Receipt}
                label={t('finance.byMethodAvgTicket')}
                value={<CurrencyText amount={avgTicket} className="font-semibold text-foreground" />}
              />
              {busiest ? (
                <InsightItem
                  icon={Zap}
                  label={t('finance.byMethodBusiest')}
                  value={
                    <>
                      {t(paymentMethodKey(busiest.method))}{' '}
                      <span className="text-muted-foreground">×{busiest.count.toLocaleString()}</span>
                    </>
                  }
                />
              ) : null}
              <InsightItem
                icon={Layers}
                label={t('finance.byMethodActive')}
                value={String(sorted.length)}
              />
            </div>
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

function InsightItem({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="h-3 w-3" aria-hidden="true" />
      </span>
      <div className="leading-tight">
        <p className="text-2xs text-muted-foreground">{label}</p>
        <p className="text-xs tabular-nums">{value}</p>
      </div>
    </div>
  );
}
