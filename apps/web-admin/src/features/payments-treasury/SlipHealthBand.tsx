import type { SlipFlag, SlipMismatchField, SlipSummary } from '@abcp/shared-types';
import {
  AlarmClock,
  Ban,
  ChevronRight,
  Copy,
  FileWarning,
  Gauge,
  Landmark,
  MessageCircleQuestion,
  ScanLine,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CurrencyText } from '@/components/shared';
import { SegmentBar, SegmentLegend, type Segment } from '@/features/payroll/payroll.parts';
import { TONE, type Tone } from '@/features/payroll/payroll.lib';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

import { useFormatWait } from './slip.lib';
import { WaitChip } from './slip.parts';

interface Props {
  summary: SlipSummary | undefined;
  loading: boolean;
  now: number;
  onFlag: (flag: SlipFlag) => void;
  onOldest: () => void;
  onView: (v: 'action' | 'approved' | 'rejected') => void;
}

const MISMATCH_ORDER: SlipMismatchField[] = [
  'amount',
  'receiverAccount',
  'transferredAt',
  'txnRef',
  'currency',
];

/**
 * Review health: what is waiting (and for how long), what needs attention first, and how today and
 * the last seven days went. Every attention row is a one-click filter. Figures come from
 * `/slips/summary`, so they stay right past the 100 rows the queue holds.
 */
