import type { SlipVerdict } from '@abcp/shared-types';
import { Clock3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { TONE } from '@/features/payroll/payroll.lib';
import { cn } from '@/lib/utils';

import { CHECK_ICON, VERDICT_ICON, VERDICT_TONE, useFormatWait } from './slip.lib';
import { CHECK_TONE, agingTone, type SlipCheck } from './slipModel';

/** Verdict pill: icon + word on a tone chip — never colour alone. */
export function SlipVerdictPill({
  verdict,
  className,
}: {
  verdict: SlipVerdict;
  className?: string;
}) {
  const { t } = useTranslation();
  const Icon = VERDICT_ICON[verdict];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium',
        TONE[VERDICT_TONE[verdict]].chip,
        className,
      )}
    >
      <Icon
        className={cn('h-3 w-3 shrink-0', verdict === 'PENDING' && 'motion-safe:animate-pulse')}
        aria-hidden="true"
      />
      {t(`payTreasury.verdict.${verdict}`)}
    </span>
  );
}

/**
 * The four matcher checks as tiny glyph chips for a queue row. Each chip carries its check icon and a
 * state glyph via `aria-label` / `title`, so the row reads as "amount: does not match" to a screen reader.
 */
export function CheckDots({ checks, className }: { checks: SlipCheck[]; className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role="list"
      aria-label={t('payTreasury.slips.checks.title')}
    >
      {checks.map((c) => {
        const Icon = CHECK_ICON[c.key];
        const label = `${t(`payTreasury.slips.checks.${c.key}`)}: ${t(`payTreasury.slips.checkState.${c.state}`)}`;
        return (
          <span
            key={c.key}
            role="listitem"
            aria-label={label}
            title={label}
            className={cn(
              'relative inline-flex h-5 w-5 items-center justify-center rounded-md',
              TONE[CHECK_TONE[c.state]].chip,
              c.state === 'pending' && 'opacity-60',
            )}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            {c.state === 'fail' || c.state === 'unread' ? (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ring-2 ring-card',
                  TONE[CHECK_TONE[c.state]].bar,
                )}
              />
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

/** Match score as a ring gauge with the number inside (score / 100). */
export function ScoreRing({
  score,
  size = 64,
  pending = false,
}: {
  score: number;
  size?: number;
  pending?: boolean;
}) {
  const { t } = useTranslation();
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const tone = pending
    ? 'text-muted-foreground'
    : pct >= 100
      ? 'text-success'
      : pct >= 50
        ? 'text-warning'
        : 'text-destructive';
  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={
        pending
          ? t('payTreasury.slips.scorePending')
          : t('payTreasury.slips.scoreAria', { score: pct })
      }
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={6}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={c}
          strokeDashoffset={pending ? c : c - (pct / 100) * c}
          className={cn(
            tone,
            'transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none',
          )}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={cn('text-base font-semibold tabular-nums', tone)}>
          {pending ? '…' : pct}
        </span>
        <span className="mt-0.5 text-[10px] text-muted-foreground">/100</span>
      </span>
    </div>
  );
}

/** Waiting-time chip, toned against the review SLA; the clock glyph + words carry the meaning. */
export function WaitChip({
  minutes,
  slaMinutes,
  className,
}: {
  minutes: number;
  slaMinutes: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const fmt = useFormatWait();
  const tone = agingTone(minutes, slaMinutes);
  const late = minutes >= slaMinutes;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-2xs font-medium tabular-nums',
        TONE[tone].chip,
        className,
      )}
      title={
        late
          ? t('payTreasury.slips.overSlaTitle', { sla: slaMinutes })
          : t('payTreasury.slips.waitingTitle')
      }
    >
      <Clock3 className="h-3 w-3" aria-hidden="true" />
      {fmt(minutes)}
      {late ? <span className="sr-only">{t('payTreasury.slips.overSla')}</span> : null}
    </span>
  );
}
