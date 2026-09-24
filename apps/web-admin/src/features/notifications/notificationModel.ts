import {
  CalendarClock,
  Crown,
  Gift,
  Info,
  ListOrdered,
  Megaphone,
  OctagonAlert,
  Package,
  ServerCog,
  ShieldAlert,
  TriangleAlert,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { dayjs } from '@/lib/format';
import { APP_TIMEZONE } from '@/lib/constants';
import { ROUTES } from '@/router/paths';

import type { AppNotification, Category, NotificationModule, Severity } from './notifications.api';

export const SEVERITY_ORDER: Severity[] = ['critical', 'warning', 'info'];
export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
export const CATEGORY_ORDER: Category[] = [
  'booking',
  'staff',
  'inventory',
  'payment',
  'marketing',
  'system',
];

export const SEVERITY_META: Record<
  Severity,
  {
    icon: LucideIcon;
    /** Soft tile behind icons. */
    tile: string;
    text: string;
    dot: string;
    bar: string;
    badge: 'danger' | 'warning' | 'info';
  }
> = {
  critical: {
    icon: OctagonAlert,
    tile: 'bg-destructive-soft text-destructive',
    text: 'text-destructive',
    dot: 'bg-destructive',
    bar: 'bg-destructive',
    badge: 'danger',
  },
  warning: {
    icon: TriangleAlert,
    tile: 'bg-warning-soft text-warning',
    text: 'text-warning',
    dot: 'bg-warning',
    bar: 'bg-warning',
    badge: 'warning',
  },
  info: {
    icon: Info,
    tile: 'bg-info-soft text-info',
    text: 'text-info',
    dot: 'bg-info',
    bar: 'bg-info',
    badge: 'info',
  },
};

export const CATEGORY_META: Record<Category, { icon: LucideIcon; bar: string }> = {
  booking: { icon: CalendarClock, bar: 'bg-chart-1' },
  staff: { icon: Users, bar: 'bg-chart-2' },
  inventory: { icon: Package, bar: 'bg-chart-3' },
  payment: { icon: Wallet, bar: 'bg-chart-4' },
  marketing: { icon: Megaphone, bar: 'bg-chart-5' },
  system: { icon: ServerCog, bar: 'bg-chart-6' },
};

export const MODULE_ICON: Record<NotificationModule, LucideIcon> = {
  appointments: CalendarClock,
  waitlist: ListOrdered,
  homeService: Truck,
  staff: Users,
  inventory: Package,
  payments: Wallet,
  giftCards: Gift,
  loyalty: Crown,
  marketing: Megaphone,
  security: ShieldAlert,
  system: ServerCog,
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * Where "Open related" should take the admin. Uses the push payload (`data`) for an exact
 * record when present, otherwise the owning module's list page. `null` = nothing to open.
 */
export function relatedLink(n: AppNotification): { to: string; exact: boolean } | null {
  const d = n.data ?? {};
  const type = n.type.toUpperCase();
  switch (n.module) {
    case 'appointments': {
      const id = str(d.appointmentId);
      return id
        ? { to: ROUTES.appointmentDetail(id), exact: true }
        : { to: ROUTES.appointments, exact: false };
    }
    case 'waitlist':
      return { to: ROUTES.queue, exact: false };
    case 'homeService': {
      const id = str(d.appointmentId);
      return id
        ? { to: ROUTES.appointmentDetail(id), exact: true }
        : { to: ROUTES.homeServiceDispatch, exact: false };
    }
    case 'staff':
      return type.includes('TIMEOFF')
        ? { to: ROUTES.timeOff, exact: false }
        : { to: ROUTES.staff, exact: false };
    case 'inventory':
      if (type.includes('PURCHASE_ORDER'))
        return { to: ROUTES.inventoryPurchaseOrders, exact: false };
      if (type.includes('RECONCILIATION')) return { to: ROUTES.inventoryLedger, exact: false };
      return { to: ROUTES.inventory, exact: false };
    case 'payments': {
      if (type.includes('EXPENSE')) {
        const expenseId = str(d.expenseId);
        return expenseId
          ? { to: `${ROUTES.paymentsExpenses}?id=${expenseId}`, exact: true }
          : { to: ROUTES.paymentsExpenses, exact: false };
      }
      const id = str(d.paymentId);
      return id
        ? { to: ROUTES.financePaymentDetail(id), exact: true }
        : { to: ROUTES.finance, exact: false };
    }
    case 'giftCards':
      return { to: ROUTES.giftCards, exact: false };
    case 'loyalty':
      return { to: ROUTES.loyalty, exact: false };
    case 'marketing':
      return { to: ROUTES.marketing, exact: false };
    case 'security':
      return { to: `${ROUTES.account}#acc-sessions`, exact: false };
    default:
      return null;
  }
}

export type RecencyGroup = 'today' | 'yesterday' | 'week' | 'earlier';
export const RECENCY_ORDER: RecencyGroup[] = ['today', 'yesterday', 'week', 'earlier'];

/** Calendar-day bucket in Asia/Vientiane (not the browser's zone). */
export function recencyOf(iso: string, now = Date.now()): RecencyGroup {
  const today = dayjs(now).tz(APP_TIMEZONE).startOf('day');
  const d = dayjs(iso).tz(APP_TIMEZONE);
  if (!d.isBefore(today)) return 'today';
  if (!d.isBefore(today.subtract(1, 'day'))) return 'yesterday';
  if (!d.isBefore(today.subtract(6, 'day'))) return 'week';
  return 'earlier';
}

export type InboxView = 'all' | 'unread' | 'action' | 'resolved';
export type SortMode = 'newest' | 'priority';

export interface InboxFilters {
  view: InboxView;
  severity: Severity | 'all';
  category: Category | 'all';
  q: string;
}

export function matchesView(n: AppNotification, view: InboxView): boolean {
  switch (view) {
    case 'unread':
      return !n.read;
    case 'action':
      return !n.resolved && n.severity !== 'info';
    case 'resolved':
      return n.resolved;
    default:
      return true;
  }
}

export function filterNotifications(items: AppNotification[], f: InboxFilters): AppNotification[] {
  const q = f.q.trim().toLowerCase();
  return items.filter((n) => {
    if (!matchesView(n, f.view)) return false;
    if (f.severity !== 'all' && n.severity !== f.severity) return false;
    if (f.category !== 'all' && n.category !== f.category) return false;
    if (!q) return true;
    return (
      n.title.toLowerCase().includes(q) ||
      n.body.toLowerCase().includes(q) ||
      n.type.toLowerCase().includes(q)
    );
  });
}

export function sortNotifications(items: AppNotification[], mode: SortMode): AppNotification[] {
  const out = [...items];
  if (mode === 'newest') return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // Priority: open before resolved, higher severity, then newest. Read state is deliberately NOT a
  // key — opening an item marks it read, and it must not jump away from under the cursor.
  return out.sort((a, b) => {
    if (a.resolved !== b.resolved) return a.resolved ? 1 : -1;
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Human duration from minutes: `45m`, `3h 20m`, `2d 4h`. Unit labels come from i18n. */
export function splitDuration(minutes: number): { d: number; h: number; m: number } {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = Math.round(minutes % 60);
  return { d, h, m };
}

/** Payload values rendered in the detail panel — objects collapse to JSON. */
export function payloadEntries(data: AppNotification['data']): [string, string][] {
  if (!data) return [];
  return Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]);
}
