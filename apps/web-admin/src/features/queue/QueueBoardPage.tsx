import { BellRing, Clock, Hourglass, Layers, Plus, RefreshCw, Scissors, Timer, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/sonner';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { useStaffList } from '@/features/staff/staff.api';
import { useConfirm } from '@/hooks/useConfirm';
import { useCountUp } from '@/hooks/useCountUp';
import { useDebounce } from '@/hooks/useDebounce';
import { useIsDesktop, usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { NormalizedApiError } from '@/services/apiError';
import { useUiStore } from '@/store/ui.store';
import type { QueueCancelReason, QueueTicket } from '@/types/models';

import { CancelTicketDialog } from './CancelTicketDialog';
import { CarriedOverBanner } from './CarriedOverBanner';
import { QueueCommandBar, type Density, type TagFilter } from './QueueCommandBar';
import { LaneTabs } from './LaneTabs';
import { QueueHistoryCard } from './QueueHistoryCard';
import { QueueInsights } from './QueueInsights';
import { QueueLane } from './QueueLane';
import { QueueListView } from './QueueListView';
import { QueueStatCard, type QueueStatTone } from './QueueStatCard';
import { QueueWallboard } from './QueueWallboard';
import { ServingConsole } from './ServingConsole';
import type { TicketHandlers } from './TicketActionsMenu';
import { TeamCapacityCard } from './TeamCapacityCard';
import { TicketDetailSheet } from './TicketDetailSheet';
import { WalkInSheet } from './WalkInSheet';
import {
  useClearStaleTickets,
  useQueue,
  useRecallTicket,
  useSetTicketStatus,
  useUpdateTicketDetails,
  type QueueStatus,
} from './queue.api';
import {
  ACTIVE_ORDER,
  LANES,
  NEXT,
  QUEUE_MODES,
  byIssuedAsc,
  byServeOrder,
  estimateStartTimes,
  ticketMatches,
  urgencyOf,
  useTeamLoad,
  useWaitFormatter,
  type ActiveStatus,
  type QueueMode,
} from './queue.lib';
import { useQueueChime } from './useQueueChime';

/** Renders an integer that rolls to its new value on change (reduced-motion safe). */
function Counted({ value }: { value: number }) {
  return <>{useCountUp(value)}</>;
}

/** localStorage-backed view preference — per viewer, best effort. */
function usePref<T extends string>(key: string, allowed: readonly T[], fallback: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const v = localStorage.getItem(key) as T | null;
      return v && allowed.includes(v) ? v : fallback;
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* private mode — best effort */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

const EMPTY: QueueTicket[] = [];
const byStampDesc = (pick: (tk: QueueTicket) => string | null | undefined) => (a: QueueTicket, b: QueueTicket) =>
  new Date(pick(b) ?? b.issuedAt).getTime() - new Date(pick(a) ?? a.issuedAt).getTime();

export function QueueBoardPage() {
  const { t } = useTranslation();
  const fmtWait = useWaitFormatter();
  const { user, hasPermission } = useAuth();
  const confirm = useConfirm();
  const canManage = hasPermission('queue:manage');
  const canClearStale = canManage && user?.role !== 'STAFF';
  const branchId = useUiStore((s) => s.activeBranchId);
  const prefersReduced = usePrefersReducedMotion();
  const { data: branches = [] } = useBranches();
  const branchLabel =
    branchId === 'all' ? t('queue.allBranches') : (branches.find((b) => b.id === branchId)?.name ?? '…');

  // ── data ─────────────────────────────────────────────────────────
  const [paused, setPaused] = useState(false);
  const { data, isLoading, isError, isFetching, refetch, dataUpdatedAt } = useQueue(branchId, paused);
  const items = data?.items ?? EMPTY;
  const summary = data?.summary ?? null;
  const setStatus = useSetTicketStatus();
  const recall = useRecallTicket();
  const updateDetails = useUpdateTicketDetails();
  const clearStale = useClearStaleTickets();

  // ── view state ───────────────────────────────────────────────────
  const [mode, setMode] = usePref<QueueMode>('queue:mode', QUEUE_MODES, 'board');
  const [density, setDensity] = usePref<Density>('queue:density', ['comfortable', 'compact'], 'comfortable');
  const [soundPref, setSoundPref] = usePref('queue:sound', ['on', 'off'], 'off');
  const sound = soundPref === 'on';
  const [walkInOpen, setWalkInOpen] = useState(false);
  /** List view: optional status filter. Phone board: which single lane is shown. */
  const [laneFilter, setLaneFilter] = useState<ActiveStatus | null>(null);
  const [phoneLane, setPhoneLane] = useState<ActiveStatus>('WAITING');
  /** Ticket pinned in the serving console (falls back to the latest call). */
  const [focusId, setFocusId] = useState<string | null>(null);
  const isDesktop = useIsDesktop();
  const [tagFilter, setTagFilter] = useState<TagFilter | null>(null);
  const [staffFilter, setStaffFilter] = useState('');
  const [query, setQuery] = useState('');
  const q = useDebounce(query.trim().toLowerCase(), 200);
  const searchRef = useRef<HTMLInputElement>(null);
  const [cancelTarget, setCancelTarget] = useState<{ ticket: QueueTicket; reason?: QueueCancelReason } | null>(
    null,
  );

  // Open ticket lives in the URL (?ticket=) so it survives refresh and can be shared.
  const [params, setParams] = useSearchParams();
  const detailId = params.get('ticket');
  const openDetail = useCallback(
    (tk: QueueTicket) =>
      setParams(
        (p) => {
          p.set('ticket', tk.id);
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  const closeDetail = () =>
    setParams(
      (p) => {
        p.delete('ticket');
        return p;
      },
      { replace: true },
    );

  // ?walkin=1 (portal quick action) opens the walk-in dialog once, then drops the flag.
  useEffect(() => {
    if (params.get('walkin') !== '1') return;
    setWalkInOpen(true);
    setParams(
      (p) => {
        p.delete('walkin');
        return p;
      },
      { replace: true },
    );
  }, [params, setParams]);

  const now = dataUpdatedAt || Date.now();
  const showBranch = branchId === 'all';

  const { data: staffPage } = useStaffList({
    page: 1,
    pageSize: 100,
    branchId: branchId === 'all' ? undefined : branchId,
  });
  const rosterNames = useMemo(
    () => (staffPage?.items ?? []).filter((s) => s.isActive).map((s) => s.name),
    [staffPage],
  );

  // ── grouping ─────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const g: Record<QueueStatus, QueueTicket[]> = {
      WAITING: [],
      CALLED: [],
      IN_SERVICE: [],
      COMPLETED: [],
      CANCELLED: [],
    };
    for (const ticket of items) g[ticket.status]?.push(ticket);
    g.WAITING.sort(byServeOrder);
    g.CALLED.sort(byIssuedAsc);
    g.IN_SERVICE.sort(byIssuedAsc);
    g.COMPLETED.sort(byStampDesc((tk) => tk.completedAt));
    g.CANCELLED.sort(byStampDesc((tk) => tk.cancelledAt));
    return g;
  }, [items]);

  const activeTickets = useMemo(
    () => [...groups.WAITING, ...groups.CALLED, ...groups.IN_SERVICE],
    [groups.WAITING, groups.CALLED, groups.IN_SERVICE],
  );
  const teamSize = Math.max(rosterNames.length, new Set(groups.IN_SERVICE.map((tk) => tk.staffName)).size);
  const eta = useMemo(
    () => estimateStartTimes(groups.CALLED, groups.WAITING, groups.IN_SERVICE, teamSize, now),
    [groups.CALLED, groups.WAITING, groups.IN_SERVICE, teamSize, now],
  );
  const latestCalledId = useQueueChime(groups.CALLED, sound);

  // ── filters ──────────────────────────────────────────────────────
  const matches = useCallback(
    (tk: QueueTicket) => {
      if (!ticketMatches(tk, q)) return false;
      if (staffFilter && tk.staffName !== staffFilter) return false;
      if (tagFilter === 'VIP') return tk.priority === 'VIP';
      if (tagFilter === 'APPOINTMENT') return tk.priority === 'APPOINTMENT';
      if (tagFilter === 'NEW') return !!tk.customerId && (tk.visitCount ?? 0) === 0;
      return true;
    },
    [q, staffFilter, tagFilter],
  );
  const anyFilter = !!q || !!staffFilter || tagFilter != null;
  const tagCounts: Record<TagFilter, number> = {
    VIP: activeTickets.filter((tk) => tk.priority === 'VIP').length,
    APPOINTMENT: activeTickets.filter((tk) => tk.priority === 'APPOINTMENT').length,
    NEW: activeTickets.filter((tk) => !!tk.customerId && (tk.visitCount ?? 0) === 0).length,
  };
  const staffOptions = useMemo(
    () => [...new Set(activeTickets.map((tk) => tk.staffName).filter((n): n is string => !!n))].sort(),
    [activeTickets],
  );
  const counts: Record<ActiveStatus, number> = {
    WAITING: groups.WAITING.length,
    CALLED: groups.CALLED.length,
    IN_SERVICE: groups.IN_SERVICE.length,
  };
  const matchCount = anyFilter ? activeTickets.filter(matches).length : null;

  const listRows = useMemo(() => {
    const rows = activeTickets.filter((tk) => matches(tk) && (!laneFilter || tk.status === laneFilter));
    return rows.sort((a, b) => {
      const li = ACTIVE_ORDER.indexOf(a.status as ActiveStatus);
      const lj = ACTIVE_ORDER.indexOf(b.status as ActiveStatus);
      if (li !== lj) return li - lj;
      return a.status === 'WAITING' ? byServeOrder(a, b) : urgencyOf(b, now).elapsedMin - urgencyOf(a, now).elapsedMin;
    });
  }, [activeTickets, matches, laneFilter, now]);

  // ── flow-flash: highlight a card the first render after it changes lane ──
  const prevStatus = useRef(new Map<string, QueueStatus>());
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const next = new Map<string, QueueStatus>();
    const changed = new Set<string>();
    for (const tk of items) {
      const prev = prevStatus.current.get(tk.id);
      if (prev && prev !== tk.status && !prefersReduced) changed.add(tk.id);
      next.set(tk.id, tk.status);
    }
    prevStatus.current = next;
    if (changed.size === 0) return;
    setFlashIds(changed);
    const id = setTimeout(() => setFlashIds(new Set()), 650);
    return () => clearTimeout(id);
  }, [items, prefersReduced]);

  // ── actions ──────────────────────────────────────────────────────
  const onError = (err: unknown) =>
    toast.error(err instanceof NormalizedApiError ? err.message : t('services.saveError'));

  const move = (tk: QueueTicket, status: QueueStatus, okMsg?: string, undo?: QueueStatus) =>
    setStatus.mutate(
      { id: tk.id, status },
      {
        onSuccess: () => {
          if (status === 'CALLED' || status === 'IN_SERVICE') setFocusId(tk.id);
          if (!okMsg) return;
          toast.success(
            okMsg,
            undo
              ? {
                  action: {
                    label: t('queue.undo'),
                    onClick: () => setStatus.mutate({ id: tk.id, status: undo }, { onError }),
                  },
                }
              : undefined,
          );
        },
        onError,
      },
    );

  const handlers: TicketHandlers = {
    advance: (tk) => {
      const next = NEXT[tk.status];
      if (!next) return;
      if (next === 'CALLED') move(tk, next, t('queue.toast.called', { number: tk.number }), 'WAITING');
      else if (next === 'COMPLETED') move(tk, next, t('queue.toast.completed', { number: tk.number }));
      else move(tk, next);
    },
    startNow: (tk) => move(tk, 'IN_SERVICE', t('queue.toast.started', { number: tk.number })),
    recall: (tk) =>
      recall.mutate(tk.id, {
        onSuccess: () => toast.success(t('queue.toast.recalled', { number: tk.number })),
        onError,
      }),
    sendBack: (tk) => move(tk, 'WAITING', t('queue.toast.sentBack', { number: tk.number })),
    restore: (tk) => move(tk, 'WAITING', t('queue.toast.restored', { number: tk.number })),
    toggleVip: (tk) =>
      updateDetails.mutate(
        { id: tk.id, priority: tk.priority === 'VIP' ? 'NORMAL' : 'VIP' },
        {
          onSuccess: () => toast.success(tk.priority === 'VIP' ? t('queue.vipOff') : t('queue.vipOn')),
          onError,
        },
      ),
    cancel: (tk, reason) => setCancelTarget({ ticket: tk, reason }),
    openDetail,
  };

  const confirmCancel = (tk: QueueTicket, reason: QueueCancelReason) =>
    setStatus.mutate(
      { id: tk.id, status: 'CANCELLED', reason },
      {
        onSuccess: () => {
          setCancelTarget(null);
          toast.success(t('queue.toast.cancelled', { number: tk.number }), {
            action: {
              label: t('queue.undo'),
              onClick: () => setStatus.mutate({ id: tk.id, status: 'WAITING' }, { onError }),
            },
          });
        },
        onError,
      },
    );

  const callNext = () => {
    const next = groups.WAITING[0];
    if (next) handlers.advance(next);
  };

  const onClearStale = async () => {
    const ok = await confirm({
      title: t('queue.clearStaleTitle', { n: summary?.carriedOver ?? 0 }),
      description: t('queue.clearStaleBody'),
      confirmLabel: t('queue.clearStale'),
      destructive: true,
    });
    if (!ok) return;
    clearStale.mutate(branchId, {
      onSuccess: ({ cleared }) => toast.success(t('queue.toast.clearedStale', { n: cleared })),
      onError,
    });
  };

  const pendingId =
    (setStatus.isPending && setStatus.variables?.id) ||
    (recall.isPending && recall.variables) ||
    (updateDetails.isPending && updateDetails.variables?.id) ||
    undefined;

  // ── keyboard shortcuts ───────────────────────────────────────────
  const hotkeys = useRef({ callNext, setMode, canManage });
  hotkeys.current = { callNext, setMode, canManage };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      const k = e.key.toLowerCase();
      const h = hotkeys.current;
      if (k === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (k === 'n' && h.canManage) {
        e.preventDefault();
        setWalkInOpen(true);
      } else if (k === 'c' && h.canManage) {
        e.preventDefault();
        h.callNext();
      } else if (['1', '2', '3', '4'].includes(k)) {
        h.setMode(QUEUE_MODES[Number(k) - 1]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── KPIs ─────────────────────────────────────────────────────────
  const currentWaits = groups.WAITING.filter((tk) => !tk.carriedOver).map((tk) => urgencyOf(tk, now).elapsedMin);
  const longestWait = currentWaits.length ? Math.max(...currentWaits) : 0;
  const numDelta = (cur: number, prev: number, higherIsGood: boolean) => {
    const d = cur - prev;
    if (d === 0) return { label: '±0', good: null };
    return { label: `${d > 0 ? '+' : '−'}${Math.abs(d)}`, good: higherIsGood ? d > 0 : d < 0 };
  };
  const minDelta = (cur: number | null, prev: number | null) => {
    if (cur == null || prev == null) return null;
    const d = cur - prev;
    if (d === 0) return { label: '±0', good: null };
    return { label: `${d > 0 ? '+' : '−'}${fmtWait(Math.abs(d))}`, good: d < 0 };
  };

  const statCards: Array<{
    key: string;
    icon: typeof Hourglass;
    tone: QueueStatTone;
    label: string;
    value: React.ReactNode;
    hint?: string;
    delta?: { label: string; good: boolean | null } | null;
    status?: ActiveStatus;
  }> = [
    {
      key: 'waiting',
      icon: Hourglass,
      tone: longestWait >= 20 ? 'warning' : 'neutral',
      label: t('queue.stat.waiting'),
      value: <Counted value={groups.WAITING.length} />,
      hint: currentWaits.length
        ? t('queue.stat.longestNow', { t: fmtWait(longestWait) })
        : groups.WAITING.length
          ? t('queue.stat.carriedHint', { n: groups.WAITING.length })
          : t('queue.stat.noWaiting'),
    },
    {
      key: 'called',
      icon: BellRing,
      tone: 'primary',
      label: t('queue.stat.called'),
      value: <Counted value={groups.CALLED.length} />,
      hint: t('queue.stat.calledHint'),
    },
    {
      key: 'inService',
      icon: Scissors,
      tone: 'success',
      label: t('queue.stat.inService'),
      value: <Counted value={groups.IN_SERVICE.length} />,
      hint: t('queue.busyOfTotal', {
        busy: new Set(groups.IN_SERVICE.map((tk) => tk.staffName)).size,
        total: teamSize,
      }),
    },
    {
      key: 'served',
      icon: TrendingUp,
      tone: 'info',
      label: t('queue.stat.servedToday'),
      value: <Counted value={summary?.completedToday ?? groups.COMPLETED.length} />,
      delta: summary ? numDelta(summary.completedToday, summary.yesterday.completed, true) : null,
      hint: t('queue.stat.issuedToday', { n: summary?.issuedToday ?? 0 }),
    },
    {
      key: 'avgWait',
      icon: Clock,
      tone: (summary?.avgWaitMin ?? 0) >= 20 ? 'warning' : 'neutral',
      label: t('queue.stat.avgWait'),
      value: summary?.avgWaitMin == null ? '–' : fmtWait(summary.avgWaitMin),
      delta: summary ? minDelta(summary.avgWaitMin, summary.yesterday.avgWaitMin) : null,
      hint: t('queue.stat.vsYesterday'),
    },
    {
      key: 'avgService',
      icon: Timer,
      tone: (summary?.noShowToday ?? 0) > 0 ? 'danger' : 'neutral',
      label: t('queue.stat.avgService'),
      value: summary?.avgServiceMin == null ? '–' : fmtWait(summary.avgServiceMin),
      hint: t('queue.stat.cancelNoShow', {
        c: summary?.cancelledToday ?? 0,
        n: summary?.noShowToday ?? 0,
      }),
    },
  ];

  const detailTicket = detailId ? (items.find((tk) => tk.id === detailId) ?? null) : null;
  const ready = !isLoading && !isError;
  const team = useTeamLoad(groups.IN_SERVICE, rosterNames);
  const calledToday = useMemo(
    () =>
      summary
        ? items.filter((tk) => tk.calledAt && new Date(tk.issuedAt) >= new Date(summary.dayStart))
        : EMPTY,
    [items, summary],
  );

  const focus = useMemo(() => {
    const live = [...groups.CALLED, ...groups.IN_SERVICE];
    const pinned = focusId ? live.find((tk) => tk.id === focusId) : undefined;
    if (pinned) return pinned;
    const todayCalled = groups.CALLED.filter((tk) => !tk.carriedOver);
    const pool = todayCalled.length ? todayCalled : groups.CALLED;
    return (
      [...pool].sort(
        (x, y) =>
          new Date(y.lastCalledAt ?? y.calledAt ?? y.issuedAt).getTime() -
          new Date(x.lastCalledAt ?? x.calledAt ?? x.issuedAt).getTime(),
      )[0] ?? null
    );
  }, [focusId, groups.CALLED, groups.IN_SERVICE]);

  const lanesToShow = isDesktop ? LANES : LANES.filter((l) => l.status === phoneLane);

  return (
    <div className="space-y-4">
      <QueueCommandBar
        ready={ready && items.length > 0}
        branchLabel={branchLabel}
        mode={mode}
        onMode={setMode}
        query={query}
        onQuery={setQuery}
        searchRef={searchRef}
        matchCount={matchCount}
        tagFilter={tagFilter}
        onTagFilter={setTagFilter}
        tagCounts={tagCounts}
        staffFilter={staffFilter}
        onStaffFilter={setStaffFilter}
        staffOptions={staffOptions}
        dataUpdatedAt={dataUpdatedAt}
        paused={paused}
        onTogglePaused={() => setPaused((p) => !p)}
        isFetching={isFetching}
        onRefresh={() => void refetch()}
        density={density}
        onToggleDensity={() => setDensity((d) => (d === 'compact' ? 'comfortable' : 'compact'))}
        sound={sound}
        onToggleSound={() => setSoundPref((s) => (s === 'on' ? 'off' : 'on'))}
        canManage={canManage}
        onWalkIn={() => setWalkInOpen(true)}
      />

      {isLoading ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-[72px] w-full rounded-xl" />
          <div className="grid gap-3 lg:grid-cols-3">
            {LANES.map((l) => (
              <Skeleton key={l.status} className="h-96 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ) : isError ? (
        <EmptyState
          icon={Layers}
          title={t('queue.loadError')}
          action={
            <Button variant="secondary" onClick={() => void refetch()}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              {t('queue.refresh')}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={t('queue.boardEmptyTitle')}
          description={t('queue.boardEmptyHint')}
          className="py-16"
          action={
            canManage ? (
              <Button onClick={() => setWalkInOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('walkIn.title')}
              </Button>
            ) : null
          }
        />
      ) : mode === 'wall' ? (
        <QueueWallboard
          called={groups.CALLED}
          waiting={groups.WAITING}
          inService={groups.IN_SERVICE}
          eta={eta}
          highlightId={latestCalledId}
          branchLabel={branchLabel}
          fmtWait={fmtWait}
        />
      ) : mode === 'summary' ? (
        /* ── summary: numbers, trends, team and today's history ─────── */
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {statCards.map((c, i) => (
              <QueueStatCard
                key={c.key}
                index={i}
                icon={c.icon}
                tone={c.tone}
                label={c.label}
                value={c.value}
                hint={c.hint}
                delta={c.delta}
              />
            ))}
          </div>
          <QueueInsights
            summary={summary}
            groups={{ WAITING: groups.WAITING, CALLED: groups.CALLED, IN_SERVICE: groups.IN_SERVICE }}
            calledToday={calledToday}
            now={now}
            fmtWait={fmtWait}
          />
          <TeamCapacityCard inService={groups.IN_SERVICE} rosterNames={rosterNames} now={now} />
          <QueueHistoryCard
            completed={groups.COMPLETED}
            cancelled={groups.CANCELLED}
            canManage={canManage}
            pendingId={pendingId}
            fmtWait={fmtWait}
            onOpenDetail={openDetail}
            onRestore={handlers.restore}
          />
        </>
      ) : (
        /* ── work view: who's next → the queue itself ──────────────── */
        <>
          <CarriedOverBanner
            count={summary?.carriedOver ?? 0}
            canClear={canClearStale}
            pending={clearStale.isPending}
            onClear={() => void onClearStale()}
          />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {statCards.map((c, i) => (
              <QueueStatCard
                key={c.key}
                index={i}
                icon={c.icon}
                tone={c.tone}
                label={c.label}
                value={c.value}
                hint={c.hint}
                delta={c.delta}
              />
            ))}
          </div>

          <ServingConsole
            focus={focus}
            called={groups.CALLED}
            inService={groups.IN_SERVICE}
            waiting={groups.WAITING}
            eta={eta}
            team={team}
            canManage={canManage}
            pendingId={pendingId}
            fmtWait={fmtWait}
            handlers={handlers}
            onFocus={(tk) => setFocusId(tk.id)}
            onCallNext={callNext}
            onCall={handlers.advance}
          />

          {mode === 'list' ? (
            <>
              <LaneTabs value={laneFilter} onChange={setLaneFilter} counts={counts} allowAll />
              {listRows.length === 0 ? (
                <EmptyState
                  icon={Layers}
                  title={anyFilter || laneFilter ? t('queue.noMatch') : t('queue.activeEmpty')}
                  className="py-10"
                />
              ) : (
                <QueueListView
                  tickets={listRows}
                  now={now}
                  canManage={canManage}
                  pendingId={pendingId}
                  compact={density === 'compact'}
                  showBranch={showBranch}
                  eta={eta}
                  fmtWait={fmtWait}
                  handlers={handlers}
                />
              )}
            </>
          ) : (
            <>
              {!isDesktop ? (
                <LaneTabs
                  value={phoneLane}
                  onChange={(v) => v && setPhoneLane(v)}
                  counts={counts}
                  allowAll={false}
                />
              ) : null}
              <div className={cn('grid items-start gap-3', isDesktop && 'grid-cols-3')}>
                {lanesToShow.map((lane) => {
                  const all = groups[lane.status];
                  return (
                    <QueueLane
                      key={lane.status}
                      lane={lane}
                      all={all}
                      tickets={anyFilter ? all.filter(matches) : all}
                      filtered={anyFilter}
                      now={now}
                      eta={eta}
                      canManage={canManage}
                      pendingId={pendingId}
                      compact={density === 'compact'}
                      showBranch={showBranch}
                      flashIds={flashIds}
                      fmtWait={fmtWait}
                      handlers={handlers}
                      expanded={!isDesktop}
                    />
                  );
                })}
              </div>
            </>
          )}

          <QueueInsights
            summary={summary}
            groups={{ WAITING: groups.WAITING, CALLED: groups.CALLED, IN_SERVICE: groups.IN_SERVICE }}
            calledToday={calledToday}
            now={now}
            fmtWait={fmtWait}
          />

          {canManage ? (
            <p className="hidden items-center justify-center gap-4 pb-2 text-2xs text-muted-foreground lg:flex">
              {[
                ['/', t('common.search')],
                ['N', t('walkIn.title')],
                ['C', t('queue.callNext')],
                ['1–4', t('queue.viewMode')],
              ].map(([k, label]) => (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono">{k}</kbd>
                  {label}
                </span>
              ))}
            </p>
          ) : null}
        </>
      )}

      <WalkInSheet
        open={walkInOpen}
        onOpenChange={setWalkInOpen}
        defaultBranchId={branchId === 'all' ? undefined : branchId}
      />

      <TicketDetailSheet
        ticket={detailTicket}
        onOpenChange={(o) => {
          if (!o) closeDetail();
        }}
        now={now}
        position={detailTicket?.status === 'WAITING' ? groups.WAITING.indexOf(detailTicket) + 1 : null}
        etaMin={detailTicket ? (eta.get(detailTicket.id) ?? null) : null}
        canManage={canManage}
        pending={pendingId === detailTicket?.id}
        fmtWait={fmtWait}
        handlers={handlers}
      />

      <CancelTicketDialog
        ticket={cancelTarget?.ticket ?? null}
        defaultReason={cancelTarget?.reason}
        pending={setStatus.isPending}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null);
        }}
        onConfirm={confirmCancel}
      />
    </div>
  );
}
