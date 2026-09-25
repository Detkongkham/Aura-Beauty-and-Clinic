import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CashFundCountInput,
  CashFundEntryView,
  CashFundMovementInput,
  CashFundView,
  CreateCashFundInput,
  ReceiptScanInput,
  ReceiptScanView,
  UpdateCashFundInput,
  ExpenseBudgetView,
  ExpenseHistoryEntry,
  ExpenseSettingsView,
  ExpenseStatusCounts,
  UpdateExpenseSettingsInput,
  UpsertExpenseBudgetsInput,
  BulkExpenseActionInput,
  BulkExpenseActionResult,
  CreateExpenseCategoryInput,
  CreateExpenseInput,
  CreateRecurringExpenseInput,
  ExpenseCategoryView,
  ExpenseListQuery,
  ExpenseSummaryView,
  ExpenseView,
  Paginated,
  PayExpenseInput,
  ProfitLossView,
  RecurringExpenseView,
  UpdateExpenseCategoryInput,
  UpdateExpenseInput,
  UpdateRecurringExpenseInput,
  UploadExpenseAttachmentInput,
  ExpenseAttachmentView,
} from '@abcp/shared-types';

import { http } from '@/services/http';

interface Envelope<T> {
  data: T;
}

const BASE = '/expenses';
export const EXPENSES_KEY = ['expenses'] as const;

export type ExpenseFilters = Partial<Omit<ExpenseListQuery, 'page' | 'pageSize'>> & {
  page?: number;
  pageSize?: number;
};

export function useExpenseCategories(includeInactive = false) {
  return useQuery({
    queryKey: [...EXPENSES_KEY, 'categories', includeInactive],
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (
        await http.get<Envelope<ExpenseCategoryView[]>>(`${BASE}/categories`, {
          params: includeInactive ? { includeInactive: 'true' } : undefined,
        })
      ).data.data,
  });
}

export function useExpenses(filters: ExpenseFilters, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...EXPENSES_KEY, 'list', filters],
    enabled: opts.enabled ?? true,
    queryFn: async () =>
      (await http.get<Envelope<Paginated<ExpenseView>>>(BASE, { params: filters })).data.data,
    placeholderData: (prev) => prev,
  });
}

/** Every row matching `filters`, walked page by page — CSV export must not stop at the visible page. */
export async function fetchAllExpenses(filters: ExpenseFilters, cap = 5000): Promise<{ items: ExpenseView[]; truncated: boolean }> {
  const items: ExpenseView[] = [];
  for (let page = 1; ; page += 1) {
    const res = (await http.get<Envelope<Paginated<ExpenseView>>>(BASE, { params: { ...filters, page, pageSize: 200 } })).data.data;
    items.push(...res.items);
    if (page >= res.totalPages || items.length >= cap) return { items: items.slice(0, cap), truncated: res.total > cap };
  }
}

export function useExpense(id: string | null) {
  return useQuery({
    queryKey: [...EXPENSES_KEY, 'detail', id],
    enabled: Boolean(id),
    queryFn: async () => (await http.get<Envelope<ExpenseView>>(`${BASE}/${id}`)).data.data,
  });
}

export function useExpenseSummary(params: { branchId?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: [...EXPENSES_KEY, 'summary', params],
    queryFn: async () =>
      (await http.get<Envelope<ExpenseSummaryView>>(`${BASE}/summary`, { params })).data.data,
    placeholderData: (prev) => prev,
  });
}

export function useProfitLoss(params: { branchId?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: [...EXPENSES_KEY, 'pnl', params],
    queryFn: async () =>
      (await http.get<Envelope<ProfitLossView>>(`${BASE}/profit-loss`, { params })).data.data,
    placeholderData: (prev) => prev,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: [...EXPENSES_KEY] });
}

