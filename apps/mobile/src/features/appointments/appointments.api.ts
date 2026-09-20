import type {
  AppointmentDetailView,
  AppointmentListItem,
  CancelAppointmentInput,
  CreateReviewInput,
  Paginated,
  QueueCheckInInput,
  QueueCheckInResult,
} from '@abcp/shared-types';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

export type AppointmentScope = 'upcoming' | 'history';

export function useMyAppointments(scope: AppointmentScope) {
  return useInfiniteQuery({
    queryKey: qk.myAppointments({ scope }),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await http.get<{ data: Paginated<AppointmentListItem> }>(
        '/booking/appointments/me',
        { params: { scope, page: pageParam, pageSize: 20 } },
      );
      return data.data;
    },
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
}

export function useAppointment(id: string, enabled = true) {
  return useQuery({
    queryKey: qk.appointment(id),
    enabled: enabled && !!id,
    queryFn: async () => {
      const { data } = await http.get<{ data: AppointmentDetailView }>(
        `/booking/appointments/${id}`,
      );
      return data.data;
    },
  });
}

function useInvalidateAppointments(id: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['appointments', 'me'] });
    void qc.invalidateQueries({ queryKey: qk.appointment(id) });
  };
}

export function useCancelAppointment(id: string) {
  const invalidate = useInvalidateAppointments(id);
  return useMutation({
    mutationFn: async (input: CancelAppointmentInput) => {
      const { data } = await http.patch<{ data: AppointmentListItem }>(
        `/booking/appointments/${id}/cancel`,
        input,
      );
      return data.data;
    },
    onSuccess: invalidate,
  });
}

export function useReviewAppointment(id: string) {
  const invalidate = useInvalidateAppointments(id);
  return useMutation({
    mutationFn: async (input: CreateReviewInput) => {
      const { data } = await http.post<{ data: { rating: number; comment: string | null } }>(
        `/booking/appointments/${id}/review`,
        input,
      );
      return data.data;
    },
    onSuccess: invalidate,
  });
}

/** QR Check-in ໜ້າຮ້ານ (Module 10) — ສົ່ງ branchId ທີ່ສະແກນໄດ້ ເພື່ອຢືນຢັນວ່າມາຮອດສາຂາແທ້. */
export function useQueueCheckIn(id: string) {
  const invalidate = useInvalidateAppointments(id);
  return useMutation({
    mutationFn: async (input: Omit<QueueCheckInInput, 'appointmentId'>) => {
      const { data } = await http.post<{ data: QueueCheckInResult }>('/queue/check-in', {
        appointmentId: id,
        ...input,
      });
      return data.data;
    },
    onSuccess: invalidate,
  });
}
