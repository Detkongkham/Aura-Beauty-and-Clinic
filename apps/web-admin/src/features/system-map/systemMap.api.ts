import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/useAuth';
import { http } from '@/services/http';

export interface MachineCounts {
  /** enum value → live row count */
  states: Record<string, number>;
  total: number;
  /** rows created in the last 30 days */
  last30d: number;
}

export interface StatusCounts {
  generatedAt: string;
  /** Keyed by the status flow id without its `status-` prefix. */
  machines: Record<string, MachineCounts>;
}

/**
 * Live per-state counts for the status machines. System-wide numbers, so the endpoint is
 * SUPER_ADMIN only — everyone else just sees the static map.
 */
export function useStatusCounts() {
  const { role } = useAuth();
  return useQuery({
    queryKey: ['system-map', 'status-counts'],
    queryFn: async () => (await http.get<{ data: StatusCounts }>('/reports/status-counts')).data.data,
    enabled: role === 'SUPER_ADMIN',
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

/** `status-appointment` → `appointment`; null for module/overview flows. */
export function machineKey(flowId: string): string | null {
  return flowId.startsWith('status-') ? flowId.slice('status-'.length) : null;
}
