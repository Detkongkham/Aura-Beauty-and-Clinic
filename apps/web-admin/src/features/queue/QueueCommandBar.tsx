import {
  BarChart3,
  CalendarClock,
  ChevronDown,
  Crown,
  LayoutGrid,
  List,
  Play,
  Plus,
  RefreshCw,
  Rows2,
  Rows3,
  Sparkles,
  Tv,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { QueueSearchField } from './QueueSearchField';
import { QUEUE_MODES, type QueueMode } from './queue.lib';

export type Density = 'comfortable' | 'compact';
export type TagFilter = 'VIP' | 'APPOINTMENT' | 'NEW';

const MODE_ICON: Record<QueueMode, typeof LayoutGrid> = {
  board: LayoutGrid,
  list: List,
  summary: BarChart3,
  wall: Tv,
};

const TAG_ICON: Record<TagFilter, typeof Crown> = {
  VIP: Crown,
  APPOINTMENT: CalendarClock,
  NEW: Sparkles,
};

interface Props {
  /** Board data is loaded — show the full control set, not just the title. */
  ready: boolean;
  branchLabel: string;
  mode: QueueMode;
  onMode: (m: QueueMode) => void;
  query: string;
  onQuery: (v: string) => void;
  searchRef: RefObject<HTMLInputElement>;
  matchCount: number | null;
  tagFilter: TagFilter | null;
  onTagFilter: (f: TagFilter | null) => void;
  tagCounts: Record<TagFilter, number>;
  staffFilter: string;
  onStaffFilter: (name: string) => void;
  staffOptions: string[];
  dataUpdatedAt: number;
  paused: boolean;
  onTogglePaused: () => void;
  isFetching: boolean;
  onRefresh: () => void;
  density: Density;
  onToggleDensity: () => void;
  sound: boolean;
  onToggleSound: () => void;
  canManage: boolean;
  onWalkIn: () => void;
}

const STALE_MS = 45_000;

/** Ticking wall clock in Vientiane time — the front desk's reference for every wait figure. */
function LiveClock() {
  const { i18n } = useTranslation();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(id);
  }, []);
  const locale = i18n.language === 'lo' ? 'lo-LA' : 'en-GB';
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Vientiane',
  }).format(now);
  const day = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Asia/Vientiane',
  }).format(now);
  return (
    <div className="hidden text-right sm:block" aria-hidden="true">
      <p className="text-xl font-semibold leading-none tabular-nums tracking-tight">{time}</p>
      <p className="mt-1 text-2xs text-muted-foreground">{day}</p>
    </div>
  );
}

/** Live freshness pill — green while current, amber once the data goes stale; a click
 *  toggles the 15s auto-refresh. */
function LivePill({
  dataUpdatedAt,
  paused,
  onToggle,
}: {
  dataUpdatedAt: number;
  paused: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  const ageMs = dataUpdatedAt ? Date.now() - dataUpdatedAt : 0;
  const stale = !paused && ageMs > STALE_MS;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={paused}
      title={paused ? t('queue.resumeLive') : t('queue.pauseLive')}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors duration-150',
        paused
          ? 'border-border bg-muted/60 text-muted-foreground hover:bg-muted'
          : stale
            ? 'border-warning/40 bg-warning-soft text-warning'
            : 'border-success/30 bg-success-soft/60 text-success hover:bg-success-soft',
      )}
    >
      {paused ? (
        <Play className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <span className="relative flex h-2 w-2" aria-hidden="true">
          {!stale ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60 motion-reduce:animate-none" />
          ) : null}
          <span
            className={cn('relative inline-flex h-2 w-2 rounded-full', stale ? 'bg-warning' : 'bg-success')}
          />
        </span>
      )}
      <span className="whitespace-nowrap tabular-nums">
        {paused ? (
          t('queue.paused')
        ) : stale ? (
          t('queue.stale', { s: Math.round(ageMs / 1000) })
        ) : (
          <>
            {t('queue.live')} · <DateTimeText value={dataUpdatedAt || undefined} mode="time" />
          </>
        )}
      </span>
    </button>
  );
}

function Segmented({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 shadow-xs"
    >
      {children}
    </div>
  );
}

