import type { PortalCountKey } from '@abcp/shared-types';
import {
  AlertOctagon,
  ArrowLeftRight,
  BellRing,
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  FileWarning,
  Hourglass,
  ListOrdered,
  Megaphone,
  MessageCircle,
  PackageMinus,
  Plane,
  Receipt,
  Scale,
  ScanLine,
  SlidersHorizontal,
  Vault,
  type LucideIcon,
} from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useDashboardStats } from '@/features/dashboard/dashboard.api';
import { formatCurrency } from '@/lib/format';
import { ROUTES } from '@/router/paths';
import { useUiStore } from '@/store/ui.store';

import { usePortalSummary } from './portal.api';

export type Severity = 'danger' | 'warn' | 'info';

export interface AttentionItem {
  id: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
  count: number;
  to: string;
  severity: Severity;
}

export interface Badge {
  count: number;
  severity: Severity;
}

const SEVERITY_ORDER: Record<Severity, number> = { danger: 0, warn: 1, info: 2 };

/** One row per summary count that deserves a place in "Needs attention". */
const ATTENTION: Array<{
  key: PortalCountKey;
  icon: LucideIcon;
  to: string;
  severity: Severity;
}> = [
  { key: 'notificationsCritical', icon: AlertOctagon, to: ROUTES.notifications, severity: 'danger' },
  { key: 'lowStock', icon: PackageMinus, to: ROUTES.inventory, severity: 'danger' },
  { key: 'queueWaiting', icon: Hourglass, to: ROUTES.queue, severity: 'warn' },
  { key: 'appointmentsPending', icon: CalendarClock, to: ROUTES.appointments, severity: 'warn' },
  { key: 'slipsToReview', icon: ScanLine, to: ROUTES.paymentsSlips, severity: 'warn' },
  { key: 'expensesToApprove', icon: Receipt, to: ROUTES.paymentsExpenses, severity: 'warn' },
  { key: 'expensesDueSoon', icon: FileWarning, to: ROUTES.paymentsExpenses, severity: 'warn' },
  { key: 'timeOffPending', icon: Plane, to: ROUTES.timeOff, severity: 'warn' },
  { key: 'adjustmentsPending', icon: SlidersHorizontal, to: ROUTES.inventoryLedger, severity: 'warn' },
  { key: 'unpaidBills', icon: Receipt, to: ROUTES.finance, severity: 'warn' },
  { key: 'statementLinesUnmatched', icon: Scale, to: ROUTES.paymentsReconciliation, severity: 'info' },
  { key: 'cashDrawersOpen', icon: Vault, to: ROUTES.paymentsReconciliation, severity: 'info' },
  { key: 'stockCountsOpen', icon: ClipboardCheck, to: ROUTES.inventory, severity: 'info' },
  { key: 'openPurchaseOrders', icon: ClipboardList, to: ROUTES.inventoryPurchaseOrders, severity: 'info' },
  { key: 'transfersInTransit', icon: ArrowLeftRight, to: ROUTES.inventoryTransfers, severity: 'info' },
  { key: 'waitlist', icon: ListOrdered, to: ROUTES.appointments, severity: 'info' },
  { key: 'messagesUnread', icon: MessageCircle, to: ROUTES.messaging, severity: 'info' },
  { key: 'announcementsUnread', icon: Megaphone, to: `${ROUTES.portal}#announcements`, severity: 'info' },
  { key: 'notificationsUnread', icon: BellRing, to: ROUTES.notifications, severity: 'info' },
];

/** Module path → which summary count its tile shows. */
const BADGES: Array<{ to: string; key: PortalCountKey; severity: Severity }> = [
  { to: ROUTES.notifications, key: 'notificationsUnread', severity: 'info' },
  { to: ROUTES.messaging, key: 'messagesUnread', severity: 'info' },
  { to: ROUTES.queue, key: 'queueWaiting', severity: 'warn' },
  { to: ROUTES.appointments, key: 'appointmentsPending', severity: 'warn' },
  { to: ROUTES.timeOff, key: 'timeOffPending', severity: 'warn' },
  { to: ROUTES.inventory, key: 'lowStock', severity: 'danger' },
  { to: ROUTES.inventoryPurchaseOrders, key: 'openPurchaseOrders', severity: 'info' },
  { to: ROUTES.inventoryTransfers, key: 'transfersInTransit', severity: 'info' },
  { to: ROUTES.inventoryLedger, key: 'adjustmentsPending', severity: 'warn' },
  { to: ROUTES.finance, key: 'unpaidBills', severity: 'warn' },
  { to: ROUTES.homeServiceDispatch, key: 'homeServiceActive', severity: 'info' },
  { to: ROUTES.paymentsSlips, key: 'slipsToReview', severity: 'warn' },
  { to: ROUTES.paymentsExpenses, key: 'expensesToApprove', severity: 'warn' },
  { to: ROUTES.paymentsReconciliation, key: 'statementLinesUnmatched', severity: 'info' },
];

