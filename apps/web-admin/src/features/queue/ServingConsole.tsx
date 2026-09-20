import {
  BellRing,
  Check,
  CircleCheckBig,
  Megaphone,
  Phone,
  Play,
  Scissors,
  StickyNote,
  Timer,
  Undo2,
  UserRound,
  UserX,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CurrencyText } from '@/components/shared/CurrencyText';
import { DateTimeText } from '@/components/shared/DateTimeText';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { QueueTicket } from '@/types/models';

import type { TicketHandlers } from './TicketActionsMenu';
import { TicketTags } from './TicketTags';
import { initials } from './queue.lib';

interface TeamRow {
  name: string;
  ticket: QueueTicket | null;
}

interface Props {
  /** The ticket the console is working on (CALLED / IN_SERVICE), or null. */
  focus: QueueTicket | null;
  called: QueueTicket[];
  inService: QueueTicket[];
  /** WAITING in serve order. */
  waiting: QueueTicket[];
  eta: Map<string, number>;
  team: { rows: TeamRow[]; busy: number; total: number; free: string[] };
  canManage: boolean;
  pendingId?: string;
  fmtWait: (m: number) => string;
  handlers: TicketHandlers;
  onFocus: (tk: QueueTicket) => void;
  onCallNext: () => void;
  onCall: (tk: QueueTicket) => void;
}

const UP_NEXT = 5;

/** Re-renders every second — the console's stopwatch. */
function useTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Serving console — the front desk's cockpit. One focused ticket at a time with a
 * three-step flow (Called → In service → Completed), a live stopwatch, the customer
 * context staff need at the counter, and the up-next rail + team availability beside it.
 */