export function SlipHealthBand({ summary: s, loading, now, onFlag, onOldest, onView }: Props) {
  const { t } = useTranslation();
  const fmtWait = useFormatWait();

  if (loading || !s) {
    return (
      <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr_1fr]" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-[184px] animate-pulse rounded-xl border border-border bg-card"
          />
        ))}
      </div>
    );
  }

  const open = s.open.needsReview + s.open.autoMatched + s.open.pending;
  const segments: Segment[] = [
    {
      key: 'needs',
      value: s.open.needsReview,
      tone: 'warning',
      label: t('payTreasury.slips.stat.needsReview'),
    },
    {
      key: 'ready',
      value: s.open.autoMatched,
      tone: 'info',
      label: t('payTreasury.slips.stat.autoMatched'),
    },
    {
      key: 'reading',
      value: s.open.pending,
      tone: 'neutral',
      label: t('payTreasury.slips.stat.processing'),
    },
  ];
  const oldestMin = s.open.oldestAt
    ? Math.max(0, Math.floor((now - new Date(s.open.oldestAt).getTime()) / 60_000))
    : null;
  const topMismatch = MISMATCH_ORDER.map((f) => ({ f, n: s.week.mismatch[f] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  const maxDay = Math.max(1, ...s.week.daily.map((d) => d.uploaded));

  return (
    <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr_1fr]">
      {/* ── Queue ─────────────────────────────────────────── */}
      <section
        aria-labelledby="slip-queue-h"
        className="relative overflow-hidden rounded-xl border border-border bg-card p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 motion-reduce:animate-none"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
        />
        <p id="slip-queue-h" className="text-xs font-medium text-muted-foreground">
          {t('payTreasury.slips.health.waiting')}
        </p>
        <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={() => onView('action')}
            className="rounded-md text-3xl font-semibold leading-none tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {open}
          </button>
          <span className="pb-0.5 text-sm text-muted-foreground">
            {s.open.amount > 0 ? (
              <>
                {t('payTreasury.slips.health.toConfirm')}{' '}
                <CurrencyText
                  amount={s.open.amount}
                  currency="LAK"
                  className="font-semibold text-foreground"
                />
              </>
            ) : (
              t('payTreasury.slips.health.allClear')
            )}
          </span>
        </div>
        <SegmentBar
          className="mt-3"
          height="h-2.5"
          segments={segments}
          ariaLabel={segments.map((x) => `${x.label} ${x.value}`).join(', ')}
        />
        <div className="mt-2">
          <SegmentLegend segments={segments} render={(x) => x.value} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-3 text-xs">
          {oldestMin != null ? (
            <button
              type="button"
              onClick={onOldest}
              className="inline-flex items-center gap-1.5 rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('payTreasury.slips.health.oldest')}
              <WaitChip minutes={oldestMin} slaMinutes={s.slaMinutes} />
            </button>
          ) : (
            <span className="text-muted-foreground">
              {t('payTreasury.slips.health.nothingWaiting')}
            </span>
          )}
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">
            {t('payTreasury.slips.health.sla', { m: s.slaMinutes })}
          </span>
        </div>
      </section>

      {/* ── Needs attention ───────────────────────────────── */}
      <section
        aria-labelledby="slip-attn-h"
        className="rounded-xl border border-border bg-card p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 [animation-delay:60ms] motion-reduce:animate-none"
      >
        <p id="slip-attn-h" className="text-xs font-medium text-muted-foreground">
          {t('payTreasury.slips.health.attention')}
        </p>
        <ul className="mt-2 space-y-1">
          <AttentionRow
            icon={AlarmClock}
            tone={s.open.overSla > 0 ? 'danger' : 'neutral'}
            label={t('payTreasury.slips.health.overSla', { m: s.slaMinutes })}
            value={s.open.overSla}
            onClick={onOldest}
          />
          <AttentionRow
            icon={ScanLine}
            tone={s.open.ocrFailed > 0 ? 'warning' : 'neutral'}
            label={t('payTreasury.slips.flag.ocrFailed')}
            value={s.open.ocrFailed}
            onClick={() => onFlag('ocrFailed')}
          />
          <AttentionRow
            icon={Copy}
            tone={s.open.duplicates > 0 ? 'danger' : 'neutral'}
            label={t('payTreasury.slips.health.duplicates')}
            value={s.open.duplicates}
            onClick={() => onFlag('duplicate')}
          />
          <AttentionRow
            icon={FileWarning}
            tone={s.open.risky > 0 ? 'danger' : 'neutral'}
            label={t('payTreasury.slips.health.risky')}
            value={s.open.risky}
            onClick={() => onFlag('risk')}
          />
          <AttentionRow
            icon={MessageCircleQuestion}
            tone={s.open.infoRequested > 0 ? 'warning' : 'neutral'}
            label={t('payTreasury.slips.health.infoRequested')}
            value={s.open.infoRequested}
            onClick={() => onFlag('infoRequested')}
          />
        </ul>
        {topMismatch.length > 0 ? (
          <div className="mt-3 border-t border-dashed border-border pt-2.5">
            <p className="text-2xs text-muted-foreground">
              {t('payTreasury.slips.health.topFail')}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {topMismatch.map(({ f, n }) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onFlag(f === 'currency' ? 'amount' : f)}
                  className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-2xs font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t(`payTreasury.slips.flag.${f === 'currency' ? 'amount' : f}`)}
                  <span className="tabular-nums text-muted-foreground">{n}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* ── Today + 7 days ────────────────────────────────── */}
      <section
        aria-labelledby="slip-today-h"
        className="rounded-xl border border-border bg-card p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 [animation-delay:120ms] motion-reduce:animate-none"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p id="slip-today-h" className="text-xs font-medium text-muted-foreground">
              {t('payTreasury.slips.health.today')}
            </p>
            <button
              type="button"
              onClick={() => onView('approved')}
              className="mt-1 block rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CurrencyText
                amount={s.today.approvedAmount}
                currency="LAK"
                className="text-xl font-semibold tabular-nums"
              />
            </button>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {t('payTreasury.slips.health.todayLine', {
                approved: s.today.approved,
                auto: s.today.autoApproved,
                rejected: s.today.rejected,
                uploaded: s.today.uploaded,
              })}
            </p>
          </div>
        </div>

        <div
          className="mt-3 flex h-12 items-end gap-1.5"
          role="img"
          aria-label={s.week.daily
            .map((d) =>
              t('payTreasury.slips.health.dayAria', {
                date: formatDate(d.date),
                up: d.uploaded,
                ok: d.approved,
              }),
            )
            .join('; ')}
        >
          {s.week.daily.map((d, i) => (
            <div
              key={d.date}
              className="flex h-full flex-1 flex-col justify-end"
              title={`${formatDate(d.date)} · ${d.uploaded} / ${d.approved}`}
            >
              <div
                className={cn(
                  'relative w-full overflow-hidden rounded-sm bg-muted',
                  i === s.week.daily.length - 1 && 'ring-1 ring-primary/40',
                )}
                style={{ height: `${Math.max(8, (d.uploaded / maxDay) * 100)}%` }}
              >
                <div
                  className="absolute inset-x-0 bottom-0 bg-primary/70"
                  style={{
                    height: d.uploaded ? `${Math.min(100, (d.approved / d.uploaded) * 100)}%` : 0,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-muted ring-1 ring-border" aria-hidden="true" />
            {t('payTreasury.slips.health.legendUploaded')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-primary/70" aria-hidden="true" />
            {t('payTreasury.slips.health.legendApproved')}
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-dashed border-border pt-3">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-2xs leading-tight text-muted-foreground">
                {t('payTreasury.slips.health.autoRate')}
              </dt>
              <dd className="text-sm font-semibold tabular-nums">
                {s.week.autoMatchRate == null ? '—' : `${s.week.autoMatchRate}%`}
              </dd>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <dt className="text-2xs leading-tight text-muted-foreground">
                {t('payTreasury.slips.health.medianReview')}
              </dt>
              <dd className="text-sm font-semibold tabular-nums">
                {s.week.medianReviewMinutes == null ? '—' : fmtWait(s.week.medianReviewMinutes)}
              </dd>
            </div>
          </div>
        </dl>
      </section>
    </div>
  );
}

function AttentionRow({
  icon: Icon,
  tone,
  label,
  value,
  onClick,
}: {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: number;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={value === 0}
        className={cn(
          'group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left outline-none transition-colors',
          'hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent',
        )}
      >
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
            TONE[tone].chip,
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span
          className={cn('min-w-0 flex-1 truncate text-sm', value === 0 && 'text-muted-foreground')}
        >
          {label}
        </span>
        <span
          className={cn(
            'text-sm font-semibold tabular-nums',
            value > 0 ? TONE[tone].text : 'text-muted-foreground',
          )}
        >
          {value}
        </span>
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5',
            value === 0 && 'invisible',
          )}
          aria-hidden="true"
        />
      </button>
    </li>
  );
}

/**
 * S8/S9 — second insight row: how well the reader does per bank (7 days) and why slips were rejected.
 * Ranked bars with the figure printed on every row — never colour alone.
 */
export function SlipInsightsRow({ summary: s }: { summary: SlipSummary | undefined }) {
  const { t } = useTranslation();
  if (!s) return null;
  const banks = s.week.byBank.slice(0, 5);
  const reasons = Object.entries(s.week.rejectCodes)
    .map(([code, n]) => ({ code, n: n ?? 0 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n);
  const maxReason = Math.max(1, ...reasons.map((r) => r.n));
  if (banks.length === 0 && reasons.length === 0) return null;

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section
        aria-labelledby="slip-banks-h"
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
      >
        <p
          id="slip-banks-h"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          <Landmark className="h-3.5 w-3.5" aria-hidden="true" />
          {t('payTreasury.slips.insights.banks')}
        </p>
        {banks.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {t('payTreasury.slips.insights.none')}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {banks.map((b) => (
              <li
                key={b.bankCode}
                className="grid grid-cols-[64px_1fr_auto] items-center gap-2 text-xs"
              >
                <span className="truncate font-medium">
                  {b.bankCode === '?' ? t('payTreasury.slips.insights.unknownBank') : b.bankCode}
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span
                    className={cn(
                      'block h-full rounded-full',
                      b.rate >= 80 ? 'bg-success' : b.rate >= 50 ? 'bg-warning' : 'bg-destructive',
                    )}
                    style={{ width: `${b.rate}%` }}
                  />
                </span>
                <span className="tabular-nums text-muted-foreground">
                  <span className="font-semibold text-foreground">{b.rate}%</span> ·{' '}
                  {t('payTreasury.slips.insights.ofSlips', { n: b.processed })}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-2xs text-muted-foreground">
          {t('payTreasury.slips.insights.banksHint')}
        </p>
      </section>

      <section
        aria-labelledby="slip-reasons-h"
        className="rounded-xl border border-border bg-card p-4 shadow-sm"
      >
        <p
          id="slip-reasons-h"
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
        >
          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
          {t('payTreasury.slips.insights.reasons')}
        </p>
        {reasons.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {t('payTreasury.slips.insights.noRejects')}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {reasons.map((r) => (
              <li
                key={r.code}
                className="grid grid-cols-[minmax(0,1fr)_96px_24px] items-center gap-2 text-xs"
              >
                <span className="truncate">{t(`payTreasury.slips.rejectCode.${r.code}`)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-destructive/70"
                    style={{ width: `${(r.n / maxReason) * 100}%` }}
                  />
                </span>
                <span className="text-right font-semibold tabular-nums">{r.n}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
