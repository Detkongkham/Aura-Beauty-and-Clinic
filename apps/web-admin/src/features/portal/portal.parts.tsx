import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  CheckCircle2,
  GripVertical,
  Clock,
  Command,
  Hourglass,
  Plane,
  RefreshCw,
  Star,
  TrendingDown,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Kbd } from '@/components/ui/kbd';
import { CountUp, onSpotlight } from '@/features/site/site.fx';
import { formatCompactNumber, formatCurrency, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import type { DashboardStats } from '@/types/models';

import type { Tile } from './portalModel';
import type { AttentionItem, Badge, Severity } from './usePortalSignals';

const ENTER =
  'animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none';
const LIFT =
  'transition-[transform,box-shadow,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:hover:translate-y-0';
const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

const SEVERITY_CHIP: Record<Severity, string> = {
  danger: 'bg-destructive-soft text-destructive',
  warn: 'bg-warning-soft text-warning',
  info: 'bg-primary-subtle text-primary',
};

const SEVERITY_BAR: Record<Severity, string> = {
  danger: 'bg-destructive',
  warn: 'bg-warning',
  info: 'bg-primary',
};

function useLang(): 'lo' | 'en' {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage === 'en' ? 'en' : 'lo';
}

/* ------------------------------------------------------------------ */
/* Hero bits                                                            */
/* ------------------------------------------------------------------ */

/** HH:mm in Asia/Vientiane, ticking on the minute boundary. */
export function LiveClock() {
  const lang = useLang();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let id: number | undefined;
    const tick = () => {
      setNow(new Date());
      id = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    id = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    return () => window.clearTimeout(id);
  }, []);
  const time = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'lo-LA', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Vientiane',
  }).format(now);
  return (
    <time dateTime={now.toISOString()} className="tabular-nums">
      {time}
    </time>
  );
}

export function HeroChip({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs text-muted-foreground backdrop-blur">
      <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      {children}
    </span>
  );
}

function Delta({ ratio }: { ratio: number }) {
  const { t } = useTranslation();
  if (!Number.isFinite(ratio) || ratio === 0) return null;
  const up = ratio > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-medium tabular-nums',
        up ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive',
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {t('portal.stat.vsYesterday', { pct: `${up ? '+' : ''}${Math.round(ratio * 100)}%` })}
    </span>
  );
}

