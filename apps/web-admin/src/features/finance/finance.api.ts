import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateRefundInput,
  PayRefundInput,
  ReceiptView,
  RefundListQuery,
  RefundView,
  VatReportQuery,
  VatReportView,
  VatSettings,
  FinanceSummaryView,
  Paginated,
  PaymentStatus,
  PaymentTenderInput,
  PaymentView,
} from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

export interface FinanceFilters {
  branchId: string | 'all';
  status?: PaymentStatus;
  from?: string;
  to?: string;
  q?: string;
  page: number;
  pageSize: number;
}

export const financeApi = {
  async list(f: FinanceFilters): Promise<Paginated<PaymentView>> {
    const { data } = await http.get<Envelope<Paginated<PaymentView>>>('/payments', {
      params: {
        branchId: f.branchId,
        status: f.status,
        from: f.from,
        to: f.to,
        q: f.q || undefined,
        page: f.page,
        pageSize: f.pageSize,
      },
    });
    return data.data;
  },
  async summary(f: Pick<FinanceFilters, 'branchId' | 'from' | 'to'>): Promise<FinanceSummaryView> {
    const { data } = await http.get<Envelope<FinanceSummaryView>>('/payments/summary', {
      params: { branchId: f.branchId, from: f.from, to: f.to },
    });
    return data.data;
  },
  async get(id: string): Promise<PaymentView> {
    const { data } = await http.get<Envelope<PaymentView>>(`/payments/${id}`);
    return data.data;
  },
};

export function usePayments(f: FinanceFilters) {
  return useQuery({
    queryKey: ['payments', f],
    queryFn: () => financeApi.list(f),
    placeholderData: (prev) => prev,
  });
}

export function useFinanceSummary(f: Pick<FinanceFilters, 'branchId' | 'from' | 'to'>) {
  return useQuery({
    queryKey: ['payments', 'summary', f],
    queryFn: () => financeApi.summary(f),
  });
}

/**
 * POST /payments/:id/tenders — ພະນັກງານບັນທຶກເງິນທີ່ຮັບໜ້າຮ້ານ (CASH / BCEL QR ພ້ອມເລກອ້າງອີງ).
 * ລູກຄ້າບັນທຶກ CASH/QR ເອງບໍ່ໄດ້ (backend 403 TENDER_NOT_ALLOWED) — ນີ້ຈຶ່ງເປັນທາງດຽວທີ່ຮັບເງິນສົດ.
 */
export function useRecordTender(paymentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tender: PaymentTenderInput): Promise<PaymentView> => {
      const { data } = await http.post<Envelope<PaymentView>>(
        `/payments/${paymentId}/tenders`,
        { tenders: [tender] },
        { headers: { 'Idempotency-Key': crypto.randomUUID() } },
      );
      return data.data;
    },
    onSuccess: (p) => {
      qc.setQueryData(['payments', 'detail', paymentId], p);
      void qc.invalidateQueries({ queryKey: ['payments'] });
      void qc.invalidateQueries({ queryKey: ['appointments'] });
    },
  });
}

export function usePayment(id: string | null) {
  return useQuery({
    queryKey: ['payments', 'detail', id],
    queryFn: () => financeApi.get(id!),
    enabled: Boolean(id),
  });
}

// ---- Wave 10B: refund / void / receipt / VAT ------------------------------

function useInvalidatePayments() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['payments'] });
    void qc.invalidateQueries({ queryKey: ['refunds'] });
    void qc.invalidateQueries({ queryKey: ['appointments'] });
  };
}

export function useRefunds(q: Partial<RefundListQuery>, enabled = true) {
  return useQuery({
    queryKey: ['refunds', q],
    queryFn: async () =>
      (await http.get<Envelope<Paginated<RefundView>>>('/payments/refunds', { params: q })).data.data,
    enabled,
  });
}

export function useCreateRefund(paymentId: string) {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: async (input: Partial<CreateRefundInput> & Pick<CreateRefundInput, 'amount' | 'reason'>) =>
      (await http.post<Envelope<RefundView>>(`/payments/${paymentId}/refunds`, input)).data.data,
    onSuccess: invalidate,
  });
}

export function useRefundAction() {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: async (a: { id: string; action: 'approve' | 'reject' | 'pay'; reason?: string; pay?: PayRefundInput }) => {
      const body = a.action === 'reject' ? { reason: a.reason } : a.action === 'pay' ? (a.pay ?? {}) : undefined;
      return (await http.post<Envelope<RefundView>>(`/payments/refunds/${a.id}/${a.action}`, body)).data.data;
    },
    onSuccess: invalidate,
  });
}

export function useVoidPayment(paymentId: string) {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: async (reason: string) => (await http.post(`/payments/${paymentId}/void`, { reason })).data.data,
    onSuccess: invalidate,
  });
}

export function useReceipt(paymentId: string | null) {
  return useQuery({
    queryKey: ['payments', 'receipt', paymentId],
    queryFn: async () => (await http.get<Envelope<ReceiptView>>(`/payments/${paymentId}/receipt`)).data.data,
    enabled: Boolean(paymentId),
  });
}

export function useVatReport(q: VatReportQuery, enabled = true) {
  return useQuery({
    queryKey: ['payments', 'vat-report', q],
    queryFn: async () => (await http.get<Envelope<VatReportView>>('/payments/vat-report', { params: q })).data.data,
    enabled,
  });
}

export function useVatSettings(enabled = true) {
  return useQuery({
    queryKey: ['payments', 'vat-settings'],
    queryFn: async () => (await http.get<Envelope<VatSettings>>('/payments/vat-settings')).data.data,
    enabled,
  });
}

export function useSaveVatSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: VatSettings) => (await http.put<Envelope<VatSettings>>('/payments/vat-settings', input)).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['payments'] }),
  });
}
