import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  KpiBulkTargetInput,
  PayrollYtdView,
  PayrollAdjustmentCreateInput,
  PayrollAdjustmentView,
  PayrollRunPayInput,
  PayrollRunView,
  PayrollSettings,
  PayslipView,
  StaffSalaryInput,
} from '@abcp/shared-types';

import { http } from '@/services/http';

/** Payroll P2/P3/P4 — pay runs, payslips, salary, adjustments, settings. */

interface Envelope<T> {
  data: T;
}

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) =>
  void qc.invalidateQueries({ queryKey: ['payroll'] });

export function usePayrollRuns(monthYear: string, branchId?: string) {
  return useQuery({
    queryKey: ['payroll', 'runs', monthYear, branchId ?? ''],
    queryFn: async () => {
      const { data } = await http.get<Envelope<PayrollRunView[]>>('/payroll/runs', {
        params: { monthYear, ...(branchId ? { branchId } : {}) },
      });
      return data.data;
    },
  });
}

export function usePayrollRun(id: string | null) {
  return useQuery({
    queryKey: ['payroll', 'run', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await http.get<Envelope<PayrollRunView>>(`/payroll/runs/${id}`);
      return data.data;
    },
  });
}

export function usePrepareRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { branchId: string; monthYear: string }) => {
      const { data } = await http.post<Envelope<PayrollRunView>>('/payroll/runs', input);
      return data.data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useRunAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      a:
        | { id: string; action: 'approve' }
        | { id: string; action: 'reopen'; reason: string }
        | ({ id: string; action: 'pay' } & PayrollRunPayInput),
    ) => {
      const { id, action, ...body } = a;
      const { data } = await http.post<Envelope<PayrollRunView>>(`/payroll/runs/${id}/${action}`, body);
      return data.data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function usePayslip(id: string | null) {
  return useQuery({
    queryKey: ['payroll', 'payslip', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await http.get<Envelope<PayslipView & { run: PayrollRunView }>>(`/payroll/payslips/${id}`);
      return data.data;
    },
  });
}

export function usePayrollAdjustments(monthYear: string, branchId?: string) {
  return useQuery({
    queryKey: ['payroll', 'adjustments', monthYear, branchId ?? ''],
    queryFn: async () => {
      const { data } = await http.get<Envelope<PayrollAdjustmentView[]>>('/payroll/adjustments', {
        params: { monthYear, ...(branchId ? { branchId } : {}) },
      });
      return data.data;
    },
  });
}

export function useCreateAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PayrollAdjustmentCreateInput) => {
      const { data } = await http.post<Envelope<PayrollAdjustmentView>>('/payroll/adjustments', input);
      return data.data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`/payroll/adjustments/${id}`);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useStaffSalary(staffProfileId: string | null) {
  return useQuery({
    queryKey: ['payroll', 'salary', staffProfileId],
    enabled: Boolean(staffProfileId),
    queryFn: async () => {
      const { data } = await http.get<Envelope<StaffSalaryInput>>(`/payroll/staff/${staffProfileId}/salary`);
      return data.data;
    },
  });
}

export function useSetStaffSalary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffProfileId, input }: { staffProfileId: string; input: StaffSalaryInput }) => {
      const { data } = await http.put<Envelope<StaffSalaryInput>>(`/payroll/staff/${staffProfileId}/salary`, input);
      return data.data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function usePayrollSettings() {
  return useQuery({
    queryKey: ['payroll', 'settings'],
    queryFn: async () => {
      const { data } = await http.get<Envelope<PayrollSettings>>('/payroll/settings');
      return data.data;
    },
  });
}

export function useSavePayrollSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PayrollSettings) => {
      const { data } = await http.put<Envelope<PayrollSettings>>('/payroll/settings', input);
      return data.data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

// ---- G1.8 service rules · G5.5 bulk targets · G5.3 year-to-date ----------

export type ServiceCommissionRuleView = { serviceId: string; serviceName: string; rate: number; updatedAt: string };

export function useServiceCommissionRules() {
  return useQuery({
    queryKey: ['payroll', 'service-rules'],
    queryFn: async () => {
      const { data } = await http.get<Envelope<ServiceCommissionRuleView[]>>('/payroll/service-rules');
      return data.data;
    },
  });
}

export function useSetServiceCommissionRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ serviceId, rate }: { serviceId: string; rate: number | null }) => {
      const { data } = await http.put<Envelope<ServiceCommissionRuleView | null>>(
        `/payroll/service-rules/${serviceId}`,
        { rate },
      );
      return data.data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useBulkKpiTargets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: KpiBulkTargetInput) => {
      const { data } = await http.post<Envelope<{ monthYear: string; updated: number; skipped: number }>>(
        '/payroll/kpi/bulk-targets',
        input,
      );
      return data.data;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function usePayrollYtd(year: number, branchId?: string) {
  return useQuery({
    queryKey: ['payroll', 'ytd', year, branchId ?? ''],
    queryFn: async () => {
      const { data } = await http.get<Envelope<PayrollYtdView>>('/payroll/ytd', {
        params: { year, ...(branchId ? { branchId } : {}) },
      });
      return data.data;
    },
  });
}
