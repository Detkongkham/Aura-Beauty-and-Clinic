import type {
  AdminAppointmentSummary,
  AppointmentFlag,
  AppointmentPaymentState,
  AppointmentSource,
  AppointmentSortField,
  AppointmentStatus,
  BulkAppointmentStatusResult,
  ServiceDeliveryType,
} from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { http } from '@/services/http';
import { queryKeys } from '@/services/queryKeys';
import type { AppointmentDetail, AppointmentListItem, Paginated } from '@/types/models';

interface Envelope<T> {
  data: T;
}

/** Filters shared by the list and the summary — one object, one query key. */
export interface AppointmentFilterParams {
  q?: string;
  status?: AppointmentStatus;
  branchId?: string;
  staffId?: string;
  serviceId?: string;
  customerId?: string;
  deliveryType?: ServiceDeliveryType;
  source?: AppointmentSource;
  payment?: AppointmentPaymentState;
  flag?: AppointmentFlag;
  from?: string;
  to?: string;
}

export interface AppointmentListParams extends AppointmentFilterParams {
  page: number;
  pageSize: number;
  sort?: AppointmentSortField;
  order?: 'asc' | 'desc';
}

export const appointmentsApi = {
  async list(params: AppointmentListParams): Promise<Paginated<AppointmentListItem>> {
    const { data } = await http.get<Envelope<Paginated<AppointmentListItem>>>('/appointments', {
      params,
    });
    return data.data;
  },
  async summary(params: AppointmentFilterParams): Promise<AdminAppointmentSummary> {
    const { data } = await http.get<Envelope<AdminAppointmentSummary>>('/appointments/summary', {
      params,
    });
    return data.data;
  },
  async get(id: string): Promise<AppointmentDetail> {
    const { data } = await http.get<Envelope<AppointmentDetail>>(`/appointments/${id}`);
    return data.data;
  },
  async calendar(params: {
    from: string;
    to: string;
    branchId?: string;
  }): Promise<AppointmentListItem[]> {
    const { data } = await http.get<Envelope<{ items: AppointmentListItem[] }>>(
      '/appointments/calendar',
      { params },
    );
    return data.data.items;
  },
  async setStatus(
    id: string,
    status: AppointmentStatus,
    staffNotes?: string,
    waiveFee?: boolean,
  ): Promise<AppointmentListItem> {
    const { data } = await http.patch<Envelope<AppointmentListItem>>(
      `/appointments/${id}/status`,
      { status, ...(staffNotes !== undefined ? { staffNotes } : {}), ...(waiveFee ? { waiveFee } : {}) },
    );
    return data.data;
  },
  async bulkStatus(
    ids: string[],
    status: AppointmentStatus,
  ): Promise<BulkAppointmentStatusResult> {
    const { data } = await http.post<Envelope<BulkAppointmentStatusResult>>(
      '/appointments/bulk-status',
      { ids, status },
    );
    return data.data;
  },
};

export function useAppointments(params: AppointmentListParams) {
  return useQuery({
    queryKey: queryKeys.appointments.list(params),
    queryFn: () => appointmentsApi.list(params),
    /** Keeps the previous page on screen while the next one loads — no table flash. */
    placeholderData: (prev) => prev,
  });
}

/**
 * Server-side rollups over the **whole** filtered set.
 *
 * Replaces the old "fetch 200 rows and add them up in the browser" hack, which
 * silently went wrong as soon as a filter matched more than 200 appointments.
 */
export function useAppointmentSummary(params: AppointmentFilterParams) {
  return useQuery({
    queryKey: queryKeys.appointments.summary(params),
    queryFn: () => appointmentsApi.summary(params),
    placeholderData: (prev) => prev,
  });
}

export function useAppointment(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.appointments.detail(id ?? ''),
    queryFn: () => appointmentsApi.get(id!),
    enabled: Boolean(id),
  });
}

export function useCalendarAppointments(params: { from: string; to: string; branchId?: string }) {
  return useQuery({
    queryKey: queryKeys.appointments.calendar(params),
    queryFn: () => appointmentsApi.calendar(params),
  });
}

/** Every appointment mutation touches the same three query families. */
function invalidateAppointments(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['appointments'] });
  void qc.invalidateQueries({ queryKey: ['dashboard'] });
  void qc.invalidateQueries({ queryKey: ['queue'] });
}

export function useSetAppointmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      staffNotes,
      waiveFee,
    }: {
      id: string;
      status: AppointmentStatus;
      staffNotes?: string;
      /** Wave 11 — skip keeping the paid deposit as a no-show / late-cancel fee. */
      waiveFee?: boolean;
    }) => appointmentsApi.setStatus(id, status, staffNotes, waiveFee),
    onSuccess: () => invalidateAppointments(qc),
  });
}

export function useBulkAppointmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: AppointmentStatus }) =>
      appointmentsApi.bulkStatus(ids, status),
    onSuccess: () => invalidateAppointments(qc),
  });
}
