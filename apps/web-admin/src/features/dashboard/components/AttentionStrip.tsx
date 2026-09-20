import {
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Hourglass,
  House,
  ListOrdered,
  PackageOpen,
  ReceiptText,
  Stamp,
  StarOff,
  Truck,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Skeleton } from '@/components/ui/skeleton';
import { formatCompactNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/router/paths';
import type { DashboardStats } from '@/types/models';

type Severity = 'danger' | 'warning' | 'info';

interface Item {
  key: string;
  icon: LucideIcon;
  label: string;
  to: string;
  severity: Severity;
  /** Optional money figure appended in a pill. */
  extra?: string;
}

const SEVERITY: Record<Severity, { wrap: string; chip: string; dot: string }> = {
  danger: {
    wrap: 'border-destructive/30 bg-destructive/[0.06] hover:border-destructive/50',
    chip: 'bg-destructive-soft text-destructive',
    dot: 'bg-destructive',
  },
  warning: {
    wrap: 'border-warning/30 bg-warning/[0.07] hover:border-warning/50',
    chip: 'bg-warning-soft text-warning',
    dot: 'bg-warning',
  },
  info: {
    wrap: 'border-border bg-card hover:border-primary/40',
    chip: 'bg-info-soft text-info',
    dot: 'bg-info',
  },
};
const SEVERITY_RANK: Record<Severity, number> = { danger: 0, warning: 1, info: 2 };

/** Queue waits longer than this are flagged red (minutes). */
const QUEUE_WAIT_ALERT_MIN = 20;

/**
 * "Needs attention" — every open to-do the stats payload knows about, as one row of
 * link chips ordered by severity. Zero-count items are dropped; if nothing is left
 * the strip collapses to a single all-clear line instead of disappearing (so the
 * absence of alerts is itself a visible signal).
 */
export function AttentionStrip({ data }: { data?: DashboardStats }) {
  const { t } = useTranslation();

  if (!data) {
    return (
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-52 shrink-0 rounded-xl" />
        ))}
      </div>
    );
  }

  const a = data.attention;
  const candidates: Array<Item & { count: number }> = [
    {
      key: 'queue',
      count: data.queueWaiting > 0 && data.queueLongestWaitMin >= QUEUE_WAIT_ALERT_MIN ? 1 : 0,
      icon: Timer,
      label: t('dashboard.attention.queueWait', { n: data.queueLongestWaitMin }),
      to: ROUTES.queue,
      severity: 'danger',
    },
    {
      key: 'confirm',
      count: data.pendingConfirmation,
      icon: CalendarCheck2,
      label: t('dashboard.attention.pendingConfirmation', { count: data.pendingConfirmation }),
      to: ROUTES.appointments,
      severity: 'warning',
    },
    {
      key: 'unpaid',
      count: a.unpaidBills,
      icon: ReceiptText,
      label: t('dashboard.attention.unpaidBills', { count: a.unpaidBills }),
      extra: formatCompactNumber(a.outstandingBalance),
      to: ROUTES.finance,
      severity: 'warning',
    },
    {
      key: 'stock',
      count: a.lowStock,
      icon: PackageOpen,
      label: t('dashboard.attention.lowStock', { count: a.lowStock }),
      to: ROUTES.inventory,
      severity: 'danger',
    },
    {
      key: 'ratings',
      count: a.lowRatings,
      icon: StarOff,
      label: t('dashboard.attention.lowRatings', { count: a.lowRatings }),
      to: ROUTES.customers,
      severity: 'danger',
    },
    {
      key: 'timeoff',
      count: data.pendingApprovals,
      icon: Stamp,
      label: t('dashboard.attention.pendingApprovals', { count: data.pendingApprovals }),
      to: ROUTES.timeOff,
      severity: 'warning',
    },
    {
      key: 'home',
      count: a.homeServiceActive,
      icon: House,
      label: t('dashboard.attention.homeService', { count: a.homeServiceActive }),
      to: ROUTES.homeServiceDispatch,
      severity: 'info',
    },
    {
      key: 'waitlist',
      count: a.waitlist,
      icon: ListOrdered,
      label: t('dashboard.attention.waitlist', { count: a.waitlist }),
      to: ROUTES.calendar,
      severity: 'info',
    },
    {
      key: 'po',
      count: a.openPurchaseOrders,
      icon: Hourglass,
      label: t('dashboard.attention.openPOs', { count: a.openPurchaseOrders }),
      to: ROUTES.inventoryPurchaseOrders,
      severity: 'info',
    },
    {
      key: 'transfers',
      count: a.transfersInTransit,
      icon: Truck,
      label: t('dashboard.attention.transfers', { count: a.transfersInTransit }),
      to: ROUTES.inventoryTransfers,
      severity: 'info',
    },
  ];
  const items = candidates
    .filter((c) => c.count > 0)
    .sort((x, y) => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity]);

  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 rounded-xl border border-success/25 bg-success/[0.06] px-3.5 py-2.5 text-sm text-success animate-in fade-in motion-reduce:animate-none">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t('dashboard.attention.allClear')}
      </p>
    );
  }

  return (
    <nav aria-label={t('dashboard.attention.title')} className="min-w-0">
      <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] md:flex-wrap md:overflow-visible">
        {items.map((item, i) => {
          const s = SEVERITY[item.severity];
          const Icon = item.icon;
          return (
            <li
              key={item.key}
              className="shrink-0 snap-start animate-in fade-in slide-in-from-left-1 fill-mode-both duration-300 motion-reduce:animate-none"
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
            >
              <Link
                to={item.to}
                className={cn(
                  'group flex h-10 items-center gap-2 rounded-xl border pl-1.5 pr-3 text-sm transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:hover:translate-y-0',
                  s.wrap,
                )}
              >
                <span
                  className={cn(
                    'relative flex h-7 w-7 items-center justify-center rounded-lg',
                    s.chip,
                  )}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {item.severity === 'danger' ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-card motion-safe:animate-pulse',
                        s.dot,
                      )}
                    />
                  ) : null}
                </span>
                <span className="whitespace-nowrap font-medium">{item.label}</span>
                {item.extra ? (
                  <span className="rounded-md bg-background/70 px-1.5 py-0.5 text-xs font-semibold tabular-nums">
                    ₭{item.extra}
                  </span>
                ) : null}
                <ArrowRight
                  className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
