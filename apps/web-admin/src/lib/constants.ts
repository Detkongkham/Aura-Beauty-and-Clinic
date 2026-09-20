/** App-wide constants (design.md §9). */
export const APP_TIMEZONE = 'Asia/Vientiane';
export const DEFAULT_CURRENCY = 'LAK' as const;

export const DATE_FORMAT = 'DD/MM/YYYY';
export const TIME_FORMAT = 'HH:mm';
export const DATETIME_FORMAT = 'DD/MM/YYYY HH:mm';

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

/** localStorage keys — namespaced so one artifact/site can't collide. */
export const STORAGE_KEYS = {
  auth: 'aura.auth',
  ui: 'aura.ui',
  locale: 'aura.lng',
  fxRates: 'aura.fx-rates',
  moduleConfig: 'aura.module-config',
} as const;
