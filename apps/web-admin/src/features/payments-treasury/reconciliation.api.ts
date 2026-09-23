import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CashDrawerMovementInput,
  CashPolicy,
  CashVarianceReport,
  ZReportView,
  CashDrawerSessionView,
  CloseCashDrawerInput,
  ClosePeriodInput,
  OpenCashDrawerInput,
  MatchLineInput,
  PeriodReadiness,
  ReconSettings,
  ReconciliationPeriodView,
  ReconciliationRow,
  ResolveStatementInput,
  ResolveStatementsBulkInput,
  StatementHistoryEntry,
  StatementImportInput,
  StatementImportPreview,
  StatementImportResult,
} from '@abcp/shared-types';

import { http } from '@/services/http';

import { TREASURY_KEY } from './treasury.api';

/** Hooks for the reconciliation gap work (G1/G3/G5/G9/G11) — kept apart from treasury.api.ts. */

interface Envelope<T> {
  data: T;
}
const BASE = '/payments-treasury/reconciliation';
const RECON_KEY = [...TREASURY_KEY, 'reconciliation'] as const;

function useInvalidateRecon() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: RECON_KEY });
}

// ── resolution (G3) ──────────────────────────────────────────────────
export function useResolveStatement() {
  const invalidate = useInvalidateRecon();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ResolveStatementInput }) =>
      (await http.post<Envelope<ReconciliationRow>>(`${BASE}/statements/${id}/resolve`, input)).data.data,
    onSuccess: invalidate,
  });
}

export function useReopenStatement() {
  const invalidate = useInvalidateRecon();
  return useMutation({
    mutationFn: async (id: string) =>
      (await http.delete<Envelope<ReconciliationRow>>(`${BASE}/statements/${id}/resolve`)).data.data,
    onSuccess: invalidate,
  });
}

export function useResolveBulk() {
  const invalidate = useInvalidateRecon();
  return useMutation({
    mutationFn: async (input: ResolveStatementsBulkInput) =>
      (await http.post<Envelope<{ resolved: number }>>(`${BASE}/statements/resolve-bulk`, input)).data.data,
    onSuccess: invalidate,
  });
}

// ── history (G11) ────────────────────────────────────────────────────
export function useStatementHistory(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: [...RECON_KEY, 'history', id],
    enabled: Boolean(id) && enabled,
    queryFn: async () => (await http.get<Envelope<StatementHistoryEntry[]>>(`${BASE}/statements/${id}/history`)).data.data,
  });
}

// ── import + lines (G1) ──────────────────────────────────────────────
export function usePreviewImport() {
  return useMutation({
    mutationFn: async (input: StatementImportInput) =>
      (await http.post<Envelope<StatementImportPreview>>(`${BASE}/imports`, { ...input, dryRun: true })).data.data,
  });
}

export function useCommitImport() {
  const invalidate = useInvalidateRecon();
  return useMutation({
    mutationFn: async (input: StatementImportInput) =>
      (await http.post<Envelope<StatementImportResult>>(`${BASE}/imports`, { ...input, dryRun: false })).data.data,
    onSuccess: invalidate,
  });
}

export type StatementImportRow = {
  id: string;
  fileName: string;
  rowCount: number;
  creditTotal: number;
  debitTotal: number;
  fromDate: string;
  toDate: string;
  importedByName: string | null;
  createdAt: string;
};

export function useImports(bankAccountId: string | null) {
  return useQuery({
    queryKey: [...RECON_KEY, 'imports', bankAccountId],
    enabled: Boolean(bankAccountId),
    queryFn: async () =>
      (await http.get<Envelope<StatementImportRow[]>>(`${BASE}/imports`, { params: { bankAccountId } })).data.data,
  });
}

export function useDeleteImport() {
  const invalidate = useInvalidateRecon();
  return useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`${BASE}/imports/${id}`);
    },
    onSuccess: invalidate,
  });
}

export type LineCandidate = {
  kind: 'TX' | 'EXPENSE' | 'REFUND';
  id: string;
  amount: number;
  netAmount: number;
  at: string;
  date: string;
  reference: string | null;
  amountDiff: number;
  sameDay: boolean;
};

export function useLineCandidates(lineId: string | null) {
  return useQuery({
    queryKey: [...RECON_KEY, 'candidates', lineId],
    enabled: Boolean(lineId),
    queryFn: async () => (await http.get<Envelope<LineCandidate[]>>(`${BASE}/lines/${lineId}/candidates`)).data.data,
  });
}

export function useLineAction() {
  const invalidate = useInvalidateRecon();
  return useMutation({
    mutationFn: async (
      a: { lineId: string; action: 'unmatch' | 'ignore' } | { lineId: string; action: 'match'; target: MatchLineInput },
    ) => {
      await http.post(`${BASE}/lines/${a.lineId}/${a.action}`, a.action === 'match' ? a.target : undefined);
    },
    onSuccess: invalidate,
  });
}

export function useRematch() {
  const invalidate = useInvalidateRecon();
  return useMutation({
    mutationFn: async (input: { bankAccountId: string; from: string; to: string }) =>
      (await http.post<Envelope<{ matched: number }>>(`${BASE}/rematch`, input)).data.data,
    onSuccess: invalidate,
  });
}