function StatCell({
  to,
  icon: Icon,
  label,
  value,
  hint,
  hot,
  loading,
  delay,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  hot?: boolean;
  loading?: boolean;
  delay: number;
}) {
  return (
    <Link
      to={to}
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        'group flex min-w-0 flex-col justify-between gap-2 rounded-xl border border-border bg-background/80 p-3.5 backdrop-blur hover:border-primary/40',
        ENTER,
        LIFT,
        FOCUS,
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        <span
          className={cn(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
            hot ? SEVERITY_CHIP.warn : 'bg-primary-subtle text-primary',
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </span>
      {loading ? (
        <span className="block h-7 w-12 animate-pulse rounded bg-muted" />
      ) : (
        <span className="text-2xl font-semibold leading-none tabular-nums">{value}</span>
      )}
      {hint ? <span className="truncate text-2xs text-muted-foreground">{hint}</span> : null}
    </Link>
  );
}

/** Bento of today's figures — the big card is the day's booking progress. */
export function TodayBento({
  stats,
  loading,
  fetching,
  updatedAt,
  onRefresh,
  showRevenue,
}: {
  stats: DashboardStats | undefined;
  loading: boolean;
  fetching: boolean;
  updatedAt: number;
  onRefresh: () => void;
  showRevenue: boolean;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const s = stats;
  const booked = s?.bookingsToday ?? 0;
  const done = s?.completedToday ?? 0;
  const pct = booked > 0 ? Math.min(100, Math.round((done / booked) * 100)) : 0;
  const count = (v: number | undefined) =>
    v == null ? '–' : <CountUp value={String(v)} duration={900} />;

  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t('portal.pulse.title')}</p>
        <button
          type="button"
          onClick={onRefresh}
          className={cn(
            'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-2xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            FOCUS,
          )}
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', fetching && 'animate-spin motion-reduce:animate-none')}
            aria-hidden="true"
          />
          {updatedAt
            ? t('portal.updated', { time: formatRelative(updatedAt, lang) })
            : t('portal.refresh')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {/* Big card — day progress */}
        <Link
          to={ROUTES.appointments}
          className={cn(
            'group col-span-2 flex flex-col justify-between gap-3 rounded-xl border border-primary/20 bg-gradient-to-br from-primary to-primary-strong p-4 text-primary-foreground shadow-sm sm:col-span-1 sm:row-span-2',
            ENTER,
            LIFT,
            FOCUS,
          )}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-xs opacity-90">{t('portal.pulse.bookings')}</span>
            <CalendarCheck className="h-4 w-4 opacity-90" aria-hidden="true" />
          </span>
          <span>
            {loading ? (
              <span className="block h-10 w-16 animate-pulse rounded bg-white/20" />
            ) : (
              <span className="block text-4xl font-semibold leading-none tabular-nums">
                {count(s?.bookingsToday)}
              </span>
            )}
            {s ? (
              <span className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs opacity-90">
                <span>{t('portal.stat.confirmed', { n: s.confirmedToday })}</span>
                <span>{t('portal.stat.walkins', { n: s.walkinsToday })}</span>
              </span>
            ) : null}
          </span>
          <span className="space-y-1.5">
            <span className="flex items-center justify-between text-2xs opacity-90">
              <span>{t('portal.stat.progress', { done, total: booked })}</span>
              <span className="tabular-nums">{pct}%</span>
            </span>
            <span
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('portal.stat.progressLabel')}
              className="block h-1.5 overflow-hidden rounded-full bg-white/20"
            >
              <span
                className="block h-full rounded-full bg-white transition-[width] duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </span>
          </span>
        </Link>

        <StatCell
          to={ROUTES.queue}
          icon={Hourglass}
          label={t('portal.pulse.queue')}
          value={count(s?.queueWaiting)}
          hint={
            s && s.queueLongestWaitMin > 0
              ? t('portal.stat.longestWait', { min: s.queueLongestWaitMin })
              : s?.queueNextNumber
                ? t('portal.stat.nextTicket', { n: s.queueNextNumber })
                : undefined
          }
          hot={(s?.queueWaiting ?? 0) > 0}
          loading={loading}
          delay={40}
        />
        <StatCell
          to={ROUTES.appointments}
          icon={Clock}
          label={t('portal.pulse.pending')}
          value={count(s?.pendingConfirmation)}
          hint={s ? t('portal.stat.next7', { n: s.upcoming7d }) : undefined}
          hot={(s?.pendingConfirmation ?? 0) > 0}
          loading={loading}
          delay={80}
        />
        {showRevenue ? (
          <StatCell
            to={ROUTES.finance}
            icon={Wallet}
            label={t('portal.stat.revenue')}
            value={
              <span title={formatCurrency(s?.revenueToday)}>
                ₭ {formatCompactNumber(s?.revenueToday)}
              </span>
            }
            hint={s ? <Delta ratio={s.revenueTodayDelta} /> : undefined}
            loading={loading}
            delay={120}
          />
        ) : (
          <StatCell
            to={ROUTES.appointments}
            icon={CheckCircle2}
            label={t('portal.stat.completed')}
            value={count(s?.completedToday)}
            hint={s ? <Delta ratio={s.bookingsTodayDelta} /> : undefined}
            loading={loading}
            delay={120}
          />
        )}
        <StatCell
          to={ROUTES.timeOff}
          icon={Plane}
          label={t('portal.pulse.approvals')}
          value={count(s?.pendingApprovals)}
          hot={(s?.pendingApprovals ?? 0) > 0}
          loading={loading}
          delay={160}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Quick actions                                                        */
/* ------------------------------------------------------------------ */

export interface QuickAction {
  id: string;
  icon: LucideIcon;
  label: string;
  to: string;
}

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  const { t } = useTranslation();
  if (actions.length === 0) return null;
  return (
    <nav aria-label={t('portal.quick.title')} className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex w-max gap-2">
        {actions.map((a, i) => {
          const Icon = a.icon;
          return (
            <li key={a.id}>
              <Link
                to={a.to}
                style={{ animationDelay: `${i * 35}ms` }}
                className={cn(
                  'group inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card pl-1.5 pr-4 text-sm font-medium shadow-xs hover:border-primary/40 hover:bg-primary-subtle/50',
                  ENTER,
                  LIFT,
                  FOCUS,
                )}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-subtle text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {a.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Needs attention                                                      */
/* ------------------------------------------------------------------ */

export function AttentionPanel({
  items,
  loading,
}: {
  items: AttentionItem[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  const total = items.reduce((n, it) => n + it.count, 0);
  return (
    <section
      aria-labelledby="portal-attention"
      className={cn('flex flex-col rounded-2xl border border-border bg-card shadow-sm', ENTER)}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 id="portal-attention" className="text-base font-semibold">
            {t('portal.attention.title')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('portal.attention.subtitle')}</p>
        </div>
        {items.length > 0 ? (
          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-semibold tabular-nums text-warning">
            {formatCompactNumber(total)}
          </span>
        ) : null}
      </header>
      {loading ? (
        <ul className="space-y-2 p-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold">{t('portal.attention.allClear')}</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {t('portal.attention.allClearBody')}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((it, i) => {
            const Icon = it.icon;
            return (
              <li key={it.id}>
                <Link
                  to={it.to}
                  style={{ animationDelay: `${i * 30}ms` }}
                  className={cn(
                    'group relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60',
                    ENTER,
                    FOCUS,
                    'focus-visible:ring-inset focus-visible:ring-offset-0',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute inset-y-2 left-0 w-0.5 rounded-full',
                      SEVERITY_BAR[it.severity],
                    )}
                  />
                  <span
                    className={cn(
                      'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      SEVERITY_CHIP[it.severity],
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{it.label}</span>
                    {it.hint ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {it.hint}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-lg font-semibold tabular-nums">{it.count}</span>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* My workspace — pinned + recent                                       */
/* ------------------------------------------------------------------ */

type WorkspaceTab = 'pinned' | 'recent';

export function WorkspacePanel({
  pinned,
  recent,
  label,
  onUnpin,
  onReorder,
}: {
  pinned: Tile[];
  recent: Array<{ tile: Tile; at: number }>;
  label: (t: Tile) => string;
  onUnpin: (to: string) => void;
  /** Move the pin at `from` to index `to`. */
  onReorder: (from: number, to: number) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const [tab, setTab] = useState<WorkspaceTab>(pinned.length > 0 ? 'pinned' : 'recent');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [moved, setMoved] = useState('');
  const sortable = tab === 'pinned' && pinned.length > 1;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= pinned.length || from === to) return;
    onReorder(from, to);
    const tile = pinned[from];
    if (tile) setMoved(t('portal.workspace.moved', { name: label(tile), pos: to + 1, total: pinned.length }));
  };
  const tabs: Array<{ id: WorkspaceTab; label: string; n: number }> = [
    { id: 'pinned', label: t('portal.workspace.pinned'), n: pinned.length },
    { id: 'recent', label: t('portal.workspace.recent'), n: recent.length },
  ];

  const rows =
    tab === 'pinned'
      ? pinned.map((tile) => ({ tile, at: undefined as number | undefined }))
      : recent.map((r) => ({ tile: r.tile, at: r.at as number | undefined }));

  return (
    <section
      aria-labelledby="portal-workspace"
      className={cn('flex flex-col rounded-2xl border border-border bg-card shadow-sm', ENTER)}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 id="portal-workspace" className="text-base font-semibold">
            {t('portal.workspace.title')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('portal.workspace.subtitle')}</p>
        </div>
        <div role="tablist" aria-label={t('portal.workspace.title')} className="flex rounded-full bg-muted p-1">
          {tabs.map((tb) => (
            <button
              key={tb.id}
              type="button"
              role="tab"
              id={`ws-tab-${tb.id}`}
              aria-selected={tab === tb.id}
              aria-controls="ws-panel"
              onClick={() => setTab(tb.id)}
              className={cn(
                'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors',
                FOCUS,
                tab === tb.id
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tb.label}
              <span className="tabular-nums opacity-70">{tb.n}</span>
            </button>
          ))}
        </div>
      </header>

      <div id="ws-panel" role="tabpanel" aria-labelledby={`ws-tab-${tab}`} className="flex-1 p-3">
        {rows.length === 0 ? (
          <p className="flex h-full min-h-32 items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            <Star className="h-4 w-4 shrink-0" aria-hidden="true" />
            {tab === 'pinned' ? t('portal.pinnedEmpty') : t('portal.workspace.recentEmpty')}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {rows.map(({ tile, at }, i) => {
              const Icon = tile.item.icon;
              return (
                <li
                  key={tile.item.to}
                  style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
                  draggable={sortable}
                  onDragStart={(e) => {
                    if (!sortable) return;
                    setDragFrom(i);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', tile.item.to);
                  }}
                  onDragOver={(e) => {
                    if (dragFrom == null) return;
                    e.preventDefault();
                    if (dragOver !== i) setDragOver(i);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragFrom != null) move(dragFrom, i);
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  onDragEnd={() => {
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  className={cn(
                    'group relative rounded-xl transition-[opacity,box-shadow]',
                    ENTER,
                    dragFrom === i && 'opacity-40',
                    dragOver === i && dragFrom !== i && 'ring-2 ring-primary/50',
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      aria-label={t('portal.workspace.reorder', { name: label(tile) })}
                      aria-describedby="ws-reorder-hint"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                          e.preventDefault();
                          move(i, i - 1);
                        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                          e.preventDefault();
                          move(i, i + 1);
                        }
                      }}
                      className={cn(
                        'absolute left-0.5 top-1/2 z-10 inline-flex h-8 w-6 -translate-y-1/2 cursor-grab items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing',
                        FOCUS,
                      )}
                    >
                      <GripVertical className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null}
                  <Link
                    to={tile.item.to}
                    draggable={false}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border border-transparent p-2.5 pr-10 transition-colors hover:border-border hover:bg-muted/50',
                      sortable && 'pl-7',
                      FOCUS,
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1',
                        tile.tone.chip,
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{label(tile)}</span>
                      <span className="block truncate text-2xs text-muted-foreground">
                        {at != null
                          ? t('portal.workspace.openedAgo', { time: formatRelative(at, lang) })
                          : t(`nav.${tile.group}`)}
                      </span>
                    </span>
                  </Link>
                  {tab === 'pinned' ? (
                    <button
                      type="button"
                      onClick={() => onUnpin(tile.item.to)}
                      aria-label={t('portal.unpin', { name: label(tile) })}
                      className={cn(
                        'absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-accent transition-colors hover:bg-muted',
                        FOCUS,
                      )}
                    >
                      <Star className="h-4 w-4 fill-current" aria-hidden="true" />
                    </button>
                  ) : (
                    <ArrowUpRight
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {sortable ? (
          <p id="ws-reorder-hint" className="mt-2 px-1 text-2xs text-muted-foreground">
            {t('portal.workspace.reorderHint')}
          </p>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {moved}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Module tiles                                                         */
/* ------------------------------------------------------------------ */

function BadgePill({ badge, className }: { badge: Badge; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-2xs font-semibold tabular-nums',
        SEVERITY_CHIP[badge.severity],
        className,
      )}
    >
      {badge.count > 99 ? '99+' : badge.count}
    </span>
  );
}

interface TileProps {
  tile: Tile;
  id: string;
  label: string;
  description: string;
  groupLabel: string;
  pinned: boolean;
  active: boolean;
  badge?: Badge;
  lastOpened?: number;
  onTogglePin: () => void;
  style?: CSSProperties;
}

function PinButton({
  pinned,
  label,
  onToggle,
  className,
}: {
  pinned: boolean;
  label: string;
  onToggle: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pinned}
      aria-label={pinned ? t('portal.unpin', { name: label }) : t('portal.pin', { name: label })}
      className={cn(
        'inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-[color,background-color,opacity] duration-150 hover:bg-muted',
        FOCUS,
        pinned
          ? 'text-accent'
          : 'text-muted-foreground opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100',
        className,
      )}
    >
      <Star className={cn('h-4 w-4', pinned && 'fill-current')} aria-hidden="true" />
    </button>
  );
}

export function ModuleCard(p: TileProps) {
  const { t } = useTranslation();
  const lang = useLang();
  const Icon = p.tile.item.icon;
  return (
    <div
      style={p.style}
      onMouseMove={onSpotlight}
      className={cn(
        'spotlight group relative flex h-full flex-col rounded-2xl border bg-card shadow-sm hover:border-primary/40 focus-within:border-primary/40',
        p.active ? 'border-primary ring-2 ring-primary/30' : 'border-border',
        ENTER,
        LIFT,
      )}
    >
      <Link
        id={p.id}
        to={p.tile.item.to}
        className="flex h-full flex-col gap-3 rounded-2xl p-4 focus-visible:outline-none"
      >
        <span className="flex items-start justify-between gap-2 pr-9">
          <span
            className={cn(
              'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform duration-200 group-hover:scale-105 motion-reduce:group-hover:scale-100',
              p.tile.tone.chip,
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          {p.badge ? <BadgePill badge={p.badge} className="mt-1" /> : null}
        </span>
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex items-center gap-1 text-sm font-semibold">
            <span className="truncate">{p.label}</span>
            <ArrowUpRight
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-[opacity,transform] duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100"
              aria-hidden="true"
            />
          </span>
          {p.description ? (
            <span className="line-clamp-2 block text-xs leading-relaxed text-muted-foreground">
              {p.description}
            </span>
          ) : null}
        </span>
        <span className="flex items-center justify-between gap-2 border-t border-border/70 pt-2.5 text-2xs text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', p.tile.tone.dot)} aria-hidden="true" />
            <span className="truncate">{p.groupLabel}</span>
          </span>
          {p.lastOpened ? (
            <span className="shrink-0">
              {t('portal.workspace.openedAgo', { time: formatRelative(p.lastOpened, lang) })}
            </span>
          ) : null}
        </span>
      </Link>
      <PinButton
        pinned={p.pinned}
        label={p.label}
        onToggle={p.onTogglePin}
        className="absolute right-2 top-2"
      />
    </div>
  );
}

export function ModuleRow(p: TileProps) {
  const Icon = p.tile.item.icon;
  return (
    <div
      style={p.style}
      className={cn(
        'group relative flex items-center transition-colors hover:bg-muted/50 focus-within:bg-muted/50',
        p.active && 'bg-primary-subtle/60',
        ENTER,
      )}
    >
      <Link
        id={p.id}
        to={p.tile.item.to}
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 pr-14 focus-visible:outline-none"
      >
        <span
          className={cn(
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1',
            p.tile.tone.chip,
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <span className="w-44 shrink-0 truncate text-sm font-medium">{p.label}</span>
        <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground md:block">
          {p.description}
        </span>
        {p.badge ? <BadgePill badge={p.badge} className="ml-auto shrink-0" /> : null}
      </Link>
      <PinButton
        pinned={p.pinned}
        label={p.label}
        onToggle={p.onTogglePin}
        className="absolute right-3"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Footer cards                                                         */
/* ------------------------------------------------------------------ */

export function ShortcutsCard() {
  const { t } = useTranslation();
  const rows: Array<{ keys: ReactNode; label: string }> = [
    { keys: <Kbd>/</Kbd>, label: t('portal.shortcut.search') },
    {
      keys: (
        <>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          <Kbd>↵</Kbd>
        </>
      ),
      label: t('portal.shortcut.navigate'),
    },
    {
      keys: (
        <>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </>
      ),
      label: t('portal.shortcut.palette'),
    },
    {
      keys: (
        <>
          <Kbd>⌘</Kbd>
          <Kbd>B</Kbd>
        </>
      ),
      label: t('portal.shortcut.sidebar'),
    },
  ];
  return (
    <section
      aria-labelledby="portal-shortcuts"
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="mb-3 flex items-center gap-2">
        <Command className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 id="portal-shortcuts" className="text-sm font-semibold">
          {t('portal.shortcut.title')}
        </h2>
      </div>
      <dl className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 text-xs">
            <dt className="text-muted-foreground">{r.label}</dt>
            <dd className="flex shrink-0 gap-1">{r.keys}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function LinkCard({
  to,
  icon: Icon,
  title,
  body,
  className,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  body: string;
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'group flex items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm hover:border-primary/40',
        LIFT,
        FOCUS,
        className,
      )}
    >
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 space-y-1">
        <span className="flex items-center gap-1 text-sm font-semibold">
          {title}
          <ArrowUpRight
            className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
        <span className="block text-xs leading-relaxed text-muted-foreground">{body}</span>
      </span>
    </Link>
  );
}

