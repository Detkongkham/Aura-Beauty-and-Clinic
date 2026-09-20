import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
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
