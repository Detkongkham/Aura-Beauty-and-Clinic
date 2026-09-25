import {
  ArrowUpRight,
  Building2,
  CalendarPlus,
  Globe,
  KeyRound,
  LayoutGrid,
  List,
  Receipt,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Ticket,
  UserPlus,
  Workflow,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { Kbd } from '@/components/ui/kbd';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { cn } from '@/lib/utils';
import { useNavGroups } from '@/components/layout/useNavGroups';
import { ROUTES } from '@/router/paths';
import { useUiStore } from '@/store/ui.store';

import {
  AttentionPanel,
  HeroChip,
  LinkCard,
  LiveClock,
  ModuleCard,
  ModuleRow,
  QuickActions,
  ShortcutsCard,
  TodayBento,
  WorkspacePanel,
  type QuickAction,
} from './portal.parts';
import { AnnouncementsPanel, ChecklistPanel, SystemStatusCard } from './portal.panels';
import {
  flatten,
  readPins,
  readView,
  readVisits,
  recentModules,
  vientianeHour,
  writePins,
  writeView,
  type PortalView,
  type Tile,
} from './portalModel';
import { usePortalPrefsSync } from './usePortalPrefsSync';
import { usePortalSignals } from './usePortalSignals';

const ALL = '__all__';

export function PortalPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, role, hasPermission } = useAuth();
  const groups = useNavGroups(hasPermission);
  const sections = useMemo(() => flatten(groups), [groups]);
  const allTiles = useMemo(() => sections.flatMap((s) => s.tiles), [sections]);
  const allowed = useMemo(() => new Set(allTiles.map((tile) => tile.item.to)), [allTiles]);

  const canDashboard = hasPermission('dashboard:view');
  const signals = usePortalSignals(allowed, canDashboard);

  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>(ALL);
  const [view, setView] = useState<PortalView>(readView);
  const [pins, setPins] = useState<string[]>(readPins);
  const [visits, setVisits] = useState(readVisits);
  const [active, setActive] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the module search, like most launchers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const togglePin = (to: string) =>
    setPins((prev) => {
      const next = prev.includes(to) ? prev.filter((p) => p !== to) : [...prev, to];
      writePins(next);
      return next;
    });

  const changeView = (v: PortalView) => {
    setView(v);
    writeView(v);
  };

  const reorderPins = (from: number, to: number) =>
    setPins((prev) => {
      // Reorder within the pins that still resolve to a module; stale paths stay at the end.
      const live = prev.filter((p) => allowed.has(p));
      const stale = prev.filter((p) => !allowed.has(p));
      const [moved] = live.splice(from, 1);
      if (moved == null) return prev;
      live.splice(to, 0, moved);
      const next = [...live, ...stale];
      writePins(next);
      return next;
    });

  usePortalPrefsSync({ pins, view, setPins, setView, setVisits });

  // /portal#announcements (from the attention list) or #system-status scrolls to that panel.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = window.setTimeout(
      () => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      150,
    );
    return () => window.clearTimeout(id);
  }, [hash]);

  const label = (tile: Tile) => t(`nav.${tile.item.labelKey}`);
  const desc = (tile: Tile) => t(`portal.desc.${tile.item.labelKey}`, { defaultValue: '' });

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      sections
        .filter((s) => groupFilter === ALL || s.group.labelKey === groupFilter)
        .map((s) => ({
          ...s,
          tiles: q
            ? s.tiles.filter((tile) =>
                [label(tile), desc(tile), t(`nav.${s.group.labelKey}`), tile.item.to].some((x) =>
                  x.toLowerCase().includes(q),
                ),
              )
            : s.tiles,
        }))
        .filter((s) => s.tiles.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, q, groupFilter, i18n.resolvedLanguage],
  );
  const flat = useMemo(() => filtered.flatMap((s) => s.tiles), [filtered]);

  // Keyboard cursor resets whenever the result set changes.
  useEffect(() => setActive(0), [q, groupFilter]);

  const pinned = pins
    .map((to) => allTiles.find((tile) => tile.item.to === to))
    .filter((x): x is Tile => x != null);
  const recent = useMemo(() => recentModules(visits, allTiles, 8), [visits, allTiles]);
  const lastOpened = useMemo(() => new Map(recent.map((r) => [r.tile.item.to, r.at])), [recent]);

  const total = allTiles.length;
  const shown = flat.length;
  const searching = q.length > 0;

  const hour = vientianeHour();
  const greeting =
    hour < 12 ? t('portal.morning') : hour < 18 ? t('portal.afternoon') : t('portal.evening');
  const today = new Intl.DateTimeFormat(i18n.resolvedLanguage === 'en' ? 'en-GB' : 'lo-LA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Vientiane',
  }).format(new Date());

  const branchId = useUiStore((s) => s.activeBranchId);
  const { data: branches = [] } = useBranches();
  const branchName =
    branchId === 'all' ? t('branch.all') : (branches.find((b) => b.id === branchId)?.name ?? '');
  const roleLabel = role ? t(`messaging.role.${role}`, { defaultValue: role }) : '';

  const quickActions = useMemo<QuickAction[]>(
    () =>
      (
        [
          { id: 'walkin', icon: Ticket, label: t('portal.quick.walkin'), to: `${ROUTES.queue}?walkin=1`, route: ROUTES.queue },
          ...(hasPermission('appointments:manage')
            ? [{ id: 'book', icon: CalendarPlus, label: t('portal.quick.book'), to: `${ROUTES.appointments}?new=1`, route: ROUTES.appointments }]
            : []),
          { id: 'customer', icon: UserPlus, label: t('portal.quick.customer'), to: `${ROUTES.customers}?focus=search`, route: ROUTES.customers },
          { id: 'slips', icon: ScanLine, label: t('portal.quick.slips'), to: ROUTES.paymentsSlips, route: ROUTES.paymentsSlips },
          ...(hasPermission('expenses:manage')
            ? [{ id: 'expense', icon: Receipt, label: t('portal.quick.expense'), to: `${ROUTES.paymentsExpenses}?new=1`, route: ROUTES.paymentsExpenses }]
            : []),
        ] as Array<QuickAction & { route: string }>
      ).filter((a) => allowed.has(a.route)),
    [allowed, hasPermission, t],
  );

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (query) setQuery('');
      else searchRef.current?.blur();
    } else if (e.key === 'ArrowDown' && flat.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp' && flat.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter' && flat[active]) {
      navigate(flat[active].item.to);
    }
  };

  // Keep the keyboard-highlighted tile in view while arrowing through results.
  useEffect(() => {
    if (!searching) return;
    document.getElementById(`pt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, searching]);

  const activeId = searching && flat[active] ? `pt-${active}` : undefined;
  let cursor = -1;

  return (
    <div className="font-serif-all space-y-6 pb-10">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        aria-labelledby="portal-title"
        className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm animate-in fade-in slide-in-from-top-2 fill-mode-both duration-300 ease-out motion-reduce:animate-none"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_110%_at_100%_0%,hsl(var(--primary)/0.14),transparent_60%),radial-gradient(40%_90%_at_0%_100%,hsl(var(--accent)/0.16),transparent_60%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(hsl(var(--border))_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]"
        />
        <div
          className={cn(
            'relative grid gap-6 p-5 sm:p-7',
            canDashboard && 'xl:grid-cols-[1.1fr_1fr] xl:items-stretch',
          )}
        >
          <div className="flex min-w-0 flex-col justify-between gap-5">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <HeroChip icon={Sparkles}>
                  {today} · <LiveClock />
                </HeroChip>
                {roleLabel ? <HeroChip icon={ShieldCheck}>{roleLabel}</HeroChip> : null}
                {branchName ? <HeroChip icon={Building2}>{branchName}</HeroChip> : null}
              </div>
              <div className="space-y-1.5">
                <h1 id="portal-title" className="text-2xl sm:text-3xl">
                  {greeting}
                  {user?.name ? `, ${user.name}` : ''}
                </h1>
                <p className="max-w-xl text-sm text-muted-foreground">
                  {t('portal.subtitle', { count: total })}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="relative max-w-2xl">
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <label htmlFor="portal-search" className="sr-only">
                  {t('portal.searchLabel')}
                </label>
                <input
                  id="portal-search"
                  ref={searchRef}
                  role="combobox"
                  aria-expanded={searching}
                  aria-controls="portal-directory"
                  aria-activedescendant={activeId}
                  aria-autocomplete="list"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onSearchKey}
                  placeholder={t('portal.searchPlaceholder')}
                  autoComplete="off"
                  className="h-12 w-full rounded-full border border-input bg-background/90 pl-11 pr-20 text-base shadow-sm backdrop-blur transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:shadow-[0_0_0_3px_hsl(var(--ring)/0.4)] focus-visible:outline-none"
                />
                <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-1">
                  {query ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        searchRef.current?.focus();
                      }}
                      aria-label={t('portal.clearSearch')}
                      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <Kbd className="mr-2 hidden sm:inline-flex">/</Kbd>
                  )}
                </div>
              </div>
              <p className="px-1 text-xs text-muted-foreground" aria-live="polite">
                {searching ? t('portal.results', { shown, total }) : t('portal.searchHint')}
              </p>
            </div>
          </div>

          {canDashboard ? (
            <TodayBento
              stats={signals.stats}
              loading={signals.statsLoading}
              fetching={signals.statsFetching}
              updatedAt={signals.statsUpdatedAt}
              onRefresh={signals.refetch}
              showRevenue={hasPermission('finance:view')}
            />
          ) : null}
        </div>
      </section>

      {/* ── Quick actions ────────────────────────────────────── */}
      {!searching && <QuickActions actions={quickActions} />}

      {/* ── Today: attention + checklist, then workspace + news ── */}
      {!searching && (
        <div className="grid gap-4 lg:grid-cols-2">
          <AttentionPanel items={signals.attention} loading={signals.signalsLoading} />
          <ChecklistPanel branchId={branchId} />
          <WorkspacePanel
            pinned={pinned}
            recent={recent}
            label={label}
            onUnpin={togglePin}
            onReorder={reorderPins}
          />
          <AnnouncementsPanel canManage={hasPermission('settings:manage') || hasPermission('staff:manage')} />
        </div>
      )}

      {/* ── System status (super admin) ──────────────────────── */}
      {!searching && role === 'SUPER_ADMIN' ? <SystemStatusCard /> : null}

      {/* ── Module directory ─────────────────────────────────── */}
      <section aria-labelledby="portal-directory-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="portal-directory-title" className="text-lg font-semibold">
              {t('portal.directory.title')}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t('portal.directory.subtitle', { count: total, groups: sections.length })}
            </p>
          </div>
          <div
            role="radiogroup"
            aria-label={t('portal.view.label')}
            className="flex rounded-full border border-border bg-card p-1 shadow-xs"
          >
            {(
              [
                ['grid', LayoutGrid, t('portal.view.grid')],
                ['list', List, t('portal.view.list')],
              ] as const
            ).map(([v, Icon, text]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                onClick={() => changeView(v)}
                className={cn(
                  'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  view === v
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                {text}
              </button>
            ))}
          </div>
        </div>

        {/* Group filter chips */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div role="toolbar" aria-label={t('portal.directory.filter')} className="flex w-max gap-1.5">
            {[{ key: ALL, label: t('portal.directory.all'), n: total, dot: 'bg-foreground/60' }]
              .concat(
                sections.map((s) => ({
                  key: s.group.labelKey,
                  label: t(`nav.${s.group.labelKey}`),
                  n: s.tiles.length,
                  dot: s.tone.dot,
                })),
              )
              .map((c) => {
                const on = groupFilter === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setGroupFilter(on && c.key !== ALL ? ALL : c.key)}
                    className={cn(
                      'inline-flex h-9 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      on
                        ? 'border-primary bg-primary-subtle text-primary'
                        : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                    )}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} aria-hidden="true" />
                    {c.label}
                    <span className="tabular-nums opacity-70">{c.n}</span>
                  </button>
                );
              })}
          </div>
        </div>

        <div id="portal-directory" className="space-y-7">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Search className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium">{t('portal.noResults', { query })}</p>
              <p className="text-xs text-muted-foreground">{t('portal.noResultsHint')}</p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setGroupFilter(ALL);
                }}
                className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium text-primary hover:bg-primary-subtle"
              >
                {t('portal.clearSearch')}
              </button>
            </div>
          ) : (
            filtered.map(({ group, tiles }, gi) => (
              <section
                key={group.labelKey}
                aria-labelledby={`pg-${group.labelKey}`}
                className="space-y-3"
              >
                <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={cn('h-5 w-1 rounded-full', sections.find((s) => s.group === group)?.tone.dot)}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <h3 id={`pg-${group.labelKey}`} className="text-base font-semibold">
                        {t(`nav.${group.labelKey}`)}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {t(`portal.group.${group.labelKey}`, { defaultValue: '' })}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {t('portal.moduleCount', { count: tiles.length })}
                  </span>
                </div>
                {view === 'grid' ? (
                  <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {tiles.map((tile, i) => {
                      cursor += 1;
                      return (
                        <li key={tile.item.to}>
                          <ModuleCard
                            tile={tile}
                            id={`pt-${cursor}`}
                            label={label(tile)}
                            description={desc(tile)}
                            groupLabel={t(`nav.${group.labelKey}`)}
                            pinned={pins.includes(tile.item.to)}
                            active={searching && cursor === active}
                            badge={signals.badges.get(tile.item.to)}
                            lastOpened={lastOpened.get(tile.item.to)}
                            onTogglePin={() => togglePin(tile.item.to)}
                            style={{ animationDelay: `${Math.min(gi * 2 + i, 14) * 30}ms` }}
                          />
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                    {tiles.map((tile, i) => {
                      cursor += 1;
                      return (
                        <li key={tile.item.to}>
                          <ModuleRow
                            tile={tile}
                            id={`pt-${cursor}`}
                            label={label(tile)}
                            description={desc(tile)}
                            groupLabel={t(`nav.${group.labelKey}`)}
                            pinned={pins.includes(tile.item.to)}
                            active={searching && cursor === active}
                            badge={signals.badges.get(tile.item.to)}
                            onTogglePin={() => togglePin(tile.item.to)}
                            style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))
          )}
        </div>
      </section>

      {/* ── More ─────────────────────────────────────────────── */}
      {!searching && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Link
            to={ROUTES.site}
            className="group relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary-strong to-primary p-5 text-primary-foreground shadow-md transition-shadow duration-200 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:row-span-2"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/25 blur-3xl"
            />
            <div className="relative space-y-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                <Globe className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="text-lg font-semibold">{t('portal.siteTitle')}</p>
              <p className="text-sm opacity-90">{t('portal.siteBody')}</p>
            </div>
            <span className="relative inline-flex items-center gap-1.5 self-start rounded-full bg-white/15 px-4 py-2 text-sm font-semibold ring-1 ring-white/30 transition-colors group-hover:bg-white/25">
              {t('portal.siteCta')}
              <ArrowUpRight
                className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </Link>
          {allowed.has(ROUTES.systemMap) ? (
            <LinkCard
              to={ROUTES.systemMap}
              icon={Workflow}
              title={t('portal.more.systemMapTitle')}
              body={t('portal.more.systemMapBody')}
            />
          ) : null}
          <LinkCard
            className={allowed.has(ROUTES.systemMap) ? undefined : 'lg:col-span-2'}
            to={ROUTES.account}
            icon={KeyRound}
            title={t('portal.more.accountTitle')}
            body={t('portal.more.accountBody')}
          />
          <div className="lg:col-span-2">
            <ShortcutsCard />
          </div>
        </div>
      )}
    </div>
  );
}
