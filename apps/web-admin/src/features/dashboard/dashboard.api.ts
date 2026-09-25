import { useQuery } from '@tanstack/react-query';

import { http } from '@/services/http';
import { queryKeys } from '@/services/queryKeys';
import type { DashboardPeriod, DashboardStats } from '@/types/models';

interface Envelope<T> {
  data: T;
}

export const dashboardApi = {
  async stats(branchId: string | 'all', days: DashboardPeriod = 14): Promise<DashboardStats> {
    const { data } = await http.get<Envelope<DashboardStats>>('/dashboard/stats', {
      params: { branchId, days },
    });
    return data.data;
  },
};

export function useDashboardStats(
  branchId: string | 'all',
  days: DashboardPeriod = 14,
  options: { refetchIntervalMs?: number; enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.dashboard.stats(branchId, days),
    enabled: options.enabled ?? true,
    queryFn: () => dashboardApi.stats(branchId, days),
    // Keep the previous window on screen while a new period loads — no skeleton flash.
    placeholderData: (prev) => prev,
    refetchInterval: options.refetchIntervalMs,
    refetchIntervalInBackground: false,
  });
}
