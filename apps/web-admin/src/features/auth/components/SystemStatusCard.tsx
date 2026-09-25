import { Activity, Lock, Wifi, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';

import type { ApiHealth, ApiHealthState, HealthSample } from '../useApiHealth';

const DOT: Record<ApiHealthState, string> = {
  checking: 'bg-muted-foreground',
  operational: 'bg-success',
  degraded: 'bg-warning',
  down: 'bg-destructive',
};
const PILL: Record<ApiHealthState, string> = {
  checking: 'bg-muted text-muted-foreground',
  operational: 'bg-success-soft text-success',
  degraded: 'bg-warning-soft text-warning',
  down: 'bg-destructive-soft text-destructive',
};

export function StatusDot({ state }: { state: ApiHealthState }) {
  return (
    <span className="relative flex h-2 w-2" aria-hidden="true">
      {state === 'operational' || state === 'checking' ? (
        <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none', DOT[state])} />
      ) : null}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', DOT[state])} />
    </span>
  );
}

/** Round-trip bars, newest on the right. Failed probes draw as a short red tick so they read without colour. */
function LatencyBars({ samples }: { samples: HealthSample[] }) {
  const { t } = useTranslation();
  const slots = 20;
  const padded: (HealthSample | null)[] = [...Array(Math.max(0, slots - samples.length)).fill(null), ...samples];
  const peak = Math.max(40, ...samples.map((s) => s.ms ?? 0)) * 1.2;
  const ok = samples.filter((s) => s.ms !== null).map((s) => s.ms as number);
  const avg = ok.length ? Math.round(ok.reduce((a, b) => a + b, 0) / ok.length) : null;

  return (
    <figure className="space-y-1.5">
      <div
        role="img"
        aria-label={t('auth.status.chartLabel', { count: samples.length, avg: avg ?? '—' })}
        className="flex h-12 items-end gap-[3px]"
      >
        {padded.map((s, i) => {
          if (!s) return <span key={i} className="h-1 flex-1 rounded-full bg-muted" />;
          if (s.ms === null)
            return (
              <span key={i} className="flex h-full flex-1 items-end justify-center">
                <span className="h-2 w-full rounded-sm bg-destructive" />
              </span>
            );
          const h = Math.max(10, Math.round((s.ms / peak) * 100));
          return (
            <span
              key={i}
              className={cn(
                'flex-1 rounded-t-sm transition-[height] duration-500 ease-out motion-reduce:transition-none',
                s.ms > 800 ? 'bg-warning' : 'bg-primary/80',
              )}
              style={{ height: `${h}%` }}
              title={`${s.ms} ms`}
            />
          );
        })}
      </div>
      <figcaption className="flex justify-between text-2xs text-muted-foreground">
        <span>{t('auth.status.last', { n: slots })}</span>
        <span className="tabular-nums">{t('auth.status.avg', { ms: avg ?? '—' })}</span>
      </figcaption>
    </figure>
  );
}

/** Pre-auth health card: API up/down, round-trip trend, browser connectivity, transport. */
export function SystemStatusCard({ health, className }: { health: ApiHealth; className?: string }) {
  const { t } = useTranslation();
  const online = useOnlineStatus();
  const secure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';

  return (
    <section
      aria-labelledby="sys-status-title"
      className={cn(
        'rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg',
        'animate-in fade-in slide-in-from-bottom-3 duration-500 motion-reduce:animate-none',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="sys-status-title" className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
          {t('auth.status.title')}
        </h2>
        <span
          role="status"
          className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-semibold', PILL[health.state])}
        >
          <StatusDot state={health.state} />
          {t(`auth.status.state.${health.state}`)}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2">
        <Metric label={t('auth.status.latency')} value={health.latency !== null ? `${health.latency}` : '—'} unit="ms" />
        <Metric label={t('auth.status.success')} value={health.successRate !== null ? `${health.successRate}` : '—'} unit="%" />
        <Metric label={t('auth.status.checks')} value={`${health.samples.length}`} />
      </dl>

      <div className="mt-3">
        <LatencyBars samples={health.samples} />
      </div>

      {/* Success-rate meter */}
      <div className="mt-3 space-y-1">
        <div className="flex justify-between text-2xs text-muted-foreground">
          <span>{t('auth.status.availability')}</span>
          <span className="tabular-nums">{health.successRate ?? '—'}%</span>
        </div>
        <div
          role="progressbar"
          aria-label={t('auth.status.availability')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={health.successRate ?? 0}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              'h-full origin-left rounded-full transition-transform duration-500 motion-reduce:transition-none',
              (health.successRate ?? 0) >= 95 ? 'bg-success' : (health.successRate ?? 0) >= 70 ? 'bg-warning' : 'bg-destructive',
            )}
            style={{ transform: `scaleX(${(health.successRate ?? 0) / 100})` }}
          />
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3 text-2xs">
        <li className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5', online ? 'bg-muted text-foreground' : 'bg-warning-soft text-warning')}>
          {online ? <Wifi className="h-3 w-3" aria-hidden="true" /> : <WifiOff className="h-3 w-3" aria-hidden="true" />}
          {online ? t('auth.status.online') : t('auth.status.offline')}
        </li>
        <li className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5', secure ? 'bg-muted text-foreground' : 'bg-warning-soft text-warning')}>
          <Lock className="h-3 w-3" aria-hidden="true" />
          {secure ? t('auth.status.secure') : t('auth.status.insecure')}
        </li>
      </ul>
    </section>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-md bg-muted/60 px-2.5 py-2">
      <dt className="truncate text-2xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums leading-none">
        {value}
        {unit && value !== '—' ? <span className="ml-0.5 text-xs font-medium text-muted-foreground">{unit}</span> : null}
      </dd>
    </div>
  );
}

/** Compact one-line version for narrow screens where the brand panel is hidden. */
export function SystemStatusPill({ health }: { health: ApiHealth }) {
  const { t } = useTranslation();
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold', PILL[health.state])}
    >
      <StatusDot state={health.state} />
      {t('auth.status.api')} · {t(`auth.status.state.${health.state}`)}
      {health.latency !== null && health.state !== 'down' ? <span className="tabular-nums opacity-80" aria-hidden="true">· {health.latency} ms</span> : null}
    </span>
  );
}
