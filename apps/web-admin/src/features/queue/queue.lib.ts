import { BellRing, Check, Hourglass, Scissors, X, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { QueueTicket } from '@/types/models';

import type { QueueStatus } from './queue.api';

export type ActiveStatus = 'WAITING' | 'CALLED' | 'IN_SERVICE';

export const ACTIVE_ORDER: ActiveStatus[] = ['WAITING', 'CALLED', 'IN_SERVICE'];

/** How the board is rendered. `board` = kanban lanes, `list` = one dense table,
 *  `wall` = big glanceable display for a second screen. */
export type QueueMode = 'board' | 'list' | 'summary' | 'wall';
export const QUEUE_MODES: QueueMode[] = ['board', 'list', 'summary', 'wall'];

export const NEXT: Partial<Record<QueueStatus, QueueStatus>> = {
  WAITING: 'CALLED',
  CALLED: 'IN_SERVICE',
  IN_SERVICE: 'COMPLETED',
};

export interface LaneDef {
  status: ActiveStatus;
  icon: LucideIcon;
  /** solid top border colour */
  accent: string;
  /** header background tint */
  tint: string;
  /** solid header icon chip */
  chip: string;
  /** solid header count pill */
  count: string;
  /** scroll-body background tint — keeps columns visually distinct */
  body: string;
}

// Lane colours (system tokens only): WAITING → neutral, CALLED → primary (the
// system's blue / brand azure — also matches the now-serving band), IN_SERVICE →
// success (green = "actively being served"). The COMPLETED strip is neutral so it
// doesn't read as another green lane. Amber/red stay reserved for ageing / SLA.
export const LANES: LaneDef[] = [
  {
    status: 'WAITING',
    icon: Hourglass,
    accent: 'border-t-muted-foreground/50',
    tint: 'bg-muted/70',
    chip: 'bg-muted-foreground/15 text-foreground',
    count: 'bg-muted-foreground/15 text-foreground',
    body: 'bg-muted/25',
  },
  {
    status: 'CALLED',
    icon: BellRing,
    accent: 'border-t-primary',
    tint: 'bg-primary/[0.08]',
    chip: 'bg-primary text-primary-foreground',
    count: 'bg-primary text-primary-foreground',
    body: 'bg-primary/[0.04]',
  },
  {
    status: 'IN_SERVICE',
    icon: Scissors,
    accent: 'border-t-success',
    tint: 'bg-success-soft/50',
    chip: 'bg-success text-success-foreground',
    count: 'bg-success text-success-foreground',
    body: 'bg-success-soft/15',
  },
];

export const RAIL: Record<ActiveStatus, string> = {
  WAITING: 'bg-muted-foreground/40',
  CALLED: 'bg-primary',
  IN_SERVICE: 'bg-success',
};

export const NUM_CHIP: Record<ActiveStatus, string> = {
  WAITING: 'bg-muted text-foreground',
  CALLED: 'bg-primary/10 text-primary',
  IN_SERVICE: 'bg-success-soft text-success',
};

/** Border colour on hover — keeps the card tied to its lane without shouting at rest. */
export const HOVER_BORDER: Record<ActiveStatus, string> = {
  WAITING: 'hover:border-muted-foreground/30',
  CALLED: 'hover:border-primary/40',
  IN_SERVICE: 'hover:border-success/40',
};

/** Flow-flash ring colour when a card lands in a new lane. */
export const FLASH_RING: Record<ActiveStatus, string> = {
  WAITING: 'ring-muted-foreground/40',
  CALLED: 'ring-primary/50',
  IN_SERVICE: 'ring-success/50',
};

/** Minutes each lane is expected to clear a ticket within — drives the urgency bar. */
export const SLA_MIN: Record<ActiveStatus, number> = { WAITING: 20, CALLED: 5, IN_SERVICE: 60 };

export const ADVANCE_ICON: Record<QueueStatus, LucideIcon> = {
  WAITING: Hourglass,
  CALLED: BellRing,
  IN_SERVICE: Scissors,
  COMPLETED: Check,
  CANCELLED: X,
};

/** Advance button tint — matches the lane (card) the ticket currently sits in. */
export const ADVANCE_BTN: Record<ActiveStatus, string> = {
  WAITING: 'border-border bg-muted/60 text-foreground hover:bg-muted',
  CALLED: 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/[0.16]',
  IN_SERVICE: 'border-success/30 bg-success-soft text-success hover:bg-success-soft/70',
};

export function waitMinutes(ticket: QueueTicket, now: number): number {
  return Math.max(0, Math.round((now - new Date(ticket.issuedAt).getTime()) / 60_000));
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  );
}

export function byIssuedAsc(a: QueueTicket, b: QueueTicket): number {
  return new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime();
}

const PRIORITY_RANK: Record<string, number> = { VIP: 0, APPOINTMENT: 1, NORMAL: 2 };

/** Serving order for the waiting lane: today's tickets before carried-over ones,
 *  then VIP → booked → walk-in, then first-come-first-served. "Call next" takes [0]. */
export function byServeOrder(a: QueueTicket, b: QueueTicket): number {
  const stale = Number(!!a.carriedOver) - Number(!!b.carriedOver);
  if (stale !== 0) return stale;
  const pr = (PRIORITY_RANK[a.priority ?? 'NORMAL'] ?? 2) - (PRIORITY_RANK[b.priority ?? 'NORMAL'] ?? 2);
  if (pr !== 0) return pr;
  return byIssuedAsc(a, b);
}

export const CANCEL_REASONS = ['NO_SHOW', 'CUSTOMER_LEFT', 'DUPLICATE', 'OTHER'] as const;

