import type {
  AppointmentListItem,
  AvailabilityResponse,
  BookingPolicyView,
  CustomerCreateAppointmentInput,
  RescheduleAppointmentInput,
} from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

export type AvailabilityParams = {
  branchId: string;
  serviceId: string;
  date: string;
  staffProfileId?: string;
};

export function useAvailability(params: AvailabilityParams, enabled: boolean) {
  return useQuery({
    queryKey: qk.availability(params),
    enabled,
    queryFn: async () => {
      const { data } = await http.get<{ data: AvailabilityResponse }>('/booking/availability', {
        params,
      });
      return data.data;
    },
  });
}

/** ນະໂຍບາຍຍົກເລີກ/ເລື່ອນນັດ (Web Admin ▸ Settings) — cache 30 ນາທີ. */
export function useBookingPolicy() {
  return useQuery({
    queryKey: qk.bookingPolicy,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await http.get<{ data: BookingPolicyView }>('/booking/policy');
      return data.data;
    },
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CustomerCreateAppointmentInput) => {
      const { data } = await http.post<{ data: { id: string } }>(
        '/booking/appointments/me',
        input,
      );
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['appointments', 'me'] });
    },
  });
}

export function useRescheduleAppointment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RescheduleAppointmentInput) => {
      const { data } = await http.patch<{ data: AppointmentListItem }>(
        `/booking/appointments/${id}/reschedule`,
        input,
      );
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['appointments', 'me'] });
      void qc.invalidateQueries({ queryKey: qk.appointment(id) });
    },
  });
}
