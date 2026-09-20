import { useEffect, useRef, useState } from 'react';

import type { QueueTicket } from '@/types/models';

let ctx: AudioContext | null = null;

/** Two-tone "ding-dong" via Web Audio — no asset to load, works offline. */
export function playChime() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    const now = ctx.currentTime;
    [
      { f: 880, at: 0 },
      { f: 660, at: 0.22 },
    ].forEach(({ f, at }) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.25, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.6);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.65);
    });
  } catch {
    /* audio blocked until a user gesture — best effort */
  }
}

/**
 * Watches the CALLED lane; whenever a ticket is newly called or re-called
 * (callCount grows) it plays the chime (if enabled) and returns that ticket id
 * so the UI can spotlight it. The first snapshot is taken silently.
 */
export function useQueueChime(called: QueueTicket[], enabled: boolean): string | null {
  const seen = useRef<Map<string, number> | null>(null);
  const [latest, setLatest] = useState<string | null>(null);

  useEffect(() => {
    const next = new Map(called.map((tk) => [tk.id, tk.callCount ?? 1]));
    const prev = seen.current;
    seen.current = next;
    if (!prev) return;
    const fresh = called.find((tk) => (prev.get(tk.id) ?? 0) < (tk.callCount ?? 1));
    if (!fresh) return;
    setLatest(fresh.id);
    if (enabled) playChime();
    const id = setTimeout(() => setLatest(null), 8_000);
    return () => clearTimeout(id);
  }, [called, enabled]);

  return latest;
}
