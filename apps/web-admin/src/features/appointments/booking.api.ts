import type { ServiceDeliveryType } from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { http } from '@/services/http';
import type { AppointmentDetail } from '@/types/models';

/**
 * Booking endpoints used by the appointments console to **create** and **move**
 * bookings on a customer's behalf. Read-side lives in `appointments.api.ts`;
 * this file is the write side that goes through the slot engine.
 */

interface Envelope<T> {
  data: T;
}

export interface Slot {
  staffProfileId: string;
  startAt: string;
  endAt: string;
}

export interface AvailabilityResponse {
  date: string;
  durationMinutes: number;
  slots: Slot[];
}

export interface CreateAppointmentInput {
  branchId: string;
  customerId: string;
  serviceId: string;
  staffProfileId?: string;
  startAt: string;
  deliveryType?: ServiceDeliveryType;
  homeAddress?: string;
  destLatitude?: number;
  destLongitude?: number;
  customerNotes?: string;
}

export const bookingApi = {
  async availability(params: {
    branchId: string;
    serviceId: string;
    date: string;
    staffProfileId?: string;
  }): Promise<AvailabilityResponse> {
    const { data } = await http.get<Envelope<AvailabilityResponse>>('/booking/availability', {
      params,
    });
    return data.data;
  },
  async create(input: CreateAppointmentInput): Promise<{ id: string }> {
    const { data } = await http.post<Envelope<{ id: string }>>('/booking/appointments', input);
    return data.data;
  },
  async reschedule(
    id: string,
    input: { startAt: string; staffProfileId?: string; force?: boolean },
  ): Promise<AppointmentDetail> {
    const { data } = await http.patch<Envelope<AppointmentDetail>>(
      `/appointments/${id}/reschedule`,
      input,
    );
    return data.data;
  },
};

/**
 * Open slots for one service on one day.
 *
 * Only fires once branch + service + date are all chosen — an availability call
 * without them is meaningless and the server would reject it anyway.
 */
export function useAvailability(params: {
  branchId?: string;
  serviceId?: string;
  date?: string;
  staffProfileId?: string;
}) {
  const ready = Boolean(params.branchId && params.serviceId && params.date);
  return useQuery({
    queryKey: ['booking', 'availability', params],
    queryFn: () =>
      bookingApi.availability({
        branchId: params.branchId!,
        serviceId: params.serviceId!,
        date: params.date!,
        ...(params.staffProfileId ? { staffProfileId: params.staffProfileId } : {}),
      }),
    enabled: ready,
    /** Slots go stale fast — someone else may take one while this sheet is open. */
    staleTime: 15_000,
  });
}

function useInvalidateBooking() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['appointments'] });
    void qc.invalidateQueries({ queryKey: ['booking'] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['queue'] });
  };
}

export function useCreateAppointment() {
  const invalidate = useInvalidateBooking();
  return useMutation({ mutationFn: bookingApi.create, onSuccess: invalidate });
}

export function useRescheduleAppointment() {
  const invalidate = useInvalidateBooking();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      startAt: string;
      staffProfileId?: string;
      force?: boolean;
    }) => bookingApi.reschedule(id, input),
    onSuccess: invalidate,
  });
}
