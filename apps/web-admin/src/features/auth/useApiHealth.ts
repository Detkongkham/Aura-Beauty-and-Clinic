import { useEffect, useRef, useState } from 'react';

import { env } from '@/config/env';

export type ApiHealthState = 'checking' | 'operational' | 'degraded' | 'down';

export interface HealthSample {
  at: number;
  /** Round-trip in ms; null when the request failed. */
  ms: number | null;
}

export interface ApiHealth {
  state: ApiHealthState;
  samples: HealthSample[];
  /** Last successful round-trip. */
  latency: number | null;
  /** Share of samples that succeeded this visit, 0–100. */
  successRate: number | null;
  checkedAt: number | null;
}

const MAX_SAMPLES = 20;
const INTERVAL_MS = 8_000;
const SLOW_MS = 800;
/** The backend's liveness probe sits at the origin root, outside `/api/v1`. */
export const HEALTH_URL = new URL('/health', env.apiBaseUrl).toString();

/**
 * Pings the unauthenticated liveness probe while the sign-in screens are open,
 * so staff can tell "the server is down" apart from "my password is wrong".
 * Polls only while the tab is visible and never exposes anything beyond up/down + timing.
 */
export function useApiHealth(): ApiHealth {
  const [samples, setSamples] = useState<HealthSample[]>([]);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const probe = async () => {
      const started = performance.now();
      let ms: number | null = null;
      try {
        const ctrl = new AbortController();
        const kill = setTimeout(() => ctrl.abort(), 5_000);
        const res = await fetch(HEALTH_URL, { cache: 'no-store', signal: ctrl.signal });
        clearTimeout(kill);
        if (res.ok) ms = Math.max(1, Math.round(performance.now() - started));
      } catch {
        ms = null;
      }
      if (!alive.current) return;
      setSamples((prev) => [...prev, { at: Date.now(), ms }].slice(-MAX_SAMPLES));
    };

    const loop = async () => {
      if (document.visibilityState === 'visible') await probe();
      if (alive.current) timer = setTimeout(loop, INTERVAL_MS);
    };
    void loop();

    return () => {
      alive.current = false;
      clearTimeout(timer);
    };
  }, []);

  const last = samples.at(-1);
  const lastOk = [...samples].reverse().find((s) => s.ms !== null);
  const okCount = samples.filter((s) => s.ms !== null).length;
  const state: ApiHealthState = !last
    ? 'checking'
    : last.ms === null
      ? 'down'
      : last.ms > SLOW_MS
        ? 'degraded'
        : 'operational';

  return {
    state,
    samples,
    latency: lastOk?.ms ?? null,
    successRate: samples.length ? Math.round((okCount / samples.length) * 100) : null,
    checkedAt: last?.at ?? null,
  };
}
