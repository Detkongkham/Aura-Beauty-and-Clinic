import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

/** Mirrors `AppNotificationView` in apps/backend/src/modules/system/system.service.ts (fields mobile uses). */
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
  | 'system';

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  module: NotificationModule;
  data: Record<string, unknown> | null;
  createdAt: string;
  read: boolean;
};

/** Mirrors `NotificationSummary` (fields mobile uses) — backend ສົ່ງມາພ້ອມ list. */
export type NotificationSummary = {
  total: number;
  unread: number;
  /** ຍັງບໍ່ໄດ້ຈັດການ ແລະ ເປັນ warning/critical. */
  needsAction: number;
  critical: number;
  today: number;
};

type ListResult = { items: AppNotification[]; summary: NotificationSummary };

/** ລູກຄ້າມີການແຈ້ງເຕືອນບໍ່ຫຼາຍ — 100 ລາຍການລ່າສຸດພໍ (backend max 500). */
export function useNotifications() {
  return useQuery({
    queryKey: qk.notifications,
    queryFn: async () => {
      const { data } = await http.get<{ data: ListResult }>('/notifications', {
        params: { limit: 100 },
      });
      return data.data;
    },
  });
}

/** Badge ເທິງ Home — poll ເບົາໆ (ຍັງບໍ່ມີ socket ສຳລັບ notification). */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: qk.notificationsUnread,
    queryFn: async () => {
      const { data } = await http.get<{ data: { unread: number } }>('/notifications/unread-count');
      return data.data.unread;
    },
    refetchInterval: 30_000,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.notifications });
    void qc.invalidateQueries({ queryKey: qk.notificationsUnread });
  };
}

/** ປັບ cache ທັນທີ (optimistic) ແລ້ວ sync ກັບ server. */
function usePatchCache() {
  const qc = useQueryClient();
  return (fn: (items: AppNotification[]) => AppNotification[]) => {
    qc.setQueryData<ListResult>(qk.notifications, (old) => {
      if (!old) return old;
      const items = fn(old.items);
      return {
        ...old,
        items,
        summary: {
          ...old.summary,
          total: items.length,
          unread: items.filter((n) => !n.read).length,
          needsAction: items.filter((n) => !n.read && n.severity !== 'info').length,
          critical: items.filter((n) => n.severity === 'critical').length,
        },
      };
    });
    const list = qc.getQueryData<ListResult>(qk.notifications);
    if (list) qc.setQueryData(qk.notificationsUnread, list.summary.unread);
  };
}

export function useMarkNotificationRead() {
  const invalidate = useInvalidate();
  const patch = usePatchCache();
  return useMutation({
    mutationFn: async ({ id, read }: { id: string; read: boolean }) => {
      await http.patch(`/notifications/${id}/${read ? 'read' : 'unread'}`);
    },
    onMutate: ({ id, read }) =>
      patch((items) => items.map((n) => (n.id === id ? { ...n, read } : n))),
    onSettled: invalidate,
  });
}

export function useMarkAllNotificationsRead() {
  const invalidate = useInvalidate();
  const patch = usePatchCache();
  return useMutation({
    mutationFn: async () => {
      await http.post('/notifications/read-all');
    },
    onMutate: () => patch((items) => items.map((n) => ({ ...n, read: true }))),
    onSettled: invalidate,
  });
}

export function useDeleteNotification() {
  const invalidate = useInvalidate();
  const patch = usePatchCache();
  return useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/notifications/${id}`);
    },
    onMutate: (id) => patch((items) => items.filter((n) => n.id !== id)),
    onSettled: invalidate,
  });
}

/** ຫຼາຍລາຍການພ້ອມກັນ — ໃຊ້ໂດຍ selection mode (`POST /notifications/bulk`). */
export function useBulkNotificationAction() {
  const invalidate = useInvalidate();
  const patch = usePatchCache();
  return useMutation({
    mutationFn: async ({
      ids,
      action,
    }: {
      ids: string[];
      action: 'read' | 'unread' | 'delete';
    }) => {
      await http.post('/notifications/bulk', { ids, action });
    },
    onMutate: ({ ids, action }) => {
      const set = new Set(ids);
      return patch((items) =>
        action === 'delete'
          ? items.filter((n) => !set.has(n.id))
          : items.map((n) => (set.has(n.id) ? { ...n, read: action === 'read' } : n)),
      );
    },
    onSettled: invalidate,
  });
}
