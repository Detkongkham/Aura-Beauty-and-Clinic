import { Activity, Gauge } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { cn } from '@/lib/utils';
import type { QueueSummary, QueueTicket } from '@/types/models';

import {
  CHART_AXIS_TICK,
  CHART_CURSOR_FILL,
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from '../dashboard/chartTheme';
import { ACTIVE_ORDER, LANES, SLA_MIN, urgencyOf, type ActiveStatus } from './queue.lib';

interface Props {
  summary: QueueSummary | null;
  groups: Record<ActiveStatus, QueueTicket[]>;
  /** Today's tickets that were called (issued→called known). */
  calledToday: QueueTicket[];
  now: number;
  fmtWait: (m: number) => string;
}

const HH = (h: number) => String(h).padStart(2, '0');

function CardShell({
  icon: Icon,
  title,
  aside,
  children,
  className,
}: {
  icon: typeof Activity;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm', className)}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          {title}
        </h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

const ARRIVAL = 'hsl(var(--muted-foreground) / 0.45)';
const DONE = 'hsl(var(--chart-1))';

/** Arrivals vs completions per hour (Vientiane) + the service-level health of the live lanes. */
export function QueueInsights({ summary, groups, calledToday, now, fmtWait }: Props) {
  const { t } = useTranslation();

  const hourly = useMemo(() => {
    if (!summary) return [];
    const active = summary.hourly.filter((h) => h.arrivals || h.completions).map((h) => h.hour);
    const nowHour = Number(
      new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Vientiane' }).format(now),
    );
    const lo = Math.min(8, ...active);
    const hi = Math.max(Math.min(20, Math.max(nowHour, lo + 6)), ...active);
    return summary.hourly
      .filter((h) => h.hour >= lo && h.hour <= hi)
      .map((h) => ({ ...h, label: HH(h.hour) }));
  }, [summary, now]);
  const peak = hourly.reduce<(typeof hourly)[number] | null>(
    (best, h) => (h.arrivals > (best?.arrivals ?? 0) ? h : best),
    null,
  );
  const hasFlow = hourly.some((h) => h.arrivals || h.completions);

  // Service level — share of today's called tickets called within the waiting SLA.
  const target = SLA_MIN.WAITING;
  const hit = calledToday.filter(
    (tk) => (new Date(tk.calledAt!).getTime() - new Date(tk.issuedAt).getTime()) / 60_000 <= target,
  ).length;
  const hitPct = calledToday.length ? Math.round((hit / calledToday.length) * 100) : null;
  const noShowPct =
    summary && summary.issuedToday ? Math.round((summary.noShowToday / summary.issuedToday) * 100) : null;

  const laneHealth = ACTIVE_ORDER.map((s) => {
    const list = groups[s];
    const c = { ok: 0, warn: 0, late: 0 };
    for (const tk of list) c[urgencyOf(tk, now).level] += 1;
    return { status: s, total: list.length, ...c };
  });

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <CardShell
        icon={Activity}
        title={t('queue.flowTitle')}
        aside={
          <div className="flex items-center gap-3">
            <LegendDot color={ARRIVAL} label={t('queue.arrivals')} />
            <LegendDot color={DONE} label={t('queue.completions')} />
          </div>
        }
      >
        {hasFlow ? (
          <>
            <p className="mt-1 text-2xs text-muted-foreground">
              {peak && peak.arrivals > 0
                ? t('queue.peakArrivals', { hour: peak.label, n: peak.arrivals })
                : t('queue.flowHint')}
            </p>
            <div className="mt-3 h-44" role="img" aria-label={t('queue.flowTitle')}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourly} barGap={2} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} interval={0} />
                  <YAxis allowDecimals={false} tick={CHART_AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: CHART_CURSOR_FILL }}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                    labelFormatter={(l) => `${l}:00 – ${l}:59`}
                  />
                  <Bar dataKey="arrivals" name={t('queue.arrivals')} fill={ARRIVAL} radius={[3, 3, 0, 0]} maxBarSize={14} />
                  <Bar dataKey="completions" name={t('queue.completions')} fill={DONE} radius={[3, 3, 0, 0]} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="mt-3 flex h-44 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-center">
            <p className="text-sm font-medium">{t('queue.flowEmpty')}</p>
            <p className="text-2xs text-muted-foreground">{t('queue.flowEmptyHint')}</p>
          </div>
        )}
      </CardShell>

      <CardShell icon={Gauge} title={t('queue.serviceLevel')}>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            {
              label: t('queue.calledWithin', { n: target }),
              value: hitPct == null ? '–' : `${hitPct}%`,
              tone: hitPct == null ? '' : hitPct >= 80 ? 'text-success' : hitPct >= 60 ? 'text-warning' : 'text-destructive',
            },
            {
              label: t('queue.p90Wait'),
              value: summary?.p90WaitMin == null ? '–' : fmtWait(summary.p90WaitMin),
              tone: '',
            },
            {
              label: t('queue.noShowRate'),
              value: noShowPct == null ? '–' : `${noShowPct}%`,
              tone: noShowPct != null && noShowPct >= 10 ? 'text-destructive' : '',
            },
          ].map((m) => (
            <div key={m.label} className="rounded-lg bg-muted/40 px-2.5 py-2">
              <p className="line-clamp-2 min-h-[2lh] text-2xs leading-snug text-muted-foreground">{m.label}</p>
              <p className={cn('mt-0.5 text-lg font-semibold tabular-nums', m.tone)}>{m.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2.5">
          <p className="text-2xs font-medium text-muted-foreground">{t('queue.laneHealth')}</p>
          {laneHealth.map((l) => {
            const lane = LANES.find((x) => x.status === l.status)!;
            const Icon = lane.icon;
            return (
              <div key={l.status} className="flex items-center gap-2.5">
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="w-24 shrink-0 truncate text-xs">{t(`status.${l.status}`)}</span>
                <div
                  className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={t('queue.laneHealthAria', { ok: l.ok, warn: l.warn, late: l.late })}
                >
                  {l.total > 0 ? (
                    <>
                      <span className="h-full bg-success" style={{ width: `${(l.ok / l.total) * 100}%` }} />
                      <span className="h-full bg-warning" style={{ width: `${(l.warn / l.total) * 100}%` }} />
                      <span className="h-full bg-destructive" style={{ width: `${(l.late / l.total) * 100}%` }} />
                    </>
                  ) : null}
                </div>
                <span className="w-14 shrink-0 text-right text-2xs tabular-nums text-muted-foreground">
                  {l.late > 0 ? (
                    <span className="font-semibold text-destructive">{t('queue.slaBreached', { n: l.late })}</span>
                  ) : (
                    l.total
                  )}
                </span>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-3 pt-1">
            <LegendDot color="hsl(var(--success))" label={t('queue.onTime')} />
            <LegendDot color="hsl(var(--warning))" label={t('queue.nearLimit')} />
            <LegendDot color="hsl(var(--destructive))" label={t('queue.late')} />
          </div>
        </div>
      </CardShell>
    </div>
  );
}
