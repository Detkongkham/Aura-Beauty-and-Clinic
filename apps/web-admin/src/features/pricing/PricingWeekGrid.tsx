import { CalendarClock, Radio, TrendingDown, TrendingUp } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { PricingRuleView } from '@abcp/shared-types';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getActiveWeekStart } from '@/lib/format';
import { cn } from '@/lib/utils';

import {
  MINUTES_PER_DAY,
  dayOrder,
  isLiveNow,
  ruleEffect,
  toMinutes,
  weekCoverage,
  type NowContext,
} from './pricingRules';

const HOUR_TICKS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

/** ສີຂອງບລັອກຕາມຜົນຂອງກົດ — ຄູ່ກັບປ້າຍ % ໃນບລັອກສະເໝີ, ບໍ່ສື່ດ້ວຍສີລ້ວນໆ. */
const BLOCK_TONE = {
  discount: 'bg-success-soft text-success border-success/40 hover:border-success/70',
  surge: 'bg-warning-soft text-warning border-warning/40 hover:border-warning/70',
  flat: 'bg-muted text-muted-foreground border-border hover:border-muted-foreground/40',
} as const;

interface PricingWeekGridProps {
  rules: PricingRuleView[];
  now: NowContext;
  conflictIds: Set<string>;
  onSelect?: (rule: PricingRuleView) => void;
  loading?: boolean;
}

/**
 * ຕາຕະລາງອາທິດຂອງກົດລາຄາ — 7 ວັນ × 24 ຊົ່ວໂມງ, ແຕ່ລະກົດເປັນບລັອກທີ່ວາງຕາມ
 * ເວລາຈິງ. ເປັນ "ຮູບຮ່າງ" ຂອງໂມດູນນີ້ຄືກັບ `StockHealthBar` ຂອງ Inventory:
 * ເຫັນຮູຮ່ວາງ, ການຊ້ອນທັບ ແລະ ຊ່ວງ peak ໄດ້ທັນທີ ໂດຍບໍ່ຕ້ອງອ່ານທຸກແຖວ.
 *
 * A11y: ແຕ່ລະບລັອກເປັນ button ທີ່ມີ `aria-label` ເຕັມ (ກົດ · ວັນ · ເວລາ · ຜົນ),
 * ຕາຕະລາງຂ້າງລຸ່ມເປັນ fallback ທີ່ອ່ານຄ່າໄດ້ຄົບ, ແລະ ບລັອກທຸກອັນມີຂໍ້ຄວາມ %
 * ຢູ່ໃນໂຕ ຈຶ່ງບໍ່ໄດ້ອາໄສສີຢ່າງດຽວ.
 */
