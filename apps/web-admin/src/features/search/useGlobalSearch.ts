import { useQuery } from '@tanstack/react-query';

import { appointmentsApi } from '@/features/appointments/appointments.api';
import { customersApi } from '@/features/customers/customers.api';
import { servicesApi } from '@/features/services/services.api';

export interface SearchResults {
  customers: { id: string; label: string; sub: string }[];
  appointments: { id: string; label: string; sub: string }[];
  services: { id: string; label: string; sub: string }[];
}

/** Cross-entity search used by the ⌘K palette and the /search results page. */
export function useGlobalSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['global-search', q],
    enabled: q.length >= 2,
    staleTime: 10_000,
    queryFn: async (): Promise<SearchResults> => {
      const [customers, appointments, services] = await Promise.all([
        customersApi.list({ q, page: 1, pageSize: 5 }),
        appointmentsApi.list({ q, page: 1, pageSize: 5 }),
        servicesApi.list({ q, page: 1, pageSize: 5 }),
      ]);
      return {
        customers: customers.items.map((c) => ({ id: c.id, label: c.name, sub: c.phone })),
        appointments: appointments.items.map((a) => ({
          id: a.id,
          label: `${a.code} · ${a.customerName}`,
          sub: a.serviceName,
        })),
        services: services.items.map((s) => ({ id: s.id, label: s.name, sub: s.categoryName })),
      };
    },
  });
}
