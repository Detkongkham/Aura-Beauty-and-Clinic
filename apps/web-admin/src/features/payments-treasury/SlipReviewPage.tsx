import type { SlipFlag } from '@abcp/shared-types';
import { CircleCheckBig, Inbox, SearchX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { EmptyState } from '@/components/shared/EmptyState';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/features/auth/useAuth';
import { useBranches } from '@/features/branches/branches.api';
import { useConfirm } from '@/hooks/useConfirm';
import { useDebounce } from '@/hooks/useDebounce';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

import { SlipDetail } from './SlipDetail';
import { SlipHealthBand, SlipInsightsRow } from './SlipHealthBand';
import { SlipRow } from './SlipRow';
import { SlipShortcutsDialog } from './SlipShortcutsDialog';
import { SlipUploadDialog } from './SlipUploadDialog';
import { SlipsCommandBar } from './SlipsCommandBar';
import { VERDICT_ICON } from './slip.lib';
import {
  SLIP_FLAGS,
  SLIP_RANGES,
  SLIP_SORTS,
  SLIP_VIEWS,
  claimedByOther,
  groupQueue,
  rangeBounds,
  slipHeadlineAmount,
  sortSlips,
  type SlipRange,
  type SlipSort,
  type SlipView,
} from './slipModel';
import { todayKey } from './treasury.lib';
import {
  downloadSlipsCsv,
  useBulkApproveSlips,
  useSlip,
  useSlipSummary,
  useSlips,
} from './treasury.api';
import { useSlipSocket } from './useSlipSocket';

/** Rows fetched per step (S11 "load more" adds another step, up to the cap). Header counts come from `/slips/summary`. */
const INBOX_STEP = 100;
const INBOX_CAP = 1000;
const FOCUS_KEY = 'aura.slips.focus';
/** SLA fallback until the summary arrives (the server owns the real value). */
const DEFAULT_SLA = 30;

function pick<T extends string>(v: string | null, allowed: readonly T[], fallback: T): T {
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function isTyping(el: EventTarget | null): boolean {
  const n = el as HTMLElement | null;
  return Boolean(n && (n.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(n.tagName)));
}

/**
 * /payments/slips — transfer-slip review command center.
 *
 * Command bar (tabs + counts, search, date, sort, branch, failed-check flags, bulk confirm) → review
 * health band (queue composition + SLA, needs-attention shortcuts, today & 7-day trend; hideable
 * via Focus) → workspace: grouped queue + reading pane on xl, list + Sheet below. Every filter and the
 * open slip live in the URL, so a link reproduces the exact view. OCR never moves money on its own by
 * default: a reviewer confirms here (see the slip policy on the Banks page).
 */
export function SlipReviewPage() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { user, hasPermission } = useAuth();
  const canReview = hasPermission('payments:review');
  const isSuper = user?.role === 'SUPER_ADMIN';
  const isWide = useMediaQuery('(min-width: 1280px)');
  const [params, setParams] = useSearchParams();

  const openId = params.get('s');
  const view = pick<SlipView>(params.get('view'), SLIP_VIEWS, 'action');
  const flag = pick<SlipFlag | ''>(params.get('flag'), SLIP_FLAGS, '');
  const range = pick<SlipRange>(params.get('range'), SLIP_RANGES, 'all');
  const sort = pick<SlipSort>(params.get('sort'), SLIP_SORTS, 'queue');
  const branchId = isSuper ? (params.get('branch') ?? '') : '';
  const [q, setQ] = useState(params.get('q') ?? '');
  const debouncedQ = useDebounce(q.trim(), 300);

  const [focus, setFocus] = useState(() => {
    try {
      return localStorage.getItem(FOCUS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [shortcuts, setShortcuts] = useState(false);
  const [limit, setLimit] = useState(INBOX_STEP);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const searchRef = useRef<HTMLInputElement>(null);

  const setParam = useCallback(
    (patch: Record<string, string | null>) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v);
            else next.delete(k);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  // Keep `?q=` in step with the debounced box so the link carries the search.
  useEffect(() => {
    if ((params.get('q') ?? '') !== debouncedQ) setParam({ q: debouncedQ || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the debounced text settles
  }, [debouncedQ]);

  // Waiting times tick without a refetch.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const live = useSlipSocket(canReview);
  const { data: branches = [] } = useBranches();
  const summaryQ = useSlipSummary(branchId || undefined);
  const summary = summaryQ.data;
  const sla = summary?.slaMinutes ?? DEFAULT_SLA;

  const bounds = rangeBounds(range, todayKey());
  const { data, isLoading, isError, isFetching } = useSlips({
    pageSize: limit,
    view,
    ...(flag ? { flag } : {}),
    ...(branchId ? { branchId } : {}),
    ...(debouncedQ ? { q: debouncedQ } : {}),
    ...bounds,
  });
  const items = useMemo(() => sortSlips(data?.items ?? [], view, sort), [data, view, sort]);
  const grouped = useMemo(
    () => (view === 'action' && sort === 'queue' ? groupQueue(items) : null),
    [items, view, sort],
  );
  const ordered = useMemo(
    () => (grouped ? grouped.flatMap((g) => g.items) : items),
    [grouped, items],
  );
  // Bulk confirm skips slips a colleague is holding (S5) — the server would refuse them anyway.
  const ready = useMemo(
    () => items.filter((s) => s.verdict === 'AUTO_MATCHED' && !claimedByOther(s, user?.id)),
    [items, user?.id],
  );

  // A new filter starts from the first step again.
  useEffect(() => setLimit(INBOX_STEP), [view, flag, range, branchId, debouncedQ]);

  async function exportCsv() {
    setExporting(true);
    try {
      await downloadSlipsCsv({
        view,
        ...(flag ? { flag } : {}),
        ...(branchId ? { branchId } : {}),
        ...(debouncedQ ? { q: debouncedQ } : {}),
        ...rangeBounds(range, todayKey()),
      });
    } catch {
      toast.error(t('payTreasury.slips.exportFailed'));
    } finally {
      setExporting(false);
    }
  }

  // Drop selections that left the queue (approved by a colleague, filtered out…).
  useEffect(() => {
    setSelected((prev) => {
      const keep = new Set([...prev].filter((id) => ready.some((s) => s.id === id)));
      return keep.size === prev.size ? prev : keep;
    });
  }, [ready]);

  const openTotal = summary
    ? summary.open.needsReview + summary.open.autoMatched + summary.open.pending
    : null;
  const counts: Record<SlipView, number | null> = {
    action:
      view === 'action' && data && !flag && !debouncedQ && range === 'all' ? data.total : openTotal,
    approved: view === 'approved' && data ? data.total : null,
    rejected: view === 'rejected' && data ? data.total : null,
    all: view === 'all' && data ? data.total : null,
  };

  // Detail comes from the list row when present, refreshed by its own query (live after a review).
  const listed = items.find((s) => s.id === openId) ?? null;
  const detailQ = useSlip(openId);
  const open = detailQ.data ?? listed;

  const select = useCallback((id: string | null) => setParam({ s: id }), [setParam]);

  const idx = ordered.findIndex((s) => s.id === openId);
  const step = useCallback(
    (d: 1 | -1) => {
      const next = ordered[idx === -1 ? 0 : Math.min(ordered.length - 1, Math.max(0, idx + d))];
      if (!next) return;
      select(next.id);
      rowRefs.current.get(next.id)?.scrollIntoView?.({ block: 'nearest' });
    },
    [ordered, idx, select],
  );
  const nav =
    idx === -1
      ? undefined
      : {
          index: idx,
          total: ordered.length,
          onPrev: idx > 0 ? () => step(-1) : null,
          onNext: idx < ordered.length - 1 ? () => step(1) : null,
        };

  // Wide screens land on the first queued slip so the reading pane is never empty while work exists.
  useEffect(() => {
    if (isWide && !openId && ordered.length > 0) select(ordered[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the queue first fills / view changes
  }, [isWide, ordered.length, view, flag]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulk = useBulkApproveSlips();
  async function confirmSelected() {
    const ids = [...selected];
    const rows = ready.filter((s) => selected.has(s.id));
    const total = rows.reduce(
      (sum, s) => sum + (s.payment.currency === 'LAK' ? slipHeadlineAmount(s) : 0),
      0,
    );
    const ok = await confirm({
      title: t('payTreasury.slips.bulk.title', { count: ids.length }),
      description: t('payTreasury.slips.bulk.body', { amount: formatCurrency(total, 'LAK') }),
      confirmLabel: t('payTreasury.slips.bulk.confirm', { count: ids.length }),
    });
    if (!ok) return;
    bulk.mutate(ids, {
      onSuccess: (res) => {
        setSelected(new Set());
        if (res.failed.length === 0)
          toast.success(t('payTreasury.slips.bulk.done', { count: res.approved.length }));
        else
          toast.warning(
            t('payTreasury.slips.bulk.partial', {
              ok: res.approved.length,
              failed: res.failed.length,
            }),
            {
              description: res.failed[0]?.message,
            },
          );
      },
      onError: () => toast.error(t('common.saveError')),
    });
  }

  // J/K/↑/↓ move · / search · ? help · X select ready slip. A/R/E/Z live in the reading pane.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) {
        if (e.key === 'Escape' && e.target === searchRef.current) searchRef.current?.blur();
        return;
      }
      const dialogs = document.querySelectorAll('[role="dialog"], [role="alertdialog"]').length;
      if (dialogs > (isWide ? 0 : openId ? 1 : 0)) return;
      const k = e.key;
      if (k === 'j' || k === 'J' || k === 'ArrowDown') {
        e.preventDefault();
        step(1);
      } else if (k === 'k' || k === 'K' || k === 'ArrowUp') {
        e.preventDefault();
        step(-1);
      } else if (k === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (k === '?') {
        e.preventDefault();
        setShortcuts(true);
      } else if (
        (k === 'x' || k === 'X') &&
        canReview &&
        openId &&
        ready.some((s) => s.id === openId)
      ) {
        e.preventDefault();
        toggle(openId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function toggleFocus() {
    setFocus((f) => {
      try {
        localStorage.setItem(FOCUS_KEY, f ? '0' : '1');
      } catch {
        /* private mode — the toggle still works for this visit */
      }
      return !f;
    });
  }

  const filtered = Boolean(flag || debouncedQ || range !== 'all' || branchId);
  const clearFilters = () => {
    setQ('');
    setParam({ flag: null, q: null, range: null, branch: null });
  };

  const detail = open ? (
    <SlipDetail
      slip={open}
      canReview={canReview}
      onBack={isWide ? undefined : () => select(null)}
      nav={nav}
      onOpenSlip={(id) => select(id)}
      slaMinutes={sla}
      now={now}
      hotkeys={!shortcuts && !uploading}
      meId={user?.id}
    />
  ) : (
    <div className="flex h-full items-center justify-center p-8">
      <EmptyState
        icon={Inbox}
        title={t('payTreasury.slips.pickTitle')}
        description={t('payTreasury.slips.pickHint')}
      />
    </div>
  );

  const renderRow = (s: (typeof items)[number]) => (
    <SlipRow
      key={s.id}
      slip={s}
      active={s.id === openId}
      onSelect={() => select(s.id)}
      slaMinutes={sla}
      now={now}
      selectable={canReview && s.verdict === 'AUTO_MATCHED' && !claimedByOther(s, user?.id)}
      meId={user?.id}
      selected={selected.has(s.id)}
      onToggle={() => toggle(s.id)}
      setRef={(el) => {
        if (el) rowRefs.current.set(s.id, el);
        else rowRefs.current.delete(s.id);
      }}
    />
  );

  return (
    <div className="space-y-4">
      <SlipsCommandBar
        ref={searchRef}
        live={live}
        view={view}
        onView={(v) => setParam({ view: v === 'action' ? null : v, s: null })}
        counts={counts}
        q={q}
        onQ={setQ}
        range={range}
        onRange={(r) => setParam({ range: r === 'all' ? null : r })}
        sort={sort}
        onSort={(s) => setParam({ sort: s === 'queue' ? null : s })}
        flag={flag}
        onFlag={(f) => setParam({ flag: f || null })}
        isSuper={isSuper}
        branchId={branchId}
        onBranch={(id) => setParam({ branch: id || null })}
        branches={branches}
        onClear={clearFilters}
        focus={focus}
        onFocus={toggleFocus}
        onShortcuts={() => setShortcuts(true)}
        onExport={() => void exportCsv()}
        exporting={exporting}
        onUpload={canReview ? () => setUploading(true) : null}
        bulk={
          canReview
            ? {
                selected: selected.size,
                ready: ready.length,
                pending: bulk.isPending,
                onConfirm: () => void confirmSelected(),
                onSelectAll: () => setSelected(new Set(ready.map((s) => s.id))),
              }
            : null
        }
      />

      {!focus ? (
        <SlipHealthBand
          summary={summary}
          loading={summaryQ.isLoading}
          now={now}
          onFlag={(f) =>
            setParam({ flag: f, view: f === 'duplicate' ? 'rejected' : null, s: null })
          }
          onOldest={() => setParam({ view: null, sort: 'oldest', flag: null, s: null })}
          onView={(v) => setParam({ view: v === 'action' ? null : v, s: null })}
        />
      ) : null}
      {!focus ? <SlipInsightsRow summary={summary} /> : null}

      <div
        className={cn(
          'grid overflow-hidden rounded-xl border border-border bg-card shadow-sm',
          'xl:h-[calc(100vh-240px)] xl:min-h-[620px] xl:grid-cols-[400px_1fr]',
        )}
      >
        <div className="flex min-h-0 flex-col border-border xl:border-r">
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-2xs text-muted-foreground">
            <span aria-live="polite">
              {data ? t('payTreasury.slips.resultCount', { count: data.total }) : ' '}
              {isFetching && !isLoading ? (
                <span className="ml-1.5 motion-safe:animate-pulse">·</span>
              ) : null}
            </span>
            {selected.size > 0 ? (
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setSelected(new Set())}
              >
                {t('payTreasury.slips.bulk.clear', { count: selected.size })}
              </button>
            ) : null}
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto"
            role="list"
            aria-label={t('payTreasury.slips.queue')}
            aria-busy={isLoading}
          >
            {isLoading ? (
              <div className="space-y-2 p-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[72px] w-full rounded-lg" />
                ))}
              </div>
            ) : isError ? (
              <p className="p-6 text-center text-sm text-destructive">
                {t('payTreasury.loadError')}
              </p>
            ) : items.length === 0 ? (
              filtered ? (
                <EmptyState
                  className="m-3 border-0"
                  icon={SearchX}
                  title={t('payTreasury.slips.emptyFiltered')}
                  description={t('payTreasury.slips.emptyFilteredHint')}
                  action={
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      {t('payTreasury.slips.clearFilters')}
                    </button>
                  }
                />
              ) : (
                <EmptyState
                  className="m-3 border-0"
                  icon={view === 'action' ? CircleCheckBig : Inbox}
                  title={t(`payTreasury.slips.empty.${view}`)}
                  description={
                    view === 'action' && summary
                      ? t('payTreasury.slips.caughtUp', { count: summary.today.approved })
                      : t('payTreasury.slips.emptyHint')
                  }
                />
              )
            ) : grouped ? (
              grouped.map((g) => {
                const Icon = VERDICT_ICON[g.verdict];
                const groupReady = g.verdict === 'AUTO_MATCHED' && canReview;
                const all = groupReady && g.items.every((s) => selected.has(s.id));
                return (
                  <div key={g.verdict} role="presentation">
                    <div
                      role="presentation"
                      className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-muted/80 px-3 py-1.5 text-2xs font-semibold text-muted-foreground backdrop-blur"
                    >
                      {groupReady ? (
                        <Checkbox
                          checked={all}
                          onChange={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              for (const s of g.items) {
                                if (all) next.delete(s.id);
                                else next.add(s.id);
                              }
                              return next;
                            })
                          }
                          aria-label={t('payTreasury.slips.bulk.selectGroup')}
                        />
                      ) : (
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>{t(`payTreasury.verdict.${g.verdict}`)}</span>
                      <span className="rounded-full bg-card px-1.5 tabular-nums">
                        {g.items.length}
                      </span>
                      {g.verdict === 'AUTO_MATCHED' ? (
                        <span className="ml-auto font-normal">
                          {t('payTreasury.slips.groupReadyHint')}
                        </span>
                      ) : g.verdict === 'NEEDS_REVIEW' ? (
                        <span className="ml-auto font-normal">
                          {t('payTreasury.slips.groupNeedsHint')}
                        </span>
                      ) : null}
                    </div>
                    {g.items.map(renderRow)}
                  </div>
                );
              })
            ) : (
              items.map(renderRow)
            )}
            {data && data.total > items.length ? (
              <div className="flex flex-col items-center gap-1.5 px-3 py-3">
                <p className="text-center text-2xs text-muted-foreground">
                  {t('payTreasury.slips.truncated', { shown: items.length, total: data.total })}
                </p>
                {limit < INBOX_CAP ? (
                  <button
                    type="button"
                    onClick={() => setLimit((l) => Math.min(INBOX_CAP, l + INBOX_STEP))}
                    disabled={isFetching}
                    className="rounded-md border border-border px-3 py-1.5 text-xs font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    {t('payTreasury.slips.loadMore', {
                      n: Math.min(INBOX_STEP, data.total - items.length),
                    })}
                  </button>
                ) : (
                  <p className="text-center text-2xs text-muted-foreground">
                    {t('payTreasury.slips.capHint')}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {isWide ? <div className="min-h-0 min-w-0">{detail}</div> : null}
      </div>

      {!isWide ? (
        <Sheet open={Boolean(openId && open)} onOpenChange={(o) => !o && select(null)}>
          <SheetContent side="right" className="gap-0 p-0 sm:max-w-[720px]">
            <SheetTitle className="sr-only">{t('payTreasury.slips.detailTitle')}</SheetTitle>
            {detail}
          </SheetContent>
        </Sheet>
      ) : null}

      <SlipShortcutsDialog open={shortcuts} onOpenChange={setShortcuts} />
      {canReview ? (
        <SlipUploadDialog
          open={uploading}
          onOpenChange={setUploading}
          onUploaded={(slip) => setParam({ view: null, flag: null, s: slip.id })}
        />
      ) : null}
    </div>
  );
}
