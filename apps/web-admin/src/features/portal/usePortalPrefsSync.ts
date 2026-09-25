import { useEffect, useRef } from 'react';

import { useMyPreferences, useUpdatePreferences } from '@/features/account/account.api';
import { useAuthStore } from '@/features/auth/auth.store';

import {
  mergeVisits,
  readVisits,
  writePins,
  writeView,
  writeVisits,
  type PortalView,
  type Visit,
} from './portalModel';

/**
 * Keeps the launcher's pins (in order), layout and recent modules on the account
 * (`preferences.portal`) so they follow the user to any browser. On first load the
 * server copy wins for pins/view (or this browser's copy is uploaded if the account
 * has none); recent visits are merged both ways. Later local changes are pushed,
 * debounced. localStorage stays the offline/instant cache.
 */
export function usePortalPrefsSync({
  pins,
  view,
  setPins,
  setView,
  setVisits,
}: {
  pins: string[];
  view: PortalView;
  setPins: (p: string[]) => void;
  setView: (v: PortalView) => void;
  setVisits: (v: Visit[]) => void;
}) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { data } = useMyPreferences();
  const { mutate } = useUpdatePreferences();
  const hydratedFor = useRef<string | null>(null);
  const lastPushed = useRef('');

  const push = (next: { pins: string[]; view: PortalView; recent: Visit[] }) => {
    const key = JSON.stringify(next);
    if (key === lastPushed.current) return;
    lastPushed.current = key;
    mutate({ portal: next });
  };

  // Server → this browser, once per signed-in user.
  useEffect(() => {
    if (!data || !userId || hydratedFor.current === userId) return;
    hydratedFor.current = userId;
    const server = data.preferences.portal ?? {};
    const recent = mergeVisits(readVisits(), server.recent ?? []);
    writeVisits(recent);
    setVisits(recent);
    const nextPins = server.pins ?? pins;
    const nextView = server.view ?? view;
    if (server.pins) {
      writePins(server.pins);
      setPins(server.pins);
    }
    if (server.view) {
      writeView(server.view);
      setView(server.view);
    }
    push({ pins: nextPins, view: nextView, recent: recent.slice(0, 20) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, userId]);

  // This browser → server, debounced.
  useEffect(() => {
    if (hydratedFor.current !== userId || !userId) return;
    const id = window.setTimeout(
      () => push({ pins, view, recent: readVisits().slice(0, 20) }),
      700,
    );
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, view, userId]);
}
