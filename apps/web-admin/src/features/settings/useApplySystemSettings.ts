import { useEffect } from 'react';

import { setActiveDateFormat, setActiveWeekStart } from '@/lib/format';

import { useSettings } from './settings.api';

/**
 * Repoints the module-level date/week formatting used by `formatDate` /
 * `formatDateTime` / `startOfWeekApp` (see `lib/format.ts`) at whatever
 * Settings ▸ Localization currently holds. Mounted once in `AppShell` so it
 * applies app-wide regardless of which page the admin is on — without this,
 * "Date format" and "Week starts on" would sit in Settings looking editable
 * but never actually change anything (the trap `displayCurrency` was in
 * before CurrencyText learned to convert).
 */
export function useApplySystemSettings(): void {
  const { data } = useSettings();

  useEffect(() => {
    if (!data) return;
    setActiveDateFormat(data.dateFormat);
    setActiveWeekStart(data.weekStart);
  }, [data]);
}