export function QueueCommandBar(props: Props) {
  const { t } = useTranslation();
  const {
    ready,
    branchLabel,
    mode,
    onMode,
    query,
    onQuery,
    searchRef,
    matchCount,
    tagFilter,
    onTagFilter,
    tagCounts,
    staffFilter,
    onStaffFilter,
    staffOptions,
    canManage,
    onWalkIn,
  } = props;

  const filtersActive = tagFilter != null || !!staffFilter || !!query;
  const workView = mode === 'board' || mode === 'list';

  return (
    <StickyPageHeader className="space-y-3">
      {/* ── title row ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl">{t('nav.queue')}</h1>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>{t('queue.subtitle')}</span>
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-border" />
            <span className="font-medium text-foreground">{branchLabel}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <LiveClock />
          <span aria-hidden="true" className="mx-1 hidden h-8 w-px bg-border sm:block" />
          <LivePill
            dataUpdatedAt={props.dataUpdatedAt}
            paused={props.paused}
            onToggle={props.onTogglePaused}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            aria-pressed={props.sound}
            aria-label={props.sound ? t('queue.soundOff') : t('queue.soundOn')}
            title={props.sound ? t('queue.soundOff') : t('queue.soundOn')}
            onClick={props.onToggleSound}
          >
            {props.sound ? (
              <Volume2 className="h-4 w-4 text-primary" aria-hidden="true" />
            ) : (
              <VolumeX className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            aria-label={t('queue.refresh')}
            title={t('queue.refresh')}
            onClick={props.onRefresh}
          >
            <RefreshCw
              className={cn('h-4 w-4', props.isFetching && 'animate-spin motion-reduce:animate-none')}
              aria-hidden="true"
            />
          </Button>
          {canManage ? (
            <Button size="md" onClick={onWalkIn} className="gap-2" title={`${t('walkIn.title')} (N)`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('walkIn.title')}</span>
              <kbd
                aria-hidden="true"
                className="hidden h-5 min-w-5 items-center justify-center rounded bg-primary-foreground/15 px-1 font-mono text-2xs lg:inline-flex"
              >
                N
              </kbd>
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── toolbar: views first, then filters for the work views ───── */}
      {!ready ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label={t('queue.viewMode')}
            className="flex items-center gap-1 rounded-lg bg-muted p-1"
          >
            {QUEUE_MODES.map((m, i) => {
              const Icon = MODE_ICON[m];
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onMode(m)}
                  title={`${t(`queue.mode_${m}`)} (${i + 1})`}
                  className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-150',
                    active ? 'bg-card text-primary shadow-xs' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className={cn(!active && 'hidden sm:inline')}>{t(`queue.mode_${m}`)}</span>
                </button>
              );
            })}
          </div>

          {workView ? (
            <>
              <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-border md:block" />
              <QueueSearchField
                ref={searchRef}
                value={query}
                onChange={onQuery}
                placeholder={t('queue.searchPlaceholder')}
                shortcut="/"
                className="min-w-[180px] flex-1 md:max-w-[260px]"
              />

              <Segmented label={t('queue.filterTag')}>
                {(['VIP', 'APPOINTMENT', 'NEW'] as const).map((f) => {
                  const Icon = TAG_ICON[f];
                  const active = tagFilter === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => onTagFilter(active ? null : f)}
                      aria-pressed={active}
                      title={t(`queue.tag.${f}`)}
                      className={cn(
                        'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium tabular-nums transition-colors duration-150',
                        active
                          ? f === 'VIP'
                            ? 'bg-accent-soft text-accent-foreground'
                            : 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden 2xl:inline">{t(`queue.tag.${f}`)}</span>
                      <span>{tagCounts[f]}</span>
                    </button>
                  );
                })}
              </Segmented>

              {staffOptions.length > 0 ? (
                <label className="relative">
                  <span className="sr-only">{t('queue.filterStaff')}</span>
                  <select
                    value={staffFilter}
                    onChange={(e) => onStaffFilter(e.target.value)}
                    className={cn(
                      'h-9 max-w-[160px] appearance-none rounded-lg border bg-card pl-3 pr-8 text-xs font-medium shadow-xs transition-colors',
                      staffFilter ? 'border-primary/40 text-primary' : 'border-border text-muted-foreground',
                    )}
                  >
                    <option value="">{t('queue.allStaff')}</option>
                    {staffOptions.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  />
                </label>
              ) : null}

              {matchCount != null ? (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-2xs font-medium tabular-nums text-muted-foreground">
                  {t('queue.searchResults', { n: matchCount })}
                </span>
              ) : null}

              {filtersActive ? (
                <Button
                  variant="link"
                  size="sm"
                  className="h-8 px-1 text-xs"
                  onClick={() => {
                    onQuery('');
                    onTagFilter(null);
                    onStaffFilter('');
                  }}
                >
                  {t('queue.clearFilters')}
                </Button>
              ) : null}

              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-9 w-9 p-0"
                aria-label={t('queue.density')}
                title={props.density === 'compact' ? t('queue.densityComfortable') : t('queue.densityCompact')}
                onClick={props.onToggleDensity}
              >
                {props.density === 'compact' ? (
                  <Rows3 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Rows2 className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </>
          ) : mode === 'wall' ? (
            <p className="text-xs text-muted-foreground">{t('queue.wallHint')}</p>
          ) : null}
        </div>
      )}
    </StickyPageHeader>
  );
}
