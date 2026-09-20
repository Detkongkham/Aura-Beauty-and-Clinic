import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { STORAGE_KEYS } from '@/lib/constants';

/** Brand tone presets — all cool-family, all share the 4-step ramp (design.md §1.1). */
export type ThemeColor = 'azure' | 'teal' | 'indigo' | 'cobalt';
export const THEME_COLORS: readonly ThemeColor[] = ['azure', 'teal', 'indigo', 'cobalt'];

/** Light/dark preference; 'system' follows the OS via prefers-color-scheme. */
export type ColorMode = 'light' | 'dark' | 'system';
export const COLOR_MODES: readonly ColorMode[] = ['light', 'dark', 'system'];

interface UiState {
  /** Desktop sidebar collapsed to the icon rail (design.md §8 layout chrome). */
  sidebarCollapsed: boolean;
  /** Currently scoped branch; 'all' = across branches (SUPER_ADMIN only). */
  activeBranchId: string | 'all';
  /** Data-table row density toggle (design.md §9): 44px vs 36px rows. */
  tableDensity: 'standard' | 'compact';
  /** Per-device brand tone; drives [data-theme] on <html> (Settings ▸ Appearance). */
  themeColor: ThemeColor;
  /** Per-device light/dark preference; drives the `.dark` class on <html>. */
  colorMode: ColorMode;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  setActiveBranch: (id: string | 'all') => void;
  setTableDensity: (value: 'standard' | 'compact') => void;
  setThemeColor: (value: ThemeColor) => void;
  setColorMode: (value: ColorMode) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      activeBranchId: 'all',
      tableDensity: 'standard',
      themeColor: 'azure',
      colorMode: 'system',
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      setActiveBranch: (id) => set({ activeBranchId: id }),
      setTableDensity: (value) => set({ tableDensity: value }),
      setThemeColor: (value) => set({ themeColor: value }),
      setColorMode: (value) => set({ colorMode: value }),
    }),
    { name: STORAGE_KEYS.ui },
  ),
);

/** Reflect the chosen tone onto <html data-theme> — CSS in index.css does the rest. */
function applyThemeColor(color: ThemeColor): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = color;
}

const prefersDarkQuery =
  typeof window === 'undefined' ? null : window.matchMedia('(prefers-color-scheme: dark)');

/** Resolve 'system' against the OS preference, then flip <html class="dark"> — CSS does the rest. */
function applyColorMode(mode: ColorMode): void {
  if (typeof document === 'undefined') return;
  const isDark = mode === 'dark' || (mode === 'system' && (prefersDarkQuery?.matches ?? false));
  document.documentElement.classList.toggle('dark', isDark);
}

applyThemeColor(useUiStore.getState().themeColor);
applyColorMode(useUiStore.getState().colorMode);
useUiStore.subscribe((state) => applyThemeColor(state.themeColor));
useUiStore.subscribe((state) => applyColorMode(state.colorMode));

// Live-follow the OS preference while colorMode === 'system'.
prefersDarkQuery?.addEventListener('change', () => {
  if (useUiStore.getState().colorMode === 'system') applyColorMode('system');
});
