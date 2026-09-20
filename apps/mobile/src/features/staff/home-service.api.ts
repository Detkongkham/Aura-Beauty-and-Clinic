import type {
  HomeServiceTripView,
  LocationPingInput,
  TripStatusUpdateInput,
} from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

/** ໂມດູນ 29 — ຊ່າງເປີດ/ປິດຮັບວຽກ Home Service. */
export function useHomeServiceAvailability() {
  return useQuery({
    queryKey: qk.staffHomeServiceAvailability,
    queryFn: async () => {
      const { data } = await http.get<{ data: { isAvailable: boolean } }>(
        '/home-service/staff/availability',
      );
      return data.data;
    },
  });
}

export function useSetHomeServiceAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (isAvailable: boolean) => {
      const { data } = await http.patch<{ data: { isAvailable: boolean } }>(
        '/home-service/staff/availability',
        { isAvailable },
      );
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.staffHomeServiceAvailability });
    },
  });
}

/** REST fallback ping (socket.io ເປັນທາງຫຼັກ, ໃຊ້ບ່ອນ socket ຫຼຸດການເຊື່ອມຕໍ່). */
export function usePostLocationPing() {
  return useMutation({
    mutationFn: async (input: LocationPingInput) => {
      const { data } = await http.post<{ data: unknown }>('/home-service/staff/location', input);
      return data.data;
    },
  });
}

/** ລາຍລະອຽດ trip ໜຶ່ງ (ລູກຄ້າເຈົ້າຂອງ / ຊ່າງທີ່ຖືກຈັບຄູ່ / admin ເທົ່ານັ້ນ). */
export function useHomeServiceTrip(appointmentId: string) {
  return useQuery({
    queryKey: qk.homeServiceTrip(appointmentId),
    queryFn: async () => {
      const { data } = await http.get<{ data: HomeServiceTripView }>(
        `/home-service/${appointmentId}`,
      );
      return data.data;
    },
    enabled: Boolean(appointmentId),
  });
}

export function useUpdateTripStatus(appointmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TripStatusUpdateInput) => {
      const { data } = await http.patch<{ data: { status: string } }>(
        `/home-service/staff/trips/${appointmentId}/status`,
        input,
      );
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.homeServiceTrip(appointmentId) });
      void qc.invalidateQueries({ queryKey: ['staff-portal', 'schedule'] });
    },
  });
}
