import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BonusBulkPaidInput,
  BonusPaidInput,
  CommissionBulkPayInput,
  CommissionPayInput,
  KpiGoalWriteInput,
  KpiRecomputeInput,
  PayrollBreakdown,
  PayrollReport,
  PayrollRow,
} from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

export interface PayrollFilters {
  monthYear?: string;
  branchId?: string;
}

const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));

export function usePayrollReport(f: PayrollFilters) {
  return useQuery({
    queryKey: ['payroll', 'kpi', f],
    queryFn: async () => {
      const { data } = await http.get<Envelope<PayrollReport>>('/payroll/kpi', {
        params: clean({ monthYear: f.monthYear, branchId: f.branchId }),
      });
      return data.data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useSetKpiGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      staffProfileId,
      input,
    }: {
      staffProfileId: string;
      input: KpiGoalWriteInput;
    }) => {
      const { data } = await http.put<Envelope<PayrollRow>>(`/payroll/kpi/${staffProfileId}`, input);
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

export function useRecomputeKpi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: KpiRecomputeInput) => {
      const { data } = await http.post<Envelope<{ monthYear: string; updated: number }>>(
        '/payroll/kpi/recompute',
        input,
      );
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

export function useSetBonusPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      staffProfileId,
      input,
    }: {
      staffProfileId: string;
      input: BonusPaidInput;
    }) => {
      const { data } = await http.patch<Envelope<unknown>>(
        `/payroll/kpi/${staffProfileId}/bonus-paid`,
        input,
      );
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

export function usePayCommissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CommissionPayInput) => {
      const { data } = await http.post<Envelope<{ affected: number; amount: number; held: number }>>(
        '/payroll/commissions/pay',
        input,
      );
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

/**
 * Per-staff payslip for one month — commission lines, daily revenue, top
 * services and a 6-month history. Only fetched while the drawer is open.
 */
export function useStaffBreakdown(staffProfileId: string | null, monthYear: string) {
  return useQuery({
    queryKey: ['payroll', 'breakdown', staffProfileId, monthYear],
    enabled: Boolean(staffProfileId),
    queryFn: async () => {
      const { data } = await http.get<Envelope<PayrollBreakdown>>(
        `/payroll/kpi/${staffProfileId}/breakdown`,
        { params: clean({ monthYear }) },
      );
      return data.data;
    },
  });
}

/** Pays (or un-pays) every selected staff member's commission in one request. */
export function usePayCommissionsBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CommissionBulkPayInput) => {
      const { data } = await http.post<
        Envelope<{ affected: number; amount: number; held: number; staff: number }>
      >(
        '/payroll/commissions/pay-bulk',
        input,
      );
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

export function useSetBonusPaidBulk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BonusBulkPaidInput) => {
      const { data } = await http.patch<Envelope<{ affected: number }>>(
        '/payroll/kpi/bonus-paid-bulk',
        input,
      );
      return data.data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

/** Fetches the CSV with the auth header and triggers a browser download. */
export async function downloadPayrollCsv(f: PayrollFilters): Promise<void> {
  const res = await http.get<Blob>('/payroll/export', {
    params: clean({ monthYear: f.monthYear, branchId: f.branchId }),
    responseType: 'blob',
  });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payroll-${f.monthYear ?? 'current'}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