// ── periods (G5) ─────────────────────────────────────────────────────
export function usePeriods(branchId?: string) {
  return useQuery({
    queryKey: [...RECON_KEY, 'periods', branchId ?? 'all'],
    queryFn: async () =>
      (await http.get<Envelope<ReconciliationPeriodView[]>>(`${BASE}/periods`, { params: branchId ? { branchId } : undefined }))
        .data.data,
  });
}

export function usePeriodReadiness(branchId: string | null, month: string | null) {
  return useQuery({
    queryKey: [...RECON_KEY, 'readiness', branchId, month],
    enabled: Boolean(branchId && month),
    queryFn: async () =>
      (await http.get<Envelope<PeriodReadiness>>(`${BASE}/periods/readiness`, { params: { branchId, month } })).data.data,
  });
}

export function useClosePeriod() {
  const invalidate = useInvalidateRecon();
  return useMutation({
    mutationFn: async (input: ClosePeriodInput) =>
      (await http.post<Envelope<ReconciliationPeriodView>>(`${BASE}/periods`, input)).data.data,
    onSuccess: invalidate,
  });
}

export function useReopenPeriod() {
  const invalidate = useInvalidateRecon();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      await http.delete(`${BASE}/periods/${id}`, { data: { reason } });
    },
    onSuccess: invalidate,
  });
}

// ── settings (G9) ────────────────────────────────────────────────────
export function useReconSettings() {
  return useQuery({
    queryKey: [...RECON_KEY, 'settings'],
    queryFn: async () => (await http.get<Envelope<ReconSettings>>(`${BASE}/settings`)).data.data,
  });
}

export function useUpdateReconSettings() {
  const invalidate = useInvalidateRecon();
  return useMutation({
    mutationFn: async (input: Partial<ReconSettings>) =>
      (await http.put<Envelope<ReconSettings>>(`${BASE}/settings`, input)).data.data,
    onSuccess: invalidate,
  });
}

// ── cash drawer (G10) ────────────────────────────────────────────────
const DRAWER = '/payments-treasury/cash-drawer';
const DRAWER_KEY = [...TREASURY_KEY, 'cash-drawer'] as const;

export function useCurrentDrawer(branchId: string | null) {
  return useQuery({
    queryKey: [...DRAWER_KEY, 'current', branchId],
    enabled: Boolean(branchId),
    refetchInterval: 60_000,
    queryFn: async () =>
      (await http.get<Envelope<CashDrawerSessionView | null>>(`${DRAWER}/current`, { params: { branchId } })).data.data,
  });
}

export function useDrawerSessions(branchId: string | null) {
  return useQuery({
    queryKey: [...DRAWER_KEY, 'sessions', branchId],
    enabled: Boolean(branchId),
    queryFn: async () =>
      (await http.get<Envelope<CashDrawerSessionView[]>>(`${DRAWER}/sessions`, { params: { branchId } })).data.data,
  });
}

function useInvalidateDrawer() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: DRAWER_KEY });
}

export function useOpenDrawer() {
  const invalidate = useInvalidateDrawer();
  return useMutation({
    mutationFn: async (input: OpenCashDrawerInput) =>
      (await http.post<Envelope<CashDrawerSessionView>>(`${DRAWER}/sessions`, input)).data.data,
    onSuccess: invalidate,
  });
}

export function useDrawerMovement() {
  const invalidate = useInvalidateDrawer();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: CashDrawerMovementInput }) =>
      (await http.post<Envelope<CashDrawerSessionView>>(`${DRAWER}/sessions/${id}/movements`, input)).data.data,
    onSuccess: invalidate,
  });
}

export function useCloseDrawer() {
  const invalidate = useInvalidateDrawer();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: CloseCashDrawerInput }) =>
      (await http.post<Envelope<CashDrawerSessionView>>(`${DRAWER}/sessions/${id}/close`, input)).data.data,
    onSuccess: invalidate,
  });
}

// ---- Wave 10C: Z-report / over-short / ນະໂຍບາຍເງິນສົດ -----------------------

export function useZReport(sessionId: string | null) {
  return useQuery({
    queryKey: [...DRAWER_KEY, 'z-report', sessionId],
    enabled: Boolean(sessionId),
    queryFn: async () => (await http.get<Envelope<ZReportView>>(`${DRAWER}/sessions/${sessionId}/z-report`)).data.data,
  });
}

export function useCashVariance(branchId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: [...DRAWER_KEY, 'variance', branchId, from, to],
    queryFn: async () =>
      (await http.get<Envelope<CashVarianceReport>>(`${DRAWER}/variance-report`, { params: { branchId: branchId || undefined, from, to } })).data.data,
  });
}

export function useCashPolicy() {
  return useQuery({
    queryKey: [...DRAWER_KEY, 'policy'],
    queryFn: async () => (await http.get<Envelope<CashPolicy>>(`${DRAWER}/policy`)).data.data,
  });
}

export function useSaveCashPolicy() {
  const invalidate = useInvalidateDrawer();
  return useMutation({
    mutationFn: async (input: CashPolicy) => (await http.put<Envelope<CashPolicy>>(`${DRAWER}/policy`, input)).data.data,
    onSuccess: invalidate,
  });
}
