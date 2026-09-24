import type { UserPreferences } from '@abcp/shared-types';
import { useEffect, useRef } from 'react';

import { useAuthStore } from '@/features/auth/auth.store';
import i18n from '@/i18n';
import { THEME_COLORS, useUiStore, type ThemeColor } from '@/store/ui.store';

import { useMyPreferences, useUpdatePreferences } from './account.api';

type DevicePrefs = Required<Pick<UserPreferences, 'language' | 'colorMode' | 'webTheme' | 'tableDensity'>>;

function snapshot(): DevicePrefs {
  const ui = useUiStore.getState();
  return {
    language: i18n.resolvedLanguage === 'en' ? 'en' : 'lo',
    colorMode: ui.colorMode,
    webTheme: ui.themeColor,
    tableDensity: ui.tableDensity,
  };
}

const same = (a: Partial<DevicePrefs>, b: DevicePrefs) =>
  a.language === b.language &&
  a.colorMode === b.colorMode &&
  a.webTheme === b.webTheme &&
  a.tableDensity === b.tableDensity;

/**
 * Keeps language / light-dark / tone / table density in step across devices: on sign-in the
 * account's saved choices are applied to this browser (or, first time, this browser's choices are
 * saved to the account); afterwards every local change is written back, debounced.
 */
export function usePreferenceSync(enabled: boolean): void {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const { data } = useMyPreferences(enabled);
  const { mutate } = useUpdatePreferences();
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const appliedFor = useRef<string | null>(null);
  const lastSynced = useRef<Partial<DevicePrefs>>({});

  // Server → this device, once per signed-in user.
  useEffect(() => {
    if (!data || !userId || appliedFor.current === userId) return;
    appliedFor.current = userId;
    const p = data.preferences;
    if (!p.language && !p.colorMode && !p.webTheme && !p.tableDensity) {
      const local = snapshot();
      lastSynced.current = local;
      mutateRef.current(local);
      return;
    }
    const ui = useUiStore.getState();
    if (p.colorMode) ui.setColorMode(p.colorMode);
    if (p.webTheme && (THEME_COLORS as readonly string[]).includes(p.webTheme)) {
      ui.setThemeColor(p.webTheme as ThemeColor);
    }
    if (p.tableDensity) ui.setTableDensity(p.tableDensity);
    if (p.language && i18n.resolvedLanguage !== p.language) void i18n.changeLanguage(p.language);
    lastSynced.current = { ...snapshot(), ...(p.language ? { language: p.language } : {}) };
  }, [data, userId]);

  // This device → server, debounced; changes that merely echo the server are skipped.
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const push = () => {
      if (appliedFor.current == null) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const next = snapshot();
        if (same(lastSynced.current, next)) return;
        lastSynced.current = next;
        mutateRef.current(next);
      }, 800);
    };
    const unsub = useUiStore.subscribe((s, prev) => {
      if (
        s.themeColor !== prev.themeColor ||
        s.colorMode !== prev.colorMode ||
        s.tableDensity !== prev.tableDensity
      ) {
        push();
      }
    });
    i18n.on('languageChanged', push);
    return () => {
      unsub();
      i18n.off('languageChanged', push);
      clearTimeout(timer);
    };
  }, [enabled]);
}