export function ServingConsole({
  focus,
  called,
  inService,
  waiting,
  eta,
  team,
  canManage,
  pendingId,
  fmtWait,
  handlers,
  onFocus,
  onCallNext,
  onCall,
}: Props) {
  const { t } = useTranslation();
  const now = useTick(focus != null);
  const next = waiting[0] ?? null;
  const busy = !!focus && pendingId === focus.id;

  const status = focus?.status;
  const anchor =
    focus && status === 'IN_SERVICE'
      ? (focus.startedAt ?? focus.calledAt ?? focus.issuedAt)
      : focus
        ? (focus.lastCalledAt ?? focus.calledAt ?? focus.issuedAt)
        : null;
  const elapsedMs = anchor ? now - new Date(anchor).getTime() : 0;
  const dur = focus?.serviceDurationMin ?? null;
  const pct = status === 'IN_SERVICE' && dur ? Math.round((elapsedMs / (dur * 60_000)) * 100) : null;
  const overCall = status === 'CALLED' && elapsedMs > 5 * 60_000;
  const others = [...called, ...inService].filter((tk) => tk.id !== focus?.id);

  const steps = focus
    ? [
        { key: 'called', label: t('queue.step.called'), at: focus.calledAt, state: 'done' as const },
        {
          key: 'started',
          label: t('queue.step.started'),
          at: focus.startedAt ?? null,
          state: status === 'IN_SERVICE' ? ('current' as const) : ('todo' as const),
        },
        { key: 'completed', label: t('queue.step.completed'), at: null, state: 'todo' as const },
      ]
    : [];

  return (
    <section aria-label={t('queue.spotlight')} className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
      {/* ── serving now ───────────────────────────────────────────── */}
      <div
        className={cn(
          'relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-sm',
          status === 'IN_SERVICE' ? 'border-success/30' : focus ? 'border-primary/30' : 'border-border',
        )}
      >
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b to-transparent',
            status === 'IN_SERVICE' ? 'from-success-soft/70' : 'from-primary/[0.09]',
          )}
        />
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {focus ? `${t(`status.${focus.status}`)}: ${focus.number}` : t('queue.nowServingEmpty')}
        </p>

        <header className="relative flex items-center justify-between gap-2 px-5 pt-4">
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold',
              status === 'IN_SERVICE' ? 'bg-success-soft text-success' : 'bg-primary/10 text-primary',
            )}
          >
            <span className="relative flex h-2 w-2" aria-hidden="true">
              {focus ? (
                <span
                  className={cn(
                    'absolute inline-flex h-full w-full animate-ping rounded-full motion-reduce:animate-none',
                    status === 'IN_SERVICE' ? 'bg-success/50' : 'bg-primary/50',
                  )}
                />
              ) : null}
              <span
                className={cn(
                  'relative inline-flex h-2 w-2 rounded-full',
                  status === 'IN_SERVICE' ? 'bg-success' : focus ? 'bg-primary' : 'bg-muted-foreground/50',
                )}
              />
            </span>
            {focus ? t(`queue.console.${focus.status}`) : t('queue.console.idle')}
          </span>
          {focus ? (
            <button
              type="button"
              onClick={() => handlers.openDetail(focus)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {t('queue.viewDetail')}
            </button>
          ) : null}
        </header>

        {!focus ? (
          <div className="relative flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Megaphone className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-base font-semibold">{t('queue.console.idleTitle')}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {next ? t('queue.console.idleHint', { number: next.number }) : t('queue.noWaitingHint')}
              </p>
            </div>
            {canManage && next ? (
              <Button size="lg" className="h-11 gap-2 px-5" disabled={pendingId === next.id} onClick={onCallNext}>
                <BellRing className="h-4 w-4" aria-hidden="true" />
                {t('queue.callNext')} {next.number}
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="relative flex flex-1 flex-col px-5 pb-5 pt-3">
            {/* identity + stopwatch */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4">
                <span
                  className={cn(
                    'flex h-20 min-w-[6.5rem] items-center justify-center rounded-2xl px-3 text-4xl font-bold tabular-nums shadow-sm',
                    status === 'IN_SERVICE' ? 'bg-success text-success-foreground' : 'bg-primary text-primary-foreground',
                  )}
                >
                  {focus.number}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xl font-semibold">{focus.customerName}</p>
                  <TicketTags ticket={focus} className="mt-1" />
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                      {focus.customerId
                        ? (focus.visitCount ?? 0) === 0
                          ? t('queue.firstVisit')
                          : t('queue.visitsTitle', { n: focus.visitCount })
                        : t('queue.guestCustomer')}
                    </span>
                    {focus.customerPhone ? (
                      <a
                        href={`tel:${focus.customerPhone}`}
                        className="inline-flex items-center gap-1 tabular-nums hover:text-foreground"
                      >
                        <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                        {focus.customerPhone}
                      </a>
                    ) : null}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p
                  className={cn(
                    'text-3xl font-semibold leading-none tabular-nums',
                    (pct != null && pct > 100) || overCall ? 'text-destructive' : 'text-foreground',
                  )}
                  aria-label={t(`queue.elapsedIn.${focus.status as 'CALLED'}`)}
                >
                  {clock(elapsedMs)}
                </p>
                <p className="mt-1 text-2xs text-muted-foreground">
                  {status === 'IN_SERVICE' ? t('queue.elapsedIn.IN_SERVICE') : t('queue.sinceCalled')}
                  {(focus.callCount ?? 0) > 1 ? ` · ${t('queue.calledTimes', { n: focus.callCount })}` : ''}
                </p>
              </div>
            </div>

            {/* service facts */}
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <div className="rounded-xl bg-muted/50 px-3 py-2">
                <p className="flex items-center gap-1 text-2xs text-muted-foreground">
                  <Scissors className="h-3 w-3" aria-hidden="true" />
                  {t('appointments.service')}
                </p>
                <p className="truncate text-sm font-medium">{focus.serviceName}</p>
                <p className="flex gap-2 text-2xs text-muted-foreground">
                  {dur ? <span>{t('queue.estDuration', { n: dur })}</span> : null}
                  {focus.servicePrice ? <CurrencyText amount={focus.servicePrice} /> : null}
                </p>
              </div>
              <div className="rounded-xl bg-muted/50 px-3 py-2">
                <p className="flex items-center gap-1 text-2xs text-muted-foreground">
                  <UserRound className="h-3 w-3" aria-hidden="true" />
                  {t('appointments.staff')}
                </p>
                <p className="truncate text-sm font-medium">{focus.staffName ?? t('queue.anyStaff')}</p>
                <p className="truncate text-2xs text-muted-foreground">{focus.branchName}</p>
              </div>
              <div className="rounded-xl bg-muted/50 px-3 py-2">
                <p className="flex items-center gap-1 text-2xs text-muted-foreground">
                  <Timer className="h-3 w-3" aria-hidden="true" />
                  {status === 'IN_SERVICE' ? t('queue.eta') : t('queue.waitTime')}
                </p>
                <p className="text-sm font-medium tabular-nums">
                  {status === 'IN_SERVICE' && dur && anchor ? (
                    <DateTimeText value={new Date(new Date(anchor).getTime() + dur * 60_000).toISOString()} mode="time" />
                  ) : focus.calledAt ? (
                    fmtWait(
                      Math.max(0, Math.round((new Date(focus.calledAt).getTime() - new Date(focus.issuedAt).getTime()) / 60_000)),
                    )
                  ) : (
                    '–'
                  )}
                </p>
                <p className="text-2xs tabular-nums text-muted-foreground">
                  {t('queue.waitingSince')} <DateTimeText value={focus.issuedAt} mode="time" />
                </p>
              </div>
            </div>

            {focus.note ? (
              <p className="mt-2 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft/50 px-3 py-2 text-sm">
                <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                {focus.note}
              </p>
            ) : null}

            {/* stepper */}
            <ol className="mt-4 grid grid-cols-3 gap-2" aria-label={t('queue.timeline')}>
              {steps.map((s, i) => (
                <li key={s.key} className="min-w-0">
                  <div
                    className={cn(
                      'h-1.5 overflow-hidden rounded-full',
                      s.state === 'todo' ? 'bg-muted' : status === 'IN_SERVICE' ? 'bg-success/25' : 'bg-primary/25',
                    )}
                  >
                    <div
                      className={cn(
                        'h-full rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none',
                        status === 'IN_SERVICE' ? 'bg-success' : 'bg-primary',
                      )}
                      style={{
                        width:
                          s.state === 'done' ? '100%' : s.state === 'current' ? `${Math.min(100, pct ?? 50)}%` : '0%',
                      }}
                    />
                  </div>
                  <p
                    className={cn(
                      'mt-1.5 flex items-center gap-1 truncate text-2xs',
                      s.state === 'todo' ? 'text-muted-foreground' : 'font-medium text-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold',
                        s.state === 'todo' ? 'bg-muted text-muted-foreground' : 'bg-foreground text-background',
                      )}
                    >
                      {s.state === 'done' ? <Check className="h-2.5 w-2.5" aria-hidden="true" /> : i + 1}
                    </span>
                    {s.label}
                    {s.at ? (
                      <span className="ml-auto font-normal tabular-nums text-muted-foreground">
                        <DateTimeText value={s.at} mode="time" />
                      </span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ol>

            {/* actions */}
            {canManage ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {status === 'CALLED' ? (
                  <>
                    <Button size="lg" className="h-11 flex-1 gap-2 sm:flex-none sm:px-6" disabled={busy} onClick={() => handlers.advance(focus)}>
                      <Play className="h-4 w-4" aria-hidden="true" />
                      {t('queue.advanceTo.IN_SERVICE')}
                    </Button>
                    <Button variant="secondary" size="lg" className="h-11 gap-2" disabled={busy} onClick={() => handlers.recall(focus)}>
                      <BellRing className="h-4 w-4" aria-hidden="true" />
                      {t('queue.recall')}
                    </Button>
                    <Button variant="ghost" size="lg" className="h-11 gap-2" disabled={busy} onClick={() => handlers.sendBack(focus)}>
                      <Undo2 className="h-4 w-4" aria-hidden="true" />
                      <span className="hidden sm:inline">{t('queue.sendBack')}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="lg"
                      className="h-11 gap-2 text-destructive hover:bg-destructive-soft sm:ml-auto"
                      disabled={busy}
                      onClick={() => handlers.cancel(focus, 'NO_SHOW')}
                    >
                      <UserX className="h-4 w-4" aria-hidden="true" />
                      {t('queue.markNoShow')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="lg"
                      className="h-11 flex-1 gap-2 bg-success text-success-foreground hover:bg-success/90 sm:flex-none sm:px-6"
                      disabled={busy}
                      onClick={() => handlers.advance(focus)}
                    >
                      <CircleCheckBig className="h-4 w-4" aria-hidden="true" />
                      {t('queue.advanceTo.COMPLETED')}
                    </Button>
                    {canManage && next ? (
                      <Button variant="secondary" size="lg" className="h-11 gap-2" disabled={pendingId === next.id} onClick={onCallNext}>
                        <BellRing className="h-4 w-4" aria-hidden="true" />
                        {t('queue.callNext')} {next.number}
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </div>
        )}

        {others.length > 0 ? (
          <footer className="relative flex items-center gap-2 overflow-x-auto border-t border-border bg-muted/30 px-5 py-2.5">
            <span className="shrink-0 text-2xs font-medium text-muted-foreground">{t('queue.console.alsoActive')}</span>
            {others.slice(0, 12).map((tk) => (
              <button
                key={tk.id}
                type="button"
                onClick={() => onFocus(tk)}
                title={`${tk.customerName} · ${t(`status.${tk.status}`)}`}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors hover:bg-muted',
                  tk.status === 'IN_SERVICE' ? 'border-success/30 text-success' : 'border-primary/30 text-primary',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn('h-1.5 w-1.5 rounded-full', tk.status === 'IN_SERVICE' ? 'bg-success' : 'bg-primary')}
                />
                {tk.number}
              </button>
            ))}
            {others.length > 12 ? (
              <span className="shrink-0 text-2xs text-muted-foreground">+{others.length - 12}</span>
            ) : null}
          </footer>
        ) : null}
      </div>

      {/* ── up next + team ───────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
        <div className="flex flex-col rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              {t('queue.stat.next')}
              <span className="rounded-full bg-muted px-1.5 text-2xs font-semibold tabular-nums text-muted-foreground">
                {waiting.length}
              </span>
            </h2>
            {waiting.length > 0 && eta.has(waiting[Math.min(waiting.length, UP_NEXT) - 1]!.id) ? (
              <span className="text-2xs tabular-nums text-muted-foreground" title={t('queue.clearsInHint')}>
                {t('queue.clearsIn', { t: fmtWait(eta.get(waiting[waiting.length - 1]!.id) ?? 0) })}
              </span>
            ) : null}
          </div>
          {waiting.length === 0 ? (
            <p className="mt-6 text-center text-sm text-muted-foreground">{t('queue.stat.noWaiting')}</p>
          ) : (
            <ol className="mt-2 space-y-1">
              {waiting.slice(0, UP_NEXT).map((tk, i) => {
                const e = eta.get(tk.id);
                return (
                  <li
                    key={tk.id}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/60',
                      i === 0 && 'bg-primary/[0.05]',
                    )}
                  >
                    <span className="w-4 shrink-0 text-center text-2xs tabular-nums text-muted-foreground">{i + 1}</span>
                    <button
                      type="button"
                      onClick={() => handlers.openDetail(tk)}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <span
                        className={cn(
                          'w-14 shrink-0 rounded-lg py-1 text-center text-sm font-bold tabular-nums',
                          tk.priority === 'VIP' ? 'bg-accent-soft text-accent-foreground' : 'bg-muted text-foreground',
                        )}
                      >
                        {tk.number}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{tk.customerName}</span>
                        <span className="block truncate text-2xs text-muted-foreground">
                          {tk.serviceName}
                          {e != null && !tk.carriedOver
                            ? ` · ${e === 0 ? t('queue.readyNow') : t('queue.inAbout', { t: fmtWait(e) })}`
                            : ''}
                        </span>
                      </span>
                    </button>
                    {canManage ? (
                      <Button
                        variant={i === 0 ? 'primary' : 'secondary'}
                        size="sm"
                        className={cn('h-8 shrink-0 px-2.5', i > 0 && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
                        disabled={pendingId === tk.id}
                        onClick={() => onCall(tk)}
                        aria-label={`${t('queue.advanceTo.CALLED')} ${tk.number}`}
                      >
                        <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                        {i === 0 ? t('queue.advanceTo.CALLED') : null}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
              {waiting.length > UP_NEXT ? (
                <li className="px-2 pt-1 text-2xs text-muted-foreground">
                  {t('queue.moreWaiting', { n: waiting.length - UP_NEXT })}
                </li>
              ) : null}
            </ol>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t('queue.teamCapacity')}</h2>
            <span className="text-2xs tabular-nums text-muted-foreground">
              {t('queue.freeOfTotal', { free: team.free.length, total: team.total })}
            </span>
          </div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-success-soft" aria-hidden="true">
            <span
              className="h-full bg-warning transition-[width] duration-500"
              style={{ width: `${team.total ? (team.busy / team.total) * 100 : 0}%` }}
            />
          </div>
          <ul className="mt-3 flex max-h-[92px] flex-wrap gap-1.5 overflow-y-auto">
            {team.rows.slice(0, 24).map((r) => (
              <li
                key={r.name}
                title={r.ticket ? `${r.name} · ${r.ticket.number}` : `${r.name} · ${t('queue.freeStaff')}`}
                className={cn(
                  'inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-2xs',
                  r.ticket ? 'border-border bg-muted/40' : 'border-success/30 bg-success-soft/40',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold',
                    r.ticket ? 'bg-warning-soft text-warning' : 'bg-success text-success-foreground',
                  )}
                >
                  {initials(r.name)}
                </span>
                <span className="truncate">{r.name}</span>
                {r.ticket ? <span className="shrink-0 tabular-nums text-muted-foreground">{r.ticket.number}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
