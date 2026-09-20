import {
  Bell,
  BellRing,
  CheckCheck,
  CircleCheck,
  Download,
  Inbox,
  Mail,
  MailOpen,
  OctagonAlert,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Timer,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';

import { StickyPageHeader } from '@/components/layout/StickyPageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { useConfirm } from '@/hooks/useConfirm';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { downloadCsv } from '@/features/reports/lib/csv';
import { ReferralStatCard } from '@/features/referrals/ReferralStatCard';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';

import { InboxInsights } from './components/InboxInsights';
import { NotificationDetail } from './components/NotificationDetail';
import { NotificationRow } from './components/NotificationRow';
import {
  RECENCY_ORDER,
  SEVERITY_META,
  SEVERITY_ORDER,
  filterNotifications,
  matchesView,
  recencyOf,
  sortNotifications,
  splitDuration,
  type InboxView,
  type RecencyGroup,
  type SortMode,
} from './notificationModel';
import {
  INBOX_LIMIT,
  useBulkNotificationAction,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useNotificationAction,
  useNotificationList,
  type AppNotification,
  type BulkAction,
  type Category,
  type Severity,
  type SingleAction,
} from './notifications.api';

/** Rows rendered before "show more" — keeps first paint light on a 300-row inbox. */
const PAGE_SIZE = 40;
const VIEWS: InboxView[] = ['all', 'unread', 'action', 'resolved'];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

/**
 * /notifications — the signed-in admin's notification center. Two panes on xl (inbox list +
 * reading pane / insights), list + Sheet below. The open item lives in `?n=` so it can be linked
 * and survives reloads. Everything past the server summary is derived client-side from the
 * newest {@link INBOX_LIMIT} rows; tiles use the server's exact totals.
 */
export function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const lang: 'lo' | 'en' = i18n.language?.startsWith('en') ? 'en' : 'lo';
  const confirm = useConfirm();
  const isWide = useMediaQuery('(min-width: 1280px)');
  const [params, setParams] = useSearchParams();
  const openId = params.get('n');

  const [view, setView] = useState<InboxView>('all');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortMode>('priority');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const { data, isLoading, isError, isFetching, refetch, dataUpdatedAt } = useNotificationList();
  const single = useNotificationAction();
  const bulk = useBulkNotificationAction();
  const readAll = useMarkAllNotificationsRead();
  const del = useDeleteNotification();

  const items = useMemo(() => data?.items ?? [], [data]);
  const summary = data?.summary;

  // Re-render "updated x ago" every 30s.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const filtered = useMemo(
    () => sortNotifications(filterNotifications(items, { view, severity, category, q }), sort),
    [items, view, severity, category, q, sort],
  );
  const visible = useMemo(() => filtered.slice(0, shown), [filtered, shown]);

  useEffect(() => {
    setShown(PAGE_SIZE);
    setSelected(new Set());
  }, [view, severity, category, q, sort]);

  const viewCounts = useMemo(() => {
    const base = filterNotifications(items, { view: 'all', severity, category, q });
    return Object.fromEntries(
      VIEWS.map((v) => [v, base.filter((n) => matchesView(n, v)).length]),
    ) as Record<InboxView, number>;
  }, [items, severity, category, q]);

  const severityCounts = useMemo(() => {
    const base = filterNotifications(items, { view, severity: 'all', category, q });
    return Object.fromEntries(
      SEVERITY_ORDER.map((s) => [s, base.filter((n) => n.severity === s).length]),
    ) as Record<Severity, number>;
  }, [items, view, category, q]);

  // Group only in "newest" mode — priority ordering already cuts across days.
  const groups = useMemo(() => {
    if (sort !== 'newest') return [{ key: null as RecencyGroup | null, rows: visible }];
    const now = Date.now();
    const map = new Map<RecencyGroup, AppNotification[]>();
    for (const n of visible) {
      const g = recencyOf(n.createdAt, now);
      map.set(g, [...(map.get(g) ?? []), n]);
    }
    return RECENCY_ORDER.filter((g) => map.has(g)).map((g) => ({ key: g, rows: map.get(g)! }));
  }, [visible, sort]);

  const openItem = useMemo(() => items.find((n) => n.id === openId) ?? null, [items, openId]);
  const openIndex = openItem ? filtered.findIndex((n) => n.id === openItem.id) : -1;

  const setOpen = useCallback(
    (id: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set('n', id);
          else next.delete('n');
          return next;
        },
        { replace: true },
      );
      if (id) setCursor(id);
    },
    [setParams],
  );

  const runAction = useCallback(
    (n: AppNotification, action: SingleAction) => {
      single.mutate(
        { id: n.id, action },
        {
          onSuccess: () => {
            if (action === 'resolve') {
              toast.success(t('notifications.resolvedToast'), {
                action: {
                  label: t('notifications.undo'),
                  onClick: () => single.mutate({ id: n.id, action: 'reopen' }),
                },
              });
            } else if (action === 'reopen') {
              toast.success(t('notifications.reopenedToast'));
            }
          },
          onError: () => toast.error(t('notifications.actionError')),
        },
      );
    },
    [single, t],
  );

  const openNotification = useCallback(
    (n: AppNotification) => {
      setOpen(n.id);
      if (!n.read) single.mutate({ id: n.id, action: 'read' });
    },
    [setOpen, single],
  );

  const deleteOne = useCallback(
    async (n: AppNotification) => {
      const ok = await confirm({
        title: t('notifications.deleteTitle'),
        description: t('notifications.deleteBody', { title: n.title }),
        confirmLabel: t('common.delete'),
        destructive: true,
      });
      if (!ok) return;
      const idx = filtered.findIndex((x) => x.id === n.id);
      const neighbour = filtered[idx + 1] ?? filtered[idx - 1] ?? null;
      del.mutate(n.id, {
        onSuccess: () => toast.success(t('notifications.deletedToast')),
        onError: () => toast.error(t('notifications.actionError')),
      });
      setOpen(openId === n.id ? (neighbour?.id ?? null) : openId);
    },
    [confirm, del, filtered, openId, setOpen, t],
  );

  const runBulk = useCallback(
    async (action: BulkAction) => {
      const ids = [...selected];
      if (ids.length === 0) return;
      if (action === 'delete') {
        const ok = await confirm({
          title: t('notifications.bulkDeleteTitle', { count: ids.length }),
          description: t('notifications.bulkDeleteBody'),
          confirmLabel: t('common.delete'),
          destructive: true,
        });
        if (!ok) return;
        if (openId && selected.has(openId)) setOpen(null);
      }
      bulk.mutate(
        { ids, action },
        {
          onSuccess: (res) => {
            toast.success(t(`notifications.bulkDone.${action}`, { count: res.updated }));
            setSelected(new Set());
          },
          onError: () => toast.error(t('notifications.actionError')),
        },
      );
    },
    [bulk, confirm, openId, selected, setOpen, t],
  );

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allVisibleSelected = visible.length > 0 && visible.every((n) => selected.has(n.id));
  const someSelected = selected.size > 0 && !allVisibleSelected;
  const toggleAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((n) => n.id)));

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const exportCsv = () => {
    downloadCsv(`notifications-${new Date().toISOString().slice(0, 10)}`, [
      [
        'id',
        'received',
        'severity',
        'category',
        'module',
        'type',
        'title',
        'body',
        'read',
        'resolved',
        'resolvedAt',
        'resolvedBy',
      ],
      ...filtered.map((n) => [
        n.id,
        formatDateTime(n.createdAt),
        n.severity,
        n.category,
        n.module,
        n.type,
        n.title,
        n.body,
        n.read ? 'yes' : 'no',
        n.resolved ? 'yes' : 'no',
        n.resolvedAt ? formatDateTime(n.resolvedAt) : '',
        n.resolvedBy?.name ?? '',
      ]),
    ]);
  };

  const hasFilters = view !== 'all' || severity !== 'all' || category !== 'all' || q.trim() !== '';
  const clearFilters = () => {
    setView('all');
    setSeverity('all');
    setCategory('all');
    setQ('');
  };

  // Keyboard triage — j/k (or ↓/↑) move, Enter opens, e resolve, u read toggle, x select, / search.
  const moveCursor = useCallback(
    (delta: number) => {
      if (visible.length === 0) return;
      const from = openId ?? cursor;
      const idx = from ? visible.findIndex((n) => n.id === from) : -1;
      const nextIdx = Math.min(Math.max(idx + delta, 0), visible.length - 1);
      const next = visible[nextIdx]!;
      if (openId) openNotification(next);
      else setCursor(next.id);
      rowRefs.current.get(next.id)?.focus({ preventScroll: false });
      rowRefs.current.get(next.id)?.scrollIntoView({ block: 'nearest' });
    },
    [cursor, openId, openNotification, visible],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/' && !isTypingTarget(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (isTypingTarget(e.target)) {
        if (e.key === 'Escape' && e.target === searchRef.current) searchRef.current?.blur();
        return;
      }
      // Sheet/dialog handle their own Escape; only act on page-level focus.
      if (document.querySelector('[role="dialog"]') && !isWide) return;
      const target = items.find((n) => n.id === (openId ?? cursor));
      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          moveCursor(1);
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          moveCursor(-1);
          break;
        case 'e':
          if (target) runAction(target, target.resolved ? 'reopen' : 'resolve');
          break;
        case 'u':
          if (target) single.mutate({ id: target.id, action: target.read ? 'unread' : 'read' });
          break;
        case 'x':
          if (target) toggleSelected(target.id);
          break;
        case 'Escape':
          if (openId) setOpen(null);
          else if (selected.size) setSelected(new Set());
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    cursor,
    isWide,
    items,
    moveCursor,
    openId,
    runAction,
    selected.size,
    setOpen,
    single,
    toggleSelected,
  ]);

  const detail = openItem ? (
    <NotificationDetail
      n={openItem}
      lang={lang}
      titleId="notification-detail-title"
      position={{ index: Math.max(openIndex, 0), total: filtered.length }}
      onPrev={openIndex > 0 ? () => openNotification(filtered[openIndex - 1]!) : undefined}
      onNext={
        openIndex >= 0 && openIndex < filtered.length - 1
          ? () => openNotification(filtered[openIndex + 1]!)
          : undefined
      }
      onClose={() => setOpen(null)}
      onAction={(a) => runAction(openItem, a)}
      onDelete={() => void deleteOne(openItem)}
      hideClose={!isWide}
    />
  ) : null;

  const medianLabel = (() => {
    const m = summary?.medianResolveMinutes;
    if (m == null) return '–';
    const { d, h, m: mm } = splitDuration(m);
    if (d > 0) return t('notifications.durDH', { d, h });
    if (h > 0) return t('notifications.durHM', { h, m: mm });
    return t('notifications.durM', { m: mm });
  })();

  return (
    <div className="space-y-5">
      <StickyPageHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-[22px] font-bold leading-tight text-foreground sm:text-[26px]">
              {t('nav.notifications')}
              {summary && summary.unread > 0 ? (
                <span
                  className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground"
                  aria-label={t('notifications.unreadAria', { count: summary.unread })}
                >
                  {summary.unread > 99 ? '99+' : summary.unread}
                </span>
              ) : null}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t('notifications.subtitle')}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {dataUpdatedAt ? (
              <span
                className="hidden text-2xs text-muted-foreground lg:inline"
                role="status"
                aria-live="polite"
              >
                {t('notifications.updatedAgo', { when: formatRelative(dataUpdatedAt, lang) })}
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void refetch()}
              disabled={isFetching}
              aria-label={t('notifications.refresh')}
              data-testid="button-refresh"
            >
              <RefreshCw
                className={cn('h-4 w-4', isFetching && 'animate-spin')}
                aria-hidden="true"
              />
            </Button>
            <Button variant="ghost" size="icon" asChild aria-label={t('notifications.settings')}>
              <Link to={ROUTES.settingsNotifications}>
                <Settings2 className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('common.export')}</span>
            </Button>
            <Button
              onClick={() =>
                readAll.mutate(undefined, {
                  onSuccess: (r) =>
                    toast.success(t('notifications.readAllToast', { count: r.updated })),
                  onError: () => toast.error(t('notifications.actionError')),
                })
              }
              disabled={!summary || summary.unread === 0 || readAll.isPending}
              data-testid="button-read-all"
            >
              <CheckCheck className="h-4 w-4" aria-hidden="true" />
              {t('notifications.markAllRead')}
            </Button>
          </div>
        </div>
      </StickyPageHeader>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[68px] w-full" />
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Skeleton className="h-[520px] w-full" />
            <Skeleton className="hidden h-[520px] w-full xl:block" />
          </div>
        </div>
      ) : isError || !data ? (
        <EmptyState
          icon={Bell}
          title={t('notifications.loadError')}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t('notifications.retry')}
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <ReferralStatCard
              index={0}
              icon={BellRing}
              tone="primary"
              label={t('notifications.statUnread')}
              value={summary!.unread}
              hint={t('notifications.statUnreadHint', { total: summary!.total })}
              onClick={() => setView((v) => (v === 'unread' ? 'all' : 'unread'))}
              active={view === 'unread'}
            />
            <ReferralStatCard
              index={1}
              icon={OctagonAlert}
              tone="danger"
              label={t('notifications.statAction')}
              value={summary!.needsAction}
              hint={t('notifications.statActionHint', { count: summary!.critical })}
              onClick={() => setView((v) => (v === 'action' ? 'all' : 'action'))}
              active={view === 'action'}
            />
            <ReferralStatCard
              index={2}
              icon={Inbox}
              tone="info"
              label={t('notifications.statToday')}
              value={summary!.today}
              hint={t('notifications.statTodayHint')}
            />
            <ReferralStatCard
              index={3}
              icon={CircleCheck}
              tone="success"
              label={t('notifications.statResolved7d')}
              value={summary!.resolved7d}
              hint={t('notifications.statResolvedHint')}
              onClick={() => setView((v) => (v === 'resolved' ? 'all' : 'resolved'))}
              active={view === 'resolved'}
            />
            <div className="col-span-2 md:col-span-1">
              <ReferralStatCard
                index={4}
                icon={Timer}
                tone="accent"
                label={t('notifications.statMedian')}
                value={medianLabel}
                hint={t('notifications.statMedianHint')}
              />
            </div>
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            {/* ---------------- Inbox ---------------- */}
            <section
              className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm xl:h-[calc(100vh-18.5rem)] xl:min-h-[560px]"
              aria-labelledby="inbox-heading"
            >
              <h2 id="inbox-heading" className="sr-only">
                {t('notifications.inbox')}
              </h2>

              <div className="space-y-3 border-b border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    role="radiogroup"
                    aria-label={t('notifications.viewLabel')}
                    className="inline-flex max-w-full overflow-x-auto rounded-lg bg-muted p-0.5"
                  >
                    {VIEWS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={view === v}
                        onClick={() => setView(v)}
                        data-testid={`view-${v}`}
                        className={cn(
                          'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-[color,background-color,box-shadow] duration-150',
                          view === v
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {t(`notifications.view.${v}`)}
                        <span
                          className={cn(
                            'rounded-full px-1.5 text-2xs tabular-nums',
                            view === v ? 'bg-primary/10 text-primary' : 'bg-background/70',
                          )}
                        >
                          {viewCounts[v]}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="relative ml-auto w-full min-w-[200px] sm:w-64">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      ref={searchRef}
                      type="search"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder={t('notifications.searchPlaceholder')}
                      aria-label={t('notifications.searchPlaceholder')}
                      className="pl-9 pr-8"
                      data-testid="input-search"
                    />
                    {!q ? (
                      <kbd
                        className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:block"
                        aria-hidden="true"
                      >
                        /
                      </kbd>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {SEVERITY_ORDER.map((s) => {
                    const meta = SEVERITY_META[s];
                    const active = severity === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSeverity(active ? 'all' : s)}
                        className={cn(
                          'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors duration-150',
                          active
                            ? cn('border-transparent', meta.tile)
                            : 'border-border bg-card text-muted-foreground hover:bg-muted',
                        )}
                      >
                        <span
                          className={cn('h-1.5 w-1.5 rounded-full', meta.dot)}
                          aria-hidden="true"
                        />
                        {t(`notifications.severity.${s}`)}
                        <span className="tabular-nums opacity-80">{severityCounts[s]}</span>
                      </button>
                    );
                  })}
                  {category !== 'all' ? (
                    <button
                      type="button"
                      onClick={() => setCategory('all')}
                      className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full bg-primary/10 px-3 text-xs font-medium text-primary"
                    >
                      {t(`notifications.category.${category}`)}
                      <X className="h-3 w-3" aria-hidden="true" />
                      <span className="sr-only">{t('notifications.clearFilter')}</span>
                    </button>
                  ) : null}
                  {hasFilters ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="cursor-pointer text-xs font-medium text-primary hover:underline"
                    >
                      {t('notifications.clearAll')}
                    </button>
                  ) : null}
                  <div className="ml-auto">
                    <Select
                      aria-label={t('notifications.sortLabel')}
                      className="h-8 w-[150px] text-xs"
                      value={sort}
                      onChange={(e) => setSort(e.target.value as SortMode)}
                      options={[
                        { value: 'priority', label: t('notifications.sort.priority') },
                        { value: 'newest', label: t('notifications.sort.newest') },
                      ]}
                    />
                  </div>
                </div>
              </div>

              {/* Selection bar */}
              <div
                className={cn(
                  'flex min-h-11 items-center gap-2 border-b border-border px-3 py-1.5',
                  selected.size > 0 ? 'bg-primary/[0.05]' : 'bg-muted/30',
                )}
              >
                <Checkbox
                  ref={selectAllRef}
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  disabled={visible.length === 0}
                  aria-label={t('notifications.selectAll')}
                  className="ml-1 cursor-pointer"
                />
                {selected.size > 0 ? (
                  <>
                    <span className="text-xs font-medium tabular-nums" role="status">
                      {t('notifications.selectedCount', { count: selected.size })}
                    </span>
                    <div className="ml-auto flex flex-wrap items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => void runBulk('read')}>
                        <MailOpen className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">{t('notifications.markRead')}</span>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void runBulk('unread')}>
                        <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">{t('notifications.markUnread')}</span>
                      </Button>
                      {view === 'resolved' ? (
                        <Button variant="ghost" size="sm" onClick={() => void runBulk('reopen')}>
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="hidden sm:inline">{t('notifications.reopen')}</span>
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void runBulk('resolve')}
                          data-testid="button-bulk-resolve"
                        >
                          <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          <span className="hidden sm:inline">{t('notifications.resolve')}</span>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void runBulk('delete')}
                        className="text-destructive hover:bg-destructive-soft"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">{t('common.delete')}</span>
                      </Button>
                    </div>
                  </>
                ) : (
                  <span className="text-2xs text-muted-foreground">
                    {t('notifications.showing', {
                      shown: Math.min(shown, filtered.length),
                      total: filtered.length,
                    })}
                    {summary!.total > data.limit
                      ? ` · ${t('notifications.windowNote', { limit: INBOX_LIMIT })}`
                      : ''}
                  </span>
                )}
              </div>

              {/* List */}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {items.length === 0 ? (
                  <EmptyState
                    icon={Bell}
                    title={t('notifications.empty')}
                    description={t('notifications.emptyHint')}
                    className="py-16"
                  />
                ) : filtered.length === 0 ? (
                  <EmptyState
                    icon={view === 'action' ? CircleCheck : Search}
                    title={
                      view === 'action' && !q
                        ? t('notifications.allClear')
                        : t('notifications.noMatch')
                    }
                    description={
                      view === 'action' && !q ? t('notifications.allClearHint') : undefined
                    }
                    action={
                      hasFilters ? (
                        <Button variant="secondary" size="sm" onClick={clearFilters}>
                          {t('notifications.clearAll')}
                        </Button>
                      ) : undefined
                    }
                    className="py-16"
                  />
                ) : (
                  <>
                    {groups.map((g) => (
                      <div key={g.key ?? 'all'}>
                        {g.key ? (
                          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border/70 bg-card/95 px-4 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-card/80">
                            <h3 className="text-2xs font-semibold text-muted-foreground">
                              {t(`notifications.group.${g.key}`)}
                            </h3>
                            <span className="rounded-full bg-muted px-1.5 text-2xs tabular-nums text-muted-foreground">
                              {g.rows.length}
                            </span>
                          </div>
                        ) : null}
                        <ul>
                          {g.rows.map((n, i) => (
                            <NotificationRow
                              key={n.id}
                              ref={(el) => {
                                if (el) rowRefs.current.set(n.id, el);
                                else rowRefs.current.delete(n.id);
                              }}
                              n={n}
                              index={i}
                              lang={lang}
                              active={openId === n.id || (!openId && cursor === n.id)}
                              checked={selected.has(n.id)}
                              onOpen={() => openNotification(n)}
                              onToggleCheck={() => toggleSelected(n.id)}
                              onAction={(a) => runAction(n, a)}
                            />
                          ))}
                        </ul>
                      </div>
                    ))}
                    {shown < filtered.length ? (
                      <div className="flex justify-center border-t border-border p-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShown((v) => v + PAGE_SIZE)}
                          data-testid="button-show-more"
                        >
                          {t('notifications.showMore', { count: filtered.length - shown })}
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </section>

            {/* ---------------- Reading pane / insights ---------------- */}
            {isWide && openItem ? (
              <aside
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm animate-in fade-in slide-in-from-right-2 duration-200 motion-reduce:animate-none xl:h-[calc(100vh-18.5rem)] xl:min-h-[560px]"
                aria-labelledby="notification-detail-title"
              >
                {detail}
              </aside>
            ) : (
              <InboxInsights
                items={items}
                daily={data.daily}
                category={category}
                onCategory={setCategory}
              />
            )}
          </div>

          {!isWide ? (
            <Sheet open={Boolean(openItem)} onOpenChange={(o) => !o && setOpen(null)}>
              <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-[520px]">
                <SheetTitle className="sr-only">
                  {openItem?.title ?? t('nav.notifications')}
                </SheetTitle>
                {detail}
              </SheetContent>
            </Sheet>
          ) : null}
        </>
      )}
    </div>
  );
}
