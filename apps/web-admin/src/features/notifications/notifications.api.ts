import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { http } from '@/services/http';

export type Severity = 'critical' | 'warning' | 'info';
export type Category = 'booking' | 'staff' | 'inventory' | 'payment' | 'marketing' | 'system';
export type NotificationModule =
  | 'appointments'
  | 'waitlist'
  | 'homeService'
  | 'staff'
  | 'inventory'
  | 'payments'
  | 'giftCards'
  | 'loyalty'
  | 'marketing'
  | 'security'
  | 'system';

/** Mirrors `AppNotificationView` in apps/backend/src/modules/system/system.service.ts. */
export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: Severity;
  category: Category;
  module: NotificationModule;
  source: string;
  data: Record<string, unknown> | null;
  createdAt: string;
  read: boolean;
  readAt: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: { id: string; name: string } | null;
}

export interface NotificationSummary {
  total: number;
  unread: number;
  needsAction: number;
  critical: number;
  today: number;
  resolved7d: number;
  medianResolveMinutes: number | null;
}

export interface NotificationList {
  items: AppNotification[];
  summary: NotificationSummary;
  daily: { date: string; total: number; critical: number; warning: number }[];
  limit: number;
}

export type SingleAction = 'read' | 'unread' | 'resolve' | 'reopen';
export type BulkAction = SingleAction | 'delete';

/** Inbox window held in memory — filters/grouping are client-side over this slice. */
export const INBOX_LIMIT = 300;

export const notificationKeys = {
  list: ['notifications', 'list'] as const,
  unreadCount: ['notifications', 'unread-count'] as const,
};

export function useNotificationList() {
  return useQuery({
    queryKey: notificationKeys.list,
    queryFn: async () => {
      const res = await http.get<{ data: NotificationList }>('/notifications', {
        params: { limit: INBOX_LIMIT },
      });
      return res.data.data;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: async () => {
      const res = await http.get<{ data: { unread: number; critical: number } }>(
        '/notifications/unread-count',
      );
      return res.data.data;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** Local mirror of the server-side state change so the list reacts instantly. */
function applyLocal(n: AppNotification, action: SingleAction, now: string): AppNotification {
  switch (action) {
    case 'read':
      return n.read ? n : { ...n, read: true, readAt: now };
    case 'unread':
      return { ...n, read: false, readAt: null };
    case 'resolve':
      return n.resolved
        ? n
        : { ...n, resolved: true, resolvedAt: now, read: true, readAt: n.readAt ?? now };
    case 'reopen':
      return { ...n, resolved: false, resolvedAt: null, resolvedBy: null };
  }
}

function recomputeSummary(
  prev: NotificationSummary,
  before: AppNotification[],
  after: AppNotification[],
) {
  // Adjust server totals by the delta between the two local snapshots (items outside the
  // loaded window are unaffected by a local action, so the delta is exact).
  const count = (list: AppNotification[]) => ({
    unread: list.filter((n) => !n.read).length,
    needsAction: list.filter((n) => !n.resolved && n.severity !== 'info').length,
    critical: list.filter((n) => !n.resolved && n.severity === 'critical').length,
    total: list.length,
  });
  const a = count(before);
  const b = count(after);
  return {
    ...prev,
    total: prev.total + (b.total - a.total),
    unread: Math.max(0, prev.unread + (b.unread - a.unread)),
    needsAction: Math.max(0, prev.needsAction + (b.needsAction - a.needsAction)),
    critical: Math.max(0, prev.critical + (b.critical - a.critical)),
  };
}

async function optimistic(
  qc: QueryClient,
  update: (items: AppNotification[]) => AppNotification[],
): Promise<{ prev?: NotificationList }> {
  await qc.cancelQueries({ queryKey: notificationKeys.list });
  const prev = qc.getQueryData<NotificationList>(notificationKeys.list);
  if (prev) {
    const items = update(prev.items);
    qc.setQueryData<NotificationList>(notificationKeys.list, {
      ...prev,
      items,
      summary: recomputeSummary(prev.summary, prev.items, items),
    });
  }
  return { prev };
}

function settle(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: ['notifications'] });
}

export function useNotificationAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: SingleAction }) =>
      http
        .patch<{ data: AppNotification }>(`/notifications/${id}/${action}`)
        .then((r) => r.data.data),
    onMutate: ({ id, action }) => {
      const now = new Date().toISOString();
      return optimistic(qc, (items) =>
        items.map((n) => (n.id === id ? applyLocal(n, action, now) : n)),
      );
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(notificationKeys.list, ctx.prev);
    },
    onSettled: () => settle(qc),
  });
}

export function useBulkNotificationAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: BulkAction }) =>
      http
        .post<{ data: { updated: number } }>('/notifications/bulk', { ids, action })
        .then((r) => r.data.data),
    onMutate: ({ ids, action }) => {
      const set = new Set(ids);
      const now = new Date().toISOString();
      return optimistic(qc, (items) =>
        action === 'delete'
          ? items.filter((n) => !set.has(n.id))
          : items.map((n) => (set.has(n.id) ? applyLocal(n, action, now) : n)),
      );
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(notificationKeys.list, ctx.prev);
    },
    onSettled: () => settle(qc),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      http.post<{ data: { updated: number } }>('/notifications/read-all').then((r) => r.data.data),
    onMutate: () => {
      const now = new Date().toISOString();
      return optimistic(qc, (items) => items.map((n) => applyLocal(n, 'read', now)));
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(notificationKeys.list, ctx.prev);
    },
    onSettled: () => settle(qc),
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => http.delete(`/notifications/${id}`).then(() => id),
    onMutate: (id) => optimistic(qc, (items) => items.filter((n) => n.id !== id)),
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(notificationKeys.list, ctx.prev);
    },
    onSettled: () => settle(qc),
  });
}