export function useCreateExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    /**
     * The API requires an Idempotency-Key on create. The form passes one per dialog session, so a
     * double-click or a retry after a flaky response can't file the same expense twice.
     */
    mutationFn: async ({ input, idempotencyKey }: { input: CreateExpenseInput; idempotencyKey: string }) =>
      (await http.post<Envelope<ExpenseView>>(BASE, input, { headers: { 'Idempotency-Key': idempotencyKey } })).data.data,
    onSuccess: invalidate,
  });
}

export function useUpdateExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateExpenseInput }) =>
      (await http.patch<Envelope<ExpenseView>>(`${BASE}/${id}`, input)).data.data,
    onSuccess: invalidate,
  });
}

export function useDeleteExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      await http.delete(`${BASE}/${id}`);
    },
    onSuccess: invalidate,
  });
}

export type ExpenseAction =
  | { id: string; action: 'submit' }
  | { id: string; action: 'approve'; overrideMatch?: boolean; overrideReason?: string }
  | { id: string; action: 'reject'; reason: string }
  | { id: string; action: 'pay'; input: PayExpenseInput }
  | { id: string; action: 'void'; reason: string };

export function useExpenseAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: ExpenseAction) => {
      const body =
        a.action === 'reject' || a.action === 'void'
          ? { reason: a.reason }
          : a.action === 'pay'
            ? a.input
            : a.action === 'approve' && a.overrideMatch
              ? { overrideMatch: true, overrideReason: a.overrideReason }
              : undefined;
      return (
        await http.post<Envelope<ExpenseView>>(`${BASE}/${a.id}/${a.action}`, body, {
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        })
      ).data.data;
    },
    onSuccess: invalidate,
  });
}

export function useBulkExpenseAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: BulkExpenseActionInput) =>
      (
        await http.post<Envelope<BulkExpenseActionResult>>(`${BASE}/bulk`, input, {
          headers: { 'Idempotency-Key': crypto.randomUUID() },
        })
      ).data.data,
    onSuccess: invalidate,
  });
}

export function useUploadExpenseAttachment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UploadExpenseAttachmentInput }) =>
      (await http.post<Envelope<ExpenseAttachmentView>>(`${BASE}/${id}/attachments`, input)).data.data,
    onSuccess: invalidate,
  });
}

export function useDeleteExpenseAttachment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, attachmentId }: { id: string; attachmentId: string }) => {
      await http.delete(`${BASE}/${id}/attachments/${attachmentId}`);
    },
    onSuccess: invalidate,
  });
}

export function useSaveCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { id?: string; create?: CreateExpenseCategoryInput; update?: UpdateExpenseCategoryInput }) =>
      v.id
        ? (await http.patch<Envelope<ExpenseCategoryView>>(`${BASE}/categories/${v.id}`, v.update)).data.data
        : (await http.post<Envelope<ExpenseCategoryView>>(`${BASE}/categories`, v.create)).data.data,
    onSuccess: invalidate,
  });
}

export function useRecurringExpenses(branchId?: string) {
  return useQuery({
    queryKey: [...EXPENSES_KEY, 'recurring', branchId ?? 'all'],
    queryFn: async () =>
      (
        await http.get<Envelope<RecurringExpenseView[]>>(`${BASE}/recurring`, {
          params: branchId ? { branchId } : undefined,
        })
      ).data.data,
  });
}

export function useSaveRecurring() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { id?: string; create?: CreateRecurringExpenseInput; update?: UpdateRecurringExpenseInput }) =>
      v.id
        ? (await http.patch<Envelope<RecurringExpenseView>>(`${BASE}/recurring/${v.id}`, v.update)).data.data
        : (await http.post<Envelope<RecurringExpenseView>>(`${BASE}/recurring`, v.create)).data.data,
    onSuccess: invalidate,
  });
}

