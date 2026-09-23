import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ApproveBankChangeInput,
  AssignTransferAccountInput,
  Bank,
  BankAccountChangeView,
  BankChangeStatus,
  BankAccountInsightsView,
  BankAccountView,
  CreateBankAccountInput,
  Paginated,
  PaymentBankAccountView,
  PaymentProviderView,
  BulkApproveSlipsResult,
  PaymentSlipDetail,
  PaymentSlipView,
  SlipExportQuery,
  SlipSummary,
  UploadSlipInput,
  ReconciliationDayDetail,
  ReconciliationView,
  ReconciliationRow,
  ReviewSlipInput,
  SlipListQuery,
  SlipSettings,
  UnassignedTransfer,
  UpdateBankAccountInput,
  UpdatePaymentProviderInput,
  UploadBankAccountQrInput,
  UpsertBankStatementInput,
} from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

const BASE = '/payments-treasury';
export const TREASURY_KEY = ['payments-treasury'] as const;

// ── Banks + accounts ─────────────────────────────────────────────────
export function useBanks() {
  return useQuery({
    queryKey: [...TREASURY_KEY, 'banks'],
    staleTime: 10 * 60_000,
    queryFn: async () => (await http.get<Envelope<Bank[]>>(`${BASE}/banks`)).data.data,
  });
}

export function useBankAccounts(branchId?: string) {
  return useQuery({
    queryKey: [...TREASURY_KEY, 'bank-accounts', branchId ?? 'all'],
    queryFn: async () =>
      (
        await http.get<Envelope<BankAccountView[]>>(`${BASE}/bank-accounts`, {
          params: branchId ? { branchId } : undefined,
        })
      ).data.data,
  });
}

/** Per-account money flow + health for the Banks page (Vientiane days, today inclusive). */
export function useBankAccountInsights(days: number, branchId?: string) {
  return useQuery({
    queryKey: [...TREASURY_KEY, 'bank-accounts', 'insights', days, branchId ?? 'all'],
    queryFn: async () =>
      (
        await http.get<Envelope<BankAccountInsightsView>>(`${BASE}/bank-accounts/insights`, {
          params: { days, ...(branchId ? { branchId } : {}) },
        })
      ).data.data,
    placeholderData: (prev) => prev,
  });
}

/**
 * Result of a payee-changing write. The server answers 202 with a change request when the change needs
 * the owner's approval (BRANCH_ADMIN), otherwise 200/201 with the updated account.
 */
export type BankMutationResult =
  | { pending: false; account: BankAccountView }
  | { pending: true; change: BankAccountChangeView };

function toResult(res: { status: number; data: Envelope<unknown> }): BankMutationResult {
  return res.status === 202
    ? { pending: true, change: res.data.data as BankAccountChangeView }
    : { pending: false, account: res.data.data as BankAccountView };
}

function useInvalidateBanks() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: [...TREASURY_KEY, 'bank-accounts'] });
    void qc.invalidateQueries({ queryKey: [...TREASURY_KEY, 'bank-account-changes'] });
  };
}

export function useCreateBankAccount() {
  const invalidate = useInvalidateBanks();
  return useMutation({
    mutationFn: async (input: CreateBankAccountInput) => toResult(await http.post(`${BASE}/bank-accounts`, input)),
    onSuccess: invalidate,
  });
}

export function useUpdateBankAccount() {
  const invalidate = useInvalidateBanks();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateBankAccountInput }) =>
      toResult(await http.patch(`${BASE}/bank-accounts/${id}`, input)),
    onSuccess: invalidate,
  });
}

export function useDeactivateBankAccount() {
  const invalidate = useInvalidateBanks();
  return useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`${BASE}/bank-accounts/${id}`);
    },
    onSuccess: invalidate,
  });
}

export function useUploadBankQr() {
  const invalidate = useInvalidateBanks();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UploadBankAccountQrInput }) =>
      toResult(await http.post(`${BASE}/bank-accounts/${id}/qr`, input)),
    onSuccess: invalidate,
  });
}

// ── Payee change requests (approval queue + history) ─────────────────
export function useBankChanges(status?: BankChangeStatus) {
  return useQuery({
    queryKey: [...TREASURY_KEY, 'bank-account-changes', status ?? 'all'],
    queryFn: async () =>
      (
        await http.get<Envelope<BankAccountChangeView[]>>(`${BASE}/bank-account-changes`, {
          params: status ? { status } : undefined,
        })
      ).data.data,
  });
}

export function useApproveBankChange() {
  const invalidate = useInvalidateBanks();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ApproveBankChangeInput }) =>
      (await http.post<Envelope<BankAccountChangeView>>(`${BASE}/bank-account-changes/${id}/approve`, input)).data.data,
    onSuccess: invalidate,
  });
}

