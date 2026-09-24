import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/ui/sonner';
import { useMyPreferences } from '@/features/account/account.api';
import { emitLogout } from '@/services/http';

import { useAuth } from './useAuth';

/** Shared across tabs, so activity in one tab keeps the others signed in too. */
const ACTIVITY_KEY = 'aura.lastActivity';
const WARN_BEFORE_MS = 60_000;
const TICK_MS = 15_000;

function readShared(): number {
  try {
    return Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeShared(at: number): void {
  try {
    localStorage.setItem(ACTIVITY_KEY, String(at));
  } catch {
    /* private mode — per-tab timer still works */
  }
}

/**
 * Settings ▸ sessionTimeoutMinutes on the client: signs out after that long with no keyboard /
 * pointer activity (any tab), warning a minute before. Background polling keeps the *server*
 * session warm, so without this an unattended console would stay open indefinitely.
 */
export function useIdleLogout(enabled: boolean): void {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { data } = useMyPreferences(enabled);
  const minutes = data?.policy.sessionTimeoutMinutes ?? 0;

  useEffect(() => {
    if (!enabled || !(minutes > 0)) return;
    const limit = minutes * 60_000;
    let last = Date.now();
    let warned = false;
    writeShared(last);

    const mark = () => {
      const now = Date.now();
      if (now - last < 5_000) return;
      last = now;
      writeShared(now);
      if (warned) {
        warned = false;
        toast.dismiss('idle-warning');
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === ACTIVITY_KEY && e.newValue) last = Math.max(last, Number(e.newValue) || 0);
    };
    const events = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((ev) => window.addEventListener(ev, mark, { passive: true }));
    window.addEventListener('storage', onStorage);

    const timer = setInterval(() => {
      const idle = Date.now() - Math.max(last, readShared());
      if (idle >= limit) {
        clearInterval(timer);
        toast.dismiss('idle-warning');
        logout();
        emitLogout('idle');
      } else if (idle >= limit - WARN_BEFORE_MS && !warned) {
        warned = true;
        toast.warning(t('auth.idleWarning'), { id: 'idle-warning', duration: WARN_BEFORE_MS });
      }
    }, TICK_MS);

    return () => {
      clearInterval(timer);
      events.forEach((ev) => window.removeEventListener(ev, mark));
      window.removeEventListener('storage', onStorage);
    };
  }, [enabled, minutes, logout, t]);
}