/**
 * Everything "live" the portal shows. Counts come from GET /portal/summary, which
 * only returns what the caller may open; today's bento keeps using the dashboard
 * stats (for users with dashboard access). `allowed` is the set of module paths
 * the user can open — an item is only surfaced when its destination is reachable.
 */
export function usePortalSignals(allowed: Set<string>, canDashboard: boolean) {
  const { t } = useTranslation();
  const branchId = useUiStore((s) => s.activeBranchId);
  const stats = useDashboardStats(branchId, 7, { refetchIntervalMs: 60_000, enabled: canDashboard });
  const summary = usePortalSummary(branchId);
  const counts = summary.data?.counts;

  const attention = useMemo<AttentionItem[]>(() => {
    if (!counts) return [];
    const hint = (key: PortalCountKey): string | undefined => {
      if (key === 'queueWaiting' && (counts.queueLongestWaitMin ?? 0) > 0) {
        return t('portal.stat.longestWait', { min: counts.queueLongestWaitMin });
      }
      if (key === 'lowStock') return stats.data?.lowStockItems[0]?.name;
      if (key === 'unpaidBills' && (stats.data?.attention.outstandingBalance ?? 0) > 0) {
        return formatCurrency(stats.data?.attention.outstandingBalance);
      }
      return undefined;
    };
    const rows: AttentionItem[] = [];
    for (const def of ATTENTION) {
      let count = counts[def.key] ?? 0;
      // Critical notifications have their own row — don't count them twice.
      if (def.key === 'notificationsUnread') count -= counts.notificationsCritical ?? 0;
      const reachable = def.to.startsWith(ROUTES.portal) || allowed.has(def.to);
      if (count <= 0 || !reachable) continue;
      rows.push({
        id: def.key,
        icon: def.icon,
        label: t(`portal.attention.${def.key}`),
        hint: hint(def.key),
        count,
        to: def.to,
        severity:
          def.key === 'queueWaiting' && (counts.queueLongestWaitMin ?? 0) >= 30 ? 'danger' : def.severity,
      });
    }
    if (summary.data?.reconOpenMonth && allowed.has(ROUTES.paymentsReconciliation)) {
      rows.push({
        id: 'reconOpenMonth',
        icon: Scale,
        label: t('portal.attention.reconOpenMonth', { month: summary.data.reconOpenMonth }),
        count: 1,
        to: ROUTES.paymentsReconciliation,
        severity: 'warn',
      });
    }
    return rows.sort((x, y) => SEVERITY_ORDER[x.severity] - SEVERITY_ORDER[y.severity]);
  }, [counts, summary.data?.reconOpenMonth, stats.data, allowed, t]);

  const badges = useMemo(() => {
    const m = new Map<string, Badge>();
    if (!counts) return m;
    for (const b of BADGES) {
      const n = counts[b.key];
      if (n && n > 0) {
        const severity =
          b.key === 'notificationsUnread' && (counts.notificationsCritical ?? 0) > 0 ? 'danger' : b.severity;
        m.set(b.to, { count: n, severity });
      }
    }
    return m;
  }, [counts]);

  return {
    stats: canDashboard ? stats.data : undefined,
    statsLoading: canDashboard && stats.isLoading,
    statsFetching: stats.isFetching || summary.isFetching,
    statsUpdatedAt: Math.max(stats.dataUpdatedAt, summary.dataUpdatedAt),
    counts,
    refetch: () => {
      if (canDashboard) void stats.refetch();
      void summary.refetch();
    },
    attention,
    badges,
    signalsLoading: summary.isLoading,
  };
}
