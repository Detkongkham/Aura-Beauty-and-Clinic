import type { UserPreferences } from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { qk } from '../../services/queryKeys';
import { useAuthStore } from '../../store/auth.store';
import { useUiStore } from '../../store/ui.store';
import { THEME_TONES, type ThemeTone } from '../../theme/palette';
import { apiGetPreferences, apiUpdatePreferences } from './auth.api';

/** Account-level preferences (language, light/dark, tone, notification choices) — shared with web-admin. */
export function useMyPreferences(enabled = true) {
  return useQuery({
    queryKey: qk.preferences,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: apiGetPreferences,
  });
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UserPreferences) => apiUpdatePreferences(patch),
    onSuccess: (data) => qc.setQueryData(qk.preferences, data),
  });
}

type DevicePrefs = Required<Pick<UserPreferences, 'colorMode' | 'mobileTone'>> & Pick<UserPreferences, 'language'>;

function snapshot(): DevicePrefs {
  const ui = useUiStore.getState();
  return { colorMode: ui.colorMode, mobileTone: ui.themeTone, ...(ui.language ? { language: ui.language } : {}) };
}

const same = (a: Partial<DevicePrefs>, b: DevicePrefs) =>
  a.colorMode === b.colorMode && a.mobileTone === b.mobileTone && a.language === b.language;

/**
 * Mounted once while signed in: applies the account's saved language / light-dark / tone to this
 * phone on sign-in (or saves this phone's choices the first time), then writes changes back.
 */
export function usePreferenceSync(): void {
  const userId = useAuthStore((s) => (s.status === 'authed' ? s.user?.id ?? null : null));
  const { data } = useMyPreferences(Boolean(userId));
  const { mutate } = useUpdatePreferences();
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const appliedFor = useRef<string | null>(null);
  const lastSynced = useRef<Partial<DevicePrefs>>({});

  useEffect(() => {
    if (!userId) appliedFor.current = null;
  }, [userId]);

  useEffect(() => {
    if (!data || !userId || appliedFor.current === userId) return;
    appliedFor.current = userId;
    const p = data.preferences;
    if (!p.language && !p.colorMode && !p.mobileTone) {
      lastSynced.current = snapshot();
      mutateRef.current(lastSynced.current);
      return;
    }
    const ui = useUiStore.getState();
    if (p.language && p.language !== ui.language) ui.setLanguagePref(p.language);
    if (p.colorMode && p.colorMode !== ui.colorMode) ui.setColorMode(p.colorMode);
    if (p.mobileTone && (THEME_TONES as readonly string[]).includes(p.mobileTone) && p.mobileTone !== ui.themeTone) {
      ui.setThemeTone(p.mobileTone as ThemeTone);
    }
    lastSynced.current = snapshot();
  }, [data, userId]);

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useUiStore.subscribe((s, prev) => {
      if (s.language === prev.language && s.colorMode === prev.colorMode && s.themeTone === prev.themeTone) return;
      if (appliedFor.current !== userId) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const next = snapshot();
        if (same(lastSynced.current, next)) return;
        lastSynced.current = next;
        mutateRef.current(next);
      }, 800);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [userId]);
}
