import { useEffect, useState } from 'react';

/** The clinic's wall clock, whatever zone the device is in. */
export const CLINIC_TZ = 'Asia/Vientiane';

/** Re-renders every `ms` while `active` — drives countdowns and the clock. */
export function useNow(ms = 1000, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}

/** 90_500 → "1:31" (rounds up so a countdown never shows 0:00 early). */
export function formatClock(totalMs: number): string {
  const s = Math.max(0, Math.ceil(totalMs / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function greetingKey(now: number): 'morning' | 'afternoon' | 'evening' {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: CLINIC_TZ }).format(now));
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}
