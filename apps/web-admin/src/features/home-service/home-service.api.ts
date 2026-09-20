import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HomeServiceJobStatus, HomeServiceTripView } from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

export interface HomeServiceTripFilters {
  branchId?: string;
  status?: HomeServiceJobStatus;
}

function clean(f: HomeServiceTripFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.branchId) out.branchId = f.branchId;
  if (f.status) out.status = f.status;
  return out;
}

export const HOME_SERVICE_TRIPS_KEY = ['home-service-trips'];
const KEY = HOME_SERVICE_TRIPS_KEY;

export function useHomeServiceTrips(filters: HomeServiceTripFilters) {
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: async () => {
      const { data } = await http.get<Envelope<HomeServiceTripView[]>>('/home-service/admin/trips', {
        params: clean(filters),
      });
      return data.data;
    },
    placeholderData: (prev) => prev,
    refetchInterval: 15_000,
  });
}

export function useAssignTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      appointmentId,
      staffProfileId,
    }: {
      appointmentId: string;
      staffProfileId: string;
    }) => {
      const { data } = await http.patch<Envelope<HomeServiceTripView>>(
        `/home-service/admin/trips/${appointmentId}/assign`,
        { staffProfileId },
      );
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
