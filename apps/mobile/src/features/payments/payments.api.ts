import type { AddTendersInput, DepositIntentView, PaymentView } from '@abcp/shared-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http } from '../../services/http';
import { qk } from '../../services/queryKeys';
import { newIdempotencyKey } from '../../lib/idempotency';

/** ເປີດ (ຫຼືດຶງ) ບິນຂອງນັດ — idempotent ຝັ່ງ server. */
export function useOpenBill(appointmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await http.post<{ data: PaymentView }>(
        '/payments',
        { appointmentId },
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      );
      return data.data;
    },
    onSuccess: (p) => qc.setQueryData(qk.payment(appointmentId), p),
  });
}

export function usePaymentByAppointment(appointmentId: string, enabled = true) {
  return useQuery({
    queryKey: qk.payment(appointmentId),
    enabled,
    queryFn: async () => {
      const { data } = await http.get<{ data: PaymentView | null }>(
        `/payments/by-appointment/${appointmentId}`,
      );
      return data.data;
    },
  });
}

export function useDepositIntent() {
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const { data } = await http.post<{ data: DepositIntentView }>(
        `/payments/${paymentId}/deposit-intent`,
        { method: 'BCEL_ONE_QR' },
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      );
      return data.data;
    },
  });
}

export function useAddTenders(appointmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { paymentId: string; tenders: AddTendersInput['tenders'] }) => {
      const { data } = await http.post<{ data: PaymentView }>(
        `/payments/${args.paymentId}/tenders`,
        { tenders: args.tenders },
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      );
      return data.data;
    },
    onSuccess: (p) => {
      qc.setQueryData(qk.payment(appointmentId), p);
      void qc.invalidateQueries({ queryKey: ['appointments', 'me'] });
      void qc.invalidateQueries({ queryKey: qk.appointment(appointmentId) });
      void qc.invalidateQueries({ queryKey: qk.loyalty });
      void qc.invalidateQueries({ queryKey: qk.giftCards });
    },
  });
}

export function useSettleMock(appointmentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { paymentId: string; qrReference: string }) => {
      const { data } = await http.post<{ data: PaymentView }>(
        `/payments/${args.paymentId}/settle-mock`,
        { qrReference: args.qrReference },
        { headers: { 'Idempotency-Key': newIdempotencyKey() } },
      );
      return data.data;
    },
    onSuccess: (p) => {
      qc.setQueryData(qk.payment(appointmentId), p);
      void qc.invalidateQueries({ queryKey: ['appointments', 'me'] });
      void qc.invalidateQueries({ queryKey: qk.appointment(appointmentId) });
    },
  });
}
