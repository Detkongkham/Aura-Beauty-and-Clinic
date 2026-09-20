import type {
  AttendanceCheckInput,
  AttendanceRecordView,
  AttendanceStateView,
  CommissionSummaryView,
  StaffAppointmentStatusInput,
  StaffScheduleItem,
  TreatmentPhotoCreateInput,
  TreatmentPhotoView,
  TreatmentRecordUpsertInput,
  TreatmentRecordView,
} from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';

/** 1. ຕາຕະລາງງານປະຈຳວັນ. */
export function useStaffSchedule(date: string) {
  return useQuery({
    queryKey: qk.staffSchedule(date),
    queryFn: async () => {
      const { data } = await http.get<{ data: { date: string; items: StaffScheduleItem[] } }>(
        '/staff-portal/schedule',
        { params: { date } },
      );
      return data.data;
    },
  });
}

/** 1b. ຄິວດຽວ (ໜ້າລາຍລະອຽດ). */
export function useStaffAppointment(id: string) {
  return useQuery({
    queryKey: ['staff-portal', 'appointment', id] as const,
    queryFn: async () => {
      const { data } = await http.get<{ data: StaffScheduleItem }>(
        `/staff-portal/appointments/${id}`,
      );
      return data.data;
    },
  });
}

/** 2. ຊ່າງອັບເດດສະຖານະຄິວ (IN_PROGRESS / COMPLETED). */
export function useUpdateApptStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string } & StaffAppointmentStatusInput) => {
      const { id, ...body } = vars;
      const { data } = await http.patch<{ data: StaffScheduleItem }>(
        `/staff-portal/appointments/${id}/status`,
        body,
      );
      return data.data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff-portal'] });
    },
  });
}

/** 3. GPS Attendance — state + check-in/out. */
export function useAttendanceState(month?: string) {
  return useQuery({
    queryKey: qk.staffAttendance(month),
    queryFn: async () => {
      const { data } = await http.get<{ data: AttendanceStateView }>('/staff-portal/attendance', {
        params: month ? { month } : undefined,
      });
      return data.data;
    },
  });
}

export function useCheckInOut(month?: string) {
  const qc = useQueryClient();
  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: ['staff-portal', 'attendance'] });
  };
  const checkIn = useMutation({
    mutationFn: async (input: AttendanceCheckInput) => {
      const { data } = await http.post<{ data: AttendanceRecordView }>(
        '/staff-portal/attendance/check-in',
        input,
      );
      return data.data;
    },
    onSuccess: invalidate,
  });
  const checkOut = useMutation({
    mutationFn: async (input: AttendanceCheckInput) => {
      const { data } = await http.post<{ data: AttendanceRecordView }>(
        '/staff-portal/attendance/check-out',
        input,
      );
      return data.data;
    },
    onSuccess: invalidate,
  });
  return { checkIn, checkOut, month };
}

/** 5. ສະຫຼຸບຄ່າຄອມມິດຊັນ. */
export function useCommissionSummary(month: string) {
  return useQuery({
    queryKey: qk.staffCommission(month),
    queryFn: async () => {
      const { data } = await http.get<{ data: CommissionSummaryView }>(
        '/staff-portal/commission',
        { params: { month } },
      );
      return data.data;
    },
  });
}

/** 4. Treatment record + ຮູບ. */
export function useTreatmentRecord(appointmentId: string) {
  return useQuery({
    queryKey: qk.staffTreatment(appointmentId),
    queryFn: async () => {
      const { data } = await http.get<{ data: TreatmentRecordView | null }>(
        `/staff-portal/appointments/${appointmentId}/treatment`,
      );
      return data.data;
    },
  });
}

export function useTreatmentMutations(appointmentId: string) {
  const qc = useQueryClient();
  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: qk.staffTreatment(appointmentId) });
    void qc.invalidateQueries({ queryKey: ['staff-portal', 'schedule'] });
  };

  const saveNotes = useMutation({
    mutationFn: async (input: TreatmentRecordUpsertInput) => {
      const { data } = await http.put<{ data: TreatmentRecordView }>(
        `/staff-portal/appointments/${appointmentId}/treatment`,
        input,
      );
      return data.data;
    },
    onSuccess: invalidate,
  });

  const addPhoto = useMutation({
    mutationFn: async (input: TreatmentPhotoCreateInput) => {
      const { data } = await http.post<{ data: TreatmentPhotoView }>(
        `/staff-portal/appointments/${appointmentId}/treatment/photos`,
        input,
      );
      return data.data;
    },
    onSuccess: invalidate,
  });

  return { saveNotes, addPhoto };
}