export function useRejectBankChange() {
  const invalidate = useInvalidateBanks();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) =>
      (await http.post<Envelope<BankAccountChangeView>>(`${BASE}/bank-account-changes/${id}/reject`, { note })).data.data,
    onSuccess: invalidate,
  });
}

export function useCancelBankChange() {
  const invalidate = useInvalidateBanks();
  return useMutation({
    mutationFn: async (id: string) =>
      (await http.post<Envelope<BankAccountChangeView>>(`${BASE}/bank-account-changes/${id}/cancel`)).data.data,
    onSuccess: invalidate,
  });
}

// ── Transfers booked without a receiving account ─────────────────────
export function useUnassignedTransfers(enabled: boolean, branchId?: string) {
  return useQuery({
    queryKey: [...TREASURY_KEY, 'unassigned-transfers', branchId ?? 'all'],
    enabled,
    queryFn: async () =>
      (
        await http.get<Envelope<UnassignedTransfer[]>>(`${BASE}/unassigned-transfers`, {
          params: branchId ? { branchId } : undefined,
        })
      ).data.data,
  });
}

export function useAssignTransferAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: AssignTransferAccountInput }) => {
      await http.patch(`${BASE}/transactions/${id}/bank-account`, input);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...TREASURY_KEY, 'unassigned-transfers'] });
      void qc.invalidateQueries({ queryKey: [...TREASURY_KEY, 'bank-accounts'] });
      void qc.invalidateQueries({ queryKey: [...TREASURY_KEY, 'reconciliation'] });
    },
  });
}

/** Active receiving accounts of the branch that issued a bill — readable by any staff who can see the bill. */
export function usePaymentBankAccounts(paymentId: string | null) {
  return useQuery({
    queryKey: [...TREASURY_KEY, 'payment-bank-accounts', paymentId],
    enabled: Boolean(paymentId),
    staleTime: 60_000,
    queryFn: async () =>
      (await http.get<Envelope<PaymentBankAccountView[]>>(`${BASE}/payments/${paymentId}/bank-accounts`)).data.data,
  });
}

// ── Providers + slip settings ────────────────────────────────────────
export function useProviders() {
  return useQuery({
    queryKey: [...TREASURY_KEY, 'providers'],
    queryFn: async () => (await http.get<Envelope<PaymentProviderView[]>>(`${BASE}/providers`)).data.data,
  });
}

export function useUpdateProvider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, input }: { code: string; input: UpdatePaymentProviderInput }) =>
      (await http.patch<Envelope<PaymentProviderView>>(`${BASE}/providers/${code}`, input)).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...TREASURY_KEY, 'providers'] }),
  });
}

export function useSlipSettings() {
  return useQuery({
    queryKey: [...TREASURY_KEY, 'settings'],
    queryFn: async () => (await http.get<Envelope<SlipSettings>>(`${BASE}/settings`)).data.data,
  });
}

export function useUpdateSlipSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<SlipSettings>) =>
      (await http.put<Envelope<SlipSettings>>(`${BASE}/settings`, input)).data.data,
    onSuccess: (data) => qc.setQueryData([...TREASURY_KEY, 'settings'], data),
  });
}

// ── Slips ────────────────────────────────────────────────────────────
export function useSlips(params: Partial<SlipListQuery>) {
  return useQuery({
    queryKey: [...TREASURY_KEY, 'slips', params],
    queryFn: async () =>
      (
        await http.get<Envelope<Paginated<PaymentSlipView>>>(`${BASE}/slips`, {
          params: { page: 1, pageSize: 100, ...params },
        })
      ).data.data,
    placeholderData: (prev) => prev,
  });
}

export function useSlip(id: string | null) {
  return useQuery({
    queryKey: [...TREASURY_KEY, 'slip', id],
    enabled: Boolean(id),
    queryFn: async () => (await http.get<Envelope<PaymentSlipDetail>>(`${BASE}/slips/${id}`)).data.data,
  });
}

/** Queue / today / 7-day figures, counted server-side (not from the 100 newest rows). */
export function useSlipSummary(branchId?: string) {
  return useQuery({
    queryKey: [...TREASURY_KEY, 'slips', 'summary', branchId ?? ''],
    queryFn: async () =>
      (
        await http.get<Envelope<SlipSummary>>(`${BASE}/slips/summary`, {
          params: branchId ? { branchId } : undefined,
        })
      ).data.data,
    placeholderData: (prev) => prev,
  });
}

