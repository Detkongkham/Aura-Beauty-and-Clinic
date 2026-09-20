import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getFxRates, type FxRates } from '@/lib/fx';

/**
 * Live exchange-rate feed. Polls on `refetchIntervalMinutes` (Settings ▸
 * Localization ▸ Exchange rates controls this) and also on window refocus, so
 * the rate shown is never more than one interval + the provider's own
 * publish cadence out of date. The query result already carries its own
 * `source`/`asOf`/`fetchedAt` so every consumer can show real freshness
 * instead of pretending a cached number is live.
 */
export function useFxRates(refetchIntervalMinutes = 30, options?: { enabled?: boolean }) {
  return useQuery<FxRates>({
    queryKey: ['fx-rates'],
    queryFn: getFxRates,
    staleTime: Math.max(1, refetchIntervalMinutes - 1) * 60_000,
    refetchInterval: refetchIntervalMinutes * 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
    enabled: options?.enabled ?? true,
  });
}

/** Imperative "refresh now" for a manual button — bypasses the stale-time gate. */
export function useRefreshFxRates() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['fx-rates'] });
}