export function PricingWeekGrid({ rules, now, conflictIds, onSelect, loading = false }: PricingWeekGridProps) {
  const { t } = useTranslation();
  const days = dayOrder(getActiveWeekStart());
  const coverage = weekCoverage(rules);

  if (loading) {
    return <div className="h-[268px] w-full animate-pulse rounded-xl border border-border bg-card" />;
  }

  const segments = [
    { key: 'discount', minutes: coverage.discountMinutes, bar: 'bg-success', dot: 'bg-success', text: 'text-success' },
    { key: 'surge', minutes: coverage.surgeMinutes, bar: 'bg-warning', dot: 'bg-warning', text: 'text-warning' },
    {
      key: 'uncovered',
      minutes: coverage.uncoveredMinutes,
      bar: 'bg-muted-foreground/25',
      dot: 'bg-muted-foreground/40',
      text: 'text-muted-foreground',
    },
  ] as const;

  const segmentLabel: Record<(typeof segments)[number]['key'], string> = {
    discount: t('pricing.grid.legendDiscount'),
    surge: t('pricing.grid.legendSurge'),
    uncovered: t('pricing.grid.legendUncovered'),
  };

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-border bg-card shadow-sm',
        'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
      )}
      style={{ animationDelay: '180ms' }}
      aria-label={t('pricing.grid.title')}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold">{t('pricing.grid.title')}</h2>
          <span className="truncate text-xs text-muted-foreground">
            {t('pricing.grid.coverage', { percent: coverage.coveredPercent })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {segments.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-xs">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', s.dot)} aria-hidden="true" />
              <span className="text-muted-foreground">{segmentLabel[s.key]}</span>
              <span className={cn('font-semibold tabular-nums', s.text)}>
                {Math.round((s.minutes / coverage.totalMinutes) * 100)}%
              </span>
            </span>
          ))}
        </div>
      </header>

      <div className="px-4 pt-3">
        <div
          className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={segments.map((s) => `${segmentLabel[s.key]}: ${Math.round(s.minutes / 60)}h`).join(', ')}
        >
          {segments.map((s) =>
            s.minutes > 0 ? (
              <span
                key={s.key}
                className={cn('h-full transition-[flex-grow] duration-700 ease-out', s.bar)}
                style={{ flexGrow: s.minutes }}
              />
            ) : null,
          )}
        </div>
      </div>

      <div className="overflow-x-auto px-4 pb-4 pt-3">
        <div className="min-w-[680px]">
          {/* ໄມ້ບັນທັດຊົ່ວໂມງ */}
          <div className="flex items-end gap-2 pb-1">
            <span className="w-[88px] shrink-0" aria-hidden="true" />
            <div className="relative h-4 flex-1">
              {HOUR_TICKS.map((h) => (
                <span
                  key={h}
                  className="absolute top-0 -translate-x-1/2 text-2xs tabular-nums text-muted-foreground"
                  style={{ left: `${(h / 24) * 100}%` }}
                  aria-hidden="true"
                >
                  {String(h).padStart(2, '0')}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            {days.map((dow, rowIndex) => {
              const dayRules = rules
                .filter((r) => r.dayOfWeek === dow)
                .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
              const isToday = dow === now.dayOfWeek;

              return (
                <div key={dow} className="flex items-center gap-2">
                  <div className="flex w-[88px] shrink-0 items-center justify-between gap-1 pr-1">
                    <span
                      className={cn(
                        'truncate text-xs',
                        isToday ? 'font-semibold text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {t(`pricing.dowShort.${dow}`)}
                    </span>
                    {dayRules.length > 0 ? (
                      <span className="shrink-0 rounded-full bg-muted px-1.5 text-2xs tabular-nums text-muted-foreground">
                        {dayRules.length}
                      </span>
                    ) : null}
                  </div>

                  <div
                    className={cn(
                      'relative h-9 flex-1 overflow-hidden rounded-md border',
                      isToday ? 'border-primary/30 bg-primary/[0.04]' : 'border-border bg-muted/40',
                    )}
                    style={{
                      backgroundImage:
                        'repeating-linear-gradient(to right, hsl(var(--border)) 0 1px, transparent 1px calc(100% / 8))',
                      backgroundSize: '100% 100%',
                    }}
                  >
                    {dayRules.map((rule, i) => {
                      const start = toMinutes(rule.startTime);
                      const end = toMinutes(rule.endTime);
                      const effect = ruleEffect(rule);
                      const live = isLiveNow(rule, now);
                      const conflicted = conflictIds.has(rule.id);
                      const effectLabel =
                        effect.kind === 'flat'
                          ? t('pricing.effect.none')
                          : effect.kind === 'discount'
                            ? `−${Math.abs(effect.netPercent)}%`
                            : `+${Math.abs(effect.netPercent)}%`;
                      const style: CSSProperties = {
                        left: `${(start / MINUTES_PER_DAY) * 100}%`,
                        width: `${Math.max(2.2, ((end - start) / MINUTES_PER_DAY) * 100)}%`,
                        animationDelay: `${Math.min(rowIndex * 3 + i, 14) * 30}ms`,
                      };
                      const className = cn(
                        'absolute inset-y-1 flex items-center gap-1 overflow-hidden rounded border px-1.5 text-2xs font-medium',
                        'animate-in fade-in zoom-in-95 fill-mode-both duration-300 ease-out motion-reduce:animate-none',
                        'transition-colors duration-150',
                        rule.isActive
                          ? BLOCK_TONE[effect.kind]
                          : 'border-dashed border-border bg-card text-muted-foreground',
                        onSelect &&
                          'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        live && 'ring-2 ring-success ring-offset-1 ring-offset-card',
                        conflicted && rule.isActive && 'ring-1 ring-destructive/60',
                      );
                      const ariaLabel = `${rule.ruleName} \u00b7 ${t(`pricing.dow.${rule.dayOfWeek}`)} ${rule.startTime}\u2013${rule.endTime} \u00b7 ${effectLabel}`;
                      const inner = (
                        <>
                          {live ? (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-success motion-safe:animate-pulse"
                              aria-hidden="true"
                            />
                          ) : null}
                          <span className="truncate tabular-nums">{effectLabel}</span>
                        </>
                      );

                      return (
                        <Tooltip key={rule.id}>
                          <TooltipTrigger asChild>
                            {onSelect ? (
                              <button
                                type="button"
                                onClick={() => onSelect(rule)}
                                style={style}
                                aria-label={ariaLabel}
                                className={className}
                              >
                                {inner}
                              </button>
                            ) : (
                              <div style={style} aria-label={ariaLabel} role="img" className={className}>
                                {inner}
                              </div>
                            )}
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[260px]">
                            <p className="font-medium">{rule.ruleName}</p>
                            <p className="tabular-nums">
                              {rule.startTime}–{rule.endTime} · {effectLabel}
                            </p>
                            <p className="text-muted-foreground">
                              {rule.branchName}
                              {rule.serviceName ? ` · ${rule.serviceName}` : ` · ${t('pricing.allServices')}`}
                            </p>
                            {!rule.isActive ? <p>{t('pricing.pausedTag')}</p> : null}
                            {conflicted && rule.isActive ? <p>{t('pricing.grid.conflictHint')}</p> : null}
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}

                    {isToday ? (
                      <span
                        className="pointer-events-none absolute inset-y-0 z-10 w-px bg-primary"
                        style={{ left: `${(now.minutes / MINUTES_PER_DAY) * 100}%` }}
                        aria-hidden="true"
                      >
                        <span className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-primary" />
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <TrendingDown className="h-3 w-3 text-success" aria-hidden="true" />
              {t('pricing.grid.legendDiscount')}
            </span>
            <span className="inline-flex items-center gap-1">
              <TrendingUp className="h-3 w-3 text-warning" aria-hidden="true" />
              {t('pricing.grid.legendSurge')}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-4 rounded-sm border border-dashed border-border" aria-hidden="true" />
              {t('pricing.pausedTag')}
            </span>
            <span className="inline-flex items-center gap-1">
              <Radio className="h-3 w-3 text-success" aria-hidden="true" />
              {t('pricing.grid.legendLive')}
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