/** Status counts for the same filters as the list (minus status) — the command bar's tab counts. */
export function useExpenseStatusCounts(filters: Omit<ExpenseFilters, 'status' | 'page' | 'pageSize' | 'sort'>) {
  return useQuery({
    queryKey: [...EXPENSES_KEY, 'status-counts', filters],
    queryFn: async () => (await http.get<Envelope<ExpenseStatusCounts>>(`${BASE}/status-counts`, { params: filters })).data.data,
    placeholderData: (prev) => prev,
  });
}

export function useExpenseHistory(id: string | null) {
  return useQuery({
    queryKey: [...EXPENSES_KEY, 'history', id],
    enabled: Boolean(id),
    queryFn: async () => (await http.get<Envelope<ExpenseHistoryEntry[]>>(`${BASE}/${id}/history`)).data.data,
  });
}

export function useExpenseSettings() {
  return useQuery({
    queryKey: [...EXPENSES_KEY, 'settings'],
    staleTime: 5 * 60_000,
    queryFn: async () => (await http.get<Envelope<ExpenseSettingsView>>(`${BASE}/settings`)).data.data,
  });
}

export function useUpdateExpenseSettings() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: UpdateExpenseSettingsInput) =>
      (await http.put<Envelope<ExpenseSettingsView>>(`${BASE}/settings`, input)).data.data,
    onSuccess: invalidate,
  });
}

export function useExpenseBudgets(branchId: string | undefined, month: string) {
  return useQuery({
    queryKey: [...EXPENSES_KEY, 'budgets', branchId, month],
    enabled: Boolean(branchId),
    queryFn: async () =>
      (await http.get<Envelope<ExpenseBudgetView>>(`${BASE}/budgets`, { params: { branchId, month } })).data.data,
  });
}

export function useSaveExpenseBudgets() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: UpsertExpenseBudgetsInput) =>
      (await http.put<Envelope<ExpenseBudgetView>>(`${BASE}/budgets`, input)).data.data,
    onSuccess: invalidate,
  });
}

// ── E9 petty cash ────────────────────────────────────────────────────
export function useCashFunds(branchId?: string, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...EXPENSES_KEY, 'cash-funds', branchId ?? 'all'],
    enabled: opts.enabled ?? true,
    queryFn: async () =>
      (await http.get<Envelope<CashFundView[]>>(`${BASE}/cash-funds`, { params: branchId ? { branchId } : undefined })).data.data,
  });
}

export function useCashFundEntries(id: string | null) {
  return useQuery({
    queryKey: [...EXPENSES_KEY, 'cash-funds', 'entries', id],
    enabled: Boolean(id),
    queryFn: async () => (await http.get<Envelope<CashFundEntryView[]>>(`${BASE}/cash-funds/${id}/entries`)).data.data,
  });
}

export function useSaveCashFund() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (v: { id?: string; create?: CreateCashFundInput; update?: UpdateCashFundInput }) =>
      v.id
        ? (await http.patch<Envelope<CashFundView>>(`${BASE}/cash-funds/${v.id}`, v.update)).data.data
        : (await http.post<Envelope<CashFundView>>(`${BASE}/cash-funds`, v.create)).data.data,
    onSuccess: invalidate,
  });
}

export function useCashFundAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (a: { id: string; kind: 'move'; input: CashFundMovementInput } | { id: string; kind: 'count'; input: CashFundCountInput }) =>
      a.kind === 'move'
        ? (
            await http.post<Envelope<CashFundView>>(`${BASE}/cash-funds/${a.id}/movements`, a.input, {
              headers: { 'Idempotency-Key': crypto.randomUUID() },
            })
          ).data.data
        : (await http.post<Envelope<CashFundView>>(`${BASE}/cash-funds/${a.id}/count`, a.input)).data.data,
    onSuccess: invalidate,
  });
}

// ── E7 receipt OCR ───────────────────────────────────────────────────
export function useReceiptScan() {
  return useMutation({
    mutationFn: async (input: ReceiptScanInput) =>
      (await http.post<Envelope<ReceiptScanView>>(`${BASE}/receipt-scan`, input, { timeout: 60_000 })).data.data,
  });
}
