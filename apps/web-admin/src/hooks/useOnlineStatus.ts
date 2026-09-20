import { useEffect, useState } from 'react';

/**
 * Browser connectivity, live. Clinic front desks run on patchy wi-fi and the
 * console is entirely network-backed — without this, a dropped connection only
 * shows up as mutations that quietly fail (or as numbers that stop moving).
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return online;
}
