import { useEffect, useRef } from 'react';
import { navigationRef } from '../navigation/navigationRef';
import { useAuthStore } from '../store/auth.store';
import { routeForNotification } from './pushRouting';

type Response = {
  notification: { request: { identifier: string; content: { title?: string | null; data?: Record<string, unknown> } } };
};

/**
 * ກົດ push → ເປີດໜ້າທີ່ກ່ຽວຂ້ອງ (ທັງຕອນແອັບເປີດຢູ່ ແລະ cold start). ໂຫລດ expo-notifications ແບບ lazy
 * ຄືກັບ lib/push.ts ເພື່ອບໍ່ໃຫ້ແອັບພັງຖ້າ native module ບໍ່ມີ. ລໍຈົນ login + navigation ພ້ອມກ່ອນນຳທາງ.
 */
export function usePushNavigation(): void {
  const status = useAuthStore((s) => s.status);
  const role = useAuthStore((s) => s.user?.role ?? null);
  const handled = useRef(new Set<string>());
  const pending = useRef<Response | null>(null);

  const go = (res: Response) => {
    const id = res.notification.request.identifier;
    if (handled.current.has(id)) return;
    if (useAuthStore.getState().status !== 'authed' || !navigationRef.isReady()) {
      pending.current = res;
      return;
    }
    handled.current.add(id);
    const { title, data } = res.notification.request.content;
    const route = routeForNotification(data, useAuthStore.getState().user?.role, title);
    if (route) navigationRef.navigate(route.name, route.params);
  };

  useEffect(() => {
    let sub: { remove: () => void } | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Notifications = require('expo-notifications');
      sub = Notifications.addNotificationResponseReceivedListener(go);
      void Notifications.getLastNotificationResponseAsync?.().then((res: Response | null) => {
        if (res) go(res);
      });
    } catch {
      // no native module (web / Expo Go without notifications) — nothing to route
    }
    return () => sub?.remove();
  }, []);

  // Cold start: the tap arrived before login/navigation were ready — replay once they are.
  useEffect(() => {
    if (status !== 'authed' || !pending.current) return;
    const res = pending.current;
    const t = setTimeout(() => {
      pending.current = null;
      go(res);
    }, 300);
    return () => clearTimeout(t);
  }, [status, role]);
}
