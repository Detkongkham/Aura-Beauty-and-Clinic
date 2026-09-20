import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import type { AffiliateView } from '@abcp/shared-types';

import { CurrencyText } from '@/components/shared';
import { CHART_TOOLTIP_STYLE } from '@/features/dashboard/chartTheme';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

interface CommissionFlowCardProps {
  /** Commission already settled through payouts (lifetime earnings − open balance). */
  paidOut: number;
  /** Accrued commission the clinic still owes partners. */
  owing: number;
  /** Partners carrying a non-zero balance — drives the "needs action" hint. */
  owingPartners: number;
  /** Currently filtered roster — powers the rate-band breakdown below the donut. */
  partners: AffiliateView[];
  loading?: boolean;
}

const SEGMENTS = [
  { key: 'paidOut', bar: 'bg-success', dot: 'bg-success', text: 'text-success', hsl: 'hsl(var(--success))' },
  { key: 'owing', bar: 'bg-warning', dot: 'bg-warning', text: 'text-warning', hsl: 'hsl(var(--warning))' },
] as const;

type Band = 'low' | 'mid' | 'high';

const BAND_TEST: Record<Band, (rate: number) => boolean> = {
  low: (r) => r < 0.1,
  mid: (r) => r >= 0.1 && r < 0.2,
  high: (r) => r >= 0.2,
};

const BANDS: { key: Band; bar: string; dot: string }[] = [
  { key: 'low', bar: 'bg-[hsl(var(--chart-1))]', dot: 'bg-[hsl(var(--chart-1))]' },
  { key: 'mid', bar: 'bg-[hsl(var(--chart-2))]', dot: 'bg-[hsl(var(--chart-2))]' },
  { key: 'high', bar: 'bg-[hsl(var(--chart-3))]', dot: 'bg-[hsl(var(--chart-3))]' },
];

/**
 * "Where the commission sits" panel for the Referrals overview — the lifetime
 * earnings figure split into what has already been paid out versus what is still
 * owed (donut + ratio bar), plus a rate-band breakdown of the roster underneath.
 * Mirrors the Inventory `StockHealthBar` treatment (this page's design template)
 * so the two overviews read as one system: same card shell, same fill-in reveal,
 * same legend grammar. `h-full` + the two-section stack keep this card's footprint
 * close to `PartnerLeaderboard`'s (its lg:col-span-3 sibling) instead of leaving a
 * blank gap in the stretched grid row underneath a short card.
 *
 * Both figures are derived from the loaded partner rows, so the split always
 * matches the filtered set shown in the table below it.
 */
export function CommissionFlowCard({
  paidOut,
  owing,
  owingPartners,
  partners,
  loading = false,
}: CommissionFlowCardProps) {
  const { t } = useTranslation();
  const total = paidOut + owing;
  const [filled, setFilled] = useState(false);

  const amounts: Record<(typeof SEGMENTS)[number]['key'], number> = { paidOut, owing };
  const labels: Record<(typeof SEGMENTS)[number]['key'], string> = {
    paidOut: t('referrals.flow.paidOut'),
    owing: t('referrals.flow.owing'),
  };

  useEffect(() => {
    if (loading) return;
    const raf = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(raf);
  }, [loading]);

  const pieData = SEGMENTS.map((s) => ({ name: labels[s.key], value: amounts[s.key], color: s.hsl })).filter(
    (d) => d.value > 0,
  );

  const bandRows = BANDS.map((b) => {
    const members = partners.filter((p) => BAND_TEST[b.key](p.commissionRate));
    return {
      ...b,
      label: t(`referrals.band.${b.key}`),
      count: members.length,
      earnings: members.reduce((sum, p) => sum + p.totalEarnings, 0),
    };
  });
  const maxBandEarnings = Math.max(...bandRows.map((b) => b.earnings), 1);

  if (loading) {
    return <div className="h-full min-h-[168px] w-full animate-pulse rounded-lg border border-border bg-card" />;
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
          <p className="text-sm font-medium text-foreground">{t('referrals.flow.title')}</p>
          <p className="text-xs text-muted-foreground">
            {t('referrals.flow.totalHint')} <CurrencyText amount={total} className="font-medium text-foreground" />
          </p>
        </div>

        <div className="mt-3 flex items-center gap-4">
          {total > 0 ? (
            <div className="h-16 w-16 shrink-0" aria-hidden="true">
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
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : null}

          <div className="min-w-0 flex-1">
            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={SEGMENTS.map((s) => `${labels[s.key]}: ${formatCurrency(amounts[s.key])}`).join(', ')}
            >
              {total === 0
                ? null
                : SEGMENTS.map((s) => {
                    const pct = (amounts[s.key] / total) * 100;
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
                          {labels[s.key]}: {formatCurrency(amounts[s.key])} ({Math.round(pct)}%)
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
              {SEGMENTS.map((s) => {
                const pct = total > 0 ? Math.round((amounts[s.key] / total) * 100) : 0;
                return (
                  <div key={s.key} className="flex items-center gap-1.5 text-xs">
                    <span
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full',
                        s.dot,
                        s.key === 'owing' && owing > 0 && 'animate-pulse',
                      )}
                      aria-hidden="true"
                    />
                    <span className="text-muted-foreground">{labels[s.key]}</span>
                    <CurrencyText amount={amounts[s.key]} className={cn('font-semibold', s.text)} />
                    <span className="text-2xs text-muted-foreground">({pct}%)</span>
                  </div>
                );
              })}
              {owingPartners > 0 ? (
                <span className="text-2xs text-muted-foreground">
                  {t('referrals.flow.owingPartners', { count: owingPartners })}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* ລາຍລະອຽດເພີ່ມ — ແບ່ງລາຍໄດ້ຕາມແຖບອັດຕາຄອມມິຊັ່ນ. ນອກຈາກໃຫ້ຂໍ້ມູນທີ່ເປັນປະໂຫຍດ,
            ພາກນີ້ຍັງດຶງຄວາມສູງຂອງກາດໃຫ້ໃກ້ຄຽງກັບ leaderboard (col-span 3) ຂ້າງໆ —
            grid row ເດີມ stretch wrapper div ຢູ່ແລ້ວ ແຕ່ກາດເກົ່າສັ້ນກວ່າເນື້ອທີ່,
            ຈຶ່ງເຫຼືອບ່ອນຫວ່າງເປົ່າໃຕ້ກາດ (ບັນຫາໃນ screenshot). */}
        <div className="mt-4 flex-1 border-t border-border pt-3">
          <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('referrals.flow.byRate')}
          </p>
          <div className="mt-2.5 space-y-2.5">
            {bandRows.map((b) => (
              <div key={b.key} className="flex items-center gap-2.5">
                <span className={cn('h-2 w-2 shrink-0 rounded-full', b.dot)} aria-hidden="true" />
                <span className="w-20 shrink-0 truncate text-xs text-muted-foreground">{b.label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span
                    className={cn('block h-full rounded-full transition-[width] duration-700 ease-out', b.bar)}
                    style={{ width: filled ? `${Math.max(2, (b.earnings / maxBandEarnings) * 100)}%` : 0 }}
                  />
                </span>
                <span
                  className="w-8 shrink-0 text-right text-2xs tabular-nums text-muted-foreground"
                  title={t('referrals.flow.partnerCount', { count: b.count })}
                >
                  ×{b.count}
                </span>
                <CurrencyText amount={b.earnings} className="w-24 shrink-0 text-right text-xs font-medium" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