/** Confirms several AUTO_MATCHED slips; the server reports the ones it could not confirm. */
export function useBulkApproveSlips() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) =>
      (
        await http.post<Envelope<BulkApproveSlipsResult>>(
          `${BASE}/slips/bulk-approve`,
          { ids },
          { headers: { 'Idempotency-Key': crypto.randomUUID() } },
        )
      ).data.data,
    onSettled: () => void qc.invalidateQueries({ queryKey: [...TREASURY_KEY] }),
  });
}

/** S5 — claim / heartbeat (force = take over from a colleague). Not invalidating: the caller merges the result. */
export function useClaimSlip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, force }: { id: string; force?: boolean }) =>
      (await http.post<Envelope<PaymentSlipView>>(`${BASE}/slips/${id}/claim`, { force })).data.data,
    onSuccess: (slip) => {
      qc.setQueryData<PaymentSlipDetail | undefined>([...TREASURY_KEY, 'slip', slip.id], (prev) =>
        prev ? { ...prev, claimedBy: slip.claimedBy } : prev,
      );
    },
  });
}

/** S5 — release my claim (fire-and-forget when the pane closes / moves on). */
export function releaseSlipClaim(id: string): void {
  void http.delete(`${BASE}/slips/${id}/claim`).catch(() => undefined);
}

/** S6 — ask the customer for a clearer slip / more detail without rejecting. */
export function useRequestSlipInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) =>
      (
        await http.post<Envelope<{ slip: PaymentSlipView; viaChat: boolean }>>(`${BASE}/slips/${id}/request-info`, {
          message,
        })
      ).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...TREASURY_KEY] }),
  });
}

/** S7 — reverse a confirmed slip (the tender is reversed and the bill recomputed). */
export function useReverseSlip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (
        await http.post<Envelope<PaymentSlipView>>(
          `${BASE}/slips/${id}/reverse`,
          { reason },
          { headers: { 'Idempotency-Key': crypto.randomUUID() } },
        )
      ).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...TREASURY_KEY] }),
  });
}

/** S12 — staff upload a slip for a bill (e.g. a screenshot the customer sent on LINE/WhatsApp). */
export function useUploadSlip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ paymentId, input }: { paymentId: string; input: UploadSlipInput }) =>
      (
        await http.post<Envelope<PaymentSlipView>>(`${BASE}/payments/${paymentId}/slips`, input, {
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        })
      ).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...TREASURY_KEY] }),
  });
}

/** S10 — download the decision CSV for the current filters (auth header, so not a plain link). */
export async function downloadSlipsCsv(params: Partial<SlipExportQuery>): Promise<void> {
  const res = await http.get<Blob>(`${BASE}/slips/export`, { params, responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `slips-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Re-runs OCR on a slip that failed or was misread. */
export function useReprocessSlip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await http.post<Envelope<PaymentSlipView>>(`${BASE}/slips/${id}/reprocess`)).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...TREASURY_KEY] }),
  });
}

export function useReviewSlip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: ReviewSlipInput }) =>
      (
        await http.post<Envelope<PaymentSlipView>>(`${BASE}/slips/${id}/review`, input, {
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        })
      ).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...TREASURY_KEY] }),
  });
}

// ── Reconciliation ───────────────────────────────────────────────────
export interface ReconciliationParams {
  from: string;
  to: string;
  branchId?: string;
  bankAccountId?: string;
}

export function useReconciliation(params: ReconciliationParams) {
  return useQuery({
    queryKey: [...TREASURY_KEY, 'reconciliation', params],
    queryFn: async () =>
      (await http.get<Envelope<ReconciliationView>>(`${BASE}/reconciliation`, { params })).data.data,
    placeholderData: (prev) => prev,
  });
}

/** One account on one day — the lines behind the totals. Keyed under `reconciliation` so saves refresh it. */
export function useReconciliationDay(bankAccountId: string | null, date: string | null) {
  return useQuery({
    queryKey: [...TREASURY_KEY, 'reconciliation', 'day', bankAccountId, date],
    enabled: Boolean(bankAccountId && date),
    queryFn: async () =>
      (
        await http.get<Envelope<ReconciliationDayDetail>>(`${BASE}/reconciliation/day`, {
          params: { bankAccountId, date },
        })
      ).data.data,
  });
}

export function useUpsertStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertBankStatementInput) =>
      (await http.put<Envelope<ReconciliationRow>>(`${BASE}/reconciliation/statements`, input)).data.data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...TREASURY_KEY, 'reconciliation'] }),
  });
}

export function useDeleteStatement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`${BASE}/reconciliation/statements/${id}`);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...TREASURY_KEY, 'reconciliation'] }),
  });
}
