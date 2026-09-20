import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { http } from '@/services/http';
import { queryKeys } from '@/services/queryKeys';
import type { Paginated, StaffProfile, TimeOffRequest } from '@/types/models';

interface Envelope<T> {
  data: T;
}

export interface StaffListParams {
  q?: string;
  branchId?: string;
  page: number;
  pageSize: number;
}

export type StaffUpdate = Partial<
  Pick<
    StaffProfile,
    'jobTitle' | 'branchId' | 'isActive' | 'serviceIds' | 'workingHours' | 'commissionRate'
  >
>;

export const staffApi = {
  async list(params: StaffListParams): Promise<Paginated<StaffProfile>> {
    const { data } = await http.get<Envelope<Paginated<StaffProfile>>>('/staff', { params });
    return data.data;
  },
  async get(id: string): Promise<StaffProfile> {
    const { data } = await http.get<Envelope<StaffProfile>>(`/staff/${id}`);
    return data.data;
  },
  async update(id: string, patch: StaffUpdate): Promise<StaffProfile> {
    const { data } = await http.patch<Envelope<StaffProfile>>(`/staff/${id}`, patch);
    return data.data;
  },
  async timeOff(): Promise<TimeOffRequest[]> {
    const { data } = await http.get<Envelope<{ items: TimeOffRequest[] }>>('/staff/time-off');
    return data.data.items;
  },
  async reviewTimeOff(id: string, status: 'APPROVED' | 'REJECTED'): Promise<TimeOffRequest> {
    const { data } = await http.patch<Envelope<TimeOffRequest>>(`/staff/time-off/${id}`, { status });
    return data.data;
  },
};

export function useStaffList(params: StaffListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.staff.list(params),
    queryFn: () => staffApi.list(params),
    enabled: options?.enabled ?? true,
  });
}

export function useStaffMember(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.staff.detail(id ?? ''),
    queryFn: () => staffApi.get(id!),
    enabled: Boolean(id),
  });
}

export function useUpdateStaff(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: StaffUpdate) => staffApi.update(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff'] });
    },
  });
}

export function useTimeOff() {
  return useQuery({ queryKey: ['staff', 'time-off'], queryFn: staffApi.timeOff });
}

export function useReviewTimeOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
      staffApi.reviewTimeOff(id, status),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['staff', 'time-off'] }),
  });
}