/** Default hands-on minutes when a service has no duration on file. */
const DEFAULT_SERVICE_MIN = 30;

/**
 * Rough "starts in ~N min" for each queued ticket: a greedy simulation over the
 * team's capacity. Every busy staff member frees up when their current ticket's
 * expected duration runs out; idle staff are free now. Called tickets are served
 * first (they're already at the counter), then waiting tickets in serve order.
 */
export function estimateStartTimes(
  called: QueueTicket[],
  waiting: QueueTicket[],
  inService: QueueTicket[],
  teamSize: number,
  now: number,
): Map<string, number> {
  const slots: number[] = inService.map((tk) => {
    const start = new Date(tk.startedAt ?? tk.calledAt ?? tk.issuedAt).getTime();
    const dur = (tk.serviceDurationMin ?? DEFAULT_SERVICE_MIN) * 60_000;
    return Math.max(now, start + dur);
  });
  const idle = Math.max(teamSize - inService.length, slots.length === 0 ? 1 : 0);
  for (let i = 0; i < idle; i += 1) slots.push(now);

  const out = new Map<string, number>();
  for (const tk of [...called, ...waiting]) {
    slots.sort((x, y) => x - y);
    const startAt = slots[0]!;
    out.set(tk.id, Math.max(0, Math.round((startAt - now) / 60_000)));
    slots[0] = startAt + (tk.serviceDurationMin ?? DEFAULT_SERVICE_MIN) * 60_000;
  }
  return out;
}

/** Minutes a live in-service ticket has been worked on, and its % of the booked duration. */
export function serviceProgress(tk: QueueTicket, now: number): { min: number; pct: number | null } {
  const start = tk.startedAt ?? tk.calledAt;
  if (!start) return { min: 0, pct: null };
  const min = Math.max(0, Math.round((now - new Date(start).getTime()) / 60_000));
  const dur = tk.serviceDurationMin;
  return { min, pct: dur ? Math.round((min / dur) * 100) : null };
}

/** Wait a ticket sat in the queue before being called (minutes), or null if never called. */
export function completedWait(tk: QueueTicket): number | null {
  return tk.calledAt
    ? Math.max(
        0,
        Math.round((new Date(tk.calledAt).getTime() - new Date(tk.issuedAt).getTime()) / 60_000),
      )
    : null;
}

/** Hands-on service minutes (startedAt → completedAt), or null when not both known. */
export function serviceMinutes(tk: QueueTicket): number | null {
  return tk.startedAt && tk.completedAt
    ? Math.max(
        0,
        Math.round(
          (new Date(tk.completedAt).getTime() - new Date(tk.startedAt).getTime()) / 60_000,
        ),
      )
    : null;
}

export function ticketMatches(tk: QueueTicket, q: string): boolean {
  return (
    !q ||
    [tk.number, tk.customerName, tk.serviceName, tk.staffName, tk.branchName].some((v) =>
      v?.toLowerCase().includes(q),
    )
  );
}

export type UrgencyLevel = 'ok' | 'warn' | 'late';

/** How close a ticket is to breaching its lane SLA, measured from lane entry. */
export function urgencyOf(
  ticket: QueueTicket,
  now: number,
): { elapsedMin: number; sla: number; pct: number; level: UrgencyLevel } {
  const status = ticket.status as ActiveStatus;
  const anchor =
    status === 'WAITING'
      ? ticket.issuedAt
      : status === 'CALLED'
        ? (ticket.lastCalledAt ?? ticket.calledAt ?? ticket.issuedAt)
        : (ticket.startedAt ?? ticket.calledAt ?? ticket.issuedAt);
  const elapsedMin = Math.max(0, Math.round((now - new Date(anchor).getTime()) / 60_000));
  // In service, the booked duration (+20% grace) is a fairer bar than a flat hour.
  const sla =
    status === 'IN_SERVICE' && ticket.serviceDurationMin
      ? Math.round(ticket.serviceDurationMin * 1.2)
      : (SLA_MIN[status] ?? 20);
  const pct = Math.min(100, Math.round((elapsedMin / sla) * 100));
  const level: UrgencyLevel = pct >= 100 ? 'late' : pct >= 60 ? 'warn' : 'ok';
  return { elapsedMin, sla, pct, level };
}

/** Minutes → compact "45 ນທ" / "3 ຊມ" / "2 ມື້" (rounded — an at-a-glance chip). */
export function useWaitFormatter() {
  const { t } = useTranslation();
  return (minutes: number) => {
    if (minutes < 60) return t('queue.waitMin', { n: minutes });
    if (minutes < 600 && minutes % 60 !== 0)
      return t('queue.waitHm', { h: Math.floor(minutes / 60), m: minutes % 60 });
    if (minutes < 1440) return t('queue.waitH', { h: Math.round(minutes / 60) });
    return t('queue.waitD', { d: Math.round(minutes / 1440) });
  };
}

/** Who is free — and who is busy on what: roster merged with in-service tickets. */
export function useTeamLoad(inService: QueueTicket[], rosterNames: string[]) {
  return useMemo(() => {
    const busy = new Map<string, QueueTicket>();
    for (const tk of inService) if (tk.staffName && !busy.has(tk.staffName)) busy.set(tk.staffName, tk);
    const names = [...new Set([...rosterNames, ...busy.keys()])];
    const rows = names
      .map((name) => ({ name, ticket: busy.get(name) ?? null }))
      .sort((a, b) => Number(!!b.ticket) - Number(!!a.ticket) || a.name.localeCompare(b.name));
    return {
      rows,
      busy: busy.size,
      total: names.length,
      free: rows.filter((r) => !r.ticket).map((r) => r.name),
    };
  }, [inService, rosterNames]);
}
