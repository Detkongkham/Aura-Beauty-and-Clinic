import { useEffect, useRef, useState } from 'react';

import { usePrefersReducedMotion } from './useMediaQuery';

/**
 * Ramps a displayed integer from its previous value to `value` with a
 * requestAnimationFrame ease-out. Returns `value` verbatim (no animation) when
 * the user prefers reduced motion. Non-finite inputs pass straight through.
 */
export function useCountUp(value: number, opts: { durationMs?: number } = {}): number {
  const { durationMs = 450 } = opts;
  const reduce = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reduce || !Number.isFinite(value) || fromRef.current === value) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    const tick = (nowTs: number) => {
      const t = Math.min(1, (nowTs - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
    };
  }, [value, durationMs, reduce]);

  return reduce ? value : display;
}
