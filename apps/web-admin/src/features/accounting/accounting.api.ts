import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChartOfAccounts,
  CreateGratuityInput,
  FinancePolicy,
  FxRateView,
  FxRefreshResult,
  GratuityListQuery,
  GratuityListView,
  GratuityPayoutInput,
  GratuityView,
  JournalView,
  LiabilitiesView,
  UpdateChartOfAccountsInput,
  UpdateFinancePolicyInput,
  UpsertFxRateInput,
} from '@abcp/shared-types';

import { http } from '@/services/http';

/** Wave 11 — /finance-ledger: policy, chart of accounts, liabilities, journal, tips, FX. */
interface Envelope<T> {
  data: T;
}

const KEY = ['finance-ledger'] as const;

export const accountingApi = {
  policy: async () => (await http.get<Envelope<FinancePolicy>>('/finance-ledger/policy')).data.data,
  savePolicy: async (b: UpdateFinancePolicyInput) => (await http.put<Envelope<FinancePolicy>>('/finance-ledger/policy', b)).data.data,
  accounts: async () => (await http.get<Envelope<ChartOfAccounts>>('/finance-ledger/accounts')).data.data,
  saveAccounts: async (b: UpdateChartOfAccountsInput) =>
    (await http.put<Envelope<ChartOfAccounts>>('/finance-ledger/accounts', b)).data.data,
  liabilities: async (p: { branchId: string; from?: string; to?: string }) =>
    (await http.get<Envelope<LiabilitiesView>>('/finance-ledger/liabilities', { params: p })).data.data,
  journal: async (p: { branchId: string; from: string; to: string }) =>
    (await http.get<Envelope<JournalView>>('/finance-ledger/journal', { params: p })).data.data,
  journalCsv: async (p: { branchId: string; from: string; to: string }) =>
    (await http.get<Blob>('/finance-ledger/journal', { params: { ...p, format: 'csv' }, responseType: 'blob' })).data,
  gratuities: async (p: Partial<GratuityListQuery>) =>
    (await http.get<Envelope<GratuityListView>>('/finance-ledger/gratuities', { params: p })).data.data,
  addGratuity: async (paymentId: string, b: CreateGratuityInput) =>
    (await http.post<Envelope<GratuityView>>(`/finance-ledger/payments/${paymentId}/gratuities`, b)).data.data,
  payout: async (b: GratuityPayoutInput) =>
    (await http.post<Envelope<{ paidShares: number; amount: number }>>('/finance-ledger/gratuities/payout', b)).data.data,
  fx: async () => (await http.get<Envelope<FxRateView[]>>('/finance-ledger/fx')).data.data,
  saveFx: async (b: UpsertFxRateInput) => (await http.put<Envelope<FxRateView>>('/finance-ledger/fx', b)).data.data,
  refreshFx: async () => (await http.post<Envelope<FxRefreshResult>>('/finance-ledger/fx/refresh')).data.data,
  runMaintenance: async () =>
    (await http.post<Envelope<{ points: { points: number; accounts: number }; breakage: { cards: number; amount: number } }>>(
      '/finance-ledger/maintenance/run',
    )).data.data,
};

export const usePolicy = () => useQuery({ queryKey: [...KEY, 'policy'], queryFn: accountingApi.policy });
export const useAccounts = () => useQuery({ queryKey: [...KEY, 'accounts'], queryFn: accountingApi.accounts });
export const useLiabilities = (p: { branchId: string; from?: string; to?: string }) =>
  useQuery({ queryKey: [...KEY, 'liabilities', p], queryFn: () => accountingApi.liabilities(p) });
export const useJournal = (p: { branchId: string; from: string; to: string }, enabled = true) =>
  useQuery({ queryKey: [...KEY, 'journal', p], queryFn: () => accountingApi.journal(p), enabled });
export const useGratuities = (p: Partial<GratuityListQuery>) =>
  useQuery({ queryKey: [...KEY, 'gratuities', p], queryFn: () => accountingApi.gratuities(p) });
export const useFxRates = () => useQuery({ queryKey: [...KEY, 'fx'], queryFn: accountingApi.fx });

/** Every write invalidates the whole ledger cache — figures are cross-linked (tips ↔ liabilities ↔ journal). */
function useLedgerMutation<TVars, TOut>(fn: (v: TVars) => Promise<TOut>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

export const useSavePolicy = () => useLedgerMutation(accountingApi.savePolicy);
export const useSaveAccounts = () => useLedgerMutation(accountingApi.saveAccounts);
export const usePayoutTips = () => useLedgerMutation(accountingApi.payout);
export const useSaveFx = () => useLedgerMutation(accountingApi.saveFx);
export const useRefreshFx = () => useLedgerMutation(() => accountingApi.refreshFx());
export const useRunMaintenance = () => useLedgerMutation(() => accountingApi.runMaintenance());
export const useAddGratuity = () =>
  useLedgerMutation((v: { paymentId: string; body: CreateGratuityInput }) => accountingApi.addGratuity(v.paymentId, v.body));
