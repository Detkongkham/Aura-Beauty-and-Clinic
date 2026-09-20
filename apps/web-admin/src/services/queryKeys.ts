/**
 * Central React Query key factory — every hook derives keys from here so
 * invalidation stays consistent across feature modules (steps 4+).
 */
export const queryKeys = {
  auth: {
    me: () => ['auth', 'me'] as const,
  },
  dashboard: {
    stats: (branchId: string | 'all', days = 14) => ['dashboard', 'stats', branchId, days] as const,
  },
  services: {
    list: (params?: unknown) => ['services', 'list', params ?? {}] as const,
    detail: (id: string) => ['services', 'detail', id] as const,
  },
  staff: {
    list: (params?: unknown) => ['staff', 'list', params ?? {}] as const,
    detail: (id: string) => ['staff', 'detail', id] as const,
  },
  appointments: {
    list: (params?: unknown) => ['appointments', 'list', params ?? {}] as const,
    summary: (params?: unknown) => ['appointments', 'summary', params ?? {}] as const,
    detail: (id: string) => ['appointments', 'detail', id] as const,
    calendar: (params?: unknown) =>
      ['appointments', 'calendar', params ?? {}] as const,
  },
  customers: {
    list: (params?: unknown) => ['customers', 'list', params ?? {}] as const,
    detail: (id: string) => ['customers', 'detail', id] as const,
  },
  branches: {
    list: () => ['branches', 'list'] as const,
  },
} as const;
